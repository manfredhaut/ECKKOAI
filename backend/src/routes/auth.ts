import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import { generateUniqueSlug } from "../services/slug.js";
import { BASE_DOMAIN } from "../domainConfig.js";
import type { Tenant, User } from "../types.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { email: string; password: string } }>("/auth/login", async (req, reply) => {
    const { email, password } = req.body;

    // Scope the lookup to the tenant resolved from the subdomain (if any) —
    // the same email can exist across different tenants (UNIQUE (tenant_id,
    // email)). Falls back to an unscoped lookup on the root domain, where no
    // tenant is resolved from the Host header.
    const { rows } = req.hostTenantId
      ? await pool.query<User>("SELECT * FROM users WHERE tenant_id = $1 AND email = $2", [
          req.hostTenantId,
          email,
        ])
      : await pool.query<User>("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    req.session.userId = user.id;
    req.session.tenantId = user.tenant_id;

    return { id: user.id, email: user.email, tenantId: user.tenant_id };
  });

  // Public self-signup: minimal email+password, auto-provisions a tenant
  // (with a generated slug/subdomain) and its first (admin) user.
  app.post<{ Body: { email: string; password: string } }>("/auth/signup", async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return reply.code(400).send({ error: "Email and password are required" });
    }

    // Password hashing is CPU-bound, not a DB call — do it before opening
    // the transaction so the connection isn't held open during it.
    const passwordHash = await hashPassword(password);
    // Optimistic uniqueness pre-check via the shared pool — the real
    // guarantee is the UNIQUE constraint on tenants.slug, enforced inside
    // the transaction below at INSERT time.
    const slug = await generateUniqueSlug(email);

    // Tenant + its 3 api_credentials placeholder rows + its 3 tenant_credits
    // rows (see migration 028 — new signups didn't get this seed until now)
    // + the first user all have to succeed together: a signup that creates
    // a tenant but fails partway through (no credit rows, no user to log
    // in) is exactly the broken state this transaction exists to prevent.
    const client = await pool.connect();
    let tenant: Tenant;
    let user: User;
    try {
      await client.query("BEGIN");

      const { rows: tenantRows } = await client.query<Tenant>(
        "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING *",
        [slug, slug],
      );
      tenant = tenantRows[0];

      for (const provider of ["avatar", "voice", "script"]) {
        await client.query(
          "INSERT INTO api_credentials (tenant_id, provider, connected) VALUES ($1, $2, false)",
          [tenant.id, provider],
        );
      }

      for (const creditType of ["video", "script", "avatar"]) {
        await client.query(
          "INSERT INTO tenant_credits (tenant_id, credit_type, balance) VALUES ($1, $2, 0)",
          [tenant.id, creditType],
        );
      }

      // Os baldes de ENSAIO nascem junto (migration 043). Um tenant criado
      // depois dela sem estas linhas encontraria saldo 0 em `fixture` e seria
      // recusado pelo portão de prontidão — o mesmo defeito que a migration
      // conserta, reaparecendo só para quem se cadastrou depois.
      //
      // Ao contrário dos três acima, estes vêm com saldo e por isso EXIGEM
      // lançamento: `balance` é um cache do que o ledger soma, e semear 500 sem
      // a linha correspondente colocaria todo cadastro novo na lista de
      // divergências que `preflightLive` confere antes de cada passada paga.
      for (const creditType of ["video_rehearsal", "script_rehearsal", "avatar_rehearsal"]) {
        await client.query(
          "INSERT INTO tenant_credits (tenant_id, credit_type, balance) VALUES ($1, $2, 500)",
          [tenant.id, creditType],
        );
        await client.query(
          "INSERT INTO credit_ledger (tenant_id, credit_type, delta, reason) VALUES ($1, $2, 500, 'grant')",
          [tenant.id, creditType],
        );
      }

      const { rows: userRows } = await client.query<User>(
        "INSERT INTO users (tenant_id, email, password_hash) VALUES ($1, $2, $3) RETURNING *",
        [tenant.id, email, passwordHash],
      );
      user = userRows[0];

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    req.session.userId = user.id;
    req.session.tenantId = tenant.id;

    return reply.code(201).send({
      user: { id: user.id, email: user.email },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, host: `${tenant.slug}.${BASE_DOMAIN}` },
    });
  });

  app.post("/auth/logout", async (req, reply) => {
    await req.session.destroy();
    return reply.code(204).send();
  });

  app.get("/auth/me", async (req, reply) => {
    if (!req.session.userId || !req.session.tenantId) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    const { rows: userRows } = await pool.query<User>("SELECT * FROM users WHERE id = $1", [
      req.session.userId,
    ]);
    const { rows: tenantRows } = await pool.query<Tenant>("SELECT * FROM tenants WHERE id = $1", [
      req.session.tenantId,
    ]);
    if (!userRows[0] || !tenantRows[0]) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    return {
      user: { id: userRows[0].id, email: userRows[0].email },
      tenant: { id: tenantRows[0].id, name: tenantRows[0].name, slug: tenantRows[0].slug },
    };
  });
}
