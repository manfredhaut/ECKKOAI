-- P2-3, 22/09/2026 — o estado que faltava: `cancelled`.
--
-- ADITIVA. Mesmo padrão seguro que a 083 corrigiu (NOT VALID): a lista é
-- um SUPERSET estrito da 059 (os 6 valores antigos, transcritos inteiros,
-- + `cancelled`) — o ADD nunca falha por causa de linha existente, e a
-- validação retroativa (se algum dia for preciso) fica disponível via
-- VALIDATE CONSTRAINT, fora do caminho crítico de boot.
--
-- `cancelled` é TERMINAL e DIFERENTE de `error`: não é falha nossa nem do
-- fornecedor — é decisão do cliente. Por isso a rota que grava este status
-- (POST /videos/:id/cancel) NUNCA grava failure_reason: esse enum descreve
-- POR QUE a máquina falhou, e cancelar não é uma falha.
--
-- `cancelled` fica DELIBERADAMENTE FORA de STATUS_VARRIDOS (recovery.ts) —
-- não precisa entrar lá para nunca ser reprocessado: a varredura só
-- SELECIONA os 4 status daquela lista, e a ausência de `cancelled` nela já
-- basta. Nenhuma mudança em recovery.ts.
--
-- P5, 22/09/2026 — A PLATAFORMA NÃO PAGA PELO APRENDIZADO DO CLIENTE:
-- cancelar depois que uma etapa paga rodou (a imagem, na 1ª aprovação; a
-- imagem + a animação, na 2ª) NÃO devolve crédito — e não existe um
-- "cancelar antes de qualquer gasto" nestes dois status, porque os dois só
-- são alcançados DEPOIS de `compor`/`animar` já terem sido cobrados. Ver
-- routes/videos.ts, POST /videos/:id/cancel.

ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check;

ALTER TABLE videos
  ADD CONSTRAINT videos_status_check
  CHECK (status IN (
    'queued', 'processing', 'awaiting_approval', 'awaiting_approval_video',
    'ready', 'error', 'cancelled'
  )) NOT VALID;

COMMENT ON COLUMN videos.status IS
  'queued | processing | awaiting_approval | awaiting_approval_video | ready | error | cancelled. cancelled: o cliente cancelou uma aprovação pendente (POST /videos/:id/cancel) — terminal, nunca reprocessado (fora de STATUS_VARRIDOS), NUNCA estorna crédito (P5: a plataforma não paga pelo aprendizado do cliente — a etapa paga já rodou). Lista ampliada pela migration 084 (NOT VALID — ver comentário na 083).';
