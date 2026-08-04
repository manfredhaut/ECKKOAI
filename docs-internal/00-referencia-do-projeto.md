<!-- MOVIDO de CLAUDE.md em 2026-08-04, linhas 1-503 do arquivo original.
     Nada foi apagado nem reescrito nesta movimentação. -->

# Referência do projeto — stack, objetivo, estado, pastas, comandos, roadmap

﻿Always respond in Brazilian Portuguese.

# CLAUDE.md — TWINAI

> Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão,
> independente de qual conta está autenticada (pessoal ou manfred@smartinovat.com).
> Ele serve como memória do projeto para manter continuidade entre trocas de conta.

---

## 1. Stack

**Backend** (`backend/`)
- TypeScript (ESM) + Fastify 4 (`backend/src/app.ts`)
- PostgreSQL 16 com extensão `pgvector` (imagem `pgvector/pgvector:pg16`)
- Plugins Fastify: `@fastify/cookie`, `@fastify/cors`, `@fastify/multipart`,
  `@fastify/session` (store customizado em Postgres), `@fastify/static`
- `bcryptjs` (hash de senha), `pg` (driver Postgres), `mammoth`/`pdf-parse`/`xlsx`
  (extração de texto de documentos)
- Execução via `tsx` (dev) / `tsc` (build)

**Frontend** (`frontend/`)
- React 18 + TypeScript + Vite 5
- `react-router-dom` (rotas), `i18next` / `react-i18next` (i18n com `en` e `pt-BR`)

**Infraestrutura**
- Docker Compose orquestrando 4 serviços: `traefik` (reverse proxy, porta host
  `8090`), `postgres`, `backend`, `frontend`
- Traefik é o único ponto de entrada exposto ao navegador (ver `traefik/`)

**Padrão de provedores de IA:** BYOK (bring-your-own-key) por tenant — cada
cliente configura sua própria chave para avatar, voz, roteiro e embeddings.
**Decisão de negócio registrada em 2026-07-21 (rebrand eckko.ai, confirmada
pelo usuário): este padrão vai ser revertido.** As chaves passam a ser da
PLATAFORMA (eckko.ai mantém as contas HeyGen/ElevenLabs/Gemini), e o cliente
passa a consumir crédito (assinatura mensal + créditos extras sob demanda,
modelo híbrido) em vez de conectar a própria chave. **Ainda não implementado**
— o código hoje continua 100% BYOK (`getCredential(req.tenantId, ...)` em
vídeo/avatar/voz/roteiro; só o copiloto público usa chave da plataforma, sem
relação com plano). A migração fica para o planejamento dedicado do painel
admin (ver seção 6) — é uma reversão grande de uma regra que a auditoria de
2026-07-16 confirmou como 100% respeitada, não uma tarefa incidental.

**Convenção de domínio:** qualquer valor dependente de domínio/DNS deve ser lido
do arquivo de configuração de domínio (`domainConfig.ts` / `BASE_DOMAIN`) —
nunca hardcoded em outro lugar do código.

**Convenção de assets de marca:** todo asset de marca (logos, ícones, imagens
de referência de identidade visual) enviado pelo usuário deve ser salvo
imediatamente em `frontend/public/brand/` — nunca depender só do anexo de uma
mensagem de chat, que não sobrevive entre sessões nem trocas de conta. Origem
desta regra: a arte real do logo eckko.ai (Fase A do rebrand, sessão de
2026-07-21) foi anexada numa sessão, nunca salva em disco, e ficou
inacessível assim que essa sessão fechou — precisou ser reenviada.
**Limitação técnica conhecida:** Claude Code não tem uma ferramenta para
extrair o binário de uma imagem colada/anexada diretamente na interface de
chat — só "vê" a imagem como entrada multimodal, sem acesso aos bytes brutos
pra gravar em arquivo. Essa regra só é executável de fato quando o usuário
salva o arquivo em algum lugar do disco (ex.: `Downloads/`) e informa que
enviou — nesse caso, procurar o arquivo mais recente compatível (por nome,
extensão de imagem, e horário de modificação) antes de assumir que não
existe, e copiá-lo pra `frontend/public/brand/` assim que localizado.

---

## 2. Objetivo do projeto

TWINAI é uma aplicação multi-tenant para
criar vídeos de "avatar digital" (clone de uma pessoa falando) a partir de: uma
foto/vídeo de referência, um roteiro (script) e configurações de cenário/figurino.
O fluxo cobre:

1. **Cadastro do avatar** — treinar um avatar a partir de fotos + vídeo de
   referência, com clonagem de voz.
2. **Criação de vídeo** — escolher avatar, gerar/editar roteiro, escolher
   cenário/figurino/duração e disparar a geração.
3. **Base de conhecimento** — upload de documentos (PDF/Word/Excel) extraídos,
   divididos em chunks e indexados via embeddings (pgvector) para uso como
   contexto/RAG na geração de roteiros; também há upload de "imagens de
   referência" apenas para consulta humana (não indexadas).
4. **Notificações e jobs** — acompanhamento assíncrono do status de
   processamento de vídeos e documentos.

Produto desenhado para múltiplos clientes (tenants), cada um com seus próprios
avatares, vídeos, credenciais de API e documentos, isolados por `tenant_id`.

---

## 3. Estado atual

**Implementado (esqueleto funcional, ponta a ponta, com providers stub):**
- Autenticação por sessão (cookie + tabela `sessions` no Postgres), multi-tenant
  (`tenants`/`users`). Criação de tenant é só via `/auth/signup` (self-service)
  — a antiga rota `POST /admin/tenants` protegida por `X-Admin-Token` foi
  **removida em 2026-07-22** (ver seção 7): sem caller vivo fora da própria
  documentação, confirmado por grep no repo inteiro antes de deletar
- CRUD de avatares, vídeos, credenciais de API (criptografadas com AES-256-GCM),
  documentos, imagens de referência e notificações
- Frontend com páginas: Login, Dashboard, Criar Vídeo (steps: Avatar → Roteiro →
  Cenário/Assets → Duração → Gerar), Conteúdo (documentos + mídia de
  conhecimento + imagens de referência), Minha Assinatura (plano, uso vs.
  limite, forma de pagamento, faturas — ações de billing são stubs até a
  Fase 6) e Configurações (credenciais)
- Extração de texto de PDF/Word/Excel e chunking para indexação
  (`services/chunking.ts`, `services/textExtraction.ts`)
- Copiloto de IA autenticado (`routes/copilot.ts`) — **integração real**, não
  stub: chama a Anthropic **ou** Gemini de verdade, conforme o vendor
  escolhido na credencial BYOK `script` do tenant
  (`services/providers/copilotProvider.ts`, dispatcher `askCopilot()` por
  `vendor`), persiste conversas/mensagens no Postgres
  (`copilot_conversations`/`copilot_messages`) e injeta o conteúdo de
  `/docs` no system prompt via `services/docs.ts`
- `services/providers/scriptProvider.ts` — geração de roteiro é
  **integração real**, com dois vendors selecionáveis: Anthropic e Gemini
  (Google AI Studio). Cada credencial BYOK agora tem uma coluna `vendor`
  (migration `014_credential_vendor.sql`) além da chave; o card "Provedor de
  IA para geração de roteiro" em Configurações tem um dropdown de verdade que
  troca vendor + label/placeholder da chave (`CredentialCard.tsx`,
  `providerVendors.ts`). `POST /credentials/script/test` faz uma chamada
  mínima real contra o vendor selecionado (não só checa se a chave existe).
  Catálogo de vendors por categoria em
  `services/providers/vendorCatalog.ts` (fonte única, espelhada no
  frontend) — `script` tem 3 vendors reais (Anthropic/Gemini/OpenAI),
  `avatar` tem 2 (HeyGen/D-ID), `voice` tem 1 (ElevenLabs) — ver abaixo, não
  são mais placeholders `"stub"`
- **`services/providers/avatarProvider.ts` e `voiceProvider.ts` — integração
  real, não stub** (correção: as duas próximas linhas listavam isso como
  pendente até esta sessão; achado incidental ao trabalhar em outra tarefa,
  não uma implementação feita agora — não sei precisar em qual sessão
  passada isso foi construído, só confirmei que já está no código). HeyGen e
  D-ID têm treino de avatar (`trainAvatar`), geração de vídeo
  (`generateVideo`) e polling de status (`pollVideoJob`) reais contra a API
  de cada vendor; ElevenLabs tem clonagem de voz (`cloneVoice`) e
  texto-pra-fala (`synthesizeSpeech`) reais. `routes/videos.ts` não usa mais
  `simulateProgress`/placeholder: `POST /videos` chama `generateVideo` de
  verdade e faz polling real em `setInterval` (a cada 5s, até ~7,5min) via
  `pollVideoJob`, atualizando `status`/`output_url`/`error_message` e
  disparando notificação real quando o vídeo fica pronto ou falha.
  `routes/avatars.ts` (`POST /avatars/:id/reference-video`) chama
  `trainAvatar` e, se houver credencial de voz conectada, `cloneVoice` em
  seguida. Alguns contratos de endpoint estão marcados `// ASSUMPTION` no
  código (ex.: autenticação HTTP Basic da D-ID, campo `avatar_item.id` da
  HeyGen) — best-effort contra a doc do vendor. **Correção (2026-07-22):**
  a frase anterior deste bullet ("nenhuma chave real... testada em nenhuma
  sessão registrada até aqui") estava errada — o tenant de dev `dev-c77a5b`
  tem credenciais HeyGen/ElevenLabs/Gemini reais conectadas
  (`api_credentials.updated_at` ≈ 2026-07-17 05h34-05h45 UTC) e 3 vídeos
  gerados de verdade pelo HeyGen (`provider_job_id`/`provider_vendor`
  reais, `output_url` de `files2.heygen.ai` assinado, criados
  2026-07-17 08h52-10h26 UTC) — achado ao verificar o botão de download e
  investigado a fundo em 2026-07-22. **A origem exata do uso de 07-17 ficou
  indeterminada**: esse dia não tem entrada nenhuma neste arquivo, e não foi
  possível decidir entre uma sessão de Claude Code não documentada e um teste
  manual do usuário fora de sessão. Os contratos `// ASSUMPTION` continuam sem confirmação
  formal (ninguém registrou se bateram certo contra a resposta real), mas o
  fato de terem produzido 3 vídeos `ready` sugere que bateram
- Pasta `/docs` com conteúdo próprio de setup/FAQ do produto
  (`docs/README.md`, `docs/faq.md`, `docs/setup.md`, `docs/screens/*.md`),
  carregada pelo copiloto acima (`loadDocsContent()`)
- Landing page pública (`frontend/src/pages/Landing/LandingPage.tsx`), na rota
  `/` — mas só no domínio raiz: `isRootDomain()`/`publicConfig.ts` decidem
  isso no `App.tsx`, então um subdomínio de tenant continua vendo
  Dashboard/login em `/`, sem mudança de comportamento. Hero, problema→solução,
  como funciona, vitrine de recursos (o "agente de perfil de conteúdo" aparece
  marcado "em breve", já que esse não existe — ver abaixo), pricing puxando
  `GET /public/plans` de verdade (mesma fonte de `backend/src/plans.ts`), FAQ,
  CTA final e rodapé com o link do WhatsApp
- Copiloto público pré-cadastro (`backend/src/routes/public.ts`,
  `POST /public/copilot/messages`) — **também é integração real**, não uma
  demo enlatada: reaproveita `askCopilot()`/`loadDocsContent()` do copiloto
  autenticado, mas com uma chave própria da plataforma
  (`PLATFORM_COPILOT_API_KEY`, não a BYOK de nenhum tenant — não existe tenant
  nesse ponto do funil). Sem persistência de histórico, com rate-limit simples
  em memória (10 mensagens/10min por IP) pra não virar um ralo de custo
- **Copiloto interno do admin** (`backend/src/routes/adminCopilot.ts`,
  `POST /admin/copilot/conversations/:id/messages`, migration
  `031_admin_copilot.sql`) — mesmo padrão dos outros dois (chave da
  plataforma `PLATFORM_COPILOT_API_KEY`, `ADMIN_SYSTEM_PROMPT` próprio em
  `copilotProvider.ts`, docs extras de `docs/admin/` via
  `loadAdminDocsContent()`), com persistência em tabelas próprias
  (`admin_copilot_conversations`/`admin_copilot_messages`, ligadas a
  `admin_users`, nunca a `tenant_id`), widget no header do painel admin.
  **Achado e aplicado em 2026-07-22** (ver seção 7) — o código já existia
  completo, mas a migration nunca tinha rodado no banco local (feature
  100% não-funcional até o restart) e não havia nenhum registro deste
  arquivo sobre ela; testado ponta a ponta depois de aplicada
- **Chaves da plataforma cifradas no banco, com tela no admin** (migration
  `034_platform_credentials.sql`, `services/platformCredential*.ts`,
  `routes/adminPlatformCredentials.ts`, seção nova na aba APIs do painel).
  Cinco slots — Anthropic (copiloto público/admin), Google (copiloto do
  tenant), Google de embedding, HeyGen e ElevenLabs. Grava, substitui e
  valida; **não lê de volta em nenhuma rota**. Banco vence `.env`, invertível
  por `PLATFORM_KEYS_FORCE_ENV=1`. HeyGen e ElevenLabs ficam só armazenadas e
  validáveis: a geração continua na credencial do tenant. Ver o bloco
  CHAVES-2 no fim deste arquivo
- Link "Fale conosco" via WhatsApp no rodapé da landing — número vem de
  `WHATSAPP_NUMBER` (env var, nunca hardcoded); o link some sozinho se a
  variável estiver vazia
- **Enforcement do limite de plano** (`routes/videos.ts`, `POST /videos`,
  2026-07-21) — antes só exibido, agora aplicado de verdade: conta vídeos do
  tenant no mês corrente e bloqueia com `403 plan_limit_reached` antes de
  qualquer validação de avatar/credencial ou chamada ao provedor, se
  `videosThisMonth >= plan.videoLimitPerMonth`. Escopo deliberadamente restrito
  a vídeo (único campo de limite que existe em `plans.ts`); roteiro, treino de
  avatar, clonagem de voz e copiloto autenticado seguem sem limite, pois hoje
  rodam na chave BYOK do próprio tenant (sem custo à plataforma — ver nota da
  seção 1 sobre a migração BYOK→plataforma ainda pendente). Testado
  ponta-a-ponta com tenant real via `/auth/signup` + chamada real via Traefik.
- `StorageProvider` (`backend/src/services/providers/storageProvider.ts`) —
  mesmo padrão stub dos outros provedores BYOK do projeto: interface real,
  tenant escolhe "Google Drive" ou "Hospedado pela plataforma" em
  Configurações (`GET`/`PUT /storage-provider`, persistido em
  `tenants.storage_provider`), mas os arquivos continuam fisicamente indo pro
  disco local por baixo dos panos até existir OAuth do Drive / credencial S3
  real — `services/storage.ts` virou um wrapper fino que só decide qual
  provider chamar, os 4 call sites de `saveUpload()` não mudaram

**Ainda não implementado (stubs explícitos, ver comentários `TODO` no código):**
- `services/providers/embeddingProvider.ts` — embeddings são **aleatórios**
  (vetores randômicos de 1536 dimensões); integração real pendente, já
  decidida como `gemini-embedding-001` a 1536 dims com chave da plataforma
  (ver seção HANDOFF) — único dos 4 provedores de IA de domínio ainda stub
- Agente de perfil de conteúdo (perfil de tópico por tenant + campo de
  orientação/guidance, busca web plugável, sugestões de ângulo de pauta
  cruzando com documentos de Conhecimento e mídia) — não existe em nenhuma
  fase do roadmap, nem como stub. Aparece citado só como card "em breve" na
  vitrine de recursos da landing page (não é uma implementação)
- ~~Gap descoberto ao verificar o StorageProvider: `traefik/dynamic.yml` só
  roteia `/api` pro backend, `/uploads/*` cai no frontend~~ — **correção:
  esse "gap" não existe mais no código (2026-07-18).** `dynamic.yml` já tem
  um router `uploads` dedicado (`Host(BASE_DOMAIN) && PathPrefix('/uploads')`
  → `backend`, sem `stripPrefix`, já que o `@fastify/static` do backend
  monta em `prefix: "/uploads/"` — ver `app.ts`). O registro anterior deste
  arquivo (sessão de 2026-07-16) estava desatualizado: o router já existia
  desde a mesma leva de edição que trouxe o roteamento por Host da Fase 5,
  só nunca foi refletido aqui. Confirmado ao vivo com
  `curl -H "Host: twinai.localhost" http://localhost:8090/uploads/<tenant>/<arquivo>`
  → `HTTP 200`, `content-type` correto. Ver o histórico do git (2026-07-18)
  para a investigação completa.

Ou seja: arquitetura, banco de dados, autenticação/multi-tenancy, UI, o
copiloto in-app e público, a landing page, o StorageProvider (como stub) e o
roteamento do Traefik pra `/uploads/*` estão prontos e verificados; dos 4
provedores de IA de domínio, só **embeddings** continua stub — avatar/vídeo
(HeyGen/D-ID), voz (ElevenLabs) e roteiro (Anthropic/Gemini/OpenAI) já têm
integração real, nenhuma delas confirmada ainda com uma chave de produção de
verdade (ver nota acima). Falta ainda o agente de perfil de conteúdo (não
iniciado).

---

## 4. Estrutura de pastas principal

```
TWINAI/
├── docker-compose.yml        # orquestra traefik, postgres, backend, frontend
├── traefik/                  # config do reverse proxy (traefik.yml, dynamic.yml)
├── uploads/                  # arquivos enviados (montado em /app/uploads no backend)
├── backend/
│   └── src/
│       ├── app.ts             # registro de plugins e rotas Fastify
│       ├── index.ts           # bootstrap do servidor
│       ├── config.ts          # variáveis de ambiente
│       ├── db/
│       │   ├── migrations/    # 001..034, SQL puro, aplicadas via migrate.ts
│       │   ├── migrate.ts
│       │   └── pool.ts
│       ├── middleware/requireAuth.ts
│       ├── routes/            # auth, admin, avatars, videos, credentials,
│       │                      # documents, referenceImages, scripts, uploads,
│       │                      # notifications, jobs, health, storage, public
│       │                      # (public.ts = GET /public/plans + POST
│       │                      # /public/copilot/messages, sem requireAuth)
│       └── services/
│           ├── providers/     # avatarProvider (HeyGen/D-ID), voiceProvider
│           │                  # (ElevenLabs), scriptProvider (Anthropic/Gemini/
│           │                  # OpenAI) — todos reais, ver seção 3; só
│           │                  # embeddingProvider continua stub;
│           │                  # storageProvider (interface real + 3 stubs);
│           │                  # copilotProvider (real, usado por tenant e público);
│           │                  # platformKeys (quem paga cada caminho de IA);
│           │                  # platformKeyProbe (validação, SÓ leitura)
│           ├── chunking.ts, textExtraction.ts   # pipeline da base de conhecimento
│           ├── crypto.ts       # AES-256-GCM para credenciais (tenant e plataforma)
│           ├── platformCredentials.ts       # registro das 5 chaves da casa
│           ├── platformCredentialStore.ts   # ÚNICO módulo que decifra chave de plataforma
│           ├── platformCredentialValidation.ts  # valida sem expor o valor à rota
│           ├── passwords.ts, sessionStore.ts, storage.ts, notifications.ts, docs.ts
└── frontend/
    └── src/
        ├── App.tsx             # rotas: /login, /signup, /subscription, /create,
        │                       # /content, /settings — "/" é LandingPage só no
        │                       # domínio raiz (isRootDomain()), senão Dashboard
        ├── publicConfig.ts     # BASE_DOMAIN/WHATSAPP_NUMBER expostos via vite define
        ├── api/client.ts
        ├── auth/AuthContext.tsx
        ├── components/         # layout (AppShell, Header), ProtectedRoute, ui/
        ├── pages/
        │   ├── Login/
        │   ├── Dashboard/
        │   ├── Landing/        # LandingPage + PublicCopilotWidget (site público)
        │   ├── Subscription/   # "Minha Assinatura": plano, uso, pagamento, faturas
        │   ├── CreateVideo/    # steps: AvatarSetup, Script, ChooseAssets, Duration, Generate
        │   ├── Content/        # Documents, KnowledgeMedia, ReferenceImages
        │   └── Settings/       # CredentialCard, StorageProviderCard
        ├── locales/            # en.json, pt-BR.json
        └── theme/, styles/
```

---

## 5. Comandos de build, teste e execução local

Não há suíte de testes configurada no projeto até o momento.

**Execução completa via Docker Compose (recomendado):**
```bash
cp .env.example .env   # preencher ENCRYPTION_KEY, SESSION_SECRET (comandos de geração estão no .env.example)
docker compose up
```
Aplicação acessível em `http://localhost:8090` (porta do Traefik, configurável via `TRAEFIK_HTTP_PORT`).

**Backend isolado (dev):**
```bash
cd backend
npm install
npm run dev     # tsx watch src/index.ts
npm run build   # tsc -p tsconfig.json
npm start        # node dist/index.js (requer build prévio)
```

**Gotcha operacional (registrado 2026-07-21):** dentro do Docker Compose, o
`npm run dev` do backend (`tsx watch`) nem sempre recarrega sozinho ao editar
`backend/src/routes/*.ts` através do bind mount — o processo continua de pé
servindo a versão antiga do arquivo. Se uma edição de rota "não tiver
efeito" ao testar, rodar `docker compose restart backend` antes de suspeitar
de bug de lógica.

**Frontend isolado (dev):**
```bash
cd frontend
npm install
npm run dev       # vite --host 0.0.0.0
npm run build      # tsc -b && vite build
npm run preview    # vite preview --host 0.0.0.0
```

**Gotcha operacional (registrado 2026-07-22, já se repetiu pelo menos 2x
nesta data — teste do Stripe e rebrand da landing/logo):** o mesmo problema
do `tsx watch` acima também acontece do lado do frontend — o Vite dev
server dentro do Docker Compose às vezes continua servindo o bundle antigo
via bind mount depois de editar `.tsx`/`.css`, mesmo com HMR ligado (já
confirmado que não é só depois de instalar pacote novo — aconteceu em
edições simples de classe CSS e JSX). Regra prática: se uma mudança de
UI/CSS "não aparecer" no navegador depois de editar, rodar
`docker compose restart frontend` **antes** de investigar mais a fundo —
não assumir bug de lógica ou perder tempo depurando o código React.

**Variáveis de ambiente** (ver `.env.example`): credenciais do Postgres,
`BACKEND_PORT`, `FRONTEND_PORT`, `TRAEFIK_HTTP_PORT`, `SESSION_SECRET`,
`WHATSAPP_NUMBER` (opcional — em branco, o link "Fale conosco" some) e:

- **`ENCRYPTION_KEY`** — AES-256 para toda credencial cifrada, do tenant e da
  plataforma. **É a única que não pode sair do `.env`**: ela é o que abre as
  outras, e guardá-la no banco poria o cadeado dentro do cofre.
- **As cinco `PLATFORM_*_API_KEY`** — hoje são **retaguarda**. A origem
  preferida é o painel admin (aba APIs → "Chaves da plataforma"), que as grava
  cifradas no banco e faz valer sem reiniciar. `PLATFORM_KEYS_FORCE_ENV=1`
  inverte a precedência, para o caso de uma chave ruim gravada pela tela.
  Ver `services/platformCredentialStore.ts`.

**Como gravar uma chave sem exibi-la:** pelo painel admin (preferido), ou por
`npm run set-key`, que lê o valor por stdin com o eco desligado e escreve
direto no `.env`. Nunca cole uma chave numa conversa de chat — as que passaram
por isso estão registradas como comprometidas e pendentes de troca.

**Verificação visual de câmera/canvas quando o Browser pane bloqueia a câmera:**
procedimento padrão desde a Fase 4, usado primeiro pra validar o fundo virtual
e depois reaproveitado pro tratamento de qualidade de imagem (ver seção 7/8
pra detalhes de cada rodada).

- **Quando usar**: sempre que `getUserMedia`/câmera real estiver bloqueada no
  Browser pane (aconteceu em toda sessão até hoje) e a funcionalidade a
  validar depender de processamento de vídeo/canvas ao vivo — qualquer coisa
  que rode dentro do loop de `useCamera.ts` (fundo virtual, tratamento de
  imagem, etc.).
- **Como funciona**: Chrome real instalado no host
  (`C:\Program Files\Google\Chrome\Application\chrome.exe`), rodado headless
  via `puppeteer-core`, navegando para `/create` do app já em execução
  (`docker compose up`). Em vez de simular `getUserMedia`, contorna a câmera
  inteiramente: carrega como `<img>` dentro de `page.evaluate()` uma foto real
  já enviada por um avatar de teste — a primeira foto do avatar "Mário"
  (`uploads/<tenant_id>/dd7228f2-....jpg`), escolhida de propósito por já ser
  um caso real de ambiente mal iluminado e óculos, o cenário mais exigente
  pra segmentação/correção de imagem.
- **Assets reaproveitados**: quando o teste envolve segmentação (fundo
  virtual), importa o próprio módulo `@mediapipe/tasks-vision` já empacotado
  pelo Vite dev server em execução
  (`/node_modules/.vite/deps/@mediapipe_tasks-vision.js`) e o modelo
  self-hosted (`/mediapipe/selfie_segmenter.tflite` + `/mediapipe/wasm/`) —
  ou seja, testa o código real do app, não uma reimplementação. Quando o
  teste é só matemática de pixel sem ML (ex.: brilho/contraste/nitidez/ruído
  de `applyQualityTreatment.ts`), o script reimplementa a lógica manualmente
  dentro do `page.evaluate()`, porque não dá pra importar um `.ts` não
  compilado direto do browser — nesse caso precisa manter os dois em sincronia
  à mão se a lógica real mudar, já que podem divergir silenciosamente.
- **Onde fica / como recriar**: não é parte do repo — vive no scratchpad de
  uma sessão (`...\AppData\Local\Temp\claude\<hash-do-projeto>\<id-da-sessão>\
  scratchpad\segtest\`), que é efêmero e pode não existir mais numa sessão
  futura. Pra recriar do zero: `npm init -y && npm install puppeteer-core`
  nessa pasta, escrever um script `.js` (lançar Chrome com `executablePath`
  apontando pro Chrome real, `headless: "new"`, e só adicionar
  `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist` se o teste usar
  WebGL/MediaPipe — dispensável pra testes de canvas puro), navegar pra URL do
  app, rodar a lógica em `page.evaluate()`, salvar os resultados como JPEG via
  `canvas.toDataURL()` → `fs.writeFileSync`.
- **Resultados**: salvos como `.jpg` na mesma pasta do script (ex.:
  `before.jpg`/`after.jpg` pro fundo virtual;
  `quality-original.jpg`/`quality-dim.jpg`/`quality-auto.jpg`/
  `quality-manual.jpg` pro tratamento de imagem) — lidos de volta via Read
  (que renderiza imagem) pra comparação visual antes/depois. Não são
  commitados no repo, são só artefato de verificação.

---

## 6. Roadmap de fases (produto → SaaS vendável)

Objetivo maior: evoluir de ferramenta interna multi-tenant para produto SaaS
vendável, com landing page pública, cadastro self-service e modelo freemium
configurável.

**Arquitetura em 3 zonas:**
- **Public site** — landing page, pricing, cadastro self-service (`/signup`),
  copiloto público de demonstração (sem acesso a dados de tenant).
- **Tenant app** — o que já roda hoje (Dashboard, Create video, Content,
  Settings), mais uma aba nova em Settings → Billing.
- **Platform admin** — área nova, isolada por um papel `platform_admin`
  (não depende de `tenant_id`): lista de tenants, definição de planos, toggle
  freemium on/off, métricas gerais.

**Decisões de arquitetura travadas:**
- **Pagamento:** Stripe para o billing da plataforma (diferente do BYOK dos
  provedores de IA — pagamento é uma conta única, controlada pela plataforma).
- **Papel de usuário:** flag `platform_admin` nos usuários, completamente
  separado das permissões de qualquer tenant.
- **Armazenamento como diferencial de plano:**
  - Google Drive do próprio tenant (OAuth) — sem custo de storage pra plataforma.
  - Hospedado na plataforma (S3/R2) — opção de conveniência do plano pago.

**Status das fases:**

| Fase | Descrição | Status |
|---|---|---|
| 1 | Multi-tenant, criação de tenant via rota admin | Concluída |
| 2 | Header redesign (idioma/tema, notificações, jobs) | Concluída |
| 3 | Copiloto de IA autenticado + pasta `/docs` | Concluída |
| 4 | Ajustes de UI/UX: navegação, campos de IA em Cenário/Traje, tooltips, ajuda contextual "i" | Concluída |
| 5 | Cadastro mínimo (`/signup`) + subdomínio por tenant + "Minha Assinatura" + landing pública + copiloto público + StorageProvider + WhatsApp | Concluída |
| 6 | Billing (Stripe, upgrade/downgrade, limites do free) | Planejada |
| 7 | Painel admin da plataforma (planos, toggle freemium, métricas) | Planejada |

> **Nota de dependência:** a Fase 5 usa o conteúdo de `/docs` (criado na Fase 3)
> para alimentar o copiloto público de demonstração. Por isso a ordem correta é
> Fase 3 → Fase 5 → Fase 6 → Fase 7.

> **Nota sobre o escopo real da Fase 5:** o prompt original da Fase 5 previa um
> site público completo (landing page, pricing) com um copiloto de
> demonstração. A primeira sessão da Fase 5 entregou uma versão mais restrita:
> cadastro mínimo (`/signup`, só email+senha) + provisionamento de subdomínio
> por tenant + a tela "Minha Assinatura" — deixando explícito que a landing
> page pública, o copiloto público, o link de WhatsApp e o `StorageProvider`
> ficavam pendentes. Uma sessão seguinte (mesma Fase 5, ver seção 7) completou
> esses quatro itens. Escopo original da Fase 5 hoje 100% coberto.

**Arco paralelo iniciado em 2026-07-21: rebrand TWINAI → eckko.ai + fundação
de painel admin.** Não é uma fase numerada da tabela acima — corre em
paralelo, com disciplina própria de Fase A (preview estático, sem tocar o
app real) → aprovação → Fase B (aplicar de verdade). Decisões travadas nesta
rodada:
- **Nome:** "eckko.ai" em texto/UI/i18n; "eckkoai" (sem ponto) em
  identificadores técnicos (package.json, env vars, nomes de serviço Docker)
- **Paleta pixel-verificada:** verde primário `#9CEE06`, preto `#000000`
  (texto/wordmark) / `#0D0D0D` (fundo), cinza-chumbo `#1A1E20`, roxo
  `#7B2CFF`, ciano `#00F0FF`, branco `#FFFFFF` — ver seção 7 (2026-07-21) para
  a metodologia de verificação e os valores divergentes já descartados
- **Modelo de negócio:** migrar de BYOK para chave-da-plataforma (crédito do
  cliente); cobrança híbrida (assinatura + créditos sob demanda) — ver nota
  na seção 1. Decisão confirmada pelo usuário, migração ainda não construída
- **Configurações → painel admin:** painel admin completo (billing Stripe,
  créditos, migração BYOK→plataforma) fica para planejamento dedicado
  próprio, mesma disciplina auditoria→desenho→preview→aprovação.
  ~~Acesso ao admin: mesmo login, roteamento pós-auth por papel (`role:
  admin | tenant`)~~ — **implementado com desenho diferente:** identidade de
  admin separada (`admin_users` + `/admin/login` próprio), não uma role no
  mesmo login do tenant. Sem link "Admin" público na landing
- **Fase B desta rodada:** a fundação (login `admin_users` + `requireAdmin` +
  rota `/admin/*` no frontend) **já foi construída e verificada** — ver seção
  7, entrada "Continuação desta mesma sessão". As rotas de leitura/edição de
  tenant (credenciais, storage provider) e o lockdown das mesmas rotas do
  lado do tenant também já existem. Nenhuma tela de billing/créditos ainda

---

