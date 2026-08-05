/**
 * TETO DURO de gerações pagas por DIA — o freio que sobrevive ao processo.
 *
 * Já existe um teto neste sistema (`liveGuard.ts`), e ele não substitui este:
 * aquele conta operações tarifadas **na memória do processo** e zera a cada
 * `docker compose restart`. É um cinto de sessão, ótimo para uma passada
 * supervisionada e inútil para o dia inteiro — reiniciar o backend devolve o
 * orçamento por completo, e reiniciar o backend é rotina neste projeto (código
 * novo não entra sem `restart`).
 *
 * Este conta no BANCO, por data, e por isso não tem como ser zerado por
 * reinício. É o que responde "quantos vídeos pagos já saíram hoje?" depois de
 * a máquina ter sido desligada e ligada.
 *
 * ---------------------------------------------------------------------------
 * O QUE CONTA COMO GERAÇÃO PAGA
 *
 * Uma linha em `videos` com `simulated = false` criada hoje. Não é a contagem
 * mais precisa possível — uma geração recusada pelo fornecedor ANTES do aceite
 * é estornada e não custou nada, e ainda assim conta aqui.
 *
 * Contar a mais é deliberado, e a razão é a assimetria: um teto que conta de
 * menos deixa passar gasto real, e um que conta a mais no máximo obriga alguém
 * a subir o número numa variável de ambiente. Errar para o lado que custa
 * dinheiro seria escolher o pior dos dois.
 * ---------------------------------------------------------------------------
 */
import { pool } from "../../db/pool.js";
import { logEvent } from "../log/safeLog.js";

export const DAILY_PAID_GENERATION_LIMIT_ENV = "DAILY_PAID_GENERATION_LIMIT";

/**
 * Default quando a variável não está no ambiente.
 *
 * **5**, e o número tem origem: a US$ 0,05 por segundo cobrado, cinco vídeos de
 * ~37 s (a duração do último vídeo real) custam cerca de US$ 9,00 — perto de
 * três quartos do saldo de US$ 12,05 medido na conta em 05/08. Um teto que
 * permitisse gastar a carteira inteira num dia não seria teto.
 */
export const DEFAULT_DAILY_PAID_GENERATION_LIMIT = 5;

export class DailyGenerationLimitError extends Error {
  constructor(
    readonly used: number,
    readonly max: number,
  ) {
    super(
      `Teto diário de gerações pagas atingido: ${used} de ${max} hoje. ` +
        `Este limite é NOSSO, não do fornecedor — nada foi cobrado nesta tentativa. ` +
        `Para subi-lo, defina ${DAILY_PAID_GENERATION_LIMIT_ENV} no ambiente e suba o backend com ` +
        "`up -d` (um `restart` não recarrega o .env). O contador zera à meia-noite do servidor.",
    );
    this.name = "DailyGenerationLimitError";
  }
}

/**
 * O teto em vigor. Valor inválido ou ausente cai no default DECLARADO, e o
 * default nunca é "sem limite": um teto que some quando alguém digita errado a
 * variável é pior que não ter teto, porque parece que está lá.
 */
export function dailyPaidGenerationLimit(): number {
  const bruto = process.env[DAILY_PAID_GENERATION_LIMIT_ENV];
  if (bruto === undefined || bruto.trim() === "") return DEFAULT_DAILY_PAID_GENERATION_LIMIT;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    logEvent("error", "daily_limit_invalid", {
      context: "billing.dailyGenerationLimit",
      recebido: bruto,
      consequence: `valor ignorado; vale o default de ${DEFAULT_DAILY_PAID_GENERATION_LIMIT}`,
    });
    return DEFAULT_DAILY_PAID_GENERATION_LIMIT;
  }
  return n;
}

/**
 * Quantas gerações pagas já saíram hoje.
 *
 * A contagem é da INSTALAÇÃO inteira, não de um tenant: a chave do fornecedor é
 * uma só e a carteira é uma só. Um teto por tenant deixaria dez tenants
 * gastarem dez vezes o limite da mesma conta.
 */
export async function countPaidGenerationsToday(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM videos
      WHERE simulated = false AND created_at >= date_trunc('day', now())`,
  );
  return Number(rows[0]?.n ?? 0);
}

export interface DailyBudget {
  used: number;
  max: number;
  remaining: number;
  exhausted: boolean;
}

/** Estado do teto, para a tela poder avisar ANTES de o botão ser clicado. */
export async function readDailyBudget(): Promise<DailyBudget> {
  const max = dailyPaidGenerationLimit();
  const used = await countPaidGenerationsToday();
  return { used, max, remaining: Math.max(0, max - used), exhausted: used >= max };
}

/**
 * O FREIO. Roda no servidor, antes do débito e antes de qualquer chamada.
 *
 * Lança em vez de devolver booleano de propósito: um valor de retorno pode ser
 * ignorado por descuido num `if` esquecido, e o que está do outro lado é
 * dinheiro real. Uma exceção não tem como ser ignorada em silêncio.
 */
export async function assertDailyGenerationBudget(): Promise<void> {
  const budget = await readDailyBudget();
  if (budget.exhausted) {
    logEvent("error", "daily_limit_reached", {
      context: "billing.dailyGenerationLimit",
      used: budget.used,
      max: budget.max,
    });
    throw new DailyGenerationLimitError(budget.used, budget.max);
  }
}
