-- POR QUE o vídeo falhou — ao LADO do estado, nunca no lugar dele.
--
-- ADITIVA. A MÁQUINA DE ESTADOS NÃO MUDA: o CHECK de `videos.status`
-- (migration 002) continua sendo exatamente `queued | processing | ready |
-- error`, e não é tocado por esta migration. Acrescentar um estado quebraria
-- todo consumidor que hoje trata `error` como terminal — a Biblioteca, o
-- painel, `GET /jobs/processing`.
--
-- ---------------------------------------------------------------------------
-- O DEFEITO
--
-- `status = 'error'` é escrito em SETE lugares de `routes/videos.ts` e
-- significa CINCO coisas financeiramente distintas: nunca cobrado, cobrado e
-- estornado, cobrado e não estornado, cobrado e entregue inutilizável, e
-- desconhecido. O que distinguia os cinco era a existência de uma linha em
-- `provider_usage` e de um lançamento `refund` no ledger — nunca um campo que
-- a tela pudesse ler.
--
-- MEDIDO em 08/08: o único vídeo em `error` do acervo tem `error_message` =
-- "Não foi possível concluir a operação no serviço de vídeo. Tente novamente."
-- Frase correta para o cliente, e que não diz qual dos sete pontos a escreveu
-- nem se houve cobrança.
--
-- Coluna PRÓPRIA, e não um prefixo dentro de `error_message`: a mensagem é
-- texto de tela, sanitizado e traduzível, e codificar máquina dentro dela
-- faria a primeira melhoria de redação quebrar todo relatório. Mesmo raciocínio
-- que separou `provider_usage.outcome` de `unit_type` (039) e
-- `credit_ledger.simulated` de `reason` (032).
-- ---------------------------------------------------------------------------

ALTER TABLE videos ADD COLUMN IF NOT EXISTS failure_reason text;

-- DROP antes de ADD: `ADD CONSTRAINT` NÃO é idempotente, e reaplicar a
-- migration falharia com MergeWithExistingConstraint. Não é hipótese — foi o
-- que aconteceu ao reaplicar a 039, e derrubou o backend (corretamente: o
-- entrypoint morre quando o migrate falha).
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_failure_reason_check;

-- A lista FECHADA. Um motivo novo exige tocar aqui E na constante
-- `VIDEO_FAILURE_REASONS` de services/video/videoFailure.ts — que é o ponto:
-- um valor que o código grave e o banco não conheça vira erro de escrita na
-- hora, e não uma string livre que ninguém consegue agrupar depois.
--
-- NULL continua válido, e significa duas coisas legítimas: a linha não está em
-- `error`, ou é anterior a esta migration.
ALTER TABLE videos
  ADD CONSTRAINT videos_failure_reason_check
  CHECK (failure_reason IS NULL OR failure_reason IN (
    -- ANTES de qualquer chamada ao fornecedor
    'insufficient_credits',
    'live_budget_exhausted',
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
    'recovery_stale'
  ));

COMMENT ON COLUMN videos.failure_reason IS
  'Motivo ENUMERADO da falha, ao lado de status=error. NULL = não falhou, ou linha anterior à migration 048. A mensagem legível continua em error_message.';

-- "O que falhou, e por quê?" — a pergunta do pós-morte de uma passada paga.
-- Parcial porque falha é a minoria das linhas, e é só ela que se procura aqui.
CREATE INDEX IF NOT EXISTS videos_failure_reason_idx
  ON videos (failure_reason, created_at DESC)
  WHERE failure_reason IS NOT NULL;

-- NENHUM BACKFILL.
--
-- O único vídeo em `error` do acervo fica com `failure_reason` NULL. Marcá-lo
-- como 'vendor_rejected' — que é o que a mensagem sanitizada sugere — seria
-- DEDUZIR um motivo a partir de um texto que existe justamente para não
-- carregar detalhe do fornecedor. NULL é honesto: aquela falha aconteceu antes
-- de o motivo ser registrado, e isso é o que se sabe sobre ela.
