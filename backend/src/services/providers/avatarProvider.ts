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
import type { AvatarVendor } from "./vendorCatalog.js";

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
  return processVoiceAudio(input.tenantId, synthesized, {
    enabled: input.audioTreatmentEnabled,
    targetLufs: input.audioTreatmentTargetLufs,
  });
}

async function fetchJson(res: Response, providerLabel: string): Promise<any> {
  if (!res.ok) {
    const body = await res.text();
    throw new AvatarProviderError(`${providerLabel} API error (${res.status}): ${body}`);
  }
  return res.json();
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
  const data = await fetchJson(res, "HeyGen");
  const assetId = data?.data?.asset_id;
  if (!assetId) throw new AvatarProviderError(`HeyGen asset upload returned no asset_id: ${JSON.stringify(data)}`);
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
  const data = await fetchJson(res, "HeyGen");
  // ASSUMPTION: avatar_item.id is the "look" id usable as avatar_id in video generation.
  const avatarId = data?.data?.avatar_item?.id;
  if (!avatarId) throw new AvatarProviderError(`HeyGen avatar creation returned no id: ${JSON.stringify(data)}`);
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
  const data = await fetchJson(res, "HeyGen");
  const videoId = data?.data?.video_id;
  if (!videoId) throw new AvatarProviderError(`HeyGen video creation returned no video_id: ${JSON.stringify(data)}`);
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
  const data = await fetchJson(res, "HeyGen");
  const status: string | undefined = data?.data?.status ?? data?.status;
  const videoUrl: string | undefined = data?.data?.video_url ?? data?.video_url;
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
  const data = await fetchJson(res, "D-ID");
  const url = data?.url;
  if (!url) throw new AvatarProviderError(`D-ID ${kind} upload returned no url: ${JSON.stringify(data)}`);
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
  const data = await fetchJson(res, "D-ID");
  const talkId = data?.id;
  if (!talkId) throw new AvatarProviderError(`D-ID talk creation returned no id: ${JSON.stringify(data)}`);
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
  const data = await fetchJson(res, "D-ID");
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

export async function trainAvatar(input: TrainAvatarInput): Promise<TrainAvatarResult> {
  if (input.photoUrls.length === 0) {
    throw new AvatarProviderError("At least one face photo is required to train an avatar.");
  }
  const photoBuffer = await readUpload(input.photoUrls[0]);
  return input.vendor === "did" ? trainAvatarDid(input.apiKey, photoBuffer) : trainAvatarHeygen(input.apiKey, photoBuffer);
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  return input.vendor === "did" ? generateVideoDid(input) : generateVideoHeygen(input);
}

export async function pollVideoJob(vendor: AvatarVendor, apiKey: string, jobId: string): Promise<PollResult> {
  return vendor === "did" ? pollDidTalk(apiKey, jobId) : pollHeygenVideo(apiKey, jobId);
}

export async function checkAvatarConnection(apiKey: string, vendor: AvatarVendor): Promise<void> {
  return vendor === "did" ? checkDidConnection(apiKey) : checkHeygenConnection(apiKey);
}
