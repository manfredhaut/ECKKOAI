CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  file_url      text NOT NULL,
  mime_type     text NOT NULL,
  status        text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'indexed', 'error')),
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- General client reference material (catalogs, brand photography, style
-- references) for human lookup only. Deliberately not embedded/indexed, and
-- deliberately not linked to avatars/videos — separate from the scenario/outfit
-- upload fields in the avatar setup and create-video flows.
CREATE TABLE reference_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename   text NOT NULL,
  file_url   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
