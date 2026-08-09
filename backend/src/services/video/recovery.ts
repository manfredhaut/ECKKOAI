/**
 * VARREDURA DE BOOT — a rede de segurança mínima do desenho atual.
 *
 * ┌─ O defeito que isto fecha ──────────────────────────────────────────────┐
 * │ O acompanhamento de uma geração vive num `setInterval` na memória do    │
 * │ processo web (`routes/videos.ts`). Morto o processo — `restart          │
 * │ backend`, `up -d`, desligar o PC —, o laço morre com ele e NADA o       │
 * │ re-arma: `index.ts` chamava migrações, `buildApp`, o agendador de       │
 * │ crédito e `listen`, e mais nada. A linha ficava em `queued` ou          │
 * │ `processing` para sempre, com o crédito já debitado e sem estorno.      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ISTO NÃO É UMA FILA, e a distinção importa: não há tabela de trabalho, não
 * há consumidor, não há concorrência entre processos e não há reentrega. É uma
 * varredura ÚNICA, no boot, que faz três coisas com o que encontra preso:
 *
 *   · tem `provider_job_id` e é recente  → re-arma o MESMO acompanhamento;
 *   · não tem `provider_job_id`          → o fornecedor nunca aceitou:
 *                                          encerra como `recovery_orphan` e
 *                                          ESTORNA;
 *   · passou da idade máxima             → encerra como `recovery_stale`, e
 *                                          estorna conforme a mesma regra.
 *
 * O que ela deliberadamente NÃO faz: não chama fornecedor por conta própria,
 * não cria trabalho novo, não repete o que já foi enviado, e não roda de novo
 * enquanto o processo viver.
 */
import { pool } from "../../db/pool.js";
import { logEvent } from "../log/safeLog.js";
import { refundCredit } from "../billing/creditGate.js";
import { recordFailedProviderUsage } from "../billing/usageTracking.js";
import { createNotification } from "../notifications.js";
import { decidirEstorno, type VideoFailureReason } from "./videoFailure.js";

/** Idade acima da qual um registro preso é encerrado em vez de reacompanhado. */
export const VIDEO_RECOVERY_MAX_AGE_ENV = "VIDEO_RECOVERY_MAX_AGE_MS";

/**
 * 6 horas. DEDUZIDO, não medido — não há amostra de registro preso neste
 * projeto (a varredura de 08/08 achou ZERO). O número sai de duas pontas
 * conhecidas: o polling desiste em ~7,5 min (`MAX_POLL_ATTEMPTS × 5 s`), então
 * qualquer coisa acima disso já é anômalo; e a URL assinada que o fornecedor
 * devolve expira, então reacompanhar algo de ontem tende a achar um artefato
 * que não dá mais para baixar. Seis horas cobre uma noite de máquina
 * desligada sem prometer ressuscitar a semana passada.
 */
export const DEFAULT_VIDEO_RECOVERY_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function videoRecoveryMaxAgeMs(): number {
  const bruto = process.env[VIDEO_RECOVERY_MAX_AGE_ENV];
  if (!bruto) return DEFAULT_VIDEO_RECOVERY_MAX_AGE_MS;
  const n = Number(bruto);
  // Valor inválido cai no default em vez de virar NaN: com `NaN` toda
  // comparação de idade é falsa, e a varredura reacompanharia registros de
  // qualquer idade em silêncio — falha na direção errada.
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_VIDEO_RECOVERY_MAX_AGE_MS;
  return Math.floor(n);
}

export interface VideoEmVoo {
  id: string;
  tenant_id: string;
  status: string;
  provider_job_id: string | null;
  provider_vendor: string | null;
  publish_platform: string | null;
  aspect_ratio: string | null;
  resolution: string | null;
  provider_engine: string | null;
  duration_seconds: number;
  simulated: boolean;
  idade_ms: number;
}

/**
 * Quem re-arma o acompanhamento. Injetado em vez de importado para que a
 * varredura possa ser exercitada com um duplo — a guarda precisa contar quem
 * foi reacompanhado sem subir a aplicação nem tocar a rede.
 */
export type Reacompanhar = (linha: VideoEmVoo) => void | Promise<void>;

export interface RecoveryResult {
  encontrados: number;
  reacompanhados: number;
  encerradosOrfaos: number;
  encerradosVelhos: number;
  estornados: number;
  falhas: number;
}

const MENSAGEM_ORFAO =
  "Esta geração foi interrompida antes de o serviço de vídeo aceitar o trabalho. " +
  "Nada foi cobrado e o crédito foi devolvido — pode gerar de novo.";

const MENSAGEM_VELHO =
  "Esta geração ficou parada tempo demais e foi encerrada. O trabalho pode ter sido " +
  "concluído no serviço de vídeo; o identificador do job está guardado para conferência.";

/**
 * Encerra um registro preso, gravando o MOTIVO junto do estado.
 *
 * `AND status = ANY(...)` no `UPDATE`: se o polling de outro caminho tiver
 * resolvido a linha entre o `SELECT` e este `UPDATE`, não se sobrescreve um
 * estado terminal — é a mesma proteção que o caminho de timeout já usava com
 * `AND status != 'ready'`.
 */
async function encerrar(
  linha: VideoEmVoo,
  reason: VideoFailureReason,
  mensagem: string,
): Promise<{ encerrado: boolean; estornado: boolean }> {
  const { rowCount } = await pool.query(
    `UPDATE videos SET status = 'error', error_message = $2, failure_reason = $3
      WHERE id = $1 AND status = ANY($4)`,
    [linha.id, mensagem, reason, ["queued", "processing"]],
  );
  if (!rowCount) return { encerrado: false, estornado: false };

  const decisao = decidirEstorno(reason, linha.provider_job_id != null);
  logEvent(decisao.estorna ? "info" : "error", "video_recovery_encerrado", {
    context: "video.recovery",
    videoId: linha.id,
    reason,
    gasto: decisao.gasto,
    nota: decisao.nota,
    providerJobId: linha.provider_job_id ? linha.provider_job_id.slice(0, 8) + "…" : null,
  });

  await recordFailedProviderUsage({
    tenantId: linha.tenant_id,
    videoId: linha.id,
    provider: "avatar",
    vendor: linha.provider_vendor ?? "heygen",
    unitType: "seconds",
    requestedUnitCount: linha.duration_seconds,
    failureReason: mensagem,
    aspectRatio: linha.aspect_ratio,
    resolution: linha.resolution,
    providerJobId: linha.provider_job_id,
  });

  let estornado = false;
  if (decisao.estorna) {
    // O índice único parcial `credit_ledger_one_refund_per_video` é a garantia
    // final de estorno único: mesmo que a varredura rode duas vezes (dois
    // boots seguidos), a segunda devolve `already_refunded` e não cria linha.
    const r = await refundCredit({
      tenantId: linha.tenant_id,
      creditType: "video",
      relatedVideoId: linha.id,
    });
    estornado = r.refunded;
  }

  await createNotification(linha.tenant_id, "video_error", mensagem);
  return { encerrado: true, estornado };
}

/**
 * A varredura. Roda UMA vez, no boot, antes de a aplicação aceitar conexão.
 *
 * Nunca lança: um erro aqui não pode impedir o servidor de subir — um processo
 * que não sobe não acompanha nada, que é o oposto do que este arquivo existe
 * para garantir.
 */
export async function recoverInFlightVideos(reacompanhar: Reacompanhar): Promise<RecoveryResult> {
  const resultado: RecoveryResult = {
    encontrados: 0,
    reacompanhados: 0,
    encerradosOrfaos: 0,
    encerradosVelhos: 0,
    estornados: 0,
    falhas: 0,
  };
  const idadeMax = videoRecoveryMaxAgeMs();

  let linhas: VideoEmVoo[];
  try {
    const { rows } = await pool.query<VideoEmVoo>(
      `SELECT id, tenant_id, status, provider_job_id, provider_vendor, publish_platform,
              aspect_ratio, resolution, provider_engine, duration_seconds, simulated,
              (EXTRACT(EPOCH FROM (now() - created_at)) * 1000)::bigint AS idade_ms
         FROM videos
        WHERE status = ANY($1)
        ORDER BY created_at ASC`,
      [["queued", "processing"]],
    );
    linhas = rows.map((r) => ({ ...r, idade_ms: Number(r.idade_ms) }));
  } catch (err) {
    logEvent("error", "video_recovery_falhou", {
      context: "video.recovery",
      detail: err instanceof Error ? err.message : String(err),
      consequence: "nenhum registro preso foi recolhido neste boot",
    });
    resultado.falhas += 1;
    return resultado;
  }

  resultado.encontrados = linhas.length;
  if (linhas.length === 0) {
    logEvent("info", "video_recovery_vazio", { context: "video.recovery", maxAgeMs: idadeMax });
    return resultado;
  }

  for (const linha of linhas) {
    try {
      // A ORDEM das duas condições não é arbitrária: órfão vem primeiro porque
      // um registro sem job id é irrecuperável em qualquer idade — trocar a
      // ordem faria um órfão recente ser "reacompanhado", e reacompanhar o que
      // não tem job id é pedir status de um trabalho que não existe.
      if (!linha.provider_job_id) {
        const r = await encerrar(linha, "recovery_orphan", MENSAGEM_ORFAO);
        if (r.encerrado) resultado.encerradosOrfaos += 1;
        if (r.estornado) resultado.estornados += 1;
        continue;
      }
      if (linha.idade_ms > idadeMax) {
        const r = await encerrar(linha, "recovery_stale", MENSAGEM_VELHO);
        if (r.encerrado) resultado.encerradosVelhos += 1;
        if (r.estornado) resultado.estornados += 1;
        continue;
      }
      await reacompanhar(linha);
      resultado.reacompanhados += 1;
    } catch (err) {
      resultado.falhas += 1;
      logEvent("error", "video_recovery_linha_falhou", {
        context: "video.recovery",
        videoId: linha.id,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logEvent("info", "video_recovery_concluida", { context: "video.recovery", maxAgeMs: idadeMax, ...resultado });
  return resultado;
}
