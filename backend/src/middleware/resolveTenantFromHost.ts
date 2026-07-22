import type { FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db/pool.js";
import { BASE_DOMAIN } from "../domainConfig.js";

declare module "fastify" {
  interface FastifyRequest {
    hostTenantId: string | null;
  }
}

// Resolves which tenant a request belongs to from its subdomain (Host
// header), e.g. "acme.twinai.localhost" -> the tenant whose slug is "acme".
// On the root domain (or any host that doesn't match BASE_DOMAIN), no tenant
// is resolved — callers fall back to their pre-subdomain behavior.
export async function resolveTenantFromHost(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  req.hostTenantId = null;

  const hostname = req.hostname;
  if (!hostname || hostname === BASE_DOMAIN || !hostname.endsWith(`.${BASE_DOMAIN}`)) {
    return;
  }

  const slug = hostname.slice(0, -(BASE_DOMAIN.length + 1));
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [slug]);
  req.hostTenantId = rows[0]?.id ?? null;
}
