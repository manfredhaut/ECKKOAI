-- Terceiro estado para `tenants.status`: 'pending'. Tenant novo (signup)
-- nasce pendente; painel admin aprova (PUT /admin/tenants/:id/status já
-- aceita 'active' — aprovar É essa mesma chamada). Usuário de tenant
-- pendente autentica (senha confere) mas NÃO recebe sessão — ver
-- routes/login.ts e routes/auth.ts.
--
-- ADITIVA: só amplia o CHECK. Nenhuma linha existente muda de status — os
-- tenants de hoje são 'active' ou 'suspended', migration 021, e continuam.
-- DROP antes de ADD, mesmo cuidado de sempre (ADD CONSTRAINT não é
-- idempotente e reaplicar quebraria com MergeWithExistingConstraint).
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'pending'));

COMMENT ON COLUMN tenants.status IS
  'active | suspended | pending. pending = signup feito, aguardando aprovação no painel admin (login não gera sessão enquanto pendente). Lista ampliada pela migration 055.';
