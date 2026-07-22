-- Fase 5 (see CLAUDE.md / billing plan): monthly plan-based credit grants
-- are a distinct financial event from purchased credits (automatic
-- subscription allocation vs. actual revenue) — split into their own
-- `reason` value so future reporting can tell them apart. The monthly
-- grant job itself is not implemented yet; this only makes the schema
-- ready for it (see services/billing/creditGate.ts for the consumption
-- side, already using 'consumption').
ALTER TABLE credit_ledger DROP CONSTRAINT credit_ledger_reason_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_reason_check
  CHECK (reason IN ('purchase', 'consumption', 'manual_admin_adjustment', 'grant'));
