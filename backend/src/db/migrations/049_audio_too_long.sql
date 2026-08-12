-- Um motivo novo: `audio_too_long` — o teto sobre a duração MEDIDA do áudio.
--
-- ADITIVA, e só ao CHECK. Nenhuma coluna nova, nenhum backfill, nenhum dado
-- tocado. A máquina de estados de `videos.status` continua sendo exatamente
-- `queued | processing | ready | error` (migration 002).
--
-- ---------------------------------------------------------------------------
-- POR QUE UM MOTIVO NOVO, e não um dos dez que já existem
--
-- O caminho que ele descreve não existia quando a 048 foi escrita: a duração
-- REAL da fala é medida pelo ElevenLabs, dentro de `generateVideoHeygen`, e
-- agora é conferida contra `MAX_SCRIPT_SECONDS` ANTES do `POST /v3/videos`.
-- Quando ela estoura, o dinheiro está numa combinação que nenhum motivo antigo
-- descreve:
--
--   · o fornecedor de VÍDEO nunca soube da tentativa  → não é `vendor_rejected`
--   · a síntese de VOZ já aconteceu e foi cobrada     → não é "antes de
--                                                        qualquer chamada"
--   · o teto é NOSSO, não do fornecedor               → não é `vendor_timeout`
--
-- Reaproveitar `vendor_rejected` devolveria a coluna ao estado que ela veio
-- corrigir — dois pontos de falha financeiramente distintos dizendo a mesma
-- coisa, e o pós-morte mandando procurar defeito na HeyGen numa recusa que
-- aconteceu aqui dentro.
-- ---------------------------------------------------------------------------
--
-- ⚠️ ESTA MIGRATION SÓ VALE DEPOIS DE O BACKEND SUBIR DE NOVO. Enquanto o
-- CHECK antigo estiver no banco, gravar 'audio_too_long' é erro de escrita. O
-- caminho que a grava está exercitado pela guarda, e a rota estorna o crédito
-- ANTES de tentar o UPDATE justamente por isso: uma violação de CHECK nesta
-- janela perde a marcação da linha (a varredura de boot a recolhe como
-- `recovery_orphan`), nunca o dinheiro.

-- DROP antes de ADD: `ADD CONSTRAINT` NÃO é idempotente, e reaplicar a
-- migration falharia com MergeWithExistingConstraint — foi o que derrubou o
-- backend ao reaplicar a 039.
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_failure_reason_check;

-- A lista FECHADA, agora com onze valores. Ela é transcrita INTEIRA de novo, e
-- não emendada: o CHECK é substituído por completo, então uma lista parcial
-- aqui apagaria em silêncio os motivos que ela não repetisse.
--
-- Motivo novo exige tocar aqui E na constante `VIDEO_FAILURE_REASONS` de
-- services/video/videoFailure.ts — e a guarda de recuperação confere os dois
-- contra a migration MAIS NOVA que define este CHECK, não contra um nome de
-- arquivo fixo (era a 048; foi por isso que este arquivo obrigou a corrigi-la).
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
    'recovery_stale'
  ));

COMMENT ON COLUMN videos.failure_reason IS
  'Motivo ENUMERADO da falha, ao lado de status=error. NULL = não falhou, ou linha anterior à migration 048. A mensagem legível continua em error_message. Lista fechada, ampliada pela 049.';
