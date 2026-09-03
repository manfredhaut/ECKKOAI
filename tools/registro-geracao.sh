#!/usr/bin/env bash
# Y1/Y2, BLOCO HEYGEN-SIMPLES-9 — imprime, num lugar só, o registro completo
# da geração HeyGen real (não simulada) mais recente:
#
#   1. O log `video_payload_built` que o backend emitiu para essa geração —
#      payload REAL enviado (F1: output_format/title/callback_url/callback_id
#      + todos os outros campos), com o campo `video_id` explícito para
#      conferência cruzada com o item 2.
#   2. O vídeo e a duração MEDIDA (G1, ffprobe) na tabela `videos`.
#   3. Cada linha de `provider_usage` gerada por essa corrida, com custo real.
#
# Uso: depois de um clique real em "Gerar" (tier Simples/HeyGen), rodar:
#
#   ./tools/registro-geracao.sh
#
# Gotcha do projeto (CLAUDE.md §2.1): `docker compose logs` sem `--tail`
# limitado (ou com `--tail` grande) pode devolver arquivo rotacionado e
# congelado — por isso este script usa `--tail 500` e NUNCA conclui ausência
# de geração a partir de uma busca vazia; ele só diz o que achou.
set -uo pipefail

cd "$(dirname "$0")/.."

echo "=== PAYLOAD ENVIADO (último 'video_payload_built' real, HeyGen) ==="
LINHA="$(docker compose logs backend --tail 500 2>/dev/null | grep '"event":"video_payload_built"' | grep '"context":"heygen.generateVideo"' | tail -1)"
if [ -z "$LINHA" ]; then
  echo "(nenhuma linha encontrada nos últimos 500 registros do log ao vivo do backend —"
  echo " não significa que não houve geração: o buffer pode ter girado. Ver a seção"
  echo " de banco abaixo, que é a fonte de verdade independente do log.)"
else
  echo "$LINHA"
fi

echo ""
echo "=== VÍDEO + CUSTO REAL (banco, fonte de verdade) ==="
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$(dirname "$0")/registro-geracao.sql"
