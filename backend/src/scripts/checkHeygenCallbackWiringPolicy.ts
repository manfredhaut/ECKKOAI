/**
 * F1+H2, BLOCO HEYGEN-SIMPLES-3 (03/09/2026) — os quatro campos com efeito
 * REAL (`output_format`/`title`/`callback_url`/`callback_id`) chegam ao
 * corpo de `POST /v3/videos` de VERDADE, no ÚNICO call site real
 * (`generateVideoHeygen`), não só na função pura `buildHeygenVideoPayload`
 * (já coberta por `checkVideoContractPolicy.ts`, seção 8 — que testa a
 * função isolada, chamando-a direto, sem passar por `generateVideo()`).
 *
 * ┌─ Por que isto precisava de guarda PRÓPRIA ──────────────────────────────┐
 * │ Até SIMPLES-3, `generateVideoHeygen` chamava `buildHeygenVideoPayload`  │
 * │ com só 3 argumentos — sem `extras` — e o corpo real nunca levava esses  │
 * │ campos, mesmo a função aceitando-os desde B1 (02/09). Uma guarda que só │
 * │ testasse `buildHeygenVideoPayload` isolada nunca pegaria isso: ela      │
 * │ prova que a função SABE montar o campo quando mandada, não que alguém   │
 * │ MANDA. É a mesma classe de lacuna que o comentário de topo de           │
 * │ `checkAudioDurationGatePolicy.ts` já registra para outro campo — "a     │
 * │ verificação é ANCORADA NO USO", e a ancoragem tem de estar em quem      │
 * │ CHAMA o fornecedor de verdade.                                          │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * H2 (o mesmo corpo, outra pergunta): `callback_id` enviado aqui precisa ser
 * o MESMO valor que `heygenWebhook.ts` usa no `SELECT id FROM videos WHERE
 * id = $1` ao receber o evento de volta — testado abaixo comparando o
 * `callback_id` do corpo capturado contra o `videoId` de entrada, byte a
 * byte, não por inspeção visual dos dois arquivos.
 *
 * Sem `videoId` (as sondas/guardas que exercitam este módulo sem banco —
 * `GenerateVideoInput.videoId` é opcional por isso), `title`/`callback_url`/
 * `callback_id` ficam de fora do corpo — testado como segundo caso, não só
 * assumido.
 *
 * ┌─ Custo: ZERO ────────────────────────────────────────────────────────────┐
 * │ Mesmo padrão de `checkAudioDurationGatePolicy.ts`: `fetch` substituído,   │
 * │ tratamento de áudio desligado, teto de sessão live zerado na entrada e    │
 * │ na saída, `uploads/` da prova apagado no `finally`.                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { rm, readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { config } from "../config.js";
import { BASE_DOMAIN } from "../domainConfig.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import { resetLiveGenerationCount } from "../services/providers/liveGuard.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "callback: output_format/title/callback_url/callback_id chegam ao POST /v3/videos real",
    name: "generateVideoHeygen deixa de passar extras a buildHeygenVideoPayload",
    kind: "esperto",
    // ESPERTO: `buildHeygenVideoPayload` continua aceitando `extras` (o
    // parâmetro e o tipo não mudam), e `heygenExtrasReais` continua existindo
    // e correta — só o call site real para de PASSAR o 4º argumento. O corpo
    // enviado ao fornecedor volta a ser o de antes de SIMPLES-3, mesmo a
    // função sabendo montar os quatro campos quando mandada.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "  const { body, engine, engineReason } = buildHeygenVideoPayload(\n" +
      "    input,\n" +
      "    audioAssetId,\n" +
      "    backgroundAssetId,\n" +
      "    heygenExtrasReais(input),\n" +
      "  );",
    replace: "  const { body, engine, engineReason } = buildHeygenVideoPayload(input, audioAssetId, backgroundAssetId);",
    expect: "output_format enviado foi",
  },
  {
    guard: "callback: a SIMULAÇÃO (generateVideoFixture) monta os mesmos extras da chamada real",
    name: "o payload simulado para de usar heygenExtrasReais",
    kind: "esperto",
    // ESPERTO: `buildHeygenVideoPayload` continua sendo chamado com 3
    // argumentos — o corpo simulado continua parecendo completo (mesmos
    // campos de sempre) — só o 4º (`heygenExtrasReais(input)`) some. O
    // comentário de topo de `fixtureProvider.ts` promete "o PAYLOAD REAL,
    // montado pelo montador REAL, mesmo sem rede" — uma simulação que não
    // mostra output_format/title/callback_url/callback_id mente sobre o que
    // a chamada de verdade manda, e é exatamente o que faria um clique em
    // fixture (o único jeito de demonstrar F1 sem gastar) não provar nada.
    file: "backend/src/services/providers/fixtureProvider.ts",
    find:
      "  const { body } = buildHeygenVideoPayload(\n" +
      "    input,\n" +
      '    "fixture-audio-asset",\n' +
      "    fixtureBackgroundAssetId(input),\n" +
      "    heygenExtrasReais(input),\n" +
      "  );",
    replace: '  const { body } = buildHeygenVideoPayload(input, "fixture-audio-asset", fixtureBackgroundAssetId(input));',
    expect: "não passa mais heygenExtrasReais(input)",
  },
  {
    guard: "callback: callback_id enviado é o MESMO videoId que a rota receptora procura",
    name: "callback_id passa a vir de outro campo, não de input.videoId",
    kind: "esperto",
    // ESPERTO: o campo continua sendo enviado — só o VALOR sofre um desvio
    // (sufixo acrescentado). `heygenExtrasReais` recebe só
    // `Pick<GenerateVideoInput, "videoId">` — não há outro campo de
    // verdade para trocar sem quebrar o `tsc` (um mutante que não compila
    // vira ERRO/AMBÍGUO, não reprovação da guarda; já medido nesta rodada).
    // O corpo continua tendo `callback_id` presente, então uma guarda que só
    // checasse "o campo existe" não pegaria isto — o webhook chegaria e o
    // SELECT em `heygenWebhook.ts` nunca encontraria o vídeo.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "          callbackId: input.videoId,",
    replace: '          callbackId: input.videoId + "-mutado",',
    expect: "callback_id enviado foi",
  },
];

export interface HeygenCallbackWiringCheckResult {
  failures: string[];
  notes: string[];
}

const TENANT_DA_PROVA = "00000000-0000-4000-8000-0000000c6cb1";
const VIDEO_ID_DA_PROVA = "11111111-1111-4111-8111-1111111c6cb1";

interface Corrida {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  corpoDoVideo: any;
  erro: unknown;
}

async function correr(videoId: string | null): Promise<Corrida> {
  const { generateVideo } = await import("../services/providers/avatarProvider.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let corpoDoVideo: any = null;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown, init?: unknown) => {
    const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
    const initObj = init as { body?: string } | undefined;

    if (url.includes("api.elevenlabs.io") && url.includes("/with-timestamps")) {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from("prova-de-audio").toString("base64"),
          alignment: { character_end_times_seconds: [0.1, 3.5] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.heygen.com/v3/assets")) {
      return new Response(JSON.stringify({ data: { asset_id: "asset-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("api.heygen.com/v3/videos")) {
      corpoDoVideo = initObj?.body ? JSON.parse(initObj.body) : null;
      return new Response(JSON.stringify({ data: { video_id: "job-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`fetch inesperado na prova de callback wiring: ${url}`);
  }) as typeof fetch;

  let erro: unknown = null;
  try {
    await generateVideo({
      apiKey: "chave-irrelevante-fetch-substituido",
      vendor: "heygen",
      providerAvatarId: "avatar-da-prova",
      script: "Roteiro da prova de callback wiring.",
      elevenLabsApiKey: "chave-irrelevante-fetch-substituido",
      voiceId: "voz-da-prova",
      tenantId: TENANT_DA_PROVA,
      videoId,
      audioTreatmentEnabled: false,
      audioTreatmentTargetLufs: -16,
      format: resolveVideoFormat("youtube"),
      supportedEngines: null,
      engineEnabled: false,
      scene: null,
      engineChoice: null,
      captions: false,
    });
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  return { corpoDoVideo, erro };
}

export async function checkHeygenCallbackWiringPolicy(): Promise<HeygenCallbackWiringCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const modoOriginal = process.env.PROVIDER_MODE;
  const tetoOriginal = process.env.PROVIDER_LIVE_MAX_GENERATIONS;

  let comVideoId: Corrida;
  let semVideoId: Corrida;
  try {
    process.env.PROVIDER_MODE = "live";
    process.env.PROVIDER_LIVE_MAX_GENERATIONS = "8";
    resetLiveGenerationCount();

    comVideoId = await correr(VIDEO_ID_DA_PROVA);
    semVideoId = await correr(null);
  } finally {
    resetLiveGenerationCount();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
    if (tetoOriginal === undefined) delete process.env.PROVIDER_LIVE_MAX_GENERATIONS;
    else process.env.PROVIDER_LIVE_MAX_GENERATIONS = tetoOriginal;
    await rm(path.join(config.uploadsDir, TENANT_DA_PROVA), { recursive: true, force: true }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // 1. COM videoId: os quatro campos chegam ao corpo REAL, com os valores
  //    certos — F1.
  // ---------------------------------------------------------------------------
  if (comVideoId.erro !== null) {
    failures.push(
      `callback: a corrida com videoId levantou ${JSON.stringify(String(comVideoId.erro).slice(0, 160))} — ` +
        "esperado sucesso.",
    );
  }
  if (!comVideoId.corpoDoVideo) {
    failures.push("callback: nenhum POST /v3/videos foi capturado na corrida com videoId.");
  } else {
    const corpo = comVideoId.corpoDoVideo;
    if (corpo.output_format !== "mp4") {
      failures.push(`callback: output_format enviado foi ${JSON.stringify(corpo.output_format)}, esperado "mp4".`);
    }
    if (corpo.title !== `eckko-${VIDEO_ID_DA_PROVA}`) {
      failures.push(`callback: title enviado foi ${JSON.stringify(corpo.title)}, esperado "eckko-${VIDEO_ID_DA_PROVA}".`);
    }
    if (corpo.callback_url !== `https://${BASE_DOMAIN}/webhooks/heygen`) {
      failures.push(
        `callback: callback_url enviado foi ${JSON.stringify(corpo.callback_url)}, esperado ` +
          `"https://${BASE_DOMAIN}/webhooks/heygen" — o mesmo domínio de \`emailProvider.ts\`, nunca um ` +
          "endereço hardcoded que divergiria entre ambientes.",
      );
    }
    // H2 — a pergunta central: o valor enviado é o MESMO que a rota
    // receptora vai procurar. Comparação direta, não inspeção de dois
    // arquivos por leitura.
    if (corpo.callback_id !== VIDEO_ID_DA_PROVA) {
      failures.push(
        `callback: callback_id enviado foi ${JSON.stringify(corpo.callback_id)}, esperado ${JSON.stringify(VIDEO_ID_DA_PROVA)} ` +
          "— o MESMO videoId que heygenWebhook.ts usa no SELECT ao receber o evento de volta (H2). Se os " +
          "dois lados divergirem, o webhook chega e não encontra o vídeo — não é erro visível, é uma linha " +
          "de auditoria com video_id NULL para sempre.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. SEM videoId: os três campos dependentes ficam de fora — nunca um
  //    callback_url sem callback_id correspondente, que a HeyGen chamaria
  //    sem ninguém do lado de cá conseguir correlacionar a resposta.
  // ---------------------------------------------------------------------------
  if (semVideoId.erro !== null) {
    failures.push(
      `callback: a corrida sem videoId levantou ${JSON.stringify(String(semVideoId.erro).slice(0, 160))} — ` +
        "esperado sucesso (videoId ausente é caminho legítimo das sondas/guardas sem banco).",
    );
  }
  if (semVideoId.corpoDoVideo) {
    const corpo = semVideoId.corpoDoVideo;
    if ("title" in corpo || "callback_url" in corpo || "callback_id" in corpo) {
      failures.push(
        `callback: sem videoId, o corpo trouxe title/callback_url/callback_id mesmo assim — ` +
          `${JSON.stringify({ title: corpo.title, callback_url: corpo.callback_url, callback_id: corpo.callback_id })}. ` +
          "Um callback_url sem callback_id correspondente é a HeyGen chamando de volta sem ninguém saber " +
          "para qual vídeo.",
      );
    }
    if (corpo.output_format !== "mp4") {
      failures.push(
        `callback: sem videoId, output_format enviado foi ${JSON.stringify(corpo.output_format)}, esperado ` +
          '"mp4" — este campo não depende de videoId.',
      );
    }
  } else {
    failures.push("callback: nenhum POST /v3/videos foi capturado na corrida sem videoId.");
  }

  // ---------------------------------------------------------------------------
  // 3. A SIMULAÇÃO usa o MESMO `heygenExtrasReais` — sem isto, um clique em
  //    fixture (o único jeito de demonstrar F1 sem gastar) não prova nada: o
  //    log mostraria um corpo que a chamada de verdade nunca mandaria.
  //    FORMA, não execução — `generateVideoFixture` só LOGA o corpo, não o
  //    devolve, e interceptar `logEvent` para isto seria mais frágil que ler
  //    o call site.
  // ---------------------------------------------------------------------------
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  let fixtureSource: string;
  try {
    fixtureSource = await readFile(
      path.join(repoRoot, "backend/src/services/providers/fixtureProvider.ts"),
      "utf-8",
    );
  } catch {
    fixtureSource = "";
    failures.push("callback: não consegui ler fixtureProvider.ts para conferir a simulação.");
  }
  if (fixtureSource && !/buildHeygenVideoPayload\(\s*input,\s*"fixture-audio-asset",\s*fixtureBackgroundAssetId\(input\),\s*heygenExtrasReais\(input\),?\s*\)/.test(fixtureSource)) {
    failures.push(
      "callback: generateVideoFixture não passa mais heygenExtrasReais(input) a buildHeygenVideoPayload — a " +
        "simulação deixaria de mostrar output_format/title/callback_url/callback_id, e um clique em fixture " +
        "no wizard não provaria mais nada sobre esses quatro campos.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      `  callback: com videoId, o POST /v3/videos real leva output_format=mp4, title=eckko-${VIDEO_ID_DA_PROVA}, ` +
        `callback_url=https://${BASE_DOMAIN}/webhooks/heygen e callback_id=${VIDEO_ID_DA_PROVA} — o mesmo id que ` +
        "a rota receptora procura",
    );
    notes.push("  callback: sem videoId, title/callback_url/callback_id ficam de fora; output_format continua indo");
  }

  return { failures, notes };
}
