ALTER TABLE tenants ADD COLUMN plan_id text NOT NULL DEFAULT 'free';
ALTER TABLE tenants ADD COLUMN payment_method_masked text;
