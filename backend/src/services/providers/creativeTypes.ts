/**
 * ABAS-5 — tipos do motor de jobs da aba "5. Gerar Vídeos & Imagens".
 *
 * Domínio PRÓPRIO, sem reuso de GenerateVideoInput/GenerateVideoResult
 * (avatarProvider.ts): aqueles carregam campos de avatar e de voz que não
 * fazem sentido para uma referência de imagem ou um b-roll sem voz — ver
 * a decisão registrada de não forçar reuso onde a forma não serve.
 */
import type { CreativeModo } from "./creativeCatalog.js";

export interface CreativeJobInput {
  tenantId: string;
  modo: CreativeModo;
  modeloId: string;
  titulo: string;
  prompt: string;
  aspectRatio?: string | null;
}

export interface CreativeJobCreateResult {
  jobId: string;
}

export type CreativeJobPollResult =
  | { status: "processing" }
  | { status: "ready"; outputUrl: string }
  | { status: "error"; errorMessage: string };

export function isCreativeFixtureJobId(jobId: string): boolean {
  return jobId.startsWith("fixture-creative-");
}
