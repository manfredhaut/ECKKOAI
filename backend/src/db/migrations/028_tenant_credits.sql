-- Fase 5 (see CLAUDE.md / billing plan): credits are 3 independent pools
-- (video/script/avatar), not one unified balance — tenants.credit_balance
-- (migration 021) was built before that decision and confirmed unused by
-- any real code (grep, no reads/writes anywhere) before being dropped here.
-- Both credit_ledger and every tenant's credit_balance were still 0/empty
-- at the time of this migration, so no backfill is needed.
ALTER TABLE tenants DROP COLUMN credit_balance;

CREATE TABLE tenant_credits (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_type text NOT NULL CHECK (credit_type IN ('video', 'script', 'avatar')),
  balance    integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, credit_type)
);

-- Every existing tenant gets an explicit zero-balance row for all 3 types,
-- so the debit gate (Fase 5, next step) always has a row to UPDATE instead
-- of having to special-case "no row yet" as a second meaning of "no
-- credit". New tenants still need this same seeding at signup time — not
-- done yet, flagged for whichever step wires up signup/credit granting.
INSERT INTO tenant_credits (tenant_id, credit_type, balance)
SELECT t.id, ct.credit_type, 0
FROM tenants t
CROSS JOIN (VALUES ('video'), ('script'), ('avatar')) AS ct(credit_type);

-- credit_type generalizes the ledger the same way tenant_credits does.
-- related_video_id (migration 024) stays as is for video; script/avatar get
-- their own typed FKs rather than a single polymorphic "related_entity_id"
-- column, so referential integrity is still enforced by Postgres itself,
-- not just convention.
ALTER TABLE credit_ledger ADD COLUMN credit_type text CHECK (credit_type IN ('video', 'script', 'avatar'));
ALTER TABLE credit_ledger ADD COLUMN related_script_generation_id uuid REFERENCES script_generations(id) ON DELETE SET NULL;
ALTER TABLE credit_ledger ADD COLUMN related_avatar_training_id uuid REFERENCES avatar_trainings(id) ON DELETE SET NULL;

-- credit_ledger was still empty at the time of this migration (confirmed),
-- so there's no historical row to backfill a credit_type onto.
ALTER TABLE credit_ledger ALTER COLUMN credit_type SET NOT NULL;
