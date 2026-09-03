/**
 * F3, BLOCO HEYGEN-SIMPLES-4 (03/09/2026) — reprodução ANCORADA NO USO de
 * que um duplo clique real não gera (nem cobra) dois vídeos.
 *
 * ┌─ O que já existia, e por que não bastava sozinho ───────────────────────┐
 * │ `checkVideoContractPolicy.ts`, seção 6, já prova que                     │
 * │ `heygenIdempotencyKey`/`heygenVideoRequestHeaders` são PUROS e           │
 * │ DETERMINÍSTICOS — a mesma tentativa produz a mesma chave mesmo com 5ms   │
 * │ de intervalo entre as duas chamadas (não é o instante), e a chave        │
 * │ enviada no header É a derivada. O que essa prova NÃO faz — e é a mesma   │
 * │ lacuna já registrada no topo de `checkHeygenCallbackWiringPolicy.ts`     │
 * │ para F1/H2 — é passar pelo CALL SITE REAL duas vezes de ponta a ponta:   │
 * │ ela chama as duas funções PURAS direto, nunca `generateVideo()`. Uma     │
 * │ guarda que só testasse a função pura nunca pegaria um dia em que         │
 * │ `generateVideoHeygen` parasse de montar os headers com                   │
 * │ `heygenVideoRequestHeaders` (por exemplo, um `fetch` que monta os        │
 * │ headers na mão, sem o helper).                                           │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * A prova: duas chamadas REAIS a `generateVideo()` (mesmo tenant, avatar,
 * roteiro, cena, formato — o "duplo clique" de verdade, exceto pelo
 * `videoId`, que MUDA a cada linha nova em `videos` e por isso NUNCA entra
 * na chave — ver o comentário de `heygenIdempotencyKey`), `fetch`
 * substituído, `Idempotency-Key` capturado nas DUAS chamadas ao
 * `POST /v3/videos`. A segunda resposta simulada devolve o MESMO
 * `video_id` da primeira — o comportamento que a HeyGen documenta para uma
 * chave repetida dentro de 24h (replay, não nova animação) — e a prova
 * confirma que `generateVideo()` aceita essa resposta sem se comportar
 * diferente de uma resposta "nova" (nenhum código aqui distingue os dois
 * casos, porque não precisa: o replay é inteiramente do lado do
 * fornecedor).
 *
 * ┌─ Custo: ZERO ────────────────────────────────────────────────────────────┐
 * │ Mesmo padrão de `checkHeygenCallbackWiringPolicy.ts`: `fetch`             │
 * │ substituído, tratamento de áudio desligado, teto de sessão live zerado    │
 * │ na entrada e na saída, `uploads/` da prova apagado no `finally`.          │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { config } from "../config.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import { resetLiveGenerationCount } from "../services/providers/liveGuard.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "idempotência: duas chamadas reais idênticas mandam a MESMA Idempotency-Key ao POST /v3/videos",
    name: "generateVideoHeygen para de usar heygenVideoRequestHeaders",
    kind: "esperto",
    // ESPERTO: a chamada continua levando um header de idempotência — só que
    // um MONTADO NA MÃO, sem o helper (e por isso sem a derivação
    // determinística). Um header presente mas não derivado da tentativa
    // volta a se comportar como se fosse do instante — a prova de que ele
    // é IDÊNTICO nas duas chamadas reprova.
    // O `find` mira SÓ a chamada de vídeo, não `createAvatarLook`
    // (`POST /v3/avatars`, mais abaixo no arquivo) — aquela usa headers
    // PRÓPRIOS ({x-api-key, content-type} sem idempotência, porque criar
    // traje não tem o problema de duplo clique que anima duas vezes; ver o
    // comentário desta guarda mais abaixo). O `find` inclui o `POST /v3/videos`
    // logo acima para garantir contexto único mesmo que os dois textos
    // venham a coincidir de novo no futuro.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "      method: \"POST\",\n" +
      "      headers: heygenVideoRequestHeaders(input.apiKey, input),\n" +
      "      body: JSON.stringify(body),\n" +
      "      // A chamada mais cara do produto",
    replace:
      "      method: \"POST\",\n" +
      "      headers: { \"x-api-key\": input.apiKey, \"content-type\": \"application/json\" },\n" +
      "      body: JSON.stringify(body),\n" +
      "      // A chamada mais cara do produto",
    expect: "saiu sem Idempotency-Key",
  },
];

export interface IdempotencyReplayCheckResult {
  failures: string[];
  notes: string[];
}

const TENANT_DA_PROVA = "00000000-0000-4000-8000-0000000d0e01";

interface Corrida {
  idempotencyKey: string | null;
  videoId: string | null;
  erro: unknown;
}

/**
 * Roda `generateVideo()` de VERDADE, capturando o header `Idempotency-Key`
 * enviado ao `POST /v3/videos` e o `video_id` que a resposta simulada
 * devolve. `videoIdDoFornecedorSimulado` deixa a SEGUNDA corrida devolver o
 * MESMO id da primeira — o replay documentado pela HeyGen.
 */
async function correr(videoIdDoFornecedorSimulado: string): Promise<Corrida> {
  const { generateVideo } = await import("../services/providers/avatarProvider.js");
  let idempotencyKey: string | null = null;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown, init?: unknown) => {
    const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
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
      const initObj = init as { headers?: Record<string, string> } | undefined;
      idempotencyKey = initObj?.headers?.["Idempotency-Key"] ?? null;
      return new Response(JSON.stringify({ data: { video_id: videoIdDoFornecedorSimulado } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`fetch inesperado na prova de idempotência: ${url}`);
  }) as typeof fetch;

  let erro: unknown = null;
  let videoId: string | null = null;
  try {
    const resultado = await generateVideo({
      apiKey: "chave-irrelevante-fetch-substituido",
      vendor: "heygen",
      providerAvatarId: "avatar-da-prova",
      // MESMO roteiro, mesmo avatar, mesma cena/formato nas duas chamadas —
      // o "duplo clique" real. `videoId` é OMITIDO de propósito: ele muda a
      // cada linha nova em `videos` e nunca entra na chave (ver o
      // comentário de `heygenIdempotencyKey`) — incluí-lo aqui testaria uma
      // coisa que o próprio contrato da função já exclui.
      script: "Roteiro idêntico da prova de duplo clique real.",
      elevenLabsApiKey: "chave-irrelevante-fetch-substituido",
      voiceId: "voz-da-prova",
      tenantId: TENANT_DA_PROVA,
      audioTreatmentEnabled: false,
      audioTreatmentTargetLufs: -16,
      format: resolveVideoFormat("youtube"),
      supportedEngines: null,
      engineEnabled: false,
      scene: null,
      engineChoice: null,
      captions: false,
    });
    videoId = resultado.providerJobId;
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  return { idempotencyKey, videoId, erro };
}

export async function checkIdempotencyReplayPolicy(): Promise<IdempotencyReplayCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const modoOriginal = process.env.PROVIDER_MODE;
  const tetoOriginal = process.env.PROVIDER_LIVE_MAX_GENERATIONS;

  const VIDEO_ID_SIMULADO_DO_FORNECEDOR = "job-do-primeiro-clique";

  let primeiro: Corrida;
  let segundo: Corrida;
  try {
    process.env.PROVIDER_MODE = "live";
    process.env.PROVIDER_LIVE_MAX_GENERATIONS = "8";
    resetLiveGenerationCount();

    // O "duplo clique": duas chamadas de verdade, corpo idêntico. A segunda
    // resposta simulada devolve o MESMO video_id da primeira — o replay que
    // a HeyGen documenta para uma chave repetida dentro de 24h.
    primeiro = await correr(VIDEO_ID_SIMULADO_DO_FORNECEDOR);
    segundo = await correr(VIDEO_ID_SIMULADO_DO_FORNECEDOR);
  } finally {
    resetLiveGenerationCount();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
    if (tetoOriginal === undefined) delete process.env.PROVIDER_LIVE_MAX_GENERATIONS;
    else process.env.PROVIDER_LIVE_MAX_GENERATIONS = tetoOriginal;
    await rm(path.join(config.uploadsDir, TENANT_DA_PROVA), { recursive: true, force: true }).catch(() => {});
  }

  if (primeiro.erro !== null || segundo.erro !== null) {
    failures.push(
      `idempotência: uma das duas corridas levantou erro — 1ª: ${JSON.stringify(String(primeiro.erro ?? "ok").slice(0, 120))}, ` +
        `2ª: ${JSON.stringify(String(segundo.erro ?? "ok").slice(0, 120))}. Esperado sucesso nas duas.`,
    );
  }
  if (!primeiro.idempotencyKey || !segundo.idempotencyKey) {
    failures.push(
      `idempotência: alguma das duas chamadas reais a POST /v3/videos saiu sem Idempotency-Key — ` +
        `1ª: ${JSON.stringify(primeiro.idempotencyKey)}, 2ª: ${JSON.stringify(segundo.idempotencyKey)}.`,
    );
  } else if (primeiro.idempotencyKey !== segundo.idempotencyKey) {
    failures.push(
      `idempotência: a Idempotency-Key não bateu entre as duas chamadas reais — 1ª: ` +
        `${primeiro.idempotencyKey.slice(0, 24)}…, 2ª: ${segundo.idempotencyKey.slice(0, 24)}…. Duas chamadas ` +
        "com o MESMO conteúdo (o duplo clique real) precisam mandar a MESMA chave, ou o fornecedor as trata " +
        "como duas tentativas distintas e anima (e cobra) duas vezes.",
    );
  }
  // O REPLAY em si: a resposta simulada da 2ª corrida é a MESMA da 1ª
  // (mesmo video_id) — confirma que generateVideo() não precisa de nenhum
  // tratamento especial para aceitar essa resposta como válida.
  if (primeiro.videoId !== VIDEO_ID_SIMULADO_DO_FORNECEDOR || segundo.videoId !== VIDEO_ID_SIMULADO_DO_FORNECEDOR) {
    failures.push(
      `idempotência: o providerJobId devolvido não foi o simulado nas duas corridas — 1ª: ` +
        `${JSON.stringify(primeiro.videoId)}, 2ª: ${JSON.stringify(segundo.videoId)}, esperado ambos ` +
        `${JSON.stringify(VIDEO_ID_SIMULADO_DO_FORNECEDOR)}.`,
    );
  }

  if (failures.length === 0) {
    notes.push(
      "  idempotência: duas chamadas reais idênticas a generateVideo() (o duplo clique) mandam a MESMA " +
        "Idempotency-Key ao POST /v3/videos real, e a 2ª aceita a resposta de replay (mesmo video_id da 1ª) " +
        "sem tratamento especial",
    );
  }

  return { failures, notes };
}
