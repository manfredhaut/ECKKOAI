-- Immutable ledger, one row per billable provider call (see CLAUDE.md /
-- billing plan, Fase 1). rate_snapshot_cents_per_unit + estimated_cost_cents
-- are copied from provider_cost_rates AT THE TIME of the call, not looked
-- up live later — so editing a rate afterward never rewrites history.
CREATE TABLE provider_usage (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  video_id                      uuid REFERENCES videos(id) ON DELETE SET NULL,
  provider                      text NOT NULL CHECK (provider IN ('avatar', 'voice', 'script')),
  vendor                        text NOT NULL,
  unit_type                     text NOT NULL CHECK (unit_type IN ('seconds', 'characters', 'tokens_in', 'tokens_out')),
  unit_count                    numeric NOT NULL,
  rate_snapshot_cents_per_unit  numeric NOT NULL,
  estimated_cost_cents          numeric NOT NULL,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_usage_tenant_id_idx ON provider_usage (tenant_id);
CREATE INDEX provider_usage_created_at_idx ON provider_usage (created_at DESC);
