import type { FastifyInstance } from "fastify";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import type { KnowledgeDocument } from "../types.js";
import { saveUpload } from "../services/storage.js";
import { extractText } from "../services/textExtraction.js";
import { chunkText } from "../services/chunking.js";
import { generateEmbedding } from "../services/providers/embeddingProvider.js";
import { createNotification } from "../services/notifications.js";

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

async function processDocument(
  documentId: string,
  tenantId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<void> {
  try {
    const text = await extractText(buffer, mimeType, filename);
    const chunks = chunkText(text);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i]);
      await pool.query(
        `INSERT INTO document_chunks (document_id, tenant_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [documentId, tenantId, i, chunks[i], toVectorLiteral(embedding)],
      );
    }

    await pool.query("UPDATE documents SET status = 'indexed' WHERE id = $1", [documentId]);
    await createNotification(tenantId, "document_indexed", `"${filename}" finished indexing`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await pool.query("UPDATE documents SET status = 'error', error_message = $2 WHERE id = $1", [
      documentId,
      message,
    ]);
  }
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/documents", async (req) => {
    const { rows } = await pool.query<KnowledgeDocument>(
      "SELECT * FROM documents WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId],
    );
    return rows;
  });

  app.post("/documents", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No file uploaded" });

    const buffer = await file.toBuffer();
    const url = await saveUpload(req.tenantId, buffer, file.filename);

    const { rows } = await pool.query<KnowledgeDocument>(
      `INSERT INTO documents (tenant_id, filename, file_url, mime_type, status)
       VALUES ($1, $2, $3, $4, 'processing') RETURNING *`,
      [req.tenantId, file.filename, url, file.mimetype],
    );
    const document = rows[0];

    processDocument(document.id, req.tenantId, buffer, file.mimetype, file.filename).catch(() => {});

    return reply.code(201).send(document);
  });

  app.delete<{ Params: { id: string } }>("/documents/:id", async (req, reply) => {
    const { rows } = await pool.query<KnowledgeDocument>(
      "SELECT * FROM documents WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const document = rows[0];
    if (document) {
      await unlink(path.join(config.uploadsDir, document.file_url.replace("/uploads/", ""))).catch(
        () => {},
      );
      await pool.query("DELETE FROM documents WHERE id = $1 AND tenant_id = $2", [
        req.params.id,
        req.tenantId,
      ]);
    }
    return reply.code(204).send();
  });
}
