CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type       text NOT NULL,
  message    text NOT NULL,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
