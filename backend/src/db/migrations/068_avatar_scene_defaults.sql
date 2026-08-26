-- Cenário/Traje padrão do avatar — Fase A, item 5 (25/08).
--
-- Mesmas 4 colunas que `videos` já tem desde as migrations 002/010
-- (scenario, outfit, scenario_prompt, outfit_prompt), agora na linha do
-- AVATAR: até aqui, o que o Passo 1 chamava de "Cenário padrão"/"Traje
-- padrão" vivia só no estado do wizard de criação de vídeo (`defaults`,
-- CreateVideoPage.tsx) e nunca sobrevivia entre visitas ao produto — o
-- rótulo prometia um padrão do avatar que não existia no banco.
ALTER TABLE avatars
  ADD COLUMN scenario text,
  ADD COLUMN scenario_prompt text,
  ADD COLUMN outfit text,
  ADD COLUMN outfit_prompt text;
