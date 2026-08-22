-- O CAMPO LIVRE do "Refazer" — pedido do operador (22/08), depois de
-- verificar que awaiting_approval_video apresenta o VÍDEO MUDO (produto de
-- animar(), antes de narrar+sincronizar — falPipeline.ts:1103,1121), não a
-- imagem: ver o comentário de `fal_muted_video_url` na migration 059.
--
-- ADITIVA. Coluna anulável, sem default — nenhuma linha existente muda.
--
-- UMA coluna para as DUAS telas de "Refazer" (imagem e vídeo mudo), de
-- propósito: o pedido foi "o MESMO campo" nas duas, e as duas nunca estão
-- ativas ao mesmo tempo para o mesmo vídeo (o status só permite uma delas
-- por vez — awaiting_approval OU awaiting_approval_video). Sobrescrita a
-- cada "Refazer", nunca acumulada — mesmo padrão de `fal_composed_image_url`
-- e `fal_muted_video_url`.
--
-- SÓ CAPTURA E PERSISTE. Nenhum caminho de produto lê esta coluna para
-- decidir prompt, corpo de composição/animação, nem nada mais — decisão
-- registrada do operador, não esquecimento.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS refazer_feedback text;

COMMENT ON COLUMN videos.refazer_feedback IS
  'Texto livre descrevendo o que precisa mudar, capturado no clique de "Refazer" -- tanto na aprovação de imagem (awaiting_approval) quanto na de vídeo mudo (awaiting_approval_video). Sobrescrito a cada Refazer, nunca acumulado. NÃO consumido por nenhum caminho de geração ainda -- só capturado e persistido (migration 061).';
