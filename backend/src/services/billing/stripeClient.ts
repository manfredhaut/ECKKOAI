import Stripe from "stripe";
import { config } from "../../config.js";
import { updatePlan } from "../../plans.js";
import type { Plan } from "../../plans.js";
import { setCreditPackageStripePrice } from "./creditPackages.js";
import type { CreditPackage } from "./creditPackages.js";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured (STRIPE_SECRET_KEY missing).");
    this.name = "StripeNotConfiguredError";
  }
}

// Lazy singleton — constructing Stripe at module-import time would throw
// before config is even checked at a route level, crashing the whole app
// boot over a feature (billing) that's optional to have configured.
let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!config.stripeSecretKey) throw new StripeNotConfiguredError();
  if (!stripeInstance) stripeInstance = new Stripe(config.stripeSecretKey);
  return stripeInstance;
}

// Plans are seeded without a Stripe Price (see migration 020) — the first
// checkout attempt for a plan creates the real Product/Price in Stripe and
// backfills plans.stripe_price_id, so it's reused (not recreated) after that.
export async function getOrCreateStripePrice(plan: Plan): Promise<string> {
  if (plan.stripePriceId) return plan.stripePriceId;

  const stripe = getStripe();
  const product = await stripe.products.create({
    name: `eckko.ai — ${plan.name}`,
    metadata: { planId: plan.id },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "brl",
    unit_amount: plan.priceCents,
    recurring: { interval: "month" },
  });

  await updatePlan(plan.id, { stripePriceId: price.id });
  return price.id;
}

// Same lazy-create-and-cache pattern as getOrCreateStripePrice above, for
// one-off credit packages instead of recurring plans — no `recurring`
// field, since these are used with mode: 'payment', not 'subscription'.
export async function getOrCreateCreditPackagePrice(pkg: CreditPackage): Promise<string> {
  if (pkg.stripePriceId) return pkg.stripePriceId;

  const stripe = getStripe();
  const product = await stripe.products.create({
    name: `eckko.ai — Créditos de ${pkg.creditType} (${pkg.quantity})`,
    metadata: { creditPackageId: pkg.id, creditType: pkg.creditType },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "brl",
    unit_amount: pkg.priceCents,
  });

  await setCreditPackageStripePrice(pkg.id, price.id);
  return price.id;
}
