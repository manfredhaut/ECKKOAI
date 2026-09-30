/**
 * ABAS-5 — fixture do motor de jobs da aba 5, modo IMAGEM só.
 *
 * Mesmo padrão de fixtureProvider.ts (generateVideoFixture/pollVideoJobFixture):
 * nenhum job "pronto" na primeira chamada — fica em processing por um tempo
 * real, e só então materializa o artefato. Reaproveita fixture-composicao.png
 * (o único PNG de amostra do repositório) em vez de criar um arquivo novo.
 * Importa só a constante exportada FIXTURES_DIR de fixtureProvider.ts —
 * nenhuma edição naquele arquivo.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { saveUpload } from "../storage.js";
import { FIXTURES_DIR } from "./fixtureProvider.js";
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
}

const jobs = new Map<string, JobState>();

const MODOS_COM_FIXTURE = new Set(["imagem", "narracao", "musica"]);

export async function createCreativeJobFixture(input: CreativeJobInput): Promise<CreativeJobCreateResult> {
  if (!MODOS_COM_FIXTURE.has(input.modo)) {
    throw new Error(
      `creativeFixture: modo "${input.modo}" ainda não tem fixture — só imagem/narração/música nesta rodada.`,
    );
  }
  const jobId = `fixture-creative-${randomUUID()}`;
  jobs.set(jobId, { tenantId: input.tenantId, startedAt: Date.now(), modo: input.modo });
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
  const arquivo = ehAudio ? FIXTURE_AUDIO_FILE : FIXTURE_IMAGE_FILE;
  const nomeDestino = ehAudio ? "criativo-simulado.mp3" : "criativo-simulado.png";
  const buffer = await readFile(path.join(FIXTURES_DIR, arquivo));
  const outputUrl = await saveUpload(job.tenantId, buffer, nomeDestino);
  jobs.delete(jobId);
  return { status: "ready", outputUrl };
}
