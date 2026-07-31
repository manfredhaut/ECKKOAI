# Setup e configuração

## Visão geral da infraestrutura

O app roda como 4 serviços via Docker Compose:

- **traefik** — proxy reverso; é o único ponto de entrada exposto no navegador
  (porta configurável via `TRAEFIK_HTTP_PORT`, padrão `8090`)
- **postgres** — banco de dados (Postgres 16 com a extensão `pgvector`)
- **backend** — API (Fastify/TypeScript)
- **frontend** — interface (React/Vite)

## Subindo o ambiente

```bash
cp .env.example .env
# preencher ENCRYPTION_KEY e SESSION_SECRET (comandos de geração estão
# comentados no próprio .env.example)
docker compose up
```

### Acesso local — domínio `.localhost`, sem precisar editar `/etc/hosts`

Desde a introdução de subdomínios por tenant, **`http://localhost:8090` (sem
sufixo) não mantém mais a sessão logada** (o cookie de sessão é compartilhado
entre o domínio raiz e os subdomínios via `Domain=.twinai.localhost`, e esse
cookie nunca é enviado para `localhost` puro). `BASE_DOMAIN` usa o sufixo
`.localhost` (`twinai.localhost` por padrão — ver
`backend/src/domainConfig.ts`) exatamente porque todo navegador moderno
resolve `*.localhost` para `127.0.0.1` nativamente — **não precisa mexer em
`/etc/hosts`** para o dev local funcionar.

A aplicação fica acessível em `http://twinai.localhost:8090` (domínio raiz —
login, cadastro) e `http://<slug-do-tenant>.twinai.localhost:8090` (app
autenticado de cada tenant), usando a porta de `TRAEFIK_HTTP_PORT`.

> Se por algum motivo `*.localhost` não resolver no seu ambiente (raro, mas
> possível em configurações de rede específicas), o fallback é o mesmo de
> qualquer domínio: adicionar entradas em `/etc/hosts`
> (`C:\Windows\System32\drivers\etc\hosts` no Windows, editando como
> administrador) apontando `twinai.localhost` e os subdomínios de teste para
> `127.0.0.1`.
>
> Em produção, o domínio real (quando decidido — hoje é só o mock
> `twinai.localhost`) depende de um **DNS wildcard real** (`*.dominio`)
> apontando para o mesmo Traefik — esse é um passo externo ainda pendente, não
> algo já configurado neste repositório. Veja `backend/src/domainConfig.ts`
> para o que precisa mudar quando o domínio real for decidido.

## Variáveis de ambiente principais

| Variável | Para que serve |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciais do banco |
| `BACKEND_PORT` | Porta interna da API |
| `ENCRYPTION_KEY` | Chave AES-256 (base64) usada para criptografar as chaves de API dos provedores (hoje gerenciadas via painel admin, não mais editáveis pelo tenant) |
| `SESSION_SECRET` | Assina o cookie de sessão |
| `FRONTEND_PORT` | Porta interna do Vite |
| `TRAEFIK_HTTP_PORT` | Porta exposta ao navegador |
| `BASE_DOMAIN` | Domínio base (mockado como `twinai.localhost` até o domínio real ser escolhido) — ver `backend/src/domainConfig.ts` |
| `DNS_PROVIDER` | Provedor de DNS que vai resolver o wildcard em produção (`pending` por enquanto) |

## Multi-tenant: como um tenant é criado

Só uma forma hoje: **cadastro público** (`/signup`, só email + senha) — cria
o tenant com um slug gerado automaticamente (a partir do email ou de um par
adjetivo-substantivo aleatório, com sufixo numérico em caso de colisão), o
subdomínio `<slug>.twinai.localhost`, o primeiro usuário (admin) e os 3
registros de credencial desconectados. Depois do cadastro, o navegador é
redirecionado para o subdomínio do tenant, na aba "Minha Assinatura", onde
dá para completar o nome da empresa e escolher um plano.

Não existe mais uma rota administrativa para criar tenant (o antigo
`POST /admin/tenants` protegido por `X-Admin-Token` foi removido — sem
caller vivo fora desta própria documentação, confirmado por grep no repo
inteiro). O painel admin (`/admin/login`, sessão própria em `admin_users`,
ver `routes/adminPanel.ts`) só **lista e edita** tenants já existentes
(credenciais de provedor, storage provider) — não cria tenant novo.

## Autenticação

Login é por email/senha, com sessão guardada em cookie (`httpOnly`,
`Domain=.twinai.localhost`, backing store no Postgres). O tenant é resolvido
pelo subdomínio do Host (`<slug>.twinai.localhost` → tenant daquele slug)
quando o acesso é por um subdomínio; no domínio raiz, o login busca o email
sem esse escopo (como antes de subdomínios existirem). Todas as telas do app
exigem sessão ativa.

## Chaves de API dos provedores

Só a equipe interna (via `/admin/login`) pode ler/editar as chaves de API dos
provedores de IA. Em **Configurações**, o tenant só vê o estado atual
(provedor, status), sem poder alterá-lo — ver
[screens/configuracoes.md](screens/configuracoes.md).
