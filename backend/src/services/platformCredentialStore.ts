/**
 * Leitura, escrita e resolução das chaves da plataforma.
 *
 * ESTE É O ÚNICO MÓDULO QUE DECIFRA UMA CHAVE DE PLATAFORMA. Rotas falam com
 * ele por `listPlatformCredentials()` (metadado) e `setPlatformKey()`
 * (escrita); nenhuma delas devolve valor em claro, e `npm run check` reprova o
 * build se um arquivo de rota mencionar `decrypt(` ou `resolvePlatformKey`.
 *
 * ---------------------------------------------------------------------------
 * PRECEDÊNCIA
 *
 * Por padrão o BANCO vence o `.env`: gravar pelo painel passa a valer sem
 * reiniciar o backend, que é a razão de a tela existir. O `.env` continua
 * valendo como retaguarda para o que ainda não foi gravado.
 *
 * `PLATFORM_KEYS_FORCE_ENV=1` inverte: o `.env` volta a vencer. É uma saída de
 * emergência com um caso de uso concreto — uma chave ruim gravada pelo painel
 * (colada errada, revogada, do projeto errado) tranca do lado de fora justo
 * quem precisaria entrar para consertá-la. Sem essa inversão o conserto exigiria
 * `psql`. Ela é lida no boot: é uma decisão de operação, não de requisição.
 *
 * ---------------------------------------------------------------------------
 * CACHE
 *
 * Mapa em memória, populado na primeira leitura de cada chave e invalidado
 * INTEIRO em toda gravação. Sem isso, resolver por requisição significaria uma
 * consulta ao Postgres em cada mensagem de copiloto e em cada geração de
 * roteiro — barato uma vez, desperdício em regime.
 *
 * Há também um TTL curto como retaguarda. Ele não serve ao processo que grava
 * (esse invalida na hora); serve ao dia em que houver mais de uma réplica do
 * backend, quando a invalidação em memória de um processo não alcança o outro.
 * Com TTL, a segunda réplica converge sozinha em até `CACHE_TTL_MS`; sem ele,
 * ficaria servindo a chave velha até reiniciar — e o sintoma seria "gravei e
 * às vezes funciona", que é caríssimo de diagnosticar.
 */
import { pool } from "../db/pool.js";
import { decrypt, encrypt } from "./crypto.js";
import { recordAuditLog } from "./auditLog.js";
import { config } from "../config.js";
import {
  PLATFORM_CREDENTIALS,
  PLATFORM_CREDENTIAL_IDS,
  lastFourOf,
  type PlatformCredentialId,
} from "./platformCredentials.js";
import { logEvent } from "./log/safeLog.js";

export type PlatformKeySource = "panel" | "env";

export interface ResolvedPlatformKey {
  value: string;
  source: PlatformKeySource;
}

/** Metadado exibível. Nunca contém material de chave além dos 4 últimos. */
export interface PlatformCredentialView {
  id: PlatformCredentialId;
  envVar: string;
  label: string;
  servedBy: string;
  configured: boolean;
  source: PlatformKeySource | null;
  lastFour: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  lastValidatedAt: string | null;
  lastValidationOk: boolean | null;
  lastValidationDetail: string | null;
  readsBalance: boolean;
  balanceUnavailable: string | null;
  /** Verdadeiro quando o `.env` está mandando por PLATFORM_KEYS_FORCE_ENV. */
  forcedEnv: boolean;
  /** Falso quando `validation` é `null` — a tela desabilita "Validar". */
  hasProbe: boolean;
}

interface PlatformCredentialRow {
  key: string;
  encrypted_key: string;
  last_four: string;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
  last_validated_at: string | null;
  last_validation_ok: boolean | null;
  last_validation_detail: string | null;
}

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  resolved: ResolvedPlatformKey | null;
  storedAt: number;
}

const cache = new Map<PlatformCredentialId, CacheEntry>();

export function invalidatePlatformKeyCache(): void {
  cache.clear();
}

async function readRow(id: PlatformCredentialId): Promise<PlatformCredentialRow | undefined> {
  const { rows } = await pool.query<PlatformCredentialRow>(
    `SELECT pc.*, au.name AS updated_by_name
       FROM platform_credentials pc
       LEFT JOIN admin_users au ON au.id = pc.updated_by
      WHERE pc.key = $1`,
    [id],
  );
  return rows[0];
}

/**
 * A chave em claro, ou null. Só o backend chama isto — nunca uma rota.
 *
 * Uma linha ilegível (gravada sob outra ENCRYPTION_KEY) é tratada como
 * ausente, e não como erro: o efeito é cair na retaguarda do `.env` em vez de
 * derrubar o copiloto inteiro. O aviso vai para o log do servidor.
 */
export async function resolvePlatformKey(id: PlatformCredentialId): Promise<ResolvedPlatformKey | null> {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) return cached.resolved;

  const resolved = await resolveUncached(id);
  cache.set(id, { resolved, storedAt: Date.now() });
  return resolved;
}

async function resolveUncached(id: PlatformCredentialId): Promise<ResolvedPlatformKey | null> {
  const fromEnv = PLATFORM_CREDENTIALS[id].readEnv();

  if (config.platformKeysForceEnv) {
    if (fromEnv) return { value: fromEnv, source: "env" };
    // Mesmo com o .env mandando, uma chave gravada continua sendo melhor que
    // nenhuma: a inversão existe para desempatar, não para desligar o painel.
    const stored = await readStoredValue(id);
    return stored ? { value: stored, source: "panel" } : null;
  }

  const stored = await readStoredValue(id);
  if (stored) return { value: stored, source: "panel" };
  return fromEnv ? { value: fromEnv, source: "env" } : null;
}

async function readStoredValue(id: PlatformCredentialId): Promise<string | null> {
  const row = await readRow(id);
  if (!row) return null;
  try {
    return decrypt(row.encrypted_key);
  } catch {
    logEvent("error", "platform_credential_undecryptable", { id });
    return null;
  }
}

/** Metadado das cinco credenciais, para a tela do admin. */
export async function listPlatformCredentials(): Promise<PlatformCredentialView[]> {
  const { rows } = await pool.query<PlatformCredentialRow>(
    `SELECT pc.*, au.name AS updated_by_name
       FROM platform_credentials pc
       LEFT JOIN admin_users au ON au.id = pc.updated_by`,
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return PLATFORM_CREDENTIAL_IDS.map((id) => {
    const def = PLATFORM_CREDENTIALS[id];
    const row = byKey.get(id);
    const fromEnv = def.readEnv();
    return toPublicPlatformCredential(def, row, Boolean(fromEnv), config.platformKeysForceEnv);
  });
}

/**
 * Serializador. Recebe a linha CRUA (com `encrypted_key`) e devolve só o que
 * pode sair do servidor. Isolado numa função pura de propósito: `npm run check`
 * grava uma sentinela numa linha sintética, chama isto, e reprova o build se a
 * sentinela aparecer na saída — provando o caminho real, não uma cópia dele.
 */
export function toPublicPlatformCredential(
  def: (typeof PLATFORM_CREDENTIALS)[PlatformCredentialId],
  row: PlatformCredentialRow | undefined,
  hasEnvValue: boolean,
  forceEnv: boolean,
): PlatformCredentialView {
  // Precedência efetiva, espelhando resolveUncached(). Se as duas divergirem,
  // a tela mentiria sobre qual chave está em uso — pior que não mostrar nada.
  const source: PlatformKeySource | null = forceEnv
    ? hasEnvValue
      ? "env"
      : row
        ? "panel"
        : null
    : row
      ? "panel"
      : hasEnvValue
        ? "env"
        : null;

  return {
    id: def.id,
    envVar: def.envVar,
    label: def.label,
    servedBy: def.servedBy,
    configured: source !== null,
    source,
    // Só existe para chave gravada pelo painel: a do .env nunca passou por
    // uma escrita nossa, então não há 4 últimos gravados — e decifrar/ler o
    // ambiente para exibir seria abrir o caminho de leitura que não deve
    // existir.
    lastFour: source === "panel" && row ? row.last_four : null,
    updatedAt: row?.updated_at ?? null,
    updatedByName: row?.updated_by_name ?? null,
    lastValidatedAt: row?.last_validated_at ?? null,
    lastValidationOk: row?.last_validation_ok ?? null,
    lastValidationDetail: row?.last_validation_detail ?? null,
    readsBalance: def.readsBalance,
    balanceUnavailable: def.balanceUnavailable ?? null,
    forcedEnv: forceEnv && hasEnvValue,
    hasProbe: def.validation !== null,
  };
}

/**
 * Grava (ou substitui) uma chave. Devolve o metadado, nunca o valor.
 *
 * O `audit_log` recebe os 4 últimos e quem gravou — o suficiente para
 * responder "quem trocou, quando, e é esta chave mesmo?" — e nunca o valor
 * nem o texto cifrado.
 */
export async function setPlatformKey(
  id: PlatformCredentialId,
  apiKey: string,
  adminUserId: string | null,
): Promise<PlatformCredentialView> {
  const previous = await readRow(id);

  await pool.query(
    `INSERT INTO platform_credentials (key, encrypted_key, last_four, updated_at, updated_by,
                                       last_validated_at, last_validation_ok, last_validation_detail)
     VALUES ($1, $2, $3, now(), $4, NULL, NULL, NULL)
     ON CONFLICT (key) DO UPDATE
       SET encrypted_key = EXCLUDED.encrypted_key,
           last_four = EXCLUDED.last_four,
           updated_at = now(),
           updated_by = EXCLUDED.updated_by,
           -- Chave nova, validação velha não vale mais. Deixar o "validada em
           -- <data>" antigo ao lado de uma chave que ninguém testou é pior que
           -- não ter validação nenhuma: parece confirmação.
           last_validated_at = NULL,
           last_validation_ok = NULL,
           last_validation_detail = NULL`,
    [id, encrypt(apiKey), lastFourOf(apiKey), adminUserId],
  );

  invalidatePlatformKeyCache();

  await recordAuditLog({
    tenantId: null,
    actorAdminUserId: adminUserId,
    action: adminUserId ? `platform_credential.${id}.set` : `system.platform_credential.${id}.set`,
    before: previous ? { lastFour: previous.last_four, updatedAt: previous.updated_at } : null,
    after: { lastFour: lastFourOf(apiKey) },
  });

  const row = await readRow(id);
  const def = PLATFORM_CREDENTIALS[id];
  return toPublicPlatformCredential(def, row, Boolean(def.readEnv()), config.platformKeysForceEnv);
}

/** Registra o resultado de uma validação. Só grava se a chave veio do painel. */
export async function recordValidationResult(
  id: PlatformCredentialId,
  ok: boolean,
  detail: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE platform_credentials
        SET last_validated_at = now(), last_validation_ok = $2, last_validation_detail = $3
      WHERE key = $1`,
    [id, ok, detail],
  );
}
