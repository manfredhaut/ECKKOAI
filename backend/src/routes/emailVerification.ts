import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { createRateLimiter } from "../services/rateLimit.js";
import { config } from "../config.js";
import {
  generateVerificationToken,
  sendVerificationEmail,
  verificationTokenExpiry,
} from "../services/providers/emailProvider.js";
import type { Tenant } from "../types.js";

// Instância PRÓPRIA, não compartilhada com login.ts — mesmos parâmetros
// (config.loginRateLimit), mas createRateLimiter() cria um Map por chamada
// de propósito: um endpoint sob ataque não pode gastar o orçamento de
// tentativas de outro (ver services/rateLimit.ts).
const isResendRateLimited = createRateLimiter(
  config.loginRateLimit.maxAttempts,
  config.loginRateLimit.windowMs,
);

export async function emailVerificationRoutes(app: FastifyInstance): Promise<void> {
  // Destino do link do e-mail (ver services/providers/emailProvider.ts,
  // verificationLink()). Público — quem clica não tem sessão nenhuma ainda.
  app.get<{ Querystring: { token?: string } }>("/verify-email", async (req, reply) => {
    const token = req.query.token;
    if (!token) return reply.code(400).send({ success: false, reason: "invalid" });

    const { rows } = await pool.query<Tenant>(
      "SELECT * FROM tenants WHERE email_verification_token = $1",
      [token],
    );
    const tenant = rows[0];
    if (!tenant) {
      return reply.code(400).send({ success: false, reason: "invalid" });
    }

    // Comparado no SERVIDOR (Date, não SQL now()) para o mesmo relógio que
    // gerou o prazo em verificationTokenExpiry() decidir se ele venceu —
    // evita depender de o fuso do Postgres bater com o do processo Node.
    const expiresAt = tenant.email_verification_expires_at
      ? new Date(tenant.email_verification_expires_at)
      : null;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ success: false, reason: "expired" });
    }

    await pool.query(
      "UPDATE tenants SET status = 'active', email_verification_token = NULL, email_verification_expires_at = NULL WHERE id = $1",
      [tenant.id],
    );

    return { success: true };
  });

  // Reenvio — cobre o e-mail que caiu no spam, nunca chegou, ou o token que
  // venceu antes de a pessoa clicar. Rate-limited pelo IP, mesmo padrão de
  // POST /login (services/rateLimit.ts), para não virar um jeito barato de
  // fazer a Resend mandar e-mail em massa para uma caixa alheia.
  app.post<{ Body: { email?: string } }>("/resend-verification", async (req, reply) => {
    if (isResendRateLimited(req.ip)) {
      return reply
        .code(429)
        .send({ error: "rate_limited", message: "Too many resend attempts, try again later." });
    }

    const email = req.body?.email?.trim();
    // Resposta ÚNICA independente de o e-mail existir, estar pendente, ou já
    // ter sido ativado — mesma doutrina do /login unificado: uma mensagem
    // diferente aqui revelaria se aquele e-mail tem conta neste produto.
    const GENERIC_RESPONSE = { sent: true } as const;
    if (!email) return GENERIC_RESPONSE;

    const { rows } = await pool.query<Tenant & { user_id: string }>(
      `SELECT t.*, u.id AS user_id
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND t.status = 'pending'`,
      [email],
    );
    const tenant = rows[0];
    if (!tenant) return GENERIC_RESPONSE;

    // Token NOVO, nunca reaproveitado — reenviar é o mesmo ato que gerar de
    // novo, com uma janela de 24h nova a partir de agora.
    const token = generateVerificationToken();
    const expiresAt = verificationTokenExpiry();
    await pool.query(
      "UPDATE tenants SET email_verification_token = $1, email_verification_expires_at = $2 WHERE id = $3",
      [token, expiresAt, tenant.id],
    );

    try {
      await sendVerificationEmail(email, token);
    } catch (err) {
      req.log.error({ err, tenantId: tenant.id }, "falha ao reenviar e-mail de verificação");
    }

    return GENERIC_RESPONSE;
  });
}
