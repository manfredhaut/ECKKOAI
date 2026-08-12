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
import type { DiarioDoPipeline, EtapaDoPipeline } from "./falPipeline.js";

export interface AbrirCorridaInput {
  tenantId: string;
  script: string;
  targetSeconds: number;
  charsPerSecond: number;
}

/** Abre a corrida e devolve o id. As etapas penduram nele. */
export async function abrirCorrida(input: AbrirCorridaInput): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO fal_pipeline_runs (tenant_id, script, target_seconds, script_chars, chars_per_second)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.tenantId, input.script, input.targetSeconds, input.script.length, input.charsPerSecond],
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
  };
}
