-- Stripe webhook events write to audit_log too (see CLAUDE.md / billing
-- plan, Fase 4) but have no admin_users actor — actor_admin_user_id must
-- become nullable to allow that. Convention: when actor is null, `action`
-- is prefixed "stripe." so a null actor always means "system", never a
-- forgotten/missing value (see services/auditLog.ts).
ALTER TABLE audit_log ALTER COLUMN actor_admin_user_id DROP NOT NULL;
