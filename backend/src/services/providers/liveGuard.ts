/**
 * Proteção da carteira quando `PROVIDER_MODE=live`.
 *
 * A proteção existente olhava para um lado só: `npm run check` impedia
 * `fixture` em produção, mas nada impedia `live` em desenvolvimento. Trocar
 * uma palavra no `.env` liberava chamada real — e o saldo comporta cerca de
 * UM vídeo. O acidente barato de cometer era justamente o caro de pagar.
 *
 * Três travas, deliberadamente independentes:
 *
 *  1. **Intenção explícita.** `live` sozinho não basta: exige
 *     `PROVIDER_LIVE_CONFIRM` com o valor exato abaixo. Uma variável de
 *     modo pode ser trocada por engano, por cópia de `.env` alheio ou por
 *     um merge; ter de escrever uma segunda frase, cujo texto declara o que
 *     vai acontecer, não se faz sem querer.
 *  2. **Teto de GASTO** (`PROVIDER_LIVE_MAX_GENERATIONS`). Quantas chamadas
 *     chegaram a produzir trabalho pago. Calibrado pela carteira.
 *  3. **Teto de TENTATIVAS** (`PROVIDER_LIVE_MAX_ATTEMPTS`). Quantas vezes o
 *     código disparou, com qualquer desfecho. Protege contra o laço.
 *
 * **Por que 2 e 3 são contadores separados, e não um só.** Eram um só, e a
 * mistura produziu um defeito medido no bloco PREVOO-1: uma chamada que
 * FALHA não gasta a carteira, mas consumia o teto de carteira mesmo assim.
 * Com o teto em 2, duas falhas o esgotavam sem nenhum vídeo ter saído, e a
 * única saída era reiniciar o backend — no meio de uma passada live, que é
 * o pior momento possível para descobrir isso.
 *
 * Um contador só não conseguia servir aos dois propósitos: devolvê-lo na
 * falha desligaria a proteção contra laço (dez disparos que falham dez vezes
 * devolveriam dez vezes e rodariam para sempre); não devolvê-lo é o defeito
 * acima. Separados, cada um protege o que sabe medir — e só o de gasto volta.
 *
 * **A fronteira da devolução é a MESMA do estorno de crédito** (bloco
 * ESTORNO-1), de propósito: devolve quando a chamada ao fornecedor LANÇOU,
 * porque lançar significa que ele não aceitou o trabalho. Depois do aceite,
 * nada volta — ele renderizou e cobrou. Duas fronteiras diferentes para a
 * mesma pergunta ("o fornecedor chegou a trabalhar?") divergiriam na
 * primeira mudança, e a divergência só apareceria em live.
 */
import { logEvent } from "../log/safeLog.js";

export const LIVE_CONFIRM_ENV = "PROVIDER_LIVE_CONFIRM";
export const LIVE_LIMIT_ENV = "PROVIDER_LIVE_MAX_GENERATIONS";
export const LIVE_ATTEMPT_LIMIT_ENV = "PROVIDER_LIVE_MAX_ATTEMPTS";

/**
 * Valor exato exigido. É uma frase, e não `true`/`1`, porque o texto é
 * metade da proteção: quem digita isto leu o que estava digitando.
 */
export const LIVE_CONFIRM_VALUE = "eu-autorizo-gastar-cota-real";

/** Default deliberadamente baixo: a carteira comporta cerca de um vídeo. */
export const LIVE_DEFAULT_MAX_GENERATIONS = 1;

/**
 * Quantas TENTATIVAS cada unidade de gasto autoriza, quando
 * `PROVIDER_LIVE_MAX_ATTEMPTS` não é definida.
 *
 * Três, e não "sem limite", porque uma falha não custa dinheiro mas custa
 * tempo e cota de rede — e três falhas seguidas não são azar, são sinal de
 * que algo está errado de verdade. Parar aí é o comportamento útil: seguir
 * tentando só produziria mais ruído em cima do mesmo defeito.
 */
export const LIVE_DEFAULT_ATTEMPTS_PER_GENERATION = 3;

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

export function readLiveMaxAttempts(env: NodeJS.ProcessEnv = process.env): number {
  // O default DERIVA do teto de gasto em vez de ser um número solto: quem
  // sobe o teto para uma passada de 2 vídeos espera margem para falha
  // proporcional, e um default fixo (digamos 3) transformaria esse aumento em
  // nada — o teto de tentativas viraria o gargalo silencioso, que é o mesmo
  // modo de falha que este bloco existe para eliminar.
  const derived = readLiveMaxGenerations(env) * LIVE_DEFAULT_ATTEMPTS_PER_GENERATION;
  const raw = env[LIVE_ATTEMPT_LIMIT_ENV];
  if (!raw) return derived;
  const value = Number(raw);
  // Mesma regra do teto de gasto: valor inválido cai no derivado, nunca em
  // NaN — uma comparação com NaN é sempre falsa e desligaria a trava.
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : derived;
}

/**
 * Contagem por processo. "Sessão" aqui é a vida do servidor: reiniciar
 * zera, o que é aceitável porque reiniciar é um ato deliberado — e o teto
 * protege contra o laço acidental dentro de uma execução, não contra
 * alguém decidido a gastar.
 */
let used = 0;

/**
 * Tentativas da sessão, com QUALQUER desfecho. Nunca é devolvida.
 *
 * É o que resta protegendo contra o laço depois que o teto de gasto passou a
 * voltar na falha. Sem este segundo contador, um caminho que falha sempre
 * (payload malformado, credencial revogada) devolveria a unidade toda vez e
 * dispararia para sempre — trocando um defeito por outro pior, porque este
 * não pararia sozinho.
 */
let attempted = 0;

/**
 * O QUE foi consumido, em ordem. Existe porque o teto conta voz e vídeo
 * juntos, e a mensagem antiga só dizia "1/1" — deixando quem lê achar que
 * eram duas tentativas de vídeo, quando na verdade a primeira unidade tinha
 * sido gasta pela clonagem de voz, na tela anterior. Sem esta lista, a
 * mensagem nomeia o teto mas não explica como ele acabou.
 */
const consumedBy: string[] = [];

/**
 * O que foi TENTADO, em ordem — inclusive o que falhou e devolveu o gasto.
 * Lista separada porque, depois da devolução, `consumedBy` deixa de contar a
 * história inteira: ele passa a mostrar só o que vingou, e quem lê o log
 * precisa poder ver as tentativas que sumiram dali.
 */
const attemptedBy: string[] = [];

export function liveGenerationsUsed(): number {
  return used;
}

export function liveGenerationAttempts(): number {
  return attempted;
}

export function liveGenerationsConsumedBy(): readonly string[] {
  return consumedBy;
}

export function liveGenerationsAttemptedBy(): readonly string[] {
  return attemptedBy;
}

export function resetLiveGenerationCount(): void {
  used = 0;
  attempted = 0;
  consumedBy.length = 0;
  attemptedBy.length = 0;
}

/** Qual das duas travas recusou — muda a mensagem e muda a saída. */
export type LiveBudgetDenial = "spend_cap" | "attempt_cap";

export interface LiveBudgetResult {
  allowed: boolean;
  used: number;
  max: number;
  attempts: number;
  maxAttempts: number;
  deniedBy?: LiveBudgetDenial;
}

/**
 * Consome uma unidade dos DOIS tetos. Chamado antes de qualquer geração
 * tarifada em modo live; em fixture nunca é chamado, porque ali nada custa.
 *
 * Prefira `withLiveBudget()`, que garante a devolução na falha. Chamar esta
 * função direto é correto apenas para quem exercita o mecanismo (as guardas).
 */
export function consumeLiveGeneration(
  operation: string,
  env: NodeJS.ProcessEnv = process.env,
): LiveBudgetResult {
  const max = readLiveMaxGenerations(env);
  const maxAttempts = readLiveMaxAttempts(env);

  // A trava de LAÇO é verificada primeiro, e a ordem importa: depois que as
  // falhas passaram a devolver o gasto, o teto de gasto pode ter folga
  // justamente porque tudo falhou. Verificá-lo primeiro deixaria o laço
  // passar exatamente no cenário em que ele existe para barrar.
  if (attempted >= maxAttempts) {
    return { allowed: false, used, max, attempts: attempted, maxAttempts, deniedBy: "attempt_cap" };
  }
  if (used >= max) {
    return { allowed: false, used, max, attempts: attempted, maxAttempts, deniedBy: "spend_cap" };
  }
  used += 1;
  attempted += 1;
  consumedBy.push(operation);
  attemptedBy.push(operation);
  return { allowed: true, used, max, attempts: attempted, maxAttempts };
}

/**
 * Devolve a unidade de GASTO de uma operação que falhou. A TENTATIVA não
 * volta — ver `attempted`.
 *
 * Fronteira, idêntica à do estorno de crédito (bloco ESTORNO-1): só é
 * chamada quando a chamada ao fornecedor LANÇOU, o que significa que ele não
 * aceitou o trabalho.
 *
 * **Caso de fronteira conhecido e NÃO tratado:** `generateVideoHeygen`
 * sintetiza a voz no ElevenLabs (tarifado) ANTES de criar o vídeo na HeyGen.
 * Se a voz foi sintetizada e a criação falhou em seguida, esta devolução
 * devolve uma unidade que teve custo parcial real. É aceitável porque o teto
 * é trava de segurança, não contabilidade — quem mede dinheiro é
 * `provider_usage` —, mas fica no log para não ser descoberto como surpresa
 * ao conciliar uma fatura.
 */
export function releaseLiveGeneration(operation: string, reason: string): boolean {
  const index = consumedBy.lastIndexOf(operation);
  if (index === -1 || used <= 0) return false;
  consumedBy.splice(index, 1);
  used -= 1;
  logEvent("warn", "live_budget_released", {
    operation,
    reason,
    used,
    attempts: attempted,
    message:
      `Teto de gasto devolvido: "${operation}" falhou antes de o fornecedor aceitar o trabalho. ` +
      `Gasto agora em ${used}; a TENTATIVA continua contada (${attempted}) e não volta. ` +
      "Se esta operação for geração de vídeo, a síntese de voz que a precede pode já ter sido cobrada.",
  });
  return true;
}

/**
 * Consome o teto, executa, e devolve o gasto se a chamada lançar.
 *
 * Existe como wrapper — em vez de um `catch` em cada chamador — porque a
 * devolução esquecida é invisível: o código segue funcionando, o contador
 * segue plausível, e o defeito só aparece na terceira falha de uma passada
 * live. Consumo e devolução no mesmo lugar tornam o esquecimento impossível,
 * e é o que a guarda passa a cobrar dos caminhos tarifados.
 */
export async function withLiveBudget<T>(
  operation: string,
  verb: string,
  fn: () => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const budget = consumeLiveGeneration(operation, env);
  if (!budget.allowed) {
    throw new LiveBudgetExhaustedError(budget.used, budget.max, verb, budget);
  }
  try {
    return await fn();
  } catch (err) {
    releaseLiveGeneration(operation, err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    throw err;
  }
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
    logEvent("info", "provider_mode", { mode, billable: false, message: "Simulação: nenhuma chamada a fornecedor tarifado." });
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
  logEvent("warn", "provider_mode", { mode: "live",
      billable: true,
      maxGenerationsThisSession: max,
      message:
        "MODO LIVE AUTORIZADO — chamadas a HeyGen/ElevenLabs vão gastar cota PAGA. " +
        `Teto desta sessão: ${max} geração(ões) tarifada(s).`,
    });
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
function buildExhaustedMessage(
  used: number,
  max: number,
  operation: string,
  budget?: Pick<LiveBudgetResult, "attempts" | "maxAttempts" | "deniedBy">,
): string {
  if (budget?.deniedBy === "attempt_cap") {
    // Mensagem própria, e não um "teto atingido" genérico: chegar aqui com
    // gasto sobrando significa que as chamadas estão FALHANDO, e esse é o
    // diagnóstico que a pessoa precisa — aumentar o limite sem olhar a falha
    // só produz mais falhas.
    return (
      `Não foi possível "${operation}": esta sessão já fez ${budget.attempts} de ${budget.maxAttempts} ` +
      "tentativas tarifáveis, e o teto de TENTATIVAS foi atingido. Este limite é DESTE aplicativo, não do " +
      "fornecedor — nenhuma chamada foi feita agora e nada foi cobrado por esta recusa. " +
      `O que foi tentado, em ordem: ${attemptedBy.length > 0 ? attemptedBy.join(" → ") : "(nada registrado nesta sessão)"}. ` +
      `O gasto está em ${used}/${max}: as tentativas acabaram ANTES do gasto, o que significa que as chamadas ` +
      "estão falhando — a tentativa que falha devolve o gasto, mas não devolve a si mesma, e é isso que impede " +
      "um caminho quebrado de disparar para sempre. Investigue a falha no log (evento `live_budget_released`) " +
      `antes de aumentar o limite. Para seguir mesmo assim: defina ${LIVE_ATTEMPT_LIMIT_ENV} e recrie o ` +
      "container com `docker compose up -d backend` — `restart` não recarrega variável de ambiente. " +
      "Reiniciar o backend também zera a contagem da sessão."
    );
  }
  return (
    `Não foi possível "${operation}": o teto de operações tarifadas desta sessão já está em ${used}/${max}, ` +
    `restam 0. Este limite é DESTE aplicativo, não do fornecedor — nenhuma chamada foi feita e nada foi cobrado. ` +
    `O que consumiu o teto, em ordem: ${consumedBy.length > 0 ? consumedBy.join(" → ") : "(nada registrado nesta sessão)"}. ` +
    "O teto conta CLONAGEM DE VOZ e GERAÇÃO DE VÍDEO juntas, então configurar um avatar já gasta uma unidade. " +
    "Tentativas que FALHARAM não estão nesta conta: elas devolvem o gasto, e por isso o número acima é de " +
    "trabalho que o fornecedor aceitou. " +
    `Para seguir: defina ${LIVE_LIMIT_ENV}=2 ou mais (um fluxo completo de avatar + vídeo precisa de 2) e recrie o ` +
    "container com `docker compose up -d backend` — `restart` não recarrega variável de ambiente. " +
    "Reiniciar o backend também zera a contagem da sessão."
  );
}

export class LiveBudgetExhaustedError extends Error {
  /** Qual trava recusou. `spend_cap` é o default para chamadores antigos. */
  public readonly deniedBy: LiveBudgetDenial;

  constructor(
    public readonly used: number,
    public readonly max: number,
    public readonly operation: string,
    budget?: Pick<LiveBudgetResult, "attempts" | "maxAttempts" | "deniedBy">,
  ) {
    super(buildExhaustedMessage(used, max, operation, budget));
    this.deniedBy = budget?.deniedBy ?? "spend_cap";
    this.name = "LiveBudgetExhaustedError";
  }
}
