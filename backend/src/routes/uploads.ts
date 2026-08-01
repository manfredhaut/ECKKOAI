import type { FastifyInstance } from "fastify";
import { saveUpload } from "../services/storage.js";
import { imageUploadMaxBytes, takeUpload } from "../services/uploadLimits.js";

// Generic upload endpoint used for one-off assets (e.g. a scenario or outfit
// reference image) that aren't tied to a specific avatar/video record.
export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/uploads", async (req, reply) => {
    // Teto de IMAGEM. Esta rota recebe as referências de cenário e traje do
    // passo 3, e ficou em 1 MiB até a primeira passada live: qualquer foto de
    // celular era recusada com "request file too large" cru.
    const up = await takeUpload(req, reply, {
      maxBytes: imageUploadMaxBytes(),
      route: "uploads.generic",
      kind: "image",
    });
    if (!up) return reply;

    const url = await saveUpload(req.tenantId, up.buffer, up.file.filename);
    return { url };
  });
}
