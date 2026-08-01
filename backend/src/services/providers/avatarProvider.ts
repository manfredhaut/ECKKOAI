// Real integrations for avatar training + video generation, dispatched by
// vendor (see vendorCatalog.ts). Endpoint contracts below were confirmed
// against each vendor's live docs during implementation, EXCEPT where
// flagged "ASSUMPTION" — those are best-effort reads of ambiguous docs and
// are meant to be corrected against the real HTTP response on first use,
// same as the Gemini script adapter's model id was.
import { readUpload } from "../storage.js";
import { synthesizeSpeech } from "./voiceProvider.js";
import { processVoiceAudio } from "../audioProcessing.js";
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import { recordProviderUsage } from "../billing/usageTracking.js";
import { logVendorResponse, unexpectedShapeMessage } from "./vendorResponseLog.js";
import {
  countWords,
  estimateSeconds,
  logScriptDuration,
  SCRIPT_DURATION,
} from "../script/scriptDuration.js";
import type { AvatarVendor } from "./vendorCatalog.js";
import { isFixtureMode } from "./providerMode.js";
import { consumeLiveGeneration } from "./liveGuard.js";
import {
  checkAvatarConnectionFixture,
  generateVideoFixture,
  pollVideoJobFixture,
  trainAvatarFixture,
} from "./fixtureProvider.js";

export class AvatarProviderError extends Error {}

export interface TrainAvatarInput {
  apiKey: string;
  vendor: AvatarVendor;
  photoUrls: string[];
}

export interface TrainAvatarResult {
  providerAvatarId: string;
}

export interface GenerateVideoInput {
  apiKey: string;
  vendor: AvatarVendor;
  providerAvatarId: string;
  script: string;
  elevenLabsApiKey: string | null;
  voiceId: string | null;
  tenantId: string;
  audioTreatmentEnabled: boolean;
  audioTreatmentTargetLufs: number;
}

export interface GenerateVideoResult {
  providerJobId: string;
}

export type PollResult =
  | { status: "processing" }
  | { status: "ready"; outputUrl: string }
  | { status: "error"; errorMessage: string };

async function requireAudio(input: GenerateVideoInput): Promise<Buffer> {
  if (!input.elevenLabsApiKey || !input.voiceId) {
    throw new AvatarProviderError(
      "No cloned voice available — connect ElevenLabs in Settings and finish avatar setup with a reference recording before generating a video.",
    );
  }
  const synthesized = await synthesizeSpeech(input.elevenLabsApiKey, input.voiceId, input.script);
  await recordProviderUsage({
    tenantId: input.tenantId,
    provider: "voice",
    vendor: "elevenlabs",
    unitType: "characters",
    unitCount: input.script.length,
  });

  // Único ponto do sistema onde a duração REAL do que vai ser falado é
  // conhecida. É aqui que a estimativa de scriptDuration.ts encontra a
  // medição — e é comparando as duas ao longo de várias gerações que o
  // words-per-minute deixa de ser chute. Só registra; não bloqueia nada.
  const words = countWords(input.script);
  logScriptDuration({
    tenantId: input.tenantId,
    stage: "synthesis",
    words,
    estimatedSeconds: estimateSeconds(words),
    targetSeconds: SCRIPT_DURATION.targetSeconds,
    actualSeconds: synthesized.durationSeconds,
    actualSource: synthesized.source,
  });

  return processVoiceAudio(input.tenantId, synthesized.audio, {
    enabled: input.audioTreatmentEnabled,
    targetLufs: input.audioTreatmentTargetLufs,
  });
}

/**
 * `context` identifica QUAL chamada produziu a resposta ("heygen.createAvatar"
 * etc.). Sem ele, quatro corpos parecidos no log ficam indistinguíveis, e o
 * log existe justamente para ser lido depois do fato.
 *
 * O corpo é lido como texto UMA vez e registrado bruto antes de qualquer
 * interpretação — inclusive antes de saber se é JSON válido. Trocar `res.json()`
 * por texto+parse também melhora o caso de HTML/504 vindo de um proxy: em vez
 * de um erro de sintaxe sem contexto, o corpo real aparece no erro e no log.
 */
async function fetchJson(res: Response, providerLabel: string, context: string): Promise<any> {
  const rawBody = await res.text();
  logVendorResponse({ context, vendor: providerLabel, status: res.status, res, rawBody });

  if (!res.ok) {
    throw new AvatarProviderError(`${providerLabel} API error (${res.status}): ${rawBody}`);
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new AvatarProviderError(
      `${context}: ${providerLabel} respondeu ${res.status} com corpo que não é JSON: ${rawBody}`,
    );
  }
}

// ---------------------------------------------------------------------------
// HeyGen
// ---------------------------------------------------------------------------

const HEYGEN_BASE = "https://api.heygen.com";

async function heygenUploadAsset(apiKey: string, buffer: Buffer, mimeType: string): Promise<string> {
  let res: Response;
  try {
    const form = new FormData();
    const extension = mimeType.split("/")[1] ?? "bin";
    form.set("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), `asset.${extension}`);
    res = await fetch(`${HEYGEN_BASE}/v3/assets`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
    });
  } catch (err) {
    logProviderNetworkError("avatarProvider.heygen", err);
    throw new AvatarProviderError(`Could not reach HeyGen API: ${describeNetworkError(err)}`);
  }
  const data = await fetchJson(res, "HeyGen", "heygen.uploadAsset");
  const assetId = data?.data?.asset_id;
  if (!assetId) {
    throw new AvatarProviderError(unexpectedShapeMessage("heygen.uploadAsset", "data.asset_id", data));
  }
  return assetId;
}

async function trainAvatarHeygen(apiKey: string, photoBuffer: Buffer): Promise<TrainAvatarResult> {
  const assetId = await heygenUploadAsset(apiKey, photoBuffer, "image/jpeg");

  let res: Response;
  try {
    res = await fetch(`${HEYGEN_BASE}/v3/avatars`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        type: "photo",
        name: `twinai-${Date.now()}`,
        file: { type: "asset_id", asset_id: assetId },
      }),
    });
  } catch (err) {
    logProviderNetworkError("avatarProvider.heygen", err);
    throw new AvatarProviderError(`Could not reach HeyGen API: ${describeNetworkError(err)}`);
  }
  const data = await fetchJson(res, "HeyGen", "heygen.createAvatar");
  // ASSUMPTION: avatar_item.id is the "look" id usable as avatar_id in video
  // generation. NUNCA confirmada contra resposta real, e é o contrato mais caro
  // deste arquivo: quando ele falha, a HeyGen já cobrou pela criação, e o id —
  // única coisa que torna aquele avatar utilizável — se perderia junto com o
  // corpo descartado. Por isso o corpo inteiro vai para o log ANTES desta
  // linha, e o erro abaixo nomeia as chaves que realmente vieram.
  const avatarId = data?.data?.avatar_item?.id;
  if (!avatarId) {
    throw new AvatarProviderError(unexpectedShapeMessage("heygen.createAvatar", "data.avatar_item.id", data));
  }
  return { providerAvatarId: avatarId };
}

async function generateVideoHeygen(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const audio = await requireAudio(input);
  const audioAssetId = await heygenUploadAsset(input.apiKey, audio, "audio/mpeg");

  let res: Response;
  try {
    res = await fetch(`${HEYGEN_BASE}/v3/videos`, {
      method: "POST",
      headers: { "x-api-key": input.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        type: "avatar",
        avatar_id: input.providerAvatarId,
        audio_asset_id: audioAssetId,
      }),
    });
  } catch (err) {
    logProviderNetworkError("avatarProvider.heygen", err);
    throw new AvatarProviderError(`Could not reach HeyGen API: ${describeNetworkError(err)}`);
  }
  const data = await fetchJson(res, "HeyGen", "heygen.createVideo");
  const videoId = data?.data?.video_id;
  if (!videoId) {
    throw new AvatarProviderError(unexpectedShapeMessage("heygen.createVideo", "data.video_id", data));
  }
  return { providerJobId: videoId };
}

async function pollHeygenVideo(apiKey: string, jobId: string): Promise<PollResult> {
  let res: Response;
  try {
    res = await fetch(`${HEYGEN_BASE}/v3/videos/${encodeURIComponent(jobId)}`, {
      headers: { "x-api-key": apiKey },
    });
  } catch (err) {
    logProviderNetworkError("avatarProvider.heygen", err);
    throw new AvatarProviderError(`Could not reach HeyGen API: ${describeNetworkError(err)}`);
  }
  const data = await fetchJson(res, "HeyGen", "heygen.pollVideo");
  const status: string | undefined = data?.data?.status ?? data?.status;
  const videoUrl: string | undefined = data?.data?.video_url ?? data?.video_url;

  // ARMADILHA CONHECIDA, deliberadamente NÃO corrigida neste bloco (escopo:
  // só logging). Quando o fornecedor diz "completed" mas não manda a URL, o
  // `return` de "processing" lá embaixo assume o caso: o job fica em polling
  // até estourar o teto de ~7,5 min e vira "demorou mais que o esperado" —
  // uma mensagem que aponta para o lado errado, já que o vídeo FICOU pronto e
  // foi cobrado. Aqui isso passa a gritar no log com as chaves que vieram, que
  // é o que permite reconhecer o caso em vez de perseguir um timeout fantasma.
  if (status === "completed" && !videoUrl) {
    console.error(
      JSON.stringify({
        event: "vendor_contract_mismatch",
        context: "heygen.pollVideo",
        detail: unexpectedShapeMessage("heygen.pollVideo", "data.video_url", data),
      }),
    );
  }

  if (status === "completed" && videoUrl) return { status: "ready", outputUrl: videoUrl };
  if (status === "failed" || status === "error") {
    return { status: "error", errorMessage: data?.data?.error?.message ?? `HeyGen job failed: ${JSON.stringify(data)}` };
  }
  return { status: "processing" };
}

async function checkHeygenConnection(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${HEYGEN_BASE}/v2/user/remaining_quota`, { headers: { "x-api-key": apiKey } });
  } catch (err) {
    logProviderNetworkError("avatarProvider.heygen", err);
    throw new AvatarProviderError(`Could not reach HeyGen API: ${describeNetworkError(err)}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new AvatarProviderError(`HeyGen API error (${res.status}): ${body}`);
  }
}

// ---------------------------------------------------------------------------
// D-ID
// ---------------------------------------------------------------------------

const DID_BASE = "https://api.d-id.com";

// ASSUMPTION: D-ID API keys are used as the "username" half of HTTP Basic
// auth with an empty password (Authorization: Basic base64(apiKey + ":")).
// The docs don't spell this out explicitly — confirm/fix against the real
// 401 (or lack thereof) on first use.
function didAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

async function didUpload(apiKey: string, buffer: Buffer, filename: string, mimeType: string, kind: "images" | "audios"): Promise<string> {
  const form = new FormData();
  form.set(kind === "images" ? "image" : "audio", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

  let res: Response;
  try {
    res = await fetch(`${DID_BASE}/${kind}`, {
      method: "POST",
      headers: { authorization: didAuthHeader(apiKey) },
      body: form,
    });
  } catch (err) {
    logProviderNetworkError("avatarProvider.did", err);
    throw new AvatarProviderError(`Could not reach D-ID API: ${describeNetworkError(err)}`);
  }
  const data = await fetchJson(res, "D-ID", `did.upload.${kind}`);
  const url = data?.url;
  if (!url) throw new AvatarProviderError(unexpectedShapeMessage(`did.upload.${kind}`, "url", data));
  return url;
}

async function trainAvatarDid(apiKey: string, photoBuffer: Buffer): Promise<TrainAvatarResult> {
  // D-ID has no separate "train" step — the hosted image URL itself is the
  // reference used directly in each talk's source_url.
  const url = await didUpload(apiKey, photoBuffer, "avatar.jpg", "image/jpeg", "images");
  return { providerAvatarId: url };
}

async function generateVideoDid(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const audio = await requireAudio(input);
  const audioUrl = await didUpload(input.apiKey, audio, "script.mp3", "audio/mpeg", "audios");

  let res: Response;
  try {
    res = await fetch(`${DID_BASE}/talks`, {
      method: "POST",
      headers: { authorization: didAuthHeader(input.apiKey), "content-type": "application/json" },
      body: JSON.stringify({
        source_url: input.providerAvatarId,
        script: { type: "audio", audio_url: audioUrl },
      }),
    });
  } catch (err) {
    logProviderNetworkError("avatarProvider.did", err);
    throw new AvatarProviderError(`Could not reach D-ID API: ${describeNetworkError(err)}`);
  }
  const data = await fetchJson(res, "D-ID", "did.createTalk");
  const talkId = data?.id;
  if (!talkId) throw new AvatarProviderError(unexpectedShapeMessage("did.createTalk", "id", data));
  return { providerJobId: talkId };
}

async function pollDidTalk(apiKey: string, jobId: string): Promise<PollResult> {
  let res: Response;
  try {
    res = await fetch(`${DID_BASE}/talks/${encodeURIComponent(jobId)}`, {
      headers: { authorization: didAuthHeader(apiKey) },
    });
  } catch (err) {
    logProviderNetworkError("avatarProvider.did", err);
    throw new AvatarProviderError(`Could not reach D-ID API: ${describeNetworkError(err)}`);
  }
  const data = await fetchJson(res, "D-ID", "did.pollTalk");
  // Mesma armadilha registrada no poll da HeyGen: "done" sem URL cai no
  // "processing" e vira timeout, apontando para o lado errado.
  if (data?.status === "done" && !data?.result_url) {
    console.error(
      JSON.stringify({
        event: "vendor_contract_mismatch",
        context: "did.pollTalk",
        detail: unexpectedShapeMessage("did.pollTalk", "result_url", data),
      }),
    );
  }
  if (data?.status === "done" && data?.result_url) return { status: "ready", outputUrl: data.result_url };
  if (data?.status === "error" || data?.status === "rejected") {
    return { status: "error", errorMessage: data?.error?.description ?? `D-ID talk failed: ${JSON.stringify(data)}` };
  }
  return { status: "processing" };
}

async function checkDidConnection(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${DID_BASE}/credits`, { headers: { authorization: didAuthHeader(apiKey) } });
  } catch (err) {
    logProviderNetworkError("avatarProvider.did", err);
    throw new AvatarProviderError(`Could not reach D-ID API: ${describeNetworkError(err)}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new AvatarProviderError(`D-ID API error (${res.status}): ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Vendor dispatch
// ---------------------------------------------------------------------------

// Toda função exportada daqui passa por isFixtureMode() ANTES de qualquer
// chamada de rede. Este é o ponto único de decisão para o provedor de
// avatar/vídeo, e `npm run check` reprova o build se alguma export deste
// arquivo deixar de consultá-lo — ver scripts/checkProviderMode.ts.

export async function trainAvatar(input: TrainAvatarInput): Promise<TrainAvatarResult> {
  if (input.photoUrls.length === 0) {
    throw new AvatarProviderError("At least one face photo is required to train an avatar.");
  }
  if (isFixtureMode()) return trainAvatarFixture();
  const photoBuffer = await readUpload(input.photoUrls[0]);
  return input.vendor === "did" ? trainAvatarDid(input.apiKey, photoBuffer) : trainAvatarHeygen(input.apiKey, photoBuffer);
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  if (isFixtureMode()) return generateVideoFixture(input);

  // Teto por sessão: protege contra o laço que dispara N vezes, que nenhuma
  // declaração de intenção no boot impediria.
  const budget = consumeLiveGeneration();
  if (!budget.allowed) {
    throw new AvatarProviderError(
      `Teto de gerações tarifadas desta sessão atingido (${budget.used}/${budget.max}). ` +
        "Reinicie o servidor ou aumente PROVIDER_LIVE_MAX_GENERATIONS conscientemente.",
    );
  }
  return input.vendor === "did" ? generateVideoDid(input) : generateVideoHeygen(input);
}

export async function pollVideoJob(vendor: AvatarVendor, apiKey: string, jobId: string): Promise<PollResult> {
  if (isFixtureMode()) return pollVideoJobFixture(jobId);
  return vendor === "did" ? pollDidTalk(apiKey, jobId) : pollHeygenVideo(apiKey, jobId);
}

export async function checkAvatarConnection(apiKey: string, vendor: AvatarVendor): Promise<void> {
  if (isFixtureMode()) return checkAvatarConnectionFixture();
  return vendor === "did" ? checkDidConnection(apiKey) : checkHeygenConnection(apiKey);
}
