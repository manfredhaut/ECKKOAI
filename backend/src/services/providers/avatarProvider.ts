// Real integrations for avatar training + video generation, dispatched by
// vendor (see vendorCatalog.ts). Endpoint contracts below were confirmed
// against each vendor's live docs during implementation, EXCEPT where
// flagged "ASSUMPTION" — those are best-effort reads of ambiguous docs and
// are meant to be corrected against the real HTTP response on first use,
// same as the Gemini script adapter's model id was.
import { createHash } from "node:crypto";
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
import { withLiveBudget } from "./liveGuard.js";
import { vendorAcceptsFormat, type VideoFormat } from "./videoFormat.js";
import { readSupportedEngines, selectEngine, type EngineReason, type HeygenEngine } from "./videoEngine.js";
import { normalizeScene, type SceneInput } from "./videoScene.js";
import {
  checkAvatarConnectionFixture,
  generateVideoFixture,
  listAvatarLooksFixture,
  createAvatarLookFixture,
  readAvatarLookStatusFixture,
  pollVideoJobFixture,
  trainAvatarFixture,
  waitForAvatarReadyFixture,
} from "./fixtureProvider.js";
import { logEvent } from "../log/safeLog.js";

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
  /**
   * `supported_api_engines` como o fornecedor declarou. NULL = não declarou.
   * Medido: a HeyGen manda `["avatar_iv","avatar_iii"]` na criação, e o campo
   * vinha sendo descartado junto com o resto do corpo.
   */
  supportedEngines?: string[] | null;
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
  /**
   * Formato do vídeo, derivado da plataforma de publicação. OBRIGATÓRIO, e
   * deliberadamente sem valor padrão aqui: um campo opcional reabriria a
   * omissão que este bloco existe para fechar. Quem chama resolve a plataforma
   * antes, em `videoFormat.ts`, cuja função de resolução nunca devolve
   * indefinido.
   */
  format: VideoFormat;
  /** O que o avatar declarou aceitar como motor. NULL = não declarou. */
  supportedEngines?: string[] | null;
  /**
   * A flag `explicit_avatar_engine` está ligada?
   *
   * Chega resolvida de fora porque ler flag é I/O de banco, e este módulo não
   * fala com o banco — é o que permite exercitá-lo inteiro com `fetch`
   * substituído e mais nada, como a guarda de formato faz.
   */
  engineEnabled: boolean;
  /**
   * A CENA escolhida pelo usuário: fundo, movimento e expressividade.
   *
   * Opcional porque cena vazia é um estado legítimo — é o que toda geração
   * deste produto fez até agora. O que não é legítimo é o caminho anterior:
   * cenário e traje eram coletados na tela, gravados no banco e **nunca**
   * chegavam aqui, porque este tipo não tinha onde recebê-los.
   */
  scene?: SceneInput | null;
  /**
   * Motor escolhido na tela. `null` = deixa a preferência decidir.
   *
   * A escolha do usuário ganha da preferência automática, mas continua
   * submetida à mesma flag: o ENVIO de `engine` nunca foi exercitado contra o
   * fornecedor, e um valor recusado derruba a geração inteira — que é o caminho
   * caro.
   */
  engineChoice?: HeygenEngine | null;
}

/**
 * De onde saiu a duração usada para medir consumo.
 *
 * `vendor_response` é o fornecedor dizendo quanto durou o que ele entregou —
 * a única fonte que não é nossa. `tts_timestamps` é a duração medida pelo
 * ElevenLabs no áudio que MANDAMOS, boa mas indireta (o vídeo pode ter
 * silêncio de sobra nas pontas). `requested` é o que o cliente pediu na tela:
 * não é medição de nada, e é o que estava sendo gravado como se fosse.
 */
export type DurationSource = "vendor_response" | "tts_timestamps" | "requested";

export interface GenerateVideoResult {
  providerJobId: string;
  /** Duração do áudio sintetizado, quando pôde ser determinada. */
  audioDurationSeconds?: number | null;
  audioDurationSource?: DurationSource | null;
  /**
   * Motor efetivamente ENVIADO ao fornecedor. `null` quando não foi enviado —
   * o estado normal enquanto a flag estiver desligada, e sempre no caso da
   * D-ID.
   */
  engine?: HeygenEngine | null;
  /**
   * Por que este motor (ou por que nenhum). Gravado SEMPRE, inclusive quando
   * `engine` é nulo: o valor deste registro está em saber o que teria sido
   * escolhido antes de arriscar enviá-lo.
   */
  engineReason?: EngineReason | "flag_off" | "vendor_unsupported" | null;
}

export type PollResult =
  | { status: "processing" }
  | {
      status: "ready";
      outputUrl: string;
      /**
       * Duração que o FORNECEDOR declarou para o vídeo pronto. Medido no
       * LIVE-1: a HeyGen devolve `data.duration` (3,36506 para um vídeo que o
       * ffprobe mediu em 3,360) — ou seja, é confiável e é a melhor fonte
       * disponível. Fica opcional porque não se sabe se a D-ID devolve algo
       * equivalente.
       */
      durationSeconds?: number | null;
    }
  | { status: "error"; errorMessage: string };

interface SynthesizedAudio {
  buffer: Buffer;
  durationSeconds: number | null;
  source: DurationSource | null;
}

async function requireAudio(input: GenerateVideoInput): Promise<SynthesizedAudio> {
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

  const buffer = await processVoiceAudio(input.tenantId, synthesized.audio, {
    enabled: input.audioTreatmentEnabled,
    targetLufs: input.audioTreatmentTargetLufs,
  });

  // A duração sobe junto com o áudio porque quem registra o consumo é o laço
  // de polling, noutra requisição — sem carregá-la até lá, a fonte (b) do
  // LIVE-2 seria inalcançável e sobraria só o que o fornecedor quisesse dizer.
  return {
    buffer,
    durationSeconds: synthesized.durationSeconds,
    // `source` do ElevenLabs distingue medição de estimativa por bitrate;
    // só a medição por timestamps vale como fonte de consumo.
    source: synthesized.source === "elevenlabs_timestamps" ? "tts_timestamps" : null,
  };
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
    // Medido: vem `["avatar_iv","avatar_iii"]`. O fornecedor diz, por avatar,
    // quais motores aquele avatar aceita — e até este bloco isso era
    // descartado com o resto do corpo. Guardar agora é o que torna a escolha
    // de motor possível sem uma chamada extra depois.
    supportedEngines: readSupportedEngines(data?.data?.avatar_item?.supported_api_engines),
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
    logEvent("error", "avatar_status_unreadable", { context: "heygen.getAvatar",
        detail: err instanceof Error ? err.message : String(err),
        consequence: "tratado como 'unknown', o que LIBERA a geração",
      });
    return "unknown";
  }
}

/**
 * Monta o corpo de `POST /v3/videos`.
 *
 * Separado da chamada de propósito: é esta função que a guarda de formato
 * exercita, e um payload montado dentro do `fetch` só seria inspecionável
 * interceptando a rede. O formato vai SEMPRE — não há ramo em que
 * `aspect_ratio` ou `resolution` fiquem de fora, porque a omissão é justamente
 * o defeito corrigido aqui.
 */
/**
 * `fit` — o campo que produzia as barras por estar ausente.
 *
 * MEDIDO em 06/08 contra o fornecedor, com `avatar_id` inexistente como fusível
 * (a chamada nunca pode render): `fit` aceita EXATAMENTE `contain` ou `cover` —
 * o próprio 400 diz "Input should be 'contain' or 'cover'". Nunca enviamos o
 * campo, e os 40% de barra no 4:5 e os 57,8% no 9:16 são o que `contain` faz:
 * cabe o quadro inteiro e preenche o resto com sólido.
 *
 * `cover` preenche a proporção pedida CORTANDO o excesso. A troca é real e não
 * é grátis — cortar pode comer topo e base do enquadramento, que é justamente
 * a preocupação de `deriveVariants.ts`. É decisão de produto, tomada no
 * TRAJE-3, e fica declarada aqui em vez de literal no meio do corpo.
 */
const HEYGEN_FIT: "contain" | "cover" = "cover";

/**
 * Chave de idempotência DA TENTATIVA.
 *
 * O contrato (lido na doc do fornecedor em 06/08): header `Idempotency-Key`,
 * padrão `[A-Za-z0-9_\-:.]{1,255}`, e chamadas dentro de 24 h que compartilham
 * a chave **replicam a resposta original** em vez de gerar de novo.
 *
 * O que ela precisa proteger é o duplo clique, e é isso que decide de onde ela
 * é derivada. Duas coisas NÃO servem:
 *
 *  - o instante — dois cliques dão dois instantes, e a chave nunca colide, que
 *    é o mesmo que não ter chave;
 *  - o id da linha de `videos` — cada clique INSERE uma linha nova, então dois
 *    cliques dão dois ids, e a proteção também não acontece.
 *
 * Sobra o CONTEÚDO da tentativa: mesmo tenant, mesmo avatar/look, mesmo
 * roteiro, mesma cena, mesmo formato e mesmo motor. Dois cliques iguais em 24 h
 * produzem a mesma chave e o segundo replica o primeiro, sem cobrar.
 *
 * `audio_asset_id` fica DE FORA de propósito, e essa é a parte que não é
 * óbvia: o áudio é ressintetizado e resubido a cada clique, então o asset id é
 * diferente nas duas tentativas. Incluí-lo faria a chave variar exatamente no
 * caso que ela existe para cobrir.
 */
export function heygenIdempotencyKey(
  input: Pick<
    GenerateVideoInput,
    "tenantId" | "providerAvatarId" | "script" | "format" | "scene" | "engineChoice"
  >,
): string {
  const cena = normalizeScene(input.scene ?? {});
  const material = JSON.stringify([
    input.tenantId,
    input.providerAvatarId,
    input.script,
    cena.background ?? null,
    cena.motionPrompt ?? null,
    cena.expressiveness ?? null,
    input.format.aspectRatio,
    input.format.resolution,
    input.engineChoice ?? null,
    HEYGEN_FIT,
  ]);
  // Prefixo nosso para que a chave seja reconhecível num log do fornecedor, e
  // hex de 32 bytes — 71 caracteres no total, dentro dos 255 do padrão, e todos
  // eles dentro de `[A-Za-z0-9_\-:.]`.
  return `eckko-${createHash("sha256").update(material).digest("hex")}`;
}

/**
 * Os headers de `POST /v3/videos`, montados num lugar exercitável.
 *
 * Separado do `fetch` pela mesma razão que `buildHeygenVideoPayload`: um header
 * montado no literal da chamada só é inspecionável interceptando a rede, e uma
 * guarda que não consegue olhar o objeto acaba conferindo a MENÇÃO ao helper em
 * vez do que ele produz — que é exatamente como a `checkVendorLogPolicy` ficou
 * inerte com treze funções casadas.
 */
export function heygenVideoRequestHeaders(
  apiKey: string,
  input: Parameters<typeof heygenIdempotencyKey>[0],
): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "content-type": "application/json",
    // Ver `heygenIdempotencyKey`. Um duplo clique repete o corpo inteiro, então
    // repete a chave, e o fornecedor replica a resposta em vez de enfileirar um
    // segundo vídeo — que seria cobrado.
    "Idempotency-Key": heygenIdempotencyKey(input),
  };
}

export function buildHeygenVideoPayload(
  input: Pick<
    GenerateVideoInput,
    "providerAvatarId" | "format" | "supportedEngines" | "engineEnabled" | "scene" | "engineChoice"
  >,
  audioAssetId: string,
  /**
   * Asset do fundo já subido, quando a cena tem imagem. Resolvido por quem
   * chama — igual ao áudio — para que este montador continue sem I/O e possa
   * ser exercitado com `fetch` substituído e mais nada.
   */
  backgroundAssetId?: string | null,
): { body: Record<string, unknown>; engine: HeygenEngine | null; engineReason: EngineReason | "flag_off" } {
  const selection = selectEngine(input.supportedEngines);
  const scene = normalizeScene(input.scene ?? {});

  const body: Record<string, unknown> = {
    type: "avatar",
    avatar_id: input.providerAvatarId,
    audio_asset_id: audioAssetId,
    // Os dois campos que faltavam. Sem eles, o vídeo saía no padrão da conta —
    // 1280×720 16:9 na passada medida — e o cliente que escolheu Reels recebia
    // horizontal sem que nada no sistema soubesse que havia uma escolha.
    aspect_ratio: input.format.aspectRatio,
    resolution: input.format.resolution,
    // Ver `HEYGEN_FIT`. Vai SEMPRE, como aspect_ratio e resolution: o defeito
    // que ele corrige é o da ausência, e um `fit` opcional reabriria a mesma
    // porta pela qual o formato saía vazio antes.
    fit: HEYGEN_FIT,
  };

  // CENÁRIO. Cor vai como valor; imagem vai como asset do fornecedor, e nunca
  // como a nossa URL: `/uploads/...` é servido por um host que a HeyGen não
  // alcança, e mandar um endereço inalcançável falharia depois do débito.
  //
  // Uma imagem pedida cujo upload não resolveu NÃO vira fundo nenhum — é
  // melhor um vídeo sem o fundo escolhido do que um campo pela metade, e a
  // ausência fica registrada no evento de payload.
  if (scene.background?.type === "color") {
    body.background = { type: "color", value: scene.background.value };
  } else if (scene.background?.type === "image" && backgroundAssetId) {
    body.background = { type: "image", asset_id: backgroundAssetId };
  }

  // `remove_background` — sem ele o fundo escolhido é INERTE, e foi assim que
  // a geração de 06/08 saiu.
  //
  // O que aconteceu lá: `background: {type:"color", value:"#1B2A4A"}` foi
  // enviado, o fornecedor respondeu 200, e o vídeo veio com o fundo ORIGINAL da
  // foto. Faz sentido: o avatar é um talking photo, a foto tem o fundo dela, e
  // pedir uma cor sem mandar tirar o que já está lá não deixa a cor com onde
  // aparecer. Medido que o campo passa o schema (o 400 do fusível é de avatar,
  // não de parâmetro); que ele é a causa do fundo inerte é DEDUZIDO, e é o que
  // a próxima geração paga confirma ou derruba.
  //
  // Só quando HÁ fundo escolhido: remover o fundo sem pôr nada no lugar entrega
  // um recorte sobre vazio, que ninguém pediu.
  if (body.background) body.remove_background = true;

  // INTERPRETAÇÃO. Os dois campos só existem no corpo quando têm conteúdo:
  // `normalizeScene` já transformou string vazia em ausência, e mandar
  // `motion_prompt: ""` seria uma instrução de movimento vazia, que não é a
  // mesma coisa que não instruir.
  if (scene.motionPrompt) body.motion_prompt = scene.motionPrompt;

  // O motor é a parte DEDUZIDA (ver videoEngine.ts): a ligação entre
  // `supported_api_engines` e `engine.type` é leitura nossa, não contrato
  // declarado. A seleção acontece de qualquer forma e é registrada de qualquer
  // forma; só o envio depende da flag.
  //
  // A escolha explícita da tela ganha da preferência automática — é o usuário
  // dizendo qual motor quer, e a preferência existe justamente para quando
  // ninguém disse.
  const escolhido = input.engineChoice ?? selection.engine;
  const razao: EngineReason = input.engineChoice ? "declared_preference" : selection.reason;

  // EXPRESSIVIDADE só vale em Avatar IV — o fornecedor documenta o campo como
  // "Avatar IV only", e mandá-lo com outro motor é pedir uma coisa que não vai
  // acontecer e depois não saber por quê.
  //
  // MEDIDO em 06/08 que o schema NÃO impõe isso: `expressiveness` com
  // `engine.type: "avatar_iii"` passa a validação (o 400 do fusível é de
  // avatar, não de parâmetro). Ou seja, o fornecedor aceita e ignora em
  // silêncio, que é o pior dos dois mundos — por isso a regra fica do nosso
  // lado, onde ela é observável.
  //
  // Com a flag desligada não mandamos `engine`, e o default declarado do
  // fornecedor é `avatar_iv`: o campo continua valendo, e por isso continua
  // sendo enviado nesse caminho.
  const motorEfetivo = input.engineEnabled ? escolhido : "avatar_iv";
  if (scene.expressiveness && motorEfetivo === "avatar_iv") {
    body.expressiveness = scene.expressiveness;
  }

  if (!input.engineEnabled) {
    return { body, engine: null, engineReason: "flag_off" };
  }
  body.engine = { type: escolhido };
  return { body, engine: escolhido, engineReason: razao };
}

/**
 * Tipo da imagem pela extensão do arquivo que guardamos.
 *
 * O upload já foi validado por SNIFF de bytes na rota (`uploadLimits.ts`), então
 * aqui a extensão é consequência daquela checagem, e não a checagem. O default
 * é jpeg porque é o que a criação de avatar já manda há três blocos.
 */
function mimeTypeDaExtensao(url: string): string {
  const ext = url.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function generateVideoHeygen(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const audio = await requireAudio(input);
  const audioAssetId = await heygenUploadAsset(input.apiKey, audio.buffer, "audio/mpeg");

  // O fundo por IMAGEM vira asset do fornecedor antes do payload, pelo mesmo
  // caminho do áudio e da foto do avatar. Falhar aqui NÃO derruba a geração: o
  // débito já aconteceu, e perder o vídeo inteiro por causa do fundo seria
  // trocar um defeito visível por um prejuízo.
  let backgroundAssetId: string | null = null;
  const cena = normalizeScene(input.scene ?? {});
  if (cena.background?.type === "image") {
    try {
      const imagem = await readUpload(cena.background.uploadUrl);
      backgroundAssetId = await heygenUploadAsset(
        input.apiKey,
        imagem,
        mimeTypeDaExtensao(cena.background.uploadUrl),
      );
    } catch (err) {
      logEvent("error", "background_asset_failed", {
        context: "heygen.generateVideo",
        reason: err instanceof Error ? err.message : String(err),
        consequence: "o vídeo é gerado SEM o fundo escolhido; nada é cobrado a mais por isso",
      });
    }
  }

  const { body, engine, engineReason } = buildHeygenVideoPayload(input, audioAssetId, backgroundAssetId);

  // PROVA do que sai. As chaves do corpo e os valores dos CINCO controles, com
  // os ids de asset encurtados: um `asset_id` inteiro no log não é segredo, mas
  // também não é legível, e o que se quer ver aqui é se o campo existe.
  logEvent("info", "video_payload_built", {
    context: "heygen.generateVideo",
    campos: Object.keys(body),
    background: body.background ? (body.background as { type: string }).type : "ausente",
    motion_prompt: body.motion_prompt ? "presente" : "ausente",
    expressiveness: body.expressiveness ?? "ausente",
    engine: engine ?? "não enviado (flag desligada)",
    avatar_look: input.providerAvatarId.slice(0, 8) + "…",
    aspect_ratio: input.format.aspectRatio,
    fit: body.fit,
    remove_background: body.remove_background ?? "ausente",
  });

  let res: Response;
  try {
    res = await fetch(`${HEYGEN_BASE}/v3/videos`, {
      method: "POST",
      headers: heygenVideoRequestHeaders(input.apiKey, input),
      body: JSON.stringify(body),
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
  return {
    providerJobId: videoId,
    audioDurationSeconds: audio.durationSeconds,
    audioDurationSource: audio.source,
    engine,
    engineReason,
  };
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

  if (status === "completed" && videoUrl) {
    // Medido no LIVE-1: `data.duration` = 3,36506 num vídeo que o ffprobe deu
    // 3,360. É a duração do que foi REALMENTE entregue, e é a fonte preferida
    // para medir consumo — o `duration_seconds` da requisição é só o que o
    // cliente escolheu na tela.
    const vendorDuration = Number(data?.data?.duration ?? data?.duration);
    return {
      status: "ready",
      outputUrl: videoUrl,
      durationSeconds: Number.isFinite(vendorDuration) && vendorDuration > 0 ? vendorDuration : null,
    };
  }
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
  // Passa por fetchJson como as demais: testar a chave é uma chamada ao
  // fornecedor como qualquer outra, e era a única do arquivo sem registro de
  // resposta. Quando ela falha, o corpo é justamente o que diz se o problema é
  // a chave, a cota ou o endpoint.
  await fetchJson(res, "HeyGen", "heygen.remainingQuota");
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
  const audioUrl = await didUpload(input.apiKey, audio.buffer, "script.mp3", "audio/mpeg", "audios");

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
  return {
    providerJobId: talkId,
    audioDurationSeconds: audio.durationSeconds,
    audioDurationSource: audio.source,
    engine: null,
    engineReason: "vendor_unsupported",
  };
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
  if (data?.status === "done" && data?.result_url) {
    // NÃO VERIFICADO: nenhuma resposta real da D-ID foi observada, então não se
    // sabe se ela declara duração nem sob que nome. `duration` é o palpite
    // natural; quando não vier, sobra a fonte (b) — que é o comportamento
    // correto, e não uma falha.
    const vendorDuration = Number(data?.duration);
    return {
      status: "ready",
      outputUrl: data.result_url,
      durationSeconds: Number.isFinite(vendorDuration) && vendorDuration > 0 ? vendorDuration : null,
    };
  }
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
  await fetchJson(res, "D-ID", "did.credits");
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
  // Vendor que não aceita formato não é motivo para recusar a geração — é
  // motivo para deixar registrado que a escolha do cliente não vai ser honrada.
  // Barrar aqui tiraria a D-ID do ar por causa de um recurso que ela nunca
  // teve; ficar calado devolveria um vídeo na proporção errada sem que nada no
  // sistema soubesse por quê.
  if (!vendorAcceptsFormat(input.vendor)) {
    logEvent("warn", "video_format_not_applied", { vendor: input.vendor,
        requested: input.format,
        consequence: "o vendor decide a geometria; a proporção pedida fica gravada mas não é enviada",
      });
  }
  if (isFixtureMode()) return generateVideoFixture(input);

  // Teto por sessão: protege contra o laço que dispara N vezes, que nenhuma
  // declaração de intenção no boot impediria. `withLiveBudget` devolve o
  // GASTO se a chamada lançar — o fornecedor não chegou a aceitar o trabalho,
  // mesma fronteira do estorno de crédito. A TENTATIVA não volta, e é ela que
  // continua barrando o laço.
  return withLiveBudget("geração de vídeo", "gerar vídeo", async () =>
    input.vendor === "did" ? generateVideoDid(input) : generateVideoHeygen(input),
  );
}

export async function pollVideoJob(vendor: AvatarVendor, apiKey: string, jobId: string): Promise<PollResult> {
  if (isFixtureMode()) return pollVideoJobFixture(jobId);
  return vendor === "did" ? pollDidTalk(apiKey, jobId) : pollHeygenVideo(apiKey, jobId);
}

export async function checkAvatarConnection(apiKey: string, vendor: AvatarVendor): Promise<void> {
  if (isFixtureMode()) return checkAvatarConnectionFixture();
  return vendor === "did" ? checkDidConnection(apiKey) : checkHeygenConnection(apiKey);
}

/**
 * Os LOOKS de um avatar — o que o produto chama de traje.
 *
 * Traje não é parâmetro de geração: é qual look do avatar entra no
 * `avatar_id`. Foi essa confusão que fez o passo 3 antigo coletar imagem de
 * roupa por semanas para não mandar nada a lugar nenhum.
 *
 * O caminho no fornecedor tem DOIS saltos, e o primeiro é o que não é óbvio:
 * o id que guardamos é o do LOOK, e a listagem é por GRUPO. Medido em 05/08:
 * `GET /v3/avatars/{look_id}` responde 404 com "Avatar group … not found" —
 * aquela rota espera group id. O grupo sai de `GET /v2/photo_avatar/{look_id}`.
 *
 * O endpoint de listagem é v2 e tem SUNSET declarado pelo fornecedor para
 * 2026-10-31, com o aviso mandando migrar para `/v3/avatar_groups`. Essa rota
 * v3 responde **404 nesta chave** (sondada em 05/08), então migrar agora
 * trocaria algo que funciona por algo que não existe. É dívida com data.
 *
 * Falha NÃO derruba nada: devolve lista vazia, e a tela mostra o seletor
 * desabilitado — que é o mesmo estado de quem tem um look só.
 */
export interface AvatarLook {
  id: string;
  name: string;
  previewImageUrl: string | null;
}

/** O que volta de uma criação de look. `status` é do FORNECEDOR, não nosso. */
export interface CreatedAvatarLook {
  id: string;
  name: string;
  status: "processing" | "completed" | "failed";
  previewImageUrl: string | null;
}

/**
 * Cria um look NOVO para o mesmo personagem, a partir de um texto.
 *
 * CONTRATO MEDIDO em 06/08 na conta real (antes disto era documentação lida, e
 * o caminho vivia recusando por não se saber qual era):
 *
 *   POST /v3/avatars
 *   { type: "prompt", name, avatar_id: <id do LOOK existente>, prompt }
 *
 * Três coisas que só a medição respondeu, e cada uma teria custado um erro:
 *
 *  1. `name` é OBRIGATÓRIO. Sem ele vem 400 `invalid_parameter / param: name`.
 *     Medido: esse 400 não consome nada — quota e wallet ficaram intactas.
 *  2. `avatar_id` é o id do LOOK, não do grupo, e não se manda
 *     `avatar_group_id`. O fornecedor resolve o grupo sozinho: a resposta traz
 *     `avatar_group.id` igual ao grupo do look de origem, com `looks_count`
 *     incrementado de 1 para 2.
 *  3. É ASSÍNCRONO. O 200 devolve `status: "processing"`, e o look só fica
 *     utilizável depois de virar `completed` (medido: ≤ 15 s).
 *
 * O DINHEIRO SAI NO 200, e não na conclusão — medido lendo o saldo nos dois
 * instantes. Por isso isto passa por `withLiveBudget` como a geração de vídeo:
 * é uma operação tarifada de US$ 1,00, o equivalente a 20 segundos de vídeo.
 * E por isso não há estorno depois do aceite: o fornecedor cobrou, e um look
 * feio é entrega ruim, não falha de chamada.
 */
export async function createAvatarLook(input: {
  apiKey: string;
  vendor: AvatarVendor;
  providerAvatarId: string;
  name: string;
  prompt: string;
}): Promise<CreatedAvatarLook> {
  if (isFixtureMode()) return createAvatarLookFixture(input.providerAvatarId, input.name);
  if (input.vendor === "did") {
    throw new Error("Criar traje por texto não existe na D-ID; só HeyGen implementa geração de look.");
  }

  return withLiveBudget("criação de traje", "criar traje", async () => {
    const res = await fetch(`${HEYGEN_BASE}/v3/avatars`, {
      method: "POST",
      headers: { "x-api-key": input.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        type: "prompt",
        name: input.name,
        avatar_id: input.providerAvatarId,
        prompt: input.prompt,
      }),
    });
    const data = await fetchJson(res, "HeyGen", "heygen.createLook");
    const item = data?.data?.avatar_item;
    const id = typeof item?.id === "string" ? item.id : "";
    if (!id) {
      // Sem id não há como acompanhar nem como escolher o traje depois — e o
      // dinheiro já saiu. Falhar alto é melhor que guardar uma linha órfã.
      throw new Error("HeyGen aceitou a criação de traje mas não devolveu o id do look");
    }
    return {
      id,
      name: typeof item?.name === "string" ? item.name : input.name,
      status: item?.status === "completed" ? "completed" : "processing",
      previewImageUrl: typeof item?.image_url === "string" ? item.image_url : null,
    };
  });
}

/**
 * O estado de um look no fornecedor. Sem `withLiveBudget`: consultar é GET e
 * não é tarifado — medido, a quota não se moveu em nenhuma das consultas.
 */
export async function readAvatarLookStatus(
  apiKey: string,
  vendor: AvatarVendor,
  providerLookId: string,
): Promise<{ status: "processing" | "completed" | "failed"; previewImageUrl: string | null }> {
  if (isFixtureMode()) return readAvatarLookStatusFixture(providerLookId);
  if (vendor === "did") return { status: "completed", previewImageUrl: null };
  try {
    const res = await fetch(`${HEYGEN_BASE}/v2/photo_avatar/${encodeURIComponent(providerLookId)}`, {
      headers: { "x-api-key": apiKey },
    });
    const data = await fetchJson(res, "HeyGen", "heygen.lookStatus");
    const bruto = data?.data?.status;
    return {
      // Desconhecido conta como `processing`, e nunca como `failed`: marcar
      // falha apagaria da tela um traje que foi PAGO e pode estar pronto.
      status: bruto === "completed" ? "completed" : bruto === "failed" ? "failed" : "processing",
      previewImageUrl: typeof data?.data?.image_url === "string" ? data.data.image_url : null,
    };
  } catch (err) {
    logEvent("error", "look_status_unreadable", {
      context: "heygen.lookStatus",
      detail: err instanceof Error ? err.message : String(err),
      consequence: "o traje continua marcado como em preparo e a tela segue tentando",
    });
    return { status: "processing", previewImageUrl: null };
  }
}

export async function listAvatarLooks(
  apiKey: string,
  vendor: AvatarVendor,
  providerAvatarId: string,
): Promise<AvatarLook[]> {
  if (isFixtureMode()) return listAvatarLooksFixture(providerAvatarId);
  if (vendor === "did") return [];
  try {
    const pa = await fetch(`${HEYGEN_BASE}/v2/photo_avatar/${encodeURIComponent(providerAvatarId)}`, {
      headers: { "x-api-key": apiKey },
    });
    const paData = await fetchJson(pa, "HeyGen", "heygen.photoAvatar");
    const groupId: string | undefined = paData?.data?.group_id;
    if (!groupId) return [];

    const res = await fetch(`${HEYGEN_BASE}/v2/avatar_group/${encodeURIComponent(groupId)}/avatars`, {
      headers: { "x-api-key": apiKey },
    });
    const data = await fetchJson(res, "HeyGen", "heygen.listLooks");
    const lista: unknown = data?.data?.avatar_list;
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({
        id: String(x.id ?? ""),
        name: String(x.name ?? ""),
        previewImageUrl: typeof x.image_url === "string" ? x.image_url : null,
      }))
      .filter((l) => l.id.length > 0);
  } catch (err) {
    logEvent("error", "looks_unreadable", {
      context: "heygen.listLooks",
      detail: err instanceof Error ? err.message : String(err),
      consequence: "a tela mostra o seletor de traje desabilitado, como se houvesse um look só",
    });
    return [];
  }
}
