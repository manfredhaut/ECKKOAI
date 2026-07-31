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
import type { GenerateVideoInput, GenerateVideoResult, PollResult, TrainAvatarResult } from "./avatarProvider.js";
import type { CloneVoiceResult, SynthesizedSpeech } from "./voiceProvider.js";

/** Quanto tempo o job simulado passa em `processing` antes de concluir. */
const SIMULATED_JOB_DURATION_MS = 12_000;

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

export const FIXTURE_VIDEO_FILE = "simulated-video.mp4";
export const FIXTURE_AUDIO_FILE = "simulated-speech.mp3";

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

// --------------------------------------------------------------- avatar ---

export function trainAvatarFixture(): TrainAvatarResult {
  // Prefixo explícito: um id de avatar simulado nunca deve ser confundido
  // com um id real do vendor ao ler o banco depois.
  return { providerAvatarId: `fixture-avatar-${randomUUID()}` };
}

export function generateVideoFixture(input: GenerateVideoInput): GenerateVideoResult {
  const providerJobId = `fixture-${randomUUID()}`;
  jobs.set(providerJobId, { tenantId: input.tenantId, startedAt: Date.now() });
  return { providerJobId };
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
  // real faria ao publicar o resultado.
  const buffer = await readFixture(FIXTURE_VIDEO_FILE);
  const outputUrl = await saveUpload(job.tenantId, buffer, "simulado.mp4");
  jobs.delete(jobId);
  return { status: "ready", outputUrl };
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
