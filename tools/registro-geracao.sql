-- Y1/Y2, BLOCO HEYGEN-SIMPLES-9 — registro completo da geração HeyGen mais
-- recente (real, não simulada) num lugar só: status/duração medida do
-- vídeo, e cada linha de provider_usage com custo real.
--
-- Chamado por tools/registro-geracao.sh — não pensado para rodar sozinho,
-- mas funciona sozinho também:
--   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < tools/registro-geracao.sql
--
-- Sem parâmetro: pega o vídeo HeyGen real mais recente. Para um vídeo
-- específico, troque a condição do WHERE por: WHERE id = 'UUID-AQUI'.
\echo '--- VÍDEO ---'
SELECT id, status, audio_duration_seconds, audio_duration_source, created_at
FROM videos
WHERE provider_vendor = 'heygen' AND simulated = false
ORDER BY created_at DESC
LIMIT 1;

\echo '--- CUSTO (provider_usage) ---'
SELECT provider, vendor, unit_type, unit_count, requested_unit_count, unit_source, endpoint_id, estimated_cost_usd, outcome, created_at
FROM provider_usage
WHERE video_id = (
  SELECT id FROM videos
  WHERE provider_vendor = 'heygen' AND simulated = false
  ORDER BY created_at DESC LIMIT 1
)
ORDER BY created_at;
