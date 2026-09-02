/**
 * FRACIONAMENTO DO ROTEIRO EM BLOCOS DE ANIMAÇÃO — tier Normal, BLOCO
 * FRACOES-1 (28/08/2026). Implementa o item 1 de
 * `docs-internal/plano-fracoes-2026-08-28.md` (mesmo plano, não replanejado).
 *
 * ┌─ Por que existe, em uma frase ────────────────────────────────────────────┐
 * │ `wan/v2.6/image-to-video/flash` não anima mais que 15 s por chamada       │
 * │ (`PIPELINE_DURACAO_MAXIMA`), e este pipeline não emenda clipes DENTRO de  │
 * │ uma chamada — então um vídeo mais longo precisa de VÁRIAS chamadas, cada  │
 * │ uma cobrindo um pedaço do roteiro.                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Por que por FRASE, e não por contagem bruta de caracteres ───────────────┐
 * │ Cortar no meio de uma frase produziria um bloco de animação cuja fala     │
 * │ (na narração, que roda DEPOIS, sobre o vídeo inteiro já concatenado)      │
 * │ atravessa a emenda entre dois clipes gerados por chamadas SEPARADAS do    │
 * │ motor — o corte ficaria em silêncio, mas na fronteira errada do texto.    │
 * │ Empacotar por frase garante que cada bloco tem folga (a régua de          │
 * │ caracteres já é pessimista) e nunca decide onde cortar uma frase.         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O que este módulo NÃO faz ────────────────────────────────────────────────┐
 * │ Não decide o TEXTO que vai a `animar()` — o Wan não recebe o roteiro,      │
 * │ recebe a Interpretação (`promptDeDirecao`), a mesma em todos os blocos.    │
 * │ O que este módulo decide é só QUANTOS blocos e de QUE DURAÇÃO cada um —    │
 * │ o texto de cada bloco fica no retorno só para log/depuração.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import {
  PIPELINE_DURACAO_MAXIMA,
  PIPELINE_MAX_CHARS_POR_DURACAO,
  PIPELINE_CHARS_PER_SECOND,
  PIPELINE_RITMO_DISPERSAO,
  escolherDuracao,
  type PipelineDuration,
} from "./pipelineDuration.js";

/**
 * 12 blocos de 10 s — o teto de duração do tier Normal com fracionamento.
 *
 * Era 8 blocos de 15s (`PIPELINE_DURACAO_MAXIMA` = 15) antes da migração para
 * `wan/v2.6/reference-to-video/flash` (item 2, 29/08), que só aceita 5 ou 10s
 * por bloco — ver `pipelineDuration.ts`. 12×10 preserva o MESMO teto de 120s
 * do tier Normal; o bloco ficou menor, não o vídeo.
 */
export const NORMAL_MAX_BLOCOS = 12;

/** `NORMAL_MAX_BLOCOS × PIPELINE_DURACAO_MAXIMA` — 120 s. Nunca digitado solto. */
export const NORMAL_MAX_TARGET_SECONDS = NORMAL_MAX_BLOCOS * PIPELINE_DURACAO_MAXIMA;

/**
 * O teto de caracteres para uma DURAÇÃO-ALVO qualquer do tier Normal (até
 * `NORMAL_MAX_TARGET_SECONDS`) — item 1 do fechamento do tier Normal
 * (28/08/2026). MESMA fórmula de `PIPELINE_MAX_CHARS_POR_DURACAO` (a régua
 * pessimista do ritmo, `PIPELINE_CHARS_PER_SECOND`/`PIPELINE_RITMO_DISPERSAO`),
 * generalizada para qualquer segundo em vez de só 5/10/15.
 *
 * É uma ESTIMATIVA — o teto EXATO, que de fato decide se um roteiro passa ou
 * é recusado, é `fracionarRoteiro()`: ele empacota por FRASE, e duas frases
 * de tamanhos diferentes que somam o mesmo total de caracteres podem
 * produzir números de blocos diferentes (uma frase de 141 caracteres sozinha
 * já fecha um bloco de 15s com 1 caractere de folga; a mesma folga somada de
 * frases menores rende mais). Esta função existe para a TELA poder mostrar
 * um número ANTES de o roteiro existir — o mesmo papel que
 * `PIPELINE_MAX_CHARS_POR_DURACAO` já cumpre para um bloco só.
 */
export function maxCharsForNormalTarget(targetSeconds: number): number {
  const segundos = Math.max(0, Math.min(targetSeconds, NORMAL_MAX_TARGET_SECONDS));
  return Math.floor((segundos * PIPELINE_CHARS_PER_SECOND) / (1 + PIPELINE_RITMO_DISPERSAO));
}

export class ScriptFractioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptFractioningError";
  }
}

export interface BlocoDeAnimacao {
  /** Só para log/depuração — `animar()` não consome este texto. */
  texto: string;
  duracaoEscolhida: PipelineDuration;
}

/**
 * Frases, por `.`, `!`, `?` ou `…` — o delimitador fica GRUDADO na frase
 * anterior. Não é um separador de linguagem natural completo (não trata
 * abreviações como "Sr." ou números decimais) — é uma aproximação
 * deliberadamente simples, documentada como limitação conhecida, não como
 * comportamento silencioso.
 */
function dividirEmFrases(script: string): string[] {
  const normalizado = script.trim();
  if (!normalizado) return [];
  const partes = normalizado.match(/[^.!?…]+[.!?…]*/g) ?? [normalizado];
  return partes.map((p) => p.trim()).filter(Boolean);
}

/**
 * Empacota as frases em blocos, cada um cabendo em `PIPELINE_DURACAO_MAXIMA`
 * (142 caracteres) — greedy: acumula frase a frase até a próxima não caber,
 * fecha o bloco com a MENOR duração que comporta o que foi acumulado
 * (`escolherDuracao`), e recomeça.
 *
 * RECUSA, nunca corta, quando uma frase ÚNICA excede o teto do maior bloco —
 * mesma regra que `conferirRoteiro` já aplicava ao roteiro inteiro antes
 * desta rodada, agora aplicada por frase.
 */
export function fracionarRoteiro(script: string): BlocoDeAnimacao[] {
  const tetoMaiorBloco = PIPELINE_MAX_CHARS_POR_DURACAO[PIPELINE_DURACAO_MAXIMA];
  const frases = dividirEmFrases(script);
  if (frases.length === 0) {
    throw new ScriptFractioningError(
      "fracionamento: o roteiro está vazio — não há frase nenhuma para virar bloco de animação.",
    );
  }

  const blocos: BlocoDeAnimacao[] = [];
  let acumulado = "";

  for (const frase of frases) {
    if (frase.length > tetoMaiorBloco) {
      throw new ScriptFractioningError(
        `fracionamento: uma frase de ${frase.length} caracteres excede o teto de ${tetoMaiorBloco} ` +
          `caracteres (${PIPELINE_DURACAO_MAXIMA} s, o maior bloco que o Wan aceita por chamada). ` +
          "Frase não é cortada no meio — encurte-a ou divida-a em duas frases.",
      );
    }

    const candidato = acumulado ? `${acumulado} ${frase}` : frase;
    if (candidato.length <= tetoMaiorBloco) {
      acumulado = candidato;
      continue;
    }

    // A frase nova não cabe no bloco atual: fecha o bloco com o que já
    // tinha (na MENOR duração que o comporta), e a frase que não coube
    // inaugura o próximo bloco.
    const duracaoDoFechado = escolherDuracao(acumulado.length);
    if (duracaoDoFechado === null) {
      // Impossível pela invariante do laço (acumulado sempre <= tetoMaiorBloco
      // até este ponto), mas TypeScript não sabe disso — falha nomeada em vez
      // de deixar `blocos.push` receber `null`.
      throw new ScriptFractioningError("fracionamento: estado interno inválido — bloco acumulado sem duração.");
    }
    blocos.push({ texto: acumulado, duracaoEscolhida: duracaoDoFechado });
    acumulado = frase;
  }

  if (acumulado) {
    const duracaoDoUltimo = escolherDuracao(acumulado.length);
    if (duracaoDoUltimo === null) {
      throw new ScriptFractioningError("fracionamento: estado interno inválido — último bloco sem duração.");
    }
    blocos.push({ texto: acumulado, duracaoEscolhida: duracaoDoUltimo });
  }

  if (blocos.length > NORMAL_MAX_BLOCOS) {
    const segundosNecessarios = blocos.reduce((soma, b) => soma + b.duracaoEscolhida, 0);
    throw new ScriptFractioningError(
      `fracionamento: o roteiro exige ${blocos.length} blocos (~${segundosNecessarios} s no pior caso), ` +
        `acima do teto de ${NORMAL_MAX_BLOCOS} blocos (${NORMAL_MAX_TARGET_SECONDS} s) do tier Normal. ` +
        "Nada foi pedido a fornecedor nenhum: a recusa acontece antes da primeira chamada paga. " +
        "Encurte o roteiro ou divida-o em mais de um vídeo.",
    );
  }

  return blocos;
}

/** Soma das durações escolhidas — o total de vídeo silencioso que os blocos produzem. */
export function segundosTotaisDosBlocos(blocos: BlocoDeAnimacao[]): number {
  return blocos.reduce((soma, b) => soma + b.duracaoEscolhida, 0);
}

/**
 * A JANELA de tempo (em segundos, acumulados) de um bloco — RODADA 3,
 * 29/08/2026. Existe para dar à tradução da Interpretação (`motion_prompt_en`)
 * algo concreto para segmentar: sem isto, pedir "divida em blocos" ao modelo
 * não tem contra o que os blocos se alinharem.
 */
export interface JanelaDeTempo {
  inicioSegundos: number;
  fimSegundos: number;
}

/**
 * As janelas de CADA bloco, cumulativas — bloco 0 começa em 0, bloco N começa
 * onde o bloco N-1 termina. Pura: não lê nada além do array recebido.
 */
export function janelasDosBlocos(blocos: BlocoDeAnimacao[]): JanelaDeTempo[] {
  let acumulado = 0;
  return blocos.map((bloco) => {
    const inicioSegundos = acumulado;
    acumulado += bloco.duracaoEscolhida;
    return { inicioSegundos, fimSegundos: acumulado };
  });
}

/** `mm:ss`, sempre 2 dígitos em cada metade — o formato que se pede ao tradutor. */
export function formatarJanela(janela: JanelaDeTempo): string {
  const mmss = (segundos: number) => {
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  return `[${mmss(janela.inicioSegundos)}-${mmss(janela.fimSegundos)}]`;
}

/**
 * EXPORTADA — ETAPA 3 (02/09/2026): `routes/videos.ts` reusa este MESMO
 * padrão logo após `translateDirection`, para recusar ANTES de qualquer
 * chamada paga (compor/narrar) se um marcador sobreviver por qualquer
 * motivo não previsto na condição de tomada única. Fonte única — o mesmo
 * padrão que `direcaoPorJanela` usa para fatiar, não uma cópia por texto.
 */
export const MARCADOR_DE_JANELA = /\[\d{1,2}:\d{2}-\d{1,2}:\d{2}\]/g;

/**
 * Fatiar a Interpretação TRADUZIDA em uma direção por bloco — BUG E, RODADA 3.
 *
 * ┌─ Por que existe ───────────────────────────────────────────────────────┐
 * │ Antes desta função, `promptDeDirecao` (o texto INTEIRO) era repetido    │
 * │ idêntico em todos os blocos de um vídeo Normal fracionado — o Wan do    │
 * │ bloco 2 recebia de novo "comece com os braços cruzados", uma instrução  │
 * │ de POSE INICIAL que não faz sentido para uma imagem de entrada que já   │
 * │ está no meio do gesto (o último quadro do bloco 1). MEDIDO como causa   │
 * │ plausível do Bug D (pose ignorada nos blocos 2+): o Wan recebe uma      │
 * │ instrução que contradiz a imagem que ele já tem, e alguma coisa cede.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * FRÁGIL DE PROPÓSITO: exige exatamente UM marcador `[mm:ss-mm:ss]` por
 * janela esperada, NA ORDEM. Não confere se os números do marcador batem com
 * a janela (a atribuição é por POSIÇÃO, não por valor) — um tradutor que
 * arredondar "00:05" para "0:05" não deve fazer a fatia inteira cair no
 * fallback por causa de um dígito. O que quebra o fallback é a CONTAGEM: nem
 * mais, nem menos marcadores que blocos, e nenhuma fatia vazia depois do
 * `trim()`.
 *
 * FALLBACK, sempre que a contagem não bate ou uma fatia sai vazia: devolve o
 * texto INTEIRO para TODOS os blocos — o comportamento de antes desta função,
 * nunca uma fatia inventada. Um tradutor que não seguiu o formato pedido
 * (falha de modelo, não de código) não pode fazer um bloco animar sem direção
 * nenhuma.
 */
export function direcaoPorJanela(textoTraduzido: string, janelas: JanelaDeTempo[]): string[] {
  const textoCompleto = textoTraduzido.trim();
  const fallback = () => janelas.map(() => textoCompleto);
  if (janelas.length === 0) return [];

  const marcadores = [...textoTraduzido.matchAll(MARCADOR_DE_JANELA)];
  if (marcadores.length !== janelas.length) return fallback();

  const fatias: string[] = [];
  for (let i = 0; i < marcadores.length; i++) {
    const inicio = marcadores[i].index! + marcadores[i][0].length;
    const fim = marcadores[i + 1]?.index ?? textoTraduzido.length;
    const fatia = textoTraduzido.slice(inicio, fim).trim();
    if (!fatia) return fallback();
    fatias.push(fatia);
  }
  return fatias;
}

/**
 * A direção do PRIMEIRO bloco apenas — item 4 da rodada de 29/08 (achado do
 * linter determinístico, não hipótese).
 *
 * ┌─ O BUG que esta função fecha ─────────────────────────────────────────────┐
 * │ `promptDeComposicaoPosicional` (videoScene.ts) recebe `direcaoTexto` para │
 * │ escrever a cláusula de POSE INICIAL da imagem composta — "a pose desta    │
 * │ imagem deve refletir só o INSTANTE ANTES da ação começar". Os DOIS únicos │
 * │ call sites que montam essa cláusula em produção (`promptDaComposicao` em  │
 * │ avatarProvider.ts, e `promptDaComposicaoDaLinha` em routes/videos.ts)     │
 * │ passavam a Interpretação TRADUZIDA INTEIRA — para um vídeo Normal         │
 * │ fracionado em 3 blocos, isso é o texto dos TRÊS planos, com os TRÊS       │
 * │ marcadores `[mm:ss-mm:ss]`, não só o primeiro. A cláusula de pose acabava │
 * │ dizendo ao nano-banana "o instante antes de X" citando X = os três planos │
 * │ emendados, em vez de só o plano 0. NUNCA testado por chamada real nesta   │
 * │ linha de trabalho: todo teste pago desta sessão chamou `runFalPipeline`   │
 * │ direto, com `promptDeComposicao` montado à mão já recortado no plano 0 —  │
 * │ nenhum passou pelos dois call sites acima com um roteiro de verdade       │
 * │ fracionado em mais de um bloco.                                          │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Sem marcadores (roteiro cabe num bloco só, Simples/Premium, ou o
 * fracionamento falhar por qualquer razão): devolve `direcaoTraduzida` SEM
 * alteração — byte a byte o comportamento de antes desta correção, para todo
 * vídeo que nunca teve o defeito. Reaproveita `direcaoPorJanela`, então herda
 * o MESMO fallback estrito dela (contagem de marcador não bate → texto
 * inteiro) em vez de inventar uma segunda regra de recorte.
 */
export function direcaoDoPrimeiroBloco(script: string, direcaoTraduzida: string): string {
  const texto = direcaoTraduzida.trim();
  if (!texto) return direcaoTraduzida;
  let blocos: BlocoDeAnimacao[];
  try {
    blocos = fracionarRoteiro(script);
  } catch {
    // O roteiro não fraciona (vazio, ou excede o teto) — a recusa de verdade
    // é responsabilidade de quem chama ANTES de chegar aqui; esta função só
    // decide se há o que recortar, e "não dá pra saber" cai no texto inteiro.
    return direcaoTraduzida;
  }
  if (blocos.length <= 1) return direcaoTraduzida;
  const janelas = janelasDosBlocos(blocos);
  const fatias = direcaoPorJanela(texto, janelas);
  return fatias[0] ?? direcaoTraduzida;
}
