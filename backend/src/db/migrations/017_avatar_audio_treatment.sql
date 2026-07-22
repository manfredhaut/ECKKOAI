ALTER TABLE avatars
  ADD COLUMN audio_treatment_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN audio_treatment_target_lufs numeric NOT NULL DEFAULT -16;
