/**
 * NENHUM `POST /v3/videos` SAI COM DURAÇÃO DE ÁUDIO ACIMA DO TETO.
 *
 * ┌─ O defeito que esta guarda fecha ───────────────────────────────────────┐
 * │ Em `generateVideoHeygen`, `requireAudio` devolve a duração REAL da fala  │
 * │ — medida pelos timestamps do ElevenLabs — e poucas linhas depois sai o   │
 * │ `POST /v3/videos`, que custa dólares. Entre as duas NÃO havia um único   │
 * │ `if` sobre esse número: ele existia, exato, numa variável, e ninguém o   │
 * │ consultava.                                                             │
 * │                                                                         │
 * │ Os portões que existiam julgam a ESTIMATIVA do texto                    │
 * │ (`CONFIRM_ABOVE_SECONDS`, `MAX_SCRIPT_SECONDS` no portão de prontidão), │
 * │ e a estimativa sai de uma régua de um ponto medido que erra +29,5% em    │
 * │ textos curtos. Ou seja: o número exato e o portão estavam em lados       │
 * │ opostos da chamada paga.                                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A verificação é ANCORADA NO USO, e essa é a parte que importa: ela não procura
 * o texto do `if` no arquivo — ela chama `generateVideo()` com `globalThis.fetch`
 * substituído por um gravador e conta quantos `POST` chegaram a
 * `api.heygen.com/v3/videos`. Uma guarda que casasse o trecho continuaria verde
 * com o portão movido para depois da chamada, que é exatamente o defeito.
 *
 * As DUAS metades são obrigatórias:
 *
 *  · acima do teto → a chamada de vídeo NÃO acontece, e o erro é o nosso
 *    (`AudioTooLongError`), não um erro de fornecedor;
 *  · abaixo do teto → a chamada de vídeo ACONTECE. Sem este contraponto, um
 *    portão que recusasse tudo passaria no arnês sem distinguir nada — e
 *    recusar tudo é pior que não ter portão: apaga o produto.
 *
 * E uma terceira, sobre ORDEM: a duração medida é persistida ANTES do `POST`.
 * O callback `onAudioMeasured` é gravado na sequência junto com as chamadas de
 * rede, então "gravou depois de cobrar" e "não gravou" são estados distintos e
 * ambos reprovam.
 *
 * ┌─ Custo: ZERO ───────────────────────────────────────────────────────────┐
 * │ Nenhuma rede (o `fetch` é substituído nos dois vendors), nenhum vídeo,   │
 * │ nenhuma clonagem. O teto de sessão live é zerado na entrada e na saída,  │
 * │ e os dois arquivos que `processVoiceAudio` grava em `uploads/` são        │
 * │ apagados no `finally` — o arnês exige a árvore limpa entre mutantes.     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { config } from "../config.js";
import { MAX_SCRIPT_SECONDS } from "../services/video/scriptDuration.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import { resetLiveGenerationCount } from "../services/providers/liveGuard.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "duração real: nenhum POST de vídeo sai acima do teto",
    name: "o portão sobre a duração medida é removido",
    kind: "obvio",
    // O mutante MÍNIMO: as três linhas do portão saem e o resto do caminho fica
    // idêntico. É o estado em que o código passou todo este tempo — a medição
    // exata numa variável, a chamada paga logo abaixo, e nada entre as duas.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "  if (audio.durationSeconds != null && audio.durationSeconds > MAX_SCRIPT_SECONDS) {\n" +
      "    throw new AudioTooLongError(audio.durationSeconds, MAX_SCRIPT_SECONDS);\n" +
      "  }",
    replace: "  void audio.durationSeconds;",
    expect: "um POST /v3/videos saiu com áudio de",
  },
  {
    guard: "duração real: nenhum POST de vídeo sai acima do teto",
    name: "o portão passa a julgar a estimativa do texto em vez da medição",
    kind: "esperto",
    // ESPERTO porque tudo continua parecendo certo: há um portão, ele lança o
    // NOSSO erro, e compara contra o mesmo teto — até reprova roteiro gigante. O
    // que muda é a FONTE do número: volta a ser a estimativa do texto, que é a
    // régua que erra e que os outros dois portões já aplicam. O caso que este
    // portão existe para pegar (a estimativa passa, a fala real estoura) volta a
    // atravessar até o POST.
    //
    // O bloco INTEIRO é substituído, e o `?? 0` não é enfeite: sem o
    // `!= null` acima o TypeScript deixa de estreitar `durationSeconds`, o `tsc`
    // reprova antes de a guarda opinar, e o arnês devolveria AMBÍGUO — medido
    // nesta rodada, e o mesmo tropeço já registrado em `checkScriptLimitPolicy`.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "  if (audio.durationSeconds != null && audio.durationSeconds > MAX_SCRIPT_SECONDS) {\n" +
      "    throw new AudioTooLongError(audio.durationSeconds, MAX_SCRIPT_SECONDS);\n" +
      "  }",
    replace:
      "  if (estimateSeconds(countWords(input.script)) > MAX_SCRIPT_SECONDS) {\n" +
      "    throw new AudioTooLongError(audio.durationSeconds ?? 0, MAX_SCRIPT_SECONDS);\n" +
      "  }",
    expect: "um POST /v3/videos saiu com áudio de",
  },
  {
    guard: "duração real: a medição é gravada antes de a chamada paga sair",
    name: "a gravação da duração medida volta para depois do POST",
    kind: "esperto",
    // O callback continua sendo chamado, com o mesmo número, e a linha do vídeo
    // termina com a duração gravada — tudo que uma guarda de "a duração é
    // persistida?" verificaria continua verdade. Só a ORDEM muda, e com ela o
    // que sobra quando o caminho é interrompido: uma recusa no portão, ou um
    // processo morto entre as duas chamadas, perde uma medição já paga.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "  if (input.onAudioMeasured) {\n" +
      "    await input.onAudioMeasured({ seconds: audio.durationSeconds, source: audio.source });\n" +
      "  }",
    replace: "  const gravarDepois = input.onAudioMeasured;",
    expect: "a duração medida não foi gravada ANTES",
  },
];

export interface AudioDurationGateResult {
  failures: string[];
  notes: string[];
}

/**
 * Tenant de mentira, FIXO, e ele tem uma função: `processVoiceAudio` grava o
 * áudio bruto em `uploads/<tenant>/` mesmo com o tratamento desligado, e é este
 * diretório que o `finally` apaga. Um id aleatório deixaria um diretório novo
 * por execução, e o arnês roda o gate 200+ vezes.
 */
const TENANT_DA_PROVA = "00000000-0000-4000-8000-0000000a0d61";

/** Segundos claramente acima e claramente abaixo do teto. */
const ACIMA = MAX_SCRIPT_SECONDS + 40;
const ABAIXO = 17.5;

/** O que aconteceu, na ordem em que aconteceu. */
type Passo = "gravou_duracao" | "sintetizou_voz" | "subiu_asset" | "POST_video";

interface Corrida {
  passos: Passo[];
  erro: unknown;
  segundosGravados: number | null;
}

/**
 * Roda o caminho REAL de geração com `fetch` substituído, e devolve a sequência
 * de passos observada.
 *
 * O `fetch` responde como os fornecedores respondem — inclusive o
 * `/with-timestamps` do ElevenLabs, cuja última marca de caractere é a duração
 * que se quer simular. É por isso que a duração entra por aqui e não por um
 * parâmetro: assim ela percorre `synthesizeSpeech` → `requireAudio` → o portão
 * exatamente como percorre em produção, e a guarda mede o caminho, não a função.
 */
async function correr(segundosDoAudio: number): Promise<Corrida> {
  const { generateVideo } = await import("../services/providers/avatarProvider.js");
  const passos: Passo[] = [];
  let segundosGravados: number | null = null;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown) => {
    const url = String(
      typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada,
    );

    if (url.includes("api.elevenlabs.io") && url.includes("/with-timestamps")) {
      passos.push("sintetizou_voz");
      // Um mp3 mínimo em base64: o conteúdo não importa (o tratamento está
      // desligado e o upload é substituído), a DURAÇÃO é que atravessa o
      // caminho, e ela vem da última marca de caractere.
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from("prova-de-audio").toString("base64"),
          alignment: { character_end_times_seconds: [0.1, segundosDoAudio] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.heygen.com/v3/assets")) {
      passos.push("subiu_asset");
      return new Response(JSON.stringify({ data: { asset_id: "asset-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("api.heygen.com/v3/videos")) {
      // A ÚNICA linha que custa dinheiro em produção. Chegar aqui com áudio
      // acima do teto é a reprovação.
      passos.push("POST_video");
      return new Response(JSON.stringify({ data: { video_id: "job-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`fetch inesperado na prova do portão de duração: ${url}`);
  }) as typeof fetch;

  let erro: unknown = null;
  try {
    await generateVideo({
      apiKey: "chave-irrelevante-fetch-substituido",
      vendor: "heygen",
      providerAvatarId: "avatar-da-prova",
      script: "Roteiro da prova. O comprimento não decide nada aqui — a duração vem do áudio.",
      elevenLabsApiKey: "chave-irrelevante-fetch-substituido",
      voiceId: "voz-da-prova",
      tenantId: TENANT_DA_PROVA,
      // DESLIGADO de propósito: o tratamento chamaria ffmpeg, que não é o que
      // esta guarda mede e custaria segundos em cada um dos mutantes.
      audioTreatmentEnabled: false,
      audioTreatmentTargetLufs: -16,
      format: resolveVideoFormat("youtube"),
      supportedEngines: null,
      engineEnabled: false,
      scene: null,
      engineChoice: null,
      captions: false,
      onAudioMeasured: async ({ seconds }) => {
        passos.push("gravou_duracao");
        segundosGravados = seconds;
      },
    });
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  return { passos, erro, segundosGravados };
}

export async function checkAudioDurationGatePolicy(): Promise<AudioDurationGateResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const { AudioTooLongError } = await import("../services/providers/avatarProvider.js");
  const modoOriginal = process.env.PROVIDER_MODE;
  const tetoOriginal = process.env.PROVIDER_LIVE_MAX_GENERATIONS;

  let acima: Corrida;
  let abaixo: Corrida;
  try {
    // `live` porque em `fixture` o caminho inteiro é desviado e nada disto
    // acontece — e é o caminho de `live` que gasta dinheiro. Nenhuma rede sai:
    // o `fetch` está substituído.
    process.env.PROVIDER_MODE = "live";
    // O teto de sessão é do PROCESSO, e este check roda no mesmo processo que as
    // outras guardas. Zerado antes e depois para não emprestar nem tomar
    // unidades de quem já mediu o teto (`checkLiveBudgetPolicy`).
    process.env.PROVIDER_LIVE_MAX_GENERATIONS = "8";
    resetLiveGenerationCount();

    acima = await correr(ACIMA);
    abaixo = await correr(ABAIXO);
  } finally {
    resetLiveGenerationCount();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
    if (tetoOriginal === undefined) delete process.env.PROVIDER_LIVE_MAX_GENERATIONS;
    else process.env.PROVIDER_LIVE_MAX_GENERATIONS = tetoOriginal;
    // O áudio bruto que `processVoiceAudio` grava mesmo desligado. Sem esta
    // limpeza cada execução do gate deixaria dois arquivos, e o arnês roda o
    // gate uma vez por mutante.
    await rm(path.join(config.uploadsDir, TENANT_DA_PROVA), { recursive: true, force: true }).catch(
      () => {},
    );
  }

  // ---------------------------------------------------------------------------
  // 1. ACIMA DO TETO: a chamada que cobra NÃO acontece.
  // ---------------------------------------------------------------------------
  if (acima.passos.includes("POST_video")) {
    failures.push(
      `duração real: um POST /v3/videos saiu com áudio de ${ACIMA} s, acima do teto de ` +
        `${MAX_SCRIPT_SECONDS} s. A duração REAL é medida pelo ElevenLabs e está numa variável poucas ` +
        "linhas antes da chamada que custa dólares (3 unidades por segundo inteiro, US$ 0,05/s) — sem " +
        "conferi-la ali, o número exato e o portão ficam em lados opostos do débito, e os portões que " +
        `sobram julgam a ESTIMATIVA do texto, que erra +29,5% em textos curtos. Passos observados: ` +
        `${acima.passos.join(" → ") || "(nenhum)"}.`,
    );
  }
  if (!(acima.erro instanceof AudioTooLongError)) {
    failures.push(
      "duração real: áudio acima do teto não produziu `AudioTooLongError` — veio " +
        `${acima.erro === null ? "sucesso" : JSON.stringify(String(acima.erro).slice(0, 160))}. ` +
        "O erro precisa ser NOSSO e não de fornecedor: empacotado como falha de vendor, o cliente recebe " +
        '"não foi possível concluir a operação no serviço de vídeo" e vai procurar defeito numa HeyGen ' +
        "que sequer soube da tentativa — o defeito já medido na primeira passada live.",
    );
  }

  // ---------------------------------------------------------------------------
  // 2. ABAIXO DO TETO: o produto continua funcionando.
  //
  // Sem este contraponto, um portão que recusasse tudo passaria no item 1.
  // ---------------------------------------------------------------------------
  if (!abaixo.passos.includes("POST_video")) {
    failures.push(
      `duração real: o portão barrou um áudio de ${ABAIXO} s, DENTRO do teto de ${MAX_SCRIPT_SECONDS} s — ` +
        `nenhum POST /v3/videos saiu. Passos observados: ${abaixo.passos.join(" → ") || "(nenhum)"}. ` +
        "Um portão que recusa o caso normal não protege o dinheiro: apaga o produto.",
    );
  }
  if (abaixo.erro !== null) {
    failures.push(
      `duração real: áudio de ${ABAIXO} s levantou ${JSON.stringify(String(abaixo.erro).slice(0, 160))}. ` +
        "Dentro do teto a geração tem de seguir.",
    );
  }

  // ---------------------------------------------------------------------------
  // 3. A MEDIÇÃO É GRAVADA ANTES DE A CHAMADA PAGA SAIR.
  //
  // Conferido pela ORDEM, e não pela presença: gravar depois do POST também
  // "grava a duração", e é o comportamento anterior a este bloco — a medição
  // vivia numa variável até o `UPDATE` pós-resposta, então toda interrupção no
  // meio perdia um número que já tinha sido pago.
  // ---------------------------------------------------------------------------
  for (const [rotulo, corrida] of [
    ["acima do teto", acima],
    ["dentro do teto", abaixo],
  ] as const) {
    const iGravou = corrida.passos.indexOf("gravou_duracao");
    const iPost = corrida.passos.indexOf("POST_video");
    if (iGravou === -1) {
      failures.push(
        `duração real: a duração medida não foi gravada ANTES da chamada paga (${rotulo}): a gravação ` +
          `não aconteceu. Passos: ${corrida.passos.join(" → ") || "(nenhum)"}. A medição por timestamps ` +
          "do ElevenLabs é o único número exato do fluxo, e ela já foi paga quando chega aqui.",
      );
    } else if (iPost !== -1 && iGravou > iPost) {
      failures.push(
        `duração real: a duração medida não foi gravada ANTES da chamada paga (${rotulo}): a ordem foi ` +
          `${corrida.passos.join(" → ")}. Gravar depois de cobrar devolve o defeito anterior — uma ` +
          "recusa, ou um processo morto no meio, perde a medição inteira.",
      );
    }
  }
  if (acima.segundosGravados !== ACIMA) {
    failures.push(
      `duração real: a duração gravada (${JSON.stringify(acima.segundosGravados)}) não é a medida ` +
        `(${ACIMA} s) no caso recusado. É justamente na recusa que o número importa: ele explica por que ` +
        "a geração não saiu, e é o que permite conferir a régua da estimativa contra a medição.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      `  duração real: teto de ${MAX_SCRIPT_SECONDS} s conferido sobre a MEDIÇÃO — ${ACIMA} s aborta ` +
        `antes do POST (${acima.passos.join(" → ")}), ${ABAIXO} s segue até o POST ` +
        `(${abaixo.passos.join(" → ")})`,
    );
    notes.push(
      "  duração real: a medição é gravada antes da chamada paga nos dois casos, com o valor medido",
    );
  }

  return { failures, notes };
}
