-- O ESTADO QUE FALTAVA: `awaiting_approval`.
--
-- ADITIVA. O CHECK de `videos.status` ganha UM valor, e as três colunas novas
-- são anuláveis e sem default — nenhuma linha existente muda, nenhum backfill.
--
-- ---------------------------------------------------------------------------
-- ESTA MIGRATION CONTRADIZ UMA DECISÃO ESCRITA, E ISSO É DE PROPÓSITO
--
-- `services/video/videoFailure.ts` dizia, em letra: "A MÁQUINA DE ESTADOS NÃO
-- MUDA… acrescentar um estado novo quebraria todo consumidor que hoje trata
-- `error` como terminal." Aquilo estava certo para o problema DAQUELE bloco —
-- distinguir cinco significados de `error` não precisava de estado novo, e
-- inventar um teria sido custo sem ganho.
--
-- O problema deste bloco é outro e não tem essa saída: o caminho da fal PARA no
-- meio, com dinheiro já gasto (a imagem composta) e dinheiro ainda por gastar
-- (o Wan, ~US$ 1,00), esperando um humano olhar. Nenhum dos quatro estados
-- descreve isso. `processing` mente (não há nada processando e ninguém vai
-- voltar); `ready` mente pior (não há vídeo); `error` mente e cobra o preço
-- errado — a varredura de boot estornaria o crédito de uma composição que
-- ACONTECEU e foi entregue.
--
-- O aviso daquele arquivo continua valendo como aviso: todo consumidor de
-- `videos.status` teve de ser tocado nesta rodada, e eles estão listados no
-- commit. O que mudou não foi a regra — foi haver, pela primeira vez, um estado
-- que os quatro não sabem escrever.
-- ---------------------------------------------------------------------------
--
-- ⚠️ SÓ VALE DEPOIS DE O BACKEND SUBIR DE NOVO. Enquanto o CHECK antigo estiver
-- no banco, gravar 'awaiting_approval' é erro de escrita — e ele aconteceria
-- DEPOIS da composição paga, perdendo a marcação da linha (não o dinheiro: a
-- URL da imagem já está em `fal_pipeline_steps`).

-- DROP antes de ADD: `ADD CONSTRAINT` não é idempotente, e reaplicar falharia
-- com MergeWithExistingConstraint — foi o que derrubou o backend na 039.
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check;

-- A lista transcrita INTEIRA de novo, e não emendada: o CHECK é substituído por
-- completo, então uma lista parcial apagaria em silêncio os valores omitidos.
--
-- `awaiting_approval` entra ENTRE `processing` e `ready` porque é onde ele
-- está no fluxo — depois do trabalho começar, antes de haver entregável.
ALTER TABLE videos
  ADD CONSTRAINT videos_status_check
  CHECK (status IN ('queued', 'processing', 'awaiting_approval', 'ready', 'error'));

COMMENT ON COLUMN videos.status IS
  'queued | processing | awaiting_approval | ready | error. `awaiting_approval` é exclusivo do caminho da fal: a imagem composta existe e foi paga, e a etapa seguinte (Wan, ~US$ 1,00) espera um clique humano. Lista ampliada pela migration 052.';

-- Um motivo novo, pelo mesmo procedimento da 049: a lista inteira, transcrita.
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_failure_reason_check;

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
    'approval_expired'
  ));

COMMENT ON COLUMN videos.failure_reason IS
  'Motivo ENUMERADO da falha, ao lado de status=error. NULL = não falhou, ou linha anterior à migration 048. A mensagem legível continua em error_message. Lista fechada, ampliada pela 049 e pela 052.';

-- ---------------------------------------------------------------------------
-- AS TRÊS COLUNAS
--
-- Elas guardam o INTERPRETADO; o CRU continua em `fal_pipeline_steps`. A
-- divisão é a mesma que o diário já tinha: o corpo bruto do fornecedor existe
-- para diagnóstico e para a fatura do BLOCO 6, e fazer a TELA depender de um
-- `JSON.parse` sobre ele seria acoplá-la ao formato de resposta de um
-- fornecedor — exatamente o que o diário existe para evitar.
-- ---------------------------------------------------------------------------

-- A corrida que produziu esta linha. `ON DELETE SET NULL` e não CASCADE: apagar
-- o diário não pode apagar o vídeo do cliente.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS fal_run_id uuid REFERENCES fal_pipeline_runs(id) ON DELETE SET NULL;

-- A imagem-base, aprovada ou à espera de aprovação. É o que a tela mostra no
-- passo 4 e é de onde a animação parte quando o clique acontece.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS fal_composed_image_url text;

-- Quando a aprovação passou a ser esperada. NÃO é `created_at`: refazer a
-- composição reinicia o relógio, porque a aprovação pendente passa a ser da
-- imagem nova. É este campo que a expiração de 24 h mede.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz;

COMMENT ON COLUMN videos.approval_requested_at IS
  'Instante em que a composição ficou à espera de aprovação. Reiniciado a cada recomposição. A varredura de boot expira o que passar de VIDEO_APPROVAL_MAX_AGE_MS (24 h) como failure_reason=approval_expired, SEM estorno.';
