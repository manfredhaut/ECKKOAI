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

/**
 * Teto de gerações tarifadas da sessão atingido.
 *
 * Classe PRÓPRIA, e não um erro de provedor, por uma razão medida na primeira
 * passada live: o teto é NOSSO — uma trava de segurança que criamos — e estava
 * sendo empacotado como falha de fornecedor. O cliente via "Não foi possível
 * concluir a operação no serviço de vídeo", que manda procurar problema na
 * HeyGen quando a HeyGen sequer foi chamada. O sanitizador de erro de vendor
 * existe para não vazar corpo de resposta de terceiro; aplicá-lo a uma
 * mensagem nossa só apaga a única informação útil.
 *
 * O contexto que faltava: o teto é compartilhado entre clonagem de voz e
 * geração de vídeo. Com o padrão de 1, configurar um avatar (que clona voz)
 * consome a cota inteira, e o vídeo seguinte é recusado — sem que nada na
 * tela ligasse uma coisa à outra.
 */
export class LiveBudgetExhaustedError extends Error {
  constructor(
    public readonly used: number,
    public readonly max: number,
    public readonly operation: string,
  ) {
    super(
      `Teto de gerações tarifadas desta sessão atingido (${used}/${max}) ao tentar "${operation}". ` +
        "Este limite é DESTE aplicativo, não do fornecedor — nenhuma chamada foi feita e nada foi cobrado. " +
        `O teto é compartilhado entre clonagem de voz e geração de vídeo, então configurar um avatar já consome ${used === max ? "a cota" : "parte dela"}. ` +
        `Para seguir: suba ${LIVE_LIMIT_ENV} (um fluxo completo de avatar + vídeo precisa de pelo menos 2) e recrie o container, ` +
        "ou reinicie o backend para zerar a contagem da sessão.",
    );
    this.name = "LiveBudgetExhaustedError";
  }
}
