import type { FastifyInstance } from "fastify";
import { saveUpload } from "../services/storage.js";

// Generic upload endpoint used for one-off assets (e.g. a scenario or outfit
// reference image) that aren't tied to a specific avatar/video record.
export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/uploads", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No file uploaded" });
    const url = await saveUpload(req.tenantId, await file.toBuffer(), file.filename);
    return { url };
  });
}
