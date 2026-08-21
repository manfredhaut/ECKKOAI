-- O ESTADO QUE FALTAVA, um passo adiante do da migration 052:
-- `awaiting_approval_video` — FASE 2 (Modo B), 21/08.
--
-- ADITIVA. O CHECK de `videos.status` ganha UM valor a mais, e a coluna nova
-- é anulável e sem default — nenhuma linha existente muda, nenhum backfill.
--
-- `awaiting_approval` (migration 052) para depois de `compor`: a imagem
-- existe, foi paga, e espera aprovação antes do Wan/Seedance (`animar`).
-- Este bloco move a segunda parada um passo adiante: agora é `animar` que
-- para, com o vídeo MUDO gravado e pago, esperando um segundo clique antes
-- das duas etapas mais caras da corrida (narrar + sincronizar). Nenhum dos
-- cinco estados anteriores descreve isso pelo mesmo motivo que a 052 já
-- registrou para `awaiting_approval`: `processing` mente (não há nada
-- processando), `ready` mente pior (não há vídeo final), `error` cobraria o
-- preço errado.
--
-- ⚠️ SÓ VALE DEPOIS DE O BACKEND SUBIR DE NOVO — mesmo aviso da 052. Enquanto
-- o CHECK antigo estiver no banco, gravar 'awaiting_approval_video' é erro de
-- escrita, e ele aconteceria DEPOIS de `animar` já ter sido pago.

ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check;

-- A lista TRANSCRITA INTEIRA de novo, e não emendada — mesma regra da 052.
-- `awaiting_approval_video` entra ENTRE `awaiting_approval` e `ready`: é
-- exatamente aí que ele está no fluxo, um clique depois do primeiro.
ALTER TABLE videos
  ADD CONSTRAINT videos_status_check
  CHECK (status IN ('queued', 'processing', 'awaiting_approval', 'awaiting_approval_video', 'ready', 'error'));

COMMENT ON COLUMN videos.status IS
  'queued | processing | awaiting_approval | awaiting_approval_video | ready | error. awaiting_approval: imagem composta paga, espera animar. awaiting_approval_video: vídeo mudo pago, espera narrar+sincronizar. Lista ampliada pela migration 059.';

-- O vídeo animado, MUDO — o produto de `animar()`, aprovado ou à espera de
-- aprovação. Mesmo papel que `fal_composed_image_url` (migration 052) tem
-- para a imagem, um passo adiante na corrida.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS fal_muted_video_url text;

COMMENT ON COLUMN videos.fal_muted_video_url IS
  'O vídeo animado, MUDO, produzido por animar() — aprovado ou à espera de aprovação (status=awaiting_approval_video). Sobrescrito a cada "Refazer", nunca acumulado. FASE 2 (Modo B), migration 059.';
