-- V28, item 3 -- guarda as URLs de fila (status_url/response_url) que a fal
-- devolve no SUBMIT de cada etapa, ao lado do request_id que ja existia.
--
-- O DEFEITO QUE ISTO FECHA: sem as URLs, um timeout de poll (o teto de
-- 300000ms, falPipeline.ts) preservava o request_id mas nao a forma de
-- consultar o resultado depois -- reconstruir a URL por formula e ARRISCADO,
-- MEDIDO em 31/08 (V27): o status_url real do Wan e
-- "https://queue.fal.run/wan/v2.6/requests/{id}/status", que NAO e o mesmo
-- prefixo do endpoint_id completo ("wan/v2.6/reference-to-video/flash") --
-- adivinhar a URL por um dos dois teria funcionado por coincidencia aqui e
-- falhado num endpoint com convencao diferente. A fal ja devolve as duas URLs
-- prontas no SUBMIT (falClient.ts:339-340); ate esta migration elas eram
-- lidas e descartadas.
--
-- Nulas para toda linha existente (nunca gravadas antes) -- a recuperacao de
-- videos ANTERIORES a esta migration continua dependendo de reconstrucao
-- manual, como no V27.
ALTER TABLE fal_pipeline_steps
  ADD COLUMN status_url text,
  ADD COLUMN response_url text;
