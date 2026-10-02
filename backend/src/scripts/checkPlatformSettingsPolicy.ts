/**
 * PAINEL-HIGGSFIELD-1, 01/10/2026 — platform_settings (banco) vence
 * variável de ambiente, mesma precedência de platform_credentials
 * (platformCredentialStore.ts). Verificação por EXECUÇÃO REAL contra o
 * banco de teste: grava um valor, confirma que o leitor devolve ele;
 * apaga, confirma que volta a ler do .env/default.
 *
 * Sem stub de fetch: não há fornecedor externo envolvido, só Postgres —
 * mesmo teste que foi rodado manualmente na sessão de 01/10/2026 antes de
 * esta guarda existir.
 */
import { pool } from "../db/pool.js";
import {
  higgsfieldConcurrencyLimit,
  HIGGSFIELD_CONCURRENCY_LIMIT_ENV,
  DEFAULT_HIGGSFIELD_CONCURRENCY_LIMIT,
} from "../services/providers/higgsfieldLimits.js";
import { setPlatformSettingInt, invalidatePlatformSettingsCache } from "../services/platformSettingsStore.js";

export interface PlatformSettingsCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkPlatformSettingsPolicy(): Promise<PlatformSettingsCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // Garante estado limpo antes de começar — sem linha gravada, deve cair no default.
  await pool.query("DELETE FROM platform_settings WHERE key = $1", [HIGGSFIELD_CONCURRENCY_LIMIT_ENV]);
  invalidatePlatformSettingsCache();

  try {
    const semLinha = await higgsfieldConcurrencyLimit();
    if (semLinha !== DEFAULT_HIGGSFIELD_CONCURRENCY_LIMIT) {
      failures.push(
        `platform_settings: sem linha gravada, higgsfieldConcurrencyLimit() devolveu ${semLinha}, ` +
          `esperado o default ${DEFAULT_HIGGSFIELD_CONCURRENCY_LIMIT} (ou o .env, se estiver setado).`,
      );
    }

    await setPlatformSettingInt(HIGGSFIELD_CONCURRENCY_LIMIT_ENV, 1, null);
    const comLinha = await higgsfieldConcurrencyLimit();
    if (comLinha !== 1) {
      failures.push(
        `platform_settings: gravei 1 no banco, higgsfieldConcurrencyLimit() devolveu ${comLinha} — o banco ` +
          "deveria vencer o .env/default, mesma precedência de platform_credentials.",
      );
    }

    await pool.query("DELETE FROM platform_settings WHERE key = $1", [HIGGSFIELD_CONCURRENCY_LIMIT_ENV]);
    invalidatePlatformSettingsCache();
    const depoisDeApagar = await higgsfieldConcurrencyLimit();
    if (depoisDeApagar !== DEFAULT_HIGGSFIELD_CONCURRENCY_LIMIT) {
      failures.push(
        `platform_settings: apaguei a linha do banco, higgsfieldConcurrencyLimit() devolveu ` +
          `${depoisDeApagar}, esperado voltar ao default ${DEFAULT_HIGGSFIELD_CONCURRENCY_LIMIT} — a ` +
          "invalidação de cache pode não estar limpando de verdade.",
      );
    }
  } finally {
    await pool.query("DELETE FROM platform_settings WHERE key = $1", [HIGGSFIELD_CONCURRENCY_LIMIT_ENV]);
    invalidatePlatformSettingsCache();
  }

  if (failures.length === 0) {
    notes.push(
      "platform_settings: banco vence .env/default (EXECUÇÃO real contra o Postgres: sem linha → default, " +
        "com linha → banco, apagada → default de novo), mesma precedência de platform_credentials",
    );
  }

  return { failures, notes };
}
