-- Plans move from the hardcoded array in plans.ts to a real table so the
-- admin panel can edit price/limits/features at runtime (see CLAUDE.md /
-- billing plan). stripe_price_id is nullable because it's only set once a
-- real Stripe Price is created for that plan (Fase 4) — plans can exist
-- and be used for the free tier without ever needing one.
CREATE TABLE plans (
  id                    text PRIMARY KEY,
  name                  text NOT NULL,
  price_cents           integer NOT NULL,
  video_limit_per_month integer NOT NULL,
  features              jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_price_id       text,
  active                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Seed with the exact 3 plans that were hardcoded in plans.ts, so behavior
-- doesn't change the moment this migration runs.
INSERT INTO plans (id, name, price_cents, video_limit_per_month, features) VALUES
  ('free', 'Free', 0, 5, '["5 vídeos por mês", "1 avatar salvo", "Suporte por comunidade"]'::jsonb),
  ('pro', 'Pro', 4900, 30, '["30 vídeos por mês", "Avatares ilimitados", "Suporte por email"]'::jsonb),
  ('business', 'Business', 14900, 100, '["100 vídeos por mês", "Avatares ilimitados", "Suporte prioritário"]'::jsonb);

-- tenants.plan_id already stores these same string ids (default 'free') —
-- add the FK now that a real table exists to catch typos/orphaned plan ids.
ALTER TABLE tenants ADD CONSTRAINT tenants_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id);
