-- Sinal de "perfil completo" separado de slug_locked (15/08/2026).
--
-- slug_locked (migration 054) responde só "o slug já foi calculado uma vez?"
-- — e nasceu true para todo tenant PRÉ-existente naquela migration, porque
-- travar o slug de quem já tinha link divulgado era o objetivo. Reusar essa
-- mesma coluna para decidir se o card "Complete seu perfil" aparece fazia
-- todo tenant anterior a 054 nunca ver o formulário de WhatsApp/endereço —
-- efeito colateral de uma coluna carregando duas perguntas diferentes.
--
-- Esta coluna responde só "a pessoa já passou por este formulário?" — e fica
-- NULL para TODO mundo, tenant novo ou antigo, sem backfill nenhum a partir
-- de slug_locked. É intencional: o objetivo é coletar WhatsApp/endereço de
-- todo tenant que ainda não preencheu, não só de quem se cadastra daqui pra
-- frente.
ALTER TABLE tenants ADD COLUMN profile_completed_at timestamptz;

COMMENT ON COLUMN tenants.profile_completed_at IS
  'Quando PUT /subscription/profile foi salvo pela primeira vez. NULL = perfil incompleto, card ainda aparece. Setado uma vez (COALESCE no UPDATE) e nunca sobrescrito por saves seguintes. Independente de slug_locked, que só trava o SLUG.';
