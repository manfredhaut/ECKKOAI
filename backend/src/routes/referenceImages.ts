import type { FastifyInstance } from "fastify";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import type { ReferenceImage } from "../types.js";
import { saveUpload } from "../services/storage.js";

export async function referenceImageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/reference-images", async (req) => {
    const { rows } = await pool.query<ReferenceImage>(
      "SELECT * FROM reference_images WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId],
    );
    return rows;
  });

  app.post("/reference-images", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No file uploaded" });

    const url = await saveUpload(req.tenantId, await file.toBuffer(), file.filename);
    const { rows } = await pool.query<ReferenceImage>(
      `INSERT INTO reference_images (tenant_id, filename, file_url) VALUES ($1, $2, $3) RETURNING *`,
      [req.tenantId, file.filename, url],
    );
    return reply.code(201).send(rows[0]);
  });

  app.delete<{ Params: { id: string } }>("/reference-images/:id", async (req, reply) => {
    const { rows } = await pool.query<ReferenceImage>(
      "SELECT * FROM reference_images WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const image = rows[0];
    if (image) {
      await unlink(path.join(config.uploadsDir, image.file_url.replace("/uploads/", ""))).catch(
        () => {},
      );
      await pool.query("DELETE FROM reference_images WHERE id = $1 AND tenant_id = $2", [
        req.params.id,
        req.tenantId,
      ]);
    }
    return reply.code(204).send();
  });
}
