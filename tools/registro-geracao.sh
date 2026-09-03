#!/usr/bin/env bash
# Y1/Y2, BLOCO HEYGEN-SIMPLES-9 + CC1/CC2, BLOCO HEYGEN-SIMPLES-10 —
# imprime, num lugar só, o registro completo de uma geração HeyGen:
#
#   1. O payload REAL enviado a POST /v3/videos (F1: output_format/title/
#      callback_url/callback_id + todos os outros campos) — lido do BANCO
#      (heygen_video_payloads, migration 079), não do log ao vivo do
#      backend. O log já girou 2x antes de dar tempo de copiar a linha
#      (SIMPLES-9); a tabela sobrevive a qualquer rotação de log ou
#      restart do processo (CC1/CC2, SIMPLES-10).
#   2. O vídeo e a duração MEDIDA (G1, ffprobe) na tabela `videos`.
#   3. Cada linha de `provider_usage` gerada por essa corrida, com custo real.
#
# Uso:
#
#   ./tools/registro-geracao.sh                 # o vídeo HeyGen REAL mais
#                                                # recente (depois de um
#                                                # clique de verdade)
#   ./tools/registro-geracao.sh <video-uuid>     # um vídeo específico —
#                                                # real ou de fixture
set -uo pipefail

cd "$(dirname "$0")/.."

VIDEO_ID="${1:-}"

docker compose exec -T -e VIDEO_ID="$VIDEO_ID" postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v video_id="$VIDEO_ID"' \
  < "$(dirname "$0")/registro-geracao.sql"
