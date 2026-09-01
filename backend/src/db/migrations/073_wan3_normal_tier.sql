-- V33 -- migracao do tier Normal para alibaba/wan-3.0/reference-to-video.
--
-- fal_audio_url (videos): a URL (fal-hosted) do audio ja sintetizado pelo
-- ElevenLabs, quando a corrida narra ANTES de animar -- caminho novo desta
-- rodada, para roteiros curtos (<=30s estimados), item 2. Persistida no
-- ponto em que a corrida para em "animar" (pararApos), para que o segundo
-- clique humano (/approve-video, runFalPipelineDoVideoMudo) reutilize o
-- MESMO audio em vez de sintetizar de novo -- ressintetizar mede duracao
-- DIFERENTE do mesmo texto (variancia de ate 9.1% ja registrada neste
-- projeto), o que reabriria exatamente o descompasso audio/video que esta
-- rodada existe para fechar. NULL para toda corrida que nao passou por este
-- caminho (Premium, ou Normal fracionado acima de 30s, que continua
-- narrando DEPOIS de animar, sem nada para persistir aqui).
ALTER TABLE videos
  ADD COLUMN fal_audio_url text;

-- O PRECO do endpoint novo do tier Normal -- sem esta linha, custoDaEtapa()
-- recusa a etapa "animar" por CUSTO DESCONHECIDO antes de qualquer chamada
-- paga (mesmo gate que a migration 070 documenta para o endpoint anterior).
--
-- US$ 0,05/s a 480p -- LIDO por WebFetch em 01/09/2026 na doc do fornecedor
-- (V32, Parte A, item 1g): a pagina de alibaba/wan-3.0/reference-to-video
-- lista o preco por resolucao, 480p sendo a metade de 720p (US$ 0,10/s) e um
-- quarto de 1080p (US$ 0,20/s). 480p e a resolucao MINIMA e a que o produto
-- usa nesta rodada (item 7) -- se 720p/1080p forem ligados no futuro, este
-- preco precisa ser trocado ou o freio ficaria calculando pelo numero
-- errado. NUNCA confrontado com fatura real.
INSERT INTO provider_prices (endpoint_id, vendor, usd, unidade, origem, medido_em, unitario, nota)
VALUES
  ('alibaba/wan-3.0/reference-to-video', 'fal', 0.05, 'per_second', 'DOC', '2026-09-01', true,
   'Doc do fornecedor: US$0,05/s a 480p (US$0,10/s a 720p, US$0,20/s a 1080p) -- 480p e a resolucao em uso (V33, item 7). NUNCA confrontado com fatura real. Se a resolucao mudar, trocar este numero.')
ON CONFLICT (endpoint_id) DO NOTHING;
