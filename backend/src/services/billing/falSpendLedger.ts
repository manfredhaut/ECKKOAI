/**
 * LIVRO-CAIXA INTERNO DE GASTO ESTIMADO EM fal.ai, POR TENANT/MÊS —
 * PRIORIDADE 3, 28/08/2026.
 *
 * ┌─ O que isto NÃO é ────────────────────────────────────────────────────────┐
 * │ NÃO é reconciliação com o fornecedor. A fal não expõe endpoint de saldo   │
 * │ (ver o cabeçalho de `PRECOS_FAL`, `providerCost.ts`), então não existe    │
 * │ número COBRADO para comparar contra o que este arquivo soma. A ÚNICA      │
 * │ forma de conferir o gasto real continua sendo o painel web da fal.ai, à   │
 * │ mão — este livro-caixa é ESTIMATIVA INTERNA, sempre, e o nome de cada     │
 * │ função e mensagem de log dizem isso explicitamente para nunca ser lido    │
 * │ como se fosse fatura.                                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ De onde vem o número ────────────────────────────────────────────────────┐
 * │ `fal_pipeline_runs.gasto_previsto_usd` (migration 062) JÁ acumula, por    │
 * │ CORRIDA, o que `autorizarGasto` liberou antes de cada submissão paga —    │
 * │ inclusive corridas que PARAM em "compor" sem completar (o `/recompose` e  │
 * │ a criação original com aprovação pendente gravam e fecham a corrida como  │
 * │ "completed" mesmo parando ali, com o gasto da etapa que rodou). Este      │
 * │ arquivo não inventa medição nova: só SOMA o que já existe, por tenant e   │
 * │ por período — o que faltava era o agregado, não o dado.                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O PERÍODO é o MÊS CALENDÁRIO corrente (`date_trunc('month', now())`) — a
 * granularidade mais simples que ainda responde "isto está subindo rápido
 * demais?" sem exigir configuração de janela. Trocar para outra janela é
 * mudar uma função, não um schema.
 */
import { pool } from "../../db/pool.js";
import { logEvent } from "../log/safeLog.js";

export const FAL_SPEND_ALERT_USD_ENV = "FAL_SPEND_ALERT_USD";

/**
 * Default quando a variável não está no ambiente.
 *
 * **US$ 20,00** — arbitrário, e dito como tal: ao contrário de
 * `DEFAULT_DAILY_PAID_GENERATION_LIMIT` (derivado de um saldo medido), este
 * número não tem medição nenhuma atrás dele. É um ponto de partida
 * razoável para "alguém devia olhar isto" num mês, não um teto calculado.
 * O operador é quem sabe o volume esperado e deve ajustar via
 * `FAL_SPEND_ALERT_USD`.
 */
export const DEFAULT_FAL_SPEND_ALERT_USD = 20.0;

/**
 * O limiar de ALERTA em vigor — nunca um freio. Valor inválido ou ausente
 * cai no default, e o default nunca é "sem alerta": mesma regra de
 * `dailyPaidGenerationLimit()`, um alerta que some quando alguém digita
 * errado a variável é pior que não ter alerta.
 */
export function falSpendAlertThresholdUsd(): number {
  const bruto = process.env[FAL_SPEND_ALERT_USD_ENV];
  if (bruto === undefined || bruto.trim() === "") return DEFAULT_FAL_SPEND_ALERT_USD;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) {
    logEvent("error", "fal_spend_alert_threshold_invalid", {
      context: "billing.falSpendLedger",
      recebido: bruto,
      consequence: `valor ignorado; vale o default de US$ ${DEFAULT_FAL_SPEND_ALERT_USD.toFixed(2)}`,
    });
    return DEFAULT_FAL_SPEND_ALERT_USD;
  }
  return n;
}

/**
 * Soma de `gasto_previsto_usd` do TENANT, no MÊS CALENDÁRIO corrente —
 * ESTIMATIVA INTERNA, nunca fatura. Inclui corridas de qualquer `status`
 * (completed/failed/running): uma corrida que parou em "compor" já
 * autorizou e gastou aquela etapa, e excluí-la subestimaria o livro-caixa
 * exatamente no caso — aprovação pendente — que mais precisa aparecer aqui.
 */
export async function gastoFalDoTenantNoMesUsd(tenantId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(gasto_previsto_usd), 0) AS total
       FROM fal_pipeline_runs
      WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`,
    [tenantId],
  );
  return Number(rows[0]?.total ?? 0);
}

export interface FalSpendLedgerState {
  /** ESTIMATIVA interna — ver o cabeçalho do arquivo. Nunca o cobrado real. */
  usedUsd: number;
  alertThresholdUsd: number;
  exceeded: boolean;
}

/** O estado do livro-caixa deste tenant, no mês corrente. */
export async function readFalSpendLedger(tenantId: string): Promise<FalSpendLedgerState> {
  const alertThresholdUsd = falSpendAlertThresholdUsd();
  const usedUsd = await gastoFalDoTenantNoMesUsd(tenantId);
  return { usedUsd, alertThresholdUsd, exceeded: usedUsd >= alertThresholdUsd };
}

/**
 * Emite o ALERTA SIMPLES quando o livro-caixa do tenant passa do limiar —
 * chamado a cada corrida nova (`abrirCorrida`, falPipelineJournal.ts), pelo
 * mesmo motivo do log de `fal_gasto_acumulado_do_video` que já mora lá:
 * é o único ponto por onde as cinco rotas de produto passam.
 *
 * NÃO deduplica: cada corrida aberta enquanto o tenant estiver acima do
 * limiar emite um evento. É a leitura mais simples possível do pedido —
 * "alerta simples" — e um cooldown/deduplicação fica para quando alguém
 * precisar dele de verdade, não antes.
 */
export async function alertarSeGastoFalAcimaDoLimite(tenantId: string): Promise<void> {
  const estado = await readFalSpendLedger(tenantId);
  if (!estado.exceeded) return;
  logEvent("warn", "fal_gasto_estimado_acima_do_limite", {
    context: "billing.falSpendLedger",
    tenantId,
    usedUsd: Number(estado.usedUsd.toFixed(4)),
    alertThresholdUsd: estado.alertThresholdUsd,
    periodo: "mês calendário corrente",
    aviso:
      "ESTIMATIVA INTERNA (soma de fal_pipeline_runs.gasto_previsto_usd), NÃO confirmação contra fatura " +
      "real — a fal não expõe saldo. Conferir no painel web da fal.ai, à mão.",
  });
}
