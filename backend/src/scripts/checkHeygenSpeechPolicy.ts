/**
 * B2+B5, BLOCO HEYGEN-SIMPLES-1 (02/09/2026) — TTS e clonagem de voz
 * NATIVOS da HeyGen.
 *
 * `POST /v3/voices/speech` sintetiza fala DIRETO na HeyGen e devolve
 * `duration`/`audio_url` de forma SÍNCRONA (schema lido por doc pública,
 * developers.heygen.com/docs/voices/speech — WebFetch, 02/09/2026; NÃO
 * reconfirmado por chamada real, a rota está nas proibidas desta rodada).
 * Existe para dar ao caminho de voz HeyGen nativa a MESMA propriedade que o
 * ElevenLabs já dá via `requireAudio`: a duração do vídeo é conhecida ANTES
 * da chamada cara, medida — não estimada pela régua de caracteres.
 *
 * `POST /v3/voices/clone`/`GET /v3/voices/{id}`/`DELETE /v3/voices/{id}`
 * (B5) são o outro lado do mesmo caminho: criar a voz que `speech` depois
 * usa. Mesma proibição de chamada real (`/v3/voices/clone` está na lista).
 *
 * Sete coisas medidas aqui:
 *
 * 1. `synthesizeSpeechHeygen` monta o corpo certo (`text`/`voice_id`
 *    sempre; `speed`/`locale` só quando fornecidos) e recusa uma resposta
 *    sem `audio_url`/`duration` numérico — em vez de devolver `undefined`
 *    silencioso, que atravessaria como `NaN`/`"undefined"` até o corpo do
 *    vídeo.
 * 2. `requestSpeechAndRecordUsage` grava o consumo com o vendor/endpoint
 *    certos, e NUNCA com custo zero (o preço não é documentado nem medido —
 *    `null`, não `0`, é a diferença entre "não sabemos" e "foi de graça",
 *    mesma regra de `custoConhecidoUsd` em `providerCost.ts`).
 * 3. O modo `audio_url` em `buildHeygenVideoPayload` (B1) entra no corpo
 *    quando fornecido, e vence `voice_id` quando os dois estão presentes —
 *    sintetizar duas vezes (uma para medir, outra dentro do vídeo) pagaria
 *    a síntese em dobro por engano de configuração.
 * 4. `cloneVoiceHeygen` monta `audio:{type:"asset_id",asset_id}` e
 *    `voice_name` sempre; `language`/`remove_background_noise` só quando
 *    fornecidos; recusa uma resposta sem `voice_clone_id`.
 * 5. `readHeygenVoiceCloneStatus` mapeia os quatro nomes conhecidos
 *    ("pending"/"processing"/"complete"/"failed", com "completed" também
 *    aceito — as duas fontes lidas discordam na grafia) e trata qualquer
 *    outro valor como "processing", NUNCA como pronto — declarar pronto por
 *    engano deixaria a voz escolhível antes de existir no fornecedor.
 * 6. `deleteVoiceHeygen` chama o DELETE e trata 404 (voz já apagada) como
 *    sucesso — o efeito desejado já vale.
 * 7. `countHeygenVoiceSlots` devolve o TAMANHO da listagem real (nunca uma
 *    constante local) e recusa uma resposta cuja `data` não seja um array.
 */
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import {
  buildHeygenVideoPayload,
  synthesizeSpeechHeygen,
  requestSpeechAndRecordUsage,
  cloneVoiceHeygen,
  readHeygenVoiceCloneStatus,
  deleteVoiceHeygen,
  countHeygenVoiceSlots,
  AvatarProviderError,
} from "../services/providers/avatarProvider.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";

export interface HeygenSpeechCheckResult {
  failures: string[];
  notes: string[];
}

const BASE = {
  format: resolveVideoFormat("youtube"),
  supportedEngines: null,
  engineEnabled: false,
  engineChoice: null,
} as const;

export async function checkHeygenSpeechPolicy(): Promise<HeygenSpeechCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. synthesizeSpeechHeygen — corpo enviado e parsing da resposta.
  // ---------------------------------------------------------------------------
  const fetchOriginal = globalThis.fetch;
  const modoOriginal1 = process.env.PROVIDER_MODE;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let corpoEnviado: any = null;
  let urlChamada: string | null = null;
  try {
    // As funções reais desviam para fixture em PROVIDER_MODE=fixture (o modo
    // em que o gate roda) — sem isto, o `fetch` substituído abaixo nunca
    // seria exercitado, e este vetor mediria a FIXTURE, não o código real.
    process.env.PROVIDER_MODE = "live";
    globalThis.fetch = (async (entrada: unknown, init?: unknown) => {
      urlChamada = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
      const initObj = init as { body?: string } | undefined;
      corpoEnviado = initObj?.body ? JSON.parse(initObj.body) : null;
      return new Response(
        JSON.stringify({
          data: {
            audio_url: "https://resource.heygen.ai/fala-sintetizada.mp3",
            duration: 7.42,
            request_id: "req-123",
            word_timestamps: [{ word: "oi", start: 0, end: 0.3 }],
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const resultado = await synthesizeSpeechHeygen("chave-heygen", "voz-1", "Bom dia a todos.");

    if (!urlChamada || !String(urlChamada).includes("/v3/voices/speech")) {
      failures.push(
        `heygen-speech: synthesizeSpeechHeygen chamou \`${urlChamada}\`, esperado conter /v3/voices/speech.`,
      );
    }
    if (corpoEnviado?.text !== "Bom dia a todos." || corpoEnviado?.voice_id !== "voz-1") {
      failures.push(
        `heygen-speech: o corpo enviado não trouxe text/voice_id corretos — veio ${JSON.stringify(corpoEnviado)}.`,
      );
    }
    if ("speed" in (corpoEnviado ?? {}) || "locale" in (corpoEnviado ?? {})) {
      failures.push(
        "heygen-speech: sem `opts`, o corpo trouxe `speed`/`locale` mesmo assim — nenhum call site pediu.",
      );
    }
    if (
      resultado.audioUrl !== "https://resource.heygen.ai/fala-sintetizada.mp3" ||
      resultado.durationSeconds !== 7.42 ||
      resultado.requestId !== "req-123" ||
      !Array.isArray(resultado.wordTimestamps)
    ) {
      failures.push(
        `heygen-speech: a resposta bem-formada não foi parseada corretamente — veio ${JSON.stringify(resultado)}.`,
      );
    }

    // Com opts: speed/locale entram no corpo.
    corpoEnviado = null;
    await synthesizeSpeechHeygen("chave-heygen", "voz-1", "texto", { speed: 1.2, locale: "pt-BR" });
    if (corpoEnviado?.speed !== 1.2 || corpoEnviado?.locale !== "pt-BR") {
      failures.push(
        `heygen-speech: com opts fornecido, speed/locale não chegaram ao corpo — veio ${JSON.stringify(corpoEnviado)}.`,
      );
    }

    // Resposta malformada (sem audio_url) recusa, em vez de atravessar undefined.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { duration: 5 } }), { status: 200 })) as typeof fetch;
    let recusouSemAudioUrl = false;
    try {
      await synthesizeSpeechHeygen("chave-heygen", "voz-1", "texto");
    } catch (err) {
      recusouSemAudioUrl = err instanceof AvatarProviderError;
    }
    if (!recusouSemAudioUrl) {
      failures.push(
        "heygen-speech: uma resposta sem `audio_url` NÃO foi recusada — ela atravessaria como " +
          "`audio_url: undefined` até o corpo do vídeo, um 400 do fornecedor depois do débito.",
      );
    }

    // Resposta malformada (duration não numérico) recusa.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ data: { audio_url: "https://x.test/a.mp3", duration: "sete segundos" } }),
        { status: 200 },
      )) as typeof fetch;
    let recusouDuracaoInvalida = false;
    try {
      await synthesizeSpeechHeygen("chave-heygen", "voz-1", "texto");
    } catch (err) {
      recusouDuracaoInvalida = err instanceof AvatarProviderError;
    }
    if (!recusouDuracaoInvalida) {
      failures.push(
        "heygen-speech: uma resposta com `duration` não numérico NÃO foi recusada — a duração medida " +
          "existe para o produto confiar nela, não para propagar o que quer que o fornecedor mande.",
      );
    }
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal1 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal1;
  }

  // ---------------------------------------------------------------------------
  // 2. requestSpeechAndRecordUsage — grava o consumo com vendor/endpoint
  //    certos, custo `null` (não documentado, não medido — nunca `0`).
  // ---------------------------------------------------------------------------
  const fetchOriginal2 = globalThis.fetch;
  const queryOriginal = pool.query.bind(pool);
  const modoOriginal2 = process.env.PROVIDER_MODE;
  let linhaGravada: Record<string, unknown> | null = null;
  try {
    process.env.PROVIDER_MODE = "live";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ data: { audio_url: "https://x.test/a.mp3", duration: 3.1, request_id: "r1" } }),
        { status: 200 },
      )) as typeof fetch;
    (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
      const sql = String(texto);
      if (/INSERT INTO provider_usage/.test(sql)) {
        const v = valores as unknown[];
        linhaGravada = {
          tenant_id: v[0],
          video_id: v[1],
          provider: v[2],
          vendor: v[3],
          unit_type: v[4],
          unit_count: v[5],
          endpoint_id: v[14],
          estimated_cost_usd: v[16],
        };
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;

    await requestSpeechAndRecordUsage({
      apiKey: "chave-heygen",
      voiceId: "voz-1",
      text: "Bom dia a todos.",
      tenantId: "tenant-1",
      videoId: "video-1",
    });

    if (linhaGravada === null) {
      failures.push("heygen-speech: requestSpeechAndRecordUsage não gravou nenhuma linha em provider_usage.");
    } else {
      const l = linhaGravada as Record<string, unknown>;
      if (l.provider !== "voice" || l.vendor !== "heygen") {
        failures.push(`heygen-speech: provider/vendor gravados errados — veio ${JSON.stringify(l)}.`);
      }
      if (l.unit_type !== "characters" || l.unit_count !== "Bom dia a todos.".length) {
        failures.push(`heygen-speech: unit_type/unit_count gravados errados — veio ${JSON.stringify(l)}.`);
      }
      if (l.endpoint_id !== "/v3/voices/speech") {
        failures.push(`heygen-speech: endpoint_id gravado errado — veio ${JSON.stringify(l.endpoint_id)}.`);
      }
      if (l.estimated_cost_usd !== null) {
        failures.push(
          `heygen-speech: estimated_cost_usd veio ${JSON.stringify(l.estimated_cost_usd)}, esperado \`null\` — ` +
            "o preço não é documentado nem medido, e um número aqui afirmaria uma medição que não existe.",
        );
      }
    }
  } finally {
    globalThis.fetch = fetchOriginal2;
    (pool as { query: unknown }).query = queryOriginal;
    if (modoOriginal2 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal2;
  }

  // ---------------------------------------------------------------------------
  // 3. O modo `audio_url` em buildHeygenVideoPayload — B1+B2 juntos.
  // ---------------------------------------------------------------------------
  const comAudioUrl = buildHeygenVideoPayload(
    { ...BASE, providerAvatarId: "avatar-1", scene: null, script: "roteiro" },
    null,
    null,
    { audioUrl: "https://resource.heygen.ai/fala.mp3" },
  );
  if (comAudioUrl.body.audio_url !== "https://resource.heygen.ai/fala.mp3") {
    failures.push(
      `heygen-speech: com \`extras.audioUrl\` e sem \`audioAssetId\`, \`audio_url\` não chegou ao corpo — ` +
        `veio ${JSON.stringify(comAudioUrl.body.audio_url)}.`,
    );
  }
  if ("audio_asset_id" in comAudioUrl.body || "voice_id" in comAudioUrl.body || "script" in comAudioUrl.body) {
    failures.push(
      `heygen-speech: o modo audio_url veio acompanhado de outro modo de áudio — corpo ${JSON.stringify(comAudioUrl.body)}.`,
    );
  }

  // audio_url vence voice_id quando os dois estão presentes.
  const audioUrlVenceVoiceId = buildHeygenVideoPayload(
    { ...BASE, providerAvatarId: "avatar-1", scene: null, script: "roteiro" },
    null,
    null,
    { audioUrl: "https://resource.heygen.ai/fala.mp3", voiceId: "voz-1" },
  );
  if ("voice_id" in audioUrlVenceVoiceId.body || "script" in audioUrlVenceVoiceId.body) {
    failures.push(
      "heygen-speech: com `audioUrl` E `voiceId` presentes, o corpo trouxe `voice_id`/`script` mesmo assim " +
        "— sintetizar duas vezes (medir e depois deixar o vídeo sintetizar de novo) paga a síntese em dobro.",
    );
  }
  if (audioUrlVenceVoiceId.body.audio_url !== "https://resource.heygen.ai/fala.mp3") {
    failures.push("heygen-speech: com `audioUrl` E `voiceId` presentes, `audio_url` deveria vencer e não venceu.");
  }

  // audio_asset_id vence audio_url quando os dois estão presentes.
  const assetVenceAudioUrl = buildHeygenVideoPayload(
    { ...BASE, providerAvatarId: "avatar-1", scene: null, script: "roteiro" },
    "asset-1",
    null,
    { audioUrl: "https://resource.heygen.ai/fala.mp3" },
  );
  if ("audio_url" in assetVenceAudioUrl.body) {
    failures.push(
      "heygen-speech: com `audioAssetId` presente, `audio_url` chegou ao corpo mesmo assim — os dois modos " +
        "de áudio não podem coexistir.",
    );
  }
  if (assetVenceAudioUrl.body.audio_asset_id !== "asset-1") {
    failures.push("heygen-speech: com `audioAssetId` presente, ele deveria vencer e não venceu.");
  }

  // ---------------------------------------------------------------------------
  // 4. cloneVoiceHeygen — corpo enviado e parsing da resposta.
  // ---------------------------------------------------------------------------
  const fetchOriginal3 = globalThis.fetch;
  const modoOriginal3 = process.env.PROVIDER_MODE;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let corpoDeClone: any = null;
  try {
    process.env.PROVIDER_MODE = "live";
    globalThis.fetch = (async (_entrada: unknown, init?: unknown) => {
      const initObj = init as { body?: string } | undefined;
      corpoDeClone = initObj?.body ? JSON.parse(initObj.body) : null;
      return new Response(JSON.stringify({ data: { voice_clone_id: "clone-1" } }), { status: 200 });
    }) as typeof fetch;

    const resultado = await cloneVoiceHeygen("chave-heygen", "asset-audio-1", "Minha Voz");
    if (
      corpoDeClone?.audio?.type !== "asset_id" ||
      corpoDeClone?.audio?.asset_id !== "asset-audio-1" ||
      corpoDeClone?.voice_name !== "Minha Voz"
    ) {
      failures.push(
        `heygen-speech: cloneVoiceHeygen não montou audio/voice_name corretos — veio ${JSON.stringify(corpoDeClone)}.`,
      );
    }
    if ("language" in (corpoDeClone ?? {}) || "remove_background_noise" in (corpoDeClone ?? {})) {
      failures.push(
        "heygen-speech: sem opts, cloneVoiceHeygen mandou language/remove_background_noise mesmo assim.",
      );
    }
    if (resultado.voiceCloneId !== "clone-1") {
      failures.push(`heygen-speech: voiceCloneId não veio da resposta — veio ${JSON.stringify(resultado)}.`);
    }

    corpoDeClone = null;
    await cloneVoiceHeygen("chave-heygen", "asset-audio-1", "Minha Voz", {
      language: "pt",
      removeBackgroundNoise: false,
    });
    if (corpoDeClone?.language !== "pt" || corpoDeClone?.remove_background_noise !== false) {
      failures.push(
        `heygen-speech: com opts fornecido, language/remove_background_noise não chegaram ao corpo — ` +
          `veio ${JSON.stringify(corpoDeClone)}.`,
      );
    }

    globalThis.fetch = (async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as typeof fetch;
    let recusouSemId = false;
    try {
      await cloneVoiceHeygen("chave-heygen", "asset-audio-1", "Minha Voz");
    } catch (err) {
      recusouSemId = err instanceof AvatarProviderError;
    }
    if (!recusouSemId) {
      failures.push(
        "heygen-speech: uma resposta de clonagem sem `voice_clone_id` NÃO foi recusada — sem ele não há " +
          "como consultar o status nem usar a voz depois, e o dinheiro já foi cobrado.",
      );
    }
  } finally {
    globalThis.fetch = fetchOriginal3;
    if (modoOriginal3 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal3;
  }

  // ---------------------------------------------------------------------------
  // 5. readHeygenVoiceCloneStatus — mapeamento de status, nunca declara
  //    pronto por engano.
  // ---------------------------------------------------------------------------
  const fetchOriginal4 = globalThis.fetch;
  const modoOriginal4 = process.env.PROVIDER_MODE;
  try {
    process.env.PROVIDER_MODE = "live";
    const casos: [string, string][] = [
      ["pending", "pending"],
      ["processing", "processing"],
      ["complete", "complete"],
      ["completed", "complete"],
      ["failed", "failed"],
      ["algo-nunca-visto", "processing"],
    ];
    for (const [bruto, esperado] of casos) {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ data: { status: bruto } }), { status: 200 })) as typeof fetch;
      const status = await readHeygenVoiceCloneStatus("chave-heygen", "clone-1");
      if (status !== esperado) {
        failures.push(
          `heygen-speech: readHeygenVoiceCloneStatus("${bruto}") devolveu "${status}", esperado "${esperado}" — ` +
            (esperado === "processing" && bruto !== "processing"
              ? "um valor desconhecido do fornecedor precisa cair em processing, nunca em pronto por engano."
              : ""),
        );
      }
    }
  } finally {
    globalThis.fetch = fetchOriginal4;
    if (modoOriginal4 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal4;
  }

  // ---------------------------------------------------------------------------
  // 6. deleteVoiceHeygen — chama o DELETE certo; 404 vira sucesso.
  // ---------------------------------------------------------------------------
  const fetchOriginal5 = globalThis.fetch;
  const modoOriginal5 = process.env.PROVIDER_MODE;
  try {
    process.env.PROVIDER_MODE = "live";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metodoUsado: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let urlUsada: any = null;
    globalThis.fetch = (async (entrada: unknown, init?: unknown) => {
      urlUsada = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
      metodoUsado = (init as { method?: string } | undefined)?.method ?? null;
      return new Response(JSON.stringify({ data: { voice_id: "voz-1" } }), { status: 200 });
    }) as typeof fetch;
    await deleteVoiceHeygen("chave-heygen", "voz-1");
    if (metodoUsado !== "DELETE" || !urlUsada?.includes("/v3/voices/voz-1")) {
      failures.push(
        `heygen-speech: deleteVoiceHeygen não chamou DELETE /v3/voices/{id} — método ${metodoUsado}, url ${urlUsada}.`,
      );
    }

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "not_found" }), { status: 404 })) as typeof fetch;
    let lancouEm404 = false;
    try {
      await deleteVoiceHeygen("chave-heygen", "voz-ja-apagada");
    } catch {
      lancouEm404 = true;
    }
    if (lancouEm404) {
      failures.push(
        "heygen-speech: deleteVoiceHeygen lançou num 404 — a voz já não existe, que é o efeito desejado; " +
          "recusar uma segunda tentativa de apagar a mesma voz não tem razão de negócio nenhuma.",
      );
    }
  } finally {
    globalThis.fetch = fetchOriginal5;
    if (modoOriginal5 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal5;
  }

  // ---------------------------------------------------------------------------
  // 7. countHeygenVoiceSlots — a contagem é o TAMANHO da listagem real,
  //    nunca uma constante local.
  // ---------------------------------------------------------------------------
  const fetchOriginal6 = globalThis.fetch;
  const modoOriginal6 = process.env.PROVIDER_MODE;
  try {
    process.env.PROVIDER_MODE = "live";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ data: [{ voice_id: "v1" }, { voice_id: "v2" }, { voice_id: "v3" }] }),
        { status: 200 },
      )) as typeof fetch;
    const contagem = await countHeygenVoiceSlots("chave-heygen");
    if (contagem !== 3) {
      failures.push(`heygen-speech: countHeygenVoiceSlots devolveu ${contagem}, esperado 3 (o tamanho da lista).`);
    }

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { not: "an array" } }), { status: 200 })) as typeof fetch;
    let recusouFormaErrada = false;
    try {
      await countHeygenVoiceSlots("chave-heygen");
    } catch (err) {
      recusouFormaErrada = err instanceof AvatarProviderError;
    }
    if (!recusouFormaErrada) {
      failures.push(
        "heygen-speech: countHeygenVoiceSlots não recusou uma resposta cuja `data` não é um array — a " +
          "contagem de slots existe para ser confiável, não para propagar o que o fornecedor mandar.",
      );
    }
  } finally {
    globalThis.fetch = fetchOriginal6;
    if (modoOriginal6 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal6;
  }

  if (failures.length === 0) {
    notes.push(
      "  heygen-speech: synthesizeSpeechHeygen monta {text,voice_id[,speed,locale]}, recusa audio_url/" +
        "duration ausentes ou malformados, e requestSpeechAndRecordUsage grava vendor=heygen/" +
        "endpoint=/v3/voices/speech/custo=null",
    );
    notes.push(
      "  heygen-speech: audio_url em buildHeygenVideoPayload entra só sem audioAssetId, e vence voice_id " +
        "quando os dois estão presentes",
    );
    notes.push(
      "  heygen-speech: cloneVoiceHeygen monta audio:{type:asset_id}/voice_name e recusa resposta sem " +
        "voice_clone_id; readHeygenVoiceCloneStatus mapeia pending/processing/complete/completed/failed " +
        "e nunca declara pronto por engano; deleteVoiceHeygen trata 404 como sucesso; " +
        "countHeygenVoiceSlots devolve o tamanho real da listagem",
    );
  }

  return { failures, notes };
}

export const MUTANTS: Mutant[] = [
  {
    guard: "heygen-speech: synthesizeSpeechHeygen recusa resposta sem audio_url/duration numérico",
    name: "a checagem de forma da resposta de /v3/voices/speech desaparece",
    kind: "esperto",
    // ESPERTO: `data.audio_url`/`data.duration` continuam sendo lidos — só a
    // recusa em caso de ausência é removida. Uma resposta malformada (ou um
    // corpo que muda de forma no futuro) atravessaria como `undefined`/`NaN`
    // até `buildHeygenVideoPayload`, e o 400 só apareceria no fornecedor,
    // depois do débito da síntese.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      '  if (typeof data?.audio_url !== "string" || typeof data?.duration !== "number") {\n' +
      "    throw new AvatarProviderError(\n" +
      '      unexpectedShapeMessage("heygen.synthesizeSpeech", "data.audio_url / data.duration", json),\n' +
      "    );\n" +
      "  }",
    replace: "  void data;",
    expect: "NÃO foi recusada",
  },
  {
    guard: "heygen-speech: requestSpeechAndRecordUsage grava estimated_cost_usd como null, nunca um número",
    name: "o custo da síntese HeyGen passa a ser gravado como zero",
    kind: "esperto",
    // ESPERTO: a linha continua sendo gravada, com vendor/endpoint corretos —
    // só o custo muda de `null` (não sabemos) para `0` (foi de graça). Um
    // relatório de atribuição de gasto passaria a contar esta etapa como
    // gratuita, quando na verdade ela nunca foi medida.
    // Âncora estendida até `endpointId: HEYGEN_TTS_ENDPOINT` — B5 (BLOCO
    // HEYGEN-SIMPLES-1, 02/09/2026) acrescentou um SEGUNDO
    // `recordProviderUsage({..., estimatedCostUsd: null})` em
    // `cloneVoiceHeygenAndRecordUsage`, e sem essa âncora os dois casavam.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "    endpointId: HEYGEN_TTS_ENDPOINT,\n    keySource: \"tenant_byok\",\n" +
      "    // NÃO MEDIDO — ver o comentário de `endpointCatalog.ts` para este path.\n" +
      "    // `null`, nunca 0: zero afirmaria \"de graça\", que não é o que se sabe.\n" +
      "    estimatedCostUsd: null,",
    replace:
      "    endpointId: HEYGEN_TTS_ENDPOINT,\n    keySource: \"tenant_byok\",\n" +
      "    // NÃO MEDIDO — ver o comentário de `endpointCatalog.ts` para este path.\n" +
      "    // `null`, nunca 0: zero afirmaria \"de graça\", que não é o que se sabe.\n" +
      "    estimatedCostUsd: 0,",
    expect: "esperado `null`",
  },
  {
    guard: "heygen-speech: audio_url vence voice_id quando os dois estão presentes",
    name: "o modo audio_url deixa de ter prioridade sobre voice_id",
    kind: "esperto",
    // ESPERTO: os dois blocos continuam intactos — só a CONDIÇÃO de entrada
    // do bloco `audio_url` passa a excluir o caso em que `voiceId` também
    // está presente. Com `audioUrl` E `voiceId` presentes (um erro de
    // configuração, não um caminho pretendido), o corpo passaria a
    // sintetizar duas vezes: uma na medição prévia (B2), outra dentro do
    // próprio POST /v3/videos.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "  } else if (extras?.audioUrl) {\n    body.audio_url = extras.audioUrl;",
    replace: "  } else if (extras?.audioUrl && !extras?.voiceId) {\n    body.audio_url = extras.audioUrl;",
    expect: "audio_url` deveria vencer e não venceu",
  },
  {
    guard: "heygen-speech: cloneVoiceHeygen recusa resposta sem voice_clone_id",
    name: "a checagem de forma da resposta de /v3/voices/clone desaparece",
    kind: "esperto",
    // ESPERTO: `voiceCloneId` continua sendo lido — só a recusa em caso de
    // ausência é removida. Uma resposta sem `voice_clone_id` (ou vazia)
    // devolveria `{ voiceCloneId: undefined }`, e a clonagem — já paga —
    // ficaria sem como ser consultada ou usada depois.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      '  if (typeof voiceCloneId !== "string" || !voiceCloneId) {\n' +
      '    throw new AvatarProviderError(unexpectedShapeMessage("heygen.cloneVoice", "data.voice_clone_id", json));\n' +
      "  }",
    replace: "  void voiceCloneId;",
    expect: "NÃO foi recusada",
  },
  {
    guard: "heygen-speech: readHeygenVoiceCloneStatus nunca declara pronto por engano",
    name: "um status desconhecido do fornecedor passa a virar complete",
    kind: "esperto",
    // ESPERTO: os três `if` explícitos continuam corretos — só o FALLBACK
    // muda de "processing" (seguro) para "complete" (perigoso). Qualquer
    // nome de status que a doc não previu passaria a liberar a voz para
    // escolha antes de ela existir de verdade no fornecedor.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: '  if (bruto.startsWith("complet")) return "complete";\n  return "processing";',
    replace: '  if (bruto.startsWith("complet")) return "complete";\n  return "complete";',
    expect: 'devolveu "complete", esperado "processing"',
  },
  {
    guard: "heygen-speech: deleteVoiceHeygen trata 404 como sucesso",
    name: "deleteVoiceHeygen volta a lançar em 404",
    kind: "esperto",
    // ESPERTO: o `fetchJson` da resposta 200 continua correto — só o desvio
    // do 404 desaparece, e `fetchJson` (que espera `res.ok`) lançaria para
    // uma voz que já não existe. "Apagar de novo uma voz já apagada" viraria
    // erro, sem razão de negócio nenhuma.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "  if (res.status === 404) {\n" +
      "    // Já não existe — o log ainda registra a resposta bruta, para diagnóstico.\n" +
      '    await fetchJson(res, "HeyGen", "heygen.deleteVoice").catch(() => null);\n' +
      "    return;\n" +
      "  }",
    replace: "  void res.status;",
    expect: "lançou num 404",
  },
  {
    guard: "heygen-speech: countHeygenVoiceSlots recusa uma resposta cuja data não é array",
    name: "countHeygenVoiceSlots deixa de validar a forma da listagem",
    kind: "esperto",
    // ESPERTO: `lista.length` no `return` continua ali — só a validação
    // prévia some. Contra um objeto (não array), `.length` de um objeto
    // JS é sempre `undefined`, e a contagem de slots — que existe
    // exatamente para não ser um chute — devolveria `NaN`/`undefined` sem
    // avisar ninguém.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "  if (!Array.isArray(lista)) {\n" +
      '    throw new AvatarProviderError(unexpectedShapeMessage("heygen.countVoiceSlots", "data (array)", json));\n' +
      "  }\n  return lista.length;",
    replace: "  return (lista as unknown[]).length;",
    expect: "não recusou uma resposta cuja",
  },
];
