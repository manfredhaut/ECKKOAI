import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

interface ProcessingJob {
  id: string;
  type: "video" | "document";
  label: string;
  status: string;
  created_at: string;
}

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get("/jobs/processing", async (req) => {
    const { rows: videoRows } = await pool.query<{
      id: string;
      script: string;
      status: string;
      created_at: string;
    }>(
      // Os dois `awaiting_approval*` ENTRAM, e são os que mais precisam
      // entrar: são os únicos estados que não saem sozinhos. Um vídeo em
      // `processing` termina com ou sem ninguém olhando; uma aprovação
      // pendente (de imagem OU de vídeo mudo — migration 059) expira em 24 h
      // e joga fora trabalho já pago. Deixá-los de fora daqui seria esconder
      // justamente o item que depende de alguém lembrar dele.
      `SELECT id, script, status, created_at FROM videos
       WHERE tenant_id = $1 AND status IN ('queued', 'processing', 'awaiting_approval', 'awaiting_approval_video')
       ORDER BY created_at DESC`,
      [req.tenantId],
    );
    const { rows: documentRows } = await pool.query<{
      id: string;
      filename: string;
      status: string;
      created_at: string;
    }>(
      `SELECT id, filename, status, created_at FROM documents
       WHERE tenant_id = $1 AND status = 'processing'
       ORDER BY created_at DESC`,
      [req.tenantId],
    );

    const jobs: ProcessingJob[] = [
      ...videoRows.map((v) => ({
        id: v.id,
        type: "video" as const,
        label: v.script.slice(0, 40),
        status: v.status,
        created_at: v.created_at,
      })),
      ...documentRows.map((d) => ({
        id: d.id,
        type: "document" as const,
        label: d.filename,
        status: d.status,
        created_at: d.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return jobs;
  });
}
