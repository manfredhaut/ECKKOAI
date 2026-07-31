#!/usr/bin/env bash
# Verificação de 10 minutos antes de apresentar. Uma passada, sem gastar
# NENHUMA requisição de fornecedor de IA — nada aqui chama Gemini, ElevenLabs
# ou HeyGen, porque a cota é escassa e queimá-la ensaiando é exatamente o que
# faria a demo falhar.
#
#   ./tools/smoke-demo.sh
#
# Lê as credenciais de dev de DEV-ACCESS.local.md (não versionado) ou das
# variáveis DEMO_ADMIN_EMAIL/PASSWORD e DEMO_TENANT_EMAIL/PASSWORD.
# Sai 0 se tudo passou, 1 se algo que a demo usa está quebrado.

set -uo pipefail

BASE_DOMAIN="${BASE_DOMAIN:-twinai.localhost}"
PORT="${TRAEFIK_HTTP_PORT:-8090}"
ORIGIN="http://localhost:${PORT}"
TENANT_SLUG="${DEMO_TENANT_SLUG:-dev-c77a5b}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACCESS_FILE="$ROOT/DEV-ACCESS.local.md"

PASS=0
FAIL=0
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

WARN=0
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFALHA\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33mAVISO\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# 429 no login é o rate limiter (5 tentativas/15min por IP), não conta como
# falha: a credencial pode estar perfeita. Isso importa porque ESTE script
# consome 2 dessas tentativas — rodá-lo duas vezes seguidas antes de
# apresentar esgotaria a janela e faria o login de verdade parecer "senha
# errada" na hora da demo. Por isso avisa em vez de reprovar, e diz o que
# fazer.
login_result() { # $1 = código HTTP, $2 = descrição
  case "$1" in
    200) ok "$2"; return 0 ;;
    429) warn "$2: rate limiter ativo (5 tentativas/15 min). A credencial não foi testada — espere a janela virar e NÃO rode este script de novo agora."; return 1 ;;
    *)   bad "$2 respondeu $1"; return 1 ;;
  esac
}

# Credenciais: variável de ambiente ganha; senão lê o arquivo local.
read_cred() { # $1 = email
  [ -f "$ACCESS_FILE" ] || return 1
  grep -oP "(?<=\`$1\` \| \`)[^\`]+" "$ACCESS_FILE" 2>/dev/null | head -1
}
ADMIN_EMAIL="${DEMO_ADMIN_EMAIL:-admin@eckkoai.com}"
TENANT_EMAIL="${DEMO_TENANT_EMAIL:-demo@eckko.ai}"
ADMIN_PW="${DEMO_ADMIN_PASSWORD:-$(read_cred "$ADMIN_EMAIL")}"
TENANT_PW="${DEMO_TENANT_PASSWORD:-$(read_cred "$TENANT_EMAIL")}"

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }

# ---------------------------------------------------------------- 1 ------
head_ "1. Containers"
for svc in traefik postgres backend frontend; do
  state=$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk -v s="$svc" '$1==s{print $2}')
  if [ "$state" = "running" ]; then ok "$svc no ar"; else bad "$svc não está no ar (estado: ${state:-ausente})"; fi
done

# ---------------------------------------------------------------- 2 ------
head_ "2. Ponto de entrada único — $ORIGIN"
c=$(code -H "Host: $BASE_DOMAIN" "$ORIGIN/")
[ "$c" = "200" ] && ok "landing responde 200" || bad "landing respondeu $c"

body=$(curl -s --max-time 15 -H "Host: $BASE_DOMAIN" "$ORIGIN/" 2>/dev/null)
echo "$body" | grep -qi "eckko" && ok "landing traz a marca" || bad "landing não traz a marca (bundle velho?)"

c=$(code -H "Host: $BASE_DOMAIN" "$ORIGIN/api/public/plans")
[ "$c" = "200" ] && ok "planos públicos respondem (pricing da landing)" || bad "GET /public/plans respondeu $c"

# ---------------------------------------------------------------- 3 ------
head_ "3. Os três caminhos de entrada"
c=$(code -H "Host: $BASE_DOMAIN" "$ORIGIN/signup")
[ "$c" = "200" ] && ok "caminho 1: cadastro (/signup)" || bad "/signup respondeu $c"

c=$(code -H "Host: ${TENANT_SLUG}.${BASE_DOMAIN}" "$ORIGIN/login")
[ "$c" = "200" ] && ok "caminho 2: login do tenant ($TENANT_SLUG)" || bad "login do tenant respondeu $c"

c=$(code -H "Host: $BASE_DOMAIN" "$ORIGIN/admin")
[ "$c" = "200" ] && ok "caminho 3: painel admin (/admin)" || bad "/admin respondeu $c"

# ---------------------------------------------------------------- 4 ------
head_ "4. Credenciais fixas"
if [ -z "${ADMIN_PW:-}" ] || [ -z "${TENANT_PW:-}" ]; then
  bad "não achei as senhas (DEV-ACCESS.local.md ausente e variáveis não definidas)"
else
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -c "$JAR" -H "Host: $BASE_DOMAIN" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PW\"}" "$ORIGIN/api/admin/login")
  if login_result "$c" "login de admin"; then
    c=$(code -b "$JAR" -H "Host: $BASE_DOMAIN" "$ORIGIN/api/admin/tenants")
    [ "$c" = "200" ] && ok "sessão de admin válida (lista de tenants)" || bad "sessão de admin não persistiu ($c)"
  fi

  rm -f "$JAR"; JAR="$(mktemp)"
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -c "$JAR" -H "Host: ${TENANT_SLUG}.${BASE_DOMAIN}" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$TENANT_EMAIL\",\"password\":\"$TENANT_PW\"}" "$ORIGIN/api/login")
  if login_result "$c" "login do tenant de demo"; then
    c=$(code -b "$JAR" -H "Host: ${TENANT_SLUG}.${BASE_DOMAIN}" "$ORIGIN/api/auth/me")
    [ "$c" = "200" ] && ok "sessão do tenant válida" || bad "sessão do tenant não persistiu ($c)"
    c=$(code -b "$JAR" -H "Host: ${TENANT_SLUG}.${BASE_DOMAIN}" "$ORIGIN/api/avatars")
    [ "$c" = "200" ] && ok "avatares acessíveis (passo 1 da demo)" || bad "GET /avatars respondeu $c"
  fi
fi

# ---------------------------------------------------------------- 5 ------
head_ "5. Pré-requisitos do fluxo de geração"
avatares=$(docker compose exec -T postgres psql -U twinai -d twinai -t -A -c \
  "SELECT count(*) FROM avatars a JOIN tenants t ON t.id=a.tenant_id WHERE t.slug='$TENANT_SLUG' AND a.provider_avatar_id IS NOT NULL AND a.voice_id IS NOT NULL;" 2>/dev/null | tr -d '\r ')
if [ "${avatares:-0}" -ge 1 ]; then ok "$avatares avatar(es) treinado(s) com voz clonada"; else bad "nenhum avatar pronto — a demo não tem de onde partir"; fi

creditos=$(docker compose exec -T postgres psql -U twinai -d twinai -t -A -c \
  "SELECT string_agg(credit_type||'='||balance, ' ') FROM tenant_credits c JOIN tenants t ON t.id=c.tenant_id WHERE t.slug='$TENANT_SLUG';" 2>/dev/null | tr -d '\r')
if echo "$creditos" | grep -q "video=0"; then bad "crédito de vídeo zerado ($creditos)"; else ok "créditos: ${creditos:-?}"; fi

for p in avatar voice script; do
  conectado=$(docker compose exec -T postgres psql -U twinai -d twinai -t -A -c \
    "SELECT connected FROM api_credentials c JOIN tenants t ON t.id=c.tenant_id WHERE t.slug='$TENANT_SLUG' AND c.provider='$p';" 2>/dev/null | tr -d '\r ')
  [ "$conectado" = "t" ] && ok "credencial de $p conectada" || bad "credencial de $p NÃO conectada"
done

# ---------------------------------------------------------------- 6 ------
head_ "6. Bundle do frontend atualizado"
# O Vite dentro do Compose às vezes serve bundle antigo via bind mount — o
# gotcha que já custou tempo em várias sessões. Compara um marcador do código
# em disco com o que o servidor entrega.
if grep -rq "alert-error" "$ROOT/frontend/src" 2>/dev/null; then
  servido=$(curl -s --max-time 15 -H "Host: $BASE_DOMAIN" "$ORIGIN/src/pages/CreateVideo/steps/ScriptStep.tsx" 2>/dev/null)
  if echo "$servido" | grep -q "alert-error"; then
    ok "bundle servido está atualizado"
  else
    bad "bundle DESATUALIZADO — rode: docker compose restart frontend"
  fi
fi

# ---------------------------------------------------------------- fim ----
printf '\n\033[1mResultado: %d ok, %d falha(s), %d aviso(s)\033[0m\n' "$PASS" "$FAIL" "$WARN"
echo "Nenhuma requisição a Gemini, ElevenLabs ou HeyGen foi feita."
[ "$WARN" -gt 0 ] && echo "Avisos não reprovam a demo — leia o que dizem."
echo "Este script consome 2 das 5 tentativas de login por 15 min: rode UMA vez."
[ "$FAIL" -eq 0 ] || exit 1
exit 0
