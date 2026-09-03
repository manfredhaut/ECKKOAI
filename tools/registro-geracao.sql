-- Y1/Y2, BLOCO HEYGEN-SIMPLES-9 (payload/custo) + CC1/CC2, BLOCO
-- HEYGEN-SIMPLES-10 (payload lido do BANCO, não mais do log ao vivo) —
-- registro completo de uma geração HeyGen num lugar só: payload real
-- enviado a POST /v3/videos, status/duração medida do vídeo, e cada linha
-- de provider_usage com custo real.
--
-- Chamado por tools/registro-geracao.sh — não pensado para rodar sozinho,
-- mas funciona sozinho também:
--   docker compose exec -T -e VIDEO_ID postgres sh -c \
--     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v video_id="$VIDEO_ID"' \
--     < tools/registro-geracao.sql
--
-- Sem `video_id` (variável vazia): pega o vídeo HeyGen REAL (não simulado)
-- mais recente — o uso normal, depois de um clique de verdade. Com
-- `video_id`: mostra ESSE vídeo específico, real ou de fixture — é o que
-- CC3 usa para provar a persistência sem gastar nada.
\if :{?video_id}
\else
\set video_id ''
\endif

\echo '--- VÍDEO ---'
SELECT id, status, simulated, audio_duration_seconds, audio_duration_source, created_at
FROM videos
WHERE provider_vendor = 'heygen'
  AND (:'video_id' != '' OR simulated = false)
  AND (:'video_id' = '' OR id = NULLIF(:'video_id', '')::uuid)
ORDER BY created_at DESC
LIMIT 1;

-- CC1/CC2, SIMPLES-10 — o payload agora vem do BANCO
-- (heygen_video_payloads, migration 079), não do log ao vivo do backend:
-- o buffer de log já girou 2x antes de alguém copiar a linha
-- `video_payload_built` (SIMPLES-9). Esta tabela sobrevive a qualquer
-- rotação de log e a qualquer restart do processo.
\echo '--- PAYLOAD ENVIADO (POST /v3/videos, gravado no banco) ---'
SELECT payload, created_at
FROM heygen_video_payloads
WHERE video_id = (
  SELECT id FROM videos
  WHERE provider_vendor = 'heygen'
    AND (:'video_id' != '' OR simulated = false)
    AND (:'video_id' = '' OR id = NULLIF(:'video_id', '')::uuid)
  ORDER BY created_at DESC LIMIT 1
);

\echo '--- CUSTO (provider_usage) ---'
SELECT provider, vendor, unit_type, unit_count, requested_unit_count, unit_source, endpoint_id, estimated_cost_usd, outcome, created_at
FROM provider_usage
WHERE video_id = (
  SELECT id FROM videos
  WHERE provider_vendor = 'heygen'
    AND (:'video_id' != '' OR simulated = false)
    AND (:'video_id' = '' OR id = NULLIF(:'video_id', '')::uuid)
  ORDER BY created_at DESC LIMIT 1
)
ORDER BY created_at;
