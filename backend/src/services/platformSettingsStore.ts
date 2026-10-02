/**
 * Leitura e escrita de configurações numéricas da plataforma — PAINEL-
 * HIGGSFIELD-1, 01/10/2026.
 *
 * Diferente de platformCredentialStore.ts: aqui não há segredo. O valor é
 * lido de volta e mostrado na tela antes de editar — é o próprio ponto da
 * tela existir (hoje só dá pra mudar via .env + recriar container).
 *
 * Mesmo desenho de cache do cofre de credenciais: mapa em memória,
 * invalidado inteiro em toda gravação, com TTL curto de retaguarda para o
 * dia em que houver mais de uma réplica do backend.
 */
import { pool } from "../db/pool.js";
import { recordAuditLog } from "./auditLog.js";
import { logEvent } from "./log/safeLog.js";

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: string | null;
  storedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function invalidatePlatformSettingsCache(): void {
  cache.clear();
}

/**
 * O valor cru (string) gravado pelo painel, ou null se nunca foi gravado —
 * nesse caso o chamador cai para o default/variável de ambiente dele.
 */
export async function readPlatformSetting(key: string): Promise<string | null> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) return cached.value;

  const { rows } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_settings WHERE key = $1`,
    [key],
  );
  const value = rows[0]?.value ?? null;
  cache.set(key, { value, storedAt: Date.now() });
  return value;
}

/**
 * Lê e já interpreta como inteiro não-negativo. Devolve null se a linha não
 * existe ou se o valor gravado está corrompido (nunca deveria acontecer,
 * dado que setPlatformSettingInt valida antes de gravar — mas um ajuste
 * manual no banco não passa por essa validação).
 */
export async function readPlatformSettingInt(key: string): Promise<number | null> {
  const raw = await readPlatformSetting(key);
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    logEvent("error", "platform_setting_corrupted", {
      context: "platformSettingsStore",
      key,
      recebido: raw,
      consequence: "tratado como ausente; o chamador cai para o default",
    });
    return null;
  }
  return n;
}

/** Grava um inteiro não-negativo. Lança se o valor não for válido. */
export async function setPlatformSettingInt(
  key: string,
  value: number,
  adminUserId: string | null,
): Promise<void> {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`valor inválido para ${key}: ${value} (precisa ser inteiro >= 0)`);
  }

  const { rows: before } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_settings WHERE key = $1`,
    [key],
  );

  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, String(value), adminUserId],
  );

  invalidatePlatformSettingsCache();

  await recordAuditLog({
    tenantId: null,
    actorAdminUserId: adminUserId,
    action: adminUserId ? `platform_setting.${key}.set` : `system.platform_setting.${key}.set`,
    before: before[0] ? { value: before[0].value } : null,
    after: { value: String(value) },
  });
}
