-- ABAS-9, 30/09/2026 — narração e música/jingle entram como modos novos
-- dentro de creative_jobs (decisão do operador: sem tabela própria de
-- áudio). Ambos usam o MESMO fornecedor já integrado (ElevenLabs) — ver
-- services/providers/voiceProvider.ts (cloneVoice, synthesizeSpeech).
--
-- UPLOAD DIRETO (a pessoa já tem a narração gravada ou o jingle pronto):
-- vira uma linha de creative_jobs que nasce direto em estado='pronto', sem
-- request_id, com arquivo_url preenchido na hora — um "job instantâneo",
-- sem passar pela fixture assíncrona. Nenhuma coluna nova é necessária para
-- isso: request_id e arquivo_url já são nullable/preenchíveis, e o CHECK de
-- `estado` (migration 088) já inclui 'pronto'.
--
-- Validação de MIME de áudio para o upload NÃO está decidida ainda — fica
-- para o bloco que escrever a rota; esta migration só abre o vocabulário no
-- banco.
ALTER TABLE creative_jobs DROP CONSTRAINT creative_jobs_modo_check;
ALTER TABLE creative_jobs ADD CONSTRAINT creative_jobs_modo_check
  CHECK (modo = ANY (ARRAY['imagem', 'propaganda', 'broll', 'sobreposicao', 'narracao', 'musica']));
