-- O TIER DE VÍDEO escolhido pelo tenant, POR VÍDEO (BLOCO A, sistema de
-- níveis Simples/Normal/Premium).
--
-- ADITIVA, com CHECK fechado: os três valores são os únicos que o produto
-- oferece hoje, e um quarto valor merece reprovar a migration, não virar
-- string solta aceita em silêncio.
--
-- `simples` mapeia para o motor HeyGen (caminho já existente, inalterado);
-- `normal` e `premium` mapeiam para o pipeline da fal, motores Wan e
-- Seedance 2.5 respectivamente — ver `PipelineTier` em falPipeline.ts. Um
-- tenant cujo avatar_credential é heygen ignora este campo na prática (o
-- despacho por vendor continua vindo da credencial, não deste campo); ele só
-- decide o MOTOR dentro do caminho da fal.
--
-- DEFAULT 'normal': é o único tier do caminho da fal que já tinha motor
-- funcionando (Wan) antes desta migration, e é o comportamento que todo
-- vídeo criado antes deste bloco teve, sem ter escolhido nada.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS tier_video text NOT NULL DEFAULT 'normal';

ALTER TABLE videos
  DROP CONSTRAINT IF EXISTS videos_tier_video_check;
ALTER TABLE videos
  ADD CONSTRAINT videos_tier_video_check CHECK (tier_video IN ('simples', 'normal', 'premium'));

COMMENT ON COLUMN videos.tier_video IS
  'Nível escolhido pelo tenant: simples (HeyGen) | normal (fal/Wan) | premium (fal/Seedance 2.5, teto de gasto próprio). Default normal — o único tier fal com motor ligado antes do BLOCO A.';
