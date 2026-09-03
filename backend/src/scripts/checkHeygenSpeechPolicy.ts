/**
 * B2, BLOCO HEYGEN-SIMPLES-1 (02/09/2026) — a etapa de MEDIÇÃO DE DURAÇÃO.
 *
 * `POST /v3/voices/speech` sintetiza fala DIRETO na HeyGen e devolve
 * `duration`/`audio_url` de forma SÍNCRONA (schema lido por doc pública,
 * developers.heygen.com/docs/voices/speech — WebFetch, 02/09/2026; NÃO
 * reconfirmado por chamada real, a rota está nas proibidas desta rodada).
 * Existe para dar ao caminho de voz HeyGen nativa a MESMA propriedade que o
 * ElevenLabs já dá via `requireAudio`: a duração do vídeo é conhecida ANTES
 * da chamada cara, medida — não estimada pela régua de caracteres.
 *
 * Três coisas medidas aqui:
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
 */
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import {
  buildHeygenVideoPayload,
  synthesizeSpeechHeygen,
  requestSpeechAndRecordUsage,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let corpoEnviado: any = null;
  let urlChamada: string | null = null;
  try {
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
  }

  // ---------------------------------------------------------------------------
  // 2. requestSpeechAndRecordUsage — grava o consumo com vendor/endpoint
  //    certos, custo `null` (não documentado, não medido — nunca `0`).
  // ---------------------------------------------------------------------------
  const fetchOriginal2 = globalThis.fetch;
  const queryOriginal = pool.query.bind(pool);
  let linhaGravada: Record<string, unknown> | null = null;
  try {
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
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    estimatedCostUsd: null,\n  });\n  return result;",
    replace: "    estimatedCostUsd: 0,\n  });\n  return result;",
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
];
