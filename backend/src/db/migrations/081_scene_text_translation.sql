-- CENÁRIO e TRAJE (texto) traduzidos para inglês, ao lado do texto do
-- usuário — mesmo padrão de `motion_prompt_en` (migration 050). Aditiva:
-- nenhuma coluna alterada nem removida.
--
-- Atrás de TRANSLATE_SCENE_TEXT (routes/videos.ts, hoje `false`): enquanto a
-- flag estiver desligada, as duas colunas ficam sempre NULL, e a composição
-- cai no texto em português — mesmo comportamento de antes desta migration,
-- para qualquer vídeo, novo ou antigo.
--
-- VELADAS — ver `services/video/tenantView.ts`: nenhuma resposta HTTP
-- destinada ao cliente do tenant pode carregá-las.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS scenario_prompt_en text;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS outfit_prompt_en text;
