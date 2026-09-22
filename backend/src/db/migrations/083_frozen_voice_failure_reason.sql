-- P2-1, VERSÃO FINAL, 22/09/2026 — o CHECK de `videos.failure_reason`
-- (migration 052) precisa aceitar o motivo novo, ou o UPDATE que registra o
-- bloqueio ("voz congelada apagada, sem áudio para reaproveitar") derrubaria
-- a própria escrita no meio de um caminho de falha.
--
-- A lista transcrita INTEIRA de novo, e não emendada — mesmo padrão da 052:
-- o CHECK é substituído por completo, nunca alterado campo a campo.
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_failure_reason_check;

-- NOT VALID — diferente da 052 (que validava a tabela inteira no ADD), de
-- propósito. `ADD CONSTRAINT ... CHECK` sem NOT VALID reprova a migration
-- inteira se QUALQUER linha já gravada tiver failure_reason fora da lista —
-- e uma migration que falha impede o backend de subir. A lista nova é um
-- SUPERSET estrito da 052 (12 valores antigos + frozen_voice_unavailable),
-- então nenhuma linha que já respeitava a 052 pode violar esta — mas "não
-- deveria" não é a mesma garantia que "não pode": um dump de outro ambiente,
-- uma constraint temporariamente desabilitada, ou uma migration fora de
-- ordem já bastam para quebrar essa suposição, e o custo de se blindar
-- contra isso é zero. Com NOT VALID, o ADD nunca falha por causa de dado
-- existente — a constraint passa a valer para toda escrita NOVA a partir de
-- agora, e a validação retroativa (VALIDATE CONSTRAINT) fica para rodar à
-- parte, fora do caminho crítico de boot, quando alguém quiser confirmar que
-- os dados antigos também obedecem.
ALTER TABLE videos
  ADD CONSTRAINT videos_failure_reason_check
  CHECK (failure_reason IS NULL OR failure_reason IN (
    -- ANTES de qualquer chamada ao fornecedor
    'insufficient_credits',
    'live_budget_exhausted',
    -- a voz foi sintetizada; o vídeo não chegou a ser pedido
    'audio_too_long',
    -- a chamada de criação saiu
    'vendor_rejected',
    'vendor_timeout',
    -- o job foi aceito; o que falhou veio depois
    'artifact_invalid',
    'vendor_reported_error',
    'poll_loop_error',
    'poll_timeout',
    -- a varredura de boot achou a linha presa
    'recovery_orphan',
    'recovery_stale',
    -- ninguém aprovou a composição dentro da janela. O gasto SAIU (a imagem
    -- existe), então este motivo NÃO estorna — ver `classificarGasto`.
    'approval_expired',
    -- P2-1 — a voz CONGELADA foi apagada do fornecedor e não há áudio para
    -- reaproveitar. Nenhuma chamada nova saiu (a checagem é um GET de
    -- leitura) — o gasto é `nao_saiu`, e o crédito volta.
    'frozen_voice_unavailable'
  )) NOT VALID;

COMMENT ON COLUMN videos.failure_reason IS
  'Motivo ENUMERADO da falha, ao lado de status=error. NULL = não falhou, ou linha anterior à migration 048. A mensagem legível continua em error_message. Lista fechada, ampliada pela 049, pela 052 e pela 083 (esta última NOT VALID — ver comentário na migration).';
