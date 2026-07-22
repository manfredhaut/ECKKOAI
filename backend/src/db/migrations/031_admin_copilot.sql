-- Same shape as copilot_conversations/copilot_messages (migration 009), but
-- deliberately separate tables, not tenant_id going nullable on the
-- existing ones — same reasoning as admin_users being its own table
-- instead of a role on users (see migration 018): admin identity and
-- tenant identity never share a table, so a bug in one query can't leak
-- one into the other's rows.
CREATE TABLE admin_copilot_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  title         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_copilot_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES admin_copilot_conversations(id) ON DELETE CASCADE,
  admin_user_id   uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
