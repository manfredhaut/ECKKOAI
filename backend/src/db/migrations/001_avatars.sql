CREATE TABLE avatars (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  provider            text,
  photo_urls          jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_video_url text,
  voice_id            text,
  provider_avatar_id  text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
