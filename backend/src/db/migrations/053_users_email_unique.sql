-- E-mail passa a ser único GLOBALMENTE em `users`, não só por tenant
-- (migration 004: UNIQUE (tenant_id, email)).
--
-- Motivo: subdomínio por tenant foi CANCELADO como decisão de produto
-- (14/08/2026, domínio único). `login.ts` já resolve por e-mail SEM escopo
-- de tenant quando a requisição não chega por subdomínio (ramo
-- `!req.hostTenantId`) — e dois tenants com o mesmo e-mail tornam esse
-- lookup ambíguo (o primeiro que a query encontrar vence, em silêncio).
--
-- O sintoma MEDIDO que motivou isto: o redirect de signup para
-- `${slug}.${BASE_DOMAIN}` (bug corrigido na mesma rodada — ver App.tsx,
-- LoginPage.tsx, SignupPage.tsx) levava a um domínio sem DNS
-- (DNS_PROBE_FINISHED_NXDOMAIN). O signup no backend TINHA sucesso (tenant +
-- usuário commitados), mas a pessoa via um erro de rede e tentava de novo
-- com o mesmo e-mail — e nada no schema impedia isso. Cada tentativa gerava
-- um tenant NOVO (generateUniqueSlug incrementa o sufixo): manfredhaut-5,
-- manfredhaut-6, manfred-3, todos órfãos.
--
-- ABORTA em vez de corrigir sozinha: o banco de produção já foi limpo (0
-- duplicatas MEDIDAS em 14/08/2026 antes desta migration), mas este arquivo
-- roda em qualquer ambiente, incluindo um que ninguém auditou antes. Decidir
-- qual das duas contas com o mesmo e-mail é "a real" é decisão de produto —
-- este arquivo não toma essa decisão, só recusa aplicar a constraint até
-- alguém tomar.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT email FROM users GROUP BY email HAVING count(*) > 1
  ) duplicated;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'migration 053: % e-mail(s) duplicado(s) entre tenants em users — UNIQUE (email) não aplicada. Resolva as duplicatas manualmente (SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1) e rode a migration de novo. Esta migration NUNCA apaga ou altera linha nenhuma sozinha.', dup_count;
  END IF;
END $$;

-- DROP antes de ADD: `ADD CONSTRAINT` não é idempotente, e reaplicar
-- falharia com MergeWithExistingConstraint (mesmo cuidado da migration 052).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

COMMENT ON CONSTRAINT users_email_unique ON users IS
  'E-mail único globalmente desde a migration 053 (domínio único cancelou subdomínio por tenant — ver backend/src/routes/auth.ts, POST /auth/signup). A constraint antiga UNIQUE (tenant_id, email), da migration 004, continua no banco: ela é redundante agora (unicidade global implica unicidade por tenant), mas removê-la não muda comportamento nenhum, então não foi tocada.';
