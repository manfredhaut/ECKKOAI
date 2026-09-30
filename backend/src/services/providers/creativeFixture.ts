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

interface JobState {
  tenantId: string;
  startedAt: number;
}

const jobs = new Map<string, JobState>();

export async function createCreativeJobFixture(input: CreativeJobInput): Promise<CreativeJobCreateResult> {
  if (input.modo !== "imagem") {
    throw new Error(
      `creativeFixture: modo "${input.modo}" ainda não tem fixture — só "imagem" nesta rodada.`,
    );
  }
  const jobId = `fixture-creative-${randomUUID()}`;
  jobs.set(jobId, { tenantId: input.tenantId, startedAt: Date.now() });
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
  const buffer = await readFile(path.join(FIXTURES_DIR, FIXTURE_IMAGE_FILE));
  const outputUrl = await saveUpload(job.tenantId, buffer, "criativo-simulado.png");
  jobs.delete(jobId);
  return { status: "ready", outputUrl };
}
