-- Fase 5 (see CLAUDE.md / billing plan): one-off credit packages, one per
-- credit_type to start (fixed quantity, no variable amount — decided in
-- the Fase 5 plan, Seção 5). stripe_price_id mirrors plans.stripe_price_id:
-- seeded null, backfilled lazily on first checkout (see
-- services/billing/stripeClient.ts getOrCreateCreditPackagePrice), so it's
-- reused rather than recreated on Stripe after that.
CREATE TABLE credit_packages (
  id               text PRIMARY KEY,
  credit_type      text NOT NULL CHECK (credit_type IN ('video', 'script', 'avatar')),
  quantity         integer NOT NULL CHECK (quantity > 0),
  price_cents      integer NOT NULL CHECK (price_cents > 0),
  stripe_price_id  text,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Pricing confirmed by the user for this rollout (2026-07-22): 10 credits
-- per package across all 3 types; price escalates in the same cost order
-- already used for the monthly plan limits (script cheapest, avatar
-- priciest — avatar involves voice synthesis + rendering, script is just
-- text generation).
INSERT INTO credit_packages (id, credit_type, quantity, price_cents) VALUES
  ('script_10', 'script', 10, 1990),
  ('video_10',  'video',  10, 3990),
  ('avatar_10', 'avatar', 10, 5990);
