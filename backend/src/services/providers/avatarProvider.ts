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
import { contractMismatch, logVendorResponse, unexpectedShapeMessage } from "./vendorResponseLog.js";
import {
  countWords,
  estimateSeconds,
  logScriptDuration,
  SCRIPT_DURATION,
} from "../script/scriptDuration.js";
import type { AvatarVendor } from "./vendorCatalog.js";
import { isFixtureMode } from "./providerMode.js";
import { consumeLiveGeneration, LiveBudgetExhaustedError } from "./liveGuard.js";
import {
  checkAvatarConnectionFixture,
  generateVideoFixture,
  pollVideoJobFixture,
  trainAvatarFixture,
  waitForAvatarReadyFixture,
} from "./fixtureProvider.js";

export class AvatarProviderError extends Error {}

export interface TrainAvatarInput {
  apiKey: string;
  vendor: AvatarVendor;
  photoUrls: string[];
}

/**
 * Estado do avatar no fornecedor.
 *
 * "unknown" NÃO é um erro: é a resposta honesta para "perguntei e não entendi",
 * e o portão de geração trata como liberado. Uma suposição nossa errada sobre o
 * formato da resposta não pode impedir o cliente de usar um avatar que já foi
 * pago.
 */
export type AvatarProviderStatus = "ready" | "processing" | "unknown";

export interface TrainAvatarResult {
  providerAvatarId: string;
  status: AvatarProviderStatus;
}

/**
 * Traduz o texto de status do fornecedor para o nosso vocabulário.
 *
 * Qualquer valor fora do conhecido vira "unknown" — e portanto LIBERA — em vez
 * de virar "processing" e travar. O custo de errar para o lado permissivo é uma
 * tentativa de geração que o fornecedor recusa; o de errar para o restritivo é
 * um avatar pago que nunca pode ser usado.
 */
export function normalizeAvatarStatus(raw: unknown): AvatarProviderStatus {
  const value = String(raw ?? "").toLowerCase();
  if (["ready", "completed", "success", "done", "active"].includes(value)) return "ready";
  if (["processing", "pending", "training", "in_progress", "queued"].includes(value)) return "processing";
  return "unknown";
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
  // Medido em live (DEMO-3): vem "processing". O avatar existe e já foi
  // cobrado, mas ainda não serve para gerar vídeo.
  return {
    providerAvatarId: avatarId,
    status: normalizeAvatarStatus(data?.data?.avatar_item?.status),
  };
}

/**
 * Pergunta ao fornecedor se o avatar já está pronto.
 *
 * ASSUMPTION: `GET /v3/avatars/{id}` é o caminho de leitura do avatar criado
 * por `POST /v3/avatars`. É a forma REST natural, mas NÃO foi confirmada
 * contra resposta real — o único corpo que já vimos é o da criação.
 *
 * Por isso o modo de falha é deliberadamente permissivo: qualquer erro de rede,
 * status HTTP ruim ou formato inesperado devolve "unknown", que LIBERA a
 * geração. Se a suposição estiver errada, o resultado é o comportamento de
 * antes deste bloco — e não um avatar pago preso para sempre. O corpo bruto
 * vai para o log (evento `vendor_response`) em qualquer caso, que é como esta
 * suposição será confirmada ou corrigida no primeiro uso live.
 */
async function pollAvatarStatusHeygen(apiKey: string, avatarId: string): Promise<AvatarProviderStatus> {
  try {
    const res = await fetch(`${HEYGEN_BASE}/v3/avatars/${encodeURIComponent(avatarId)}`, {
      headers: { "x-api-key": apiKey },
    });
    const data = await fetchJson(res, "HeyGen", "heygen.getAvatar");
    return normalizeAvatarStatus(data?.data?.avatar_item?.status ?? data?.data?.status ?? data?.status);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "avatar_status_unreadable",
        context: "heygen.getAvatar",
        detail: err instanceof Error ? err.message : String(err),
        consequence: "tratado como 'unknown', o que LIBERA a geração",
      }),
    );
    return "unknown";
  }
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

  // Concluído sem URL: falha AGORA, não daqui a 7,5 minutos.
  //
  // Antes, este caso caía no `return` de "processing" lá embaixo e o job ficava
  // em polling até estourar o teto, terminando como "demorou mais que o
  // esperado" — uma mensagem que aponta para o lado errado. O vídeo não
  // demorou: ficou pronto, foi cobrado, e nós é que não soubemos ler a
  // resposta. Esperar não conserta contrato quebrado; só atrasa o diagnóstico
  // e desperdiça 90 chamadas de polling.
  if (status === "completed" && !videoUrl) {
    return { status: "error", errorMessage: contractMismatch("heygen.pollVideo", "data.video_url", data) };
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
  // Sem etapa de treino, não há o que esperar: a imagem hospedada já é o
  // avatar. "ready" aqui é fato do desenho da D-ID, não suposição.
  return { providerAvatarId: url, status: "ready" };
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
  // Mesma armadilha da HeyGen, mesmo tratamento — ver o comentário lá.
  if (data?.status === "done" && !data?.result_url) {
    return { status: "error", errorMessage: contractMismatch("did.pollTalk", "result_url", data) };
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

/** Quanto tempo esperar o avatar ficar pronto, e de quanto em quanto. */
const AVATAR_READY_TIMEOUT_MS = 90_000;
const AVATAR_READY_INTERVAL_MS = 5_000;

/**
 * Espera o avatar sair de "processing".
 *
 * Roda DENTRO da requisição de treino, e não num laço de fundo, porque o
 * resultado muda o que a tela mostra em seguida: sem esperar, o cliente
 * termina a configuração achando que pode gerar vídeo e leva uma recusa do
 * fornecedor na etapa seguinte — que é a cara.
 *
 * Estourar o tempo NÃO é erro: devolve "processing", que é a verdade. O
 * fornecedor continua treinando, o avatar continua pago e válido, e a tela
 * passa a dizer "em treino" em vez de "falhou". Quem estoura o tempo aqui é a
 * nossa paciência, não o avatar.
 */
export async function waitForAvatarReady(
  vendor: AvatarVendor,
  apiKey: string,
  providerAvatarId: string,
  initialStatus: AvatarProviderStatus,
): Promise<AvatarProviderStatus> {
  if (initialStatus !== "processing") return initialStatus;
  // Só a HeyGen tem etapa de treino; a D-ID já volta pronta.
  if (vendor === "did") return "ready";
  if (isFixtureMode()) return waitForAvatarReadyFixture(providerAvatarId);

  const deadline = Date.now() + AVATAR_READY_TIMEOUT_MS;
  let status: AvatarProviderStatus = initialStatus;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, AVATAR_READY_INTERVAL_MS));
    status = await pollAvatarStatusHeygen(apiKey, providerAvatarId);
    // "unknown" encerra a espera: se não conseguimos ler o estado, insistir
    // 18 vezes não vai melhorar, e o portão de geração trata unknown como
    // liberado de propósito.
    if (status !== "processing") return status;
  }
  return "processing";
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  if (isFixtureMode()) return generateVideoFixture(input);

  // Teto por sessão: protege contra o laço que dispara N vezes, que nenhuma
  // declaração de intenção no boot impediria.
  const budget = consumeLiveGeneration("geração de vídeo");
  if (!budget.allowed) {
    throw new LiveBudgetExhaustedError(budget.used, budget.max, "gerar vídeo");
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
