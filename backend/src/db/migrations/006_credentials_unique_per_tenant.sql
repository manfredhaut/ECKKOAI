ALTER TABLE api_credentials DROP CONSTRAINT api_credentials_provider_key;
ALTER TABLE api_credentials ADD CONSTRAINT api_credentials_tenant_provider_key UNIQUE (tenant_id, provider);
