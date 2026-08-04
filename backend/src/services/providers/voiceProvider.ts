// Real integration: ElevenLabs instant voice cloning. Only vendor today —
// see vendorCatalog.ts.
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import { isFixtureMode } from "./providerMode.js";
import { withLiveBudget } from "./liveGuard.js";
import { logVendorBinaryResponse, logVendorResponse } from "./vendorResponseLog.js";
import {
  checkVoiceConnectionFixture,
  cloneVoiceFixture,
  listVoicesFixture,
  synthesizeSpeechFixture,
} from "./fixtureProvider.js";
import { countOwnedVoices } from "../voice/voiceSample.js";
const ELEVENLABS_ADD_VOICE_URL = "https://api.elevenlabs.io/v1/voices/add";
const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices";

export class VoiceProviderError extends Error {}

/**
 * Lê o corpo como texto, REGISTRA e só então interpreta — o mesmo contrato do
 * `fetchJson()` do avatarProvider, e pela mesma razão.
 *
 * Até o bloco LIVE-2 este arquivo fazia `res.json()` direto, então nenhuma
 * resposta do ElevenLabs jamais foi registrada. Medido na passada live: a
 * geração gravou 50 caracteres de voz em `provider_usage` e produziu ZERO
 * eventos `vendor_response` de voz. Os dois caminhos que gastam dinheiro no
 * ElevenLabs eram exatamente os que não deixavam rastro do que o fornecedor
 * respondeu — o oposto do que o LOG-1 foi construído para garantir.
 */
async function readVoiceJson(res: Response, context: string): Promise<any> {
  const rawBody = await res.text();
  logVendorResponse({ context, vendor: "ElevenLabs", status: res.status, res, rawBody });

  if (!res.ok) {
    throw new VoiceProviderError(`ElevenLabs API error (${res.status}): ${rawBody}`);
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new VoiceProviderError(
      `${context}: ElevenLabs respondeu ${res.status} com corpo que não é JSON: ${rawBody}`,
    );
  }
}

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
  // `withLiveBudget` consome o teto ANTES da chamada e devolve o GASTO se
  // esta função lançar — a tentativa continua contada. O wrapper existe para
  // que consumo e devolução não possam ser separados por um refactor: um
  // `catch` esquecido aqui reintroduziria o defeito sem sintoma nenhum.
  return withLiveBudget("clonagem de voz", "clonar voz", async () => {
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

    const data = (await readVoiceJson(res, "elevenlabs.cloneVoice")) as { voice_id?: string };
    if (!data.voice_id) throw new VoiceProviderError("ElevenLabs API returned no voice_id");
    return { voiceId: data.voice_id };
  });
}

export interface VoiceInventory {
  /**
   * Quantos itens a resposta trouxe, INCLUINDO as `premade` da biblioteca do
   * fornecedor. Serve para diagnóstico e para o log — nunca para a guarda de
   * slots. Usá-lo ali foi o defeito de 04/08: 25 aqui contra 4 vozes reais.
   */
  total: number;
  /** Quantas OCUPAM slot da conta. É ESTE o número que a guarda consome. */
  owned: number;
  /** Quantas delas são clones — subconjunto de `owned`. */
  cloned: number;
}

/**
 * Inventário de vozes da conta, LIDO do fornecedor.
 *
 * Existe para a guarda de slots (`checkVoiceSlots`): clonar consome um slot
 * irreversível, e este produto não tem caminho de exclusão, então a decisão de
 * "cabe mais uma?" precisa de um número real e não de um palpite.
 *
 * `GET /v1/voices` é leitura e NÃO é tarifado — é o mesmo endpoint que o teste
 * de credencial e o probe do painel já usam. O que ele NÃO traz é o TETO da
 * conta: `voice_limit` vive em `/v1/user/subscription`, que responde 401 com
 * esta chave por falta da permissão `user_read` (medido no LIVE-3). Por isso o
 * teto entra por ambiente e só o usado é medido — ver voiceSample.ts.
 */
export async function listVoices(apiKey: string): Promise<VoiceInventory> {
  if (isFixtureMode()) return listVoicesFixture();
  let res: Response;
  try {
    res = await fetch(ELEVENLABS_VOICES_URL, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.listVoices", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }
  const data = (await readVoiceJson(res, "elevenlabs.listVoices")) as {
    voices?: { category?: string }[];
  };
  // Forma inesperada NÃO vira zero. Zero passaria pela guarda de slots como
  // "conta vazia, pode clonar" — o veredito mais perigoso possível a partir de
  // uma resposta que não entendemos.
  if (!Array.isArray(data.voices)) {
    throw new VoiceProviderError(
      `elevenlabs.listVoices: esperado data.voices como lista, recebido ${JSON.stringify(
        Object.keys(data ?? {}),
      )}`,
    );
  }
  // A contagem que a guarda consome mora na política pura (`voiceSample.ts`),
  // e não aqui, pelo mesmo motivo das outras quatro guardas: assim ela é
  // exercitável com um inventário construído em memória, sem chave e sem rede.
  // Enquanto ela era um `.length` embutido nesta função, o único jeito de
  // conferi-la era chamando o fornecedor — e foi por isso que o defeito das
  // vozes `premade` sobreviveu até aparecer numa tentativa real.
  return {
    total: data.voices.length,
    owned: countOwnedVoices(data.voices),
    cloned: data.voices.filter((v) => v?.category === "cloned").length,
  };
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
  await readVoiceJson(res, "elevenlabs.listVoices");
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

/**
 * Modelo de síntese, SEMPRE explícito.
 *
 * Antes desta constante o corpo da requisição era `{ text }` e mais nada, nos
 * dois ramos — o modelo ficava por conta do padrão do fornecedor. É a MESMA
 * classe de defeito que o bloco FORMATO-1 tirou do payload de vídeo, e a
 * mesma frase se aplica: escolher por omissão é escolher mesmo assim.
 *
 * Aqui a omissão custa mais que lá, porque o produto é vendido em português.
 * O padrão documentado desta rota é um modelo monolíngue de inglês; um roteiro
 * em português sintetizado por ele sai com fonética errada, e o resultado é
 * indistinguível — para quem ouve — de "a clonagem não funcionou". O timbre
 * até pode ser o da pessoa; a pronúncia não é a dela.
 *
 * **NÃO CONFIRMADO qual é o padrão em uso**: `GET /v1/models` responde 401 com
 * a chave deste tenant (falta permissão de leitura, mesma limitação já
 * registrada para `/v1/user/subscription`), então não foi possível enumerar os
 * modelos nem ler qual é o default. O que está medido é que nós não mandávamos
 * nenhum. Mandar um explicitamente é correto independentemente de qual era o
 * padrão — é justamente por não sabermos que ele não pode ficar implícito.
 *
 * Configurável por ambiente para que trocar de modelo não exija rebuild: se
 * este valor não for aceito pelo plano, a síntese falha, a geração inteira
 * falha junto, e o conserto precisa caber numa variável.
 */
export const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_multilingual_v2";

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
      body: JSON.stringify({ text, model_id: ELEVENLABS_TTS_MODEL }),
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.synthesizeSpeech", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }

  // Registrado nos DOIS desfechos: um 4xx aqui não é erro fatal (o endpoint
  // com timestamps pode simplesmente não estar liberado para o plano), e é
  // justamente esse corpo que explica por que caímos no fallback.
  const rawTimestamps = await res.text();
  logVendorResponse({
    context: "elevenlabs.synthesizeWithTimestamps",
    vendor: "ElevenLabs",
    status: res.status,
    res,
    rawBody: rawTimestamps,
  });

  if (res.ok) {
    let data: {
      audio_base64?: string;
      alignment?: { character_end_times_seconds?: number[] };
      normalized_alignment?: { character_end_times_seconds?: number[] };
    };
    try {
      data = JSON.parse(rawTimestamps);
    } catch {
      throw new VoiceProviderError(
        `elevenlabs.synthesizeWithTimestamps: ElevenLabs respondeu ${res.status} com corpo que não é JSON.`,
      );
    }
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
      // O MESMO modelo do ramo acima. Dois ramos com modelos diferentes
      // produziriam vozes diferentes conforme o endpoint que respondesse — um
      // defeito que só apareceria de forma intermitente.
      body: JSON.stringify({ text, model_id: ELEVENLABS_TTS_MODEL }),
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.synthesizeSpeech", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }
  if (!plain.ok) {
    // Falhou: o corpo é texto de erro, e vai INTEIRO para o log — aqui não há
    // áudio nenhum a proteger, e é o corpo que diz o motivo.
    const body = await plain.text();
    logVendorResponse({
      context: "elevenlabs.synthesizePlain",
      vendor: "ElevenLabs",
      status: plain.status,
      res: plain,
      rawBody: body,
    });
    throw new VoiceProviderError(`ElevenLabs API error (${plain.status}): ${body}`);
  }

  const audio = Buffer.from(await plain.arrayBuffer());
  // Deu certo: o corpo É o mp3. Só tamanho e tipo vão ao log — ver
  // logVendorBinaryResponse.
  logVendorBinaryResponse({
    context: "elevenlabs.synthesizePlain",
    vendor: "ElevenLabs",
    status: plain.status,
    res: plain,
    byteLength: audio.length,
  });
  return {
    audio,
    durationSeconds: Number(((audio.length * 8) / DEFAULT_MP3_BITRATE_BPS).toFixed(2)),
    source: "bitrate_estimate",
  };
}
