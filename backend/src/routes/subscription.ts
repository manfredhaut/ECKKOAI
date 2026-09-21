import type { FastifyInstance, FastifyRequest } from "fastify";
import { pool } from "../db/pool.js";
import { getAllPlans, getPlan, findPlan } from "../plans.js";
import {
  getStripe,
  getOrCreateStripePrice,
  getOrCreateCreditPackagePrice,
  StripeNotConfiguredError,
} from "../services/billing/stripeClient.js";
import { findActiveCreditPackage } from "../services/billing/creditPackages.js";
import { generateUniqueSlugFromName } from "../services/slug.js";
import { BASE_DOMAIN } from "../domainConfig.js";
import type { Tenant } from "../types.js";

async function getTenant(tenantId: string): Promise<Tenant> {
  const { rows } = await pool.query<Tenant>("SELECT * FROM tenants WHERE id = $1", [tenantId]);
  return rows[0];
}

function maskCardNumber(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, "");
  return `•••• ${digits.slice(-4)}`;
}

// MEDIDO na VPS (14/08/2026): as duas chamadas do Stripe Checkout abaixo
// montavam `origin` com `http://` fixo. Produção é HTTPS (Traefik termina o
// TLS e repassa ao backend em texto claro) — o success_url/cancel_url do
// Stripe saía http:// mesmo servindo por trás de certificado real. Sem
// `trustProxy` no Fastify (app.ts), `req.protocol` não lê X-Forwarded-Proto;
// lemos o header diretamente, que é o que o Traefik sempre envia.
function requestOrigin(req: FastifyRequest): string {
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || "http";
  return `${proto}://${req.headers.host}`;
}

export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/subscription", async (req) => {
    const tenant = await getTenant(req.tenantId);
    const [plan, availablePlans, { rows }] = await Promise.all([
      getPlan(tenant.plan_id),
      getAllPlans(),
      pool.query<{ count: string }>(
        `SELECT count(*) FROM videos
         WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`,
        [req.tenantId],
      ),
    ]);

    return {
      companyName: tenant.name,
      whatsapp: tenant.whatsapp,
      address: tenant.address,
      city: tenant.city,
      state: tenant.state,
      slug: tenant.slug,
      // profile_completed_at (migration 057) é o sinal de "já preencheu o
      // formulário de perfil (WhatsApp/endereço)" — separado de slug_locked,
      // que só responde "o slug já foi calculado uma vez?" e nasceu true
      // para todo tenant anterior à migration 054. Reusar slug_locked aqui
      // escondia o card de quem nunca tinha visto o formulário.
      profileCompletedAt: tenant.profile_completed_at,
      plan,
      availablePlans,
      usage: {
        videosThisMonth: Number(rows[0].count),
        limit: plan.videoLimitPerMonth,
      },
      paymentMethodMasked: tenant.payment_method_masked,
    };
  });

  app.put<{ Body: { planId: string } }>("/subscription/plan", async (req, reply) => {
    const plan = await findPlan(req.body.planId);
    if (!plan) return reply.code(400).send({ error: "Unknown plan" });

    // Plano pago só vale depois do pagamento: ativá-lo por aqui trocaria
    // tenants.plan_id sem passar pelo Stripe. A troca livre fica restrita a
    // planos gratuitos, como o ramo priceCents === 0 de /subscription/checkout.
    if (plan.priceCents > 0) {
      return reply.code(403).send({
        error: "paid_plan_requires_checkout",
        message: "Planos pagos só podem ser ativados via /subscription/checkout (Stripe).",
      });
    }

    await pool.query("UPDATE tenants SET plan_id = $1 WHERE id = $2", [plan.id, req.tenantId]);
    return { plan };
  });

  // Real Stripe Checkout for paid plans (Fase 4 — see CLAUDE.md / billing
  // plan). Downgrading/selecting the Free plan needs no payment, so it
  // skips Stripe entirely and switches the tenant directly, same as the
  // old PUT /subscription/plan behavior.
  app.post<{ Body: { planId: string } }>("/subscription/checkout", async (req, reply) => {
    const plan = await findPlan(req.body.planId);
    if (!plan) return reply.code(400).send({ error: "Unknown plan" });

    if (plan.priceCents === 0) {
      await pool.query("UPDATE tenants SET plan_id = $1 WHERE id = $2", [plan.id, req.tenantId]);
      return { plan, checkoutUrl: null };
    }

    const tenant = await getTenant(req.tenantId);
    const { rows: userRows } = await pool.query<{ email: string }>(
      "SELECT email FROM users WHERE id = $1",
      [req.userId],
    );

    try {
      const stripe = getStripe();

      let stripeCustomerId = tenant.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: userRows[0]?.email,
          metadata: { tenantId: tenant.id },
        });
        stripeCustomerId = customer.id;
        await pool.query("UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2", [
          stripeCustomerId,
          tenant.id,
        ]);
      }

      const priceId = await getOrCreateStripePrice(plan);
      const origin = requestOrigin(req);

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/subscription?checkout=success`,
        cancel_url: `${origin}/subscription?checkout=cancelled`,
        metadata: { tenantId: tenant.id, planId: plan.id },
        subscription_data: { metadata: { tenantId: tenant.id, planId: plan.id } },
      });

      return { checkoutUrl: session.url };
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        return reply.code(400).send({ error: "stripe_not_configured", message: err.message });
      }
      throw err;
    }
  });

  // One-off credit purchase (Fase 5 — see CLAUDE.md / billing plan).
  // Different Stripe mode from /subscription/checkout above on purpose: a
  // credit package is a single payment, not a recurring subscription. The
  // fixed-quantity package per credit_type (Seção 5 of the plan) means the
  // request only needs to say which type — not how many, that's the
  // package's own `quantity`. Reuses the tenant's existing Stripe Customer
  // (or creates one, same as the subscription checkout) so both flows
  // share billing history.
  app.post<{ Body: { creditType: string } }>("/subscription/credits/checkout", async (req, reply) => {
    const { creditType } = req.body;
    if (creditType !== "video" && creditType !== "script" && creditType !== "avatar") {
      return reply.code(400).send({ error: "invalid_credit_type" });
    }

    const pkg = await findActiveCreditPackage(creditType);
    if (!pkg) return reply.code(400).send({ error: "no_package_available" });

    const tenant = await getTenant(req.tenantId);
    const { rows: userRows } = await pool.query<{ email: string }>(
      "SELECT email FROM users WHERE id = $1",
      [req.userId],
    );

    try {
      const stripe = getStripe();

      let stripeCustomerId = tenant.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: userRows[0]?.email,
          metadata: { tenantId: tenant.id },
        });
        stripeCustomerId = customer.id;
        await pool.query("UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2", [
          stripeCustomerId,
          tenant.id,
        ]);
      }

      const priceId = await getOrCreateCreditPackagePrice(pkg);
      const origin = requestOrigin(req);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/subscription?checkout=credits_success`,
        cancel_url: `${origin}/subscription?checkout=credits_cancelled`,
        metadata: {
          type: "credit_purchase",
          tenantId: tenant.id,
          creditType: pkg.creditType,
          quantity: String(pkg.quantity),
          packageId: pkg.id,
        },
      });

      return { checkoutUrl: session.url };
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        return reply.code(400).send({ error: "stripe_not_configured", message: err.message });
      }
      throw err;
    }
  });

  app.put<{
    Body: { companyName: string; whatsapp?: string; address?: string; city?: string; state?: string };
  }>("/subscription/profile", async (req, reply) => {
    const companyName = req.body.companyName?.trim();
    if (!companyName) return reply.code(400).send({ error: "Company name is required" });

    // WhatsApp deixou de ser obrigatório (15/08/2026) — address/city/state já
    // eram opcionais, e whatsapp passa a seguir o mesmo padrão: aceito se vier,
    // sem 400 na ausência. Mesmo padrão `?.trim() || null` dos três campos
    // abaixo — string vazia depois do trim também vira null, não fica salva
    // como "".
    const whatsapp = req.body.whatsapp?.trim() || null;
    const address = req.body.address?.trim() || null;
    const city = req.body.city?.trim() || null;
    const state = req.body.state?.trim() || null;

    const tenant = await getTenant(req.tenantId);

    // profile_completed_at (migration 057) é INDEPENDENTE de slug_locked —
    // uma trava o slug, a outra marca "já viu o formulário". COALESCE no
    // UPDATE: o primeiro save define o valor, saves seguintes não o tocam
    // (a coluna já tem NOW() de antes, então COALESCE mantém o valor velho).
    //
    // O slug só é recalculado UMA VEZ, no primeiro save — depois disso
    // `slug_locked` trava o valor para sempre, mesmo que o nome mude de
    // novo em edições seguintes (migration 054). Mesma função de geração
    // que o signup usa (services/slug.ts), reaproveitada, não duplicada:
    // mesma checagem de colisão, mesmos slugs reservados, mesmo sufixo
    // numérico.
    if (!tenant.slug_locked) {
      const slug = await generateUniqueSlugFromName(companyName, tenant.id);
      await pool.query(
        `UPDATE tenants SET name = $1, whatsapp = $2, address = $3, city = $4, state = $5, slug = $6,
           slug_locked = true, profile_completed_at = COALESCE(profile_completed_at, NOW())
         WHERE id = $7`,
        [companyName, whatsapp, address, city, state, slug, tenant.id],
      );
      return { companyName, whatsapp, address, city, state, slug, host: `${BASE_DOMAIN}/${slug}` };
    }

    // Já travado: nome e os demais campos atualizam normalmente; o slug
    // (e qualquer tentativa de mudá-lo) é ignorado — não existe campo de
    // slug no corpo desta rota para começo de conversa, então "ignorar" é
    // simplesmente não tocar a coluna.
    await pool.query(
      `UPDATE tenants SET name = $1, whatsapp = $2, address = $3, city = $4, state = $5,
         profile_completed_at = COALESCE(profile_completed_at, NOW())
       WHERE id = $6`,
      [companyName, whatsapp, address, city, state, tenant.id],
    );
    return { companyName, whatsapp, address, city, state, slug: tenant.slug, host: `${BASE_DOMAIN}/${tenant.slug}` };
  });

  // Stub only — no real payment processing (Phase 6). Stores a masked
  // representation so the UI can show "a card is on file" without ever
  // persisting real card data.
  app.put<{ Body: { cardNumber: string } }>("/subscription/payment-method", async (req, reply) => {
    if (!req.body.cardNumber?.trim()) {
      return reply.code(400).send({ error: "Card number is required" });
    }
    const masked = maskCardNumber(req.body.cardNumber);
    await pool.query("UPDATE tenants SET payment_method_masked = $1 WHERE id = $2", [
      masked,
      req.tenantId,
    ]);
    return { paymentMethodMasked: masked };
  });

  // No invoices table yet — nothing generates real invoices before Phase 6
  // (Stripe) exists, so this stays a stub empty list rather than speculative
  // schema.
  app.get("/subscription/invoices", async () => {
    return [];
  });
}
