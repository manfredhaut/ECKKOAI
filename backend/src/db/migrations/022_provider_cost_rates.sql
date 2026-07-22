-- Admin-editable "cost per unit" table (see CLAUDE.md / billing plan, Fase
-- 1). No vendor here exposes a reliable per-call cost in its API response
-- today (see avatarProvider.ts/voiceProvider.ts/providerRegistry.ts) — this
-- is a manually maintained rate card, not a live price feed. numeric (not
-- integer cents) because per-character/per-token rates are fractions of a
-- cent per unit.
CREATE TABLE provider_cost_rates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                text NOT NULL CHECK (provider IN ('avatar', 'voice', 'script')),
  vendor                  text NOT NULL,
  unit_type               text NOT NULL CHECK (unit_type IN ('seconds', 'characters', 'tokens_in', 'tokens_out')),
  cost_per_unit_cents     numeric NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by_admin_user_id uuid REFERENCES admin_users(id),
  UNIQUE (provider, vendor, unit_type)
);

-- Seed values are rough public-pricing placeholders, NOT verified against
-- current vendor contracts — flagged here deliberately so nobody mistakes
-- them for authoritative numbers. An admin must confirm/correct these via
-- the admin panel (Fase 1) before the cost figures are trusted for real
-- business decisions.
INSERT INTO provider_cost_rates (provider, vendor, unit_type, cost_per_unit_cents) VALUES
  ('avatar', 'heygen', 'seconds', 3.0),
  ('avatar', 'did', 'seconds', 2.5),
  ('voice', 'elevenlabs', 'characters', 0.018),
  ('script', 'anthropic', 'tokens_in', 0.03),
  ('script', 'anthropic', 'tokens_out', 0.15),
  ('script', 'gemini', 'tokens_in', 0.0075),
  ('script', 'gemini', 'tokens_out', 0.03),
  ('script', 'openai', 'tokens_in', 0.015),
  ('script', 'openai', 'tokens_out', 0.06);
