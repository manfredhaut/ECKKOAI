import type { FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface Session {
    userId?: string;
    tenantId?: string;
  }
  interface FastifyRequest {
    tenantId: string;
    userId: string;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session.userId || !req.session.tenantId) {
    // Returning `reply` (not just calling .send()) tells Fastify the
    // preHandler chain is done, so it doesn't fall through to the route
    // handler and try to send a second response.
    return reply.code(401).send({ error: "Not authenticated" });
  }
  req.userId = req.session.userId;
  req.tenantId = req.session.tenantId;
}
