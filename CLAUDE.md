Always respond in Brazilian Portuguese.

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

## 7. Status atual (atualize ao FIM de cada sessão)

**Última atualização:** 2026-08-01 — Bloco DEMO-1: o caminho principal do MVP
(foto → avatar → voz → vídeo → download) foi percorrido inteiro no navegador em
modo fixture, com **zero chamadas a fornecedor**. Corrigido o defeito que
impedia criar avatar sem câmera, adicionada validação de artefato de vídeo em
dois pontos, e criado `npm run preflight:live`. Antes dele, o Bloco CHAVES-2:
chaves da plataforma cifradas no banco, com tela no admin, resolução por
requisição (banco vence `.env`, invertível por `PLATFORM_KEYS_FORCE_ENV=1`) e
nenhuma rota que devolva valor em claro. Ver as seções próprias no fim.

**Este arquivo foi condensado nesta data**: o histórico cronológico virou uma
tabela de uma linha por bloco (seção 8), e o que ainda vale como regra está nas
seções **Decisões travadas**, **Riscos**, **Pendências** e **Gotchas** do
HANDOFF. O detalhe de execução de cada bloco está nas mensagens de commit, que
são longas de propósito neste projeto. Leia o HANDOFF antes de qualquer coisa.

---

## HANDOFF — leia esta seção inteira antes de tocar em qualquer coisa

Escrito para quem chega **sem nenhum contexto** da conversa anterior. O que
vem a seguir está em "Frente aberta".

### O que é isto, em cinco linhas

eckko.ai (nome antigo: TWINAI) é um SaaS multi-tenant que gera vídeos de
avatar digital falando um roteiro. Roda inteiro em Docker Compose com quatro
serviços — `traefik` (única porta exposta, `8090`), `postgres`, `backend`
(Fastify/TS) e `frontend` (React/Vite). Existe uma **demo a apresentar**, e a
maior parte do trabalho recente é blindagem para ela, não funcionalidade
nova. O produto é vendido com assinatura + créditos via Stripe (real,
testado), e as chaves de IA hoje ainda são BYOK por tenant no código.

### Como validar que está tudo de pé (faça isto primeiro)

```bash
./tools/up.sh
```

Sobe os quatro serviços, espera cada um ficar *healthy* (com timeout) e só
devolve o controle depois de confirmar **landing 200 e `/api/health` 200** —
porque `docker compose up -d` volta quando os containers foram criados, que
não é a mesma coisa que a aplicação responder. Não consome tentativa de
login nem fala com fornecedor. Equivalente: `npm run up`.

Depois, para conferir a demo inteira:

```bash
./tools/smoke-demo.sh
```

21 verificações numa passada: containers, landing, os três caminhos de
entrada, credenciais fixas, avatar treinado, créditos, credenciais de
provedor, e se o Vite está servindo bundle atualizado. **Não gasta nenhuma
requisição de fornecedor.** Sai 1 se algo que a demo usa estiver quebrado.
Ele consome 2 das 5 tentativas/15min do rate limiter de login — **rode uma
vez só**. Complemento, para o gate de qualidade do código:

```bash
docker compose exec backend npm run check
```

Typecheck + sete invariantes de documentação + duração de roteiro +
sanitização de erro de vendor + probe de credencial. Última execução:
ambos verdes, 21/21 e "todas as invariantes passaram".

### Estado por bloco (frente do copiloto como suporte real)

| Bloco | Assunto | Estado |
|---|---|---|
| 0 | Viabilidade do RAG | **Concluído — reprovou o RAG.** Falta peça, não é bug |
| 1 | Allowlist de visibilidade dos docs | Concluído |
| 1.5 | Política congelada em teste que falha (`npm run check`) | Concluído |
| 1.6 | Bateria adversarial no copiloto do tenant | Concluído — 10/10 bloqueadas |
| 2A | Remoção das afirmações falsas dos docs | Concluído (deixou buracos de propósito) |
| 2B | Escrever a documentação nova | **NÃO INICIADO — é o próximo** |
| 3 | RAG de verdade | **Bloqueado**: falta chave de embedding |
| 4 | Diagnóstico por SQL escopado | Livre |
| 5 | Ajuda por campo | Livre |
| 6 | Isolamento entre tenants | **Bloqueado**: depende do Bloco 3 |
| 7 | Teto de perguntas + truncagem | Livre |

Blocos de blindagem para a demo (numeração paralela, já concluídos): erro de
vendor sanitizado + falha visível na tela; duração-alvo de roteiro;
`tools/smoke-demo.sh`; e este Bloco 6 (resiliência de ambiente).

### Frente aberta e próximo bloco

**Próximo é o Bloco 2B: escrever a documentação nova.** O 2A apagou o que era
falso e deliberadamente **não** substituiu — apagar leva minutos, reescrever
leva horas, e uma declaração comercial falsa a quem é cobrado via Stripe não
podia esperar. A lista exata dos buracos, arquivo por arquivo, está na tabela
"LACUNAS DEIXADAS PELO 2A" mais abaixo nesta mesma seção. Comece por ela.

**Não comece o Bloco 3 (RAG)** antes de existir chave de embedding: hoje
`embeddingProvider.ts` devolve `Math.random()` e **não existe código de
recuperação vetorial** — nenhuma query usa `<=>`, `document_chunks` só recebe
`INSERT` e nunca é lido. Falta nas duas pontas. (Desde o CHAVES-2 já existe
**onde guardar** a chave — o slot `embedding` no painel admin, validável — mas
guardar não é usar: `embeddingProvider.ts` continua sem consumi-la.)

**Antes de trocar o ambiente para `live`, rode:**

```bash
docker compose exec backend npm run preflight:live
```

Não chama fornecedor nenhum e termina numa linha só: `PRONTO PARA LIVE` ou o
que falta. Hoje falta só `PROVIDER_LIVE_CONFIRM`.

**Também em aberto, do PENDENCIAS-1:** as Partes 3 e 4 nunca foram feitas (a
Parte 5 teve a origem dos `.mp4` de 16 bytes resolvida no DEMO-1, e a validação
de artefato no download foi construída lá; sobrou decidir se os 2 arquivos
órfãos são apagados).
A mais importante é a **Parte 3 — auditoria das guardas existentes**: levantar
quais guardas antigas passam verde sem inspecionar nada. Essa classe de defeito
já apareceu três vezes (a flag no VIDEO-0, a de credencial que só pegou por
acaso, e a de chave de plataforma no CHAVES-2, que na primeira versão acusava
o próprio comentário que a explicava).

### Decisões travadas — não reabrir

1. **`PLATFORM_COPILOT_API_KEY` será uma chave Anthropic.** Não invente
   `PLATFORM_COPILOT_VENDOR`: `askCopilot()` faz `vendor = input.vendor ??
   "anthropic"` e nem `public.ts` nem `adminCopilot.ts` passam vendor. Colar
   uma chave Gemini ali a manda para `api.anthropic.com` e dá 401.

1b. **A chave do copiloto do TENANT está FECHADA desde 2026-07-31**: é a
   chave **Google DA PLATAFORMA** (`PLATFORM_GOOGLE_API_KEY`), não a BYOK do
   cliente. Suporte deixou de exigir que o cliente conecte provedor — cobrar
   configuração de API para poder pedir ajuda sobre o produto era o oposto do
   que suporte deve ser. São **cinco** chaves de plataforma distintas, e
   confundi-las é o erro recorrente aqui:

   | Id / variável | Vendor | Serve a |
   |---|---|---|
   | `copilot` · `PLATFORM_COPILOT_API_KEY` | Anthropic | copiloto público e do admin |
   | `google` · `PLATFORM_GOOGLE_API_KEY` | Google | **só o copiloto do tenant** |
   | `embedding` · `PLATFORM_EMBEDDING_API_KEY` | Google | só embeddings |
   | `heygen` · `PLATFORM_HEYGEN_API_KEY` | HeyGen | nada ainda — só guardada e validável |
   | `elevenlabs` · `PLATFORM_ELEVENLABS_API_KEY` | ElevenLabs | idem |

   **Correção de 2026-08-01:** este arquivo dizia que a chave `google` servia
   "roteiro e copiloto do tenant". Serve só ao copiloto —
   `routes/scripts.ts` lê a credencial do tenant direto, sem passar por
   `resolveTenantAiKey`.

   A de embedding é separada da de roteiro **mesmo sendo o mesmo vendor**:
   indexação é consumo em lote com limite diário próprio, e dividir cota com
   o suporte faria uma reindexação derrubar o copiloto. Enquanto a chave
   `google` não existir (nem no painel nem no `.env`), o copiloto do tenant cai
   na credencial do cliente como retaguarda — ver
   `services/providers/platformKeys.ts`.
   **O teto de ~20 requisições/dia por projeto deixou de ser o limite do
   suporte** e não deve mais ser citado como restrição em doc nem em UI.

1c. **Desde 2026-08-01 estas chaves moram no BANCO, cifradas** (tabela
   `platform_credentials`), gravadas pela aba APIs do painel admin. As
   variáveis de ambiente continuam valendo como retaguarda.

   - **Precedência: banco > `.env`.** Gravar pelo painel vale na requisição
     seguinte, sem reiniciar.
   - **`PLATFORM_KEYS_FORCE_ENV=1` inverte**, e existe para um caso concreto:
     uma chave ruim gravada pela tela tranca do lado de fora justo quem
     precisaria entrar para consertá-la. É lida no boot — é decisão de
     operação, não de requisição.
   - **`ENCRYPTION_KEY` é a única que NÃO pode migrar para o banco**: ela é o
     que abre as outras. No banco, o cadeado ficaria dentro do cofre.
   - **Nenhuma rota devolve valor em claro, nem para admin.** Gravar e
     substituir, sim; ler de volta, nunca. Quatro invariantes de
     `npm run check` cobram isso. Não crie um endpoint de leitura "só para
     depurar".
2. **Embedding será `gemini-embedding-001`, a 1536 dimensões via
   `output_dimensionality`, com chave DA PLATAFORMA** em variável de
   ambiente própria — nunca a BYOK de um tenant.

   *(Correção de registro, 2026-07-31: este arquivo dizia
   "`text-embedding-3-small` da OpenAI" e listava os blocos de RAG como
   bloqueados por falta de chave OpenAI. Estava errado — a decisão travada
   é a de cima. A chave que falta é a da plataforma para o Gemini.)*

   Três gotchas que vêm junto com essa escolha e precisam estar no código
   desde a primeira versão, não descobertos depois:
   - **Normalização manual abaixo de 3072 dimensões.** O modelo só devolve
     vetor normalizado no tamanho nativo; pedindo 1536 via
     `output_dimensionality`, a normalização é responsabilidade nossa. Sem
     ela, similaridade de cosseno compara magnitudes além de direções, e o
     ranking sai errado de um jeito plausível — que é o pior tipo de erro,
     porque não parece defeito.
   - **Teto de 2048 tokens por texto.** O chunking
     (`services/chunking.ts`) precisa respeitar isso; chunk maior é
     truncado pelo vendor, e o pedaço perdido some sem aviso.
   - **Batelada obrigatória por causa do limite diário de requisições.**
     Uma chamada por chunk estoura a cota em qualquer base real. Indexar
     tem de agrupar chunks por requisição desde o começo — reescrever o
     ingestor depois é bem mais caro que já nascer em lote.

   Nada disso foi implementado, e nenhuma chave foi testada.
3. **A fonte única de limites de plano é a tabela `plans`**; `plans.ts` só lê
   dela. Não crie uma segunda fonte.
4. **O manifesto de exposição dos docs mora no backend**
   (`docsManifest.ts`), não em frontmatter dentro de `docs/`. Motivo: "o que
   um anônimo lê?" tem que se responder num arquivo só, e escrever
   documentação deve ser um ato separado de decidir sua exposição.
5. **Um índice é tão confidencial quanto o item mais confidencial que ele
   indexa.** Foi assim que o `README.md` de `docs/` vazou os nomes de
   `docs/admin/`. Nomear um arquivo de nível superior já é vazamento.
6. **Migração BYOK → chave-da-plataforma** (cliente consome crédito) está
   decidida e **não construída**. O código segue 100% BYOK.
7. **Créditos são "use ou perca"** — o grant mensal reseta o saldo, não
   acumula.

### Pendências com dono

| O quê | Dono | Observação |
|---|---|---|
| Gravar a chave **Anthropic** (`copilot`) pelo painel | **usuário** | Sem ela, copiloto público e do admin **nunca responderam** |
| Gravar a chave **Google** (`google`, com créditos) pelo painel | **usuário** | Copiloto do tenant. Enquanto ausente, ele cai na credencial do cliente |
| Gravar a chave **Google de embedding** pelo painel | **usuário** | `gemini-embedding-001`; desbloqueia os Blocos 3 e 6 |
| **Trocar a chave Google de desenvolvimento antes de VPS/produção** | **usuário** | Passou por transcrição de chat ⇒ comprometida. Ver a seção de aviso própria |
| Gravar HeyGen/ElevenLabs da plataforma (opcional) | **usuário** | Só habilita validação e leitura de saldo; a geração continua na credencial do cliente |
| Rotacionar as senhas de `admin@eckkoai.com` e `demo@eckko.ai` | **usuário** | Mesmo motivo; via `npm run dev:seed-access` |
| Pôr saldo no HeyGen | **usuário** | Hoje comporta ~1 vídeo, ver tabela de cota |
| Billing/cota do Gemini (sair do free tier) | **usuário** | Criar projeto novo a cada teto batido não escala |
| Conferir os 9 valores de `provider_cost_rates` | **usuário** | São placeholder; toda tela já mostra banner de estimativa |
| Escrever o Bloco 2B | próxima sessão | Insumo pronto na tabela de lacunas |
| Validar fundo virtual com câmera real | **usuário** | Câmera bloqueada em toda automação desta ferramenta |
| **Ligar o autostart do Docker Desktop** | **usuário** | Verificado: `AutoStart: false` em `%APPDATA%\Docker\settings-store.json`. **Não é código** — nenhuma política de restart do Compose ajuda se o próprio daemon não estiver rodando. Caminho: **Docker Desktop → ícone de engrenagem (Settings) → General → marcar "Start Docker Desktop when you sign in to your computer"** |

### Riscos conhecidos e NÃO corrigidos

- ~~Não há recuperação automática confiável do ambiente.~~ **Corrigido no
  bloco ACESSO-FINAL.** O backend agora morre quando o bootstrap falha e volta
  sozinho quando o Postgres retorna, medido. O que continua verdade é a
  dependência externa: **se o daemon do Docker não estiver rodando, nada disso
  vale** (ver pendência de autostart na tabela acima).
- ~~`/admin` pela barra de endereço entra em laço.~~ **Corrigido no bloco
  ACESSO-FINAL** — a causa era o `LoginPage` unificado navegando client-side,
  não o `AdminAuthProvider`, que sempre revalidou.
- **`Sair` em qualquer zona derruba admin e tenant juntos** —
  `session.destroy()`, as duas sessões vivem no mesmo cookie.
- **Em `/admin/login`, o autofill preenche a credencial do TENANT**, não a
  do admin. Não é bug: essa rota renderiza o `LoginPage` unificado, que é o
  formulário do cliente. Mas confunde — a porta certa do admin é o
  "Acesso administrativo" no rodapé da landing, que preenche o admin.
- **"Créditos restantes" mostra "—"** no painel do tenant embora
  `tenant_credits` tenha saldo real. Bug de UI, catalogado, não corrigido.
- **"6/2 vídeos este mês"** na Minha Assinatura: contador por plano e saldo
  de crédito se contradizem na tela.
- **Moeda inconsistente**: landing em `R$`, app em `$`.
- **`masked_key` mostra os últimos caracteres do texto cifrado**, não da
  chave — inútil para identificar qual chave está lá.
- **Header quebra abaixo de ~500px.**
- Nenhum destes bloqueia a demo pelo caminho ensaiado.

### Bloco PENDENCIAS-1 — galeria e carteira (PARCIAL: partes 1 e 2)

**Galeria de passos em `/dev/steps`** ([StepGallery.tsx](frontend/src/dev/StepGallery.tsx)),
só com `DEV_GALLERY=1`; em produção a rota **não é registrada**, então cai
no 404 em vez de virar tela vazia — uma rota que responde 200 com nada
esconde que o caminho continua vivo. `npm run check` reprova a flag ligada
com `NODE_ENV=production` (provado).

A galeria monta os **componentes reais** dos 5 passos, mais Conteúdo e o
Painel admin — nenhuma cópia. Cópia envelhece sozinha e passa a mostrar uma
tela que não existe mais, o que é pior que não ter galeria.

**Inércia, com número em vez de promessa:** `installGalleryFetch()`
substitui `window.fetch` por um interceptor sem caminho de escape —
requisição desconhecida é bloqueada, nunca repassada. Os contadores ficam na
própria tela. *Medido na captura:* `served: 11, blocked: 8, escaped: 0`, e o
Chrome registrou **0 requisições a hosts externos**.

**O item que estava cego no VIDEO-0 foi fechado:** o bloco de fundo aparece
**sem câmera**, porque quem o revela é o estado `draftAvatar`, não a câmera.
*Medido:* flag desligada → bloco inerte com o motivo ("depende de teste
ainda não realizado com a HeyGen"), sem seletor; flag ligada → seletor
presente, sem bloco de indisponibilidade.

**Dois defeitos que a própria galeria expôs**, ambos de contexto faltando:
`FieldHelpIcon` exige o `CopilotProvider` e o painel admin exige o
`AdminCopilotProvider` — sem eles a árvore inteira caía. Daí saiu a correção
mais útil do bloco: um **error boundary por painel**
([GalleryBoundary.tsx](frontend/src/dev/GalleryBoundary.tsx)). Sem ele, um
passo quebrado deixava TODAS as capturas em branco, um sintoma que mente
mais que o defeito original.

**Capturas** ficam em `.gallery-shots/`, **fora do git** (screenshot no
repositório o incha e desatualiza a cada mudança de UI). Regeradas por um
script puppeteer no scratchpad — efêmero, ver seção 5 para recriar.

**Proteção da carteira (Parte 2).** A proteção só olhava para um lado:
impedia `fixture` em produção, mas nada impedia `live` em desenvolvimento —
e trocar uma palavra no `.env` liberava chamada real numa carteira que
comporta cerca de um vídeo. Agora
([liveGuard.ts](backend/src/services/providers/liveGuard.ts)):

1. **Intenção explícita.** `live` exige `PROVIDER_LIVE_CONFIRM` com valor
   exato. É uma frase, não `true`: o texto é metade da proteção, porque quem
   digita aquilo leu o que estava digitando. *Medido:* sem ela o servidor
   **não sobe** — `exit_code=1`, e o entrypoint propaga ao PID 1.
2. **Teto por sessão**, default **1**, aplicado em `generateVideo` e
   `cloneVoice`. Intenção protege do acidente de configuração; o teto
   protege do laço que dispara dez vezes, que nenhuma declaração impediria.
3. **Log inequívoco no boot**, nos dois modos — subir gastando dinheiro real
   não pode ser indistinguível de subir em simulação na leitura do log.

**O que NÃO foi feito deste bloco** (cortado no ponto que você previu):
- **Parte 3 — auditoria das guardas existentes.** Nenhuma das guardas
  antigas ganhou caso versionado de reprovação, e **não foi levantado quais
  delas passam verde sem inspecionar nada**. Esta é a mais importante das
  três que ficaram: é exatamente a classe de defeito que já apareceu duas
  vezes (a de flags no VIDEO-0, e a de credencial que só pegou por acaso).
- **Parte 4 — retaguarda BYOK visível e com remoção agendada.**
- **Parte 5 — origem dos `.mp4` de 16 bytes e validação de artefato no
  download.** Os arquivos continuam em `uploads/4bbed629/`.

### Bloco VIDEO-0 — modo fixture, feature flags e chaves (CONCLUÍDO)

**1. `PROVIDER_MODE=fixture` gera de ponta a ponta sem tocar a rede.**
Vale só para HeyGen e ElevenLabs (os caros); provedores de texto ficam de
fora de propósito. Padrão `fixture` em desenvolvimento, `live` em produção,
e valor inválido cai no seguro em vez de virar um terceiro modo silencioso
([providerMode.ts](backend/src/services/providers/providerMode.ts)).

O que dá valor ao modo é ele **não** devolver o resultado pronto: o job
simulado fica 12 s em `processing` antes de concluir. Um stub que responde
"pronto" na primeira chamada esconderia justamente os defeitos de fluxo
assíncrono. *Medido:* `queued → processing → processing → ready`, depois
download **HTTP 200** com `Content-Disposition: attachment` e 50.600 bytes
— exatamente o tamanho da fixture.

As fixtures são geradas por ffmpeg e **versionadas** em `backend/fixtures/`
(mp4 h264 640×360 5 s com áudio; mp3 3 s). Antes de gerar, procurei
artefatos aproveitáveis: os únicos mp4 do projeto tinham **16 bytes**
(placeholders vazios), e os mp3/wav existentes são de um tenant real —
versionar dado de cliente como fixture não era opção.

*Dois defeitos achados por rodar de verdade, não por revisar:* o Dockerfile
não copiava `backend/fixtures/`, então a simulação falhava **no meio do
job** (o pior momento para descobrir); e o proxy de download recebia URL
relativa e devolvia 502. O segundo foi corrigido resolvendo a URL contra o
próprio servidor, e **não** desviando para leitura em disco — desviar faria
o proxy só rodar em produção, que é onde não se quer descobrir defeito nele.

**2. Marca de simulação, por item e não por ambiente.** `SimulatedBadge`
usa o fato gravado na linha (`videos.simulated`), com o modo global só como
retaguarda. *Verificado na tela:* na Biblioteca de vídeos, os 3 vídeos de
fixture aparecem com **SIMULADO** e os 3 vídeos reais do HeyGen **não** —
mesmo com o ambiente inteiro em modo fixture. Fosse pelo modo global, os
reais teriam sido marcados como simulados, que é a mentira inversa.

**3. Ledger separado.** `credit_ledger.simulated` é coluna própria, não um
`reason` novo — simulação é ortogonal ao motivo, e codificá-la dentro de
`reason` dobraria a lista a cada modo. `GET /admin/tenants/:id/credit-usage`
devolve `real` e `simulated` em listas separadas, **nunca somadas**, e a
tela repete o aviso. *Medido:* `video real=1, video simulado=3`.

**4. Registro de feature flags** ([featureFlags.ts](backend/src/services/featureFlags.ts)):
o código define quais existem e o **motivo**; a tabela `feature_flags`
guarda o estado, alternável pelo admin sem rebuild. Primeira flag:
`removable_background`, **desligada**, motivo "depende de teste ainda não
realizado com a HeyGen". Contrato de UI: recurso atrás de flag desligada
aparece inerte **com o motivo** — nunca some, nunca vira botão que dá erro.

**5. Chaves de plataforma separadas** — ver decisão 1b acima.

**Quatro guardas novas no `npm run check`, todas provadas reprovando:**
fixture com `NODE_ENV=production`; caminho de vendor sem consultar
`isFixtureMode()`; flag fora do registro; e o caso que **deve** passar.

**Achado que vale registrar:** a guarda de flag, na primeira versão, **não
pegava nada** — a lista de helpers trazia `useFeatureFlag`, e o hook real
chama-se `useFeature`. Ela passava sem inspecionar uma linha sequer. Uma
guarda que não casa com nada é pior que guarda nenhuma, porque parece
cobertura. Só apareceu porque testei se ela reprovava de verdade.

**Não verificado visualmente:** o contrato de flag na tela de avatar. O
bloco de fundo só renderiza depois de "Iniciar captura", e a câmera é
bloqueada nesta ferramenta. Verificado por API (o motivo chega ao cliente)
e por código, não por olho.

### Bloco ACESSO-FINAL — ambiente de pé e acesso destravado (CONCLUÍDO)

**1. O backend agora morre de verdade quando o bootstrap falha.** O Bloco 6
tinha diagnosticado o modo de falha (container `running`, servidor morto,
`tsx watch` sobrevivendo ao filho); aqui ele foi corrigido na causa.

A escolha foi separar **migrar de servir** num entrypoint
([backend/docker-entrypoint.sh](backend/docker-entrypoint.sh)): `set -e` faz
a falha do migrate encerrar o PID 1 com código ≠ 0, e `exec` faz o servidor
*ser* o PID 1, de modo que a morte dele seja a morte do container. As outras
duas opções foram descartadas com evidência, não por gosto: **propagar a
saída pelo `tsx watch` é impossível** — o `--help` do tsx instalado só
oferece `--no-cache`, `--tsconfig`, `-h`, `-v`, nenhuma flag de exit code; e
**autoheal** acrescentaria um quinto container vigiando sintoma em vez de
corrigir a causa.

**Consequência deliberada: sem `watch` dentro do container.** O hot reload
já não era confiável através do bind mount (editar rota exigia restart
manual de qualquer jeito — está registrado neste arquivo), então ele cobrava
o custo de esconder crashes sem entregar o benefício. `npm run dev` continua
existindo com watch para uso local; o container usa `npm run serve`.

*Medido, não deduzido:* com o Postgres derrubado, o backend saiu de
`running` e entrou em `restarting` com `RestartCount` subindo de 2 a 9; ao
subir o Postgres de volta, **`/api/health` voltou a 200 em +20s sem nenhuma
ação humana**.

**2. Os quatro serviços têm restart policy e healthcheck.** Faltavam
healthchecks no traefik e no frontend. O do traefik usa `traefik
healthcheck`, o comando da própria imagem, o que exigiu habilitar `ping: {}`
em `traefik/traefik.yml` (vem desabilitado por padrão). Isso importa porque
traefik é a única porta exposta: de pé mas sem rotear, o endereço "existe" e
não funciona, que é o modo de falha mais confuso de diagnosticar.

**3. O loop do `/admin` foi corrigido — e a causa registrada aqui estava
errada.** Este arquivo dizia que "o `AdminAuthProvider` não revalida a
sessão". Ele revalida: tem `refreshMe()` no mount e no próprio `login()`. A
causa real é outra: `/admin/login` renderiza o **`LoginPage` unificado**,
que autentica pelo `AuthContext` do *tenant* e fazia `navigate("/admin")`
client-side. Isso não remonta o `AdminAuthProvider`, então `admin` seguia
`null`, o `AdminProtectedRoute` rejeitava e devolvia para `/admin/login` — e
cada volta queimava uma tentativa do limiter, fazendo o sintoma parecer
"senha errada". Correção: navegação **real** nesse caso, como o
`AdminLoginModal` já fazia. `refreshMe` também passou a ser exposto no
contexto, para quem adicionar um caminho client-side no futuro.

*Medido:* com o limiter zerado, o primeiro 429 cai na 6ª tentativa (limite
5). Depois de **cinco** acessos a `/admin` pela barra de endereço, o
primeiro 429 continua na 6ª — ou seja, `/admin` não consome tentativa
nenhuma. E o login pelo modal do rodapé leva ao Painel admin de primeira,
verificado com clique real.

**4. Limiter de login configurável, com o default igual ao valor de
produção** ([loginRateLimitPolicy.ts](backend/src/services/loginRateLimitPolicy.ts)).
Afrouxar é opt-in por variável de ambiente; `npm run check` **reprova o
build** se um valor folgado estiver ativo com `NODE_ENV=production`. Valor
inválido ou negativo cai no default em vez de virar `NaN` — um limiter com
`NaN` compararia sempre falso e desligaria a proteção em silêncio.

**5. Credenciais de dev preenchem os formulários, sem literal no fonte.** Os
valores entram só por `define` do Vite, lidos do `.env` (fora do git), e
falham fechado: sem `DEV_AUTOFILL=1`, e em qualquer build de produção,
chegam vazios. Há aviso visível ao lado dos campos.

**Achado no caminho, e é o mais sério deste bloco:** as senhas de dev
**estavam publicadas no repositório** — como default de um `||` em
`backend/scripts/seedDevAccess.ts`, que é versionado. Um default confortável
é exatamente como uma senha vaza: ninguém a digita, então ninguém percebe
que ela está no git. Os defaults foram removidos (o script agora exige as
variáveis) e `npm run check` passou a varrer o fonte procurando o valor das
`DEV_*_PASSWORD`. **A guarda provou seu valor imediatamente: reprovou o
build por causa de um comentário que eu mesmo escrevi citando a senha
antiga.** Como as senhas estiveram no histórico do git, continuam valendo
como comprometidas — a rotação já pendente segue pendente.

**Todas as guardas novas foram provadas falhando de verdade**, não só
escritas: limiter folgado com `NODE_ENV=production`; `DEV_AUTOFILL=1` com
`NODE_ENV=production`; serviço sem healthcheck e serviço sem restart (num
compose de teste, em diretório temporário — nunca com `git checkout` sobre
arquivo modificado, pela lição já registrada); e a de credencial literal.
Também foi verificado o caso que **deve passar**: limiter folgado fora de
produção não reprova nada.

**6. Porta de entrada única na landing.** "Começar agora"/"Começar grátis" e
"Já tenho conta" abrem o **mesmo** painel, em abas diferentes ("Criar conta"
é a padrão) — quem erra o botão troca de aba em vez de voltar. "Entrar"
continua navegando de verdade para o subdomínio do tenant, que é onde o
lookup é escopado. Os botões **dos planos** continuam indo direto para
`/signup`: ali o cliente já escolheu o plano, e interceptar com um painel
adicionaria um passo no funil de compra. **Se você quiser os planos também
passando pelo painel, é uma linha — não fiz por não ser reversível sem
decisão sua.**

### Bloco 6 — resiliência de ambiente (CONCLUÍDO, com dois achados)

Duas edições em `docker-compose.yml`, ambas commitadas: `restart:
unless-stopped` no **traefik** (era o único dos quatro sem política, e é o
único exposto ao navegador) e um `healthcheck` em `/health` no **backend**.

**Achado 1 — a política de restart funciona; o teste anterior é que estava
errado.** A sessão anterior matou os quatro containers com `docker kill`,
viu que não voltaram, e registrou como possível falha do Docker
Desktop/WSL2. Refeito um por vez, a causa ficou isolada e é outra:

- Matei **só** o frontend. Resultado: `Exited (137)`, `restartCount=0`,
  **60 s inteiros sem voltar** — e os outros três seguiram `running`. Ou
  seja, **o daemon nunca caiu**; a hipótese do kill múltiplo está descartada.
- Container descartável com a mesma política, saindo sozinho com `exit 1`:
  `restartCount` subiu para 1, depois 2. **A política reinicia.**
- O mesmo container, morto com `docker kill`: `Exited (137)`,
  `restartCount=0`, não voltou.

**Conclusão: `docker kill` não simula crash.** O daemon o trata como parada
solicitada pelo operador, igual a `docker stop`, e `unless-stopped` significa
literalmente "reinicie, a menos que tenham parado" — kill conta como parar.
Não é limitação do Docker Desktop nem do WSL2 (`LiveRestore=false` foi
verificado e não teve papel aqui). Para testar recuperação, faça o processo
morrer por conta própria.

**O `docker compose ps` "vazio" também tem explicação prosaica:** sem `-a`
ele **só lista containers em execução**. Quatro containers `exited` produzem
listagem vazia sem que nenhum tenha desaparecido. Use `docker compose ps -a`
ao diagnosticar.

**Achado 2, mais sério — o backend tem um modo de falha em que o container
mente `running`.** Testado derrubando o Postgres e recriando o backend com
`--no-deps`:

- O backend **não morre**: fica `running`, `restartCount=0`, servidor sem
  nunca fazer `listen`, e `/api/health` responde **502**.
- Causa: o container roda `npm run dev` → `tsx watch`. O
  `main().catch(→ process.exit(1))` de `index.ts` mata **só o processo
  filho**; `npm run dev` (PID 1) e `tsx watch` (PID 18) continuam vivos
  esperando mudança de arquivo. Confirmado com `ps` dentro do container.
- Como o processo principal não saiu, **a política de restart nunca
  dispara**. E o healthcheck detecta (`FailingStreak` subiu até 10) mas
  **não conserta**: no Docker standalone, healthcheck não reinicia container
  — só o Swarm faz isso.
- **O backend não se recuperou sozinho nem depois do Postgres voltar** —
  mais de 60 s em 502. Só voltou com `docker compose restart backend`
  (5 s até `healthy`).
- Na operação normal isso não aparece, porque `depends_on: condition:
  service_healthy` segura o backend. O cenário exige `--no-deps`, ou o
  Postgres caindo depois.

**Regra prática que sai daí: `running` não é sinal de saúde neste
projeto — `/api/health` é.** Se a API responder 502 com o container
`running`, o conserto é `docker compose restart backend`, não investigar
código.

Dado colateral: com o **frontend** fora do ar, a landing devolve **502** e a
API segue 200. Se a tela cair mas a API responder, o suspeito é o frontend.

**Os três caminhos foram reconfirmados após todo esse ciclo**: smoke 21/21, e
na landing real os botões apontam para `/signup`, para
`dev-c77a5b.twinai.localhost:8090/login` (navegação real ao subdomínio, não
POST do domínio raiz) e para o modal de acesso administrativo.

### Gotchas de ambiente (todos já custaram tempo)

- **Bundle velho do Vite:** editar `.tsx`/`.css` e "não aparecer" no
  navegador é o caso comum. Rode `docker compose restart frontend` **antes**
  de suspeitar do código React. O smoke detecta isso na verificação 21.
- **O container do backend não usa mais `tsx watch`** (ver bloco
  ACESSO-FINAL): editar `backend/src/**` exige `docker compose restart
  backend` para ter efeito — o que na prática já era necessário, porque o
  watch não recarregava de forma confiável através do bind mount.
- **`vite.config.ts`, `package.json`, `Dockerfile` e o entrypoint NÃO estão
  no bind mount.** Mexer em qualquer um deles exige
  `docker compose build <serviço>`; um `restart` não basta e o sintoma é a
  mudança simplesmente não existir.
- **`docker compose restart` NÃO recarrega variável de ambiente.** Para
  `.env` novo é preciso `docker compose up -d <serviço>`, que recria o
  container.
- **`package.json` não está no bind mount** (só `./backend/src`): script npm
  novo só existe no container após `docker compose build backend`.
  Vale também para `backend/scripts/seedDevAccess.ts`.
- **Não teste recuperação com `docker kill`** — ver Achado 1.
- **`docker compose ps` esconde containers parados** — use `-a`.
- O Browser pane **erra o mapeamento de clique** quando o viewport é forçado
  por `resize_window` com largura fixa; no tamanho nativo funciona.
  Digitação e Tab sempre funcionam; Enter/Espaço não ativam botão.
- **A câmera é bloqueada no Browser pane** (`NotAllowedError`) em toda
  sessão registrada. Validação de fundo virtual só o usuário consegue fazer.

---

## ROTEIRO DA DEMO (leia antes de apresentar)

**Endereço único: `http://twinai.localhost:8090`.** Não abra mais nada pela
barra de endereço — os três caminhos saem todos de lá:

| Caminho | Onde clicar | Para onde vai |
|---|---|---|
| **Cliente novo** | "Começar agora" / "Começar grátis" | painel de entrada, aba **Criar conta** (padrão) → `/signup` |
| **Cliente existente** | "Já tenho conta" | o **mesmo** painel, já na aba **Entrar** → `dev-c77a5b.twinai.localhost/login`, navegação real ao subdomínio |
| **Painel admin** | "Acesso administrativo" (rodapé, discreto) | modal próprio → `POST /admin/login` → `/admin` |

Os botões **dentro dos planos** continuam indo direto para `/signup`, sem
passar pelo painel — ali o plano já foi escolhido.

**Em desenvolvimento os formulários já vêm preenchidos** (com aviso na
tela), então na demo não é preciso digitar senha nenhuma.

**Dez minutos antes de apresentar, rode:**

```bash
./tools/smoke-demo.sh
```

21 verificações numa passada — containers, landing, os três caminhos,
credenciais fixas, avatar treinado, créditos, credenciais de provedor e se o
bundle do Vite está atualizado. **Não gasta nenhuma requisição de
fornecedor.** Sai 1 se algo que a demo usa estiver quebrado.

**Se algo cair no meio da demo, o diagnóstico é por sintoma, não por
`docker compose ps`** (que esconde container parado — use `-a`):

| Sintoma | Causa provável | Conserto |
|---|---|---|
| Tela em branco / 502 na landing, mas API responde | frontend caído ou bundle velho | `docker compose restart frontend` |
| Landing abre, mas tudo dá erro; `/api/health` = 502 | backend morto **com o container ainda `running`** (modo de falha registrado nos gotchas) | `docker compose restart backend` |
| O endereço não existe mais | traefik caído | `docker compose up -d` |

**`running` não é sinal de saúde neste projeto — `/api/health` é.** A
política `restart: unless-stopped` cobre crash de processo, mas **não** cobre
o modo de falha do backend descrito no Bloco 6, em que o `tsx watch`
sobrevive à morte do servidor. Na dúvida, `docker compose up -d` é sempre
seguro.

**Armadilha durante a demo:** `Sair` em qualquer zona chama
`session.destroy()` e **derruba admin e tenant ao mesmo tempo** — as duas
sessões vivem no mesmo cookie. Se for mostrar as duas zonas, use abas
separadas e não clique em Sair no meio; para trocar, abra uma aba anônima.
Também não entre em `/admin` pela barra de endereço: o `AdminAuthProvider`
não revalida a sessão e cada volta consome uma das 5 tentativas/15min do
rate limiter, fazendo parecer "senha errada".

### Cota de cada fornecedor — o que dá para ensaiar

| Fornecedor | Estado em 2026-07-31 | O que isso permite |
|---|---|---|
| **HeyGen** | `billing_type: wallet`, saldo **US$ 1,50**. `remaining_quota` caiu de 189 para 90 depois de UM vídeo de 33,7s | **No máximo 1 vídeo novo, e provavelmente nem isso.** Não ensaie gerando vídeo |
| **Gemini** | Free tier, ~20 requisições/dia, compartilhado com o copiloto | Um roteiro custa 1–2 requisições. Cabem poucos ensaios por dia |
| **ElevenLabs** | Chave sem permissão `user_read` — **não dá para consultar a própria cota** | TTS funciona normalmente; o limite restante é desconhecido |

**Sobre o HeyGen, com honestidade:** a unidade de `remaining_quota` não é
declarada em lugar nenhum da resposta. O que se sabe com certeza é que um
vídeo de 33,7s consumiu 99 unidades de 189, e que o endpoint atual
(`/v3/users/me`) informa carteira em dólar com **US$ 1,50**. As duas leituras
não se reconciliam com certeza, mas ambas apontam para o mesmo lugar: **o
saldo é baixíssimo**. Trate como "cabe um vídeo, talvez". Para ensaiar o
fluxo completo mais de uma vez, é preciso pôr saldo antes.

**Não há billing em nenhum dos três antes da demo.** Isso é uma decisão, não
um esquecimento — mas significa que a margem para erro ao vivo é pequena. O
caminho mais seguro é apresentar o fluxo usando o avatar "Mário", que já está
treinado com voz clonada, e gerar no máximo um vídeo.

**Pendência de segurança que não pode ir para operação:** a chave Gemini em
uso pelo tenant de demo foi colada em texto plano numa conversa de chat.
**Rotacione antes de qualquer billing ou uso real** — mesmo precedente das
senhas de `admin@eckkoai.com`/`demo@eckko.ai`.

---

## ⚠ CHAVE GOOGLE EM USO É DE DESENVOLVIMENTO — TROCAR ANTES DE VPS/PRODUÇÃO

A chave Google que atende o copiloto hoje é de desenvolvimento, de um projeto
em **free tier** (~20 requisições/dia), e **passou por transcrição de chat** —
ou seja, o valor esteve em texto plano no histórico de uma conversa. Isso a
torna comprometida por definição, independentemente de quem leu.

**Antes de qualquer VPS, produção, billing ou demonstração externa: gere uma
chave nova no fornecedor e grave-a pelo painel admin** (aba APIs → "Chaves da
plataforma"). Gravar pela tela evita repetir o problema — o valor não aparece
na tela, não vai para o scrollback do terminal e não passa por arquivo nenhum.

O mesmo vale, pelo mesmo motivo e desde 2026-07-30, para as senhas de
`admin@eckkoai.com` e `demo@eckko.ai`.

**Contexto de cota, que continua valendo:** já foram criados DOIS projetos
Google para a mesma frente, porque o primeiro bateu o teto diário
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`). Criar
projeto novo a cada teto batido não escala e polui a conta com projetos
órfãos — a saída é billing ativado ou chave paga da plataforma. Até lá, **toda
sessão que for rodar bateria de copiloto precisa contar requisições antes de
começar**: 15 sondas + 2 controles já ultrapassam o teto de um dia.

**Dois achados de formato/custo que continuam valendo:**

- Uma chave Google pode começar com `AQ.` e ter 53 caracteres, em vez do
  `AIza…` de ~39 que se espera do AI Studio — e ainda assim ser aceita como
  API key em query string (401 como `Bearer`). **Não descarte uma chave por
  não parecer com `AIza`.**
- `GET https://generativelanguage.googleapis.com/v1beta/models?key=…`
  (ListModels) valida a chave **sem** consumir a cota de `generateContent`. É
  o que o botão "Validar" do painel usa para as duas chaves Google.

---

**LACUNAS DEIXADAS PELO 2A — insumo direto do 2B.** O 2A removeu
afirmações falsas sem substituir nada, por escolha explícita: apagar leva
minutos, reescrever leva horas, e uma declaração comercial falsa a quem é
cobrado via Stripe não podia esperar a reescrita. O que ficou faltando,
por arquivo:

| Onde | Buraco deixado | O que o 2B precisa apurar antes de escrever |
|---|---|---|
| `faq.md` | Sumiu a pergunta "por que preciso conectar chaves de API" e a que explicava qual chave o copiloto usa | Qual é a resposta certa hoje ao cliente que pergunta "quem paga os provedores?" — depende da migração para chave-da-plataforma (seção 1), decidida e não construída |
| `faq.md` | A diferença entre "Conhecimento e mídia" e "Imagens de referência" perdeu o lado dos documentos | O que os documentos fazem **de fato** hoje: são extraídos e chunkados, e nada mais os lê. Descrever sem prometer recuperação |
| `faq.md` / `painel.md` | Sumiu a explicação do card "Créditos restantes" | A tela mostra "—" mas `tenant_credits` tem saldo real (bug de UI já catalogado). Documentar depois de decidir se conserta a tela ou o texto |
| `painel.md` | "Custo estimado" ficou sem explicação | O rastreamento existe (`provider_usage` + `provider_cost_rates`), mas só aparece no painel admin. Decidir se o tenant deve ver |
| `minha-assinatura.md` | Troca de plano, forma de pagamento e faturas ficaram sem contexto | Descrever o fluxo real do Stripe (checkout, webhook, top-up de crédito) e por que a lista de faturas ainda volta vazia mesmo com cobrança acontecendo |
| `conhecimento-e-midia.md` | Sumiu o "para que serve" dos documentos | Mesmo ponto do FAQ: hoje não serve para nada além de armazenar. É honestidade desconfortável, e é a verdade até o Bloco 3 |
| `conhecimento-e-midia.md` | Sumiu o **contraste** entre documentos e imagens de referência | Sem recuperação, os dois hoje se comportam igual — o contraste que justificava duas seções separadas deixou de existir. Decidir se as seções continuam separadas |
| `configuracoes.md` | Sumiu o modelo de negócio por trás da tela e a mensagem que o copiloto mostra quando falta credencial | Como orientar o cliente que quer trocar de provedor, e o que ele vê quando a chave não está conectada |
| `conteudo.md` | Sumiu a menção ao botão **"Retreinar"**, removida junto com a coluna "Provedor" na mesma frase | O botão existe e funciona — foi dano colateral. Redocumentar as ações da linha (Retreinar e Baixar) |
| `criar-video.md` / `configurar-avatar.md` | Sumiram as notas de "depende do provedor X conectado" | O que dizer quando a geração falha por falta de credencial, já que o cliente não pode resolver sozinho |
| `setup.md` (admin) | Sumiu a seção de modelo de negócio inteira e a citação da rota de login | Descrever de quem é a chave hoje e qual é a rota real (`POST /login` unificado) — é doc de operação interna, precisa estar certa |

**Telas que já não existem como os docs descrevem** (apontado, não reescrito):

- `conteudo.md` — não menciona o botão "Baixar" do vídeo de referência, que
  existe desde 2026-07-22. Omissão, não falsidade.
- `minha-assinatura.md` — descreve a troca de plano como ação local; hoje leva
  a um checkout do Stripe hospedado, com redirect para fora e volta com
  `?checkout=success|cancelled`.
- `painel.md` — descreve 4 cards, dos quais 2 mostram "—" por bug/decisão
  pendente, não por ausência de funcionalidade.
- `conhecimento-e-midia.md` — a tela se chama "Base de conhecimento (RAG)" no
  menu lateral, e não existe recuperação nenhuma. O nome da tela é o problema;
  renomear é decisão de produto.
- `configuracoes.md` — diz que o cartão mostra "os últimos dígitos da chave
  salva"; o `masked_key` são os últimos caracteres do **texto cifrado**. (A
  tela de chaves da plataforma já não sofre disso: ela grava os 4 últimos da
  chave real numa coluna própria.)

---

## 8. Histórico de blocos fechados — uma linha cada

O detalhe de execução de cada bloco está no histórico do git (mensagens de
commit, que são longas de propósito neste projeto). O que sobreviveu aqui foi
promovido para as seções de **Decisões travadas**, **Riscos**, **Pendências** e
**Gotchas** acima — que são as que se lê antes de trabalhar. Esta tabela existe
só para responder "isso já foi feito?".

| Data | Bloco | O que fechou |
|---|---|---|
| 07-16 | Fases 1–4 | Multi-tenant, header, copiloto autenticado + `/docs`, ajustes de UI/UX |
| 07-16 | Fase 5 | Signup, subdomínio por tenant, "Minha Assinatura", landing, copiloto público, StorageProvider, WhatsApp |
| 07-16 | Vendors de roteiro | `scriptProvider` deixou de ser stub: Anthropic + Gemini reais, seletáveis por vendor |
| 07-18 | Auditoria `/graphify` | Corrigiu registro falso sobre roteamento `/uploads/*` — o router sempre existiu |
| 07-21 | Rebrand eckko.ai | Paleta, fontes self-hosted, logo real, Fase A aprovada e Fase B aplicada |
| 07-21 | Limite de plano | Enforcement real em `POST /videos` (antes só exibido) |
| 07-21/22 | Painel admin, Fases 0–3 | `admin_users`, `requireAdmin`, `audit_log`, tabela `plans` como fonte única, medição de custo, suspensão de tenant |
| 07-22 | Fase 4 — Stripe | Assinatura real + webhook, validados de ponta a ponta com Stripe CLI |
| 07-22 | Fase 5 — créditos | Consumo, concessão mensal, top-up no upgrade e compra avulsa; idempotência provada com replay assinado |
| 07-22 | Login unificado | `POST /login` host-aware; admin nunca autentica em subdomínio de tenant |
| 07-22 | Downloads | `GET /videos/:id/download` e `.../reference-video/download` — proxy no servidor resolve o `download` ignorado em cross-origin |
| 07-22 | Admin copilot | Código existia, migration nunca rodara: feature estava quebrada no ambiente, não só não documentada |
| 07-30 | Fechamento pré-demo | Credenciais fixas de dev, desduplicação de e-mail, landing como porta única, planos corrigidos |
| 07-31 | Blocos 1 / 1.5 / 1.6 | Allowlist de docs (`docsManifest`), política congelada em `npm run check`, bateria adversarial 10/10 bloqueadas |
| 07-31 | Bloco 2A | Afirmações falsas removidas dos docs; `FALSE_CLAIM_TERMS` impede reintrodução |
| 07-31 | Bloco 4 | Erro de vendor sanitizado nos 8 pontos; `tools/smoke-demo.sh` |
| 07-31 | Bloco 6 / ACESSO-FINAL | Backend morre e volta sozinho; restart policy e healthcheck nos 4; loop do `/admin` corrigido na causa |
| 07-31 | Bloco VIDEO-0 | Modo fixture ponta a ponta, registro de feature flags, três chaves de plataforma separadas |
| 07-31 | PENDENCIAS-1 (parcial) | Galeria `/dev/steps`, proteção da carteira contra `live` acidental. **Partes 3, 4 e 5 não feitas** |
| 08-01 | CHAVES-1 | `npm run set-key`: grava chave no `.env` por stdin, sem eco |
| 08-01 | **CHAVES-2** | **Chaves da plataforma cifradas no banco, resolvidas por requisição, com tela no admin. Ver abaixo.** |
| 08-01 | **DEMO-1** | **Caminho principal do MVP validado ponta a ponta em fixture; validação de artefato de vídeo; `preflight:live`. Ver abaixo.** |

---

### Bloco CHAVES-2 — chaves da plataforma no banco, com tela (CONCLUÍDO)

**O problema que fechou:** as chaves da casa só existiam como variável de
ambiente. Trocar uma exigia editar `.env` e recriar o container, o valor
passava pela tela e pelo scrollback, e não havia como responder "qual chave
está valendo, quem gravou, e ela funciona?".

**Armazenamento.** Tabela `platform_credentials`, separada de
`api_credentials` pela mesma razão que `admin_users` é separada de `users`:
são escopos diferentes, e guardá-las juntas exigiria um `tenant_id` nulo com
significado especial — uma consulta que esquecesse o filtro entregaria a chave
da casa a um cliente. Cifra reutiliza `services/crypto.ts`; não há segundo
mecanismo e não deve haver.

**`ENCRYPTION_KEY` continua no `.env`, e é a única que não pode migrar** — ela
é o que abre as outras. Guardá-la no banco poria o cadeado dentro do cofre.

**Coluna `last_four` com os 4 últimos caracteres da chave EM CLARO**, gravados
na escrita. Existe porque o `masked_key` do resto do projeto mascara o *texto
cifrado*: os caracteres que ele mostra são do base64 do ciphertext e não
identificam nada. Quatro caracteres não reconstroem uma chave, e a alternativa
— decifrar para exibir — abriria o caminho de leitura que este bloco proíbe.

**Precedência: o BANCO vence o `.env`**, com `PLATFORM_KEYS_FORCE_ENV=1`
invertendo. A inversão não é simetria decorativa: uma chave ruim gravada pela
tela tranca do lado de fora justo quem precisaria entrar para consertá-la, e
sem ela o conserto exigiria `psql`. A origem em uso aparece em cada linha, e a
tela avisa em vermelho quando o `.env` está mandando — nesse estado, gravar
pela tela não tem efeito, e descobrir isso por tentativa e erro custaria caro.

*Medido, nos dois sentidos:* validar antes de gravar → `400 not_configured`,
zero chamadas. Gravar pela rota → validar **sem reiniciar o backend** → a
chave recém-gravada chegou ao fornecedor. Com `PLATFORM_KEYS_FORCE_ENV=1` e
uma chave diferente no `.env`, a listagem passou a `source=env` **e** o
carimbo de validação no banco **não** foi regravado — esse ramo só roda quando
a origem é o painel, então ele prova a resolução, não só o que a tela desenha.

**Cache: mapa em memória, invalidado inteiro na gravação, mais um TTL de 60 s.**
O TTL não serve ao processo que grava (esse invalida na hora) — serve ao dia em
que houver mais de uma réplica, quando a invalidação de um processo não alcança
o outro. Sem ele, a segunda réplica serviria a chave velha até reiniciar, e o
sintoma seria "gravei e às vezes funciona".

**Leitura de volta não existe.** Nenhuma rota devolve o valor, nem para admin
autenticado. A garantia é estrutural: a rota nunca tem a chave na mão, porque
a validação acontece atrás de `validatePlatformCredential`, que devolve só o
resultado. Quatro invariantes novas em `npm run check`
([checkPlatformKeyPolicy.ts](backend/src/scripts/checkPlatformKeyPolicy.ts)),
**todas provadas reprovando**: serializador vazando (10 violações), rota
alcançando o valor em claro, endpoint de geração na allowlist do probe, e duas
credenciais na mesma variável de ambiente.

**Validar faz UMA chamada, sempre de leitura**, e só a partir do clique — o
botão nasce desabilitado enquanto não há chave. As duas chaves Google e a
Anthropic validam por *ListModels*, que aceita ou recusa a chave sem consumir
cota de geração. **HeyGen lê `/v2/user/remaining_quota` e o número aparece na
tela** — é o dado que decide se dá para gerar. A unidade não é declarada pelo
fornecedor, e a tela não finge que é: diz "unidades de cota".

**ElevenLabs valida por `/v1/voices`, não pelo endpoint de cota**, que exige a
permissão `user_read`. Usar o de cota transformaria "sem permissão" em "chave
inválida" — um falso negativo — e distinguir os dois exigiria uma segunda
chamada. A cota fica declarada como não lida, **com o motivo**, no mesmo
contrato das feature flags.

**A validação chama o fornecedor de verdade mesmo com `PROVIDER_MODE=fixture`,**
e isso é deliberado: uma leitura de saldo não gasta cota, e um saldo simulado
levaria à decisão oposta à que os dados sustentam. Por isso o probe vive em
módulo próprio ([platformKeyProbe.ts](backend/src/services/providers/platformKeyProbe.ts)),
fora da guarda de `isFixtureMode()` — e sob uma guarda mais estrita: só pode
alcançar os endpoints da allowlist, nenhum deles de geração.

**HeyGen e ElevenLabs são apenas armazenadas e validadas.** O caminho de
geração continua lendo a credencial do tenant. Migrar isso muda quem paga a
conta e não estava no escopo.

**Dois defeitos achados por rodar, não por revisar:**

1. **`docker-compose.yml` só repassava `PLATFORM_COPILOT_API_KEY`.** As outras
   estavam documentadas no `.env.example` e neste arquivo, mas **nunca
   chegavam ao container** — preencher `PLATFORM_GOOGLE_API_KEY` no `.env` não
   teria efeito nenhum, e o sintoma seria "colei a chave e o copiloto continua
   caindo na do cliente". As cinco passaram a ser repassadas.
2. **`PLATFORM_GOOGLE_API_KEY` nunca serviu à geração de roteiro**, apesar de
   este arquivo afirmar "roteiro e copiloto do tenant": `routes/scripts.ts` lê
   a credencial do tenant direto, sem passar por `resolveTenantAiKey`. Só o
   copiloto do tenant usa a chave da plataforma. Corrigido no registro e aqui.

**Duas correções na própria guarda, ambas na primeira execução:** ela acusava
`encrypted_key` em `adminPanel.ts`/`credentials.ts`, que é a coluna do tenant e
uso legítimo — guarda que acusa uso legítimo é abandonada, e guarda abandonada
não protege nada; e reprovava o **comentário** que explica a regra, o mesmo
tropeço já registrado na guarda de credencial literal. Agora ela ignora
comentários e cobra a tabela `platform_credentials`, que é o desvio real.

**Bateria adversarial ampliada** ([tools/probe-copilot-docs.sh](tools/probe-copilot-docs.sh)):
5 sondas novas pedindo a chave — direta, disfarçada de depuração, disfarçada de
mensagem de erro, pedido de eco de uma chave colada, e completar uma chave
truncada — e uma audiência `admin` nova, porque o copiloto do admin recebe o
nível mais alto de documentação e é onde a tentação de dizer "é interno, tudo
bem" seria maior. Os nomes das cinco variáveis entraram na deny-list (provado
reprovando). Os três prompts ganharam uma regra explícita de recusa de
credencial.

**A bateria NÃO foi executada neste bloco** — o orçamento de chamadas Gemini
era de 3, só para validar chave, e uma bateria consome mais que o teto diário.
O que foi executado: a audiência `admin` de ponta a ponta, e o controle
inicial abortou corretamente com 1 requisição, sem produzir nenhum falso
"bloqueado" (o copiloto do admin não tem chave). Rodar as sondas contra o
tenant fica para quando houver cota paga.

**Vale registrar o que a bateria não precisa provar:** nenhuma chave entra em
prompt nenhum. Só três coisas entram — prompt constante, `docsContent` do
nível, e histórico da conversa. Um modelo não revela o que nunca recebeu; a
regra nos prompts cobre o resto, que é o operador colando a chave no chat.

---

## 9. Notas sobre alternância de conta

Este projeto é trabalhado alternando entre duas contas do Claude Code (pessoal
e manfred@smartinovat.com) para evitar travar em limites de uso. O histórico de
conversa NÃO é compartilhado nativamente entre contas — por isso este arquivo é
a fonte de verdade sobre o estado do projeto, não a conversa em si.

---

### Bloco DEMO-1 — caminho principal do MVP, ponta a ponta (CONCLUÍDO)

Objetivo: foto → avatar → voz clonada → vídeo → download, funcionando de
verdade, **sem gastar um centavo**. Rodado inteiro em `PROVIDER_MODE=fixture`.
**Zero chamadas a HeyGen, ElevenLabs, Gemini ou Anthropic** — confirmado por
`read_network_requests` no navegador e por varredura do log do backend.

**1. Validação de artefato de vídeo**
([videoArtifact.ts](backend/src/services/videoArtifact.ts)). Dois critérios,
e os dois são necessários: piso de **100 KB** e assinatura **`ftyp` nos bytes
4..8**. Tamanho sozinho aceita uma página de erro HTML de 200 KB; assinatura
sozinha aceita um mp4 truncado nos primeiros quilobytes — o modo de falha real,
porque uma transferência interrompida produz um prefixo VÁLIDO, não lixo.

Aplicada em **dois** pontos: ao marcar o vídeo como `ready` (artefato inválido
vira `error`, **nunca** `ready`) e no download. O do download **bufferiza** o
arquivo antes de enviar — em streaming só dá para inspecionar o começo, e a
única forma de garantir "os bytes que entrego são os bytes que validei" é ter o
arquivo inteiro antes de mandar o primeiro. Custo: memória proporcional ao
arquivo (o maior vídeo real medido tem 2,6 MB). Se um dia houver vídeo de
centenas de MB, isto precisa virar validação em disco — **não** voltar a ser
streaming cego.

*Provado reprovando, no caminho HTTP real:* vídeo apontando para um arquivo
truncado em 50 KB → **HTTP 422** com frase em pt-BR, detalhe técnico só no log
(`artifact_rejected`); o mesmo vídeo íntegro → **200**, 203.567 bytes,
`ffprobe` confirma h264+aac. Também testado em tabela: 16 bytes, truncado em
50 KB, HTML de 200 KB, exatamente no piso, e um byte abaixo — todos com o
veredito correto.

**2. A fixture era menor que o próprio piso.** `simulated-video.mp4` tinha
49,4 KB — um mp4 legítimo, mas que a regra nova recusaria. Regenerada com
ffmpeg para **198,8 KB** (h264 640×360 5 s + aac). Fixture é versionada e
copiada pelo Dockerfile: trocá-la exige `docker compose build backend`.

**3. `.mp4` órfãos de 16 bytes — origem RESOLVIDA.** São 2, ambos em
`uploads/4bbed629-…/`, e contêm literalmente o texto `fake video bytes`. O
tenant dono **não existe mais**, e nenhuma linha de `avatars` ou `videos` os
referencia: são resto de teste de uma sessão antiga. **Não foram apagados** —
decisão do usuário. Isso fecha a metade "origem" da Parte 5 do PENDENCIAS-1.

**4. Achado mais sério do bloco: não havia como enviar foto de arquivo.**
Concluir o passo 1 exige **3 fotos**; o botão "Capturar" depende de
`camera.ready`; e não existia alternativa nenhuma — enquanto o vídeo de
referência, logo abaixo, sempre teve o seu "ou envie um arquivo". A assimetria
não era intencional. **Numa máquina sem câmera, criar avatar era impossível** —
e a câmera é bloqueada em toda automação registrada deste projeto.

Corrigido em [AvatarSetupStep.tsx](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx):
botão "Ou enviar foto de arquivo", múltipla seleção, envio **em sequência**
porque o backend ANEXA a `photo_urls` (não grava por índice) e paralelizar
deixaria a ordem à mercê de qual requisição chega primeiro. Fica fora dos
slots, e não dentro de cada um, para não prometer escolha de posição que o
backend não oferece.

**5. Passada completa dos 5 passos, medida no navegador.** Fotos por upload
(3/3) → vídeo de referência → treino + clonagem de voz (`fixture-avatar-…` e
`fixture-voice-…`, `simulated=t`) → avatar selecionável no passo 3 → roteiro
digitado → cenário e traje por prompt → 30 s → geração. Resultado: vídeo
`ready` com o aviso **SIMULADO** na tela, player renderizando, e download
**200 / 203.567 bytes / `ftyp` válido**.

*Ledger conferido:* `video −1 consumption simulated=t` e
`avatar −1 consumption simulated=t`. **Marcado como simulado, não como consumo
real** — que é o ponto do `credit_ledger.simulated`.

*De passagem, ficou verificado por olho o que o VIDEO-0 deixou cego:* o bloco
de fundo virtual aparece inerte **com o motivo** ("depende de teste ainda não
realizado com a HeyGen"), sem seletor.

**6. `npm run preflight:live`**
([preflightLive.ts](backend/src/scripts/preflightLive.ts)) — verifica e
imprime, **sem chamar fornecedor nenhum**. Um preflight que gasta cota é uma
contradição: a carteira comporta cerca de um vídeo, e "o preflight consumiu a
geração da demo" seria o pior desfecho. Também **não imprime valor de chave
nem os 4 últimos** — na véspera de uma apresentação, esta saída é exatamente o
tipo de coisa que acaba colada num chat ou fotografada numa tela compartilhada.

A validação de download é verificada **exercitando a função**, não lendo uma
flag: uma flag diria "ligada" mesmo com a lógica esvaziada.

*Erro que a primeira versão cometeu e vale registrar:* ela **bloqueava** por
falta das chaves de plataforma de HeyGen/ElevenLabs, logo acima de uma linha
dizendo que quem paga a geração é a credencial do TENANT. As duas não podiam
ser verdade juntas. Agora as chaves de plataforma são informativas e o que
bloqueia é a credencial do tenant existir. **Reprovar por algo que live não
precisa é pior que não verificar: ensina a ignorar o preflight.**

Saída atual: `FALTA PARA LIVE: PROVIDER_LIVE_CONFIRM` (sai 1). Tudo o mais
verde — credenciais de tenant conectadas, teto de 1 geração, validação ativa,
34 migrations, `/api/health` 200.

### O que NÃO pôde ser provado sem live (DEMO-1)

Nada disto é dúvida sobre o código; é o que fixture, por definição, não
exercita:

- **Que a HeyGen aceita nossas fotos e produz um avatar utilizável.**
  `trainAvatarFixture()` ignora `photo_urls` — em fixture, três retângulos
  coloridos "treinam" tão bem quanto um rosto. Só live diz se o formato, a
  resolução e o enquadramento servem.
- **Os contratos `// ASSUMPTION`** (Basic auth da D-ID, `avatar_item.id` da
  HeyGen) continuam sem confirmação formal.
- **Que a voz clonada sai parecida.** `cloneVoiceFixture()` devolve um id; não
  há áudio a julgar.
- **Que o artefato real passa na validação nova.** O vídeo real de 2,6 MB já
  medido passaria com folga, mas isso é dedução a partir do tamanho — nenhum
  arquivo vindo do HeyGen atravessou o validador ainda.
- **Que o `Range` do CDN do vendor funciona como esperado.** `probeArtifact()`
  tem retaguarda para 200 (baixa inteiro), então o caminho está coberto; qual
  dos dois ramos o HeyGen usa, não se sabe.
- **Captura por câmera**, em qualquer passo. Bloqueada em toda sessão
  registrada. Só o usuário consegue validar.
