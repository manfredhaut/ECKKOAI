CREATE TABLE videos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id         uuid REFERENCES avatars(id) ON DELETE SET NULL,
  script            text NOT NULL,
  scenario          text,
  outfit            text,
  duration_seconds  integer NOT NULL,
  status            text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'processing', 'ready', 'error')),
  output_url        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
