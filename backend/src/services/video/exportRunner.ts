/**
 * Studio Movie Edit -- execução assíncrona da exportação, em processo,
 * concorrência 1 (migration 090). BLOCO STUDIO-EXPORT-1/2/3.
 *
 * Mesma rede de segurança mínima que recoverInFlightVideos (recovery.ts):
 * nenhuma fila externa, nenhum worker separado -- só uma fila em memória
 * deste processo (concorrência 1, uma exportação de cada vez) e uma
 * reconciliação no boot para linhas presas em "running" quando o processo
 * caiu no meio.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pool } from "../../db/pool.js";
import { config } from "../../config.js";
import { logEvent } from "../log/safeLog.js";
import {
  montarArgsFfmpeg,
  executarExportacao,
  temStreamDeAudio,
  obterResolucao,
  type BrollResolvido,
  type SobreposicaoResolvida,
  type FundoResolvido,
} from "./editExport.js";
import { encontrarArquivoDoAsset } from "./editAssets.js";
import type { ProjectPayload, Trecho } from "./editProject.js";

const fila: string[] = [];
let processando = false;

export function enfileirarExport(exportId: string): void {
  fila.push(exportId);
  tentarProcessar();
}

function tentarProcessar(): void {
  if (processando) return;
  const id = fila.shift();
  if (!id) return;
  processando = true;
  rodarExportacao(id)
    .catch((err) => logEvent("error", "export_runner_failed", { exportId: id, detail: err }))
    .finally(() => {
      processando = false;
      tentarProcessar();
    });
}

async function rodarExportacao(exportId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT e.id, e.tenant_id, p.payload, p.source_video_id
     FROM edit_project_exports e JOIN edit_projects p ON p.id = e.edit_project_id
     WHERE e.id = $1`,
    [exportId],
  );
  const row = rows[0];
  if (!row) return;

  await pool.query(
    "UPDATE edit_project_exports SET status = 'running', started_at = now() WHERE id = $1",
    [exportId],
  );

  try {
    const payload = row.payload as ProjectPayload;
    // ProjectPayload.trechos vem sem `url` (nunca gravado no payload, ver
    // payloadDoProjeto em editProject.ts); montarArgsFfmpeg só usa
    // assetId para b-roll, então `url: null` sintético é seguro aqui.
    const trechosParaExport: Trecho[] = payload.trechos.map((t) =>
      t.tipo === "base" ? t : { ...t, url: null },
    );

    const brollsResolvidos = new Map<string, BrollResolvido>();
    for (const t of payload.trechos) {
      if (t.tipo === "broll" && t.assetId) {
        const absolutePath = await encontrarArquivoDoAsset(row.tenant_id, t.assetId);
        if (!absolutePath) throw new Error(`B-roll "${t.nome}" não encontrado em disco.`);
        const temAudio = await temStreamDeAudio(absolutePath);
        brollsResolvidos.set(t.assetId, { absolutePath, temAudio });
      }
    }

    const sobreposicoesResolvidas = new Map<string, SobreposicaoResolvida>();
    for (const ins of payload.insercoes) {
      if (ins.assetId) {
        const absolutePath = await encontrarArquivoDoAsset(row.tenant_id, ins.assetId);
        if (!absolutePath) throw new Error(`Sobreposição "${ins.nome}" não encontrada em disco.`);
        sobreposicoesResolvidas.set(ins.assetId, { absolutePath, tipo: ins.tipo });
      }
    }

    let fundoResolvido: FundoResolvido | null = null;
    if (payload.fundo?.assetId) {
      const absolutePath = await encontrarArquivoDoAsset(row.tenant_id, payload.fundo.assetId);
      if (!absolutePath) throw new Error("Fundo musical não encontrado em disco.");
      fundoResolvido = { absolutePath, volume: payload.fundo.volume };
    }

    const { rows: videoRows } = await pool.query("SELECT output_url FROM videos WHERE id = $1", [
      row.source_video_id,
    ]);
    const outputUrl: string | null = videoRows[0]?.output_url ?? null;
    if (!outputUrl) throw new Error("Vídeo base não tem output_url.");
    const baseAbsolutePath = path.join(config.uploadsDir, outputUrl.replace("/uploads/", ""));

    const dir = path.join(config.uploadsDir, row.tenant_id, "exports");
    await mkdir(dir, { recursive: true });
    const outputPath = path.join(dir, `${exportId}.mp4`);

    const resolucaoBase = await obterResolucao(baseAbsolutePath);
    const args = montarArgsFfmpeg(
      baseAbsolutePath,
      trechosParaExport,
      brollsResolvidos,
      payload.insercoes,
      sobreposicoesResolvidas,
      fundoResolvido,
      payload.volVoz,
      outputPath,
      resolucaoBase,
    );
    await executarExportacao(args);

    const arquivoUrl = `/uploads/${row.tenant_id}/exports/${exportId}.mp4`;
    await pool.query(
      "UPDATE edit_project_exports SET status = 'completed', arquivo_url = $2, finished_at = now() WHERE id = $1",
      [exportId, arquivoUrl],
    );
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    await pool.query(
      "UPDATE edit_project_exports SET status = 'failed', erro = $2, finished_at = now() WHERE id = $1",
      [exportId, mensagem],
    );
  }
}

/**
 * Reconciliação no boot -- mesma rede de segurança mínima de
 * recoverInFlightVideos: uma exportação presa em "running" quando o
 * processo caiu no meio nunca seria retomada sozinha (a fila em memória
 * morreu com o processo); vira "failed" com motivo explícito, para o
 * operador ver e clicar "Exportar" de novo -- NUNCA reprocessada
 * automaticamente (reprocessar sozinho poderia duplicar trabalho se a
 * falha tiver sido no fim da escrita do arquivo).
 */
export async function reconciliarExportsPresas(): Promise<{ encontradas: number }> {
  const { rows } = await pool.query(
    `UPDATE edit_project_exports SET status = 'failed', erro = 'processo reiniciado', finished_at = now()
     WHERE status = 'running' RETURNING id`,
  );
  if (rows.length > 0) {
    logEvent("info", "export_boot_reconciliation", { encontradas: rows.length });
  }
  return { encontradas: rows.length };
}
