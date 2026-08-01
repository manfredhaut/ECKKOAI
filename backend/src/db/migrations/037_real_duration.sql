-- Duração REAL ao lado da PEDIDA, em vez de uma no lugar da outra.
--
-- O defeito medido no LIVE-1: uma geração pediu `duration_seconds = 15`, o
-- vídeo entregue tem 3,372 s, e `provider_usage.unit_count` gravou 15 — erro
-- de 4,5x em cima do qual toda tela de custo é calculada.
--
-- Substituir o pedido pelo real resolveria metade do problema e criaria outra:
-- sem os dois lados, não há como medir o quanto a estimativa erra, que é
-- exatamente a pergunta em aberto sobre `provider_cost_rates`. Por isso
-- `unit_count` passa a ser o real e o pedido ganha coluna própria.
--
-- `unit_source` diz DE ONDE veio o número. Sem ele, um valor real e um
-- estimado ficam indistinguíveis na tabela, e a conciliação futura teria de
-- adivinhar quais linhas valem — que é como a estimativa virou verdade em
-- primeiro lugar.
ALTER TABLE provider_usage
  ADD COLUMN IF NOT EXISTS requested_unit_count numeric,
  ADD COLUMN IF NOT EXISTS unit_source text;

-- Linhas anteriores a esta migration carregam o valor PEDIDO em `unit_count`.
-- Marcá-las como 'requested' é mais honesto que deixar NULL: elas existem, e o
-- que elas medem é o pedido. NULL sugeriria "desconhecido" quando na verdade
-- se sabe exatamente o que está ali.
UPDATE provider_usage SET unit_source = 'requested' WHERE unit_source IS NULL;

ALTER TABLE provider_usage
  ADD CONSTRAINT provider_usage_unit_source_check
  CHECK (unit_source IS NULL OR unit_source IN ('vendor_response', 'tts_timestamps', 'requested'));

-- A duração do áudio sintetizado é conhecida no momento da GERAÇÃO, e o
-- registro de uso acontece muito depois, no laço de polling — noutra
-- requisição, possivelmente noutro processo. Guardá-la na linha do vídeo é o
-- que liga os dois momentos; sem isso, a fonte (b) do LIVE-2 seria inalcançável
-- e sobraria só o que o fornecedor quisesse devolver.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS audio_duration_seconds numeric,
  ADD COLUMN IF NOT EXISTS audio_duration_source text;
