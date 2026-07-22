-- Every write made through the admin panel gets logged here. Created before
-- any admin write route exists, so there's no window of un-audited changes
-- (see CLAUDE.md / admin panel plan). "before"/"after" are metadata only —
-- never the plaintext or encrypted value of a secret (see services/auditLog.ts
-- call sites for what's actually recorded).
CREATE TABLE audit_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_admin_user_id uuid NOT NULL REFERENCES admin_users(id),
  action              text NOT NULL,
  before              jsonb,
  after               jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_tenant_id_idx ON audit_log (tenant_id);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
