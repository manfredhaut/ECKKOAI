/**
 * ABAS-24, 30/09/2026 — duas guardas de robustez da Etapa 6 do plano
 * (29/09/2026), sem depender do provedor real (higgsfieldProvider.ts
 * ainda não existe): contam linhas em creative_jobs, nunca chamam a
 * Higgsfield.
 *
 * Escopo: só os modos que usam modelo da Higgsfield (imagem, propaganda,
 * broll, sobreposição) — narração e música são ElevenLabs, fora daqui.
 *
 * Semáforo de concorrência é da CREDENCIAL inteira (todos os tenants),
 * mesmo desenho já usado em dailyGenerationLimit.ts para o HeyGen: a
 * chave é uma só, a carteira é uma só. O teto diário, ao contrário, é
 * POR TENANT — aqui a intenção é distinta: não proteger a carteira (isso
 * é o semáforo), e sim impedir que um tenant sozinho monopolize a fila
 * dos outros. É uma contagem de JOBS, não de dólares: o teto em dólar
 * real do plano (US$ 5/tenant/dia) só pode existir quando /estimate
 * (orquestrador real) existir — isto é um substituto provisório.
 *
 * As duas valem MESMO EM FIXTURE, ao contrário de assertDailyGenerationBudget
 * (que só protege dinheiro real e por isso é pulada em fixture): aqui o
 * ponto é provar o comportamento agora, como o próprio plano pede
 * ("6 pedidos simultâneos... teto bloqueia o sétimo").
 */
import { pool } from "../../db/pool.js";
import { logEvent } from "../log/safeLog.js";
import { readPlatformSettingInt } from "../platformSettingsStore.js";

export const MODOS_HIGGSFIELD = new Set(["imagem", "propaganda", "broll", "sobreposicao"]);

const ESTADOS_TERMINAIS = ["pronto", "falhou", "recusado", "cancelado"];

export const HIGGSFIELD_CONCURRENCY_LIMIT_ENV = "HIGGSFIELD_CONCURRENCY_LIMIT";
/** Default = o exemplo de limite de conta citado no plano (29/09/2026). */
export const DEFAULT_HIGGSFIELD_CONCURRENCY_LIMIT = 4;

export const HIGGSFIELD_TENANT_DAILY_LIMIT_ENV = "HIGGSFIELD_TENANT_DAILY_LIMIT";
/**
 * Default arbitrário e PROVISÓRIO: o plano pede um teto em DÓLAR (US$ 5/dia
 * por tenant), só medível quando /estimate real existir. Até lá, esta é
 * uma contagem de JOBS por dia — 20 é folgado o bastante para não travar
 * teste normal em fixture; existe só para impedir que um tenant
 * monopolize a fila, não substitui o teto em dólar do plano.
 */
export const DEFAULT_HIGGSFIELD_TENANT_DAILY_LIMIT = 20;

export function readIntEnv(name: string, def: number): number {
  const bruto = process.env[name];
  if (bruto === undefined || bruto.trim() === "") return def;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    logEvent("error", "higgsfield_limit_invalid", {
      context: "providers.higgsfieldLimits",
      env: name,
      recebido: bruto,
      consequence: `valor ignorado; vale o default de ${def}`,
    });
    return def;
  }
  return n;
}

/**
 * PAINEL-HIGGSFIELD-1, 01/10/2026 — o banco (platform_settings) vence o
 * .env, mesma precedência de platformCredentialStore.ts: gravar pelo
 * painel passa a valer sem reiniciar o backend. O .env continua como
 * retaguarda para quem nunca configurou pela tela.
 */
export async function higgsfieldConcurrencyLimit(): Promise<number> {
  const fromDb = await readPlatformSettingInt(HIGGSFIELD_CONCURRENCY_LIMIT_ENV);
  if (fromDb !== null) return fromDb;
  return readIntEnv(HIGGSFIELD_CONCURRENCY_LIMIT_ENV, DEFAULT_HIGGSFIELD_CONCURRENCY_LIMIT);
}

export async function higgsfieldTenantDailyLimit(): Promise<number> {
  const fromDb = await readPlatformSettingInt(HIGGSFIELD_TENANT_DAILY_LIMIT_ENV);
  if (fromDb !== null) return fromDb;
  return readIntEnv(HIGGSFIELD_TENANT_DAILY_LIMIT_ENV, DEFAULT_HIGGSFIELD_TENANT_DAILY_LIMIT);
}

export class HiggsfieldConcurrencyError extends Error {
  constructor(
    readonly used: number,
    readonly max: number,
  ) {
    super(
      `Limite de concorrência da Higgsfield atingido: ${used} de ${max} jobs em andamento agora ` +
        "(de todos os tenants — a credencial é compartilhada). Espere um destes terminar e tente de novo.",
    );
    this.name = "HiggsfieldConcurrencyError";
  }
}

export class HiggsfieldTenantDailyLimitError extends Error {
  constructor(
    readonly used: number,
    readonly max: number,
  ) {
    super(
      `Teto diário de jobs da Higgsfield atingido para esta conta: ${used} de ${max} hoje. ` +
        `O contador zera à meia-noite do servidor. Para ajustar, defina ${HIGGSFIELD_TENANT_DAILY_LIMIT_ENV} ` +
        "no ambiente e suba o backend com `up -d` (um `restart` não recarrega o .env).",
    );
    this.name = "HiggsfieldTenantDailyLimitError";
  }
}

async function countJobsEmAndamento(): Promise<number> {
  const modos = [...MODOS_HIGGSFIELD];
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM creative_jobs
     WHERE modo = ANY($1) AND estado <> ALL($2)`,
    [modos, ESTADOS_TERMINAIS],
  );
  return Number(rows[0]?.n ?? 0);
}

async function countJobsHojeDoTenant(tenantId: string): Promise<number> {
  const modos = [...MODOS_HIGGSFIELD];
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM creative_jobs
     WHERE modo = ANY($1) AND tenant_id = $2 AND created_at >= date_trunc('day', now())`,
    [modos, tenantId],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * As DUAS guardas, chamadas juntas antes do INSERT em creative_jobs. Lança
 * em vez de devolver booleano — mesmo motivo de assertDailyGenerationBudget
 * (dailyGenerationLimit.ts): um retorno pode ser ignorado num `if`
 * esquecido, e aqui é o que protege a conta de estourar concorrência ou
 * um tenant de monopolizar a fila dos outros. Não-op para modos fora de
 * MODOS_HIGGSFIELD (narração, música).
 */
export async function assertHiggsfieldGuards(tenantId: string, modo: string): Promise<void> {
  if (!MODOS_HIGGSFIELD.has(modo)) return;

  const maxConcorrencia = await higgsfieldConcurrencyLimit();
  const emAndamento = await countJobsEmAndamento();
  if (emAndamento >= maxConcorrencia) {
    logEvent("error", "higgsfield_concurrency_reached", {
      context: "providers.higgsfieldLimits",
      emAndamento,
      max: maxConcorrencia,
    });
    throw new HiggsfieldConcurrencyError(emAndamento, maxConcorrencia);
  }

  const maxDiarioTenant = await higgsfieldTenantDailyLimit();
  const hojeDoTenant = await countJobsHojeDoTenant(tenantId);
  if (hojeDoTenant >= maxDiarioTenant) {
    logEvent("error", "higgsfield_tenant_daily_limit_reached", {
      context: "providers.higgsfieldLimits",
      tenantId,
      hojeDoTenant,
      max: maxDiarioTenant,
    });
    throw new HiggsfieldTenantDailyLimitError(hojeDoTenant, maxDiarioTenant);
  }
}
