/**
 * Studio Movie Edit — upload/exclusão de arquivo (Parte 2-bis) e salvar/
 * recarregar projeto (migration 080). BLOCO STUDIO-EDIT-1.
 *
 * As rotas de arquivo são SEPARADAS de `/documents` de propósito (ver o
 * cabeçalho de `services/video/editAssets.ts`). A ORDEM ao trocar arquivo é
 * OBRIGATÓRIA: sobe o novo com sucesso primeiro, só então `DELETE` no antigo
 * — a tela (`StudioMovieEditStep.tsx`) é quem garante essa ordem, chamando
 * as duas rotas em sequência.
 */
import type { FastifyInstance } from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink, copyFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { contentTypeForExtension } from "../services/downloadProxy.js";
import { formatBytes } from "../services/uploadLimits.js";
import {
  EDIT_ASSET_KINDS,
  type EditAssetKind,
  ASSET_ID_RE,
  KIND_ACCEPT,
  editAssetMaxBytes,
  encontrarArquivoDoAsset,
  novoAlvoDeEditAsset,
  removerEditAsset,
  validarKindMime,
} from "../services/video/editAssets.js";
import { duracaoFinal, type Trecho, type ProjectPayload } from "../services/video/editProject.js";
import {
  assertExportSuportada,
  hashPayload,
  ExportNaoSuportadaError,
} from "../services/video/editExport.js";
import { enfileirarExport } from "../services/video/exportRunner.js";
import path from "node:path";

// ABAS-16, 30/09/2026 — "Inserir da Galeria": o modo já entrega o TIPO real
// do arquivo (vídeo, imagem ou áudio); a única exceção é "propaganda", que
// pode ser qualquer um dos dois — por isso a categoria é sempre conferida
// pela EXTENSÃO real do arquivo em disco, nunca só confiada pelo `kind` que
// o cliente pediu. Mesma disciplina de nunca confiar em dado do cliente sem
// verificar contra o arquivo de verdade, já usada em validarKindMime.
const EXT_CATEGORIA: Record<string, string> = {
  ".mp4": "video", ".webm": "video", ".mov": "video", ".avi": "video", ".m4v": "video",
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image",
  ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".ogg": "audio",
};

function duracaoDoPayload(payload: unknown): number {
  const trechos = (payload as { trechos?: Trecho[] } | null)?.trechos;
  return Array.isArray(trechos) ? duracaoFinal(trechos) : 0;
}

export async function editProjectRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------- assets ---

  app.post("/tenant/edit-assets", async (req, reply) => {
    const data = await req.file({ limits: { fileSize: editAssetMaxBytes() } });
    if (!data) {
      return reply.code(400).send({ error: "no_file", message: "Nenhum arquivo foi enviado." });
    }

    const kindRaw = (data.fields?.kind as { value?: unknown } | undefined)?.value;
    const kind = (EDIT_ASSET_KINDS as readonly string[]).includes(kindRaw as string)
      ? (kindRaw as EditAssetKind)
      : null;
    if (!kind) {
      return reply.code(400).send({
        error: "invalid_kind",
        message: `Campo "kind" precisa ser um de: ${EDIT_ASSET_KINDS.join(", ")}.`,
      });
    }

    const erroTipo = validarKindMime(kind, data.mimetype);
    if (erroTipo) {
      return reply.code(400).send({ error: "invalid_type", message: erroTipo });
    }

    const alvo = await novoAlvoDeEditAsset(req.tenantId, data.mimetype, data.filename);

    try {
      await pipeline(data.file, createWriteStream(alvo.absolutePath));
    } catch (err) {
      await unlink(alvo.absolutePath).catch(() => {});
      throw err;
    }

    // `truncated` só existe DEPOIS de a pipeline terminar de escoar o
    // stream — @fastify/multipart para de emitir dado além do teto, mas não
    // interrompe a conexão; o corpo excedente é descartado, não lido de
    // volta. É a forma real deste teto recusar sem deixar `413` cru: a
    // pessoa recebe o motivo, não só o código.
    if (data.file.truncated) {
      await unlink(alvo.absolutePath).catch(() => {});
      return reply.code(413).send({
        error: "file_too_large",
        message: `O arquivo passa do limite de ${formatBytes(editAssetMaxBytes())}.`,
      });
    }

    return reply.code(201).send({ asset_id: alvo.assetId, url: alvo.url });
  });

  app.get<{ Params: { asset_id: string } }>("/tenant/edit-assets/:asset_id", async (req, reply) => {
    const caminho = await encontrarArquivoDoAsset(req.tenantId, req.params.asset_id);
    if (!caminho) return reply.code(404).send({ error: "not_found" });
    reply.header("Content-Type", contentTypeForExtension(path.extname(caminho)));
    return reply.send(createReadStream(caminho));
  });

  app.delete<{ Params: { asset_id: string } }>("/tenant/edit-assets/:asset_id", async (req, reply) => {
    if (!ASSET_ID_RE.test(req.params.asset_id)) {
      return reply.code(400).send({ error: "invalid_asset_id" });
    }
    const removeu = await removerEditAsset(req.tenantId, req.params.asset_id);
    if (!removeu) return reply.code(404).send({ error: "not_found" });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------ projeto ---

  app.post<{ Body: { source_video_id?: string; payload?: unknown } }>("/tenant/edit-projects", async (req, reply) => {
    const { source_video_id, payload } = req.body ?? {};
    if (!source_video_id) {
      return reply.code(400).send({ error: "missing_source_video_id" });
    }
    const { rows } = await pool.query(
      `INSERT INTO edit_projects (tenant_id, source_video_id, payload, duration_seconds)
       VALUES ($1, $2, $3::jsonb, $4) RETURNING *`,
      [req.tenantId, source_video_id, JSON.stringify(payload ?? {}), duracaoDoPayload(payload)],
    );
    return reply.code(201).send(rows[0]);
  });

  app.put<{ Params: { id: string }; Body: { payload?: unknown } }>(
    "/tenant/edit-projects/:id",
    async (req, reply) => {
      const { payload } = req.body ?? {};
      const { rows } = await pool.query(
        `UPDATE edit_projects SET payload = $3::jsonb, duration_seconds = $4, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [req.params.id, req.tenantId, JSON.stringify(payload ?? {}), duracaoDoPayload(payload)],
      );
      if (!rows[0]) return reply.code(404).send({ error: "not_found" });
      return rows[0];
    },
  );

  app.get<{ Params: { id: string } }>("/tenant/edit-projects/:id", async (req, reply) => {
    const { rows } = await pool.query("SELECT * FROM edit_projects WHERE id = $1 AND tenant_id = $2", [
      req.params.id,
      req.tenantId,
    ]);
    if (!rows[0]) return reply.code(404).send({ error: "not_found" });
    return rows[0];
  });

  // ----------------------------------------------------------- export ---

  // BLOCO STUDIO-EXPORT-1 -- idempotente por params_hash: clicar duas
  // vezes com a MESMA timeline devolve a exportação já existente (202),
  // em vez de enfileirar duas vezes. O status inicial vem do DEFAULT
  // da coluna (migration 090) -- nunca escrito aqui.
  app.post<{ Params: { id: string } }>("/tenant/edit-projects/:id/export", async (req, reply) => {
    const { rows: projectRows } = await pool.query(
      "SELECT * FROM edit_projects WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const project = projectRows[0];
    if (!project) return reply.code(404).send({ error: "not_found" });

    const payload = project.payload as ProjectPayload;
    try {
      assertExportSuportada(payload);
    } catch (err) {
      if (err instanceof ExportNaoSuportadaError) {
        return reply.code(400).send({ error: "not_supported", message: err.message });
      }
      throw err;
    }

    const hash = hashPayload(payload, project.source_video_id);

    const { rows: existentes } = await pool.query(
      "SELECT * FROM edit_project_exports WHERE edit_project_id = $1 AND params_hash = $2",
      [project.id, hash],
    );
    if (existentes[0]) {
      return reply.code(202).send(existentes[0]);
    }

    const { rows: novaRows } = await pool.query(
      "INSERT INTO edit_project_exports (tenant_id, edit_project_id, params_hash) VALUES ($1, $2, $3) RETURNING *",
      [req.tenantId, project.id, hash],
    );
    const novaExportacao = novaRows[0];
    enfileirarExport(novaExportacao.id);
    return reply.code(202).send(novaExportacao);
  });

  /** A exportação mais recente deste projeto, ou `null` — para a tela sondar. */
  app.get<{ Params: { id: string } }>("/tenant/edit-projects/:id/export", async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT e.* FROM edit_project_exports e
       JOIN edit_projects p ON p.id = e.edit_project_id
       WHERE e.edit_project_id = $1 AND p.tenant_id = $2
       ORDER BY e.created_at DESC LIMIT 1`,
      [req.params.id, req.tenantId],
    );
    return rows[0] ?? null;
  });

  /** O projeto mais recente daquele vídeo, ou `null` — para a tela recarregar sozinha. */
  app.get<{ Params: { videoId: string } }>("/tenant/edit-projects/by-video/:videoId", async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT * FROM edit_projects WHERE source_video_id = $1 AND tenant_id = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [req.params.videoId, req.tenantId],
    );
    return rows[0] ?? null;
  });

  // ABAS-16 — "Inserir da Galeria": copia um arquivo JÁ PRONTO da aba 5
  // (creative_jobs) para dentro do mecanismo de asset do Estúdio, sem
  // passar pelo navegador de novo. Reaproveita novoAlvoDeEditAsset com o
  // NOME original (que já tem a extensão certa) — a mesma derivação de
  // extensão que o upload normal já usa, sem duplicar essa lógica aqui.
  app.post<{ Body: { creative_job_id?: string; kind?: string } }>(
    "/tenant/edit-assets/from-creative-job",
    async (req, reply) => {
      const { creative_job_id: creativeJobId, kind } = req.body ?? {};
      if (typeof creativeJobId !== "string" || !creativeJobId) {
        return reply.code(400).send({ error: "invalid_creative_job_id" });
      }
      if (typeof kind !== "string" || !(EDIT_ASSET_KINDS as readonly string[]).includes(kind)) {
        return reply.code(400).send({
          error: "invalid_kind",
          message: `Campo "kind" precisa ser um de: ${EDIT_ASSET_KINDS.join(", ")}.`,
        });
      }
      const kindTipado = kind as EditAssetKind;

      const { rows } = await pool.query<{ arquivo_url: string | null; estado: string }>(
        "SELECT arquivo_url, estado FROM creative_jobs WHERE id = $1 AND tenant_id = $2",
        [creativeJobId, req.tenantId],
      );
      const job = rows[0];
      if (!job || !job.arquivo_url || job.estado !== "pronto") {
        return reply.code(404).send({ error: "not_found" });
      }

      const ext = path.extname(job.arquivo_url).toLowerCase();
      const categoria = EXT_CATEGORIA[ext];
      if (!categoria || !KIND_ACCEPT[kindTipado].includes(categoria)) {
        return reply.code(400).send({
          error: "invalid_type",
          message: `Este material (${ext || "sem extensão"}) não é aceito para ${kindTipado} — esperado ${KIND_ACCEPT[
            kindTipado
          ]
            .map((t) => `${t}/*`)
            .join(" ou ")}.`,
        });
      }

      const alvo = await novoAlvoDeEditAsset(req.tenantId, "", path.basename(job.arquivo_url));
      const origem = path.join(config.uploadsDir, job.arquivo_url.replace("/uploads/", ""));
      await copyFile(origem, alvo.absolutePath);

      return reply.code(201).send({ asset_id: alvo.assetId, url: alvo.url });
    },
  );
}
