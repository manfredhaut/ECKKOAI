CREATE TABLE api_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL UNIQUE
                  CHECK (provider IN ('avatar', 'voice', 'script')),
  encrypted_key text,
  connected     boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
