/**
 * Proteção da carteira quando `PROVIDER_MODE=live`.
 *
 * A proteção existente olhava para um lado só: `npm run check` impedia
 * `fixture` em produção, mas nada impedia `live` em desenvolvimento. Trocar
 * uma palavra no `.env` liberava chamada real — e o saldo comporta cerca de
 * UM vídeo. O acidente barato de cometer era justamente o caro de pagar.
 *
 * Duas travas, deliberadamente independentes:
 *
 *  1. **Intenção explícita.** `live` sozinho não basta: exige
 *     `PROVIDER_LIVE_CONFIRM` com o valor exato abaixo. Uma variável de
 *     modo pode ser trocada por engano, por cópia de `.env` alheio ou por
 *     um merge; ter de escrever uma segunda frase, cujo texto declara o que
 *     vai acontecer, não se faz sem querer.
 *  2. **Teto por processo.** Mesmo autorizado, o número de gerações
 *     tarifadas é limitado, com default baixo. Intenção protege contra o
 *     acidente de configuração; o teto protege contra o laço que dispara
 *     dez vezes — que nenhuma declaração de intenção impediria.
 */

export const LIVE_CONFIRM_ENV = "PROVIDER_LIVE_CONFIRM";
export const LIVE_LIMIT_ENV = "PROVIDER_LIVE_MAX_GENERATIONS";

/**
 * Valor exato exigido. É uma frase, e não `true`/`1`, porque o texto é
 * metade da proteção: quem digita isto leu o que estava digitando.
 */
export const LIVE_CONFIRM_VALUE = "eu-autorizo-gastar-cota-real";

/** Default deliberadamente baixo: a carteira comporta cerca de um vídeo. */
export const LIVE_DEFAULT_MAX_GENERATIONS = 1;

export class LiveModeNotAuthorizedError extends Error {}

export function isLiveAuthorized(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[LIVE_CONFIRM_ENV] === LIVE_CONFIRM_VALUE;
}

export function readLiveMaxGenerations(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[LIVE_LIMIT_ENV];
  if (!raw) return LIVE_DEFAULT_MAX_GENERATIONS;
  const value = Number(raw);
  // Valor inválido cai no default em vez de virar NaN — uma comparação com
  // NaN é sempre falsa e desligaria o teto em silêncio, que é o oposto do
  // que este arquivo existe para fazer.
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : LIVE_DEFAULT_MAX_GENERATIONS;
}

/**
 * Contagem por processo. "Sessão" aqui é a vida do servidor: reiniciar
 * zera, o que é aceitável porque reiniciar é um ato deliberado — e o teto
 * protege contra o laço acidental dentro de uma execução, não contra
 * alguém decidido a gastar.
 */
let used = 0;

export function liveGenerationsUsed(): number {
  return used;
}

export function resetLiveGenerationCount(): void {
  used = 0;
}

export interface LiveBudgetResult {
  allowed: boolean;
  used: number;
  max: number;
}

/**
 * Consome uma unidade do teto. Chamado antes de qualquer geração tarifada
 * em modo live; em fixture nunca é chamado, porque ali nada custa.
 */
export function consumeLiveGeneration(env: NodeJS.ProcessEnv = process.env): LiveBudgetResult {
  const max = readLiveMaxGenerations(env);
  if (used >= max) return { allowed: false, used, max };
  used += 1;
  return { allowed: true, used, max };
}

/**
 * Chamado no boot. Recusa subir em `live` sem autorização, e deixa um log
 * inequívoco quando sobe autorizado — subir gastando dinheiro real não pode
 * ser indistinguível de subir em simulação na leitura do log.
 */
export function assertLiveModeAuthorized(
  mode: "fixture" | "live",
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (mode !== "live") {
    console.log(
      JSON.stringify({ event: "provider_mode", mode, billable: false, message: "Simulação: nenhuma chamada a fornecedor tarifado." }),
    );
    return;
  }

  if (!isLiveAuthorized(env)) {
    throw new LiveModeNotAuthorizedError(
      `PROVIDER_MODE=live exige ${LIVE_CONFIRM_ENV}="${LIVE_CONFIRM_VALUE}". ` +
        "Sem essa confirmação o servidor não sobe: em live, cada geração consome cota paga " +
        "de HeyGen/ElevenLabs, e o saldo atual comporta cerca de um vídeo.",
    );
  }

  const max = readLiveMaxGenerations(env);
  console.warn(
    JSON.stringify({
      event: "provider_mode",
      mode: "live",
      billable: true,
      maxGenerationsThisSession: max,
      message:
        "MODO LIVE AUTORIZADO — chamadas a HeyGen/ElevenLabs vão gastar cota PAGA. " +
        `Teto desta sessão: ${max} geração(ões) tarifada(s).`,
    }),
  );
}
