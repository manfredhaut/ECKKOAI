-- RECONCILIAÇÃO: a chave da tentativa, o instante da chamada, e o job id
-- alcançável por índice.
--
-- ADITIVA. Nenhuma coluna existente é alterada, nenhuma é removida, nenhum
-- CHECK é mexido. Tudo com IF NOT EXISTS — reaplicar é inócuo (a lição do
-- MergeWithExistingConstraint da migration 039).
--
-- ---------------------------------------------------------------------------
-- O DEFEITO, medido em 08/08 no banco desta instalação:
--
--  · `videos` tinha EXATAMENTE UM índice, `videos_pkey`. Procurar por
--    `provider_job_id` — que é o que qualquer reconciliação faz — varria a
--    tabela inteira.
--  · `provider_usage` NÃO guardava o job id. O vínculo com o fornecedor era
--    indireto, por `video_id`, que é `ON DELETE SET NULL`: havia **15 linhas
--    de `avatar` com `video_id` nulo**, consumo que sobreviveu ao vídeo e
--    perdeu qualquer ponte com o trabalho que o gerou. Uma fatura não tinha
--    como ser conferida contra o que foi gerado.
--  · Entre o débito de crédito e a gravação do `provider_job_id` havia uma
--    janela em que a chamada podia ter sido aceita sem nada ligar a linha ao
--    trabalho no fornecedor. Morto o processo ali, o registro ficava perdido
--    E sem rastro — não "difícil de achar": sem nenhum identificador comum.
-- ---------------------------------------------------------------------------

-- A CHAVE DA TENTATIVA, gravada ANTES de a chamada sair.
--
-- É a mesma que viaja no header `Idempotency-Key` (avatarProvider.ts,
-- `heygenIdempotencyKey`), e ela pode ser gravada antes porque é
-- DETERMINÍSTICA: deriva do conteúdo da tentativa — tenant, avatar/look,
-- roteiro, cena, formato, motor e `fit` —, nunca do instante nem do id da
-- linha. É isso que a torna um vínculo utilizável: um job órfão do lado do
-- fornecedor pode ser reconhecido como sendo desta linha.
--
-- NULL para vendor que não tem o conceito: só a HeyGen documenta o header.
-- Inventar chave para a D-ID gravaria um vínculo que não existe do outro lado.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS provider_idempotency_key text;

COMMENT ON COLUMN videos.provider_idempotency_key IS
  'Idempotency-Key enviada ao fornecedor, gravada ANTES da chamada. Derivada do conteúdo da tentativa. NULL = vendor sem o conceito.';

-- O INSTANTE em que a chamada foi emitida.
--
-- Sem ele, "queued sem job id" não distingue "nunca chegou a chamar" de
-- "chamou e a resposta não voltou" — e as duas têm consequências OPOSTAS no
-- estorno: a primeira nunca tocou o fornecedor, a segunda pode ter enfileirado
-- trabalho pago.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS provider_request_at timestamptz;

COMMENT ON COLUMN videos.provider_request_at IS
  'Quando POST de criação foi emitido ao fornecedor. NULL = a chamada nunca chegou a sair.';

-- O JOB no registro de CONSUMO, e não só na linha do vídeo.
--
-- Repetido de propósito, pelo mesmo motivo que `aspect_ratio` e `resolution`
-- foram repetidos na migration 038: `provider_usage` é o registro de consumo e
-- precisa se sustentar sozinho. Um join com `videos` deixa de funcionar quando
-- o vídeo some — e 15 linhas já estavam nesse estado quando esta migration foi
-- escrita.
ALTER TABLE provider_usage ADD COLUMN IF NOT EXISTS provider_job_id text;

COMMENT ON COLUMN provider_usage.provider_job_id IS
  'Job no fornecedor que produziu este consumo. NULL para voz, roteiro e para a recusa anterior ao aceite.';

-- ---------------------------------------------------------------------------
-- OS ÍNDICES
--
-- Todos PARCIAIS onde faz sentido: a coluna é nula na maioria das linhas, e um
-- índice parcial cobre a consulta sem pesar na escrita do caminho normal —
-- mesmo desenho de `provider_usage_failed_idx` (039) e dos índices de estorno
-- (035).
-- ---------------------------------------------------------------------------

-- "Que linha corresponde a este job do fornecedor?" — a pergunta da
-- reconciliação, e da varredura de boot.
CREATE INDEX IF NOT EXISTS videos_provider_job_id_idx
  ON videos (provider_job_id)
  WHERE provider_job_id IS NOT NULL;

-- "Que linha produziu esta chave?" — a pergunta que se faz quando o fornecedor
-- tem um job e nós não sabemos de quem é.
CREATE INDEX IF NOT EXISTS videos_provider_idempotency_key_idx
  ON videos (provider_idempotency_key)
  WHERE provider_idempotency_key IS NOT NULL;

-- "O que está preso?" — a consulta da varredura de boot, feita uma vez por
-- start. Parcial nos dois estados não-terminais; ordenada por created_at
-- porque a varredura decide por IDADE.
CREATE INDEX IF NOT EXISTS videos_em_voo_idx
  ON videos (created_at)
  WHERE status IN ('queued', 'processing');

-- O mesmo vínculo do lado do consumo.
CREATE INDEX IF NOT EXISTS provider_usage_provider_job_id_idx
  ON provider_usage (provider_job_id)
  WHERE provider_job_id IS NOT NULL;

-- NENHUM BACKFILL, e isso é decisão, não esquecimento.
--
-- As linhas anteriores continuam com as três colunas nulas. Preencher
-- `provider_idempotency_key` recalculando a chave a partir do conteúdo de hoje
-- afirmaria que aquela chave foi ENVIADA, e ela não foi — o header só passou a
-- existir no bloco de idempotência, e a gravação antecipada só existe a partir
-- desta migration. Seria transformar uma reconstrução em registro histórico, e
-- é exatamente o que a migration 038 recusou fazer com `aspect_ratio`.
