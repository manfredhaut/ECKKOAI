-- status gates generation (not login/read — see CLAUDE.md / billing plan,
-- Fase 3): a suspended tenant can still view its dashboard/subscription to
-- resolve a payment issue, just can't create new videos/avatars/scripts.
ALTER TABLE tenants ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended'));

-- Set once the tenant's first real Stripe Checkout happens (Fase 4) — null
-- until then, including for tenants that never leave the Free plan.
ALTER TABLE tenants ADD COLUMN stripe_customer_id text;

-- Cache of the sum of credit_ledger.delta for this tenant (Fase 5) — the
-- ledger is the source of truth, this column exists only so a balance
-- check doesn't require summing the ledger on every video-creation request.
ALTER TABLE tenants ADD COLUMN credit_balance integer NOT NULL DEFAULT 0;
