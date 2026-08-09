# RELATÓRIO DE ESTADO — eckko.ai (TWINAI)

**Data:** 2026-08-08
**HEAD:** `c4d827e` · branch `master` · árvore limpa (`git status --short` vazio)
**Natureza:** levantamento por leitura de código. Nenhum arquivo do projeto foi alterado, nenhum serviço subiu, nenhuma chamada de rede a fornecedor foi feita.

---

## 1 · STACK

### Linguagem e framework

| Camada | O quê | Versão declarada | Onde |
|---|---|---|---|
| Backend | TypeScript, ESM (`"type": "module"`), Fastify | `fastify ^4.28.1`, `typescript ^5.5.3` | [backend/package.json](backend/package.json) |
| Runtime dev | `tsx` (sem build) | `tsx ^4.16.2` | [backend/package.json:8](backend/package.json:8) |
| Frontend | React + Vite + react-router + i18next | `react ^18.3.1`, `vite ^5.3.4`, `react-router-dom ^6.25.1`, `i18next ^23.12.2` | [frontend/package.json](frontend/package.json) |
| Banco | PostgreSQL 16 com `pgvector` (imagem `pgvector/pgvector:pg16`) | — | [docker-compose.yml:27](docker-compose.yml:27) |
| Proxy | Traefik v3.3, porta única do host **8090** | — | [docker-compose.yml:3](docker-compose.yml:3), [:10](docker-compose.yml:10) |

Dependências backend relevantes: `pg`, `stripe ^16.8.0`, `bcryptjs`, `@fastify/{cookie,cors,multipart,session,static}`, `mammoth`, `pdf-parse`, `xlsx`.
Frontend traz `@mediapipe/tasks-vision ^0.10.35` (fundo virtual na captura) — os `.wasm` correspondentes vivem em `frontend/public/mediapipe/`.

### Gerenciador de pacotes

**npm.** Há `package-lock.json` em `backend/` (2.356 linhas) e `frontend/` (1.918 linhas). O `package.json` da raiz **não é workspace** e não tem dependências — é só um conjunto de atalhos ([package.json:4](package.json:4)).

### Como sobe hoje

**Docker Compose**, quatro serviços: `traefik`, `postgres`, `backend`, `frontend`. Não há build de produção no caminho normal — o backend roda `tsx` e o frontend roda o dev server do Vite (healthcheck bate em `http://127.0.0.1:5173/`, [docker-compose.yml:206](docker-compose.yml:206)).

Atalhos da raiz ([package.json](package.json)): `npm run up` (`tools/up.sh`), `check`, `check:mutants`, `down`, `logs`, `seed-access`, `preflight:live`, `grant-credits`.

As migrações rodam **no boot do backend**, não por comando separado ([backend/src/index.ts:42](backend/src/index.ts:42)).

### docker-compose.yml (integral, valores de credencial redigidos)

Observação: o arquivo **não contém nenhum valor de credencial** — todos são interpolações `${VAR}` resolvidas a partir do `.env`. Nada precisou ser redigido; a redação a seguir é vazia por construção.

```yaml
services:
  traefik:
    image: traefik:v3.3
    # Único serviço exposto ao navegador: se ele cair e não voltar, o
    # endereço da demo simplesmente não existe, por mais que backend e
    # frontend estejam de pé. Era o único dos quatro sem política de
    # restart.
    restart: unless-stopped
    ports:
      - "${TRAEFIK_HTTP_PORT:-8090}:80"
    environment:
      BASE_DOMAIN: ${BASE_DOMAIN}
    volumes:
      - ./traefik/traefik.yml:/etc/traefik/traefik.yml:ro
      - ./traefik/dynamic.yml:/etc/traefik/dynamic.yml:ro
    # Comando da própria imagem, batendo no /ping habilitado em traefik.yml.
    healthcheck:
      test: ["CMD", "traefik", "healthcheck", "--ping"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 10s
    networks:
      - twinai

  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - twinai
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ./backend
    restart: unless-stopped
    environment:
      PORT: ${BACKEND_PORT}
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      SESSION_SECRET: ${SESSION_SECRET}
      BASE_DOMAIN: ${BASE_DOMAIN}
      # Modo dos provedores tarifados e as duas travas de gasto real.
      # Defaults seguros: sem nada no .env, o container sobe em simulação, sem
      # autorização para gastar e com teto de uma geração. Ver
      # services/providers/providerMode.ts e liveGuard.ts.
      #
      # PROVIDER_LIVE_CONFIRM fica VAZIO de propósito: em live o servidor não
      # sobe sem a frase exata, e é essa recusa que impede um .env copiado de
      # virar gasto acidental.
      PROVIDER_MODE: ${PROVIDER_MODE:-fixture}
      PROVIDER_LIVE_CONFIRM: ${PROVIDER_LIVE_CONFIRM:-}
      PROVIDER_LIVE_MAX_GENERATIONS: ${PROVIDER_LIVE_MAX_GENERATIONS:-1}
      # Teto DIÁRIO de gerações pagas (vídeos e trajes contam na mesma conta,
      # porque a carteira do fornecedor é uma só). Vazio = 5; zera à
      # meia-noite do servidor. Estava documentado no .env mas NÃO era
      # repassado ao container — preencher no .env não tinha efeito nenhum, e
      # o sintoma era "subi o limite e o sistema continua recusando em 5 de 5".
      # Ver services/billing/dailyGenerationLimit.ts.
      DAILY_PAID_GENERATION_LIMIT: ${DAILY_PAID_GENERATION_LIMIT:-5}
      # Teto de TENTATIVAS (qualquer desfecho). Vazio = 3× o de gasto. Existe
      # porque a falha passou a devolver o GASTO: sem um contador que não
      # volta, um caminho que falha sempre dispararia para sempre.
      PROVIDER_LIVE_MAX_ATTEMPTS: ${PROVIDER_LIVE_MAX_ATTEMPTS:-}
      # Teto das rotas de imagem (cenário, traje, fotos do rosto). Vazio = 25 MB.
      # Repassado aos DOIS serviços para que cliente e servidor concordem por
      # construção — o servidor continua sendo a autoridade.
      IMAGE_UPLOAD_MAX_BYTES: ${IMAGE_UPLOAD_MAX_BYTES:-}
      # As cinco chaves da plataforma. Só a primeira era repassada até aqui —
      # as outras estavam documentadas no .env.example e no CLAUDE.md, mas
      # nunca chegavam ao container: preenchê-las no .env não teria efeito
      # nenhum, e o sintoma seria "colei a chave e o copiloto continua caindo
      # na do cliente". Desde o bloco CHAVES-2 a origem preferida é o painel
      # admin (tabela platform_credentials); estas variáveis são a retaguarda.
      PLATFORM_COPILOT_API_KEY: ${PLATFORM_COPILOT_API_KEY:-}
      PLATFORM_GOOGLE_API_KEY: ${PLATFORM_GOOGLE_API_KEY:-}
      PLATFORM_EMBEDDING_API_KEY: ${PLATFORM_EMBEDDING_API_KEY:-}
      PLATFORM_HEYGEN_API_KEY: ${PLATFORM_HEYGEN_API_KEY:-}
      PLATFORM_ELEVENLABS_API_KEY: ${PLATFORM_ELEVENLABS_API_KEY:-}
      # Inverte a precedência: o .env volta a vencer o painel. Saída de
      # emergência para uma chave ruim gravada pela tela — ver
      # services/platformCredentialStore.ts.
      PLATFORM_KEYS_FORCE_ENV: ${PLATFORM_KEYS_FORCE_ENV:-}
      ANTHROPIC_MODEL: ${ANTHROPIC_MODEL:-}
      GEMINI_MODEL: ${GEMINI_MODEL:-}
      OPENAI_MODEL: ${OPENAI_MODEL:-}
      OPENAI_BASE_URL: ${OPENAI_BASE_URL:-}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-}
      STRIPE_PUBLISHABLE_KEY: ${STRIPE_PUBLISHABLE_KEY:-}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-}
      # Limiter de login: default = valor de produção (5 / 15 min). Só
      # afrouxe em desenvolvimento; npm run check reprova valor folgado com
      # NODE_ENV=production. Ver services/loginRateLimitPolicy.ts.
      LOGIN_RATE_LIMIT_MAX: ${LOGIN_RATE_LIMIT_MAX:-}
      LOGIN_RATE_LIMIT_WINDOW_MS: ${LOGIN_RATE_LIMIT_WINDOW_MS:-}
      # As seis que a varredura de 06/08 achou lidas pelo código e ausentes
      # daqui — a mesma família do DAILY_PAID_GENERATION_LIMIT logo acima.
      # DNS_PROVIDER não era hipótese: ela JÁ ESTAVA preenchida no .env e nunca
      # chegava ao container, então o valor escolhido não valia nada.
      #
      # O DEFAULT DE CADA UMA É O DEFAULT DO CÓDIGO, e a forma muda conforme a
      # leitura tolera string vazia ou não. `DOCS_DIR` e `UPLOADS_DIR` são lidas
      # com `?? "/app/…"`, e `??` NÃO cai para o default com string vazia — o
      # `${VAR:-}` das outras linhas apagaria o caminho e o container subiria
      # servindo de lugar nenhum. Por isso o default vai escrito. As de roteiro
      # e a de modelo de TTS usam `!raw`/`|| padrão`, que tratam vazio como
      # ausente, e podem ficar na forma curta.
      DNS_PROVIDER: ${DNS_PROVIDER:-pending}
      DOCS_DIR: ${DOCS_DIR:-/app/docs}
      UPLOADS_DIR: ${UPLOADS_DIR:-/app/uploads}
      ELEVENLABS_TTS_MODEL: ${ELEVENLABS_TTS_MODEL:-}
      SCRIPT_TARGET_SECONDS: ${SCRIPT_TARGET_SECONDS:-}
      SCRIPT_WORDS_PER_MINUTE: ${SCRIPT_WORDS_PER_MINUTE:-}
      SCRIPT_DURATION_TOLERANCE: ${SCRIPT_DURATION_TOLERANCE:-}
      # Contas fixas de desenvolvimento, consumidas por
      # `npm run dev:seed-access`. Sem default embutido no código: os valores
      # vivem só no .env (fora do git).
      DEV_ADMIN_EMAIL: ${DEV_ADMIN_EMAIL:-}
      DEV_ADMIN_PASSWORD: ${DEV_ADMIN_PASSWORD:-}
      DEV_TENANT_EMAIL: ${DEV_TENANT_EMAIL:-}
      DEV_TENANT_PASSWORD: ${DEV_TENANT_PASSWORD:-}
      DEV_TENANT_SLUG: ${DEV_TENANT_SLUG:-}
      DEV_AUTOFILL: ${DEV_AUTOFILL:-}
    volumes:
      - ./backend/src:/app/src
      - ./uploads:/app/uploads
      - ./docs:/app/docs:ro
      # Somente leitura, só para o gate de política (`npm run check`), que
      # roda dentro deste container e precisa inspecionar arquivos que vivem
      # fora dele: a definição do Compose e o fonte do frontend.
      # Montados um a um de propósito — montar a raiz do repo traria junto
      # .env e DEV-ACCESS.local.md, que não têm por que existir aqui dentro.
      - ./docker-compose.yml:/repo/docker-compose.yml:ro
      - ./backend/src:/repo/backend/src:ro
      - ./backend/scripts:/repo/backend/scripts:ro
      - ./frontend/src:/repo/frontend/src:ro
      # Os arquivos que a imagem do frontend COPIA e o compose NÃO monta — é
      # exatamente esse conjunto que pode divergir em silêncio entre o
      # repositório e a imagem em execução. O gate calcula o hash deles e o
      # compara com o carimbo gravado no build (ver frontend/image-stamp.mjs).
      - ./frontend/package.json:/repo/frontend/package.json:ro
      - ./frontend/tsconfig.json:/repo/frontend/tsconfig.json:ro
      - ./frontend/vite.config.ts:/repo/frontend/vite.config.ts:ro
      - ./frontend/Dockerfile:/repo/frontend/Dockerfile:ro
      - ./frontend/image-stamp.mjs:/repo/frontend/image-stamp.mjs:ro
      - ./tools:/repo/tools:ro
    depends_on:
      postgres:
        condition: service_healthy
    # Sobe só depois do Postgres aceitar conexão, porque as migrations rodam
    # no boot: sem isso, um start simultâneo faz o backend morrer na
    # primeira query e a política de restart vira laço de reinício.
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 20s
    networks:
      - twinai

  frontend:
    build:
      context: ./frontend
    restart: unless-stopped
    environment:
      VITE_PORT: ${FRONTEND_PORT}
      # The browser only ever reaches this app through Traefik's host port,
      # so the Vite HMR client must reconnect there (see vite.config.ts).
      TRAEFIK_HTTP_PORT: ${TRAEFIK_HTTP_PORT:-8090}
      BASE_DOMAIN: ${BASE_DOMAIN}
      WHATSAPP_NUMBER: ${WHATSAPP_NUMBER:-}
      REFERENCE_VIDEO_MAX_BYTES: ${REFERENCE_VIDEO_MAX_BYTES:-}
      MAX_RECORDING_SECONDS: ${MAX_RECORDING_SECONDS:-}
      IMAGE_UPLOAD_MAX_BYTES: ${IMAGE_UPLOAD_MAX_BYTES:-}
      # Preenchimento automático dos formulários de login em desenvolvimento.
      # Só tem efeito com DEV_AUTOFILL=1; os valores entram no bundle via
      # `define` do Vite (nunca literais no fonte) e npm run check reprova o
      # build se a flag estiver ligada com NODE_ENV=production.
      DEV_AUTOFILL: ${DEV_AUTOFILL:-}
      DEV_GALLERY: ${DEV_GALLERY:-}
      DEV_ADMIN_EMAIL: ${DEV_ADMIN_EMAIL:-}
      DEV_ADMIN_PASSWORD: ${DEV_ADMIN_PASSWORD:-}
      DEV_TENANT_EMAIL: ${DEV_TENANT_EMAIL:-}
      DEV_TENANT_PASSWORD: ${DEV_TENANT_PASSWORD:-}
      NODE_ENV: ${NODE_ENV:-development}
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/index.html:/app/index.html
      - ./frontend/public:/app/public
    depends_on:
      - backend
    # Vite dev server. `start_period` folgado porque a primeira subida
    # compila as dependências antes de aceitar conexão.
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:5173/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
    networks:
      - twinai

networks:
  twinai:

volumes:
  pgdata:
```

---

## 2 · ESTRUTURA

### Árvore até 2 níveis (excluindo `node_modules`, `.git`, `dist`, conteúdo de `uploads/`)

```
.
├── .claude/
├── .gallery-shots/
├── backend/
│   ├── fixtures/          (6 arquivos binários de simulação: 1 mp3 + 5 mp4)
│   ├── scripts/           (grantDevCredits.ts, seedDevAccess.ts)
│   └── src/
├── docs/                  (árvore que alimenta o copiloto)
│   ├── admin/
│   └── screens/
├── docs-internal/         (memória de engenharia, 8 arquivos)
├── frontend/
│   ├── public/            (brand/, mediapipe/ — assets binários .wasm)
│   └── src/
├── graphify-out/
│   └── cache/
├── previews/
│   ├── eckko-rebrand/
│   └── landing-acessos/
├── tools/
├── traefik/
└── uploads/               (artefatos e provas; ignorado pelo git)
```

`backend/src` (2º nível): `db/` (com `migrations/`), `middleware/`, `routes/`, `scripts/`, `services/` (com `avatar/`, `billing/`, `log/`, `providers/`, `script/`, `video/`, `voice/`), mais `app.ts`, `config.ts`, `domainConfig.ts`, `index.ts`, `plans.ts`, `types.ts`.

`frontend/src` (2º nível): `adminAuth/`, `adminCopilot/`, `api/`, `auth/`, `components/`, `copilot/`, `dev/`, `features/`, `locales/`, `pages/`, `styles/`, `theme/`, mais `App.tsx`, `main.tsx`, `i18n.ts`, `types.ts`, `devCredentials.ts`, `publicConfig.ts`, `uploadLimits.ts`.

### Contagem por diretório de primeiro nível

| Diretório | Arquivos | Linhas (texto) |
|---|---:|---:|
| `backend/` | 198 | 32.057 |
| `frontend/` | 95 | 41.216 * |
| `graphify-out/` | 43 | 34.685 |
| `docs-internal/` | 8 | 5.593 |
| `tools/` | 7 | 1.361 |
| `previews/` | 4 | 1.086 |
| `docs/` | 14 | 628 |
| `traefik/` | 2 | 112 |
| `.claude/` | 2 | 61 |

\* O total do `frontend/` é dominado por assets: `frontend/public/mediapipe/*.wasm` são arquivos binários de 58–65 mil "linhas" cada. **Código-fonte real do frontend: `frontend/src` = 12.587 linhas.**
Recorte equivalente no backend: `backend/src/**/*.ts` = **139 arquivos, 28.204 linhas**.

Detalhamento dentro de `backend/src`: 23 arquivos em `routes/`, 46 migrações em `db/migrations/`, 39 arquivos em `scripts/` (dos quais 29 são guardas `check*Policy.ts`).

---

## 3 · BANCO DE DADOS

**PostgreSQL 16** com extensão `pgvector` (imagem `pgvector/pgvector:pg16`, [docker-compose.yml:27](docker-compose.yml:27)).

### Sistema de migração

**Sim, próprio, sem biblioteca.** [backend/src/db/migrate.ts](backend/src/db/migrate.ts): cria `schema_migrations (name PK, applied_at)` ([migrate.ts:11](backend/src/db/migrate.ts:11)), lê os `.sql` de `db/migrations/` em ordem alfabética, pula os já aplicados, e aplica cada um **dentro de uma transação** com `INSERT` no registro ([migrate.ts:21-37](backend/src/db/migrate.ts:21)). Chamado no boot do processo ([index.ts:42](backend/src/index.ts:42)).

**46 arquivos de migração**, `001_avatars.sql` a `046_ledger_look_reference.sql`. **28 tabelas criadas** + `schema_migrations`.

### Tabelas (nome — propósito, uma linha)

| Tabela | Migração | Propósito |
|---|---|---|
| `avatars` | 001 | Avatar do tenant: id do fornecedor, `voice_id`, tratamento de áudio, status, engines suportados. |
| `videos` | 002 | Uma linha por geração pedida: roteiro, cena, formato, status, `provider_job_id`, `output_url`. |
| `api_credentials` | 003 | Chave BYOK do tenant por provedor/vendor, cifrada em repouso. |
| `tenants` | 004 | O locatário: slug, status, plano, dados de assinatura. |
| `users` | 004 | Usuário de um tenant (login do produto). |
| `sessions` | 004 | Sessões persistidas (store do `@fastify/session`). |
| `documents` | 007 | Documento enviado à base de conhecimento (RAG). |
| `document_chunks` | 007 | Pedaços vetorizados dos documentos (pgvector). |
| `reference_images` | 007 | Imagens de referência do tenant. |
| `notifications` | 008 | Avisos ao tenant (`video_ready`, `video_error`, …). |
| `copilot_conversations` | 009 | Conversas do copiloto do tenant. |
| `copilot_messages` | 009 | Mensagens dessas conversas. |
| `admin_users` | 018 | Identidade de administrador da plataforma, separada de `users`. |
| `audit_log` | 019 | Trilha de auditoria de ações de sistema e de admin. |
| `plans` | 020 | Catálogo de planos e limites. |
| `provider_cost_rates` | 022 | Tarifa por provedor/unidade, com marca de verificação (026). |
| `provider_usage` | 023 | **Ledger imutável de consumo:** uma linha por chamada tarifável, com tarifa congelada no instante da chamada. |
| `credit_ledger` | 024 | **Ledger imutável de crédito:** `delta`, `reason` (`purchase`/`consumption`/`manual_admin_adjustment`/`refund` via 035). |
| `script_generations` | 027 | Histórico de gerações de roteiro (limite por plano). |
| `avatar_trainings` | 027 | Histórico de treinos de avatar (limite por plano). |
| `tenant_credits` | 028 | **Saldo** por tenant e por tipo (`video`/`script`/`avatar`); a 043 acrescentou os baldes de ensaio. |
| `credit_packages` | 030 | Pacotes de crédito à venda. |
| `admin_copilot_conversations` | 031 | Conversas do copiloto do admin. |
| `admin_copilot_messages` | 031 | Mensagens dessas conversas. |
| `feature_flags` | 033 | Estado das flags (o catálogo do que existe vive no código). |
| `platform_credentials` | 034 | Chaves **da plataforma**, cifradas — tabela separada de `api_credentials` de propósito. |
| `video_variants` | 041 | Variantes de formato de um vídeo (master + derivadas), para separar geração cobrada de derivação gratuita. |
| `avatar_looks` | 044 | Trajes (looks) criados aqui, ao lado dos que o fornecedor já tem; status na 045. |

### Existe tabela de job/task/fila?

**NÃO EXISTE.** Nenhuma tabela de fila, de job ou de task. O que existe é a **coluna `status` de `videos`** (`queued`/`processing`/`ready`/`error`) e a de `documents`, lidas pela rota `GET /jobs/processing` ([backend/src/routes/jobs.ts:13-55](backend/src/routes/jobs.ts:13)) — que é uma **consulta de leitura**, não um consumidor de fila.

### Existe tabela de tenant/organização?

**Sim:** `tenants` ([004_tenants_users_sessions.sql:1](backend/src/db/migrations/004_tenants_users_sessions.sql:1)), com `slug` (011), campos de assinatura (012), cobrança (021).

### Existe tabela de crédito, saldo ou cobrança?

**Sim, quatro:**
- `tenant_credits` — o saldo em vigor ([028_tenant_credits.sql:9](backend/src/db/migrations/028_tenant_credits.sql:9)); a 043 acrescentou os baldes `_rehearsal` para o modo `fixture`.
- `credit_ledger` — cada movimento ([024_credit_ledger.sql:5](backend/src/db/migrations/024_credit_ledger.sql:5)).
- `provider_usage` — o consumo medido junto ao fornecedor ([023_provider_usage.sql:5](backend/src/db/migrations/023_provider_usage.sql:5)).
- `provider_cost_rates` / `credit_packages` — tarifas e pacotes.

---

## 4 · MULTI-TENANT

### Existe isolamento por tenant?

**Sim, por COLUNA `tenant_id`**, banco único e schema único. Não há schema por tenant nem banco separado. Toda tabela de dados do cliente carrega `tenant_id` com `REFERENCES tenants(id) ON DELETE CASCADE` (ex.: [023_provider_usage.sql:7](backend/src/db/migrations/023_provider_usage.sql:7)).

**Não há Row Level Security no Postgres** — o isolamento é aplicado no `WHERE` de cada consulta. Exemplos: `WHERE v.tenant_id = $1` ([routes/videos.ts:411](backend/src/routes/videos.ts:411)), `WHERE id = $1 AND tenant_id = $2` ([videos.ts:504](backend/src/routes/videos.ts:504), [:582](backend/src/routes/videos.ts:582), [:597](backend/src/routes/videos.ts:597), [:741](backend/src/routes/videos.ts:741)).

### Onde está a checagem de autorização

Três camadas, todas em `backend/src/middleware/`:

1. **`requireAuth`** — [middleware/requireAuth.ts:14-23](backend/src/middleware/requireAuth.ts:14). Exige `session.userId` **e** `session.tenantId`; sem isso, 401. É ele que fixa `req.tenantId` ([:22](backend/src/middleware/requireAuth.ts:22)) — o tenant vem **da sessão**, nunca do corpo ou da query. Registrado como `preHandler` de um bloco encapsulado que envolve 14 conjuntos de rotas ([app.ts:78-94](backend/src/app.ts:78)).
2. **`requireActiveTenant`** — [middleware/requireActiveTenant.ts:10-20](backend/src/middleware/requireActiveTenant.ts:10). Consulta `tenants.status` e devolve 403 `tenant_suspended`. Aplicado **só nas rotas de consumo**, não no bloco inteiro; em vídeo, em [routes/videos.ts:659](backend/src/routes/videos.ts:659).
3. **`requireAdmin`** — [middleware/requireAdmin.ts:15-20](backend/src/middleware/requireAdmin.ts:15). Exige `session.adminUserId`, campo **distinto** do de tenant: uma sessão de tenant nunca vira sessão de admin. Bloco próprio em [app.ts:98-103](backend/src/app.ts:98).

Há ainda **`resolveTenantFromHost`** ([middleware/resolveTenantFromHost.ts:15-25](backend/src/middleware/resolveTenantFromHost.ts:15)), hook global ([app.ts:65](backend/src/app.ts:65)), que resolve `req.hostTenantId` a partir do subdomínio. **Ele não autoriza nada** — é informativo; a autorização usa `req.tenantId`, que vem da sessão.

O cookie de sessão é `httpOnly`, `sameSite: "lax"`, `secure: false`, `maxAge` 24 h, com `domain: .${BASE_DOMAIN}` ([app.ts:48-63](backend/src/app.ts:48)).

---

## 5 · FILA E ASSINCRONISMO

### Existe fila?

**NÃO EXISTE.** Sem Redis, sem BullMQ, sem Celery, sem cron. Não há dependência de fila em [backend/package.json](backend/package.json).

### Existe worker separado?

**NÃO EXISTE.** Um só processo (`backend`), que serve HTTP e roda o polling na mesma memória.

O que existe no lugar:
- **Polling em `setInterval` dentro do processo web** — [routes/videos.ts:41-248](backend/src/routes/videos.ts:41), disparado pela própria rota de criação em [videos.ts:866](backend/src/routes/videos.ts:866). Intervalo 5 s, máximo 90 tentativas (~7,5 min): [videos.ts:38-39](backend/src/routes/videos.ts:38).
- **Um agendador de concessão mensal**, também `setInterval`, a cada 24 h — [index.ts:9](backend/src/index.ts:9), [:18-34](backend/src/index.ts:18).
- **Espera de avatar pronto**, laço com `await sleep` — [avatarProvider.ts:866-885](backend/src/services/providers/avatarProvider.ts:866), teto de 90 s e intervalo de 5 s ([:850-851](backend/src/services/providers/avatarProvider.ts:850)).

### Existe retry?

**NÃO EXISTE** retry automático de chamada a fornecedor. Nenhum backoff, nenhuma tentativa repetida: a busca por `retry|retries|backoff` em `services/` e `routes/` só encontra o header `retry-after` na allowlist de log ([vendorResponseLog.ts:32](backend/src/services/providers/vendorResponseLog.ts:32)) e um comentário em [routes/avatars.ts:358](backend/src/routes/avatars.ts:358). O que existe é o **teto de tentativas** `PROVIDER_LIVE_MAX_ATTEMPTS` ([liveGuard.ts:44](backend/src/services/providers/liveGuard.ts:44)), que limita, não repete.

### Existe idempotência?

**Sim, em dois pontos:**
- **Perante o fornecedor:** header `Idempotency-Key` em `POST /v3/videos`, derivado do **conteúdo da tentativa** (tenant, avatar/look, roteiro, cena, formato, motor, `fit`) — [avatarProvider.ts:421-445](backend/src/services/providers/avatarProvider.ts:421), aplicado em [heygenVideoRequestHeaders():455-467](backend/src/services/providers/avatarProvider.ts:455). O `audio_asset_id` fica de fora de propósito ([:414-419](backend/src/services/providers/avatarProvider.ts:414)).
- **Interna:** a concessão mensal é idempotente por tenant/tipo/mês ([index.ts:15-17](backend/src/index.ts:15)); o estorno tem chave de idempotência no ledger (migração 046, referida em [checkOutfitPolicy.ts:157](backend/src/scripts/checkOutfitPolicy.ts:157)); a compra de crédito é chaveada pelo `payment_intent` do Stripe ([stripeWebhook.ts:76-81](backend/src/routes/stripeWebhook.ts:76)).

### Se um processo morrer no meio de um trabalho, ele é retomado?

**NÃO.** O `setInterval` de polling vive só na memória do processo ([videos.ts:52](backend/src/routes/videos.ts:52)) e **nada o retoma no boot** — `index.ts` chama migrações, `buildApp()` e o agendador de crédito, e mais nada ([index.ts:36-47](backend/src/index.ts:36)); `pollJob` só é invocado pela rota de criação ([videos.ts:866](backend/src/routes/videos.ts:866)). Morto o processo, a linha de `videos` fica em `queued`/`processing` indefinidamente, sem estorno — o débito ocorre em [videos.ts:797](backend/src/routes/videos.ts:797) e o estorno só vale antes do aceite do fornecedor ([videos.ts:883](backend/src/routes/videos.ts:883), comentário em [:876-882](backend/src/routes/videos.ts:876)).

---

## 6 · WEBHOOK

**Existe uma, e só uma:** `POST /subscription/stripe/webhook` — [routes/stripeWebhook.ts:102](backend/src/routes/stripeWebhook.ts:102).

- **Registrada fora do bloco autenticado**, em contexto de encapsulamento próprio ([app.ts:75](backend/src/app.ts:75)), porque sobrescreve o parser de conteúdo para receber o corpo bruto ([stripeWebhook.ts:98-100](backend/src/routes/stripeWebhook.ts:98)).
- **Verificação de assinatura: SIM.** Exige o header `stripe-signature` ([:107-110](backend/src/routes/stripeWebhook.ts:107)) e chama `stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret)` ([:115](backend/src/routes/stripeWebhook.ts:115)); falha devolve 400 `invalid_signature` ([:118](backend/src/routes/stripeWebhook.ts:118)). Sem `STRIPE_WEBHOOK_SECRET` configurado, devolve 400 `stripe_not_configured` ([:103-105](backend/src/routes/stripeWebhook.ts:103)).
- Eventos tratados: `checkout.session.completed` (assinatura e compra de crédito, distinguidos por `metadata.type`), `customer.subscription.created/updated/deleted` ([:121-194](backend/src/routes/stripeWebhook.ts:121)).

**Webhook de fornecedor de vídeo ou de voz: NÃO EXISTE.** HeyGen e ElevenLabs não têm rota de callback neste projeto — o desfecho da geração é descoberto por polling (seção 5).

---

## 7 · ARMAZENAMENTO

### Onde os arquivos são gravados hoje — caminho exato

**Disco local do container backend**, em `${UPLOADS_DIR}/<tenant_id>/<uuid><extensão>`:
- Escrita: [storageProvider.ts:12-18](backend/src/services/providers/storageProvider.ts:12) — `path.join(config.uploadsDir, tenantId)`, nome `${randomUUID()}${path.extname(originalName)}`, e devolve a URL pública `/uploads/<tenantId>/<arquivo>`.
- `config.uploadsDir` = `process.env.UPLOADS_DIR ?? "/app/uploads"` ([config.ts:33](backend/src/config.ts:33)).
- Montado do host: `./uploads:/app/uploads` ([docker-compose.yml:136](docker-compose.yml:136)). Ou seja, **no host o caminho é `TWINAI/uploads/<tenant_id>/`**.
- Servido estaticamente por `@fastify/static` com prefixo `/uploads/` ([app.ts:42-45](backend/src/app.ts:42)).
- O mp4 entregue pelo fornecedor é **copiado para cá** antes de o vídeo virar `ready` ([videos.ts:107](backend/src/routes/videos.ts:107) → [downloadProxy.ts:118-138](backend/src/services/downloadProxy.ts:118) → `saveUpload`).

### S3, R2, MinIO ou similar?

**NÃO EXISTE.** Há a *forma* de um provedor plugável — `StorageProvider` com dois ids, `drive` e `platform_hosted` ([storageProvider.ts:6-10](backend/src/services/providers/storageProvider.ts:6)) — mas **as duas implementações são o mesmo `saveToLocalDisk`** ([:27-35](backend/src/services/providers/storageProvider.ts:27)), com TODO explícito para Google Drive e para S3/R2. Nenhuma dependência de SDK de objeto está instalada; a única menção a `@aws-sdk` no repositório é uma regra da guarda de egresso ([checkNetworkEgressPolicy.ts:110](backend/src/scripts/checkNetworkEgressPolicy.ts:110)). `readUpload` lê direto do disco ([services/storage.ts:24-27](backend/src/services/storage.ts:24)).

### URL assinada com TTL?

**NÃO EXISTE.** Não há geração de URL assinada em lugar nenhum. Os arquivos em `/uploads/` são servidos por caminho estático, protegido apenas por não ser adivinhável (UUID). O download de vídeo passa por rota autenticada que faz proxy do artefato ([videos.ts:594-624](backend/src/routes/videos.ts:594)), mas o arquivo em si continua alcançável pela URL estática.

---

## 8 · FORNECEDORES INTEGRADOS

Todo endpoint alcançado está declarado em [services/providers/endpointCatalog.ts:54-190](backend/src/services/providers/endpointCatalog.ts:54), que é a fonte de onde deriva o freio de gasto ([:186-190](backend/src/services/providers/endpointCatalog.ts:186)).

| Fornecedor | Arquivo | Endpoints chamados | Estado no fluxo atual |
|---|---|---|---|
| **HeyGen** (vídeo/avatar) | [avatarProvider.ts](backend/src/services/providers/avatarProvider.ts), base `https://api.heygen.com` ([:275](backend/src/services/providers/avatarProvider.ts:275)) | `POST /v3/assets` ([:283](backend/src/services/providers/avatarProvider.ts:283)) · `POST /v3/avatars` ([:305](backend/src/services/providers/avatarProvider.ts:305), [:1004](backend/src/services/providers/avatarProvider.ts:1004)) · `GET /v3/avatars/{id}` ([:358](backend/src/services/providers/avatarProvider.ts:358)) · `POST /v3/videos` ([:631](backend/src/services/providers/avatarProvider.ts:631)) · `GET /v3/videos/{id}` ([:657](backend/src/services/providers/avatarProvider.ts:657)) · `GET /v2/user/remaining_quota` ([:701](backend/src/services/providers/avatarProvider.ts:701)) · `GET /v3/avatars/looks/{id}` ([:1081](backend/src/services/providers/avatarProvider.ts:1081), [:1131](backend/src/services/providers/avatarProvider.ts:1131)) | **ATIVO** — é o caminho de geração |
| **ElevenLabs** (voz) | [voiceProvider.ts](backend/src/services/providers/voiceProvider.ts) | `POST /v1/voices/add` ([:14](backend/src/services/providers/voiceProvider.ts:14)) · `GET /v1/voices` ([:15](backend/src/services/providers/voiceProvider.ts:15)) · `POST /v1/text-to-speech/{voice}` e `/with-timestamps` ([:228](backend/src/services/providers/voiceProvider.ts:228)) · `GET /v1/user/subscription` (catalogado, exige `user_read`) | **ATIVO** — clonagem e síntese |
| **D-ID** (vídeo, alternativa) | [avatarProvider.ts](backend/src/services/providers/avatarProvider.ts), base `https://api.d-id.com` ([:717](backend/src/services/providers/avatarProvider.ts:717)) | `POST /images` e `POST /audios` ([:733](backend/src/services/providers/avatarProvider.ts:733)) · `POST /talks` ([:763](backend/src/services/providers/avatarProvider.ts:763)) · `GET /talks/{id}` ([:790](backend/src/services/providers/avatarProvider.ts:790)) · `GET /credits` ([:823](backend/src/services/providers/avatarProvider.ts:823)) | **CÓDIGO VIVO, SEM USO REAL** — só é alcançado se a credencial do tenant declarar `vendor = "did"`; o catálogo registra "custo NÃO medido — nenhuma resposta real observada" ([endpointCatalog.ts:112](backend/src/services/providers/endpointCatalog.ts:112)) |
| **Anthropic** (texto) | [providerRegistry.ts:62](backend/src/services/providers/providerRegistry.ts:62) | `POST /v1/messages` | **ATIVO** — copiloto público e do admin |
| **Google Gemini** (texto) | [providerRegistry.ts:104](backend/src/services/providers/providerRegistry.ts:104) | `POST …:generateContent` · `GET /v1beta/models` (validação de chave) | **ATIVO** — roteiro e copiloto do tenant |
| **Google Gemini** (embeddings) | [embeddingProvider.ts](backend/src/services/providers/embeddingProvider.ts) | `gemini-embedding-001`, dimensão 1536 ([:7](backend/src/services/providers/embeddingProvider.ts:7)) | **BLOQUEADO** — depende de chave de embedding não provisionada (registrado no CLAUDE.md) |
| **OpenAI** (texto, adaptador genérico) | [providerRegistry.ts:64](backend/src/services/providers/providerRegistry.ts:64), base sobrescrevível por `OPENAI_BASE_URL` | `POST /chat/completions` | **MORTO** — o catálogo declara: "Nenhuma chave OpenAI foi usada neste projeto até hoje" ([endpointCatalog.ts:188](backend/src/services/providers/endpointCatalog.ts:188)) |
| **Stripe** (pagamento) | [services/billing/stripeClient.ts](backend/src/services/billing/stripeClient.ts), SDK oficial | Checkout e webhook | **PARCIAL** — o código existe e a verificação de assinatura funciona; degrada para `stripe_not_configured` sem as chaves ([config.ts:85-89](backend/src/config.ts:85)) |
| **Probes de validação de chave** | [platformKeyProbe.ts:25-29](backend/src/services/providers/platformKeyProbe.ts:25) | Gemini `/v1beta/models` · Anthropic `/v1/models` · HeyGen `/v2/user/remaining_quota` · ElevenLabs `/v1/voices` | **ATIVO** — só leitura, barrado de tocar endpoint tarifável |

Modo simulado: [fixtureProvider.ts](backend/src/services/providers/fixtureProvider.ts) intercepta todos os caminhos tarifados quando `PROVIDER_MODE=fixture`, servindo os 6 arquivos de `backend/fixtures/`.

---

## 9 · CREDENCIAIS

### Nomes das variáveis de ambiente esperadas

Nenhum valor foi lido. A lista sai de três fontes de **nomes**: o `docker-compose.yml`, as leituras `process.env.X` e os helpers `required("X")`/`optional("X")` do código.

**Infraestrutura e sessão**
`POSTGRES_USER` · `POSTGRES_PASSWORD` · `POSTGRES_DB` · `DATABASE_URL` · `PORT` · `BACKEND_PORT` · `FRONTEND_PORT` · `TRAEFIK_HTTP_PORT` · `BASE_DOMAIN` · `DNS_PROVIDER` · `NODE_ENV` · `ENCRYPTION_KEY` · `SESSION_SECRET`

**Modo de provedor e travas de gasto**
`PROVIDER_MODE` · `PROVIDER_LIVE_CONFIRM` · `PROVIDER_LIVE_MAX_GENERATIONS` · `PROVIDER_LIVE_MAX_ATTEMPTS` · `DAILY_PAID_GENERATION_LIMIT`

**Chaves de plataforma**
`PLATFORM_COPILOT_API_KEY` · `PLATFORM_GOOGLE_API_KEY` · `PLATFORM_EMBEDDING_API_KEY` · `PLATFORM_HEYGEN_API_KEY` · `PLATFORM_ELEVENLABS_API_KEY` · `PLATFORM_KEYS_FORCE_ENV`

**Modelos e endpoints de IA**
`ANTHROPIC_MODEL` · `GEMINI_MODEL` · `OPENAI_MODEL` · `OPENAI_BASE_URL` · `ELEVENLABS_TTS_MODEL` · `ELEVENLABS_TTS_MODEL_V2`

**Stripe**
`STRIPE_SECRET_KEY` · `STRIPE_PUBLISHABLE_KEY` · `STRIPE_WEBHOOK_SECRET`

**Limites e caminhos**
`UPLOADS_DIR` · `DOCS_DIR` · `IMAGE_UPLOAD_MAX_BYTES` · `REFERENCE_VIDEO_MAX_BYTES` · `MAX_RECORDING_SECONDS` · `LOGIN_RATE_LIMIT_MAX` · `LOGIN_RATE_LIMIT_WINDOW_MS` · `SCRIPT_TARGET_SECONDS` · `SCRIPT_WORDS_PER_MINUTE` · `SCRIPT_DURATION_TOLERANCE`

**Desenvolvimento e diversos**
`DEV_ADMIN_EMAIL` · `DEV_ADMIN_PASSWORD` · `DEV_TENANT_EMAIL` · `DEV_TENANT_PASSWORD` · `DEV_TENANT_SLUG` · `DEV_AUTOFILL` · `DEV_GALLERY` · `WHATSAPP_NUMBER` · `QUOTA_BASELINE_TENANT` · `REPO_ROOT`

### Onde são lidas

- **Ponto único do backend:** [backend/src/config.ts:21-90](backend/src/config.ts:21), com `required()` ([:4-10](backend/src/config.ts:4)) que lança se faltar e `optional()` ([:16-19](backend/src/config.ts:16)) que trata string vazia como ausente.
- **Fora do `config`:** o modo e as travas em [providerMode.ts:26](backend/src/services/providers/providerMode.ts:26) e [liveGuard.ts:42-44](backend/src/services/providers/liveGuard.ts:42); o teto diário em [dailyGenerationLimit.ts:31](backend/src/services/billing/dailyGenerationLimit.ts:31); limites de upload em [uploadLimits.ts:34](backend/src/services/uploadLimits.ts:34); limiter de login em [loginRateLimitPolicy.ts](backend/src/services/loginRateLimitPolicy.ts).

### Como são guardadas

Três lugares, com finalidades distintas:

1. **Arquivo `.env` do host** → injetado no container pelo `docker-compose.yml`. É a retaguarda.
2. **Banco, cifrado em repouso:** `api_credentials` (chave BYOK do tenant) e `platform_credentials` (chaves da plataforma). Cifra **AES-256-GCM** com `ENCRYPTION_KEY` em base64 de 32 bytes; formato `base64(iv):base64(authTag):base64(ciphertext)` ([services/crypto.ts:4-31](backend/src/services/crypto.ts:4)). **Não há cofre externo** (Vault, KMS, Secrets Manager) — NÃO EXISTE.
3. **Memória do processo:** `config` é montado uma vez no boot. Precedência declarada: por padrão o **banco vence o `.env`**, e `PLATFORM_KEYS_FORCE_ENV=1` inverte ([config.ts:60-65](backend/src/config.ts:60)).

### Alguma aparece no front-end?

- **Chave de fornecedor: NÃO.** O front tem campos de entrada de chave nos painéis ([AdminApisPanel.tsx:120](frontend/src/pages/AdminPanel/AdminApisPanel.tsx:120), [AdminPlatformKeysSection.tsx:25](frontend/src/pages/AdminPanel/AdminPlatformKeysSection.tsx:25)) — o valor digitado sobe para o backend e **o que volta é mascarado**: `maskKey(...).slice(-8)` ([routes/credentials.ts:22](backend/src/routes/credentials.ts:22), [crypto.ts:33-36](backend/src/services/crypto.ts:33)); para as chaves de plataforma, só os 4 últimos caracteres ([platformCredentials.ts:134](backend/src/services/platformCredentials.ts:134)).
- **Senhas de desenvolvimento: SIM, condicionalmente.** `__DEV_ADMIN_PASSWORD__` e `__DEV_TENANT_PASSWORD__` entram no bundle via `define` do Vite ([frontend/src/devCredentials.ts:23-27](frontend/src/devCredentials.ts:23)). O próprio arquivo declara as três regras que o governam: nenhum literal no fonte, falha fechada sem `DEV_AUTOFILL=1`, e `npm run check` reprova o build com a flag ligada em `NODE_ENV=production` ([devCredentials.ts:1-21](frontend/src/devCredentials.ts:1)). O compose repassa essas variáveis ao serviço `frontend` ([docker-compose.yml:192-195](docker-compose.yml:192)).

### Alguma vai para log?

Há **duas camadas de redação**, e o desenho é explicitamente de defesa em profundidade:
- **No sumidouro:** [services/log/safeLog.ts](backend/src/services/log/safeLog.ts) — nenhum evento sai do processo sem passar por ele, e a redação é **por FORMA** (padrões `sk-…`, `AIza…`, `AQ.…`, `xi-…`, `hg_…`, JWT, `Bearer …`, hex/base64 longos), não por nome de campo ([safeLog.ts:1-50](backend/src/services/log/safeLog.ts:1)).
- **No registro de resposta de fornecedor:** [vendorResponseLog.ts](backend/src/services/providers/vendorResponseLog.ts) — allowlist de headers ([:24](backend/src/services/providers/vendorResponseLog.ts:24)), máscara por nome de campo ([:44-46](backend/src/services/providers/vendorResponseLog.ts:44)), elisão de campos volumosos de áudio ([:62](backend/src/services/providers/vendorResponseLog.ts:62)) e teto de 2048 bytes por campo ([:84](backend/src/services/providers/vendorResponseLog.ts:84)).

O arquivo registra que houve **um vazamento medido** (bloco PREVOO-1) que originou a camada do sumidouro. Que a proteção atual seja completa é afirmação das guardas, não deste levantamento.

---

## 10 · CONSTANTES DE VÍDEO

### `MEASURED_RESOLUTION`

- **Valor:** `"720p"` — `const MEASURED_RESOLUTION: VideoResolution = "720p"` ([videoFormat.ts:54](backend/src/services/providers/videoFormat.ts:54)).
- **Natureza:** constante fixa, **não** variável de configuração — não é lida de ambiente nem de banco.
- **Consumidores:** 3, todos no mesmo arquivo — as três entradas de `PUBLISH_PLATFORMS` ([videoFormat.ts:72](backend/src/services/providers/videoFormat.ts:72), [:73](backend/src/services/providers/videoFormat.ts:73), [:87](backend/src/services/providers/videoFormat.ts:87)). Não é exportada; o resto do sistema a alcança pelo campo `resolution` do formato resolvido.

### Demais constantes de resolução, proporção, duração e fps

| Constante | Valor | Arquivo | Consumidores | Fixa ou configurável |
|---|---|---|---|---|
| `HEYGEN_ASPECT_RATIOS` | `["16:9","9:16","4:5","1:1"]` | [videoFormat.ts:32](backend/src/services/providers/videoFormat.ts:32) | tipo `AspectRatio` (usado em todo o caminho de vídeo), fixtures por proporção | fixa |
| `HEYGEN_RESOLUTIONS` | `["720p","1080p","4k"]` | [videoFormat.ts:38](backend/src/services/providers/videoFormat.ts:38) | tipo `VideoResolution` | fixa |
| `PUBLISH_PLATFORMS` | 3 entradas: `youtube` 16:9, `reels_tiktok` 9:16, `linkedin` 1:1 (**4:5 retirado**) | [videoFormat.ts:71-88](backend/src/services/providers/videoFormat.ts:71) | `resolveVideoFormat`, `isPublishPlatform`, e o espelho `frontend/src/pages/CreateVideo/publishPlatforms.ts` | fixa (o gate reprova se os dois lados divergirem) |
| `DEFAULT_PUBLISH_PLATFORM` | `"youtube"` | [videoFormat.ts:99](backend/src/services/providers/videoFormat.ts:99) | `resolveVideoFormat` | fixa |
| `MASTER_ASPECT_RATIO` | `"9:16"` | [formatDerivation.ts:338](backend/src/services/providers/formatDerivation.ts:338) | cadeia de derivação (sem chamador de produto — ver seção 11) | fixa |
| `RESOLUTION_SHORT_EDGE` | mapa resolução → lado curto em px | [formatDerivation.ts:131](backend/src/services/providers/formatDerivation.ts:131) | cadeia de derivação | fixa |
| `DELIVERY_SHORT_EDGE` | `1080` | [deriveVariants.ts:48](backend/src/services/video/deriveVariants.ts:48) | `deriveVariantsForVideo` | fixa |
| `HEYGEN_FIT` | `"cover"` | [avatarProvider.ts:395](backend/src/services/providers/avatarProvider.ts:395) | payload de `POST /v3/videos` e a chave de idempotência | fixa |
| `HEYGEN_ENGINES` / `DEFAULT_ENGINE` / `ENGINE_PREFERENCE` | `["avatar_v","avatar_iv","avatar_iii"]` / `"avatar_iv"` / `["avatar_iv","avatar_iii"]` | [videoEngine.ts:30](backend/src/services/providers/videoEngine.ts:30), [:45](backend/src/services/providers/videoEngine.ts:45), [:42](backend/src/services/providers/videoEngine.ts:42) | montagem do payload, validação de `engine_choice` | fixa |
| `SCRIPT_PACING` | `{ measuredChars: 474, measuredDeliveredSeconds: 36.9876, measuredOn: "2026-08-05" }` | [scriptDuration.ts:63-72](backend/src/services/video/scriptDuration.ts:63) | `CHARS_PER_SECOND`, `scriptDurationBasis()` | fixa (medição registrada) |
| `CHARS_PER_SECOND` | **derivada:** `474 / 36,9876` ≈ 12,8151 | [scriptDuration.ts:78](backend/src/services/video/scriptDuration.ts:78) | `estimateSecondsFromScript` / `estimateSecondsFromChars`, consumidos em `routes/videos.ts` em 4 pontos ([:316](backend/src/routes/videos.ts:316), [:356](backend/src/routes/videos.ts:356), [:520](backend/src/routes/videos.ts:520), [:690](backend/src/routes/videos.ts:690)) | fixa, e **derivada de propósito** — não digitada |
| `CONFIRM_ABOVE_SECONDS` | `60` | [scriptDuration.ts:94](backend/src/services/video/scriptDuration.ts:94) | `requiresLongVideoConfirmation`, e viaja nas duas rotas de custo ([videos.ts:369](backend/src/routes/videos.ts:369), [:558](backend/src/routes/videos.ts:558)) | fixa |
| `CONFIRM_MARGIN` | `1.1` | [scriptDuration.ts:110](backend/src/services/video/scriptDuration.ts:110) | `requiresLongVideoConfirmation` | fixa |
| `POLL_INTERVAL_MS` / `MAX_POLL_ATTEMPTS` | `5000` / `90` (~7,5 min) | [routes/videos.ts:38-39](backend/src/routes/videos.ts:38) | `pollJob` | fixa |
| `AVATAR_READY_TIMEOUT_MS` / `AVATAR_READY_INTERVAL_MS` | `90_000` / `5_000` | [avatarProvider.ts:850-851](backend/src/services/providers/avatarProvider.ts:850) | `waitForAvatarReady` | fixa |
| `FIXTURE_VIDEO_DURATION_SECONDS` / `FIXTURE_AUDIO_DURATION_SECONDS` | `5` / `3` | [fixtureProvider.ts:184-185](backend/src/services/providers/fixtureProvider.ts:184) | modo simulado | fixa |
| `FIXTURE_VIDEO_DIMENSIONS` | mapa proporção → `{width,height}` | [fixtureProvider.ts:165](backend/src/services/providers/fixtureProvider.ts:165) | modo simulado | fixa |
| `SIMULATED_JOB_DURATION_MS` / `SIMULATED_LOOK_DURATION_MS` | `12_000` / `8_000` | [fixtureProvider.ts:110](backend/src/services/providers/fixtureProvider.ts:110), [:72](backend/src/services/providers/fixtureProvider.ts:72) | modo simulado | fixa |
| `VOICE_SAMPLE_MAX_BYTES` / `MAX_SAMPLE_SECONDS` | `10 MiB` / **derivado** por `maxSampleSecondsFor(10 MiB)` | [voiceSample.ts:80](backend/src/services/voice/voiceSample.ts:80), [:104](backend/src/services/voice/voiceSample.ts:104) | recusa por duração ([:466](backend/src/services/voice/voiceSample.ts:466)) e o texto da política de amostra | fixa, derivada |
| `TIMEOUT_MS` (ffmpeg) | `10 * 60 * 1000` | [video/ffmpeg.ts:23](backend/src/services/video/ffmpeg.ts:23) | processamento local de mídia | fixa |
| Sondagem de preenchimento | `UNIFORM_STDDEV_MAX 2.0`, `UNIFORM_BETWEEN_LINES_MAX 3.0`, `SAMPLE_POSITIONS [0.15,0.5,0.85]`, `FRAME_AGREEMENT_TOLERANCE 2` | [paddingProbe.ts:50-68](backend/src/services/video/paddingProbe.ts:50) | `paddingProbe` | fixas |

**Constante de fps: NÃO EXISTE.** A única menção a fps no backend é o comentário em [formatDerivation.ts:268](backend/src/services/providers/formatDerivation.ts:268) declarando que o fps **não é tocado** na derivação ("reamostrar inventa ou descarta quadros"). Não há constante, e nada no payload ao fornecedor declara taxa de quadros.

**Constante de duração de vídeo pedida: NÃO EXISTE mais como escolha.** `duration_seconds` continua no corpo aceito, mas é ignorado — o valor gravado é derivado do roteiro ([videos.ts:690-691](backend/src/routes/videos.ts:690)), e o campo está documentado como "aceito e ignorado" ([videos.ts:634-643](backend/src/routes/videos.ts:634)).

**Configuráveis por ambiente** (não constantes): `SCRIPT_TARGET_SECONDS`, `SCRIPT_WORDS_PER_MINUTE`, `SCRIPT_DURATION_TOLERANCE`, `MAX_RECORDING_SECONDS`, `IMAGE_UPLOAD_MAX_BYTES`, `REFERENCE_VIDEO_MAX_BYTES`.

---

## 11 · GERAÇÃO DE VÍDEO — FLUXO ATUAL

### Caminho completo, do clique ao arquivo entregue

**Tela — wizard de 4 passos** ([CreateVideoPage.tsx:30-35](frontend/src/pages/CreateVideo/CreateVideoPage.tsx:30)): `Avatar` → `Roteiro` → `Cena` → `Gerar`. O passo `PublishStep` existe como componente, mas **não é mais um passo**: é renderizado dentro de `SceneStep` ([SceneStep.tsx:261](frontend/src/pages/CreateVideo/steps/SceneStep.tsx:261)).

| # | Etapa | Arquivo · função | Observações |
|---|---|---|---|
| 1 | Clique em "Gerar" | `GenerateStep` ([frontend/src/pages/CreateVideo/steps/GenerateStep.tsx](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx)) → `api/client.ts` (`BASE_URL = "/api"`) | Antes disso a tela consulta `POST /videos/readiness` e `GET /video-cost-estimate` |
| 2 | `POST /videos` | [routes/videos.ts:659](backend/src/routes/videos.ts:659), `preHandler: requireActiveTenant` | Rota dentro do bloco `requireAuth` ([app.ts:82](backend/src/app.ts:82)) |
| 3 | Normalização da cena | `normalizeScene()` ([videos.ts:678](backend/src/routes/videos.ts:678), [videoScene.ts](backend/src/services/providers/videoScene.ts)) | Uma vez só; o normalizado é o que vai ao banco **e** ao fornecedor |
| 4 | Duração derivada | `estimateSecondsFromScript(script)` ([videos.ts:690](backend/src/routes/videos.ts:690)) | Truncada (`Math.floor`), porque o fornecedor cobra por segundo inteiro |
| 5 | Formato | `resolveVideoFormat(publishPlatform)` ([videos.ts:698](backend/src/routes/videos.ts:698)) | Nunca devolve indefinido |
| 6 | Portão de prontidão | `evaluateGenerationReadiness()` ([videos.ts:704](backend/src/routes/videos.ts:704)) | Antes de criar linha, de debitar e de tocar fornecedor |
| 7 | Teto diário | `assertDailyGenerationBudget()` ([videos.ts:722-736](backend/src/routes/videos.ts:722)) | Só em modo pago; 429 `daily_generation_limit` |
| 8 | `INSERT` em `videos` | [videos.ts:753-790](backend/src/routes/videos.ts:753) | Status `queued`, com cena e formato já gravados |
| 9 | Débito de crédito | `debitCredit()` ([videos.ts:797](backend/src/routes/videos.ts:797), [billing/creditGate.ts](backend/src/services/billing/creditGate.ts)) | **Antes** da chamada ao fornecedor; falta de saldo → 403 |
| 10 | Síntese de voz | `requireAudio()` → `synthesizeSpeech()` ([avatarProvider.ts:198-241](backend/src/services/providers/avatarProvider.ts:198), [voiceProvider.ts:228](backend/src/services/providers/voiceProvider.ts:228)) | Grava `provider_usage` de voz por caractere ([avatarProvider.ts:203](backend/src/services/providers/avatarProvider.ts:203)) |
| 11 | Tratamento de áudio | `processVoiceAudio()` ([avatarProvider.ts:218](backend/src/services/providers/avatarProvider.ts:218), [services/audioProcessing.ts](backend/src/services/audioProcessing.ts)) | Opcional, por avatar |
| 12 | Upload do áudio | `heygenUploadAsset()` → `POST /v3/assets` ([avatarProvider.ts:586](backend/src/services/providers/avatarProvider.ts:586)) | |
| 13 | Upload do fundo (se imagem) | [avatarProvider.ts:592-609](backend/src/services/providers/avatarProvider.ts:592) | Falha aqui **não** derruba a geração — o vídeo sai sem o fundo |
| 14 | Montagem do payload | `buildHeygenVideoPayload()` ([avatarProvider.ts:469](backend/src/services/providers/avatarProvider.ts:469)) + `heygenVideoRequestHeaders()` ([:455](backend/src/services/providers/avatarProvider.ts:455)) | Log de prova do que sai ([:613-626](backend/src/services/providers/avatarProvider.ts:613)) |
| 15 | `POST /v3/videos` | [avatarProvider.ts:631](backend/src/services/providers/avatarProvider.ts:631) | Com `Idempotency-Key`; devolve `video_id` |
| 16 | `UPDATE videos` | [videos.ts:853-865](backend/src/routes/videos.ts:853) | Grava `provider_job_id`, duração do áudio, motor e razão |
| 17 | Polling | `pollJob()` ([videos.ts:41](backend/src/routes/videos.ts:41)) → `pollVideoJob` → `GET /v3/videos/{id}` ([avatarProvider.ts:657](backend/src/services/providers/avatarProvider.ts:657)) | `setInterval` de 5 s, no processo web |
| 18 | Validação do artefato | `probeArtifact` + `validateVideoArtifact` ([videos.ts:64-65](backend/src/routes/videos.ts:64), [services/videoArtifact.ts](backend/src/services/videoArtifact.ts)) | Artefato inválido → `status='error'`, **sem estorno** |
| 19 | Persistência local | `persistRemoteArtifact()` ([videos.ts:107](backend/src/routes/videos.ts:107) → [downloadProxy.ts:118](backend/src/services/downloadProxy.ts:118) → `saveUpload`) | O mp4 vira nosso; a URL do fornecedor expira |
| 20 | `status='ready'` + notificação | [videos.ts:129-133](backend/src/routes/videos.ts:129) | |
| 21 | Registro de consumo | `recordProviderUsage()` ([videos.ts:161-177](backend/src/routes/videos.ts:161)) | Fonte da duração em ordem: fornecedor → timestamps do TTS → pedido ([videos.ts:154-159](backend/src/routes/videos.ts:154)) |
| 22 | Entrega | `GET /videos` e `GET /videos/:id` com `delivered_seconds` ([videos.ts:279-292](backend/src/routes/videos.ts:279)); `GET /videos/:id/download` faz proxy validado ([videos.ts:594](backend/src/routes/videos.ts:594)) | Arquivo servido de `/uploads/...` |

**Derivação de variantes (4:5, recorte, remoção de barra): existe e NÃO é chamada.** `deriveVariantsForVideo` é declarada em [deriveVariants.ts:220](backend/src/services/video/deriveVariants.ts:220) e o `grep` no repositório inteiro (backend + frontend) **não encontra nenhum chamador** — nem em rota, nem no polling, nem em script. A tabela `video_variants` (migração 041) fica sem produtor.

### Onde é síncrono

**Síncrono dentro do `POST /videos`** (o cliente espera): passos 3 a 16 — síntese de voz no ElevenLabs, tratamento de áudio, dois uploads de asset e a criação do vídeo. É a parte mais lenta do request, e é bloqueante.
**Assíncrono, mas no mesmo processo:** o polling (passo 17 em diante), que roda fora do ciclo de vida do request e sem persistência de estado de execução.

### Timeout de cada camada

| Camada | Timeout | Onde |
|---|---|---|
| HTTP ao fornecedor (HeyGen, ElevenLabs, D-ID) | **NENHUM** — nenhum `fetch` de produto usa `AbortSignal`/`AbortController`. A única ocorrência no repositório é numa guarda ([checkImageFreshnessPolicy.ts:101](backend/src/scripts/checkImageFreshnessPolicy.ts:101)) | vale o default do runtime |
| Polling do vídeo | 90 tentativas × 5 s ≈ **7,5 min**, depois marca `error` | [videos.ts:38-39](backend/src/routes/videos.ts:38), [:220-246](backend/src/routes/videos.ts:220) |
| Espera de avatar pronto | **90 s** | [avatarProvider.ts:850](backend/src/services/providers/avatarProvider.ts:850) |
| ffmpeg local | **10 min** | [video/ffmpeg.ts:23](backend/src/services/video/ffmpeg.ts:23) |
| Healthcheck do container backend | 5 s por tentativa, 12 tentativas, `start_period` 20 s | [docker-compose.yml:163-168](docker-compose.yml:163) |
| Request HTTP do Fastify | **não configurado** (default do framework) | [app.ts:38](backend/src/app.ts:38) |
| Sessão | 24 h | [app.ts:55](backend/src/app.ts:55) |

### Existe teto de custo?

**Sim, quatro camadas, todas do nosso lado:**
1. **Modo de provedor** — `PROVIDER_MODE=fixture` (default) não fala com fornecedor nenhum ([providerMode.ts:26](backend/src/services/providers/providerMode.ts:26)); em `live` o processo **não sobe** sem `PROVIDER_LIVE_CONFIRM` com a frase exata ([liveGuard.ts:50](backend/src/services/providers/liveGuard.ts:50), verificado em [index.ts:40](backend/src/index.ts:40)).
2. **Teto de sessão** — `PROVIDER_LIVE_MAX_GENERATIONS` (default 1) e `PROVIDER_LIVE_MAX_ATTEMPTS` (default 3× o de gasto) ([liveGuard.ts:43-64](backend/src/services/providers/liveGuard.ts:43)). Vive na memória; um `restart` devolve o orçamento.
3. **Teto diário, no banco** — `DAILY_PAID_GENERATION_LIMIT` (default 5), contando `videos` **e** `avatar_looks` do dia ([dailyGenerationLimit.ts:31-41](backend/src/services/billing/dailyGenerationLimit.ts:31), [:85-111](backend/src/services/billing/dailyGenerationLimit.ts:85)); aplicado em [videos.ts:724](backend/src/routes/videos.ts:724).
4. **Crédito por tenant** — `debitCredit` recusa sem saldo ([videos.ts:797-819](backend/src/routes/videos.ts:797)); baldes de ensaio separados dos reais (migração 043).

Há ainda o **portão de roteiro longo**: acima de 60 s estimados × margem 1,10, a tela exige confirmação explícita, e o veredito vem do servidor ([videos.ts:369-370](backend/src/routes/videos.ts:369)).
**Teto de valor em dólar: NÃO EXISTE** — todos os tetos contam gerações, não dinheiro.

### Existe registro do custo real?

**Sim.**
- `provider_usage` grava uma linha por chamada tarifável, com a tarifa **congelada no instante** ([023_provider_usage.sql:1-4](backend/src/db/migrations/023_provider_usage.sql:1)), o `unit_count` medido e a **fonte** da medição (`vendor_response` / `tts_timestamps` / `requested`) ([videos.ts:154-177](backend/src/routes/videos.ts:154)).
- `credit_ledger` grava cada movimento de crédito.
- Leituras: `GET /videos/:id/cost` devolve estimado e real lado a lado, com a diferença ([videos.ts:502-578](backend/src/routes/videos.ts:502)); `GET /dashboard-summary` soma o mês **só do que foi medido**, e informa quantas linhas ficaram de fora ([videos.ts:431-487](backend/src/routes/videos.ts:431)).
- Falhas geram linha própria com `outcome='failed'` e razão sanitizada ([videos.ts:186-198](backend/src/routes/videos.ts:186), [:914-924](backend/src/routes/videos.ts:914)).

---

## 12 · TESTES

### Existe arnês de teste?

**Não no sentido convencional: NÃO EXISTE framework de teste.** Nenhum `vitest`, `jest`, `mocha`, `playwright`, `cypress` ou `node:test` nos três `package.json`. **Zero arquivos `*.test.*` ou `*.spec.*`** em todo o repositório.

**O que existe é um arnês de MUTAÇÃO, próprio:**
- **Gate:** `npm run check` = `tsc --noEmit` + `tsx src/scripts/checkPolicy.ts` ([backend/package.json:11](backend/package.json:11)). Invocação canônica: `docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check`.
- **Arnês:** `npm run check:mutants` = `node tools/run-mutants.mjs` ([package.json:9](package.json:9)). Para cada mutante: aplica uma substituição textual determinística, roda o gate inteiro, **exige saída 1 com a mensagem daquela guarda**, reverte e exige saída 0 ([mutants.ts:16-19](backend/src/scripts/mutants.ts:16)).
- **Contrato:** [backend/src/scripts/mutants.ts](backend/src/scripts/mutants.ts). A regra dos dois mutantes: um "óbvio" (remover a chamada) e um "esperto" (deslocar a verdade sem mexer na superfície que a guarda olha) ([:20-25](backend/src/scripts/mutants.ts:20)). `expect` é obrigatório para que a falha seja **daquela** guarda e não do `tsc` ([:27-29](backend/src/scripts/mutants.ts:27)).
- **29 arquivos de guarda** `check*Policy.ts` em `backend/src/scripts/`.

### Cobertura aproximada

**NÃO VERIFICADO como percentual.** Não há instrumentação de cobertura (nenhum `c8`, `nyc`, `--coverage`), e nenhum número de cobertura de linhas ou ramos pode ser produzido por leitura. O que é contável: **159 mutantes declarados**, distribuídos por 29 guardas — número obtido contando as declarações `guard:` nos arquivos `check*Policy.ts` (a declaração da interface em `mutants.ts` fica de fora). Essa é uma medida de **guardas provadas reprovando**, não de cobertura de código.

O CLAUDE.md registra que a passada completa fechou **159/159 em 06/08**, e que o custo é ~21,5 min. Isso é registro histórico, **não foi reexecutado neste levantamento** (o congelamento proíbe subir serviço).

### Testes que provam guarda reprovando, com mutantes declarados — a lista

**159 mutantes.** Agrupados por arquivo de guarda:

**`checkCloneSampleFormatPolicy.ts` (4)** — guarda "voz: amostra de clonagem sem perda": *a conversão volta a produzir mp3* · *continua PCM, mas reamostra 48 kHz para 22,05 kHz* · *o teto do arquivo CONVERTIDO deixa de barrar* · *amostra que CABE continua passando (contraponto)*.

**`checkCostPolicy.ts` (9)** — *número de custo reaparece fora da constante* · *consumo sem medição passa a valer zero* · *a linha de diferença volta a aparecer em geração simulada* · *estimativa volta a ser calculada sobre a duração fracionária* · *a truncagem sai dos segundos e vai para o total em dólar* · *trunc no lugar de floor — mesma semântica, deve seguir verde* · *publicador novo imprime err.message cru* · *a redação por forma é desligada* · *endpoint tarifável acrescentado sem tocar no freio*.

**`checkDerivationPolicy.ts` (4)** — *a escala do sujeito passa a ampliar (decrease → increase)* · *o quadro deixa de ceder, e o sujeito amplia para alcançar o alvo* · *lanczos → bicubic: muda a reamostragem, não a geometria — segue verde* · *a derivação passa a aceitar URL de fornecedor*.

**`checkDocsInternalPolicy.ts` (3)** — *o carregador volta a varrer o diretório em vez de usar a allowlist* · *um arquivo sob docs-internal/ é classificado no manifesto* · *o prompt de tenant continua sendo montado (contraponto)*.

**`checkEnvironmentPolicy.ts` (9)** — *traefik perde a política de restart* · *restart presente, mas com o valor que anula tudo* · *backend perde o healthcheck* · *uma variável nova é lida sem ser repassada* · *o teto diário volta a não chegar ao container* · *DEV_AUTOFILL=1 com NODE_ENV=production* · *DEV_GALLERY=1 com NODE_ENV=production* · *limiter afrouxado em produção* · *limiter com valor que vira NaN*.

**`checkGenerationReadinessPolicy.ts` (4)** — *o botão volta a ficar sempre habilitado* · *o botão de gerar novamente escapa do predicado* · *o predicado passa a devolver lista de bloqueios sempre vazia* · *a rota consulta o predicado e ignora o veredito*.

**`checkImageFreshnessPolicy.ts` (2)** — *arquivo fora do bind mount muda sem rebuild* · *a lista de arquivos carimbados esvazia*.

**`checkLegacyEndpointPolicy.ts` (4)** — *uma chamada v2 volta ao produto por um caminho já declarado* · *um caminho v2 inteiramente novo entra sem ser notado* · *o traje sumido volta a contar como em preparo* · *indisponibilidade do fornecedor passa a matar o traje*.

**`checkLiveBudgetPolicy.ts` (7)** — *mensagem deixa de nomear o que consumiu* · *voz deixa de consumir o teto* · *a devolução some do caminho de erro* · *devolve também no sucesso* · *a devolução devolve a tentativa junto* · *portão removido* · *portão presente, comparando com valor que nunca ocorre*.

**`checkNativeBatchPolicy.ts` (4)** — *formato pedido como nativo passa a reaproveitar o master* · *o lote debita menos do que gera* · *o lote consome uma unidade de teto para várias gerações* · *filter → reduce: mesma contagem, deve seguir verde*.

**`checkNetworkEgressPolicy.ts` (4)** — *cliente HTTP novo entra sem checagem de modo* · *a checagem continua no arquivo, mas fora do caminho de saída* · *host de fornecedor que o catálogo não conhece* · *o freio volta a ser uma lista escrita à mão*.

**`checkOutfitPolicy.ts` (6)** — *criar look em live pula o teto* · *o traje em preparo entra no seletor* · *o preparo escapa pela lista do fornecedor* · *o custo do traje vira número digitado* · *a janela de espera volta a ser curta demais* · *esgotar a espera volta a não dizer nada*.

**`checkPaddingPolicy.ts` (5)** — *a sonda devolve o quadro inteiro mesmo havendo preenchimento* · *o alvo volta a ser derivado da resolução do quadro* · *o recorte come duas linhas de imagem* · *o enquadramento deixa de receber o recorte* · *amostrar em outros instantes — mesma medida, deve seguir verde*.

**`checkPlatformKeyPolicy.ts` (4)** — *serializador devolve a chave em claro* · *rota passa a resolver a chave* · *probe do HeyGen apontado para endpoint de geração* · *duas credenciais na mesma variável de ambiente*.

**`checkPolicy.ts` (10)** — *doc novo sem classificação* · *prefixo excluído volta a valer sobre um arquivo já classificado* · *termo proibido entra em doc de tenant* · *doc de nível admin promovido a tenant* · *afirmação BYOK volta ao FAQ* · *doc promete limite que nenhum plano tem* · *doc promete recurso ilimitado* · *teto de tamanho estourado* · *alvo de palavras deixa de derivar do wpm* · *mensagem ao cliente volta a citar o fornecedor*.

**`checkPollPolicy.ts` (2)** — *volta a tratar concluído-sem-URL como processando* · *mensagem perde a menção a estorno*.

**`checkPreflightSummaryPolicy.ts` (6)** — *um dos seis campos some do resumo* · *o resumo sai da tela de gerar* · *o resumo passa a ler o formulário em vez do corpo enviado* · *o Avançar volta a liberar com traje em preparo* · *a trava passa a valer também para o traje que falhou* · *o nome do arquivo salvo volta a sumir da tela*.

**`checkProviderPolicy.ts` (6)** — *fixture com NODE_ENV=production* · *live com a frase de confirmação errada* · *generateVideo deixa de consultar isFixtureMode* · *cloneVoice consulta o modo e ignora o resultado* · *flag inexistente referenciada* · *flag lida por caminho que a guarda não olha*.

**`checkRecordingGuidancePolicy.ts` (3)** — *o indicador some da tela, mas o import fica* · *a meta mínima colapsa para zero* · *toda duração passa a ser considerada boa*.

**`checkRefundPolicy.ts` (3)** — *scripts.ts debita e não estorna* · *migration deixa de admitir reason = refund* · *módulo novo mexe no saldo sem gravar ledger*.

**`checkRehearsalCreditPolicy.ts` (3)** — *o débito em fixture volta ao balde real* · *o portão de prontidão volta a ler o saldo real* · *o estorno volta a escolher a conta pelo modo atual*.

**`checkSpendControlPolicy.ts` (4)** — *o teto diário vira ilimitado quando a variável não está no ambiente* · *o portão perde a margem e volta a comparar a estimativa crua* · *o fundo escolhido some do payload* · *o formulário deixa de propagar a interpretação*.

**`checkStepOneFlowPolicy.ts` (7)** — *o Avançar volta para antes da grade* · *passo obrigatório de voz no caminho de avatar pronto* · *o aviso some do JSX* · *o frontend recalcula a prontidão por conta própria* · *o bloco passa a abrir sempre* · *recolhe sempre, inclusive quando a voz falta* · *a frase de escopo some da tela*.

**`checkVendorErrorPathPolicy.ts` (4)** — *a rota de geração volta a responder 201 numa recusa* · *resposta de erro deixa de ser tratada como erro* · *o evento continua saindo, sem o corpo dentro* · *a máscara do publicador some — o sumidouro tem de segurar sozinho*.

**`checkVendorLogPolicy.ts` (4)** — *função com fetch deixa de registrar* · *helper esvaziado, chamada intacta* · *elisão esvaziada, palavra viva no comentário* · *teto de bytes por campo desativado*.

**`checkVideoContractPolicy.ts` (7)** — *o traje escolhido não chega ao objeto enviado* · *o seletor sem escolha vira avatar inexistente* · *o fundo vai sem mandar remover o original* · *o quadro volta a caber com barra* · *a chave de idempotência passa a variar por request* · *a chave de idempotência deixa de ser enviada* · *um campo fora do schema entra no corpo*.

**`checkVideoFormatPolicy.ts` (5)** — *o payload volta a omitir aspect_ratio* · *o campo continua no payload, com o valor do fornecedor* · *a tela passa a afirmar a resolução entregue* · *vendor sem evidência nenhuma passa a declarar suporte* · *a fixture volta a ser a mesma para toda proporção*.

**`checkVideoPlaybackPolicy.ts` (6)** — *a Biblioteca volta a ser uma lista de downloads* · *o player volta a desenhar todo vídeo no mesmo quadro* · *o aviso de simulação some do player, mas o import fica* · *o aviso fica renderizado, mas preso em false* · *a condição do aviso é invertida* · *o selo da Biblioteca perde a ligação e passa a seguir o modo global*.

**`checkVoiceSamplePolicy.ts` (20)** — *a porta abre sem digitar nada* · *a comparação do nome vira prefixo* · *o piso de 60 s cai para zero* · *a recusa vira aviso* · *amostra longa continua passando (contraponto)* · *conta cheia deixa de barrar* · *a contagem volta a somar a biblioteca do fornecedor* · *compara com > em vez de >=* · *substituição sem flag passa* · *a lista de vozes protegidas fica vazia* · *o caminho ANTIGO volta a sobrescrever a voz* · *texto renomeado para .mp3 é aceito* · *confia no tipo declarado em vez dos bytes* · *o teto de 10 MB some* · *labels de idioma entram no corpo da clonagem* · *a clonagem deixa de desviar em fixture* · *volta a logar o voice_id inteiro* · *o encurtador devolve o id inteiro* · *a redação de CHAVE é afrouxada para deixar o id passar* · *a leitura de inventário deixa de desviar em fixture*.

**Dívida registrada:** o CLAUDE.md declara **4 mutantes DEVIDOS e não escritos** (*a estimativa volta a sair da duração pedida* · *o ritmo vira número digitado em vez de derivado da medição* · *o teto de confirmação some do veredito do servidor* · *o player volta a mostrar a duração pedida*). Confirmado por leitura: nenhum desses quatro nomes aparece nos arquivos `check*Policy.ts`.

---

# LISTAS FINAIS

## PRONTO — funciona hoje, verificado por leitura de código

- **Subida do ambiente** por Docker Compose, quatro serviços com healthcheck e `restart: unless-stopped` nos quatro ([docker-compose.yml](docker-compose.yml)).
- **Migrações** próprias, transacionais, idempotentes, no boot ([db/migrate.ts:21-37](backend/src/db/migrate.ts:21)) — 46 arquivos, 28 tabelas.
- **Isolamento multi-tenant por coluna**, com `tenantId` vindo da sessão e nunca do corpo ([requireAuth.ts:22](backend/src/middleware/requireAuth.ts:22)).
- **Separação admin/tenant** por campos de sessão distintos e blocos de encapsulamento separados ([app.ts:78](backend/src/app.ts:78), [:98](backend/src/app.ts:98)).
- **Cifra de credenciais em repouso**, AES-256-GCM ([crypto.ts:4-31](backend/src/services/crypto.ts:4)), com mascaramento no retorno ([credentials.ts:22](backend/src/routes/credentials.ts:22)).
- **Redação de segredos no log**, em duas camadas, uma delas no sumidouro e por forma ([safeLog.ts](backend/src/services/log/safeLog.ts), [vendorResponseLog.ts](backend/src/services/providers/vendorResponseLog.ts)).
- **Webhook do Stripe com verificação de assinatura** e corpo bruto em contexto isolado ([stripeWebhook.ts:98-119](backend/src/routes/stripeWebhook.ts:98)).
- **Caminho completo de geração de vídeo** — voz clonada → síntese → upload → `POST /v3/videos` → polling → validação → persistência local → entrega ([routes/videos.ts](backend/src/routes/videos.ts), [avatarProvider.ts](backend/src/services/providers/avatarProvider.ts)).
- **`Idempotency-Key` derivada da tentativa** enviada ao fornecedor ([avatarProvider.ts:421-467](backend/src/services/providers/avatarProvider.ts:421)).
- **Quatro camadas de teto de gasto** (modo, sessão, diário no banco, crédito por tenant) e o portão de roteiro longo com margem.
- **Registro de custo real** com tarifa congelada, fonte de medição declarada e linhas de falha separadas (`provider_usage`, `credit_ledger`).
- **Persistência do artefato no nosso disco** antes de o vídeo virar `ready` ([videos.ts:104-132](backend/src/routes/videos.ts:104)).
- **Modo `fixture` como default seguro**, com recusa de boot em `live` sem confirmação ([index.ts:40](backend/src/index.ts:40), [liveGuard.ts](backend/src/services/providers/liveGuard.ts)).
- **Arnês de mutação com 159 mutantes** sobre 29 guardas, cada um exigindo a mensagem da guarda certa ([mutants.ts](backend/src/scripts/mutants.ts)).
- **Wizard de 4 passos** na tela, com os cinco controles de cena chegando ao payload ([CreateVideoPage.tsx:30](frontend/src/pages/CreateVideo/CreateVideoPage.tsx:30)).

## PARCIAL — existe mas incompleto

- **Armazenamento plugável** — a interface `StorageProvider` e os dois ids existem, mas **as duas implementações são `saveToLocalDisk`**; falta qualquer backend real (Drive, S3, R2), com TODO explícito ([storageProvider.ts:20-35](backend/src/services/providers/storageProvider.ts:20)). Falta também leitura provider-aware ([storage.ts:20-27](backend/src/services/storage.ts:20)).
- **Derivação de variantes de formato** — `deriveVariantsForVideo` ([deriveVariants.ts:220](backend/src/services/video/deriveVariants.ts:220)), `formatDerivation.ts`, a sonda de preenchimento e a tabela `video_variants` existem e têm guardas; **falta o chamador** — zero em todo o repositório. A tabela nunca recebe linha por caminho de produto.
- **Assincronismo da geração** — o polling funciona enquanto o processo vive; **falta retomada no boot**, e nada re-arma `pollJob` ([index.ts:36-47](backend/src/index.ts:36)). Um vídeo em voo morre com o processo, sem estorno.
- **D-ID** — código completo (upload, `talks`, poll, créditos), **falta qualquer execução real**; o próprio catálogo declara custo não medido e nenhuma resposta observada ([endpointCatalog.ts:112](backend/src/services/providers/endpointCatalog.ts:112)).
- **Stripe** — código de checkout e webhook prontos; **falta a configuração** das três chaves, sem as quais degrada para `stripe_not_configured` ([config.ts:85-89](backend/src/config.ts:85)).
- **RAG / embeddings** — `documents`, `document_chunks`, pgvector e `embeddingProvider` existem; **falta a chave de embedding**, e `POST /scripts/generate` chama o LLM **sem contexto** (registrado no CLAUDE.md como item 5 do DEMO-1).
- **Teto de gasto** — conta **gerações**, não dinheiro; falta qualquer teto em valor.
- **Cenário e traje coletados no passo 1** — persistidos em `videos.scenario`/`outfit`/`*_prompt` ([videos.ts:754](backend/src/routes/videos.ts:754)), **nunca enviados ao fornecedor**; a migração 044 documenta que o contrato não tem campo para eles ([044_avatar_looks.sql:1-10](backend/src/db/migrations/044_avatar_looks.sql:1)).
- **Adaptador OpenAI** — implementado e configurável por `OPENAI_BASE_URL`; **falta ter sido usado alguma vez** ([endpointCatalog.ts:188](backend/src/services/providers/endpointCatalog.ts:188)).
- **Dívida de guarda** — 4 mutantes declarados como devidos no CLAUDE.md e **ausentes** dos arquivos de guarda (conferido por busca de nome).

## NÃO EXISTE — precisa ser construído do zero

- **Fila** (Redis, BullMQ, Celery, cron, tabela de job) — nenhum vestígio; `GET /jobs/processing` é consulta de status, não fila ([jobs.ts:13](backend/src/routes/jobs.ts:13)).
- **Worker separado** — um processo só serve HTTP e faz polling.
- **Retomada de trabalho após reinício** — nenhum código de recuperação no boot.
- **Retry / backoff** em chamada a fornecedor.
- **Timeout de rede** nos `fetch` a fornecedor — nenhum `AbortSignal` no caminho de produto.
- **Webhook de fornecedor de vídeo ou voz** — HeyGen e ElevenLabs não têm rota de callback aqui.
- **S3 / R2 / MinIO** — nenhum SDK instalado, nenhuma implementação.
- **URL assinada com TTL** — nenhuma geração de assinatura em lugar nenhum.
- **Cofre de segredos** (Vault, KMS, Secrets Manager) — os segredos vivem em `.env` e no banco cifrado.
- **Row Level Security** no Postgres — o isolamento é só pelo `WHERE` das consultas.
- **Framework de teste e medição de cobertura** — nenhum `vitest`/`jest`/`playwright`, nenhum `*.test.*`, nenhuma instrumentação de cobertura.
- **Constante de fps** e qualquer controle de taxa de quadros no payload.
- **Build de produção no caminho normal** — o frontend é servido pelo dev server do Vite; existe `npm run build` nos dois lados, mas nada no compose o executa.

---

# O QUE EU NÃO CONSEGUI VERIFICAR E POR QUÊ

1. **Conteúdo de `.env` e `.env.example`, mesmo só os nomes.** A camada de permissão negou a leitura dos dois arquivos (duas tentativas, uma via `grep` e uma via ferramenta de busca). A lista de nomes da seção 9 foi montada a partir do `docker-compose.yml`, das ocorrências de `process.env.X` e dos helpers `required("X")`/`optional("X")` no código — **é o conjunto que o código lê e o compose repassa, não necessariamente o conjunto que o `.env` contém.** Uma variável presente no `.env` e não lida por nada ficaria de fora desta lista, e o inverso também: `POSTGRES_DB` e `ENCRYPTION_KEY`, por exemplo, entram pela interpolação do compose, não por uma leitura direta que eu pudesse ver.

2. **Estado real do banco em execução.** Não consultei o Postgres — o congelamento proíbe subir ou tocar serviço. Todas as tabelas listadas vêm dos arquivos de migração, e **não há garantia de que todas as 46 migrações estejam aplicadas** no banco corrente: `schema_migrations` só pode ser lido conectando.

3. **Que o arnês esteja verde hoje.** Os 159 mutantes foram contados estaticamente, pelas declarações `guard:` nos 29 arquivos de política. O resultado 159/159 de 06/08 é registro do CLAUDE.md; **não reexecutei** `npm run check:mutants` nem `npm run check`, porque ambos exigem `docker compose exec`.

4. **Cobertura de código em percentual.** Não há instrumentação instalada, e não existe forma de derivar o número por leitura.

5. **Comportamento real dos fornecedores.** Nenhuma chamada de rede foi feita. Tudo o que este relatório diz sobre o que HeyGen e ElevenLabs aceitam ou recusam é **transcrição do que o código e seus comentários afirmam** — inclusive as medições datadas —, não observação minha.

6. **Se o modo em execução é `fixture` ou `live` agora.** Os cinco critérios de desarme exigem `docker compose exec`, `docker compose config` e `docker inspect`. O que verifiquei é que o **default declarado** no compose é `fixture` com `PROVIDER_LIVE_CONFIRM` vazio ([docker-compose.yml:61-62](docker-compose.yml:61)) e que o processo não sobe em `live` sem a frase ([index.ts:40](backend/src/index.ts:40)) — isso é o arquivo, não o processo.

7. **Timeout efetivo dos `fetch` a fornecedor.** Confirmei a **ausência** de `AbortSignal`/`AbortController` no caminho de produto; qual timeout o runtime do Node aplica por padrão nesse caso não foi verificado.

8. **Se `deriveVariantsForVideo` é alcançada por algum caminho dinâmico.** A busca por nome literal em backend e frontend não achou chamador. Uma invocação por string montada em tempo de execução escaparia dessa busca — não procurei por esse padrão.

9. **Conteúdo de `docs/`, `docs-internal/`, `previews/` e `graphify-out/`.** Contei arquivos e linhas, mas não os li; o escopo das 12 perguntas é o código do produto.

10. **A afirmação do CLAUDE.md de que `CLAUDE - md.txt` bloqueia o arnês.** O arquivo **existe** na raiz (8.126 bytes, [CLAUDE - md.txt](CLAUDE%20-%20md.txt)) e `git status --short` volta vazio — o que é consistente com ele estar ignorado ou rastreado, mas **não conferi qual dos dois**, porque isso exigiria inspecionar `.gitignore` e o índice, e nenhuma das 12 perguntas depende disso.
