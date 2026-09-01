-- V34, item 1 -- a duracao-alvo escolhida no passo Roteiro (15/30/45/60 ou
-- o valor livre de "Mais") passa a ser PERSISTIDA na linha do video, junto
-- dos demais parametros da corrida -- ate esta migration ela chegava ao
-- servidor (POST /videos ja a le, ver isTargetDurationSeconds em
-- scriptDuration.ts) e so servia para RECUSAR um roteiro longo demais
-- (evaluateGenerationReadiness); depois disso ela era descartada, nunca
-- gravada. NULL para "Mais" sem numero digitado e para toda linha anterior
-- a esta migration -- o mesmo "sem alvo" de sempre, so agora com coluna
-- para dizer isso explicitamente em vez de a informacao simplesmente nunca
-- ter existido.
ALTER TABLE videos
  ADD COLUMN target_duration_seconds integer;
