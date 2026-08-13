/**
 * ORQUESTRADOR do pipeline da fal — as cinco etapas, em série.
 *
 * ┌─ O que este arquivo é, e o que ele NÃO é ───────────────────────────────┐
 * │ É o BLOCO 4 PARTE 1. Não há rota, não há ramo em `generateVideo`, e     │
 * │ nenhum caminho de usuário chega aqui — `avatarProvider.ts:1007` continua │
 * │ despachando só heygen/did. Ligar isto é a parte 2.                      │
 * │                                                                          │
 * │ Exercitado apenas com `globalThis.fetch` substituído. Das cinco etapas,  │
 * │ nenhuma resposta REAL da fal foi observada — só o contrato de upload é   │
 * │ candidato a medição, e ele depende de uma chave que ainda não está no    │
 * │ banco (ver ESTADO.md §6).                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * AS CINCO ETAPAS, e por que nesta ordem:
 *
 *   1. COMPOR    `nano-banana-2/edit`  — rosto + traje + cenário → imagem-base.
 *   2. ANIMAR    `wan/v2.6/reference-to-video/flash` — imagem → vídeo MUDO.
 *   3. NARRAR    ElevenLabs TTS — o roteiro → áudio, com duração REAL medida.
 *   4. SINCRONIZAR `sync-lipsync/v2` — vídeo + áudio → o entregável.
 *   5. BIBLIOTECA — persistir o resultado.
 *
 * A VOZ É ENTRADA, não subproduto: ela entra pronta na etapa 4 e é preservada
 * por construção. É isso que torna a duração do entregável conhecida ANTES da
 * etapa mais cara, e é a razão de a etapa 3 não ser a primeira — o áudio só
 * precisa existir quando houver vídeo para casá-lo, e sintetizar antes de saber
 * se a composição deu certo gasta uma síntese à toa.
 */
import { randomUUID } from "node:crypto";
import { falPoll, falResult, falSubmit, falUpload } from "../providers/falClient.js";
import { synthesizeSpeech } from "../providers/voiceProvider.js";
import { logEvent } from "../log/safeLog.js";
import { PIPELINE_TETO_USD, PRECOS_FAL } from "../billing/providerCost.js";

// ---------------------------------------------------------------------------
// A RÉGUA DESTE PIPELINE — separada da do caminho HeyGen, DE PROPÓSITO
// ---------------------------------------------------------------------------

/**
 * Duração do vídeo, em segundos. FIXA nesta fase.
 *
 * O `wan/v2.6/reference-to-video/flash` produz um clipe de duração declarada, e
 * 10 s é o que esta fase pede. Não é estimativa nem teto: é o parâmetro.
 */
export const PIPELINE_TARGET_SECONDS = 10;

/**
 * 10,89 caracteres por segundo.
 *
 * ⚠️ **NÃO É a `CHARS_PER_SECOND` de `scriptDuration.ts` (12,8151) e NÃO se
 * mistura com `VOICE_SPEED` (0,85).** Aquela régua tem DOIS fatores e foi
 * derivada de uma geração da HeyGen a velocidade 1.0; esta é o número desta
 * fase, de um fator só. Multiplicar uma pela outra, ou "recalibrar" uma com o
 * fator da outra, produz um terceiro número que não descreve caminho nenhum —
 * é o erro que a anotação de `VOICE_SPEED` já teve de impedir uma vez.
 *
 * Não arredondar: 10,89 é o valor, não uma aproximação de 11.
 */
export const PIPELINE_CHARS_PER_SECOND = 10.89;

/**
 * 95 caracteres. É TETO, e ele é menor que a régua permitiria.
 *
 * 95 ÷ 10,89 = **8,7236 s** de fala num vídeo de 10 s — sobra deliberada. A
 * régua erra PARA CIMA em textos curtos (+29,5% medido, na de 12,8151), e um
 * roteiro que estoure o clipe faz a etapa 4 ter de escolher entre cortar a fala
 * e esticar o vídeo. Com folga, ela não escolhe.
 */
export const PIPELINE_MAX_CHARS = 95;

// Os preços e o teto vivem em `billing/providerCost.ts`: a guarda de custo
// cobra que todo número de dinheiro more lá, e duas cópias de uma medição
// divergem em silêncio.
export { PRECOS_FAL, PIPELINE_TETO_USD } from "../billing/providerCost.js";

/** Teto do laço de polling. Ver `aguardarConclusao`. */
export const PIPELINE_POLL_TIMEOUT_MS = 300_000;

/** Intervalo entre leituras de status. */
export const PIPELINE_POLL_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// OS DEFAULTS QUE NUNCA SE HERDA
// ---------------------------------------------------------------------------

/**
 * Todo campo abaixo é enviado EXPLICITAMENTE, mesmo quando o valor coincide com
 * o default do fornecedor.
 *
 * A razão não é desconfiança do default de hoje: é que ele é do FORNECEDOR, não
 * nosso, e muda sem aviso e sem release note. Um payload que omite o campo
 * aceita a mudança em silêncio — e este projeto já mediu o pior caso desse
 * padrão duas vezes (o `background` inerte sem `remove_background`; o
 * `expressiveness` aceito e ignorado pelo `avatar_iii`).
 *
 * Cada um, e o que a omissão custaria:
 *
 *  · `num_images` (nano-banana) — o default pode devolver MAIS de uma imagem, e
 *    todas são cobradas. Uma imagem é o que a etapa seguinte consome.
 *  · `resolution` (nano-banana) — a imagem-base define a resolução de tudo que
 *    vem depois; herdá-la é deixar o fornecedor escolher o custo das etapas 2 e 4.
 *  · `generate_audio` (Wan) — **o mais caro de todos.** Com o default ligado, o
 *    Wan sintetiza uma trilha PRÓPRIA, que é paga, e que a etapa 4 vai
 *    substituir pela nossa voz. Paga-se por áudio que nasce para ser descartado,
 *    e a etapa 4 recebe um vídeo que já tem som.
 *  · `resolution` (Wan) — o default de 1080p custa mais que 720p por segundo
 *    gerado, e nada nesta fase pede 1080p.
 *  · `sync_mode` (lipsync) — o default `cut_off` CORTA quando as durações
 *    divergem. Como a voz é a entrada preservada, cortar é exatamente o que não
 *    pode acontecer: perde-se o fim da fala num vídeo que já foi pago.
 */
export const DEFAULTS_NUNCA_HERDADOS = {
  "fal-ai/nano-banana-2/edit": ["num_images", "resolution"],
  "fal-ai/wan/v2.6/reference-to-video/flash": ["generate_audio", "resolution", "duration"],
  "fal-ai/sync-lipsync/v2": ["sync_mode"],
} as const;

export const ENDPOINT_COMPOR = "fal-ai/nano-banana-2/edit";
export const ENDPOINT_ANIMAR = "fal-ai/wan/v2.6/reference-to-video/flash";
export const ENDPOINT_SINCRONIZAR = "fal-ai/sync-lipsync/v2";

/**
 * `sync_mode` NÃO VERIFICADO: `loop` é o valor escolhido por eliminação, não por
 * medição. Nenhuma resposta real do `sync-lipsync/v2` foi observada, e a
 * documentação não diz o que ele faz quando o vídeo é MAIS LONGO que o áudio —
 * que é o caso desta fase (10 s de clipe para ~8,72 s de fala). O que se sabe é
 * o que `cut_off` faria no caso inverso, e por isso ele está fora.
 */
export const SYNC_MODE = "loop";

/** Resolução da imagem-base e do clipe. 720p, não o 1080p default do Wan. */
export const PIPELINE_RESOLUTION = "720p";

// ---------------------------------------------------------------------------
// O DIÁRIO — a persistência, injetada
// ---------------------------------------------------------------------------

export type EtapaDoPipeline = "compor" | "animar" | "narrar" | "sincronizar" | "biblioteca";

/**
 * Onde a corrida é registrada.
 *
 * Injetado, e não importado: o orquestrador precisa ser exercitável sem banco.
 * A implementação de produção é `falPipelineJournal.ts`; a guarda passa um
 * gravador em memória e observa a ORDEM em que os métodos são chamados.
 */
export interface DiarioDoPipeline {
  /** Abre a etapa. Devolve um id opaco usado nas gravações seguintes. */
  abrirEtapa(etapa: EtapaDoPipeline, ordem: number, vendor: string, endpointId: string | null): Promise<string>;
  /** O PONTEIRO para o trabalho pago. Chamado antes de qualquer interpretação. */
  gravarRequestId(stepId: string, requestId: string): Promise<void>;
  /** O corpo BRUTO, antes de qualquer parsing. */
  gravarRespostaCrua(stepId: string, raw: string): Promise<void>;
  fecharEtapa(stepId: string, status: "completed" | "failed", motivo?: string): Promise<void>;
}

export class FalPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FalPipelineError";
  }
}

export interface FalPipelineInput {
  apiKeyFal: string;
  apiKeyElevenLabs: string;
  /** Reusado, nunca clonado: clonar consome slot irreversível. */
  voiceId: string;
  script: string;
  /** A foto do rosto, já em bytes. */
  fotoBase: Buffer;
  fotoMimeType: string;
  /** Texto livre: traje e cenário. */
  promptDeComposicao: string;
  diario: DiarioDoPipeline;
  /** Sobrescrito só pela guarda; o produto usa o default. */
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  /** Teto de gasto PREVISTO. Default `PIPELINE_TETO_USD`. */
  tetoDeGastoUsd?: number;
  /**
   * Encerra a corrida DEPOIS desta etapa, sem disparar as seguintes.
   *
   * Existe para a sonda de contrato: cada etapa paga custa dinheiro real, e
   * medir o contrato de uma delas não deve obrigar a pagar as outras duas.
   */
  pararApos?: EtapaDoPipeline;
  /** Injetável para a guarda não esperar de verdade. */
  esperar?: (ms: number) => Promise<void>;
}

export interface FalPipelineResult {
  /** O que a corrida PREVIU gastar. Não é o cobrado — ver BLOCO 6. */
  gastoPrevistoUsd: number;
  /** Vazio quando a corrida parou antes da sincronia (`pararApos`). */
  videoUrl: string;
  audioDurationSeconds: number | null;
  requestIds: { compor: string; animar: string; sincronizar: string };
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * O roteiro cabe no clipe?
 *
 * Recusa ANTES de qualquer chamada: um roteiro grande demais só se descobriria
 * na etapa 4, com as etapas 1 e 2 já pagas.
 */
export function conferirRoteiro(script: string): { chars: number; segundosEstimados: number } {
  const chars = script.length;
  if (chars > PIPELINE_MAX_CHARS) {
    throw new FalPipelineError(
      `O roteiro tem ${chars} caracteres, acima do teto de ${PIPELINE_MAX_CHARS} desta fase ` +
        `(${PIPELINE_TARGET_SECONDS} s a ${PIPELINE_CHARS_PER_SECOND} car/s). Nada foi pedido a ` +
        "fornecedor nenhum: a recusa acontece antes da primeira chamada paga, porque um roteiro que " +
        "não cabe só apareceria na sincronia — com a imagem e o vídeo já pagos.",
    );
  }
  return { chars, segundosEstimados: chars / PIPELINE_CHARS_PER_SECOND };
}

/**
 * O laço de polling. Vive AQUI, e não no `falClient`.
 *
 * O cliente faz UMA leitura; o laço é de quem paga por ele, e por isso o teto
 * de tempo é explícito, é parâmetro, e entra no log com o número de tentativas.
 * Um laço escondido dentro do cliente esconderia de quem chama tanto o custo em
 * tempo quanto o fato de que ele pode desistir.
 *
 * Desistir NÃO é falha do trabalho: o `request_id` já está gravado, e o
 * resultado continua recuperável por ele. A mensagem diz isso, porque a
 * alternativa é alguém reprocessar — e pagar de novo — algo que está pronto.
 */
export async function aguardarConclusao(
  apiKey: string,
  endpointId: string,
  requestId: string,
  opcoes: { timeoutMs: number; intervalMs: number; esperar: (ms: number) => Promise<void> },
): Promise<void> {
  const limite = Date.now() + opcoes.timeoutMs;
  let tentativas = 0;

  for (;;) {
    const { status } = await falPoll(apiKey, endpointId, requestId);
    tentativas += 1;

    if (status === "completed") {
      logEvent("info", "fal_pipeline_poll_concluido", { endpointId, requestId, tentativas });
      return;
    }
    if (status === "failed") {
      throw new FalPipelineError(
        `fal: ${endpointId} reportou FALHA no request ${requestId} após ${tentativas} leitura(s).`,
      );
    }

    if (Date.now() >= limite) {
      logEvent("warn", "fal_pipeline_poll_esgotado", {
        endpointId,
        requestId,
        tentativas,
        timeoutMs: opcoes.timeoutMs,
      });
      throw new FalPipelineError(
        `fal: o teto de ${opcoes.timeoutMs} ms de espera se esgotou em ${endpointId} depois de ` +
          `${tentativas} leitura(s) de status. O trabalho NÃO foi perdido e NÃO deve ser refeito: ` +
          `ele já foi aceito e já custa, e o request_id ${requestId} está gravado — a recuperação é ` +
          "por ele. Repetir a etapa paga duas vezes pelo mesmo resultado.",
      );
    }
    await opcoes.esperar(opcoes.intervalMs);
  }
}

/**
 * Submete, guarda o ponteiro, espera, e devolve a saída CRUA já registrada.
 *
 * A ordem aqui é a propriedade que a guarda G-4 mede: `gravarRespostaCrua`
 * acontece ANTES de qualquer leitura de campo do corpo. Interpretar primeiro e
 * gravar depois deixaria toda resposta de forma inesperada sem registro — que é
 * exatamente a resposta que se precisa ler para descobrir o que mudou.
 */
/**
 * O PORTEIRO do teto. Roda ANTES de cada submissão paga, nunca depois.
 *
 * Depois da submissão o dinheiro já saiu: um teto conferido no fim é um
 * relatório, não um freio. A conta é sempre do ACUMULADO — a etapa 4 pode
 * caber sozinha e ainda assim estourar o orçamento somada às anteriores.
 */
function autorizarGasto(
  gastoAcumuladoUsd: number,
  custoDestaEtapaUsd: number,
  tetoUsd: number,
  etapa: EtapaDoPipeline,
): number {
  const previsto = gastoAcumuladoUsd + custoDestaEtapaUsd;
  if (previsto > tetoUsd) {
    throw new FalPipelineError(
      `TETO DE GASTO: a etapa "${etapa}" custaria US$ ${custoDestaEtapaUsd.toFixed(2)} e levaria o ` +
        `previsto desta corrida a US$ ${previsto.toFixed(2)}, acima do teto de US$ ${tetoUsd.toFixed(2)}. ` +
        "Nada foi pedido ao fornecedor nesta etapa. As etapas anteriores JA foram pagas e os request_id " +
        "delas estao gravados: o resultado parcial e recuperavel e nao deve ser refeito.",
    );
  }
  logEvent("info", "fal_pipeline_gasto_autorizado", {
    etapa,
    custoDestaEtapaUsd,
    previstoAcumuladoUsd: Number(previsto.toFixed(4)),
    tetoUsd,
  });
  return previsto;
}

async function etapaNaFal(
  input: FalPipelineInput,
  etapa: EtapaDoPipeline,
  ordem: number,
  endpointId: string,
  corpo: Record<string, unknown>,
): Promise<{ requestId: string; saida: any }> {
  const stepId = await input.diario.abrirEtapa(etapa, ordem, "fal", endpointId);

  const { requestId } = await falSubmit(input.apiKeyFal, endpointId, corpo, async (id) => {
    // O PONTEIRO primeiro. `falSubmit` chama isto antes do próprio
    // processamento local dele, e o diário o persiste antes do nosso.
    await input.diario.gravarRequestId(stepId, id);
  });

  await aguardarConclusao(input.apiKeyFal, endpointId, requestId, {
    timeoutMs: input.pollTimeoutMs ?? PIPELINE_POLL_TIMEOUT_MS,
    intervalMs: input.pollIntervalMs ?? PIPELINE_POLL_INTERVAL_MS,
    esperar: input.esperar ?? dormir,
  });

  const saida = await falResult(input.apiKeyFal, endpointId, requestId);

  // CRU ANTES DE INTERPRETADO. Nenhum campo de `saida` foi lido até aqui.
  await input.diario.gravarRespostaCrua(stepId, JSON.stringify(saida));

  await input.diario.fecharEtapa(stepId, "completed");
  return { requestId, saida };
}

export async function runFalPipeline(input: FalPipelineInput): Promise<FalPipelineResult> {
  const { chars, segundosEstimados } = conferirRoteiro(input.script);
  logEvent("info", "fal_pipeline_iniciado", {
    chars,
    segundosEstimados,
    targetSeconds: PIPELINE_TARGET_SECONDS,
    charsPerSecond: PIPELINE_CHARS_PER_SECOND,
  });

  // --- 1. COMPOR -----------------------------------------------------------
  const fotoUrl = await falUpload(input.apiKeyFal, input.fotoBase, input.fotoMimeType);
  const teto = input.tetoDeGastoUsd ?? PIPELINE_TETO_USD;
  let gastoPrevistoUsd = 0;

  gastoPrevistoUsd = autorizarGasto(gastoPrevistoUsd, PRECOS_FAL.comporUsd, teto, "compor");
  const composicao = await etapaNaFal(input, "compor", 1, ENDPOINT_COMPOR, {
    prompt: input.promptDeComposicao,
    image_urls: [fotoUrl],
    // Explícitos, sempre. Ver DEFAULTS_NUNCA_HERDADOS.
    num_images: 1,
    resolution: PIPELINE_RESOLUTION,
  });
  const imagemUrl = composicao.saida?.images?.[0]?.url;
  if (!imagemUrl) {
    throw new FalPipelineError(
      "fal: a composição concluiu sem devolver imagem. O corpo bruto está gravado na etapa — o " +
        "trabalho foi feito e provavelmente cobrado, então isto é contrato quebrado, não erro de geração.",
    );
  }

  // --- 2. ANIMAR -----------------------------------------------------------
  if (input.pararApos === "compor") return pararAqui("compor", gastoPrevistoUsd);

  gastoPrevistoUsd = autorizarGasto(
    gastoPrevistoUsd,
    PRECOS_FAL.animarUsdPorSegundo * PIPELINE_TARGET_SECONDS,
    teto,
    "animar",
  );
  const animacao = await etapaNaFal(input, "animar", 2, ENDPOINT_ANIMAR, {
    prompt: input.promptDeComposicao,
    image_url: String(imagemUrl),
    // `generate_audio: false` é o mais caro de omitir: o default sintetiza uma
    // trilha paga que a etapa 4 descartaria.
    generate_audio: false,
    resolution: PIPELINE_RESOLUTION,
    duration: PIPELINE_TARGET_SECONDS,
  });
  const videoMudoUrl = animacao.saida?.video?.url;
  if (!videoMudoUrl) {
    throw new FalPipelineError(
      "fal: a animação concluiu sem devolver vídeo. O corpo bruto está gravado na etapa.",
    );
  }

  // --- 3. NARRAR -----------------------------------------------------------
  //
  // A voz é REUSADA (`input.voiceId`), nunca clonada: clonar consome um slot
  // irreversível, e a conta já está em 10/10 pela nossa régua.
  const narracaoStep = await input.diario.abrirEtapa("narrar", 3, "elevenlabs", null);
  const fala = await synthesizeSpeech(input.apiKeyElevenLabs, input.voiceId, input.script);
  await input.diario.gravarRespostaCrua(
    narracaoStep,
    JSON.stringify({ bytes: fala.audio.length, durationSeconds: fala.durationSeconds, source: fala.source }),
  );
  await input.diario.fecharEtapa(narracaoStep, "completed");
  const audioUrl = await falUpload(input.apiKeyFal, fala.audio, "audio/mpeg");

  // --- 4. SINCRONIZAR ------------------------------------------------------
  if (input.pararApos === "narrar") return pararAqui("narrar", gastoPrevistoUsd);

  // O custo depende da duração REAL do áudio, que agora é conhecida. Quando a
  // medição falha, a estimativa pela régua entra no lugar — e para o TETO ela
  // tem de ser a MAIOR das duas, senão o freio afrouxa justamente no caso em
  // que se sabe menos.
  gastoPrevistoUsd = autorizarGasto(
    gastoPrevistoUsd,
    PRECOS_FAL.sincronizarUsdPorSegundoDeAudio * Math.max(fala.durationSeconds ?? 0, segundosEstimados),
    teto,
    "sincronizar",
  );
  const sincronia = await etapaNaFal(input, "sincronizar", 4, ENDPOINT_SINCRONIZAR, {
    video_url: String(videoMudoUrl),
    audio_url: audioUrl,
    // `cut_off` cortaria a fala, que é a entrada preservada deste pipeline.
    sync_mode: SYNC_MODE,
  });
  const videoFinalUrl = sincronia.saida?.video?.url;
  if (!videoFinalUrl) {
    throw new FalPipelineError(
      "fal: a sincronia concluiu sem devolver vídeo. O corpo bruto está gravado na etapa — as três " +
        "etapas pagas aconteceram, então este é o pior momento para perder o corpo da resposta.",
    );
  }

  // --- 5. BIBLIOTECA -------------------------------------------------------
  const biblioteca = await input.diario.abrirEtapa("biblioteca", 5, "eckko", null);
  await input.diario.gravarRespostaCrua(biblioteca, JSON.stringify({ videoUrl: videoFinalUrl }));
  await input.diario.fecharEtapa(biblioteca, "completed");

  return {
    gastoPrevistoUsd,
    videoUrl: String(videoFinalUrl),
    audioDurationSeconds: fala.durationSeconds,
    requestIds: {
      compor: composicao.requestId,
      animar: animacao.requestId,
      sincronizar: sincronia.requestId,
    },
  };
}

/**
 * Encerra a corrida numa etapa intermediária, a pedido da sonda.
 *
 * `videoUrl` vazio: quem chamou PEDIU para parar, então "sem vídeo" é o
 * resultado esperado e não uma falha — lançar aqui faria a sonda de contrato
 * parecer erro.
 */
function pararAqui(etapa: EtapaDoPipeline, gastoPrevistoUsd: number): FalPipelineResult {
  logEvent("info", "fal_pipeline_parou_a_pedido", { etapa, gastoPrevistoUsd });
  return {
    gastoPrevistoUsd,
    videoUrl: "",
    audioDurationSeconds: null,
    requestIds: { compor: "", animar: "", sincronizar: "" },
  };
}

/** Id de corrida, para o diário de produção. */
export function novoRunId(): string {
  return randomUUID();
}
