-- Lets the admin panel distinguish placeholder/estimated rates (seeded in
-- 022_provider_cost_rates.sql, NOT verified against real vendor pricing)
-- from rates an admin has actually confirmed. Every dashboard showing cost
-- must treat unverified rates as an ESTIMATE, never as "real cost", until
-- this flips to true (see CLAUDE.md / billing plan, Fase 1 review).
ALTER TABLE provider_cost_rates ADD COLUMN verified boolean NOT NULL DEFAULT false;
