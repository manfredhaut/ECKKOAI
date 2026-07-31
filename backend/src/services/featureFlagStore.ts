/**
 * Leitura e escrita do estado das flags (tabela `feature_flags`).
 *
 * Sem cache em memória, de propósito — mesmo raciocínio já aplicado a
 * `plans.ts`: isto não é caminho quente, e um cache faria o admin virar a
 * chave e não ver efeito até reiniciar, que é exatamente o problema que
 * "alternável sem rebuild" existe para resolver.
 */
import { pool } from "../db/pool.js";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  isKnownFlag,
  type FeatureFlagKey,
  type FeatureFlagState,
} from "./featureFlags.js";

export async function getFeatureFlags(): Promise<FeatureFlagState[]> {
  const { rows } = await pool.query<{ key: string; enabled: boolean }>(
    "SELECT key, enabled FROM feature_flags",
  );
  const stored = new Map(rows.map((r) => [r.key, r.enabled]));

  // Percorre o REGISTRO, não a tabela: flag sem linha no banco cai no
  // default declarado, e linha órfã no banco (flag removida do código) é
  // ignorada em vez de virar um recurso fantasma na UI.
  return FEATURE_FLAG_KEYS.map((key) => {
    const def = FEATURE_FLAGS[key];
    return {
      key,
      label: def.label,
      enabled: stored.get(key) ?? def.defaultEnabled,
      reason: def.reason,
    };
  });
}

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags.find((f) => f.key === key)?.enabled ?? FEATURE_FLAGS[key].defaultEnabled;
}

export async function setFeatureFlag(
  key: string,
  enabled: boolean,
  adminUserId: string,
): Promise<FeatureFlagState | null> {
  // Recusa chave desconhecida em vez de gravá-la: aceitar qualquer texto
  // deixaria o banco divergir do registro, e a divergência só apareceria
  // como um recurso que nunca liga.
  if (!isKnownFlag(key)) return null;

  await pool.query(
    `INSERT INTO feature_flags (key, enabled, updated_at, updated_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, enabled, adminUserId],
  );

  const def = FEATURE_FLAGS[key];
  return { key, label: def.label, enabled, reason: def.reason };
}
