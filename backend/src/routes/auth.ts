import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import { generateUniqueSlug } from "../services/slug.js";
import type { Tenant, User } from "../types.js";

// Código de erro do Postgres para violação de UNIQUE (23505) — usado no catch
// da transação de signup abaixo para reconhecer a corrida entre duas
// tentativas simultâneas com o mesmo e-mail. Só a checagem otimista (mais
// abaixo) não fecha essa corrida; a constraint da migration 053 fecha.
const POSTGRES_UNIQUE_VIOLATION = "23505";

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
  // (with a generated slug, used only as an internal identifier now — see
  // domínio único, VITE-PROD-4) and its first (admin) user.
  app.post<{ Body: { email: string; password: string } }>("/auth/signup", async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return reply.code(400).send({ error: "Email and password are required" });
    }

    // Domínio único (14/08/2026): login resolve por e-mail SEM escopo de
    // tenant quando não há subdomínio (ver login.ts) — dois tenants com o
    // mesmo e-mail tornariam esse lookup ambíguo. Esta é a checagem
    // otimista, fora da transação, para devolver um erro claro no caso
    // comum; UNIQUE (email) (migration 053) é quem fecha a corrida entre
    // duas tentativas concorrentes, tratada no catch abaixo.
    const { rows: existingRows } = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    if (existingRows.length > 0) {
      return reply.code(409).send({ error: "email_in_use", message: "Email already in use" });
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
      // Corrida: duas requisições de signup com o mesmo e-mail passaram
      // pela checagem otimista antes de qualquer uma commitar. A checagem
      // dá a mensagem clara no caso comum; isto aqui é o que garante o
      // mesmo resultado sob concorrência, em vez de vazar um 500 genérico
      // de violação de constraint.
      if (err && typeof err === "object" && "code" in err && err.code === POSTGRES_UNIQUE_VIOLATION) {
        return reply.code(409).send({ error: "email_in_use", message: "Email already in use" });
      }
      throw err;
    } finally {
      client.release();
    }

    req.session.userId = user.id;
    req.session.tenantId = tenant.id;

    // Sem `host`: domínio único (14/08/2026) — não existe mais subdomínio
    // de tenant para montar. O chamador (SignupPage) permanece no mesmo
    // host depois do cadastro, navegação client-side.
    return reply.code(201).send({
      user: { id: user.id, email: user.email },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
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
