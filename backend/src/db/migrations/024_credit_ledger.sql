-- Immutable ledger (see CLAUDE.md / billing plan, Fase 5). tenants.credit_balance
-- is a cache of sum(delta) for the tenant — every insert here must update
-- that cache in the same transaction (see services/billing/credits.ts,
-- added when Fase 5 is implemented).
CREATE TABLE credit_ledger (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delta                     integer NOT NULL,
  reason                    text NOT NULL CHECK (reason IN ('purchase', 'consumption', 'manual_admin_adjustment')),
  related_video_id          uuid REFERENCES videos(id) ON DELETE SET NULL,
  stripe_payment_intent_id  text,
  actor_admin_user_id       uuid REFERENCES admin_users(id),
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credit_ledger_tenant_id_idx ON credit_ledger (tenant_id);
