-- B5/B6, BLOCO HEYGEN-SIMPLES-1 -- avatars.voice_id sempre guardou o id
-- ElevenLabs (o unico vendor de voz que o produto tinha ate aqui). O nivel
-- Simples exige uma voz clonada DIRETO na HeyGen (POST /v3/voices/clone),
-- e um mesmo avatar pode ser usado tanto no Simples quanto no Normal/
-- Premium -- por isso a voz HeyGen precisa de uma coluna PROPRIA, paralela,
-- nao uma substituicao de voice_id: as duas convivem, cada uma alimentando
-- o pipeline do vendor correspondente. NULL ate a primeira clonagem HeyGen
-- bem-sucedida (best-effort, ver routes/voice.ts).
ALTER TABLE avatars
  ADD COLUMN heygen_voice_id text;
