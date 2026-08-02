import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { getStripe } from "../services/billing/stripeClient.js";
import { grantPlanChangeTopUp } from "../services/billing/monthlyGrant.js";
import { grantPurchasedCredit } from "../services/billing/creditGate.js";
import { recordAuditLog } from "../services/auditLog.js";
import { logEvent } from "../services/log/safeLog.js";

// Subscription statuses that mean "payment isn't going through" — see
// requireActiveTenant.ts / CLAUDE.md billing plan, Fase 3: suspension blocks
// generation only, not login/read, so the tenant can come back here to fix it.
const PAST_DUE_STATUSES: Stripe.Subscription.Status[] = ["past_due", "unpaid", "incomplete_expired"];

async function tenantExists(tenantId: string): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM tenants WHERE id = $1", [tenantId]);
  return rows.length > 0;
}

async function cheapestPlanId(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM plans ORDER BY price_cents ASC LIMIT 1");
  return rows[0].id;
}

async function applySubscriptionStatus(subscription: Stripe.Subscription): Promise<void> {
  const tenantId = subscription.metadata?.tenantId;
  const planId = subscription.metadata?.planId;
  if (!tenantId || !(await tenantExists(tenantId))) return;

  const before = await pool.query("SELECT plan_id, status FROM tenants WHERE id = $1", [tenantId]);

  if (subscription.status === "active" || subscription.status === "trialing") {
    await pool.query("UPDATE tenants SET plan_id = COALESCE($1, plan_id), status = 'active' WHERE id = $2", [
      planId ?? null,
      tenantId,
    ]);
  } else if (PAST_DUE_STATUSES.includes(subscription.status)) {
    await pool.query("UPDATE tenants SET status = 'suspended' WHERE id = $1", [tenantId]);
  } else if (subscription.status === "canceled") {
    await pool.query("UPDATE tenants SET plan_id = $1, status = 'active' WHERE id = $2", [
      await cheapestPlanId(),
      tenantId,
    ]);
  }

  await recordAuditLog({
    tenantId,
    actorAdminUserId: null,
    action: `stripe.subscription.${subscription.status}`,
    before: before.rows[0] ?? null,
    after: { stripeSubscriptionId: subscription.id, status: subscription.status, planId },
  });
}

// checkout.session.completed fires for both flows below (subscription
// checkout, Fase 4, and one-off credit purchase, Fase 5) — metadata.type
// is how they're told apart (see routes/subscription.ts, both checkout
// endpoints). Handled separately from applySubscriptionStatus/the
// subscription branch further down: a credit purchase never touches
// tenants.plan_id/status, only tenant_credits/credit_ledger.
async function handleCreditPurchaseCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const tenantId = session.metadata?.tenantId;
  const creditType = session.metadata?.creditType;
  const quantity = Number(session.metadata?.quantity);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

  if (!tenantId || !(await tenantExists(tenantId))) return;
  if (creditType !== "video" && creditType !== "script" && creditType !== "avatar") return;
  if (!Number.isFinite(quantity) || quantity <= 0) return;
  if (!paymentIntentId) {
    logEvent("error", "stripe_checkout_without_payment_intent", { sessionId: session.id });
    return;
  }

  const result = await grantPurchasedCredit({
    tenantId,
    creditType,
    quantity,
    stripePaymentIntentId: paymentIntentId,
  });

  await recordAuditLog({
    tenantId,
    actorAdminUserId: null,
    action: "stripe.credit_purchase_completed",
    before: null,
    after: { creditType, quantity, balance: result.balance, alreadyGranted: result.alreadyGranted },
  });
}

// Raw body required for Stripe signature verification — Fastify's default
// JSON parser would already have consumed/parsed the stream by the time a
// handler runs. Overriding addContentTypeParser here only affects routes
// registered within this same plugin's encapsulation (see app.ts — this is
// registered as its own async plugin, not merged into the global app).
export async function stripeWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/subscription/stripe/webhook", async (req, reply) => {
    if (!config.stripeWebhookSecret) {
      return reply.code(400).send({ error: "stripe_not_configured" });
    }

    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      return reply.code(400).send({ error: "Missing stripe-signature header" });
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body as Buffer, signature, config.stripeWebhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid signature";
      return reply.code(400).send({ error: "invalid_signature", message });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.metadata?.type === "credit_purchase") {
          await handleCreditPurchaseCompleted(session);
          break;
        }

        const tenantId = session.metadata?.tenantId;
        const planId = session.metadata?.planId;
        if (tenantId && planId && (await tenantExists(tenantId))) {
          const before = await pool.query("SELECT plan_id, status FROM tenants WHERE id = $1", [tenantId]);
          await pool.query(
            "UPDATE tenants SET plan_id = $1, status = 'active', stripe_customer_id = COALESCE(stripe_customer_id, $2) WHERE id = $3",
            [planId, typeof session.customer === "string" ? session.customer : null, tenantId],
          );
          await recordAuditLog({
            tenantId,
            actorAdminUserId: null,
            action: "stripe.checkout_completed",
            before: before.rows[0] ?? null,
            after: { planId, stripeCheckoutSessionId: session.id },
          });

          // Top up tenant_credits to the new plan's limits immediately —
          // otherwise a tenant who upgrades mid-month stays stuck on their
          // old (lower) balance until the next monthly sweep, despite
          // having just paid (see CLAUDE.md / billing plan, Fase 5). Never
          // let a failure here affect the 200 response below: the payment
          // and plan change already committed above, which matters more,
          // and the next 24h sweep will pick up any gap regardless.
          try {
            const topUp = await grantPlanChangeTopUp(tenantId);
            await recordAuditLog({
              tenantId,
              actorAdminUserId: null,
              action: "stripe.checkout_completed.credit_top_up",
              before: null,
              after: topUp,
            });
          } catch (err) {
            logEvent("error", "stripe_topup_failed", { tenantId, detail: err });
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created":
        await applySubscriptionStatus(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenantId;
        if (tenantId && (await tenantExists(tenantId))) {
          const before = await pool.query("SELECT plan_id, status FROM tenants WHERE id = $1", [tenantId]);
          const freePlanId = await cheapestPlanId();
          await pool.query("UPDATE tenants SET plan_id = $1, status = 'active' WHERE id = $2", [
            freePlanId,
            tenantId,
          ]);
          await recordAuditLog({
            tenantId,
            actorAdminUserId: null,
            action: "stripe.subscription_canceled",
            before: before.rows[0] ?? null,
            after: { planId: freePlanId },
          });
        }
        break;
      }
      default:
        break;
    }

    return reply.code(200).send({ received: true });
  });
}
