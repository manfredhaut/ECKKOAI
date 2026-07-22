import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { maskKey } from "../services/crypto.js";
import { defaultVendor } from "../services/providers/vendorCatalog.js";
import type { CredentialProvider } from "../types.js";

interface CredentialRow {
  id: string;
  provider: CredentialProvider;
  encrypted_key: string | null;
  vendor: string | null;
  connected: boolean;
  updated_at: string;
}

// Never send encrypted_key (or its decrypted value) to the frontend — only a masked hint.
function toPublic(row: CredentialRow) {
  return {
    provider: row.provider,
    connected: row.connected,
    updated_at: row.updated_at,
    masked_key: row.encrypted_key ? maskKey(row.encrypted_key).slice(-8) : null,
    vendor: row.vendor ?? defaultVendor(row.provider),
  };
}

export async function credentialRoutes(app: FastifyInstance): Promise<void> {
  app.get("/credentials", async (req) => {
    const { rows } = await pool.query<CredentialRow>(
      "SELECT * FROM api_credentials WHERE tenant_id = $1 ORDER BY provider",
      [req.tenantId],
    );
    return rows.map(toPublic);
  });

  // Credentials are platform-managed now (see CLAUDE.md, Section 1 — BYOK→
  // platform-key migration): the tenant can still read its current state via
  // GET above, but writing/testing is an admin-panel-only action.
  app.put("/credentials/:provider", async (_req, reply) => {
    return reply.code(403).send({
      error: "managed_by_platform",
      message: "Este provedor é gerenciado pela plataforma. Fale com o suporte para alterar.",
    });
  });

  app.post("/credentials/:provider/test", async (_req, reply) => {
    return reply.code(403).send({
      error: "managed_by_platform",
      message: "Este provedor é gerenciado pela plataforma. Fale com o suporte para alterar.",
    });
  });
}
