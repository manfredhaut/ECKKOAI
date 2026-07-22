ALTER TABLE tenants ADD COLUMN slug text;

-- Backfill existing tenants (created via the admin route before public
-- signup existed). Appends a fragment of the tenant's own id to guarantee
-- uniqueness without needing the application-level collision retry loop
-- used for new signups.
UPDATE tenants
SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'))
           || '-' || substr(id::text, 1, 6)
WHERE slug IS NULL;

ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL;
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_key UNIQUE (slug);
