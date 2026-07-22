// Real integration: ElevenLabs instant voice cloning. Only vendor today —
// see vendorCatalog.ts.
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
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

export async function cloneVoice(input: CloneVoiceInput): Promise<CloneVoiceResult> {
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

// Text-to-speech using a cloned voice — used by avatarProvider.ts to
// synthesize the video script in the tenant's own cloned voice before
// handing the audio to HeyGen/D-ID.
export async function synthesizeSpeech(apiKey: string, voiceId: string, text: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.synthesizeSpeech", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new VoiceProviderError(`ElevenLabs API error (${res.status}): ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
