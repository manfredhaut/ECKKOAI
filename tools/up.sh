#!/usr/bin/env bash
# Sobe o ambiente e só devolve o controle quando ele está de fato servindo.
#
#   ./tools/up.sh          (ou: npm run up, na raiz)
#
# Por que existe: `docker compose up -d` volta assim que os containers foram
# criados, o que não é a mesma coisa que "a aplicação responde". Pior, este
# projeto tem um modo de falha em que o container fica `running` com o
# servidor morto por dentro — então "subiu" precisa significar HTTP 200, não
# estado de container.
#
# Não consome tentativa do rate limiter de login e não fala com fornecedor
# nenhum: só bate na landing e no /health.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

BASE_DOMAIN="${BASE_DOMAIN:-twinai.localhost}"
PORT="${TRAEFIK_HTTP_PORT:-8090}"
ORIGIN="http://localhost:${PORT}"
TIMEOUT="${UP_TIMEOUT_SECONDS:-180}"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
bold()  { printf '\033[1m%s\033[0m\n' "$1"; }

bold "Subindo os serviços..."
if ! docker compose up -d; then
  red "docker compose up falhou."
  exit 1
fi

# --- espera cada serviço com healthcheck ficar healthy --------------------
# Serviço sem healthcheck é aceito como pronto assim que estiver `running`;
# depois da Parte 1 deste bloco, os quatro têm healthcheck.
bold "Esperando os serviços ficarem saudáveis (limite: ${TIMEOUT}s)..."
deadline=$(( $(date +%s) + TIMEOUT ))
services="traefik postgres backend frontend"

while :; do
  pending=""
  for svc in $services; do
    cid=$(docker compose ps -q "$svc" 2>/dev/null)
    if [ -z "$cid" ]; then pending="$pending $svc"; continue; fi
    state=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null)
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null)
    if [ "$state" != "running" ]; then pending="$pending $svc"
    elif [ "$health" != "healthy" ] && [ "$health" != "none" ]; then pending="$pending $svc"
    fi
  done

  [ -z "$pending" ] && break

  if [ "$(date +%s)" -ge "$deadline" ]; then
    red "Tempo esgotado. Ainda não prontos:$pending"
    echo
    # `ps -a` (não `ps`): container parado não aparece na listagem padrão, e
    # é justamente o caso que interessa quando algo não subiu.
    docker compose ps -a --format '  {{.Service}}\t{{.State}}\t{{.Status}}'
    echo
    # shellcheck disable=SC2086 — split intencional da lista de pendentes.
    set -- $pending
    echo "Logs recentes de $1:"
    docker compose logs --tail=20 "$1" 2>&1 | sed 's/^/  /'
    exit 1
  fi
  sleep 3
done
green "Todos os serviços saudáveis."

# --- valida que a aplicação realmente responde ----------------------------
# É esta parte que distingue "container de pé" de "aplicação servindo".
check_http() { # $1 = caminho, $2 = descrição
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Host: $BASE_DOMAIN" "$ORIGIN$1")
  if [ "$code" = "200" ]; then
    green "  OK   $2 (200)"
    return 0
  fi
  red "  FALHA $2 respondeu $code"
  return 1
}

bold "Validando as respostas..."
failed=0
check_http "/" "landing" || failed=1
check_http "/api/health" "API" || failed=1

if [ "$failed" -ne 0 ]; then
  echo
  red "O ambiente subiu mas não está servindo."
  echo "Se a API falhou com os containers de pé, o backend pode estar morto por dentro:"
  echo "  docker compose restart backend"
  exit 1
fi

echo
bold "Pronto."
echo "  $ORIGIN"
echo
echo "Os três caminhos saem todos daí: 'Comece já' (criar conta / entrar) e,"
echo "no rodapé, 'Acesso administrativo'."
