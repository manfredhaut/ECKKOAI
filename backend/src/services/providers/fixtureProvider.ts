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
import type { CloneVoiceResult, SynthesizedSpeech } from "./voiceProvider.js";
import { HEYGEN_ASPECT_RATIOS, type AspectRatio } from "./videoFormat.js";
import { selectEngine } from "./videoEngine.js";

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
  console.warn(
    JSON.stringify({
      event: "fixture_aspect_ratio_missing",
      requested: aspectRatio,
      known: HEYGEN_ASPECT_RATIOS,
      consequence: "entregando 16:9 — a simulação NÃO honrou a proporção pedida",
    }),
  );
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

export function generateVideoFixture(input: GenerateVideoInput): GenerateVideoResult {
  const providerJobId = `fixture-${randomUUID()}`;
  jobs.set(providerJobId, {
    tenantId: input.tenantId,
    startedAt: Date.now(),
    aspectRatio: input.format.aspectRatio,
  });
  const selection = selectEngine(input.supportedEngines);
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
