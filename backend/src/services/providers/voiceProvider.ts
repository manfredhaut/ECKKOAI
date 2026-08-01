// Real integration: ElevenLabs instant voice cloning. Only vendor today —
// see vendorCatalog.ts.
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import { isFixtureMode } from "./providerMode.js";
import { consumeLiveGeneration } from "./liveGuard.js";
import {
  checkVoiceConnectionFixture,
  cloneVoiceFixture,
  synthesizeSpeechFixture,
} from "./fixtureProvider.js";
const ELEVENLABS_ADD_VOICE_URL = "https://api.elevenlabs.io/v1/voices/add";
const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices";

export class VoiceProviderError extends Error {}

export interface CloneVoiceInput {
  apiKey: string;
  name: string;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface CloneVoiceResult {
  voiceId: string;
}

// Toda export deste arquivo consulta isFixtureMode() antes de qualquer
// chamada de rede — ver scripts/checkProviderMode.ts, que reprova o build
// se alguma deixar de consultar.
export async function cloneVoice(input: CloneVoiceInput): Promise<CloneVoiceResult> {
  if (isFixtureMode()) return cloneVoiceFixture();
  const budget = consumeLiveGeneration();
  if (!budget.allowed) {
    throw new VoiceProviderError(
      `Teto de gerações tarifadas desta sessão atingido (${budget.used}/${budget.max}).`,
    );
  }
  const form = new FormData();
  form.set("name", input.name);
  form.set("files", new Blob([new Uint8Array(input.fileBuffer)], { type: input.mimeType }), input.filename);

  let res: Response;
  try {
    res = await fetch(ELEVENLABS_ADD_VOICE_URL, {
      method: "POST",
      headers: { "xi-api-key": input.apiKey },
      body: form,
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.cloneVoice", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new VoiceProviderError(`ElevenLabs API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { voice_id?: string };
  if (!data.voice_id) throw new VoiceProviderError("ElevenLabs API returned no voice_id");
  return { voiceId: data.voice_id };
}

// Cheap authenticated call used by POST /credentials/voice/test — lists the
// tenant's voices instead of a real clone, so testing a key doesn't spend a
// voice slot.
export async function checkElevenLabsConnection(apiKey: string): Promise<void> {
  if (isFixtureMode()) return checkVoiceConnectionFixture();
  let res: Response;
  try {
    res = await fetch(ELEVENLABS_VOICES_URL, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.checkElevenLabsConnection", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new VoiceProviderError(`ElevenLabs API error (${res.status}): ${body}`);
  }
}

export interface SynthesizedSpeech {
  audio: Buffer;
  /** Duração real do áudio, quando pôde ser determinada. */
  durationSeconds: number | null;
  source: "elevenlabs_timestamps" | "bitrate_estimate" | null;
}

// Bitrate do formato padrão do ElevenLabs (mp3_44100_128). Só é usado no
// fallback abaixo, para não deixar o log de duração cego quando o endpoint
// com timestamps não está disponível.
const DEFAULT_MP3_BITRATE_BPS = 128_000;

// Text-to-speech using a cloned voice — used by avatarProvider.ts to
// synthesize the video script in the tenant's own cloned voice before
// handing the audio to HeyGen/D-ID.
//
// Prefere o endpoint /with-timestamps porque ele devolve, junto do áudio, o
// tempo final de cada caractere — ou seja, a duração REAL medida pelo próprio
// vendor. É esse número que permite calibrar o words-per-minute de
// scriptDuration.ts com dado em vez de opinião. Se o endpoint não estiver
// disponível para a chave/plano em uso, cai no endpoint simples e estima pela
// taxa de bits, marcando a origem para que estimativa nunca seja confundida
// com medição.
export async function synthesizeSpeech(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<SynthesizedSpeech> {
  if (isFixtureMode()) return synthesizeSpeechFixture();
  const base = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  let res: Response;
  try {
    res = await fetch(`${base}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.synthesizeSpeech", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }

  if (res.ok) {
    const data = (await res.json()) as {
      audio_base64?: string;
      alignment?: { character_end_times_seconds?: number[] };
      normalized_alignment?: { character_end_times_seconds?: number[] };
    };
    if (data.audio_base64) {
      const ends =
        data.alignment?.character_end_times_seconds ??
        data.normalized_alignment?.character_end_times_seconds;
      const last = ends && ends.length > 0 ? ends[ends.length - 1] : null;
      return {
        audio: Buffer.from(data.audio_base64, "base64"),
        durationSeconds: last != null ? Number(last.toFixed(2)) : null,
        source: last != null ? "elevenlabs_timestamps" : null,
      };
    }
  }

  // Fallback: endpoint simples. Um 4xx aqui é erro de verdade (chave, voz,
  // texto) e sobe; o with-timestamps acima pode ter falhado só por não estar
  // liberado para o plano, e isso não deve impedir a geração do vídeo.
  let plain: Response;
  try {
    plain = await fetch(base, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.synthesizeSpeech", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }
  if (!plain.ok) {
    const body = await plain.text();
    throw new VoiceProviderError(`ElevenLabs API error (${plain.status}): ${body}`);
  }

  const audio = Buffer.from(await plain.arrayBuffer());
  return {
    audio,
    durationSeconds: Number(((audio.length * 8) / DEFAULT_MP3_BITRATE_BPS).toFixed(2)),
    source: "bitrate_estimate",
  };
}
