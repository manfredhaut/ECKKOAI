import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { verifyPassword } from "../services/passwords.js";
import { createRateLimiter } from "../services/rateLimit.js";
import type { AdminUser, Tenant, User } from "../types.js";

const isLoginRateLimited = createRateLimiter(5, 15 * 60 * 1000);

const INVALID_CREDENTIALS = { error: "invalid_credentials", message: "Invalid email or password" };

// Single login form for everyone (admin and tenant alike) — no visual or
// URL indication of which kind of account is signing in. See CLAUDE.md /
// admin panel plan: admin_users and users stay completely separate
// identities server-side; this endpoint just tries both and tells the
// frontend which one matched, via `type`.
export async function loginRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { email: string; password: string } }>("/login", async (req, reply) => {
    if (isLoginRateLimited(req.ip)) {
      return reply.code(429).send({ error: "rate_limited", message: "Too many login attempts, try again later." });
    }

    const { email, password } = req.body;

    // Admin only makes sense off a tenant subdomain — enforced here, not
    // just hidden in the UI. req.hostTenantId is resolved by the global
    // resolveTenantFromHost hook before this handler runs; when a request
    // arrives on a tenant subdomain, admin_users is never even queried, so
    // a valid admin credential posted against e.g. acme.twinai.localhost
    // still can't produce an admin session.
    if (!req.hostTenantId) {
      const { rows: adminRows } = await pool.query<AdminUser>("SELECT * FROM admin_users WHERE email = $1", [
        email,
      ]);
      const admin = adminRows[0];
      if (admin && (await verifyPassword(password, admin.password_hash))) {
        req.session.adminUserId = admin.id;
        return { type: "admin" as const, admin: { id: admin.id, email: admin.email, name: admin.name } };
      }
    }

    // Same tenant-scoping rule as the old /auth/login: scope by subdomain
    // when resolved, otherwise fall back to an unscoped lookup (root domain).
    const { rows: userRows } = req.hostTenantId
      ? await pool.query<User>("SELECT * FROM users WHERE tenant_id = $1 AND email = $2", [
          req.hostTenantId,
          email,
        ])
      : await pool.query<User>("SELECT * FROM users WHERE email = $1", [email]);
    const user = userRows[0];
    if (user && (await verifyPassword(password, user.password_hash))) {
      req.session.userId = user.id;
      req.session.tenantId = user.tenant_id;
      const { rows: tenantRows } = await pool.query<Tenant>("SELECT * FROM tenants WHERE id = $1", [
        user.tenant_id,
      ]);
      return {
        type: "tenant" as const,
        user: { id: user.id, email: user.email },
        tenant: { id: tenantRows[0].id, name: tenantRows[0].name, slug: tenantRows[0].slug },
      };
    }

    // Same generic message and status regardless of which lookup (admin or
    // tenant) failed, or whether the email matched neither — never let a
    // timing/message difference reveal which table an email belongs to.
    return reply.code(401).send(INVALID_CREDENTIALS);
  });
}
