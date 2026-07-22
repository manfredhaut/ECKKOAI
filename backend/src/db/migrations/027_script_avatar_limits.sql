-- Fase 5 prep (see CLAUDE.md / billing plan): video/script/avatar credits
-- are independent pools, so each needs its own monthly plan limit — only
-- video had one until now. Values below apply immediately to every tenant
-- on each plan, including existing subscribers — confirmed business
-- decision, not an oversight (video's limit is deliberately lower than
-- the 5/30/100 it replaces).
ALTER TABLE plans ADD COLUMN script_limit_per_month integer;
ALTER TABLE plans ADD COLUMN avatar_limit_per_month integer;

UPDATE plans SET video_limit_per_month = 2,  script_limit_per_month = 10,  avatar_limit_per_month = 1  WHERE id = 'free';
UPDATE plans SET video_limit_per_month = 20, script_limit_per_month = 60,  avatar_limit_per_month = 5  WHERE id = 'pro';
UPDATE plans SET video_limit_per_month = 50, script_limit_per_month = 200, avatar_limit_per_month = 20 WHERE id = 'business';

ALTER TABLE plans ALTER COLUMN script_limit_per_month SET NOT NULL;
ALTER TABLE plans ALTER COLUMN avatar_limit_per_month SET NOT NULL;

-- Neither script generation nor avatar training persists one row per
-- attempt anywhere else in the schema (unlike video, which already has
-- `videos` to count from) — these two tables exist ONLY to make monthly
-- enforcement countable, the same role `videos` already plays. Not a
-- content store: no script text, no file reference. A row is inserted for
-- every attempt (including ones that go on to fail against the vendor),
-- mirroring routes/videos.ts's existing semantics — see CLAUDE.md / billing
-- plan, Fase 5.
CREATE TABLE script_generations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX script_generations_tenant_id_idx ON script_generations (tenant_id);

CREATE TABLE avatar_trainings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  avatar_id  uuid REFERENCES avatars(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX avatar_trainings_tenant_id_idx ON avatar_trainings (tenant_id);
