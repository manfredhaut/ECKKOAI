/**
 * O diário do pipeline em Postgres — a implementação de produção de
 * `DiarioDoPipeline`.
 *
 * Separado do orquestrador de propósito: `falPipeline.ts` recebe o diário como
 * parâmetro, e é isso que permite exercitá-lo sem banco. A guarda passa um
 * gravador em memória e observa a ORDEM das chamadas; se a persistência fosse
 * importada lá dentro, a única forma de medir ordem seria subir Postgres — e
 * uma guarda que precisa de infraestrutura é uma guarda que se desliga sozinha
 * no primeiro dia difícil.
 *
 * Nenhuma destas escritas engole erro. `provider_usage` engole (o consumo não
 * pode derrubar a geração que já aconteceu), e aqui é o contrário: se o
 * `request_id` não puder ser gravado, seguir seria criar trabalho pago sem
 * ponteiro — exatamente o que este arquivo existe para impedir.
 */
import { pool } from "../../db/pool.js";
import { logEvent } from "../log/safeLog.js";
import type { DiarioDoPipeline, EtapaDoPipeline } from "./falPipeline.js";

export interface AbrirCorridaInput {
  tenantId: string;
  /**
   * A linha de `videos` que esta corrida serve. Opcional só porque
   * `probeFalPipeline.ts` não tem vídeo nenhum para apontar — os dois call
   * sites de produto (`/approve` e `/recompose` em `routes/videos.ts`) sempre
   * têm `video.id` disponível e devem passá-lo.
   */
  videoId?: string;
  script: string;
  targetSeconds: number;
  charsPerSecond: number;
}

/**
 * Quanto este VÍDEO já custou, somando TODAS as suas corridas — migration 062.
 *
 * ┌─ O escopo que o teto de gasto não tem ───────────────────────────────────┐
 * │ `autorizarGasto` (falPipeline.ts) freia por CORRIDA, e toda retomada     │
 * │ começa zerada de propósito: somar o gasto passado ao teto da corrida     │
 * │ recusaria a segunda metade por dinheiro que já saiu. O argumento está    │
 * │ certo e não é isto que muda.                                            │
 * │                                                                          │
 * │ O que ele não cobre é o VÍDEO. Cada "Refazer" abre corrida nova, e não   │
 * │ há limite de cliques: `/redo-video` re-paga `animar` a cada um           │
 * │ (US$ 0,375 no Wan, ~US$ 6,93 no Seedance a 15 s), e cada corrida cabe    │
 * │ sozinha no teto. Esta função é o número que faltava para enxergar isso.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * SÓ RESPONDE — não recusa nada. Instrumentação, por decisão explícita do
 * operador (23/08): medir com dados reais antes de escolher o número de um
 * freio. Quem vier ligar o freio compara este valor contra um teto por vídeo;
 * enquanto isso, ele aparece no log de cada corrida nova (`abrirCorrida`).
 *
 * `numeric` do Postgres chega como STRING no driver — `Number(...)` explícito,
 * porque somar strings aqui concatenaria em silêncio.
 */
export async function gastoAcumuladoDoVideoUsd(videoId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string | null }>(
    "SELECT COALESCE(SUM(gasto_previsto_usd), 0) AS total FROM fal_pipeline_runs WHERE video_id = $1",
    [videoId],
  );
  return Number(rows[0]?.total ?? 0);
}

/** Abre a corrida e devolve o id. As etapas penduram nele. */
export async function abrirCorrida(input: AbrirCorridaInput): Promise<string> {
  // ANTES do INSERT, e por isso o número é o das corridas ANTERIORES: lido
  // depois, ele incluiria esta corrida (em zero, porque nada foi autorizado
  // ainda) e o log passaria a somar uma parcela vazia — mesmo total, leitura
  // pior. AQUI, e não nas quatro rotas que abrem corrida (`/approve`,
  // `/recompose`, `/approve-video`, `/redo-video`), porque este é o único
  // ponto por onde todas passam: instrumentação copiada em quatro call sites
  // é instrumentação que some de um deles na próxima rodada.
  //
  // Vídeo sem id (a sonda `probeFalPipeline.ts`) não tem o que somar — e não
  // é caso de erro, é o caso documentado em `videoId`.
  if (input.videoId) {
    logEvent("info", "fal_gasto_acumulado_do_video", {
      videoId: input.videoId,
      tenantId: input.tenantId,
      gastoAcumuladoAnteriorUsd: Number((await gastoAcumuladoDoVideoUsd(input.videoId)).toFixed(4)),
    });
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO fal_pipeline_runs (tenant_id, video_id, script, target_seconds, script_chars, chars_per_second)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.tenantId, input.videoId ?? null, input.script, input.targetSeconds, input.script.length, input.charsPerSecond],
  );
  return rows[0].id;
}

export async function fecharCorrida(
  runId: string,
  status: "completed" | "failed",
  motivo?: string,
): Promise<void> {
  await pool.query(
    "UPDATE fal_pipeline_runs SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1",
    [runId, status, motivo ?? null],
  );
}

/**
 * O `request_id` que ESTA etapa, NESTA corrida, chegou a receber da fal — ou
 * `null` se ela nunca chegou a receber um.
 *
 * Existe para responder, depois que uma etapa falhou, a pergunta que decide o
 * estorno: "o fornecedor chegou a aceitar este trabalho?" `gravarRequestId`
 * (acima) só é chamado pelo `onRequestId` de `falSubmit` DEPOIS que a fal
 * aceita a submissão — uma recusa (422 de schema, por exemplo) nunca chega lá,
 * e a linha desta etapa fica com `request_id NULL`. Ler essa coluna depois do
 * catch é como `classificarGasto` (videoFailure.ts) sabe se o gasto desta
 * etapa específica é `nao_saiu` ou `indeterminado`.
 *
 * Por `run_id` + `etapa`, não pelo `provider_job_id` gravado em `videos`: essa
 * coluna pode segurar o `request_id` de uma etapa ANTERIOR e já cobrada (a
 * composição, no caso de `animar`) — usá-la aqui classificaria uma recusa da
 * etapa nova como gasto que já saiu, por causa de um gasto de outra etapa.
 */
export async function requestIdDaEtapa(runId: string, etapa: EtapaDoPipeline): Promise<string | null> {
  const { rows } = await pool.query<{ request_id: string | null }>(
    `SELECT request_id FROM fal_pipeline_steps
      WHERE run_id = $1 AND etapa = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [runId, etapa],
  );
  return rows[0]?.request_id ?? null;
}

export function criarDiarioNoBanco(runId: string): DiarioDoPipeline {
  return {
    async abrirEtapa(
      etapa: EtapaDoPipeline,
      ordem: number,
      vendor: string,
      endpointId: string | null,
    ): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO fal_pipeline_steps (run_id, etapa, ordem, vendor, endpoint_id, request_at)
         VALUES ($1, $2, $3, $4, $5, now())
         RETURNING id`,
        [runId, etapa, ordem, vendor, endpointId],
      );
      return rows[0].id;
    },

    async gravarRequestId(stepId: string, requestId: string): Promise<void> {
      await pool.query(
        "UPDATE fal_pipeline_steps SET request_id = $2, updated_at = now() WHERE id = $1",
        [stepId, requestId],
      );
    },

    async gravarRespostaCrua(stepId: string, raw: string): Promise<void> {
      await pool.query(
        `UPDATE fal_pipeline_steps
         SET raw_response = $2, raw_response_at = now(), updated_at = now()
         WHERE id = $1`,
        [stepId, raw],
      );
    },

    async fecharEtapa(stepId: string, status: "completed" | "failed", motivo?: string): Promise<void> {
      await pool.query(
        "UPDATE fal_pipeline_steps SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1",
        [stepId, status, motivo ?? null],
      );
    },

    async registrarGastoPrevisto(acumuladoUsd: number): Promise<void> {
      await pool.query(
        "UPDATE fal_pipeline_runs SET gasto_previsto_usd = $2, updated_at = now() WHERE id = $1",
        [runId, acumuladoUsd],
      );
    },
  };
}
