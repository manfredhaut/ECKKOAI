-- A FICHA DE IDENTIDADE — P2-1, VERSÃO FINAL, 22/09/2026. Aditiva.
-- Substitui o desenho anterior de 8 colunas (nunca aplicado) por UMA coluna
-- versionada. `avatar_look_id` (o traje/look) já existe desde a migration
-- 042 e não entra aqui — mecanismo separado, já funcionando.
--
-- Formato v1 (validado por lerIdentidade(), nunca confiado cru):
--   { v: 1, photo_urls, voice_id, voice_tuning: {stability, similarity_boost,
--     style, speaker_boost}, audio_treatment: {enabled, target_lufs},
--     captured_at }
ALTER TABLE videos ADD COLUMN IF NOT EXISTS identity_snapshot jsonb;

-- GIN sobre o array de fotos DENTRO da ficha — usado pelo DELETE de foto do
-- avatar (routes/avatars.ts) para checar "algum vídeo ainda referencia este
-- caminho?" antes de apagar o arquivo. Vale a pena desde já: é escrita rara
-- (só na criação) e leitura em um caminho que hoje já apaga sem perguntar.
CREATE INDEX IF NOT EXISTS videos_identity_snapshot_photo_urls_gin
  ON videos USING gin ((identity_snapshot -> 'photo_urls'));
