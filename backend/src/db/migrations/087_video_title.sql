-- TITULO-1, 29/09/2026 — título do vídeo, obrigatório em toda criação nova.
-- Nulo em todo vídeo anterior a esta migration. Nunca enviado ao fornecedor:
-- só nomeia o arquivo baixado e identifica o vídeo na Biblioteca.
ALTER TABLE videos ADD COLUMN title text;
