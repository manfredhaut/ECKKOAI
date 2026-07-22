ALTER TABLE api_credentials ADD COLUMN vendor text;
UPDATE api_credentials SET vendor = 'anthropic' WHERE provider = 'script';
UPDATE api_credentials SET vendor = 'stub' WHERE provider IN ('avatar', 'voice');
