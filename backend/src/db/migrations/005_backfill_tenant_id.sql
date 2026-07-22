INSERT INTO tenants (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant');

ALTER TABLE avatars ADD COLUMN tenant_id uuid REFERENCES tenants(id);
UPDATE avatars SET tenant_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE avatars ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE videos ADD COLUMN tenant_id uuid REFERENCES tenants(id);
UPDATE videos SET tenant_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE videos ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE api_credentials ADD COLUMN tenant_id uuid REFERENCES tenants(id);
UPDATE api_credentials SET tenant_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE api_credentials ALTER COLUMN tenant_id SET NOT NULL;
