/**
 * A TABELA DE ORQUESTRAÇÃO do caminho Wan (tier Normal) — ITEM 3, RODADA 3,
 * 29/08/2026. Escopo estrito: só o motor Wan (`corpoAnimarWan`,
 * `animarUmBloco`, o laço de múltiplos blocos em `animarNarrarSincronizar`,
 * todos em `falPipeline.ts`). Nenhuma linha aqui é lida pelo caminho do
 * Seedance/Premium — ver `corpoAnimarSeedance`, que continua lendo
 * `input.promptDeDirecao` direto, sem passar por este arquivo.
 *
 * ---------------------------------------------------------------------------
 * A CAUSA RAIZ COMUM AOS BUGS D, E, F e G
 *
 * Antes desta rodada, cada chamada externa do caminho Wan (compor, cada
 * bloco de animar, sincronizar) montava seu próprio payload isoladamente,
 * lendo campos soltos de `FalPipelineInput` — sem um lugar único que
 * declarasse, PARA CADA BLOCO, o que deveria ir a ele. Os quatro bugs abaixo
 * são sintomas dessa mesma ausência:
 *
 *   D — pose ignorada nos blocos 2+ (a mesma direção INTEIRA, incluindo a
 *       pose INICIAL do bloco 0, era repetida para um bloco cuja imagem de
 *       entrada já está no meio do gesto)
 *   E — motion_prompt idêntico em todo bloco (a causa direta de D)
 *   F — cenário redesenhado pela composição, em vez de preservado
 *   G — deriva de identidade: cada bloco 2+ anima a partir do ÚLTIMO QUADRO
 *       do bloco anterior, nunca da imagem composta original — MEDIDO nesta
 *       rodada (Item 1) como amplificação progressiva de textura de pele/
 *       rugas ao longo de vídeos fracionados; vídeos de bloco único não
 *       mostram a mesma deriva
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA RODADA FECHA, E O QUE FICA DOCUMENTADO SEM CONSERTO
 *
 * D e E — FECHADOS. `direcaoDoBloco` vem de `direcaoPorJanela`
 * (scriptFractioning.ts), que fatia `motion_prompt_en` pelos marcadores
 * `[mm:ss-mm:ss]` que a tradução agora produz SÓ quando o vídeo Normal
 * fraciona em mais de um bloco (`directionTranslation.ts`). Sem marcadores
 * (tradução falhou em segmentar, ou o vídeo não fraciona), o FALLBACK é o
 * texto inteiro repetido — o comportamento de antes desta rodada, nunca uma
 * fatia inventada.
 *
 * F — NÃO IMPLEMENTADO. O conserto teórico é uma cláusula explícita de
 * preservação de cenário no prompt de composição (`promptDeComposicaoPosicional`,
 * videoScene.ts) — mas essa função é COMPARTILHADA com o tier Premium (o
 * `compor()` da fal não distingue tier, só `animar()` distingue). Mudar o
 * texto ali muda a composição dos DOIS tiers pagos por fal, e só um teste
 * real (imagem composta de verdade, comparada ao cenário de referência)
 * confirma se a cláusula ajuda ou se o modelo já ignora o texto do mesmo
 * jeito que ignorava cenário/traje antes da amarração por posição (29/08,
 * ver `promptDeComposicaoPosicional`). Não implementado sem autorização.
 *
 * G — NÃO IMPLEMENTADO. O conserto óbvio — sempre animar a partir da imagem
 * composta ORIGINAL, nunca do último quadro — tem um efeito colateral real:
 * é o encadeamento de último quadro que dá continuidade de POSIÇÃO do corpo
 * entre blocos (sem ele, cada bloco reiniciaria da mesma pose estática do
 * bloco 0, um corte visível a cada 5-15s). Trocar uma deriva de identidade
 * por um corte de continuidade não é obviamente melhor — só um teste real,
 * comparando os dois vídeos lado a lado, decide. Não implementado sem
 * autorização.
 * ---------------------------------------------------------------------------
 */
import { janelasDosBlocos, direcaoPorJanela, type BlocoDeAnimacao, type JanelaDeTempo } from "./scriptFractioning.js";
import type { PipelineDuration } from "./pipelineDuration.js";
import { direcaoComExpressividade, type Expressiveness } from "../providers/videoScene.js";

/**
 * UMA LINHA da tabela — o que se sabe sobre o bloco de animação ANTES de
 * chamar o Wan por ele.
 *
 * `imagemDeEntrada` NÃO está aqui de propósito: ela só existe depois que o
 * bloco anterior TERMINOU (é o último quadro dele, extraído por
 * `imagemDeEntradaDoProximoBloco`) — não dá para declarar por antecipação
 * algo que depende de uma chamada paga anterior ainda não ter acontecido.
 * Essa mesma impossibilidade de antecipar é, em si, parte do que sustenta o
 * Bug G: a tabela não pode fingir uma fonte única de verdade que o desenho
 * sequencial do pipeline não permite.
 */
export interface PlanoDoBlocoWan {
  indice: number;
  janela: JanelaDeTempo;
  duracaoEscolhida: PipelineDuration;
  /** BUG D/E — a fatia de `motion_prompt_en` própria deste bloco. */
  direcaoDoBloco: string;
  /**
   * O texto de CENÁRIO+TRAJE que alimentou a composição — mesmo valor em
   * todo bloco (não varia por tempo, só por vídeo; `FalPipelineInput` não
   * guarda cenário e traje separados, só o `promptDeComposicao` já
   * combinado). Carregado aqui por completude da tabela (Item 3 pede as 5
   * colunas por chamada externa), não porque o corpo do Wan o leia — ele já
   * está dentro da imagem composta antes de o Wan nunca vê-lo como texto.
   * Ver BUG F no cabeçalho deste arquivo.
   */
  promptDeComposicaoUsado: string;
}

export interface PlanoDosBlocosWanInput {
  blocos: BlocoDeAnimacao[];
  /** `motion_prompt_en` — com ou sem marcadores `[mm:ss-mm:ss]`. SEM a
   * cláusula de Expressividade: ela entra DEPOIS do fatiamento, aqui dentro. */
  direcaoTraduzida: string;
  promptDeComposicaoUsado: string;
  /**
   * ITEM 2, RODADA 6 (30/08/2026) — antes desta correção, quem chamava
   * (`routes/videos.ts`) aplicava `direcaoComExpressividade` no texto
   * INTEIRO, ANTES de fatiar por janela. A cláusula ficava depois do
   * último marcador `[mm:ss-mm:ss]`, e `direcaoPorJanela` a atribuía só à
   * ÚLTIMA fatia — MEDIDO num vídeo real de 3 blocos (corrida `effe03c6`):
   * só o bloco 2 recebeu "natural, moderate facial expressiveness",
   * blocos 0 e 1 saíram sem nenhuma menção a expressividade. Aplicar aqui,
   * UMA VEZ POR BLOCO, depois de `direcaoPorJanela` já ter separado as
   * fatias, é o que garante que todo bloco carrega a MESMA cláusula —
   * nunca zero, nunca uma cópia perdida no meio do caminho.
   */
  expressiveness?: Expressiveness | null;
}

/**
 * A tabela inteira, para uma corrida — a ÚNICA função que decide a direção
 * de cada bloco. `corpoAnimarWan` deixa de ler `input.promptDeDirecao`
 * direto; quem chama monta este plano UMA VEZ e passa `direcaoDoBloco` do
 * item correspondente.
 */
export function montarPlanoDosBlocosWan(input: PlanoDosBlocosWanInput): PlanoDoBlocoWan[] {
  const janelas = janelasDosBlocos(input.blocos);
  const direcoes = direcaoPorJanela(input.direcaoTraduzida, janelas);
  return input.blocos.map((bloco, indice) => ({
    indice,
    janela: janelas[indice],
    duracaoEscolhida: bloco.duracaoEscolhida,
    direcaoDoBloco: direcaoComExpressividade(direcoes[indice], input.expressiveness),
    promptDeComposicaoUsado: input.promptDeComposicaoUsado,
  }));
}
