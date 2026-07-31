import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { verifyPassword } from "../services/passwords.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createRateLimiter } from "../services/rateLimit.js";
import { config } from "../config.js";
import type { AdminUser } from "../types.js";

// Este endpoint É chamado pelo frontend: AdminLoginModal.tsx (o link
// "Acesso administrativo" no rodapé da landing) posta aqui, de propósito,
// para que admin e tenant nunca compartilhem formulário nem endpoint.
// POST /login (routes/login.ts) atende o cliente e tem limiter próprio.
//
// Limiter com contador independente do de /login — cada chamada a
// createRateLimiter cria seu próprio Map, então gastar tentativas numa
// zona não cega a outra. Mesmos valores configuráveis.
const isLoginRateLimited = createRateLimiter(
  config.loginRateLimit.maxAttempts,
  config.loginRateLimit.windowMs,
);

// Login for the eckko.ai internal team — a separate identity from tenant
// users (`admin_users`, not a role on `users`). Tenant login in routes/auth.ts
// is untouched by this file.
export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { email: string; password: string } }>("/admin/login", async (req, reply) => {
    if (isLoginRateLimited(req.ip)) {
      return reply.code(429).send({ error: "rate_limited", message: "Too many login attempts, try again later." });
    }

    const { email, password } = req.body;

    const { rows } = await pool.query<AdminUser>("SELECT * FROM admin_users WHERE email = $1", [email]);
    const admin = rows[0];
    if (!admin || !(await verifyPassword(password, admin.password_hash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    req.session.adminUserId = admin.id;

    return { id: admin.id, email: admin.email, name: admin.name };
  });

  app.post("/admin/logout", async (req, reply) => {
    await req.session.destroy();
    return reply.code(204).send();
  });

  app.get("/admin/me", { preHandler: requireAdmin }, async (req, reply) => {
    const { rows } = await pool.query<AdminUser>("SELECT * FROM admin_users WHERE id = $1", [
      req.adminUserId,
    ]);
    const admin = rows[0];
    if (!admin) return reply.code(401).send({ error: "Not authenticated as admin" });

    return { id: admin.id, email: admin.email, name: admin.name };
  });
}
