import type { FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db/pool.js";

// Applied only to generation/consumption routes (POST /videos, POST
// /avatars/:id/reference-video, POST /scripts/generate) — NOT the whole
// requireAuth-gated block. A suspended tenant can still log in and read
// its own data (dashboard, Minha Assinatura) to resolve a payment issue;
// it just can't create new billable work. See CLAUDE.md / billing plan,
// Fase 3.
export async function requireActiveTenant(req: FastifyRequest, reply: FastifyReply) {
  const { rows } = await pool.query<{ status: string }>("SELECT status FROM tenants WHERE id = $1", [
    req.tenantId,
  ]);
  if (rows[0]?.status === "suspended") {
    return reply.code(403).send({
      error: "tenant_suspended",
      message: "Sua conta está suspensa. Veja Minha Assinatura para resolver uma pendência de pagamento.",
    });
  }
}
