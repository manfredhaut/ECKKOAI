import type { FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface Session {
    adminUserId?: string;
  }
  interface FastifyRequest {
    adminUserId: string;
  }
}

// Completely decoupled from requireAuth: a tenant session never becomes an
// admin session (and vice versa) because they're different session fields,
// not a role on the same identity. See CLAUDE.md / admin panel plan, Section 7.
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session.adminUserId) {
    return reply.code(401).send({ error: "Not authenticated as admin" });
  }
  req.adminUserId = req.session.adminUserId;
}
