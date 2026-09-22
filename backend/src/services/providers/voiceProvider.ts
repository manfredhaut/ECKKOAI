// Real integration: ElevenLabs instant voice cloning. Only vendor today —
// see vendorCatalog.ts.
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import { vendorSignal } from "./vendorTimeout.js";
import { isFixtureMode } from "./providerMode.js";
import { withLiveBudget } from "./liveGuard.js";
import { logVendorBinaryResponse, logVendorResponse } from "./vendorResponseLog.js";
import {
  checkVoiceConnectionFixture,
  cloneVoiceFixture,
  listVoiceDetailsFixture,
  listVoicesFixture,
  readVoiceSubscriptionFixture,
  synthesizeSpeechFixture,
} from "./fixtureProvider.js";
import { countOwnedVoices } from "../voice/voiceSample.js";
import { logEvent } from "../log/safeLog.js";
const ELEVENLABS_ADD_VOICE_URL = "https://api.elevenlabs.io/v1/voices/add";
const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices";
/** O TETO da conta — ver `readVoiceSubscription`. Leitura, não tarifado. */
const ELEVENLABS_SUBSCRIPTION_URL = "https://api.elevenlabs.io/v1/user/subscription";

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
  /**
   * Pede ao fornecedor que limpe ruído de fundo da amostra antes de treinar —
   * R6, 24/08.
   *
   * OPÇÃO, e o default é `false` de propósito: a limpeza é destrutiva e o
   * próprio fornecedor documenta que ela pode PIORAR o resultado quando a
   * gravação já é limpa (o algoritmo tira junto parte do timbre). Quem grava
   * num ambiente silencioso não deve pagar por um processamento que só tem a
   * perder — e quem grava na rua precisa poder ligá-lo sem regravar.
   *
   * A escolha é da pessoa, com o aviso na tela; o código não adivinha o
   * ambiente dela a partir de nada.
   */
  removeBackgroundNoise?: boolean;
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
    // SEMPRE explícito, os dois valores — nunca omitido quando é `false`.
    // Omitir deixa o default do fornecedor decidir, e um default que muda do
    // lado dele mudaria o timbre de toda clonagem nova sem uma linha de
    // diferença deste lado. É a mesma doutrina de `DEFAULTS_NUNCA_HERDADOS`
    // no pipeline da fal, pelo mesmo motivo: o que não se declara, alguém
    // declara por você.
    form.set("remove_background_noise", input.removeBackgroundNoise ? "true" : "false");

    let res: Response;
    try {
      res = await fetch(ELEVENLABS_ADD_VOICE_URL, {
        method: "POST",
        headers: { "xi-api-key": input.apiKey },
        body: form,
        // Clonar consome um slot IRREVERSÍVEL na conta do fornecedor, e este
        // produto não tem caminho de exclusão. Um socket pendurado aqui deixa
        // a pergunta "o slot foi gasto?" sem resposta possível.
        signal: vendorSignal(),
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
 * conta, que vive em `/v1/user/subscription` — ver `readVoiceSubscription`.
 *
 * ⚠️ **O 401 registrado aqui até 23/08 NÃO VALE MAIS.** Aquele comentário dizia
 * que `/v1/user/subscription` respondia 401 por falta da permissão `user_read`
 * (medido no LIVE-3) e que por isso o teto tinha de vir por ambiente. **MEDIDO
 * em 24/08 com a chave em uso: HTTP 200**, `{"tier":"starter","voice_limit":10,
 * "voice_slots_used":9,...}`. A chave ganhou a permissão em algum momento entre
 * as duas medições. O teto deixou de ser palpite.
 */
export async function listVoices(apiKey: string): Promise<VoiceInventory> {
  if (isFixtureMode()) return listVoicesFixture();
  let res: Response;
  try {
    res = await fetch(ELEVENLABS_VOICES_URL, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      signal: vendorSignal(),
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

export interface VoiceListing {
  voiceId: string;
  name: string;
  category: string;
}

/**
 * As vozes da conta COM nome e categoria — R6, 24/08.
 *
 * Irmã de `listVoices`, que devolve só CONTAGENS. As duas existem porque
 * servem a perguntas diferentes: a guarda de slots precisa de um número (e um
 * número é tudo o que ela deve poder ver, para não haver tentação de decidir
 * por nome), e a tela de limpeza precisa saber QUAL voz é qual.
 *
 * Sem isto, escolher o que apagar significa ler o painel do fornecedor — onde
 * CINCO vozes se chamam "TESTE REAL 15:40 01/08" e nada distingue a que está
 * em uso (medido em 24/08). O nome não identifica voz nenhuma nesta conta; só
 * o `voice_id` identifica, e é por isso que ele vem em toda linha.
 */
export async function listVoiceDetails(apiKey: string): Promise<VoiceListing[]> {
  if (isFixtureMode()) return listVoiceDetailsFixture();
  let res: Response;
  try {
    res = await fetch(ELEVENLABS_VOICES_URL, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.listVoiceDetails", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }
  const data = (await readVoiceJson(res, "elevenlabs.listVoiceDetails")) as {
    voices?: { voice_id?: string; name?: string; category?: string }[];
  };
  // Mesma postura de `listVoices`: forma inesperada LANÇA, nunca vira lista
  // vazia. Uma lista vazia aqui apareceria na tela como "você não tem vozes",
  // e o reflexo de quem lê isso é clonar de novo.
  if (!Array.isArray(data.voices)) {
    throw new VoiceProviderError(
      `elevenlabs.listVoiceDetails: esperado data.voices como lista, recebido ${JSON.stringify(
        Object.keys(data ?? {}),
      )}`,
    );
  }
  return data.voices
    .filter((v): v is { voice_id: string; name?: string; category?: string } => typeof v?.voice_id === "string")
    .map((v) => ({
      voiceId: v.voice_id,
      // Nome ausente vira o próprio id, e não "sem nome": o id é o que
      // identifica de verdade, e um rótulo genérico repetido em várias linhas
      // recriaria exatamente o problema das cinco homônimas.
      name: typeof v.name === "string" && v.name.trim() ? v.name : v.voice_id,
      category: typeof v.category === "string" ? v.category : "desconhecida",
    }));
}

export interface VoiceSubscription {
  /** O TETO de vozes próprias da conta, dito pelo fornecedor. */
  voiceLimit: number | null;
  /** Quantos slots ELE considera usados — a contagem do outro lado. */
  voiceSlotsUsed: number | null;
  tier: string | null;
  /** PVC (clonagem profissional) exige plano Creator; `starter` não tem. */
  canUseProfessionalVoiceCloning: boolean | null;
}

/**
 * O TETO de slots, LIDO do fornecedor — R6.5, 24/08.
 *
 * `GET /v1/user/subscription`, leitura, não tarifado. Substitui o
 * `DEFAULT_VOICE_SLOT_LIMIT = 10` como FONTE; a constante continua existindo
 * como retaguarda, porque uma leitura que falha não pode virar "sem limite".
 *
 * ⚠️ **NUNCA LANÇA, e devolve `null` em vez de número quando não sabe.** Esta
 * função é consultada no caminho de uma clonagem que a pessoa está esperando;
 * derrubá-lo porque um endpoint de leitura oscilou seria trocar um número
 * melhor por um fluxo pior. Quem chama decide o que fazer com o `null` — e a
 * decisão registrada é cair no teto por ambiente, que é o comportamento de
 * sempre.
 *
 * O que ele traz e é DIFERENTE do nosso `listVoices`: `voice_slots_used` é a
 * contagem DELES. Ter as duas lado a lado é o que permitiria pegar uma
 * divergência de contagem — foi uma divergência dessas (25 contra 4) que
 * recusou uma clonagem legítima em 04/08.
 */
export async function readVoiceSubscription(apiKey: string): Promise<VoiceSubscription | null> {
  if (isFixtureMode()) return readVoiceSubscriptionFixture();
  try {
    const res = await fetch(ELEVENLABS_SUBSCRIPTION_URL, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      signal: vendorSignal(),
    });
    const rawBody = await res.text();
    logVendorResponse({ context: "elevenlabs.readVoiceSubscription", vendor: "ElevenLabs", status: res.status, res, rawBody });
    if (!res.ok) return null;
    const data = JSON.parse(rawBody) as Record<string, unknown>;
    return {
      voiceLimit: typeof data.voice_limit === "number" ? data.voice_limit : null,
      voiceSlotsUsed: typeof data.voice_slots_used === "number" ? data.voice_slots_used : null,
      tier: typeof data.tier === "string" ? data.tier : null,
      canUseProfessionalVoiceCloning:
        typeof data.can_use_professional_voice_cloning === "boolean"
          ? data.can_use_professional_voice_cloning
          : null,
    };
  } catch (err) {
    logProviderNetworkError("voiceProvider.readVoiceSubscription", err);
    return null;
  }
}

/**
 * APAGA uma voz clonada na conta do fornecedor — R6.2, 24/08.
 *
 * ┌─ Irreversível dos dois lados, e é por isso que ela não decide nada ──────┐
 * │ Apagar libera o slot e destrói a voz: o fornecedor não guarda o áudio de │
 * │ origem no IVC (só no PVC, que exige Creator e está fora), então          │
 * │ "desfazer" só existe se NÓS tivermos guardado a amostra — que é o que a  │
 * │ tabela `voice_clone_samples` (migration 064) passou a fazer.             │
 * │                                                                          │
 * │ Esta função NÃO confere se alguém aponta para a voz, NÃO pede            │
 * │ confirmação e NÃO escolhe o que apagar. Ela executa. Toda a decisão vive │
 * │ na rota, onde é observável — e a guarda mede exatamente isso: que a rota │
 * │ recusa sem confirmação explícita e recusa voz em uso.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * FORA de `withLiveBudget`, e de propósito: o teto de gerações existe para
 * limitar o que GASTA. Apagar não gasta — libera. Contá-lo ali faria uma
 * limpeza consumir a cota que a clonagem seguinte precisa, que é o oposto do
 * que a limpeza serve para fazer.
 */
export async function deleteVoice(apiKey: string, voiceId: string): Promise<void> {
  if (isFixtureMode()) return;
  let res: Response;
  try {
    res = await fetch(`${ELEVENLABS_VOICES_URL}/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.deleteVoice", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }
  const rawBody = await res.text();
  logVendorResponse({ context: "elevenlabs.deleteVoice", vendor: "ElevenLabs", status: res.status, res, rawBody });
  if (!res.ok) {
    throw new VoiceProviderError(`ElevenLabs API error (${res.status}): ${rawBody}`);
  }
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
      signal: vendorSignal(),
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

/**
 * VELOCIDADE DA FALA do avatar — não a rapidez de produzir o vídeo.
 *
 * Quem usa a aba nunca vê este controle: ele chega pronto, e é por isso que o
 * valor mora aqui e não numa coluna ou num campo de tela. Uma coluna exigiria
 * migration e UI para um número que ninguém varia por avatar; um campo
 * ofereceria uma escolha que ninguém consegue julgar sem gerar e pagar.
 *
 * **0.85 é MEDIDO, não escolhido.** Em 09/08, no painel do fornecedor, com
 * `eleven_multilingual_v2` e a voz `0hQuq0q2JEk1SY4lZaM9`, o operador aprovou
 * timbre e ritmo a 0.85; a 1.0 — o padrão do fornecedor — a fala saiu rápida
 * demais. A causa provável está no áudio de treino, e é o que o texto da tela
 * de gravação passou a dizer. A faixa aceita pelo fornecedor é 0.7–1.2.
 *
 * POR QUE ENVIAR, se `GET /v1/voices/{id}/settings` já mostra `speed: 0.85`
 * guardado nessa voz e o fornecedor aplica o guardado quando o campo é
 * omitido. Três razões, e a segunda é certeza, não risco:
 *   1. o valor mora só no fornecedor — quem abrir o painel muda o ritmo de
 *      todos os vídeos futuros, sem rastro nenhum deste lado;
 *   2. o ajuste é POR VOZ, e toda clonagem nova nasce em 1.0: a próxima voz
 *      clonada perderia o ritmo aprovado em silêncio. Este produto clona a
 *      cada regravação, então isso ia acontecer;
 *   3. a régua de custo precisa do número para estimar direito — ver
 *      scriptDuration.ts.
 *
 * ATENÇÃO ao enviar: `voice_settings` SOBRESCREVE o que está guardado na voz,
 * e vale só naquela chamada. Mandar o objeto sem `speed` devolveria tudo ao
 * default do fornecedor — pior que não mandar nada.
 */
// Anotado como `number`, e não deixado inferir o literal `0.85`: sem a
// anotação, o TypeScript estreita o tipo para o próprio valor e qualquer
// comparação com outro número vira "erro de tipo" em vez de verificação. A
// guarda que confere se a velocidade continua sendo a medida ficaria INERTE —
// reprovaria por não compilar, sem nunca dizer o que está errado. Medido: com
// o literal, trocar 0.85 por 1.0 dá TS2367 e a mensagem da guarda some.
export const VOICE_SPEED: number = 0.85;

/**
 * Modelos que aceitam `speed`. O envio é condicionado a esta lista.
 *
 * `eleven_v3` NÃO tem o campo. Mandá-lo a um modelo que não o suporta cai no
 * pior caso conhecido deste projeto — o fornecedor aceita e ignora em
 * silêncio, como `expressiveness` com `avatar_iii` —, e o sintoma seria uma
 * fala 18% mais rápida que ninguém saberia explicar. A regra fica do nosso
 * lado, onde é observável.
 *
 * Modelo fora da lista: o campo não vai, e o evento de log diz por quê. A
 * síntese continua acontecendo — recusar a geração porque o ritmo não pode
 * ser ajustado seria trocar um defeito de ritmo por um defeito de produto.
 */
export const MODELS_WITH_SPEED: readonly string[] = [
  "eleven_multilingual_v2",
  "eleven_turbo_v2_5",
  "eleven_flash_v2_5",
];

export function supportsSpeed(modelId: string): boolean {
  return MODELS_WITH_SPEED.includes(modelId);
}

/**
 * OS QUATRO AJUSTES DE SÍNTESE, por AVATAR — 25/08.
 *
 * Vêm de `avatars.voice_*` (migration 067), nunca de constante deste módulo:
 * um valor fixo aqui faria os quatro campos parecerem configuráveis na tela e
 * serem os mesmos para todo mundo. É o defeito que a guarda
 * `voz: os ajustes de síntese vêm do avatar` existe para impedir.
 *
 * ⚠️ RISCO ACEITO, registrado por decisão do operador em 25/08: estes quatro
 * vão em QUALQUER modelo, sem a lista de suporte que `speed` tem. Se um modelo
 * não suportar algum deles, o fornecedor aceita e ignora em silêncio — o pior
 * caso conhecido deste projeto (`expressiveness` com `avatar_iii`) — e aqui ele
 * é ainda mais surdo, porque nenhum dos quatro muda a duração. A recomendação
 * de travar por modelo foi apresentada e recusada; não reabrir sem nova ordem.
 *
 * MEDIDO em 25/08 (`GET /v1/voices/0hQuq0q2…/settings`, HTTP 200): os quatro
 * campos existem na resposta do fornecedor, com `stability` 0.5,
 * `similarity_boost` 0.75, `style` 0.0 (floats) e `use_speaker_boost` true.
 * Que cada MODELO os honre segue NÃO VERIFICADO — o endpoint é por voz.
 */
export interface VoiceTuning {
  stability: number;
  similarityBoost: number;
  style: number;
  speakerBoost: boolean;
}

/**
 * O corpo da síntese, montado num lugar só.
 *
 * Os DOIS ramos de `synthesizeSpeech` (com timestamps e simples) chamam esta
 * função. Dois corpos montados à mão divergiriam no dia em que um deles
 * mudasse, e o defeito apareceria só quando o fallback entrasse em ação — que
 * é raro, intermitente e sem sintoma. É a mesma razão pela qual `model_id` já
 * era o mesmo nos dois.
 *
 * E é o mesmo corpo da PRÉVIA e do VÍDEO: as duas passam por
 * `synthesizeSpeech`. Se divergissem, o operador aprovaria um ritmo na prévia
 * e receberia outro no vídeo — exatamente o defeito de aprovar sem ouvir que a
 * prévia existe para fechar.
 */
export function buildSynthesisBody(
  text: string,
  modelId = ELEVENLABS_TTS_MODEL,
  tuning?: VoiceTuning,
): Record<string, unknown> {
  const body: Record<string, unknown> = { text, model_id: modelId };
  const settings: Record<string, unknown> = {};
  // `speed` continua CONDICIONADO ao modelo: ele é o único dos cinco cujo
  // suporte está medido (`MODELS_WITH_SPEED`), e `eleven_v3` comprovadamente
  // não o tem.
  if (supportsSpeed(modelId)) {
    settings.speed = VOICE_SPEED;
  }
  // Os QUATRO vão SEMPRE, em qualquer modelo — decisão explícita do operador
  // em 25/08, contra a recomendação registrada. O risco aceito está escrito
  // em `VoiceTuning`: um modelo que não suporte algum deles aceita e ignora
  // em silêncio, e nenhum dos quatro tem sintoma mensurável deste lado (ao
  // contrário de `speed`, que aparece na duração).
  if (tuning) {
    settings.stability = tuning.stability;
    settings.similarity_boost = tuning.similarityBoost;
    settings.style = tuning.style;
    settings.use_speaker_boost = tuning.speakerBoost;
  }
  // Objeto VAZIO não vai: `voice_settings: {}` sobrescreve o que está guardado
  // na voz e devolve tudo ao default do fornecedor — pior que não mandar nada.
  // É o caso do modelo sem `speed` chamado sem `tuning`, e é ele que mantém o
  // corpo de HOJE idêntico quando o parâmetro novo é omitido.
  if (Object.keys(settings).length > 0) {
    body.voice_settings = settings;
  }
  return body;
}

/**
 * O corpo QUE SAIU, registrado — a prova que faltava do lado da voz.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO FECHA
 *
 * Até 10/08, "o corpo levou `speed: 0.85` e `eleven_multilingual_v2`?" era
 * DEDUZIDO: o log de fornecedor grava só a RESPOSTA (`logVendorResponse`), e a
 * única forma de responder era ler `buildSynthesisBody` e confiar que os dois
 * ramos a chamam. Do lado da HeyGen isso já era medido — `video_payload_built`
 * existe desde o TRAJE-3. Do lado da voz, não havia nada.
 *
 * A diferença importa porque `voice_settings` SOBRESCREVE o que está guardado
 * na voz e vale só naquela chamada: se ele parar de ir, a fala volta ao ritmo
 * do painel do fornecedor, que é global, editável fora do produto e não fica
 * registrado em lugar nenhum. O sintoma seria uma duração diferente sem nenhuma
 * mudança visível no nosso código.
 * ---------------------------------------------------------------------------
 *
 * O TEXTO NÃO ENTRA — só o tamanho. Ele é o roteiro do cliente, e um log de
 * servidor não é lugar para conteúdo dele. `model_id` e `voice_settings.speed`
 * entram como VALORES porque são configuração nossa, não dado de ninguém.
 * Nenhuma credencial passa por aqui: `apiKey` viaja em header, e este evento não
 * o recebe.
 */
export function logSynthesisBody(context: string, body: Record<string, unknown>): void {
  const settings = body.voice_settings as
    | {
        speed?: number;
        stability?: number;
        similarity_boost?: number;
        style?: number;
        use_speaker_boost?: boolean;
      }
    | undefined;
  logEvent("info", "voice_payload_built", {
    context,
    campos: Object.keys(body),
    model_id: body.model_id,
    // Os QUATRO de 25/08, pelo mesmo motivo do speed: eles vêm do avatar
    // (`avatars.voice_*`), e sem este registro "o ajuste da tela chegou ao
    // fornecedor?" volta a ser dedução. "ausente" por extenso, e não
    // `undefined`, para distinguir valor de omissão.
    voice_settings_stability: settings?.stability ?? "ausente",
    voice_settings_similarity_boost: settings?.similarity_boost ?? "ausente",
    voice_settings_style: settings?.style ?? "ausente",
    voice_settings_use_speaker_boost: settings?.use_speaker_boost ?? "ausente",
    // "ausente" por extenso, e não `undefined`: a diferença entre "mandamos
    // 0.85" e "não mandamos velocidade nenhuma" é a única coisa que este evento
    // existe para deixar visível, e um campo que some do JSON não a mostra.
    voice_settings_speed: settings?.speed ?? "ausente",
    textChars: typeof body.text === "string" ? body.text.length : null,
  });
}

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
  // Opcional, e a ausência produz EXATAMENTE o corpo de antes de 25/08. É o
  // que permite às guardas exercitarem a montagem sem inventar um avatar.
  tuning?: VoiceTuning,
): Promise<SynthesizedSpeech> {
  if (isFixtureMode()) return synthesizeSpeechFixture();
  const base = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  // A PROVA do que sai, antes de sair. Registrada nos DOIS ramos: se só o
  // caminho feliz fosse registrado, o fallback poderia mandar outro corpo e
  // nada apontaria para isso.
  const corpo = buildSynthesisBody(text, ELEVENLABS_TTS_MODEL, tuning);
  logSynthesisBody("elevenlabs.synthesizeWithTimestamps", corpo);

  let res: Response;
  try {
    res = await fetch(`${base}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(corpo),
      signal: vendorSignal(),
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
  //
  // O corpo é remontado e REGISTRADO de novo, com outro contexto. Reaproveitar
  // o objeto do ramo de cima e o registro dele esconderia justamente o caso que
  // interessa: dois corpos divergindo entre os endpoints. Assim o log mostra o
  // que cada chamada levou, e dois eventos no mesmo vídeo já dizem que o
  // fallback entrou — e que o TTS foi pago duas vezes.
  const corpoFallback = buildSynthesisBody(text, ELEVENLABS_TTS_MODEL, tuning);
  logSynthesisBody("elevenlabs.synthesizeSpeech", corpoFallback);

  let plain: Response;
  try {
    plain = await fetch(base, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      // O MESMO corpo do ramo acima, pela MESMA função. Dois ramos com modelos
      // ou velocidades diferentes produziriam vozes diferentes conforme o
      // endpoint que respondesse — um defeito que só apareceria de forma
      // intermitente, e só quando o fallback entrasse.
      body: JSON.stringify(corpoFallback),
      signal: vendorSignal(),
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

/**
 * A voz ainda existe na conta? P2-1 — checagem ANTES de narrar com uma voz
 * CONGELADA (o avatar pode ter trocado de voz desde a criação deste vídeo,
 * e "Trocar voz" APAGA a anterior). `GET /v1/voices/{id}` é leitura pura,
 * nunca tarifada — mesmo padrão já usado para `GET /v1/voices/{id}/settings`.
 */
export async function vozAindaExisteNaElevenLabs(apiKey: string, voiceId: string): Promise<boolean> {
  if (isFixtureMode()) return true;
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
      headers: { "xi-api-key": apiKey },
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("voiceProvider.vozAindaExisteNaElevenLabs", err);
    throw new VoiceProviderError(`Could not reach ElevenLabs API: ${describeNetworkError(err)}`);
  }
  // A resposta bruta vai ao log ANTES de qualquer decisão — inclusive no
  // 404, que aqui não é erro nenhum: é o resultado que esta função existe
  // para produzir.
  const rawBody = await res.text();
  logVendorResponse({ context: "voiceProvider.vozAindaExisteNaElevenLabs", vendor: "ElevenLabs", status: res.status, res, rawBody });
  if (res.status === 404) return false;
  if (!res.ok) throw new VoiceProviderError(`ElevenLabs respondeu ${res.status} ao conferir a voz.`);
  return true;
}
