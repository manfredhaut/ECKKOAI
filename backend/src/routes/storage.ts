import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import type { StorageProviderId } from "../services/providers/storageProvider.js";

export async function storageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/storage-provider", async (req) => {
    const { rows } = await pool.query<{ storage_provider: StorageProviderId }>(
      "SELECT storage_provider FROM tenants WHERE id = $1",
      [req.tenantId],
    );
    return { provider: rows[0]?.storage_provider ?? "drive" };
  });

  // Storage provider is platform-managed now — the tenant can still read its
  // current setting via GET above, but changing it is an admin-panel-only
  // action (see routes/adminPanel.ts PUT /admin/tenants/:tenantId/storage-provider).
  app.put("/storage-provider", async (_req, reply) => {
    return reply.code(403).send({
      error: "managed_by_platform",
      message: "Este provedor é gerenciado pela plataforma. Fale com o suporte para alterar.",
    });
  });
}
