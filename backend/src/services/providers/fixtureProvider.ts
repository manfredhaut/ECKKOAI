/**
 * Implementação de fixture para HeyGen e ElevenLabs: devolve artefatos
 * locais, sem tocar a rede.
 *
 * A regra que dá valor a este arquivo: **não devolver o resultado pronto de
 * imediato**. Um stub que responde "pronto" na primeira chamada esconderia
 * exatamente os defeitos que só aparecem no fluxo assíncrono — job que
 * nunca sai de `processing`, polling que não atualiza o status, download de
 * uma URL que ainda não existe, notificação disparada duas vezes. Por isso
 * o job simulado tem duração real: fica em `processing` por alguns
 * segundos, e só depois vira `ready`.
 *
 * O artefato final é gravado no diretório de uploads do próprio tenant,
 * como um arquivo de verdade, e a `outputUrl` tem a mesma forma que a de um
 * upload real. Assim o caminho de download e o proxy são exercitados sem
 * nenhum tratamento especial no meio.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveUpload } from "../storage.js";
import type { AvatarProviderStatus, GenerateVideoInput, GenerateVideoResult, PollResult, TrainAvatarResult } from "./avatarProvider.js";
import { buildHeygenVideoPayload } from "./avatarProvider.js";
import type { AvatarLook, CreatedAvatarLook } from "./avatarProvider.js";
import type { CloneVoiceResult, SynthesizedSpeech, VoiceInventory } from "./voiceProvider.js";
import { HEYGEN_ASPECT_RATIOS, type AspectRatio } from "./videoFormat.js";
import { selectEngine } from "./videoEngine.js";
import { logEvent } from "../log/safeLog.js";

/**
 * TRÊS looks simulados — e três, não um, de propósito.
 *
 * A conta real tem um look só, e com um look o seletor de traje nasce
 * desabilitado. Se a simulação repetisse esse estado, o caminho habilitado —
 * escolher um traje diferente e vê-lo chegar ao payload — não teria como ser
 * exercitado em lugar nenhum antes de alguém criar looks pagando.
 *
 * O primeiro é o próprio avatar recebido, para que "não trocar de traje"
 * continue sendo o comportamento padrão e o id continue sendo o que sempre foi.
 */
export function listAvatarLooksFixture(providerAvatarId: string): AvatarLook[] {
  return [
    { id: providerAvatarId, name: "Traje atual", previewImageUrl: null },
    { id: `${providerAvatarId}-look-formal`, name: "Formal", previewImageUrl: null },
    { id: `${providerAvatarId}-look-casual`, name: "Casual", previewImageUrl: null },
  ];
}

/**
 * Criação de traje simulada.
 *
 * Devolve `processing`, e não `completed`, pela mesma razão que o job de vídeo
 * simulado leva alguns segundos: o caminho assíncrono é onde moram os defeitos
 * — tela que nunca sai do "preparando", look que não aparece no seletor quando
 * fica pronto, consulta de status que ninguém dispara. Um stub que respondesse
 * "pronto" de imediato esconderia os três.
 *
 * O id tem a MESMA forma dos looks de fixture, para que o payload de geração
 * não precise distinguir traje criado de traje que já existia.
 */
export function createAvatarLookFixture(providerAvatarId: string, name: string): CreatedAvatarLook {
  return {
    id: `${providerAvatarId}-look-${randomUUID().slice(0, 8)}`,
    name,
    status: "processing",
    previewImageUrl: null,
  };
}

/** Quanto tempo o traje simulado passa em `processing`. */
const SIMULATED_LOOK_DURATION_MS = 8_000;
const looksSimulados = new Map<string, number>();

/**
 * O traje simulado fica pronto depois de {@link SIMULATED_LOOK_DURATION_MS}.
 *
 * O relógio começa na PRIMEIRA consulta, e não na criação: sem estado
 * compartilhado entre os dois pontos, é o que dá um intervalo observável sem
 * inventar uma tabela só para a simulação.
 */
export function readAvatarLookStatusFixture(providerLookId: string): {
  status: "processing" | "completed" | "failed";
  previewImageUrl: string | null;
} {
  const primeira = looksSimulados.get(providerLookId);
  if (primeira === undefined) {
    looksSimulados.set(providerLookId, Date.now());
    return { status: "processing", previewImageUrl: null };
  }
  return Date.now() - primeira >= SIMULATED_LOOK_DURATION_MS
    ? { status: "completed", previewImageUrl: null }
    : { status: "processing", previewImageUrl: null };
}

/**
 * O asset que o fundo por imagem TERIA, em simulação.
 *
 * Em live o upload acontece de verdade e devolve um id do fornecedor; aqui
 * devolver um marcador é o que permite ver o campo `background` montado no
 * payload. Devolver `null` faria a imagem sumir do payload simulado, e a
 * simulação passaria a esconder justamente o campo que este bloco existe para
 * garantir que chega.
 */
function fixtureBackgroundAssetId(input: GenerateVideoInput): string | null {
  return input.scene?.background?.type === "image" ? "fixture-background-asset" : null;
}

/** Quanto tempo o job simulado passa em `processing` antes de concluir. */
const SIMULATED_JOB_DURATION_MS = 12_000;

/**
 * Diretório de onde as fixtures são lidas EM EXECUÇÃO.
 *
 * Exportado para que a guarda de formato confira exatamente este caminho, e não
 * uma reconstrução dele a partir da raiz do repositório. A diferença não é
 * teórica: o bind mount de `/repo` traz só `backend/src` e `backend/scripts`, e
 * as fixtures chegam ao container pelo `COPY` do Dockerfile. Conferir a raiz do
 * repositório acusaria ausência onde não há, e — pior — deixaria passar o
 * defeito do VIDEO-0, em que o Dockerfile não copiava as fixtures e a simulação
 * quebrava no meio do job.
 */
export const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures");
const fixturesDir = FIXTURES_DIR;

export const FIXTURE_AUDIO_FILE = "simulated-speech.mp3";

/**
 * Uma fixture de vídeo POR PROPORÇÃO.
 *
 * O motivo é a regra deste arquivo levada a sério: uma simulação que devolve
 * sempre 640×360 não prova nada sobre formato. Pior — ela passa verde
 * exatamente no caminho que o bloco de formato existe para verificar, e um
 * modo fixture que sempre aprova é falso verde, o defeito de que este projeto
 * já tem histórico. Com uma fixture por proporção, pedir 9:16 e receber um
 * arquivo horizontal vira uma diferença observável sem gastar cota.
 *
 * Geradas com ffmpeg e VERSIONADAS (proporção conferida com `ffprobe`):
 *   16:9 → 640×360   ·   9:16 → 360×640   ·   4:5 → 512×640   ·   1:1 → 512×512
 * Todas com 5 s, h264 + aac, e acima do piso de 100 KB de `videoArtifact.ts`.
 */
export const FIXTURE_VIDEO_FILES: Record<AspectRatio, string> = {
  "16:9": "simulated-video-16x9.mp4",
  "9:16": "simulated-video-9x16.mp4",
  "4:5": "simulated-video-4x5.mp4",
  "1:1": "simulated-video-1x1.mp4",
};

/**
 * Dimensões reais de cada fixture, conferidas com `ffprobe`.
 *
 * **A SIMULAÇÃO HONRA PROPORÇÃO, NÃO RESOLUÇÃO — e isto está aqui para que
 * essa distinção não se perca.** Todas as fixtures são pequenas (o maior lado
 * tem 640 px); nenhuma corresponde a 720p, 1080p ou 4k. Ou seja: pedir `720p`
 * e receber 640×360 é o comportamento CORRETO da simulação, e não há como
 * verificar em fixture se o campo `resolution` produz o efeito pedido.
 *
 * Fazer as fixtures nascerem em 720p pareceria mais fiel e seria pior: daria a
 * impressão de que a resolução foi verificada, quando a simulação apenas
 * devolveria o arquivo que nós mesmos escolhemos. Um falso verde que custa
 * disco. A verificação de resolução só existe em live, e está declarada como
 * pendente — `npm run check` reprova qualquer texto de produto que afirme
 * resolução entregue.
 */
export const FIXTURE_VIDEO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 640, height: 360 },
  "9:16": { width: 360, height: 640 },
  "4:5": { width: 512, height: 640 },
  "1:1": { width: 512, height: 512 },
};

/**
 * Duração real dos artefatos de fixture, em segundos, conferida com `ffprobe`.
 *
 * Existe para que a simulação declare a duração do que entrega, como a HeyGen
 * faz (`data.duration`, medido no LIVE-1). Sem isso, o caminho da duração real
 * só seria exercitável gastando dinheiro — e o defeito que ele corrige é
 * justamente de medição de custo.
 *
 * Constante, e não leitura do arquivo: extrair duração de um mp4 exigiria um
 * parser, e o número muda apenas quando alguém regenera a fixture com ffmpeg.
 * Se a fixture for trocada, este valor tem de ser trocado junto.
 */
export const FIXTURE_VIDEO_DURATION_SECONDS = 5;
export const FIXTURE_AUDIO_DURATION_SECONDS = 3;

/**
 * Estado dos jobs simulados, em memória.
 *
 * Em memória de propósito: um job simulado não deve sobreviver a um
 * restart do processo. Se o servidor reinicia no meio, o vídeo fica preso
 * em `processing` e o timeout do poller resolve — que é exatamente o que
 * aconteceria com um job real cujo id se perdeu. Persistir isso tornaria a
 * simulação mais gentil que a realidade, e o objetivo é o contrário.
 */
interface SimulatedJob {
  tenantId: string;
  startedAt: number;
  /**
   * A proporção PEDIDA no payload. Guardada porque é o polling que materializa
   * o arquivo, noutra requisição — sem carregá-la até lá, a simulação teria de
   * escolher uma proporção sozinha, que é o comportamento que o bloco de
   * formato acabou de tirar do fornecedor.
   */
  aspectRatio: AspectRatio;
}
const jobs = new Map<string, SimulatedJob>();

export function isFixtureJobId(jobId: string): boolean {
  return jobId.startsWith("fixture-");
}

async function readFixture(name: string): Promise<Buffer> {
  try {
    return await readFile(path.join(fixturesDir, name));
  } catch (err) {
    throw new Error(
      `Fixture "${name}" não encontrada em ${fixturesDir}. ` +
        "Os artefatos são versionados junto com o código; se sumiram, regenere com ffmpeg " +
        "(ver CLAUDE.md, bloco VIDEO-0).",
    );
  }
}

/**
 * Proporção → arquivo. Proporção fora do catálogo cai em 16:9 e AVISA.
 *
 * Falhar aqui derrubaria o job simulado por causa de um arquivo faltando, o que
 * transformaria um buraco no catálogo de fixtures numa falha que parece de
 * geração. Cair calado seria pior ainda: a simulação entregaria horizontal
 * para quem pediu vertical e passaria por correta — exatamente o falso verde
 * que a divisão por proporção existe para eliminar.
 */
function fixtureFileFor(aspectRatio: AspectRatio): string {
  const file = FIXTURE_VIDEO_FILES[aspectRatio];
  if (file) return file;
  logEvent("warn", "fixture_aspect_ratio_missing", { requested: aspectRatio,
      known: HEYGEN_ASPECT_RATIOS,
      consequence: "entregando 16:9 — a simulação NÃO honrou a proporção pedida",
    });
  return FIXTURE_VIDEO_FILES["16:9"];
}

// --------------------------------------------------------------- avatar ---

export function trainAvatarFixture(): TrainAvatarResult {
  // Caminho normal da simulação: avatar já nasce pronto.
  // Prefixo explícito: um id de avatar simulado nunca deve ser confundido
  // com um id real do vendor ao ler o banco depois.
  return {
    providerAvatarId: `fixture-avatar-${randomUUID()}`,
    status: "ready",
    // Os mesmos motores que a HeyGen declarou no avatar real medido. Devolver
    // `null` aqui faria toda geração simulada cair na razão
    // "default_no_declaration", e o caminho da seleção a partir de declaração
    // — o normal em live — nunca seria exercitado.
    supportedEngines: ["avatar_iv", "avatar_iii"],
  };
}

/**
 * Corpo de erro que a simulação de falha reproduz.
 *
 * Copiado da FORMA de um 400 de fornecedor, não inventado livremente: envelope
 * `{ error: { code, message } }`, e um campo `api_key` dentro — porque
 * fornecedores costumam ecoar parte da requisição no erro, e é exatamente aí
 * que uma chave chega ao log sem ninguém ter pedido. O valor abaixo não é uma
 * chave: é um literal de teste, e existe para que a máscara do LOG-1 tenha o
 * que mascarar.
 */
export const FIXTURE_VENDOR_ERROR_BODY = JSON.stringify({
  error: { code: "invalid_request", message: "avatar_id not found or not ready" },
  api_key: "valor-de-teste-que-nao-e-uma-chave",
});

/**
 * Marcador que faz um avatar simulado FALHAR na geração.
 *
 * Mesma convenção de `-processing-`: o id decide o comportamento. Isso mantém
 * o caminho de falha exercitável sem variável de ambiente nova, sem tocar a
 * rede e sem um ramo especial dentro da rota — a rota não sabe que é
 * simulação, que é a única forma de o teste dizer alguma coisa sobre ela.
 */
export const FIXTURE_FAIL_MARKER = "-fail-";

/**
 * Marcador que faz o fornecedor ACEITAR e depois falhar no polling.
 *
 * É o desfecho que mais importa medir, e o único que não acontece
 * espontaneamente em simulação: o fornecedor aceitou o trabalho (logo, cobrou),
 * e a falha é posterior. É exatamente a fronteira do ESTORNO-1 — estornar aqui
 * faria o ledger divergir do dinheiro real.
 */
export const FIXTURE_POLL_FAIL_MARKER = "-pollfail-";

export class FixtureVendorFailure extends Error {
  constructor() {
    super(`HeyGen API error (400): ${FIXTURE_VENDOR_ERROR_BODY}`);
    this.name = "FixtureVendorFailure";
  }
}

export function generateVideoFixture(input: GenerateVideoInput): GenerateVideoResult {
  // Falha ANTES de registrar o job: é o que acontece quando o fornecedor
  // recusa a criação — nenhum job existe do lado dele, e é essa a fronteira do
  // estorno fixada no ESTORNO-1.
  if (input.providerAvatarId.includes(FIXTURE_FAIL_MARKER)) {
    throw new FixtureVendorFailure();
  }

  // O marcador viaja no id do job para que o polling — que roda noutra
  // requisição — saiba o desfecho sem precisar de estado compartilhado a mais.
  const falharNoPolling = input.providerAvatarId.includes(FIXTURE_POLL_FAIL_MARKER);
  const providerJobId = `fixture-${falharNoPolling ? "pollfail-" : ""}${randomUUID()}`;
  jobs.set(providerJobId, {
    tenantId: input.tenantId,
    startedAt: Date.now(),
    aspectRatio: input.format.aspectRatio,
  });
  const selection = selectEngine(input.supportedEngines);

  // O PAYLOAD REAL, montado pelo montador REAL, mesmo sem rede.
  //
  // A simulação sempre devolveu um job e mais nada, e isso deixava um buraco
  // exatamente onde este produto já falhou: cenário e traje chegavam à rota,
  // eram gravados, e ninguém percebia que morriam antes do payload — porque em
  // fixture nenhum payload era construído para olhar. Agora a simulação exerce
  // o montador e imprime o que SAIRIA, com os cinco controles à vista.
  //
  // O `audio_asset_id` é um marcador de simulação, e é o único campo falso
  // aqui: em fixture a síntese não acontece, então não há áudio para subir.
  const { body } = buildHeygenVideoPayload(input, "fixture-audio-asset", fixtureBackgroundAssetId(input));
  logEvent("info", "video_payload_built", {
    context: "fixture.generateVideo",
    simulado: true,
    campos: Object.keys(body),
    background: body.background ?? "ausente",
    motion_prompt: body.motion_prompt ?? "ausente",
    expressiveness: body.expressiveness ?? "ausente",
    engine: body.engine ?? "não enviado (flag desligada)",
    avatar_look: input.providerAvatarId,
    aspect_ratio: body.aspect_ratio,
  });

  // Em simulação a síntese não acontece (generateVideo devolve antes de
  // requireAudio), então a duração do áudio é a da fixture de voz. Vai como
  // `tts_timestamps` porque é o papel que ela cumpre no fluxo: a retaguarda
  // usada quando o fornecedor não declara duração.
  return {
    providerJobId,
    audioDurationSeconds: FIXTURE_AUDIO_DURATION_SECONDS,
    audioDurationSource: "tts_timestamps",
    // A simulação decide o motor pela MESMA função do caminho real, e respeita
    // a mesma flag. Devolver um valor fixo faria a seleção só existir em live,
    // que é onde ela não pode ser depurada.
    engine: input.engineEnabled ? selection.engine : null,
    engineReason: input.engineEnabled ? selection.reason : "flag_off",
  };
}

export async function pollVideoJobFixture(jobId: string): Promise<PollResult> {
  const job = jobs.get(jobId);
  if (!job) {
    // Job desconhecido: o processo reiniciou desde a criação. Tratado como
    // erro em vez de "pronto", porque é o que um vendor real diria.
    return {
      status: "error",
      errorMessage: "Job simulado não encontrado (o servidor reiniciou desde a criação).",
    };
  }

  if (Date.now() - job.startedAt < SIMULATED_JOB_DURATION_MS) {
    return { status: "processing" };
  }

  // Aceite seguido de falha. O trabalho já foi enfileirado no fornecedor —
  // e é por isso que este caminho NÃO estorna, ao contrário da recusa.
  if (jobId.includes(FIXTURE_POLL_FAIL_MARKER)) {
    jobs.delete(jobId);
    return {
      status: "error",
      errorMessage:
        "HeyGen API error (500): {\"error\":{\"message\":\"internal error while rendering\"}}",
    };
  }

  // Concluído: materializa o arquivo no storage do tenant, como um vendor
  // real faria ao publicar o resultado — e na proporção que o payload pediu,
  // não numa proporção fixa. É o que impede a simulação de aprovar um caminho
  // de formato que nunca funcionou.
  const buffer = await readFixture(fixtureFileFor(job.aspectRatio));
  const outputUrl = await saveUpload(job.tenantId, buffer, "simulado.mp4");
  jobs.delete(jobId);
  // A duração vai junto, como a HeyGen faz: é a do arquivo realmente entregue,
  // não a que foi pedida na tela. É o que torna o caminho da duração real
  // exercitável sem gastar cota.
  return { status: "ready", outputUrl, durationSeconds: FIXTURE_VIDEO_DURATION_SECONDS };
}

export function checkAvatarConnectionFixture(): void {
  // Em simulação a "conexão" é sempre válida: não há credencial a validar.
}

// ------------------------------------------------------------------ voz ---

export function cloneVoiceFixture(): CloneVoiceResult {
  return { voiceId: `fixture-voice-${randomUUID()}` };
}

/**
 * Inventário simulado.
 *
 * Devolve UMA voz em uso, e não zero: zero descreveria uma conta virgem, que
 * não é o estado real de nenhuma conta em que este produto rode, e faria a
 * guarda de slots passar por vacuidade em toda execução em fixture. Um número
 * baixo e diferente de zero exercita a comparação de verdade sem barrar o
 * fluxo simulado.
 *
 * Deliberadamente NÃO configurável: a guarda de slots é exercitada com números
 * injetados diretamente (`checkVoiceSlots`), que é onde os casos de fronteira
 * pertencem. Tornar isto ajustável convidaria a "testar o teto" mexendo na
 * fixture, e o que seria testado é a fixture, não a política.
 */
export function listVoicesFixture(): VoiceInventory {
  // `total` maior que `owned` DE PROPÓSITO, desde 04/08: a conta real traz as
  // vozes `premade` da biblioteca do fornecedor junto com as da pessoa, e
  // enquanto a fixture devolvia os dois números iguais o defeito de contagem
  // não tinha como aparecer em fixture — ele só apareceu numa tentativa real,
  // com 25 contra 4. Aqui os três números discordam de propósito, para que
  // qualquer código que confunda um com o outro fique visível sem rede.
  return { total: 21, owned: 1, cloned: 1 };
}

export async function synthesizeSpeechFixture(): Promise<SynthesizedSpeech> {
  const audio = await readFixture(FIXTURE_AUDIO_FILE);
  // `source: null` e duração conhecida da fixture (3s, ver ffmpeg em
  // CLAUDE.md): a duração é um fato do arquivo, mas não veio de medição do
  // vendor — e scriptDuration.ts não deve calibrar words-per-minute com
  // número inventado, então a origem fica explicitamente nula.
  return { audio, durationSeconds: 3, source: null };
}

export function checkVoiceConnectionFixture(): void {
  // Idem.
}

// ---------------------------------------------------------------- texto ---

/**
 * Resposta simulada dos provedores de TEXTO (Anthropic, Gemini, OpenAI).
 *
 * Entrou no bloco 5D-1. Até ele, `complete()` era o único caminho de saída de
 * rede do projeto que ignorava o modo — de modo que o botão "Gerar com IA" do
 * passo 2, o copiloto do tenant e o copiloto do admin chamavam o fornecedor de
 * verdade mesmo com `PROVIDER_MODE=fixture`. Toda afirmação de "zero chamadas
 * tarifadas" dos blocos anteriores dependia de ninguém ter clicado ali.
 *
 * O texto DIZ que é simulado, em vez de devolver um lorem ipsum plausível: uma
 * resposta simulada que se passa por real é pior que nenhuma, porque leva a
 * julgar a qualidade do modelo por algo que o modelo não escreveu. Pelo mesmo
 * motivo ele nomeia o vendor que TERIA sido chamado — é o que permite conferir
 * que a seleção de vendor está certa sem gastar cota para descobrir.
 */
export function completeFixture(vendor: string, promptChars: number): { text: string; usage: null } {
  return {
    text:
      `[SIMULADO] Este texto não veio de um modelo de linguagem. O ambiente está em ` +
      `PROVIDER_MODE=fixture, então a chamada a "${vendor}" não foi feita e nenhuma cota ` +
      `foi consumida. O pedido tinha ${promptChars} caracteres. ` +
      `Para gerar texto de verdade, use PROVIDER_MODE=live.`,
    // `usage: null` de propósito: inventar contagem de tokens alimentaria as
    // telas de custo com número que ninguém mediu, e a regra deste projeto é
    // que ausência de medição nunca vire zero — muito menos um valor plausível.
    usage: null,
  };
}

/**
 * Avatares simulados que ainda estão "em treino".
 *
 * Existe para que o portão de geração seja exercitável sem live. O id decide o
 * comportamento — um avatar cujo id contém `-processing-` fica em treino até o
 * prazo abaixo, e só então fica pronto. Assim os DOIS lados do portão têm como
 * ser provados, e o caminho feliz continua instantâneo (o normal em simulação
 * é o avatar já nascer pronto).
 */
const FIXTURE_AVATAR_TRAINING_MS = 10_000;
const fixtureAvatarCreatedAt = new Map<string, number>();

export function trainAvatarFixtureProcessing(): TrainAvatarResult {
  const id = `fixture-avatar-processing-${randomUUID()}`;
  fixtureAvatarCreatedAt.set(id, Date.now());
  return { providerAvatarId: id, status: "processing" };
}

export function waitForAvatarReadyFixture(providerAvatarId: string): AvatarProviderStatus {
  if (!providerAvatarId.includes("-processing-")) return "ready";
  const startedAt = fixtureAvatarCreatedAt.get(providerAvatarId);
  // Id desconhecido = o processo reiniciou desde a criação. Tratado como
  // pronto, e não como travado: em simulação, prender o fluxo por causa de
  // estado perdido em memória seria pior que a realidade.
  if (startedAt === undefined) return "ready";
  return Date.now() - startedAt < FIXTURE_AVATAR_TRAINING_MS ? "processing" : "ready";
}
