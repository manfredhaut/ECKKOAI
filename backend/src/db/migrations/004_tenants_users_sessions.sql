CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- Generic session store backing @fastify/session: "sess" holds the whole
-- serialized session object (including its cookie metadata), matching how
-- session stores conventionally work (e.g. connect-pg-simple).
CREATE TABLE sessions (
  id         text PRIMARY KEY,
  sess       jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
