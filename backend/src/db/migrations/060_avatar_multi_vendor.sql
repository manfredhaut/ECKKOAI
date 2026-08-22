-- Multi-vendor de avatar por tenant, mais a coluna que resolve a janela de
-- não-determinismo para quem consulta getCredential sem saber de tier.
--
-- Decisão de produto: um tenant vai poder ter mais de uma credencial de
-- avatar configurada ao mesmo tempo (ex.: HeyGen + fal.ai), e o tier_video
-- escolhido no wizard passa a decidir qual vendor usar por vídeo. Hoje
-- `UNIQUE (tenant_id, provider)` permite só UMA linha de qualquer
-- categoria por tenant — é essa constraint que faz "Simples" (que deveria
-- ir para HeyGen) cair no mesmo vendor do "Normal" (fal) num tenant
-- fal-only: não existe onde guardar a segunda credencial.

-- `is_default` — a credencial que os call sites NÃO-tier-aware de
-- getCredential continuam enxergando, exatamente como hoje. DEFAULT true
-- preenche as linhas existentes sem UPDATE separado — é o próprio ADD
-- COLUMN que faz o backfill. Toda linha NOVA de avatar que a Fase B
-- inserir nasce com is_default=false explícito no INSERT — nunca desloca
-- a linha default existente.
ALTER TABLE api_credentials ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT true;

-- --- multi-vendor de avatar --------------------------------------------

-- DROP antes de recriar como dois índices parciais: `ADD CONSTRAINT` não é
-- idempotente, e reaplicar falharia com MergeWithExistingConstraint.
ALTER TABLE api_credentials DROP CONSTRAINT IF EXISTS api_credentials_tenant_provider_key;

-- voice e script: a mesma garantia de sempre, agora como índice parcial —
-- a exclusão de 'avatar' é o que abre espaço para o índice seguinte.
CREATE UNIQUE INDEX IF NOT EXISTS api_credentials_tenant_provider_key
  ON api_credentials (tenant_id, provider)
  WHERE provider <> 'avatar';

-- avatar: uma linha por (tenant, vendor) — é isto que permite heygen E
-- fal ao mesmo tempo. NULLS NOT DISTINCT (PG16) preserva a garantia ATUAL
-- para as linhas existentes com vendor NULL, MEDIDAS em 22/08 (23 de 34):
-- no máximo UMA linha de avatar sem vendor explícito por tenant,
-- exatamente como hoje — sem isto, duas linhas NULL passariam
-- despercebidas pela constraint (Postgres não trata NULL=NULL por
-- padrão em UNIQUE comum).
CREATE UNIQUE INDEX IF NOT EXISTS api_credentials_tenant_avatar_vendor_key
  ON api_credentials (tenant_id, provider, vendor) NULLS NOT DISTINCT
  WHERE provider = 'avatar';

-- No máximo UMA linha `is_default=true` por (tenant, avatar). Sem isto, o
-- `ORDER BY is_default DESC LIMIT 1` dos call sites não-tier-aware volta a
-- ser não-determinístico se algum código futuro esquecer de gravar
-- is_default=false na segunda linha. Índice parcial sobre a condição
-- booleana: só entra no índice a linha com is_default=true, e a UNIQUE em
-- (tenant_id, provider) barra a segunda — erro alto e imediato no INSERT,
-- não não-determinismo silencioso depois.
CREATE UNIQUE INDEX IF NOT EXISTS api_credentials_tenant_avatar_default_key
  ON api_credentials (tenant_id, provider)
  WHERE provider = 'avatar' AND is_default;

COMMENT ON TABLE api_credentials IS
  'voice e script: uma linha por tenant. avatar: multi-vendor — uma linha por (tenant, vendor), no máximo uma com is_default=true. is_default é a credencial que consumidores não-tier-aware de getCredential continuam vendo. Migration 060.';

COMMENT ON COLUMN api_credentials.is_default IS
  'A credencial "de sempre" para este (tenant, provider) — o que getCredential() genérico devolve, ORDER BY is_default DESC LIMIT 1. Para avatar, linhas novas (Fase B) nascem false; nunca desloca a existente.';
