// Real integrations for avatar training + video generation, dispatched by
// vendor (see vendorCatalog.ts). Endpoint contracts below were confirmed
// against each vendor's live docs during implementation, EXCEPT where
// flagged "ASSUMPTION" — those are best-effort reads of ambiguous docs and
// are meant to be corrected against the real HTTP response on first use,
// same as the Gemini script adapter's model id was.
import { createHash } from "node:crypto";
import { mimeDoUpload, readUpload } from "../storage.js";
import { synthesizeSpeech } from "./voiceProvider.js";
import { processVoiceAudio } from "../audioProcessing.js";
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import { vendorSignal } from "./vendorTimeout.js";
import { recordProviderUsage } from "../billing/usageTracking.js";
import { contractMismatch, logVendorResponse, unexpectedShapeMessage } from "./vendorResponseLog.js";
import {
  countWords,
  estimateSeconds,
  logScriptDuration,
  SCRIPT_DURATION,
} from "../script/scriptDuration.js";
// O MESMO teto que a rota de estimativa e o portão de prontidão aplicam sobre o
// roteiro. Duas constantes para o mesmo limite divergiriam, e o sintoma seria a
// tela recusando num ponto e a chamada paga noutro — a lição da amostra de voz,
// onde a recusa por tamanho e `checkSampleDuration` passaram a sair da mesma
// função justamente porque discordavam na faixa de 109 a 120 s.
import { MAX_SCRIPT_SECONDS } from "../video/scriptDuration.js";
import type { AvatarVendor } from "./vendorCatalog.js";
import type {
  DiarioDoPipeline,
  EntradaDeComposicao,
  EtapaDoPipeline,
} from "../video/falPipeline.js";
import { runFalPipeline } from "../video/falPipeline.js";
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

/**
 * `httpStatus` existe porque havia UMA pergunta que só o código HTTP responde e
 * que a mensagem não respondia: "o fornecedor recusou, ou o fornecedor disse que
 * isto não existe?". Quem só tem a string acaba procurando "(404)" dentro dela,
 * e aí um corpo de erro que por acaso contenha esses caracteres decide o fluxo.
 *
 * Medido em 06/08: um traje pago responde 404 em quatro rotas diferentes depois
 * de ter existido. Sem distinguir esse 404 de uma indisponibilidade qualquer, o
 * traje fica "em preparo" para sempre — ver `readAvatarLookStatus`.
 */
export class AvatarProviderError extends Error {
  readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

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
  /**
   * LEGENDA queimada no vídeo. Padrão do produto: `false`.
   *
   * O campo do fornecedor é `caption`, de nível superior em `POST /v3/videos` —
   * transcrito da doc em 06/08 na lista fechada de `checkVideoContractPolicy`, e
   * relido na doc em 10/08, que descreve `caption.file_format` (enum, default
   * `srt`) e `caption.style` (enum `default`, opcional). É `style` que queima a
   * legenda na imagem; sem ele o fornecedor só entrega o arquivo `.srt` ao lado.
   *
   * NÃO é `enable_caption`: esse é campo da v2 e não existe no schema da v3,
   * onde raiz desconhecida volta 400 "Extra inputs are not permitted".
   *
   * ┌─ NÃO VERIFICADO ────────────────────────────────────────────────────────┐
   * │ Que o fornecedor ACEITE `caption` neste caminho. Nenhuma geração deste   │
   * │ projeto o enviou, e medir custa um vídeo pago. O campo está no schema    │
   * │ lido; o aceite, não. Se ele for recusado, o 400 acontece na validação —  │
   * │ ANTES do aceite —, então o débito estorna e o custo é zero. Por isso o   │
   * │ padrão continua sendo `false`: o caminho da demo não passa por aqui.     │
   * └─────────────────────────────────────────────────────────────────────────┘
   */
  captions?: boolean;
  /**
   * Avisa que a duração REAL do áudio acabou de ser medida — e é chamado ANTES
   * da chamada que cobra.
   *
   * Existe porque este módulo não fala com o banco, e a duração precisava ser
   * persistida antes do `POST /v3/videos`. Antes deste bloco ela só era gravada
   * no `UPDATE` que a rota faz DEPOIS da resposta do fornecedor: uma geração
   * recusada aqui — ou um processo morto no meio — perdia o único número exato
   * do fluxo, que já tinha sido pago ao ElevenLabs.
   *
   * Callback, e não `pool.query` aqui dentro, para preservar a propriedade que
   * torna este arquivo exercitável: `avatarProvider.ts` roda inteiro com
   * `fetch` substituído e mais nada. Quem faz I/O de banco é a rota.
   *
   * É AGUARDADO: se a gravação falhar, a chamada paga não acontece. A ordem
   * "mede → grava → decide → cobra" só vale se a gravação puder interromper.
   */
  onAudioMeasured?: (measured: {
    seconds: number | null;
    source: DurationSource | null;
  }) => Promise<void>;
  /**
   * AS ENTRADAS DO CAMINHO DA FAL. Nenhuma delas é coluna nova: `photo_urls`,
   * `scenario`, `scenario_prompt`, `outfit` e `outfit_prompt` já existem em
   * `avatars` e `videos` desde as migrations 002 e 013 — o que faltava era o
   * transporte até aqui.
   *
   * Todas opcionais: os caminhos heygen/did não as consomem, e exigi-las
   * quebraria os dois por causa de um terceiro.
   */
  photoUrls?: string[] | null;
  /** Caminho `/uploads/...` da imagem de CENÁRIO, quando veio por arquivo. */
  scenario?: string | null;
  /** O cenário descrito em TEXTO. Entra no prompt de composição. */
  scenarioPrompt?: string | null;
  /** Caminho `/uploads/...` da imagem de TRAJE, quando veio por arquivo. */
  outfit?: string | null;
  /** O traje descrito em TEXTO. Entra no prompt de composição. */
  outfitPrompt?: string | null;
  /**
   * O DIÁRIO da corrida, injetado.
   *
   * Injetado pela mesma razão de `onAudioMeasured` ser callback: este módulo
   * não fala com o banco, e é essa ausência de I/O que o torna exercitável com
   * `globalThis.fetch` substituído e mais nada. Quem abre a corrida em
   * `fal_pipeline_runs` e devolve o gravador é quem tem `pool` — a sonda hoje,
   * a rota quando o B3 existir.
   */
  falDiario?: DiarioDoPipeline | null;
  /**
   * Onde a corrida PARA. Default `"compor"` — ver `generateVideoFal`.
   */
  falPararApos?: EtapaDoPipeline | null;
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
  /**
   * A imagem-base composta, no caminho da fal. `null`/ausente nos outros.
   *
   * Sobe até aqui porque é ela que a rota grava em `videos` e a tela mostra no
   * passo 4 — sem este campo, o único produto de uma corrida que parou em
   * `compor` ficaria dentro do diário, e a tela teria de fazer `JSON.parse` no
   * corpo bruto do fornecedor para saber o que aprovar.
   */
  imagemCompostaUrl?: string | null;
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
      /**
       * A versão COM legenda queimada, quando o fornecedor a devolve
       * (`captioned_video_url`).
       *
       * Vem SEPARADA de `outputUrl`, e não no lugar dele: o fornecedor entrega
       * as duas, e sobrescrever a limpa com a legendada apagaria uma versão de
       * um vídeo que já foi pago. Guardar as duas custa uma coluna; regerar
       * custa dinheiro.
       *
       * `null` no caso normal. MEDIDO em 10/08: num vídeo gerado SEM `caption`
       * no pedido, `GET /v3/videos/{id}` devolveu nove campos e nenhum deles
       * era `captioned_video_url` ou `subtitle_url` — apesar de a doc afirmar
       * que o sidecar é "always generated". Onde doc e medição divergem, vale
       * a medição.
       */
      captionedOutputUrl?: string | null;
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
    throw new AvatarProviderError(`${providerLabel} API error (${res.status}): ${rawBody}`, res.status);
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

/**
 * O sinal de timeout, importado e usado em TODA chamada deste arquivo.
 *
 * Antes disto nenhum `fetch` do produto tinha `AbortSignal`, e no caminho de
 * criação isso é dinheiro: `POST /v3/videos` acontece DEPOIS do débito, e um
 * socket pendurado deixava o crédito debitado com a linha em `queued` para
 * sempre. Ver `providers/vendorTimeout.ts`.
 */

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
      signal: vendorSignal(),
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
      signal: vendorSignal(),
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
      signal: vendorSignal(),
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
 * Os dois valores de `caption`, transcritos do schema do fornecedor lido em
 * 10/08 — `file_format` é um enum cujo único valor documentado é `srt`, e
 * `style` um enum cujo único valor documentado é `default`.
 *
 * Declarados aqui, e não literais no meio do corpo, pela mesma razão de
 * `HEYGEN_FIT`: são valores de enum do fornecedor, e o dia em que ele
 * acrescentar um segundo valor a discussão tem de acontecer num lugar só.
 *
 * Anotados com o tipo largo (`string`) de propósito. Sem a anotação o
 * TypeScript estreita para o literal, e a guarda que confere qual valor sai no
 * corpo passaria a reprovar por não compilar — reprovaria calada, sem nunca
 * dizer o que mudou. É o defeito INERTE já medido em `VOICE_SPEED`.
 */
const CAPTION_FILE_FORMAT: string = "srt";
const CAPTION_STYLE: string = "default";

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
    | "providerAvatarId"
    | "format"
    | "supportedEngines"
    | "engineEnabled"
    | "scene"
    | "engineChoice"
    | "captions"
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

  // LEGENDA. O objeto só existe no corpo quando alguém pediu — omitir é o
  // padrão do fornecedor e é o comportamento de todos os vídeos já gerados
  // aqui.
  //
  // Os DOIS sub-campos vão juntos, e nenhum deles é inventado: `file_format` e
  // `style` são o schema inteiro de `caption` na doc lida em 10/08. Mandar só
  // `style` funcionaria pelo default declarado de `file_format`, mas depender
  // de default alheio é como o `background` sem `remove_background` saiu
  // inerte em 06/08 — o fornecedor aceitou, respondeu 200, e não fez o que se
  // esperava. Explícito custa dois campos.
  if (input.captions) {
    body.caption = { file_format: CAPTION_FILE_FORMAT, style: CAPTION_STYLE };
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

/**
 * A duração MEDIDA do áudio estourou o teto — e a chamada paga NÃO saiu.
 *
 * Classe PRÓPRIA, e não `AvatarProviderError`, pela mesma razão medida que fez
 * `LiveBudgetExhaustedError` nascer: este teto é NOSSO, o fornecedor nunca foi
 * chamado, e empacotar isso como falha de fornecedor entrega ao cliente "não
 * foi possível concluir a operação no serviço de vídeo" — uma frase que manda
 * procurar defeito na HeyGen quando a HeyGen sequer soube da tentativa.
 *
 * A mensagem é mostrada ao cliente como está: não há corpo de fornecedor aqui
 * para sanitizar, e o que ela diz — quanto durou, qual o teto, que nada foi
 * cobrado pelo vídeo — é exatamente o que permite a pessoa agir (encurtar o
 * roteiro) em vez de tentar de novo.
 */
export class AudioTooLongError extends Error {
  constructor(
    readonly measuredSeconds: number,
    readonly maxSeconds: number,
  ) {
    super(
      `A fala sintetizada ficou em ${measuredSeconds.toFixed(2)} s, acima do teto de ${maxSeconds} s ` +
        "deste aplicativo. Nenhum vídeo foi pedido ao fornecedor: o crédito volta e nada foi cobrado " +
        "pela geração. A síntese de voz que produziu esta medição já aconteceu e custa frações de " +
        "centavo. Encurte o roteiro e gere de novo.",
    );
    this.name = "AudioTooLongError";
  }
}

async function generateVideoHeygen(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const audio = await requireAudio(input);

  // A duração REAL é gravada AQUI, e não depois da resposta do fornecedor.
  //
  // Ela é o único número exato do fluxo — medida pelos timestamps do ElevenLabs
  // sobre o áudio que vai animar o vídeo —, e até este bloco ela vivia numa
  // variável local até o `UPDATE` pós-resposta. Quem morresse no meio, ou fosse
  // recusado pelo portão abaixo, perdia uma medição que já tinha sido paga.
  if (input.onAudioMeasured) {
    await input.onAudioMeasured({ seconds: audio.durationSeconds, source: audio.source });
  }

  // ---------------------------------------------------------------------------
  // O PORTÃO SOBRE A DURAÇÃO REAL, na fronteira onde o preço muda de ordem de
  // grandeza: o áudio acima custa frações de centavo, o `POST /v3/videos` abaixo
  // custa dólares (3 unidades por segundo inteiro, US$ 0,05/s — 180 s são
  // US$ 9,00).
  //
  // Por que ele não é redundante com os portões que já existem: aqueles julgam a
  // ESTIMATIVA do texto (`CONFIRM_ABOVE_SECONDS`, `MAX_SCRIPT_SECONDS` em
  // `generationReadiness`), e a estimativa é uma régua de um ponto medido. Ela
  // erra +29,5% para CIMA em textos curtos, o que é o lado seguro — mas nada
  // garante o sinal do erro: `speed` da voz é editável no painel do fornecedor,
  // por fora deste produto e sem registro em lugar nenhum, e a mesma contagem de
  // 145 caracteres já produziu 10,19 s e 11,12 s em duas gerações reais. No dia
  // em que a estimativa subestimar, este é o único ponto do caminho que sabe a
  // verdade antes de a chamada paga sair.
  //
  // MESMO teto da estimativa, de propósito: uma segunda régua para o mesmo
  // limite abriria a faixa em que uma aceita e a outra recusa.
  //
  // Duração DESCONHECIDA (`null`) não recusa. Ela acontece quando o endpoint com
  // timestamps não responde e o fallback por bitrate também não conclui, e
  // transformar "não sei" em recusa quebraria gerações que hoje funcionam — o
  // teto sobre a estimativa continua valendo nesse caminho.
  // ---------------------------------------------------------------------------
  if (audio.durationSeconds != null && audio.durationSeconds > MAX_SCRIPT_SECONDS) {
    throw new AudioTooLongError(audio.durationSeconds, MAX_SCRIPT_SECONDS);
  }

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
    // A PROVA de que a escolha de legenda chegou ao corpo. Sem esta linha, a
    // única forma de saber se o botão da tela virou campo no payload seria
    // gerar um vídeo pago e olhar o resultado.
    caption: body.caption ? JSON.stringify(body.caption) : "ausente",
  });

  let res: Response;
  try {
    res = await fetch(`${HEYGEN_BASE}/v3/videos`, {
      method: "POST",
      headers: heygenVideoRequestHeaders(input.apiKey, input),
      body: JSON.stringify(body),
      // A chamada mais cara do produto, e a que acontece DEPOIS do débito. Um
      // socket pendurado aqui era o pior caso do ciclo de vida: crédito
      // debitado, aceite desconhecido, linha em `queued` para sempre.
      signal: vendorSignal(),
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
      signal: vendorSignal(),
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
    // A versão legendada é LIDA sempre, e não só quando pedimos legenda: a
    // alternativa seria carregar a escolha do usuário até aqui, e este poll é o
    // mesmo que a varredura de boot usa para retomar um vídeo cujo pedido
    // ninguém mais tem em mãos. Ler o que a resposta trouxer não precisa de
    // estado nenhum.
    //
    // Presença implica pedido — DEDUZIDO do medido em 10/08: sem `caption` no
    // corpo, o campo não veio. Se um dia vier sem termos pedido, o efeito é
    // uma URL a mais guardada, não um vídeo trocado: quem escolhe qual servir é
    // a coluna `captions`, e não a existência desta.
    const captionedUrl: unknown = data?.data?.captioned_video_url ?? data?.captioned_video_url;
    return {
      status: "ready",
      outputUrl: videoUrl,
      durationSeconds: Number.isFinite(vendorDuration) && vendorDuration > 0 ? vendorDuration : null,
      captionedOutputUrl: typeof captionedUrl === "string" && captionedUrl.length > 0 ? captionedUrl : null,
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
    res = await fetch(`${HEYGEN_BASE}/v2/user/remaining_quota`, {
      headers: { "x-api-key": apiKey },
      signal: vendorSignal(),
    });
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
      signal: vendorSignal(),
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
      signal: vendorSignal(),
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
      signal: vendorSignal(),
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
    res = await fetch(`${DID_BASE}/credits`, {
      headers: { authorization: didAuthHeader(apiKey) },
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("avatarProvider.did", err);
    throw new AvatarProviderError(`Could not reach D-ID API: ${describeNetworkError(err)}`);
  }
  await fetchJson(res, "D-ID", "did.credits");
}

// ---------------------------------------------------------------------------
// fal.ai — a PONTE até o orquestrador
// ---------------------------------------------------------------------------


/**
 * O TEXTO da composição: o que veio por prompt, dos dois campos.
 *
 * Traje e cenário chegam de dois jeitos e os dois valem ao mesmo tempo — uma
 * imagem de referência E uma descrição. A imagem vira `image_urls`; o texto
 * vira este prompt. Quem mandou só texto continua descrevendo a cena inteira;
 * quem mandou só imagem manda um prompt vazio e deixa a imagem falar.
 */
function promptDaComposicao(input: GenerateVideoInput): string {
  return [input.scenarioPrompt?.trim(), input.outfitPrompt?.trim()].filter(Boolean).join(". ");
}

/**
 * A DIREÇÃO que vai ao Wan — o mesmo `scene.motionPrompt` que a HeyGen recebe.
 *
 * Lê de `input.scene` porque é ali que a rota deposita a versão INGLESA: em
 * `routes/videos.ts` a cena entregue ao provider leva `motion_prompt_en` no
 * lugar do texto do usuário, e a linha gravada em `videos` mantém o original.
 * Este é o ponto em que o caminho da fal passa a consumir a mesma direção que o
 * outro caminho já consumia — antes ela chegava até aqui e não era lida por
 * ninguém.
 *
 * String vazia quando não há direção: o campo é obrigatório no orquestrador de
 * propósito, e "não escreveram nada" é um valor, não uma ausência.
 */
function promptDaDirecao(input: GenerateVideoInput): string {
  return input.scene?.motionPrompt?.trim() ?? "";
}

/**
 * Gera pelo pipeline da fal — e PARA na composição.
 *
 * ┌─ Por que ela para, e por que isso não é uma sonda ───────────────────────┐
 * │ `pararApos: "compor"` é o comportamento NORMAL desta fase (BLOCO B2).    │
 * │ Nada dispara o Wan na mesma invocação: a imagem-base fica gravada em     │
 * │ `fal_pipeline_steps` e a etapa seguinte espera quem a aprove — que é o   │
 * │ BLOCO 5, com estado, rota e tela. Construir a aprovação aqui seria       │
 * │ construir metade dela sem onde mostrá-la.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO cria linha em `videos`, e isso é decisão registrada, não omissão:
 * `recovery.ts` encerra como `recovery_orphan` qualquer vídeo sem
 * `provider_job_id` em qualquer idade, e uma corrida que para em `compor` não
 * tem job id de VÍDEO nenhum para dar. A corrida vive só no diário. Quem
 * garante que nenhum caminho de produto chegue aqui enquanto isso não muda é o
 * porteiro de `routes/videos.ts` — a fal está fora de
 * `VENDORS_WITH_GENERATION_PATH`.
 *
 * `providerJobId` é o `request_id` da COMPOSIÇÃO: o ponteiro para o trabalho
 * que de fato foi pedido e pago. Devolver string vazia seria perder o único
 * vínculo com o que já custou dinheiro.
 */
async function generateVideoFal(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  if (!input.falDiario) {
    throw new AvatarProviderError(
      "fal: nenhum diário de corrida foi injetado. O orquestrador registra cada etapa em " +
        "fal_pipeline_runs/fal_pipeline_steps, e este módulo não fala com o banco de propósito — " +
        "quem abre a corrida é quem tem `pool`. Sem diário não há onde gravar o request_id, e uma " +
        "etapa paga sem ponteiro é trabalho perdido com a fatura chegando do mesmo jeito.",
    );
  }
  if (!input.elevenLabsApiKey || !input.voiceId) {
    throw new AvatarProviderError(
      "fal: a voz é ENTRADA deste pipeline, não subproduto — sem chave do ElevenLabs e sem voice_id " +
        "não há o que sincronizar. A recusa acontece antes da primeira chamada paga.",
    );
  }

  const fotoUrl = input.photoUrls?.[0];
  if (!fotoUrl) {
    throw new AvatarProviderError(
      "fal: a composição parte do ROSTO, e o avatar não tem nenhuma foto registrada. Nada foi pedido " +
        "ao fornecedor.",
    );
  }

  // O I/O DE DISCO ACONTECE AQUI, e não no orquestrador. `falPipeline.ts` recebe
  // bytes e é por isso que ele roda inteiro com `fetch` substituído e mais nada.
  const fotoBase = await readUpload(fotoUrl);

  // A ORDEM É SIGNIFICATIVA: `[rosto, traje?, cenário?]` — a mesma que vai em
  // `image_urls`. Traje antes de cenário porque é o que veste a pessoa; o
  // cenário é o que está atrás dela.
  const entradasExtras: EntradaDeComposicao[] = [];
  if (input.outfit) {
    entradasExtras.push({
      rotulo: "traje",
      bytes: await readUpload(input.outfit),
      mimeType: mimeDoUpload(input.outfit),
    });
  }
  if (input.scenario) {
    entradasExtras.push({
      rotulo: "cenario",
      bytes: await readUpload(input.scenario),
      mimeType: mimeDoUpload(input.scenario),
    });
  }

  const corrida = await runFalPipeline({
    apiKeyFal: input.apiKey,
    apiKeyElevenLabs: input.elevenLabsApiKey,
    voiceId: input.voiceId,
    script: input.script,
    fotoBase,
    fotoMimeType: mimeDoUpload(fotoUrl),
    entradasExtras,
    promptDeComposicao: promptDaComposicao(input),
    promptDeDirecao: promptDaDirecao(input),
    diario: input.falDiario,
    // O default é o FREIO, e não o pipeline inteiro: quem quiser ir além tem de
    // dizer isso explicitamente, e hoje ninguém diz.
    pararApos: input.falPararApos ?? "compor",
  });

  logEvent("info", "fal_pipeline_encerrado", {
    imagemCompostaUrl: corrida.imagemCompostaUrl,
    gastoPrevistoUsd: corrida.gastoPrevistoUsd,
    videoUrl: corrida.videoUrl || null,
  });

  return {
    providerJobId: corrida.requestIds.compor,
    audioDurationSeconds: corrida.audioDurationSeconds,
    audioDurationSource: corrida.audioDurationSeconds == null ? null : "tts_timestamps",
    // A fal não tem o conceito de motor da HeyGen. `null` com razão declarada é
    // o que este projeto grava quando o campo não se aplica — ver `engineReason`.
    engine: null,
    engineReason: "vendor_unsupported",
    // O único produto de uma corrida que parou em `compor`. É ela que a rota
    // grava em `videos.fal_composed_image_url` e que a tela mostra para ser
    // aprovada — sem isto, o que foi pago ficaria só dentro do diário.
    imagemCompostaUrl: corrida.imagemCompostaUrl,
  };
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
  // O RAMO DA FAL, e por que ele é um `if` acima do ternário e não um terceiro
  // braço dele.
  //
  // O ternário abaixo é `did ? … : heygen` — não tem caso "nenhum dos dois", e
  // é essa ausência que faz todo vendor novo cair na HeyGen. Transformá-lo em
  // `fal ? … : did ? … : heygen` resolveria o despacho e criaria outra coisa:
  // a ordem passaria a ser lida da direita para a esquerda, e `heygen` — que é
  // o `defaultVendor()` e o destino de todo tenant que nunca escolheu — sairia
  // do fim de UM ternário para o fim de DOIS. Um `if` de saída antecipada deixa
  // a linha seguinte idêntica ao que ela era, byte a byte, e a ordem
  // heygen-primeiro continua sendo uma propriedade de um ternário só.
  //
  // FORA do `withLiveBudget`, e isto é consequência aceita, não descuido: o
  // orçamento de sessão conta GERAÇÕES de vídeo, e esta corrida para em
  // `compor` — não há geração de vídeo a contar. O freio dela é outro e é
  // próprio: `autorizarGasto` soma o previsto em dólares antes de CADA etapa
  // paga (`PIPELINE_TETO_USD`). Ligar `consumeLiveGeneration()` às submissões
  // pagas da fal é do BLOCO 4/B3, junto com a decisão de onde o débito de
  // crédito acontece.
  if (input.vendor === "fal") return generateVideoFal(input);

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
 * aquela rota espera group id.
 *
 * MIGRADO PARA v3 EM 06/08, e a rota de listagem foi ACHADA sondando. O que
 * estava registrado aqui — "a v3 responde 404 nesta chave, migrar trocaria algo
 * que funciona por algo que não existe" — vinha de ter sondado
 * `/v3/avatar_groups/{g}`. Sondadas as quatro formas plausíveis, três devolvem
 * 404 de roteador e **`GET /v3/avatars/looks?group_id={g}` responde 200**, com
 * um corpo mais rico que o do v2 (`preview_image_url`, `status`,
 * `preferred_orientation`, dimensões e `supported_api_engines`).
 *
 * O prazo era real e continua: o corpo de toda resposta v2 traz `warning` de
 * remoção em **2026-10-31**. O inventário do que ainda fala v2 está em
 * `legacyEndpoints.ts`, e uma guarda impede que entre um novo sem ser notado.
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
      signal: vendorSignal(),
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
 * O que uma consulta de estado de traje pode devolver.
 *
 * `vanished` é o estado que faltava, e a falta dele prendeu um traje pago em
 * "em preparo" para sempre. Não é "não consegui perguntar" — é o fornecedor
 * respondendo, com todas as letras, que este look NÃO EXISTE nele.
 */
export type LookStatusOutcome =
  | { status: "processing" | "completed" | "failed"; previewImageUrl: string | null }
  | { status: "vanished"; previewImageUrl: null };

/**
 * O estado de um look no fornecedor. Sem `withLiveBudget`: consultar é GET e
 * não é tarifado — medido, a quota não se moveu em nenhuma das consultas.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA FUNÇÃO MUDOU DE ENDPOINT **E** DE VOCABULÁRIO
 *
 * Ela perguntava em `GET /v2/photo_avatar/{id}` o estado de um look nascido em
 * `POST /v3/avatars`, e o sintoma era um traje pago preso em "em preparo".
 *
 * A hipótese natural — "endpoint da família errada, todo id v3 dá 404" — foi
 * MEDIDA em 06/08 e REFUTADA: o v2 lê um look v3 com 200. O Jaleco branco
 * (`800e04f0…`), criado por `POST /v3/avatars`, responde 200 no v2 com status,
 * grupo e nome. Trocar de endpoint, sozinho, não consertaria nada.
 *
 * O 404 medido é de um id só, o "TRAJE CASUAL" (`1fa904f6…`), e ele responde
 * 404 nas QUATRO rotas sondadas — duas v2, duas v3 — e não aparece na listagem
 * do grupo em nenhuma família. O grupo trazia `looks_count: 2` na resposta da
 * criação e hoje lista 1. O look foi criado, cobrado, e sumiu.
 *
 * O defeito, então, é NOSSO e é de vocabulário: o `catch` transformava
 * "o fornecedor diz que isto não existe" em `processing`, que é o único estado
 * de onde não se sai. Sete consultas, sete 404, sete vezes "continua em
 * preparo". Agora esse caso tem nome — `vanished` — e quem decide o que fazer
 * com ele é `reconciliarPendentes`, que tem a idade da linha e pode esperar.
 *
 * A migração para v3 fica, mas pelo motivo dela: o próprio corpo das respostas
 * v2 traz `warning` de remoção em **2026-10-31**. É dívida com prazo, e o
 * inventário dela está em `legacyEndpoints.ts`.
 * ---------------------------------------------------------------------------
 */
export async function readAvatarLookStatus(
  apiKey: string,
  vendor: AvatarVendor,
  providerLookId: string,
): Promise<LookStatusOutcome> {
  if (isFixtureMode()) return readAvatarLookStatusFixture(providerLookId);
  if (vendor === "did") return { status: "completed", previewImageUrl: null };
  try {
    const res = await fetch(`${HEYGEN_BASE}/v3/avatars/looks/${encodeURIComponent(providerLookId)}`, {
      headers: { "x-api-key": apiKey },
      signal: vendorSignal(),
    });
    const data = await fetchJson(res, "HeyGen", "heygen.lookStatus");
    const bruto = data?.data?.status;
    return {
      // Desconhecido conta como `processing`, e nunca como `failed`: marcar
      // falha apagaria da tela um traje que foi PAGO e pode estar pronto.
      status: bruto === "completed" ? "completed" : bruto === "failed" ? "failed" : "processing",
      previewImageUrl:
        typeof data?.data?.preview_image_url === "string"
          ? data.data.preview_image_url
          : typeof data?.data?.image_url === "string"
            ? data.data.image_url
            : null,
    };
  } catch (err) {
    // 404 é RESPOSTA, não indisponibilidade. Só ele vira `vanished`; timeout,
    // 5xx e chave recusada continuam sendo `processing`, porque a pergunta não
    // chegou a ser respondida e desistir do traje seria desistir por conta
    // própria de um dólar que já saiu.
    if (err instanceof AvatarProviderError && err.httpStatus === 404) {
      logEvent("error", "look_vanished_at_vendor", {
        context: "heygen.lookStatus",
        detail: err.message.slice(0, 300),
        consequence: "o traje pago não existe mais no fornecedor; a linha vai para failed depois da carência",
      });
      return { status: "vanished", previewImageUrl: null };
    }
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
    // SALTO 1 — o id que guardamos é de um LOOK, e a listagem é por GRUPO.
    // O grupo saía de `GET /v2/photo_avatar/{id}`; agora sai do equivalente v3,
    // que devolve o mesmo `group_id` (conferido nos dois avatares base e no
    // Jaleco: 21812e52…, e1071cee… e 21812e52… nas duas famílias).
    const pa = await fetch(`${HEYGEN_BASE}/v3/avatars/looks/${encodeURIComponent(providerAvatarId)}`, {
      headers: { "x-api-key": apiKey },
      signal: vendorSignal(),
    });
    const paData = await fetchJson(pa, "HeyGen", "heygen.photoAvatar");
    const groupId: string | undefined = paData?.data?.group_id;
    if (!groupId) return [];

    // SALTO 2 — a listagem por grupo. O caminho é QUERY, não segmento: das
    // quatro formas sondadas em 06/08, `/v3/avatars/{g}/looks`,
    // `/v3/avatar_groups/{g}/looks` e `/v3/avatar_groups/{g}/avatars` devolvem
    // 404 de roteador (HTML, nem JSON), e só esta responde 200.
    //
    // A resposta v3 é um ARRAY em `data`, não `data.avatar_list` como no v2 —
    // ler a forma antiga daria lista vazia em silêncio, que na tela é
    // indistinguível de "este avatar tem um traje só".
    const res = await fetch(
      `${HEYGEN_BASE}/v3/avatars/looks?group_id=${encodeURIComponent(groupId)}`,
      { headers: { "x-api-key": apiKey }, signal: vendorSignal() },
    );
    const data = await fetchJson(res, "HeyGen", "heygen.listLooks");
    const lista: unknown = data?.data;
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({
        id: String(x.id ?? ""),
        name: String(x.name ?? ""),
        // O v3 chama de `preview_image_url` o que o v2 chamava de `image_url`.
        // O v2 fica no `??` porque um nome só custa uma linha e a ausência de
        // prévia é um card cinza sem explicação.
        previewImageUrl:
          typeof x.preview_image_url === "string"
            ? x.preview_image_url
            : typeof x.image_url === "string"
              ? x.image_url
              : null,
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
