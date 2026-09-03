-- B6, BLOCO HEYGEN-SIMPLES-1 -- os quatro ajustes de voz_settings da HeyGen
-- (POST /v3/videos), paralelos aos quatro ajustes ElevenLabs ja existentes
-- (voice_stability/voice_similarity_boost/voice_style/voice_speaker_boost,
-- migration 067). Ranges e defaults lidos por doc publica (developers.
-- heygen.com/reference/create-video, WebFetch 02/09/2026): speed 0.5-1.5
-- (default 1), pitch -50..+50 semitons (default 0), volume 0-1 (default
-- 1), locale BCP-47 opcional. So tem efeito quando heygen_voice_id existe
-- (a voz nativa HeyGen) -- para voz ElevenLabs, os quatro ajustes que
-- valem continuam sendo os antigos.
ALTER TABLE avatars
  ADD COLUMN heygen_voice_speed numeric NOT NULL DEFAULT 1,
  ADD COLUMN heygen_voice_pitch numeric NOT NULL DEFAULT 0,
  ADD COLUMN heygen_voice_volume numeric NOT NULL DEFAULT 1,
  ADD COLUMN heygen_voice_locale text;
