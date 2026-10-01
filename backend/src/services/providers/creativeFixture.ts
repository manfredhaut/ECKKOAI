/**
 * ABAS-5/ABAS-22 — fixture do motor de jobs da aba 5: imagem, narração,
 * música, e agora (30/09/2026) broll/propaganda (vídeo).
 *
 * Mesmo padrão de fixtureProvider.ts (generateVideoFixture/pollVideoJobFixture):
 * nenhum job "pronto" na primeira chamada — fica em processing por um tempo
 * real, e só então materializa o artefato. Reaproveita fixture-composicao.png
 * (imagem), simulated-speech.mp3 (áudio) e FIXTURE_VIDEO_FILES por proporção
 * (vídeo, mesmas fixtures do pipeline de avatar) em vez de criar arquivo novo.
 * Importa só constantes já exportadas de fixtureProvider.ts — nenhuma edição
 * naquele arquivo.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { saveUpload } from "../storage.js";
import { FIXTURES_DIR, FIXTURE_VIDEO_FILES } from "./fixtureProvider.js";
import type { AspectRatio } from "./videoFormat.js";
import type { CreativeJobInput, CreativeJobCreateResult, CreativeJobPollResult } from "./creativeTypes.js";

const SIMULATED_JOB_DURATION_MS = 3_000;
const FIXTURE_IMAGE_FILE = "fixture-composicao.png";
// ABAS-10 — narração e música reaproveitam o MESMO áudio de amostra que a
// clonagem de voz já usa (simulated-speech.mp3): a fixture existe para
// provar o pipeline assíncrono, não para soar diferente por modo.
const FIXTURE_AUDIO_FILE = "simulated-speech.mp3";

interface JobState {
  tenantId: string;
  startedAt: number;
  modo: CreativeJobInput["modo"];
  aspectRatio: AspectRatio;
}

const jobs = new Map<string, JobState>();

// ABAS-22, 30/09/2026 — broll e propaganda entram na fixture: geram vídeo
// simulado, reaproveitando FIXTURE_VIDEO_FILES (mesma fixture por
// proporção que o pipeline de avatar já usa) em vez de criar arquivo novo.
const MODOS_COM_FIXTURE = new Set(["imagem", "narracao", "musica", "broll", "propaganda"]);
const MODOS_DE_VIDEO = new Set(["broll", "propaganda"]);
const ASPECT_RATIO_PADRAO: AspectRatio = "16:9";

function aspectRatioValida(valor: string | null | undefined): AspectRatio {
  return valor && valor in FIXTURE_VIDEO_FILES ? (valor as AspectRatio) : ASPECT_RATIO_PADRAO;
}

export async function createCreativeJobFixture(input: CreativeJobInput): Promise<CreativeJobCreateResult> {
  if (!MODOS_COM_FIXTURE.has(input.modo)) {
    throw new Error(
      `creativeFixture: modo "${input.modo}" ainda não tem fixture — só imagem/narração/música/b-roll/propaganda nesta rodada.`,
    );
  }
  const jobId = `fixture-creative-${randomUUID()}`;
  jobs.set(jobId, {
    tenantId: input.tenantId,
    startedAt: Date.now(),
    modo: input.modo,
    aspectRatio: aspectRatioValida(input.aspectRatio),
  });
  return { jobId };
}

export async function pollCreativeJobFixture(jobId: string): Promise<CreativeJobPollResult> {
  const job = jobs.get(jobId);
  if (!job) {
    return {
      status: "error",
      errorMessage: "Job simulado não encontrado (o servidor reiniciou desde a criação).",
    };
  }
  if (Date.now() - job.startedAt < SIMULATED_JOB_DURATION_MS) {
    return { status: "processing" };
  }
  const ehAudio = job.modo === "narracao" || job.modo === "musica";
  const ehVideo = MODOS_DE_VIDEO.has(job.modo);
  const arquivo = ehAudio
    ? FIXTURE_AUDIO_FILE
    : ehVideo
      ? FIXTURE_VIDEO_FILES[job.aspectRatio]
      : FIXTURE_IMAGE_FILE;
  const nomeDestino = ehAudio ? "criativo-simulado.mp3" : ehVideo ? "criativo-simulado.mp4" : "criativo-simulado.png";
  const buffer = await readFile(path.join(FIXTURES_DIR, arquivo));
  const outputUrl = await saveUpload(job.tenantId, buffer, nomeDestino);
  jobs.delete(jobId);
  return { status: "ready", outputUrl };
}
