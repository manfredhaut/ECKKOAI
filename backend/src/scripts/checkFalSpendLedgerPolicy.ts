/**
 * LIVRO-CAIXA INTERNO DE GASTO ESTIMADO EM fal.ai — PRIORIDADE 3, 28/08/2026.
 * Ver o cabeçalho de `falSpendLedger.ts` para o que este número É e NÃO É
 * (ESTIMATIVA interna, nunca fatura).
 *
 *  G-1  `gastoFalDoTenantNoMesUsd` soma `gasto_previsto_usd` filtrando por
 *       `tenant_id` e pelo mês calendário corrente — por EXECUÇÃO real,
 *       `pool.query` substituído (mesmo padrão de `checkFalApprovalPolicy.ts`
 *       G-F).
 *  G-2  `falSpendAlertThresholdUsd()` — default sem env, valor configurado
 *       quando presente, e default de novo (com log de erro) quando o valor
 *       do ambiente é inválido.
 *  G-3  `alertarSeGastoFalAcimaDoLimite` EMITE o alerta quando o acumulado
 *       passa do limiar, e NÃO emite quando está abaixo — por execução
 *       real, com `console.warn` capturado (mesmo padrão de
 *       `checkVendorErrorPathPolicy.ts`).
 *  G-4  `abrirCorrida` chama `alertarSeGastoFalAcimaDoLimite` — por FORMA:
 *       a função pode estar certa e nunca ser invocada pelo único ponto por
 *       onde as cinco rotas de produto passam.
 *
 * Custo: ZERO. `pool.query`/`console.warn` substituídos, nenhuma rede.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import {
  FAL_SPEND_ALERT_USD_ENV,
  DEFAULT_FAL_SPEND_ALERT_USD,
  falSpendAlertThresholdUsd,
  gastoFalDoTenantNoMesUsd,
  alertarSeGastoFalAcimaDoLimite,
} from "../services/billing/falSpendLedger.js";

const DIARIO_DO_PIPELINE = "backend/src/services/video/falPipelineJournal.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "abrirCorrida chama alertarSeGastoFalAcimaDoLimite",
    name: "abrirCorrida para de checar o livro-caixa do tenant",
    kind: "obvio",
    // ÓBVIO: sem a chamada, `abrirCorrida` continua funcionando normalmente
    // — o defeito é AUSÊNCIA de alerta, nunca observável sem ela.
    file: DIARIO_DO_PIPELINE,
    find: "  await alertarSeGastoFalAcimaDoLimite(input.tenantId);",
    replace: "",
    expect: "livro-caixa: abrirCorrida não chama alertarSeGastoFalAcimaDoLimite",
  },
];

export interface FalSpendLedgerCheckResult {
  failures: string[];
  notes: string[];
}

async function comPoolMockado<T>(totalUsd: number | null, corpo: () => Promise<T>): Promise<{ resultado: T; sql: string }> {
  const original = pool.query.bind(pool);
  let sqlCapturado = "";
  (pool as { query: unknown }).query = (async (texto: unknown) => {
    sqlCapturado = String(texto);
    return { rows: [{ total: totalUsd === null ? null : String(totalUsd) }], rowCount: 1 };
  }) as typeof pool.query;
  try {
    const resultado = await corpo();
    return { resultado, sql: sqlCapturado };
  } finally {
    (pool as { query: unknown }).query = original;
  }
}

export async function checkFalSpendLedgerPolicy(repoRoot: string): Promise<FalSpendLedgerCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1: a soma é por tenant, por mês, sobre a coluna certa ------------
  const { resultado: total, sql } = await comPoolMockado(12.3456, () =>
    gastoFalDoTenantNoMesUsd("tenant-da-prova"),
  );
  if (total !== 12.3456) {
    failures.push(
      `livro-caixa: gastoFalDoTenantNoMesUsd devolveu ${total}, esperado 12.3456 (o valor mockado) — a ` +
        "conversão do retorno do banco para número está errada.",
    );
  }
  if (!sql.includes("gasto_previsto_usd") || !sql.includes("tenant_id") || !sql.includes("date_trunc")) {
    failures.push(
      `livro-caixa: a consulta de gastoFalDoTenantNoMesUsd não referencia gasto_previsto_usd/tenant_id/` +
        `date_trunc — SQL capturado: ${JSON.stringify(sql.replace(/\s+/g, " "))}. Sem os três, a soma pode ` +
        "estar somando a coluna errada, ignorando o tenant, ou ignorando o período.",
    );
  }

  // --- G-2: o limiar configurável, com fallback e log de erro -------------
  const envOriginal = process.env[FAL_SPEND_ALERT_USD_ENV];
  try {
    delete process.env[FAL_SPEND_ALERT_USD_ENV];
    const semEnv = falSpendAlertThresholdUsd();
    if (semEnv !== DEFAULT_FAL_SPEND_ALERT_USD) {
      failures.push(
        `livro-caixa: sem ${FAL_SPEND_ALERT_USD_ENV} no ambiente, o limiar veio ${semEnv}, esperado o ` +
          `default ${DEFAULT_FAL_SPEND_ALERT_USD}.`,
      );
    }

    process.env[FAL_SPEND_ALERT_USD_ENV] = "42.5";
    const comEnv = falSpendAlertThresholdUsd();
    if (comEnv !== 42.5) {
      failures.push(`livro-caixa: com ${FAL_SPEND_ALERT_USD_ENV}=42.5, o limiar veio ${comEnv}, esperado 42.5.`);
    }

    process.env[FAL_SPEND_ALERT_USD_ENV] = "não é número";
    const invalido = falSpendAlertThresholdUsd();
    if (invalido !== DEFAULT_FAL_SPEND_ALERT_USD) {
      failures.push(
        `livro-caixa: com ${FAL_SPEND_ALERT_USD_ENV} inválido, o limiar veio ${invalido}, esperado o ` +
          `default ${DEFAULT_FAL_SPEND_ALERT_USD} — um valor ilegível não pode desligar o alerta em silêncio.`,
      );
    }
  } finally {
    if (envOriginal === undefined) delete process.env[FAL_SPEND_ALERT_USD_ENV];
    else process.env[FAL_SPEND_ALERT_USD_ENV] = envOriginal;
  }

  // --- G-3: o alerta EMITE acima do limiar, e NÃO emite abaixo ------------
  process.env[FAL_SPEND_ALERT_USD_ENV] = "10";
  try {
    const logOriginal = console.log;
    const warnOriginal = console.warn;
    const capturadoAcima: string[] = [];
    (console.warn as unknown) = (...args: unknown[]) => capturadoAcima.push(args.map(String).join(" "));
    (console.log as unknown) = (...args: unknown[]) => capturadoAcima.push(args.map(String).join(" "));
    try {
      await comPoolMockado(15, () => alertarSeGastoFalAcimaDoLimite("tenant-acima"));
    } finally {
      console.log = logOriginal;
      console.warn = warnOriginal;
    }
    const logAcima = capturadoAcima.join("\n");
    if (!logAcima.includes("fal_gasto_estimado_acima_do_limite")) {
      failures.push(
        "livro-caixa: com gasto (15) acima do limiar (10), nenhum alerta " +
          '"fal_gasto_estimado_acima_do_limite" foi emitido.',
      );
    }
    if (!logAcima.includes("ESTIMATIVA INTERNA")) {
      failures.push(
        "livro-caixa: o alerta emitido não menciona \"ESTIMATIVA INTERNA\" — sem isso, um alerta lido fora " +
          "de contexto pode ser confundido com confirmação de fatura real.",
      );
    }

    const capturadoAbaixo: string[] = [];
    (console.warn as unknown) = (...args: unknown[]) => capturadoAbaixo.push(args.map(String).join(" "));
    (console.log as unknown) = (...args: unknown[]) => capturadoAbaixo.push(args.map(String).join(" "));
    try {
      await comPoolMockado(5, () => alertarSeGastoFalAcimaDoLimite("tenant-abaixo"));
    } finally {
      console.log = logOriginal;
      console.warn = warnOriginal;
    }
    if (capturadoAbaixo.join("\n").includes("fal_gasto_estimado_acima_do_limite")) {
      failures.push(
        "livro-caixa: com gasto (5) ABAIXO do limiar (10), o alerta disparou mesmo assim — um alerta que " +
          "nunca fica quieto deixa de significar alguma coisa.",
      );
    }
  } finally {
    if (envOriginal === undefined) delete process.env[FAL_SPEND_ALERT_USD_ENV];
    else process.env[FAL_SPEND_ALERT_USD_ENV] = envOriginal;
  }

  // --- G-4: abrirCorrida de fato chama a função, por FORMA ----------------
  const diarioSrc = readFileSync(path.join(repoRoot, DIARIO_DO_PIPELINE), "utf8");
  if (!diarioSrc.includes("await alertarSeGastoFalAcimaDoLimite(input.tenantId);")) {
    failures.push(
      `livro-caixa: ${DIARIO_DO_PIPELINE} não chama alertarSeGastoFalAcimaDoLimite(input.tenantId) dentro ` +
        "de abrirCorrida — a função pode estar certa e nunca ser invocada pelo único ponto por onde as " +
        "cinco rotas de produto passam.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "    livro-caixa: gastoFalDoTenantNoMesUsd soma gasto_previsto_usd por tenant/mês corrente, o " +
        "limiar de alerta é configurável (com fallback seguro a valor inválido), o alerta emite acima do " +
        "limiar e fica quieto abaixo, sempre rotulado ESTIMATIVA INTERNA, e abrirCorrida o consulta a cada " +
        "corrida nova (as cinco rotas de produto)",
    );
  }

  return { failures, notes };
}
