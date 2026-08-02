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

**Última atualização:** 2026-08-02 — Bloco 5D, fases 0 e 1. **O achado
principal invalida uma garantia dos blocos anteriores: `PROVIDER_MODE=fixture`
nunca cobriu os provedores de TEXTO** (`complete()` não consultava
`isFixtureMode()`), então "zero chamadas tarifadas" valia por ninguém ter
clicado em "Gerar com IA". Fechado, com uma guarda que **descobre** os clientes
HTTP em vez de receber lista. O vídeo passou a ser reproduzível **dentro** do
produto (Biblioteca + passo 6, mesmo componente, proporção respeitada), o custo
apareceu no passo 4, e as telas que mentiam foram corrigidas. O ledger negativo
foi **medido e não alterado** — a causa é `UPDATE` manual de blocos antigos, e
qual dos dois números está certo não é decisão de script. As **Fases 2 a 5 (a
passada live) NÃO foram iniciadas.** Antes dele, o Bloco TETO-1: a última
decisão aberta que
podia travar a passada live foi fechada. O teto de sessão **devolve o gasto**
quando a chamada falha (mesma fronteira do estorno de crédito), e quem passou a
barrar o laço é um **segundo contador, de tentativas**, que nunca volta. Com
`MAX_GENERATIONS=2` a passada live ganhou 4 falhas de margem em vez de 0. O
arnês flagrou a guarda nova como inerte por um motivo novo — ela reprovava mas
**perdia a mensagem**, morrendo antes de devolvê-la. Ver o bloco próprio no fim.
Antes dele, o Bloco 4A (operacional): o custo REAL passou
a aparecer na tela, derivado de uma constante única e medida (US$ 0,045/s em
16:9/720p), com a estimativa ao lado e a diferença entre as duas; ausência de
medição aparece como ausência, nunca como zero. A tabela de taxas manual —
origem do desvio de 4,5× — foi **removida do banco**, junto com a tela que a
editava. Toda saída de log passou a ter um sumidouro único que redige segredo
por FORMA, e o freio de endpoints tarifáveis passou a DERIVAR de um catálogo.
Os quatro desfechos de geração foram medidos e tabelados (item 6), sem
correção — é decisão de produto. Antes dele, o Bloco PREVOO-1 (3.5), de
verificação:
confirmou que a geração usa **v3** (sem parada condicional), achou e corrigiu um
vazamento de chave no evento `vendor_error`, mediu que o **teto de sessão não
volta quando a geração falha** (registrado, NÃO corrigido — é decisão de
produto), criou a invariante de frescor da imagem do frontend, exigiu evidência
para declaração de suporte por vendor, e escreveu o plano da passada live. Tudo
em fixture, zero chamadas tarifadas. Antes dele, o Bloco FORMATO-1: o payload de geração
passou a levar `aspect_ratio` e `resolution` SEMPRE, derivados da plataforma
escolhida num passo novo ("Publicação", 5 de 6). O motor é selecionado a partir
do `supported_api_engines` declarado pelo avatar, gravado sempre e **enviado só
atrás de flag desligada** — a ligação entre os dois campos é dedução, não
contrato. Quatro fixtures por proporção, guarda nova (41 mutantes no total).
Ambiente em fixture do começo ao fim, zero chamadas a fornecedor. **Nada disso
foi confirmado em live** — ver a lista própria de pendências. Antes dele, o
Bloco LIVE-1: **uma** geração live real,
de ponta a ponta, com o avatar que já existia. Saiu vídeo utilizável em ~54 s,
custo medido de US$ 0,15, e o `ffprobe` do arquivo baixado deu 1280×720 16:9
25 fps. A unidade de `remaining_quota` foi reconciliada (60 por dólar). Três
lacunas novas registradas e não corrigidas — ver a lista na seção de fatos
verificados. **O ambiente foi desarmado de volta para `fixture` ao fim do
bloco, com prova no log de boot.** Antes dele, o Bloco DEMO-1: o caminho
principal do MVP
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

**Frente aberta — upload de celular não cabe no desenho atual.** O teto de
100 MB e o `toBuffer()` do upload de referência foram dimensionados para
webcam. Um celular grava em 1080p (ou 4K) com bitrate bem maior: **2 minutos
em 1080p já passam dos 100 MB**, e o modo *completo* da decisão nº 9 pede 5.
Subir o teto sozinho não resolve — `toBuffer()` materializa o arquivo inteiro
em memória, então 300 MB de upload viram 300 MB de heap, e dois envios
simultâneos derrubam o processo. O caminho é **streaming direto para disco**
(`file.file` é um stream; gravar com `pipeline()` e só então validar), o que
muda também a validação de artefato, que hoje assume buffer. **Registrado, não
feito** — é reescrita do caminho de upload, não ajuste de constante.

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
8. **O débito fica ANTES da chamada ao fornecedor, e a falha estorna.**
   Debitar depois eliminaria o estorno, mas abriria corrida: duas requisições
   simultâneas passariam as duas pela verificação de saldo e as duas gastariam
   cota. Prefere-se cobrar e devolver a arriscar gastar o que não existe. A
   fronteira do estorno está em `services/billing/creditGate.ts` e vale a pena
   ler antes de mexer: **estorna quando a chamada ao fornecedor lançou; não
   estorna nada depois de o fornecedor aceitar o trabalho.**
9. **Qualidade de treino do avatar será escolha do TENANT**, em dois modos:
   *rápido* (~30 s de amostra, resultado mais simples) e *completo* (2–5 min,
   melhor resultado). **NÃO implementado** — registrado aqui para não virar
   improviso na hora. Hoje existe só o cap único de `MAX_RECORDING_SECONDS`
   (120 s) e uma linha de orientação na tela. Quando for construído, os dois
   modos precisam de tetos de tamanho diferentes: 5 min em 1080p não cabe nos
   100 MB atuais.

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

**Três fatos verificados no bloco POLL-1, registrados sem construir nada.** Os
três têm a mesma natureza: algo que se supõe verdade e não é, e que só
apareceria em live ou numa conversa com cliente.

1. ~~**"Derivação de formatos" é hoje INEXEQUÍVEL.**~~ **Metade FECHADA no
   FORMATO-1.** O payload passou a levar `aspect_ratio` e `resolution`
   sempre, derivados da plataforma escolhida no passo "Publicação" — ver o
   bloco próprio no fim. O que continua aberto é a outra metade, e ela só
   fecha em live: **se 9:16 sai vertical de verdade**, e se um mesmo avatar
   rende bem fora do horizontal. *(O usuário se refere a isto como "Decisão
   6"; essa numeração vem do planejamento dele, não deste arquivo.)*
2. **A UI exige 3 fotos e o provider usa só a primeira.**
   `AvatarSetupStep` bloqueia "Concluir configuração" com menos de 3
   (`photo_urls.length < 3`), e `trainAvatar()` faz
   `readUpload(input.photoUrls[0])` ([avatarProvider.ts:375](backend/src/services/providers/avatarProvider.ts:375)).
   As outras duas são gravadas, ocupam disco e **nunca chegam ao fornecedor**.
   Ou a exigência cai para 1, ou o provider passa a enviar as três — hoje
   pedimos ao cliente um trabalho que jogamos fora.
3. **`provider_cost_rates` nunca foi reconciliada com fornecedor nenhum, e as
   unidades são NOSSAS.** O vídeo registra `duration_seconds` *pedido*
   ([videos.ts:70](backend/src/routes/videos.ts:70)) e a voz registra
   `script.length` em caracteres — nenhum dos dois vem da resposta do
   fornecedor, que não é lida para isso. O custo é `taxa × unidades` com taxa
   de uma tabela mantida à mão. **O único número real que a HeyGen nos dá é
   `remaining_quota`**, lido só pelo botão "Validar" do painel e nunca
   gravado. Ou seja: toda tela de custo é estimativa sobre estimativa, e a
   diferença entre ela e a fatura real é desconhecida — não medida, não
   estimada, desconhecida.

   **Atualização do LIVE-1 (2026-08-01): a diferença deixou de ser
   desconhecida e é de 4,5× no caso medido.** Uma geração pediu
   `duration_seconds = 15`; o vídeo entregue tem **3,372 s** (`ffprobe`), e
   `provider_usage` gravou **15**. Não é imprecisão de arredondamento: é o
   número errado, porque `duration_seconds` é o que o cliente escolheu na
   tela, não o que a voz sintetizada de fato dura. O valor real existe e está
   à mão — `synthesizeSpeech()` já devolve `durationSeconds` medido pelo
   ElevenLabs ([voiceProvider.ts:140](backend/src/services/providers/voiceProvider.ts:140))
   e é registrado no log de duração, mas **não** é o que vai para
   `provider_usage`. NÃO corrigido.

**Três lacunas novas, medidas na passada live do LIVE-1 (2026-08-01). As duas
primeiras foram FECHADAS no LIVE-2; a terceira continua aberta:**

1. ~~**`provider_usage` grava a duração PEDIDA, não a real.**~~ **Fechada no
   LIVE-2.** `unit_count` passou a ser a duração real, com `unit_source`
   dizendo de onde veio e `requested_unit_count` guardando o pedido ao lado —
   nunca no lugar, senão não haveria como medir o erro da estimativa. Ordem:
   `vendor_response` (a HeyGen manda `data.duration`) → `tts_timestamps` (o
   ElevenLabs mede o áudio) → `requested` (último recurso, e declarado como
   tal). Migration `037`; linhas antigas ficaram marcadas `requested`.
2. ~~**O LOG-1 não cobre o ElevenLabs.**~~ **Fechada no LIVE-2** — ver o bloco
   próprio no fim. O texto abaixo fica como registro do que era.

   A captura de resposta bruta vivia em
   `fetchJson()`, que é do `avatarProvider` — cobre as 4 chamadas HeyGen e as
   3 D-ID. `voiceProvider.ts` faz `fetch` direto e **nunca** chama
   `logVendorResponse`. Medido: a passada live registrou `voice/elevenlabs/
   50 characters` em `provider_usage`, e **zero** eventos `vendor_response` de
   voz no log. Ou seja, a clonagem e a síntese — que gastam dinheiro — são
   exatamente os caminhos sem corpo de resposta registrado, que é o oposto da
   intenção do LOG-1.
3. **`GET /v2/user/remaining_quota` tem sunset declarado em 2026-10-31.** A
   própria resposta traz o aviso, apontando `GET /v3/users/me` como
   substituto. Dois caminhos vivos usam o endpoint condenado:
   `checkHeygenConnection()` ([avatarProvider.ts:314](backend/src/services/providers/avatarProvider.ts:314)),
   que atende `POST /credentials/avatar/test`, e `PROBE_ENDPOINTS.heygen`
   ([platformKeyProbe.ts:27](backend/src/services/providers/platformKeyProbe.ts:27)),
   que é o botão "Validar" do painel admin. Depois da data, os dois passam a
   falhar — e o sintoma será "chave inválida", não "endpoint removido", que é
   o diagnóstico errado. O `/v3/users/me` já foi exercitado com sucesso nesta
   passada e devolve a carteira em dólar.

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
  `docker compose build <serviço>`; um `restart` não basta. **O sintoma pode
  ser MUITO pior que "a mudança não existir": se um `define` novo do
  `vite.config.ts` for usado pelo código do bind mount, a app inteira quebra
  em branco** — console limpo, Vite dizendo `ready`, healthcheck verde.
  Aconteceu com `__MAX_IMAGE_BYTES__` (ver FORMATO-1). Para diagnosticar,
  importe o entrypoint à mão no console: `import('/src/main.tsx').catch(e =>
  e.message)` — é onde o erro real aparece.
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

| Fornecedor | Estado em 2026-08-01 | O que isso permite |
|---|---|---|
| **HeyGen** | `billing_type: wallet`, saldo **US$ 15,35**, `remaining_quota` **921** (medido depois da passada live do LIVE-1) | ~340 vídeos curtos como o medido. Deixou de ser o gargalo |
| **Gemini** | Free tier, ~20 requisições/dia, compartilhado com o copiloto | Um roteiro custa 1–2 requisições. Cabem poucos ensaios por dia |
| **ElevenLabs** | Chave sem permissão `user_read` — **não dá para consultar a própria cota** | TTS funciona normalmente; o limite restante é desconhecido |

**A unidade de `remaining_quota` deixou de ser mistério: 60 unidades por
dólar.** O registro anterior dizia que as duas leituras (quota e carteira)
"não se reconciliam com certeza". Reconciliam, e a razão fechou exata em dois
pontos medidos na mesma passada: 930 ÷ 15,50 = 60,0 antes, 921 ÷ 15,35 = 60,0
depois. **1 unidade ≈ US$ 0,0167.** Dois pontos com a mesma razão é forte, mas
é dedução a partir de duas amostras — o fornecedor não declara a unidade em
lugar nenhum da resposta.

**Custo real de vídeo, medido:** 3,372 s de vídeo custaram **US$ 0,15 / 9
unidades** ⇒ **~US$ 0,045 por segundo**. Confere em ordem de grandeza com a
medição antiga (33,7 s → 99 unidades = 2,94 un/s, contra 2,67 un/s agora); a
diferença sugere arredondamento por bloco, não medido.

**Formato real do que a HeyGen devolve, medido com `ffprobe` no arquivo
baixado:** MP4 (QuickTime/MOV), **h264 High, 1280×720, DAR 16:9, SAR 1:1,
25 fps**, áudio AAC-LC 48 kHz estéreo. É **horizontal**, e é o padrão da conta:
como `POST /v3/videos` não manda `dimension` nem `aspect_ratio`, nunca
escolhemos a proporção — ver o item 1 dos "três fatos verificados no POLL-1".

**Custo de criação de avatar continua sendo o item caro:** US$ 1,00 por
`photo_avatar` (medido no DEMO-3), contra US$ 0,15 por um vídeo curto.

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
| 08-02 | **5D fases 0 e 1** | **Percurso dos 6 passos catalogado; fixture passa a valer para os provedores de TEXTO (não valia); vídeo reproduzível na Biblioteca; custo no passo 4; ledger negativo medido e NÃO alterado; telas que mentiam. 64 mutantes. Ver abaixo.** |
| 08-02 | **TETO-1** | **A falha devolve o teto de GASTO; o laço passa a ser barrado por um contador de TENTATIVAS que não volta. Guarda nova com 3 asserções opostas; 56 mutantes. Ver abaixo.** |
| 08-02 | **4A — OPERACIONAL** | **Custo real na tela (constante única medida; estimativa e medição lado a lado); rastro da falha em provider_usage; redação no sumidouro do log; freio derivado de catálogo de endpoints; 4 desfechos medidos. Tabela de taxas manual REMOVIDA do banco. Ver abaixo.** |
| 08-02 | **PREVOO-1 (3.5)** | **Verificação pré-live: geração confirmada em v3; corpo de erro vazava chave num 2º evento (corrigido); teto de sessão não volta em falha (medido, não corrigido); frescor da imagem do frontend; evidência por vendor; plano da passada live. 48 mutantes. Ver abaixo.** |
| 08-01 | **FORMATO-1** | **Formato explícito no payload, derivado da plataforma; motor selecionado e registrado atrás de flag; 4 fixtures por proporção; guarda nova (41 mutantes no total). Ver abaixo.** |
| 08-01 | **GUARDAS-1** | **`npm run check:mutants`: 38 mutantes provam que cada guarda reprova de verdade. D, C, E, B, G consertados + 1 achado novo (teto testado sem quem o chama). Ver abaixo.** |
| 08-01 | **LIVE-2** | **Voz entra no LOG-1 (sem bytes de áudio); `provider_usage` grava duração real e pedida lado a lado; guarda nova de registro de resposta. Ver abaixo.** |
| 08-01 | **LIVE-1** | **Uma geração live com avatar existente: vídeo em ~54 s por US$ 0,15; quota reconciliada (60/dólar); formato real 1280×720 16:9 25 fps; 3 lacunas novas. Ambiente desarmado de volta para `fixture`.** |
| 08-01 | **DEMO-4** | **Teto de sessão explica o que consumiu; avatar em treino é esperado e barra a geração. Ver abaixo.** |
| 08-01 | **DEMO-3** | **Primeira passada live: custo real medido, teto de imagem por rota, teto de sessão deixa de se disfarçar de falha do fornecedor. Ver abaixo.** |
| 08-01 | **LOG-1 / POLL-1** | **Resposta bruta do fornecedor no log antes de interpretar; "concluído sem artefato" falha na hora em vez de virar timeout.** |
| 08-01 | **ESTORNO-1** | **Crédito volta quando o fornecedor recusa, nos 3 caminhos. Linha própria no ledger, idempotente. Ver abaixo.** |
| 08-01 | **DEMO-2** | **Teto de upload do vídeo de referência: 100 MB só nessa rota, erro legível, validação no cliente e cap de gravação. Ver abaixo.** |
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

### Bloco GUARDAS-1 — arnês de mutação: guarda só vale se reprovar (CONCLUÍDO)

**A frase que resume o bloco: contagem de ocorrências não detecta guarda
inerte.** A `checkVendorLogPolicy` casava TREZE funções e era inerte. O número
alto era o próprio disfarce.

**`npm run check:mutants`** ([tools/run-mutants.mjs](tools/run-mutants.mjs)).
Cada guarda declara MUTANTES junto de si; o arnês aplica um, roda o gate,
exige saída 1 **com a mensagem daquela guarda**, reverte e confere
`git status` vazio. **38 mutantes, 38 com o comportamento esperado.**

Três decisões que não são decoração:

- **`expect` obrigatório.** Sem ele, mutante que quebra a compilação faz o
  gate sair 1 pelo `tsc` e a guarda é dada como ativa sem ter opinado.
  *Aconteceu:* cinco mutantes da primeira rodada reprovavam por `tsc`, e o
  arnês corretamente recusou aquilo como prova.
- **`expectGreen`.** Guarda que reprova qualquer coisa passaria em todos os
  mutantes sem distinguir nada.
- **Reversão em `finally` + `git status` após CADA mutante.** Reversão falha
  aborta tudo na hora, em vez de empilhar defeitos.

**Dois mutantes por guarda: um óbvio e um esperto.** O esperto desloca a
verdade sem mexer na superfície inspecionada — é o único que pega guarda que
verifica a proposição errada. Os dois do LIVE-2 estão congelados aqui.

**O que o arnês achou, e a auditoria manual A–G não tinha achado:**

**`consumeLiveGeneration` era testada, mas ninguém verificava quem a chama.**
Removi a chamada de `cloneVoice` e o gate ficou verde: o contador seguia
perfeito, a mensagem seguia dizendo que o teto conta voz e vídeo juntas —
verdade sobre o mecanismo, mentira sobre o sistema. Em live, libera uma
chamada tarifada que a trava deveria barrar. **Testar o mecanismo não é testar
quem o usa**, e nenhuma leitura de código tinha visto isso.

**Consertados neste bloco** (cada um só conta como feito porque o mutante
correspondente passou a reprovar):

- **D — `isFixtureMode`.** Reescrita com corpo por **chaves balanceadas** (o
  slice "até o próximo export" fazia uma função pura de 5 linhas engolir 378) e
  **análise transitiva** de quem alcança a rede (`pollVideoJob` e
  `checkAvatarConnection` eram ignoradas justamente por delegarem numa linha).
  Passou a exigir o **padrão** `if (isFixtureMode()) return`, não a menção:
  `if (isFixtureMode() && false)` menciona e não desvia. Conferidos: 7 → **8**,
  e agora são os certos.
- **C — a nota que afirmava o não verificado.** `PLAINTEXT_ALLOWED` era
  decorativa (só checava existência de arquivo) e a inspeção olhava apenas
  `routes/`. A nota dizia "leitura em claro só em 2 módulos declarados", e o
  número **estava errado**: `providers/platformKeys.ts` resolve chave e nunca
  era olhado. Agora varre `backend/src` inteiro (22 rotas + 77 arquivos) e a
  allowlist tem os 3 leitores reais, com motivo.
- **E — flags por caminho não vigiado.** `setGalleryFlag` e `key: "..."`
  entraram no padrão. Referências: 1 → **3** (eram dois dos três usos reais
  passando fora do radar).
- **B e G** — `readStoredValue` saiu de `PLAINTEXT_MARKERS` (função privada,
  impossível de casar) e `schema_migrations` saiu da deny-list (tabela que não
  existe aqui). Deny-list: 42 → 41 termos, todos possíveis.
- **Universo-zero reprova.** A asserção de planos dizia "conferidos contra a
  tabela: free, pro, business" tendo conferido **zero citações** — nenhum doc
  citava limite na forma reconhecida. Agora reprova se não encontrar nada, e o
  FAQ passou a documentar os limites reais: **9 citações conferidas**.

**A elisão do LOG-1 ganhou retaguarda por TAMANHO** (`MAX_FIELD_BYTES = 2048`),
independente de nome de campo — a lista de nomes é suposição, nenhum daqueles
campos foi visto numa resposta real. O teto vem de medição: o maior campo
legítimo já observado tem **519 caracteres** (URL assinada da HeyGen).
*Medido com nome desconhecido e corpo grande:* 102.892 → **860 bytes**.

**Três armadilhas que o próprio bloco pisou, e valem mais que o resultado:**

1. A guarda de flags **acusou o próprio mutante declarado** (a string vive em
   `backend/src`, que ela varre). Terceira vez que uma guarda deste projeto
   tropeça no texto escrito para descrevê-la.
2. `checkPolicy.ts` **rodava o gate inteiro ao ser importado**, então o coletor
   devolvia JSON grudado num relatório. Módulo que age ao ser importado é
   armadilha para o próximo que precisar de qualquer coisa dele.
3. Seis mutantes casaram **0x** porque o working copy vem em **CRLF** e os
   `find` são escritos com `\n`. Falso alarme de "mutante desatualizado" em
   guarda saudável ensina a ignorar o arnês.

**O que ficou sem verificação:** as guardas cobertas são as que têm mutante —
38 mutantes sobre ~28 asserções. As asserções sem mutante estão nomeadas na
tabela do relatório do bloco; as principais são as de tamanho de prompt e as de
manifesto de docs, que dependem de estado de disco mais do que de código.

### Bloco FORMATO-1 — o fornecedor deixa de escolher a proporção (CONCLUÍDO)

**A frase do bloco: escolher por omissão é escolher mesmo assim.** O vídeo do
LIVE-1 saiu 1280×720 16:9 porque esse é o padrão da conta na HeyGen — ninguém
decidiu, e a decisão coube a quem não sabe onde o vídeo vai ser publicado.

**O que foi LEVANTADO antes de implementar** (a separação importa mais que o
código):

| Campo | Estado | Origem |
|---|---|---|
| `aspect_ratio`: `16:9 \| 9:16 \| 4:5 \| 5:4 \| 1:1 \| auto`, default `16:9` | **DOCUMENTADO**, nunca exercitado | doc pública, 2 fontes concordantes |
| `resolution`: `720p \| 1080p \| 4k` | **DOCUMENTADO**, nunca exercitado | idem |
| `engine: { type: avatar_v \| avatar_iv \| avatar_iii }`, default `avatar_iv` | **DOCUMENTADO**, nunca exercitado | idem |
| `avatar_item.supported_api_engines = ["avatar_iv","avatar_iii"]` | **MEDIDO** | log bruto de `heygen.createAvatar`, 200, 434 bytes |
| `supported_api_engines` ↔ `engine.type` são o mesmo vocabulário | **DEDUZIDO** | os nomes batem; a doc **não** amarra os dois |

**Achado do levantamento, que muda o diagnóstico:** nenhuma resposta da HeyGen
declara geometria. Nem a criação (`{output_format, status, video_id}`) nem o
polling (`duration`, `video_url`, `thumbnail_url`, …). Tudo que se sabe sobre
o formato do que foi entregue veio do `ffprobe` de UM arquivo baixado — não há
como conferir formato pela resposta, só pelo artefato.

**1. Formato SEMPRE explícito, derivado da plataforma.** A escolha oferecida é
a PLATAFORMA, não a proporção: ninguém abre a ferramenta querendo "9:16", quer
publicar no Reels. Passo "Publicação" (5 de 6), quatro destinos, cada um com o
quadrinho desenhado **na proporção real** — "4:5" e "1:1" são indistinguíveis
para quem não pensa em número o dia todo.

Catálogo único em [videoFormat.ts](backend/src/services/providers/videoFormat.ts),
espelhado no frontend, **com o espelho conferido pelo gate**: duas listas que
discordam produzem o pior defeito possível aqui — a tela oferece um destino, o
servidor cai no padrão, e o cliente recebe horizontal sem erro em lugar nenhum.

**A resolução vai em 720p, e não 1080p, porque 720p é o único ponto de custo
MEDIDO** (~US$ 0,045/s no LIVE-1). Explicitar o que já era o comportamento
observado tira a decisão do fornecedor sem mexer no custo. Corpo sem plataforma
cai no padrão declarado (YouTube/16:9): um cliente antigo não pode ser a
exceção que reabre a omissão.

**2. Motor: decidido e gravado sempre, enviado só atrás de flag.** A peça
central é DEDUZIDA (ver tabela), e um valor recusado em `engine` derruba a
geração — o caminho caro. Então a seleção roda e é gravada em todo vídeo, com
a razão (`declared_preference`, `default_no_declaration`, `flag_off`, …), e só
o **envio** depende de `explicit_avatar_engine`, **desligada**. O dado é
colhido sem arriscar nada.

`avatars.provider_engines` passou a guardar o que o fornecedor declara —
o campo vinha em toda criação e era descartado com o corpo.

**3. A fixture acompanha.** Quatro fixtures versionadas, uma por proporção
(16:9 → 640×360, 9:16 → 360×640, 4:5 → 512×640, 1:1 → 512×512), e o job
simulado entrega **a que o payload pediu**. Uma simulação que devolvesse sempre
640×360 aprovaria justamente o caminho que este bloco verifica — falso verde.

*Medido pela rota real de download, com `ffprobe` no arquivo baixado:*
`reels_tiktok` → **360×640 9:16**; `youtube` → **640×360 16:9**. E o payload
montado pelo caminho real nas **8** combinações: `aspect_ratio` e `resolution`
presentes em todas, `engine` só com a flag ligada.

**4. Guarda nova** ([checkVideoFormatPolicy.ts](backend/src/scripts/checkVideoFormatPolicy.ts)),
com **6 asserções**. A principal exercita a MONTAGEM real do payload, uma vez
por plataforma — **casa 4 montagens** (uma por plataforma do catálogo), mais
4 fixtures, 2 vendors, 5 formas de declaração de motor e 4 entradas do espelho
do frontend. Casar texto no arquivo passaria a aprovar no dia em que alguém
movesse a montagem de lugar, que é a reorganização que faz um campo se perder.

**O mutante esperto não tira o campo:** faz toda plataforma resolver para 16:9.
O payload continua completo, a superfície inspecionada não muda, e o produto
volta ao comportamento anterior — agora **com aparência de decisão**. Só a
asserção sobre proporções DISTINTAS pega isso. `check:mutants`: **41/41**.

**Duas coisas que a própria execução ensinou:**

1. **A guarda de fixtures acusou ausência onde não havia.** Ela conferia
   `<repoRoot>/backend/fixtures`, e o bind mount de `/repo` traz só
   `backend/src` e `backend/scripts` — as fixtures chegam pelo `COPY` do
   Dockerfile. Corrigido conferindo `FIXTURES_DIR`, **o mesmo caminho que o
   job simulado lê em execução**, o que de quebra torna a guarda capaz de
   pegar o defeito do VIDEO-0 (Dockerfile sem copiar a pasta).
2. **O arnês recusou o mutante esperto por `expect` errado**, não por guarda
   inerte: a mensagem diz "as 4 plataformas do catálogo", e o `expect` dizia
   "todas as plataformas". Vale registrar porque o `expect` agora é o núcleo
   da frase, **sem a contagem** — prendê-lo ao número faria uma quinta
   plataforma transformar guarda saudável em mutante AMBÍGUO, que é como se
   aprende a ignorar o arnês.

**ACHADO DE AMBIENTE, PRÉ-EXISTENTE E SÉRIO.** A imagem do frontend era
anterior ao commit `97cd8d1`, que acrescentou `__MAX_IMAGE_BYTES__` ao
`vite.config.ts` — arquivo **fora do bind mount**. Resultado: **a app inteira
quebrava em branco**, com o console limpo, o Vite reportando `ready` e o
healthcheck verde. O erro real (`__MAX_IMAGE_BYTES__ is not defined`) só
aparece ao importar `/src/main.tsx` à mão pelo console. Resolvido com
`docker compose build frontend`. O gotcha do bind mount já estava registrado;
**o sintoma não estava** — e "tela em branco sem erro nenhum" não aponta para
configuração de build.

### O que SÓ A GERAÇÃO LIVE pode fechar (FORMATO-1)

Nada disto está verificado, e nenhuma linha do código ou da UI afirma que
está:

- **Se 9:16 sai vertical de verdade.** É a pergunta central do bloco e a
  única que importa para o produto. Tudo que existe hoje é: o campo vai no
  payload (medido), a doc diz que ele é aceito (documentado), e a simulação
  honra a proporção (medido — mas a simulação somos nós).
- **Se a HeyGen aceita `aspect_ratio`/`resolution` neste payload.** A doc
  descreve os campos; nenhuma requisição nossa jamais os enviou. Um campo
  recusado derruba a geração inteira.
- **Se `engine: { type }` é aceito, e se `supported_api_engines` é mesmo o
  vocabulário dele.** É a dedução central, e a razão de o envio estar atrás de
  flag desligada.
- **Se um mesmo avatar rende bem fora do horizontal.** O avatar foi treinado
  com uma foto; nada garante enquadramento utilizável em 9:16 ou 1:1.
- **O custo por proporção e por resolução.** `provider_usage` já grava
  `aspect_ratio`, `resolution` e `provider_engine`, mas todas as linhas de
  hoje são de simulação. "9:16 custa mais que 16:9?" continua sem resposta.
- **Se 1080p e 4k valem a pena.** Só 720p tem custo medido, e é por isso que
  as quatro plataformas o usam.
- **O que a D-ID faz com a proporção.** Declarada como `supported: false` (a
  geometria sai da imagem de origem), e **nenhuma resposta real da D-ID foi
  observada em nenhuma sessão** — a declaração é leitura de doc, não medição.

### Bloco PREVOO-1 (3.5) — verificação antes da passada live (CONCLUÍDO)

Bloco de **verificação**, não de construção. Ambiente em `fixture` do começo ao
fim, `PROVIDER_LIVE_CONFIRM` vazia, **zero chamadas tarifadas**.

**1. Versão da API — MEDIDO pelo código, e sem parada condicional.** O caminho
de geração é **v3**. Todos os endpoints HeyGen do projeto:

| Endpoint | Versão | Onde | Papel |
|---|---|---|---|
| `POST /v3/assets` | v3 | [avatarProvider.ts:243](backend/src/services/providers/avatarProvider.ts:243) | upload de foto e de áudio |
| `POST /v3/avatars` | v3 | [:265](backend/src/services/providers/avatarProvider.ts:265) | criação (o mais caro: US$ 1,00) |
| `GET /v3/avatars/{id}` | v3 | [:318](backend/src/services/providers/avatarProvider.ts:318) | status do avatar (`// ASSUMPTION`) |
| `POST /v3/videos` | **v3** | [:380](backend/src/services/providers/avatarProvider.ts:380) | **geração** |
| `GET /v3/videos/{id}` | **v3** | [:406](backend/src/services/providers/avatarProvider.ts:406) | **polling** |
| `GET /v2/user/remaining_quota` | v2 | [:450](backend/src/services/providers/avatarProvider.ts:450) | teste de credencial — **sunset 2026-10-31** |
| `GET /v2/user/remaining_quota` | v2 | [platformKeyProbe.ts:27](backend/src/services/providers/platformKeyProbe.ts:27) | botão "Validar" do painel |

**DOCUMENTADO:** `aspect_ratio`, `resolution` e `engine` pertencem ao schema
`CreateVideoFromAvatar` de `POST /v3/videos` — confirmado em duas leituras
independentes da doc pública. Cuidado com uma armadilha de fonte: o campo
`dimension {width,height}` que aparece em specs de terceiros é da **v2**
(`/v2/video/generate`); a v3 usa `resolution` + `aspect_ratio`. Quem consultar
a v2 por engano vai montar um payload que a v3 ignora.

**ACHADO, e era um buraco real:** `GENERATION_ENDPOINTS` — a deny-list que
impede o probe de validação de apontar para um endpoint que gera — conhecia
**só `/v2/video/generate`**. O caminho de geração deste projeto é v3 desde
sempre, então um probe apontado para `api.heygen.com/v3/videos` passava
**verde**. Pior: `/v3/avatars` custa US$ 1,00 por chamada, contra US$ 0,15 de um
vídeo curto. Os dois entraram na lista, e o mutante correspondente passou a
apontar para a v3. *Lição: deny-list nomeia o que conhece, e envelhece em
silêncio quando o código migra de versão.*

**2. Caminho de erro do fornecedor — e o achado mais sério do bloco.**

**MEDIDO:** um 400 do fornecedor com um campo `api_key` no corpo saía **em
claro** no log. Não por falta do LOG-1 — o `vendor_response` mascarava
corretamente —, mas porque `fetchJson` monta a exceção como
`"<Vendor> API error (400): <corpo bruto>"`, de modo que o **corpo inteiro
viaja dentro de `err.message`**, e `toClientVendorError` publicava esse texto
no evento `vendor_error` alguns milissegundos depois.

É exatamente o defeito que o LOG-1 corrigiu, num evento que ninguém tinha
olhado. **Um segredo mascarado num evento e legível no seguinte não está
mascarado.** Corrigido passando o `detail` pela mesma varredura
(`scrubSecretsFromText`, agora exportada).

Guarda nova ([checkVendorErrorPathPolicy.ts](backend/src/scripts/checkVendorErrorPathPolicy.ts)),
exercitando o caminho real com `fetch` substituído e `console` capturado —
sem rede, sem banco, sem consumir teto. Quatro asserções que puxam em direções
opostas de propósito: o erro **interrompe** (não vira job pendurado), o corpo
**chega** ao log, o segredo **não** chega em claro, e nada do fornecedor chega
à mensagem do cliente.

*Medido no caminho HTTP real, com a fixture de falha:* estado terminal `error`,
`provider_job_id` nulo, mensagem genérica em pt-BR na tela.

**NÃO VERIFICADO:** que a HeyGen real devolve o corpo de erro na forma
simulada aqui (`{error:{code,message}}`) — nenhuma resposta de erro real do
fornecedor foi observada em nenhuma sessão.

**3. Contabilidade em falha — MEDIDO, e NÃO corrigido (decisão do usuário).**

| O quê | Comportamento medido | Onde um conserto entraria |
|---|---|---|
| Crédito | **Debita e ESTORNA.** Saldo 1 → 1, com `−1 consumption` e `+1 refund` no ledger | correto como está — [videos.ts:305](backend/src/routes/videos.ts:305) e [:373](backend/src/routes/videos.ts:373) |
| **Teto de sessão** | ~~**CONSOME e NÃO devolve.**~~ **CORRIGIDO no bloco TETO-1** — o gasto volta na falha, a tentativa não. O texto original fica abaixo como registro do que era | era [avatarProvider.ts:659](backend/src/services/providers/avatarProvider.ts:659) e [voiceProvider.ts:61](backend/src/services/providers/voiceProvider.ts:61); hoje os dois passam por `withLiveBudget` |
| `provider_usage` | **NÃO registra nada** numa falha de criação: 70 linhas antes, 70 depois | a escrita só acontece no polling, ao ficar `ready` ([videos.ts](backend/src/routes/videos.ts)) |

**Consequência prática para o Bloco 5, e é o motivo de isto ter sido medido:**
com `MAX_GENERATIONS=2`, **duas falhas esgotavam o teto sem nenhum vídeo ter
saído**, e a única saída era reiniciar o backend (o contador é por processo).
Uma falha na voz também conta — o teto é compartilhado.

**Isto foi CORRIGIDO no bloco TETO-1 (2026-08-02).** A falha devolve o gasto;
quem passou a barrar o laço é um segundo contador, de tentativas, que não
volta. Ver o bloco próprio no fim deste arquivo. O parágrafo acima fica como
registro do estado medido no PREVOO-1.

**Nota de custo:** `synthesizeSpeech` tenta **dois** endpoints do ElevenLabs
(`synthesizeWithTimestamps` e, se falhar, `synthesizePlain`) — observado no log
durante a medição. São duas chamadas por geração, não uma.

**4. Resolução não é observável em fixture — registrado e congelado.**

**MEDIDO:** as fixtures têm no máximo 640 px de lado (640×360, 360×640,
512×640, 512×512). A simulação honra **proporção**, e só ela. Pedir `720p` e
receber 640×360 é o comportamento **correto** da simulação.

Fazer as fixtures nascerem em 720p pareceria mais fiel e seria pior: daria a
impressão de que a resolução foi verificada, quando a simulação apenas
devolveria o arquivo que nós escolhemos. A guarda reprova se alguma fixture
**coincidir** com uma resolução declarada — a asserção é o inverso do
instinto, de propósito.

Uma segunda guarda reprova texto de produto que **afirme resolução entregue**.
Ela precisou aprender uma distinção: resolução de **entrada** ("grave em 1080p
em vez de 4K") é uso legítimo e frequente. A primeira versão proibia o termo e
acusou **seis** usos legítimos de uma vez — e guarda que acusa uso legítimo é
abandonada, o que já custou caro aqui (GUARDAS-1, achado C). Agora são duas
camadas: coocorrência com verbo de entrega em qualquer texto, e proibição
total dentro do bloco de tradução do passo "Publicação", onde não existe uso
legítimo. *Medido: 0 promessas, 6 menções a resolução de entrada.*

**5. Frescor da imagem do frontend — a invariante que faltava.**

O defeito real: a imagem era anterior ao commit que acrescentou
`__MAX_IMAGE_BYTES__` ao `vite.config.ts`, arquivo **fora do bind mount**. A
app inteira ficava em branco, com console limpo, Vite anunciando `ready` e
healthcheck verde. **Nenhum sinal do ambiente apontava para "imagem velha".**

Desenho: hash dos arquivos **copiados e não montados** (`package.json`,
`tsconfig.json`, `vite.config.ts`, `Dockerfile`), gravado em `/app/.image-stamp`
**durante o build** e servido em `GET /__image-stamp` por um plugin do Vite. O
gate recalcula a partir do repositório e compara. Fins de linha normalizados —
sem isso, todo build no Windows acusaria divergência permanente, e guarda que
acusa sempre é abandonada na primeira semana.

O carimbo fica em `/app` puro, e não em `src/` ou `public/`: nesses o host
sobrescreveria, e o carimbo passaria a comparar o repositório com ele mesmo.

**Frontend fora do ar vira NOTA, não falha** — o gate também é verificação de
código, e amarrá-lo a um serviço de pé produziria o falso positivo que ensina
a ignorar o gate. A nota diz que a verificação **não aconteceu**, em vez de
fingir que passou.

**6. Verdade da promessa por vendor.** `VENDOR_FORMAT_SUPPORT` ganhou
`evidence`: `vendor_response` (nenhum vendor está aqui) > `documentation`
(HeyGen) > `none` (D-ID). O gate reprova `supported: true` com `evidence:
"none"` — suporte sem nada que o sustente é palpite ocupando o lugar de fato.

`GET /video-format-support` diz à tela se o provedor **daquele tenant** honra a
proporção. *Medido nos dois estados, na galeria:* provedor que honra → 5 chips,
0 desabilitados, sem aviso; provedor que não honra → 5 chips, **5
desabilitados**, com o motivo em vermelho. Contrato das feature flags aplicado:
o recurso **não some**, aparece inerte **com o motivo**.

*Defeito que a própria galeria expôs, de novo:* uma prop faltando derrubou o
painel — e o error boundary do PENDENCIAS-1 isolou, mostrando
`vendorHonors is not defined` em vez de deixar a galeria inteira em branco.
Segunda vez que esse boundary paga por si.

**Facebook entrou no catálogo** (a pedido, durante o bloco): entrada própria
"Feed do Facebook" em 4:5 — mesma proporção do feed do Instagram, e isso é o
caso normal, não duplicação a eliminar: quem publica no Facebook procura
"Facebook" na lista, não "4:5". O Facebook Reels entrou no rótulo do 9:16. São
**5 plataformas → 4 proporções**.

**Estado das guardas ao fim do bloco:** `npm run check` verde,
`npm run check:mutants` **48/48**.

**Três mutantes nasceram errados, e os três ensinam coisa diferente** — vale
mais que o resultado:

1. **`expect` com a caixa errada.** A mensagem diz "**NÃO** corresponde ao
   repositório" e o `expect` dizia "não corresponde". O arnês compara com
   `includes`, que diferencia maiúscula, então uma guarda perfeitamente
   saudável apareceu como AMBÍGUA. Segunda vez que um `expect` mal escrito
   acusa guarda boa (a primeira foi no FORMATO-1, com a contagem).
2. **Mutante que testa a proposição errada.** O primeiro mutante do caminho de
   erro removia o corpo da *mensagem da exceção* para provar que "o corpo vai
   ao log" — mas o corpo chega ao log pelo `rawBody`, que não passa pela
   mensagem. O mutante não introduzia o defeito que a guarda pega, e o gate
   passava verde com razão.
3. **O melhor achado: a guarda verificava menos do que afirmava.** Ao esvaziar
   o corpo do `vendor_response`, o gate continuou verde — porque o
   `vendor_error`, emitido depois, repete o mesmo texto dentro do `detail`. A
   asserção dizia "o corpo chega ao log" e o que ela verificava era "o corpo
   aparece em algum lugar". São coisas diferentes: o `vendor_error` passa por
   scrub e é emitido *depois* da interpretação, então depender dele esvaziaria
   justamente a garantia que o LOG-1 existe para dar. Corrigido recortando o
   evento antes de procurar.

### Bloco 4A — custo real na tela, e o que gasta sem ninguém ver (CONCLUÍDO)

Ambiente em `fixture` do começo ao fim, `PROVIDER_LIVE_CONFIRM` vazia, **zero
chamadas tarifadas**.

**1. Custo tem UM número, e ele é medido.**
[providerCost.ts](backend/src/services/billing/providerCost.ts) é o único lugar
do sistema com número de custo de fornecedor:

> **60 unidades por dólar · US$ 0,045 por segundo ENTREGUE**
> Medido em 2026-08-01: carteira 15,50→15,35 USD e quota 930→921 numa geração
> de 3,372 s (ffprobe). **Condições: HeyGen, 16:9, 720p.**

O que existia antes eram **dois** números, e os dois erravam ao mesmo tempo: a
taxa de `provider_cost_rates` (US$ 0,03/s, palpite) multiplicando a duração
**pedida** (15 s) em vez da entregue (3,372 s). Daí os 4,5×.

*Medido nas rotas reais, em fixture:* estimativa de 15 s → US$ 0,675; real de
5 s → **US$ 0,225**; diferença **−US$ 0,45**, fator **3×**. O painel do tenant
mostra os dois lados e a diferença; antes de gerar, mostra só a estimativa com
a ressalva das condições de medição.

**AUSÊNCIA nunca vira zero.** Consumo sem medição (voz, roteiro, D-ID) devolve
`costUsd: null` com o motivo por extenso. *Medido no painel admin:* HeyGen com
custo derivado, três linhas marcadas **AUSENTE**, total somando só o medido e
declarando quantas linhas ficaram de fora.

**O caminho antigo foi removido do BANCO, não só do código** (migration 039):
`estimated_cost_cents` e `rate_snapshot_cents_per_unit` foram dropadas, a tabela
`provider_cost_rates` foi dropada, e as rotas `/admin/cost-rates` e a tela que
as editava saíram junto. Manter um editor de taxas ao lado de uma medição real
seria manter uma segunda verdade sobre dinheiro — e é a primeira que errou.

**Achado que só apareceu rodando:** as duas colunas eram `NOT NULL` sem default.
Parar de escrevê-las sem removê-las fez **toda** escrita de consumo falhar — e
falhar **em silêncio**, porque registrar consumo nunca lança. Três gerações não
deixaram linha nenhuma. Telemetria que falha calada é pior que telemetria
nenhuma: a ausência parece "nada aconteceu".

**2. Rastro da falha.** `provider_usage` ganhou `outcome` e `failure_reason`.
Uma tentativa recusada agora deixa linha com `unit_count = 0` — zero aqui é a
verdade, nada foi entregue — e o motivo **sanitizado** (o corpo bruto continua
só no log). Cobre os quatro pontos de falha: recusa na criação, erro no
polling, artefato inválido e timeout. O do timeout só grava se o `UPDATE` de
fato marcou erro, senão um vídeo que ficou pronto no último instante ganharia
uma linha de falha ao lado da de sucesso.

**3. ElevenLabs — a perna de custo, MEDIDA e corrigida no registro.**

**O registro do PREVOO-1 estava errado.** Ele dizia que `synthesizeSpeech` faz
"duas chamadas por geração, não uma". Faz **uma** no caminho feliz. A segunda é
**fallback condicional**, e só acontece quando a primeira falha:

| Cenário | Chamadas | Fonte da duração |
|---|---|---|
| `with-timestamps` 200 com áudio | **1** | `elevenlabs_timestamps` |
| `with-timestamps` 401 (sem permissão no plano) | 2 | `bitrate_estimate` |
| `with-timestamps` 200 **sem** `audio_base64` | 2 | `bitrate_estimate` |

A medição anterior viu duas porque o `fetch` substituído devolvia 400 para
tudo. **Não é duplicação — nada a remover.**

**Correção da premissa do item:** a síntese **não** está fora do teto de
sessão. Ela é alcançada só por `requireAudio` → `generateVideoHeygen`, que roda
**depois** de `consumeLiveGeneration` em `generateVideo`. Está protegida
indiretamente, e o único caminho para ela é esse (verificado por grep).

**O cenário de cobrança dupla existe e não foi observado:** se a primeira
chamada devolver 200 **com** áudio gerado mas **sem** `audio_base64` no corpo,
o fornecedor cobrou e nós caímos no fallback, que cobra de novo. Depende de uma
forma de resposta que nunca vimos. Registrado, não tratado.

**4. Redação no SUMIDOURO.** Todo evento passa por
[safeLog.ts](backend/src/services/log/safeLog.ts) — `logEvent()` é o único
caminho de saída, e o gate reprova `console.*` direto em `backend/src` (18
módulos convertidos; a única exceção é o próprio logger, cujos dois
`console.error` de último recurso já são redigidos e roteá-los pelo `logEvent`
criaria recursão no momento em que o log está quebrado).

A redação casa por **FORMA**, não por nome de campo: `sk-…`, `AIza…`, `AQ.…`
(o formato inesperado já registrado neste projeto), `xi-…`, `hg_…`, JWT,
`Bearer …`, e o caso genérico de bloco opaco com 40+ caracteres. Percorre
qualquer profundidade, inclusive `Error` (que não é enumerável — `{...err}`
perderia justamente a `message` que carrega o corpo do fornecedor).

*Medido, exercitando a função:* redige string solta, campo de objeto, **array
dentro de objeto**, `err.message` de um `Error`, e par `chave=valor` com nome
inocente — e **não** tarja texto legítimo (`"video 3ef8da68 pronto em 3.37s,
formato 9:16, engine avatar_iv"` sai intacto). Uma redação que apaga o log
inteiro é abandonada na primeira semana.

**5. Freio DERIVADO do catálogo.**
[endpointCatalog.ts](backend/src/services/providers/endpointCatalog.ts) lista
**12 endpoints** de 3 fornecedores, cada um com `billable` e uma nota dizendo
se o custo é medido ou suposto. A deny-list do probe deixou de ser escrita à
mão: ela agora é `billableEndpointPaths()`. **8 tarifáveis.**

O defeito que isso fecha não foi esquecer uma linha — foi a lista **nomear o
que conhece**, e por isso envelhecer em silêncio a cada versão nova. O mutante
esperto aponta o probe do ElevenLabs para `/v1/voices/add` (clonagem, tarifada):
com a lista antiga isso passava, porque ela nunca teve endpoint de ElevenLabs.

**6. Falha depois do aceite — MEDIDO, não corrigido.**

| Desfecho | status | Crédito | Teto de sessão | `provider_usage` |
|---|---|---|---|---|
| **A. Aceite + sucesso** | `ready` | −1, sem estorno | gasto 1, tentativa 1 | `success`, u=5 real, pedido=15 |
| **B. Aceite + timeout** (~7,5 min) | `error` | −1, **sem estorno** | gasto 1, tentativa 1 | `failed`, u=0 — **DEDUZIDO** |
| **C. Aceite + erro no polling** | `error` | **−1, sem estorno** | gasto 1, tentativa 1 | `failed`, u=0, pedido=15 |
| **D. Recusa antes do aceite** | `error` | −1 **+1 estorno** | **gasto DEVOLVIDO**, tentativa 1 | `failed`, u=0, pedido=15 |

**A coluna do teto mudou no bloco TETO-1, e note que ela agora acompanha a do
crédito linha a linha:** A, B e C retêm as duas coisas; só D devolve as duas.
Não é coincidência — as duas usam a mesma fronteira ("o fornecedor chegou a
aceitar o trabalho?"), de propósito. Duas fronteiras diferentes para a mesma
pergunta divergiriam na primeira mudança, e a divergência só apareceria em
live.

A, C e D foram **medidos** por HTTP real em fixture. B é **DEDUZIDO** do
código: 90 tentativas × 5 s inviabilizam a medição, e o caminho é o mesmo de C
(`refundCredit()` só existe no `catch` de `generateVideo`, em
[videos.ts:373](backend/src/routes/videos.ts:373); o laço de polling nunca
estorna).

A coluna do teto é **DEDUZIDA em todas as linhas**: em fixture o teto nunca é
consumido. O comportamento em live foi medido no PREVOO-1 — consome e **não
devolve**.

**A linha que importa é a C: aceite seguido de falha NÃO estorna, e isso está
certo.** O fornecedor renderizou e cobrou; devolver crédito ali faria o ledger
divergir do dinheiro real. Um marcador de fixture novo (`-pollfail-`) tornou
esse desfecho exercitável sem live — era o único que não acontecia sozinho.

**Desfecho E, não listado porque não é falha de geração:** se o processo
reiniciar entre a criação e o polling, o `setInterval` morre junto e o vídeo
fica preso em `queued` para sempre, sem linha de falha. Registrado, não tratado.

**Estado das guardas ao fim do bloco:** `npm run check` verde,
`npm run check:mutants` **53/53**.

**Um mutante mudou de SENTIDO, e o arnês foi quem mostrou.** O do PREVOO-1 que
removia o scrub explícito de `vendorError.ts` reprovava — a chave vazava. Depois
que `logEvent` virou o sumidouro único, o mesmo defeito deixou de vazar: a
camada de baixo segura. Não é guarda ficando inerte; é a proposição deixando de
ser falsificável **por ali**, porque a defesa passou a ter duas camadas. O
mutante virou `expectGreen`, o que documenta a redundância e a **prova** a cada
execução: se o sumidouro for enfraquecido, este contraponto quebra junto com o
mutante da redação, e os dois apontam para o mesmo lugar.

**E o `expect` errou o recorte pela terceira vez** (a mensagem diz "o número de
custo 0.045 fora de providerCost.ts"; o `expect` dizia "número de custo fora
de"). Prender o `expect` a um valor que pode mudar transforma guarda saudável em
mutante AMBÍGUO — o recorte certo é a parte estável da frase.

### Bloco TETO-1 — a falha devolve o teto, e o laço ganha contador próprio (CONCLUÍDO)

Ambiente em `fixture` do começo ao fim, `PROVIDER_LIVE_CONFIRM` vazia, **zero
chamadas tarifadas**. Fecha a decisão aberta nº 1 do handoff do 4A.

**A causa era um contador servindo a dois propósitos.** O teto empacotava
duas proteções diferentes: a da **carteira** (quantas chamadas produziram
trabalho pago) e a contra **laço** (quantas vezes o código disparou). Uma
chamada que falha não gasta a carteira, mas consumia o teto de carteira — daí
o defeito medido no PREVOO-1.

Um contador só não conseguia servir aos dois: devolvê-lo na falha desligaria a
proteção contra laço (dez disparos que falham dez vezes devolveriam dez vezes
e rodariam para sempre); não devolvê-lo é o defeito. **Agora são dois:**

| Variável | Conta | Volta na falha? |
|---|---|---|
| `PROVIDER_LIVE_MAX_GENERATIONS` | gasto — trabalho que o fornecedor aceitou | **sim** |
| `PROVIDER_LIVE_MAX_ATTEMPTS` | tentativas, com qualquer desfecho | **nunca** |

O default de tentativas **deriva** (3× o de gasto) em vez de ser um número
solto: quem sobe o teto para uma passada de 2 vídeos espera margem
proporcional, e um default fixo transformaria esse aumento em nada — o teto de
tentativas viraria o gargalo silencioso, que é o mesmo modo de falha que este
bloco eliminou do outro.

**A ordem das verificações importa, e não é a intuitiva:** a trava de laço é
verificada **primeiro**. Depois que as falhas passaram a devolver o gasto, o
teto de gasto pode ter folga justamente porque tudo falhou — verificá-lo antes
deixaria o laço passar no exato cenário em que ele existe para barrar.

**A fronteira é a MESMA do estorno de crédito** (ESTORNO-1), de propósito:
devolve quando a chamada **lançou**, porque lançar significa que o fornecedor
não aceitou o trabalho. Ver a tabela dos quatro desfechos do 4A, onde as
colunas de crédito e de teto agora andam juntas linha a linha.

**Consumo e devolução no mesmo lugar.** `withLiveBudget(operation, verb, fn)`
substituiu o par `consumeLiveGeneration` + `throw` nos dois caminhos
tarifados. Não é açúcar sintático: uma devolução esquecida num `catch` é
invisível — o código segue funcionando, o contador segue plausível, e o
defeito só aparece na terceira falha de uma passada live. A guarda passou a
**reprovar `consumeLiveGeneration` direto** em caminho tarifado.

**Caso de fronteira conhecido e NÃO tratado:** `generateVideoHeygen` sintetiza
a voz no ElevenLabs (tarifado) **antes** de criar o vídeo. Se a voz foi
sintetizada e a criação falhou, a devolução devolve uma unidade com custo
parcial real. Aceitável porque o teto é trava de segurança, não contabilidade
— quem mede dinheiro é `provider_usage` —, mas vai ao log para não ser
descoberto ao conciliar uma fatura.

**A mensagem de teto de tentativas diagnostica.** Atingi-lo com gasto sobrando
só é possível se as chamadas estão **falhando**. A mensagem diz isso, aponta o
evento `live_budget_released`, e manda olhar a falha antes de aumentar o
número.

**Três asserções que puxam em direções opostas.** Uma guarda que só
verificasse "a falha devolve" seria satisfeita por um código que devolve
**sempre** (desliga o teto inteiro) e por um que devolve a **tentativa** junto
(desliga a proteção contra laço). As três juntas não têm implementação trivial
que passe: falha → gasto 0 e tentativa 1; sucesso → gasto retido; e 2 falhas
com gasto folgado (10) contra tentativas 2 → a 3ª é **recusada**. Exercitado
de verdade, sem rede e sem banco.

**`npm run check` verde, `check:mutants` 56/56.** Os três mutantes novos batem
um a um nessas asserções; o esperto que devolve a tentativa junto é o que
importa — gasto volta certo, sucesso retém, superfície idêntica, e só a
proteção contra laço morre em silêncio.

**O preflight imprime os DOIS tetos**, com a margem de falhas por extenso
(*medido:* "3 por sessão — margem de 2 falha(s) antes de travar"), e reprova se
o de tentativas ficar **abaixo** do de gasto: nesse estado as tentativas acabam
antes do gasto e um dos dois números está errado.

**O achado do bloco, e é uma classe NOVA de guarda inerte.** O arnês flagrou a
guarda nova como inerte, e o diagnóstico vale mais que o conserto: ela **não**
deixava de detectar o defeito — detectava, montava a mensagem certa, e **morria
antes de devolvê-la**. Com a devolução removida, o teto ficava em 1/1 e a
asserção seguinte (o contraponto do sucesso) era recusada por
`LiveBudgetExhaustedError`; a exceção subia sem dono, o `checkPolicy` morria
com "falhou de forma inesperada", e o array de falhas acumuladas ia junto.

Saída 1, mas por um motivo que não nomeia a causa — quem lesse concluiria que
o gate está instável, não que o teto parou de voltar. **As armadilhas já
catalogadas aqui eram guardas que passavam VERDE sem inspecionar nada; esta
reprovava e ainda assim não protegia.** O `expect` obrigatório do arnês foi o
que separou os dois casos: sem ele, este mutante teria contado como prova.

### Bloco 5D — "Criar vídeo" demonstrável (FASE 0 e FASE 1 CONCLUÍDAS)

Ambiente em `fixture` do começo ao fim, `PROVIDER_LIVE_CONFIRM` vazia. Fase 0
catalogou sem consertar; Fase 1 consertou escopo fechado. **As Fases 2 a 5
(revalidação da tabela do dinheiro, preflight, geração live, conferência) NÃO
foram iniciadas.**

**O achado que invalida registro anterior: `PROVIDER_MODE=fixture` NUNCA
cobriu os provedores de texto.** `complete()` em `providerRegistry.ts` — ponto
único de saída para Anthropic, Gemini e OpenAI — não consultava
`isFixtureMode()`. Ele atende **três** caminhos: o botão "Gerar com IA" do
passo 2, o copiloto do tenant e o do admin. Toda afirmação de "zero chamadas
tarifadas" dos blocos **3.5, 4A e 5D-Fase-0** valeu porque ninguém clicou ali
— não porque houvesse trava. As afirmações continuam verdadeiras como
medição; o que era falso é a garantia.

**O defeito de FORMA é o do 4A item 5, um nível acima.** Lá a deny-list
nomeava os endpoints que conhecia. Aqui `checkProviderPolicy` verificava o
desvio a partir de `VENDOR_MODULES`, uma lista de **dois** arquivos escrita à
mão — e o backend tem **dez** com saída de rede. Uma lista incompleta tem
exatamente a mesma aparência de uma completa.

*Varredura MEDIDA:* 101 arquivos `.ts`, **10 com saída de rede**, **2**
consultavam o modo. Dos 8 restantes: 4 são ferramentas (`scripts/`), 3 são
exceção legítima e 1 era o buraco.

[checkNetworkEgressPolicy.ts](backend/src/scripts/checkNetworkEgressPolicy.ts)
**descobre** em vez de receber lista: varre `backend/src` por qualquer cliente
HTTP (fetch, axios, SDKs, `node:http`) e exige que cada arquivo ou desvie para
fixture, ou esteja em `EXCECOES` **com motivo escrito**. As três exceções são
`platformKeyProbe` (deliberado desde o CHAVES-2), `downloadProxy` (baixa
artefato já pago) e `stripeClient` (tem mecanismo de teste próprio).

O catálogo ganhou os três fornecedores de texto. **Gemini entra como
tarifável mesmo no free tier**: a cota de ~20 req/dia é compartilhada com o
copiloto, e gastá-la não tira dinheiro — tira a capacidade de demonstrar.
Agora **16 endpoints, 6 fornecedores, 11 tarifáveis**, freio derivado.

**Efeito colateral que valeu a pena registrar:** seis asserções do gate
exercitavam `complete()` com `fetch` substituído para provar retentativa,
corte e tratamento de erro. Com o desvio, elas paravam antes do `fetch`. Agora
forçam `PROVIDER_MODE=live` localmente e restauram em `finally`, conferindo que
voltou — mesmo padrão do `checkPollPolicy`.

**O vídeo passou a existir dentro do produto.** Antes, o único player era o do
passo 6, cujo estado vive em `useState`: sair de `/create` tornava o resultado
inalcançável, e a Biblioteca listava onze vídeos com uma única ação, "Baixar".
[VideoPlayer.tsx](frontend/src/features/VideoPlayer.tsx) é componente **único**
usado nos dois lugares — duas implementações divergem, e a que divergir será a
que mostra fixture sem aviso numa apresentação.

*MEDIDO no navegador:* `readyState 4`, **360×640**, `aspect-ratio` computado
**9/16**, aviso de simulação presente, download preservado, e "Ver na
Biblioteca de vídeos →" no passo 6.

**Custo no passo 4** (*MEDIDO*): 15s → US$ 0,675 · 30s → US$ 1,35 · 60s →
US$ 2,70, atualizando ao trocar. Mesmo `VideoCostPanel` do passo 6.

**O ledger negativo: medido, causa confirmada, dados NÃO alterados.**
*MEDIDO:* 15 lançamentos somam **−2** com saldo **2**. **Nenhum caminho de
código pode produzir isso** — `auth.ts` insere `balance = 0` (neutro), e
`creditGate`/`monthlyGrant` gravam ledger na mesma transação, com a invariante
declarada em comentário. A causa está documentada no próprio repositório, em
`grantDevCredits.ts`: as limpezas de teste do **DEMO-1 e do ESTORNO-1** rodaram
`UPDATE tenant_credits SET balance` sem lançamento.

Os dados **não** foram alterados: a classe é inequívoca, mas *qual dos dois
números está certo* não é — e o projeto já decidiu que isso não é decisão de
script. A guarda ficou onde pega a **próxima** (no código: todo módulo que
escreve saldo grava lançamento), e a conferência dos números foi para o
`preflight:live` como **aviso**. No gate, um banco de dev sujo deixaria o build
vermelho para sempre, e guarda que reprova sempre é abandonada.

**Telas que mentiam:** "Rastreamento de custo em breve" virou **"Custo do mês
US$ 4,50 · de 9 consumos medidos · 5 sem medição, fora do total"** — e o
título mudou junto, porque o número é medido, não estimado. "Créditos
restantes" mostra **2**. Mais: reticências antes do badge na Biblioteca, o
`voice_id` do ElevenLabs trocado por rótulo legível, borda de seleção de 1px
para 3px + faixa de 8px + halo, e a condição que falta ao lado do botão
desabilitado.

**Achado ao verificar:** a legenda do custo saiu com `5 sem medição}}}` na
tela. **O i18next deste projeto não tem o plugin ICU**, então
`{{x, select, …}}` não é interpolado e vai para a tela como texto cru. Use
duas chaves e a condição no componente.

**Guardas: `npm run check` verde, `check:mutants` 64/64** (eram 56).

**Quatro mutantes nasceram errados, e os quatro repetem lições já catalogadas:**

1. **`find: "export"` casava 4 vezes** — o arnês abortou por ambiguidade, e com
   razão: um mutante que casa em vários pontos prova outra coisa a cada
   execução.
2. **Dois `expect` recortados como paráfrase do defeito**, não como núcleo da
   frase emitida ("não desvia para fixture" contra "não consulta
   `isFixtureMode()`"). **Quarta e quinta vez** que isso faz guarda saudável
   aparecer como AMBÍGUA.
3. **A guarda do aviso de simulação nasceu INERTE** — procurava
   `SimulatedNotice` no arquivo, e removida a renderização o **import**
   continuava lá e satisfazia a busca. O gate passou **verde** com o defeito
   aplicado. Corrigida ancorando no uso em JSX (`<SimulatedNotice`). É a
   **quinta vez** que uma guarda deste projeto casa a menção em vez do uso.
4. **A guarda de egress acusou `api.cohere.ai`** — host que existe apenas
   dentro do `replace` do mutante declarado no próprio arquivo. Quarta vez que
   uma guarda tropeça no texto escrito para descrevê-la, e a primeira em que
   esse texto era a prova de que ela funciona.

### O que a Fase 0 catalogou e a Fase 1 NÃO consertou

Fora de escopo por decisão explícita, registrado para não virar surpresa:
miniatura na Biblioteca; persistência do wizard em F5 (o estado vive em
`useState`); `/api/notifications/summary` chamado dezenas de vezes por
passada; indicador que não distingue passo preenchido de pulado; e a aba
**RAG**, que continua sem decisão tomada.

Também continua valendo, do POLL-1: **a UI exige 3 fotos e o provider usa só a
primeira**.

**Limpeza:** os dois vídeos de teste saíram do banco. As FKs são `SET NULL`, e
*MEDIDO:* a soma do ledger ficou **−3 antes e −3 depois**. **Dois `.mp4`
ficaram órfãos** em `uploads/c77a5b8a-…/` e NÃO foram apagados.

### Procedimento: ler o consumo do ElevenLabs (item 3.2)

**Endpoint de leitura, NÃO tarifado:** `GET /v1/user/subscription`. Devolve
`character_count` e `character_limit`. Rode **antes e depois** da passada; a
diferença é o consumo real de voz — o número que nunca entrou em conta nenhuma.

```bash
curl -s -H "xi-api-key: $env:ELEVENLABS_KEY" https://api.elevenlabs.io/v1/user/subscription | Out-File -Encoding utf8 tts-antes.json
```

**Duas ressalvas que decidem se isso vai funcionar:**

1. **A chave em uso NÃO tem a permissão `user_read`** (registrado desde o
   DEMO-3), e sem ela este endpoint responde 401. Se responder 401, **não é
   chave inválida** — é permissão faltando, e o diagnóstico errado aqui custa
   tempo. Habilite `user_read` no painel do ElevenLabs, ou aceite que o
   consumo de voz continua não medido.
2. **`Out-File -Encoding utf8`, nunca `>`.** No PowerShell o `>` grava
   UTF-16LE e nenhuma ferramenta de texto acha nada dentro depois.

Para conferir só o essencial sem abrir o arquivo:

```bash
(Get-Content tts-antes.json | ConvertFrom-Json) | Select-Object character_count, character_limit
```

### PLANO DA PASSADA LIVE (Bloco 5) — siga na ordem, sem improvisar

Escrito antes de precisar dele, porque no meio de uma passada que gasta
dinheiro não se lê documentação.

**Antes de qualquer coisa:**

```bash
docker compose exec backend npm run preflight:live
```

**1. Teto para 2, no `.env`, e recriar o container.** O teto conta **voz e
vídeo juntas** — 1 não basta para um fluxo completo, e foi assim que a
primeira passada live morreu.

```bash
docker compose up -d backend
```

`docker compose restart` **NÃO recarrega variável de ambiente** — só `up -d`
recria o container. Recriar zera o log, e tudo bem: isto acontece **antes** da
passada. **Depois disto, só `restart`** — ele preserva o log acumulado e zera
o contador do teto, que é exatamente a combinação desejada se algo falhar no
meio.

**2. Captura de log em UTF-8.** No PowerShell, `>` e `Out-File` sem
`-Encoding` gravam **UTF-16LE**, e `grep` não acha nada dentro:

```bash
docker compose logs backend | Out-File -Encoding utf8 live-run.log
```

**3. Ordem das gerações: 9:16 PRIMEIRO.** O horizontal já foi visto funcionar;
o vertical é a pergunta aberta do Bloco 3. Se só couber uma geração, tem de ser
a que responde algo. **16:9 depois, e só se a primeira passar.**

**4. Baixe o artefato IMEDIATAMENTE, para fora do projeto.** A URL da HeyGen é
assinada e expira (`Expires=` observado no LIVE-1). Depois rode `ffprobe` no
arquivo baixado: **é a única forma de saber a geometria real**, porque nenhuma
resposta da HeyGen declara dimensão — nem a criação nem o polling.

**5. `explicit_avatar_engine` permanece DESLIGADA.** A ligação entre
`supported_api_engines` e `engine.type` é dedução, e um valor recusado derruba
a geração inteira — que é o caminho caro. A seleção continua sendo gravada com
a razão `flag_off`, então a passada colhe o dado sem arriscar nada.

**6. Se falhar, o teto de GASTO volta sozinho** (bloco TETO-1) — a falha
significa que o fornecedor não aceitou o trabalho. O que **não** volta é a
TENTATIVA: com `MAX_GENERATIONS=2` são **6 tentativas** antes de travar, ou
seja 4 falhas de margem. O crédito também é estornado sozinho.

Se as tentativas acabarem, a mensagem diz que as chamadas estão falhando e
aponta o evento `live_budget_released` no log — **leia a falha antes de
aumentar o número**, senão o aumento só produz mais falhas. Para zerar os
dois contadores: `docker compose restart backend`.

### Bloco LIVE-2 — a voz entra no log e o consumo passa a ser medido (CONCLUÍDO)

**1. `voiceProvider` registra a resposta bruta.** Ganhou `readVoiceJson()`, com
o mesmo contrato do `fetchJson()` do avatarProvider: texto → log → parse.
Cobre `cloneVoice`, `checkElevenLabsConnection` e os dois ramos de
`synthesizeSpeech`. De passagem, `checkHeygenConnection` e `checkDidConnection`
também passaram a registrar — eram as únicas do avatarProvider que ainda liam
o corpo à mão.

**O guardrail que define o desenho: áudio nunca vai para o log.**
`audio_base64`, `audio`, `alignment` e `normalized_alignment` são **elididos**
— o log guarda a forma e o tamanho, nunca o conteúdo. E o endpoint simples de
TTS devolve mp3 cru, sem envelope JSON, então existe `logVendorBinaryResponse`,
que registra status, cabeçalhos e bytes e **não** tem campo de corpo.

*Medido, com `fetch` substituído (zero rede):* corpo real de **64.403 bytes**
→ registro de **322 bytes**. A clonagem: **251 bytes**, com `api_key` saindo
como `***REDACTED***`. Sem a elisão seriam ~64 KB **por geração**, num log que
ninguém conseguiria ler.

**2. `provider_usage` mede o que foi consumido.** Ver a lacuna 1 acima para a
ordem das fontes e a migration. *Medido em fixture:* `real=5, pedida=15,
unit_source=vendor_response` — 5 s é a duração real da fixture de vídeo, 15 s é
o que foi pedido na tela.

**3. Guarda nova** ([checkVendorLogPolicy.ts](backend/src/scripts/checkVendorLogPolicy.ts)):
função que chama `fetch(` num módulo de vendor sem registrar a resposta
reprova o build. Casa **13 funções** hoje — exportadas e privadas, porque é nas
privadas que o `fetch` mora.

**Ela nasceu com o defeito que existe para impedir, e isso é o registro mais
útil deste bloco.** Ao provar que reprovava:

- **Primeira tentativa: passou verde.** A guarda exigia que quem faz `fetch`
  chamasse um helper (`readVoiceJson(`), mas não olhava o helper. Esvaziei o
  log de dentro dele e nada acusou — treze funções descobertas de uma vez, sem
  nenhuma delas mudar. Corrigido com uma checagem própria dos helpers.
- **Segunda tentativa: passou verde de novo.** A verificação do guardrail
  procurava `audio_base64` no arquivo inteiro, e a palavra continuava **no
  comentário** que explica a elisão. Guarda satisfeita por comentário é pior
  que guarda nenhuma, porque a prova de que ela funciona também passa.
  Corrigido: comentários removidos antes de procurar, e a busca ancorada na
  constante.

Só depois disso as três provas reprovaram de verdade (saída 1) e o verde
voltou ao restaurar: helper sem log, `ELIDE_KEY_PATTERN` esvaziada, e
`heygenUploadAsset` trocando `fetchJson` por `res.json()`.

**A moral, para a auditoria de guardas que continua pendente:** uma guarda só
vale depois de vista reprovando. Duas de três verificações deste bloco nasceram
inertes, e ambas *pareciam* corretas na leitura.

**O que este bloco NÃO provou:** que o ElevenLabs real produz a forma de
resposta simulada aqui (`audio_base64` + `alignment.character_end_times_seconds`)
— nenhuma resposta real de voz foi observada até hoje, porque o LOG-1 não a
cobria; e que a D-ID declara duração (`data.duration` é palpite, e quando não
vier cai na fonte (b), como projetado).

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

---

### Bloco DEMO-2 — teto de upload do vídeo de referência (CONCLUÍDO)

**Sintoma:** gravar pela câmera falhava com `413 request file too large` em
`POST /avatars/:id/reference-video`.

**Os três tetos, medidos antes de mudar qualquer coisa:**

| Onde | Valor | Observação |
|---|---|---|
| `bodyLimit` do Fastify | **1.048.576 B (1 MiB)** | padrão do Fastify 4, nunca sobrescrito |
| `fileSize` do `@fastify/multipart` | **1 MiB, herdado** | `index.js:52` faz `options.limits?.fileSize \|\| fastify.initialConfig.bodyLimit`, e `app.register(multipart)` sobe sem opções |
| Traefik | **nenhum** | não há `buffering` nem `maxRequestBodyBytes` em `traefik/` |

Era o segundo. Uma gravação de webcam passa de 1 MiB em poucos segundos.

**O teto sobe SÓ nesta rota**, via `req.file({ limits: { fileSize } })` — não
no registro do plugin. Subir globalmente valeria também para documentos e
imagens de referência, que não precisam de nada perto disso, e um teto alto
onde não é necessário é superfície de ataque de graça: qualquer rota de upload
viraria um jeito barato de encher disco e memória. Valor em
`REFERENCE_VIDEO_MAX_BYTES`, padrão 100 MB
([uploadLimits.ts](backend/src/services/uploadLimits.ts)).

**O estouro é tratado em DOIS pontos**, porque `@fastify/multipart` pode
lançar tanto em `req.file()` quanto em `toBuffer()` (`index.js:379`, quando o
stream já foi truncado). Tratar só o primeiro deixaria o caso comum — arquivo
grande que começa a chegar normalmente — cair como 500.

**Erro legível.** A frase crua não permite decidir nada: não diz quanto foi
enviado nem quanto cabe, então quem recebe não sabe se corta 5 s ou 5 min.
*Medido:* `413 {"error":"file_too_large","message":"O envio tem 105,8 MB e o
limite é 100,0 MB. Grave um trecho mais curto ou envie um arquivo menor."}`.
O `sentBytes` vem do `Content-Length` e inclui o cabeçalho multipart — é o
tamanho do ENVIO, alguns bytes acima do arquivo; inventar precisão que não
temos seria pior.

**Validação no cliente, antes de enviar.** *Medido no navegador:* arquivo de
105 MB entregue ao input → erro na tela com tamanho e limite, e **zero**
requisições a `reference-video` (só polling de notificação). Não substitui o
servidor, que continua sendo a autoridade — evita subir dezenas de MB para
receber 413 no fim.

**Cap de duração: 120 s, não 60 s.** O número foi escolhido pelo que os
fornecedores precisam para dar qualidade, não por conforto: amostra curta
piora perceptivelmente a clonagem de voz, e a qualidade melhora até cerca de
1–2 min de fala limpa, estabilizando depois. A ~2,6 Mbps isso dá ~39 MB, com
folga dentro dos 100 MB. Configurável em `MAX_RECORDING_SECONDS`.
**Estes números vêm da orientação publicada dos fornecedores, não de medição
nossa** — nenhum avatar deste projeto foi treinado com durações diferentes
para comparar.

O bitrate passou a ser declarado (2,5 Mbps vídeo / 128 kbps áudio). Não é
compressão, é previsibilidade: o padrão do navegador varia muito por
dispositivo, e com ele variando não dá para prometer que a duração máxima cabe
no teto de tamanho.

**Contador visível durante a gravação**, com parada automática no teto. Um
limite que só aparece no instante em que corta é indistinguível de um defeito.

**O que NÃO pôde ser verificado:** o contador e a parada automática **na UI
real**. O botão de gravar depende de `camera.ready`, e a câmera é bloqueada em
toda automação registrada. Verificado o que dá: as opções de bitrate são
aceitas pelo `MediaRecorder` (uma opção errada lançaria) e a mecânica de parar
por tempo produz blob — provado com `canvas.captureStream()`, que é um
`MediaStream` real sem câmera. **A fiação hook↔UI é dedução, não medição.**

**Achado colateral, NÃO corrigido:** uma falha do provedor **consome o crédito
mesmo assim**. `debitCredit()` roda antes de `trainAvatar()`, e não há
estorno — durante este bloco, um treino que falhou por falta de foto zerou o
crédito de avatar do tenant e o teste seguinte levou `403`. Em live isso
significa perder crédito pago por um erro que não chegou a gastar cota do
fornecedor.

---

### Bloco ESTORNO-1 — crédito não morre por falha do fornecedor (CONCLUÍDO)

**O defeito, achado no DEMO-2:** `debitCredit()` roda antes da chamada ao
fornecedor e não havia estorno. Um treino recusado por falta de foto zerou o
crédito de avatar do tenant, e a tentativa seguinte levou `403`. Em live é
crédito pago perdido por um erro que nem chegou a gastar cota.

**Mapa dos débitos (levantado antes de mexer):**

| Caminho | Onde debita | Defeito? |
|---|---|---|
| Avatar (`avatars.ts`) | antes de `trainAvatar()` | **sim** |
| Roteiro (`scripts.ts`) | antes de `generateScript()` | **sim** |
| Vídeo (`videos.ts`) | antes de `generateVideo()` | **sim** |
| Clone de voz (`avatars.ts`) | não tem débito próprio | n/a — viaja no crédito de avatar |

**Estava nos TRÊS**, não só no avatar. Os três seguiam o mesmo padrão: debita,
chama o fornecedor num `try`, e o `catch` só devolvia erro ao cliente.

**O débito continua onde estava.** Movê-lo para depois da chamada eliminaria o
estorno, mas abriria corrida: duas requisições simultâneas passariam as duas
pela verificação de saldo e as duas gastariam cota. Cobrar e devolver é melhor
que arriscar gastar o que não existe.

**ONDE ESTÁ A LINHA DO QUE NÃO ESTORNA** — a decisão que mais importa aqui:

- **Estorna:** a chamada ao fornecedor lançou. Nada produzido, nenhuma cota
  externa gasta.
- **NÃO estorna:** qualquer falha depois de o fornecedor aceitar o trabalho.
  No vídeo, o corte é exato: assim que `generateVideo()` devolve
  `providerJobId`, o job está enfileirado lá. Falha de polling, artefato
  inválido (bloco DEMO-1) e download quebrado **não** estornam — o fornecedor
  renderizou e a cota dele foi gasta. Devolver aí transformaria problema de
  entrega em crédito grátis.
- **Caso de fronteira que já existe:** em `avatars.ts` o treino pode ter
  SUCESSO e a clonagem de voz falhar em seguida. **Não estorna:** o crédito de
  avatar pagou o treino, e o treino aconteceu. Está comentado no código, no
  `catch` da voz.

**Linha própria no ledger** (`reason = 'refund'`, migration `035`), nunca um
`consumption` positivo. O débito é preservado: sem os dois movimentos, um
relatório de consumo mostraria zero — verdadeiro no saldo e mentiroso sobre o
que aconteceu, já que a tentativa existiu e falhou.

**Idempotência em duas camadas.** A aplicação checa depois do `FOR UPDATE`
(mesmo padrão de `grantPurchasedCredit`), e três **índices únicos parciais**
cobrem o que o lock não cobre: caminho novo que esqueça de checar, e o dia em
que houver mais de uma réplica. Crédito devolvido duas vezes é dinheiro criado
do nada — o tipo de erro de que ninguém reclama, e que só aparece na
conciliação. Chamada sem referência é **recusada** (`no_reference`) em vez de
adivinhar: sem chave de idempotência, um estorno que pode repetir é pior que
nenhum.

*Medido, no caminho HTTP real:* saldo 1 → falha do fornecedor → saldo **1**,
com `−1 consumption` e `+1 refund` na mesma tentativa. Segundo estorno da
mesma tentativa → `{"refunded":false,"reason":"already_refunded"}`, saldo
inalterado, **1** linha de estorno. `INSERT` duplicado direto no banco →
recusado pelo índice único. Caminho de sucesso → saldo 1 → **0**, com apenas
`−1 consumption` e nenhum estorno.

**Duas guardas novas em `npm run check`, ambas provadas reprovando:** rota que
chama `debitCredit()` sem `refundCredit()` (removi o estorno de `scripts.ts` e
o build reprovou), e ausência do motivo `'refund'` no CHECK das migrations —
sem ele, todo estorno explodiria em tempo de execução, no caminho de erro, que
é o menos exercitado. A guarda também reprova se **nenhuma** rota debitar,
para não passar verde por ter deixado de casar com o código.

**Recusa de upload que orienta.** A mensagem dizia tamanho e limite, o que
deixa a pessoa adivinhando qual alavanca puxar — e a mais provável de tentarem
primeiro (regravar mais curto) costuma ser a errada, porque o problema quase
sempre é a câmera em 4K. Agora manda baixar para 1080p primeiro, e encurtar só
se ainda passar. **Cliente e servidor com a frase idêntica** (medido nos dois).

**Orientação antes de gravar**, na tela de configuração: 1080p a 30fps, 2 a 5
minutos para melhor resultado, 30 segundos já funcionam. É texto, não
validação — nada bloqueia o envio. Dizer isso depois, na recusa por tamanho ou
num avatar de qualidade ruim, custa uma regravação inteira.

---

### Blocos LOG-1 e POLL-1 — ver a resposta antes de interpretá-la (CONCLUÍDOS)

**LOG-1.** Toda resposta de vendor passa por `fetchJson()`, que virou o ponto
único de captura: corpo **inteiro** no log (evento `vendor_response`) **antes**
de qualquer parsing, com um `context` que diz qual das sete chamadas foi
(4 HeyGen + 3 D-ID). O motivo é o `// ASSUMPTION` de `data.avatar_item.id`,
nunca confirmado: se o parser errar em live, a HeyGen já cobrou e o id — única
coisa que torna o avatar utilizável — se perderia com o corpo descartado.

As mensagens de erro passaram a **nomear a forma recebida**, chave por chave.
"Campo ausente" não ajuda; `{data: {avatar: {avatar_id: …}}}` diz na hora onde
o contrato mudou.

**Defeito que a própria prova pegou:** a primeira versão logava o objeto
mascarado **e** o texto cru lado a lado, e a chave aparecia legível no segundo
campo. Um segredo mascarado num campo e legível no seguinte não está mascarado.
Hoje: JSON → só o objeto mascarado (que é o corpo inteiro); não-JSON → texto com
varredura de padrões. *Medido:* 3193 → 3170 bytes, diferença só da redação.

**Cabeçalho de requisição nunca vai ao log** — é onde a chave viaja. Da
resposta, só uma allowlist. **Não suba o logger do Fastify para `trace`:** ele
registraria o `x-api-key` por um caminho que este arquivo não controla.

**POLL-1.** `status: completed` sem `video_url` **falha na hora**. Antes caía no
`return { status: "processing" }` do fim da função — uma decisão que ninguém
chegou a escrever — e o job ficava em polling até o teto de ~7,5 min,
terminando como "demorou mais que o esperado". O vídeo não demorou: ficou
pronto, foi cobrado, e nós é que não soubemos ler a resposta. Mesmo tratamento
no `did.pollTalk`.

**Este caso NÃO estorna, e isso está confirmado no código, não suposto:**
`refundCredit()` só é chamado no `catch` de `generateVideo()`
([videos.ts:254](backend/src/routes/videos.ts:254)); o laço de polling nunca
estorna, e este caminho volta por ele. É exatamente a fronteira do ESTORNO-1 —
o fornecedor entregou, nós é que não lemos.

**Guarda nova** ([checkPollPolicy.ts](backend/src/scripts/checkPollPolicy.ts)),
exercitando o caminho REAL (`pollVideoJob`, incluindo `fetchJson` e o log) com
`fetch` substituído — nenhuma chamada de rede. Quatro formas de resposta, com
os contrapontos que impedem a guarda de virar "sempre erro": `processing`
continua processando e `completed` com URL continua pronto. **Provada
reprovando duas vezes:** ao restaurar o `processing` antigo, e ao tirar a
menção a estorno da mensagem.

`PROVIDER_MODE` é trocado e restaurado em `finally`, e a guarda **verifica que
voltou** — deixar o processo do check em live seria um efeito colateral caro.

---

### Bloco DEMO-3 — o que a primeira passada live ensinou (CONCLUÍDO)

**A medição que mais importa: um avatar custa ~US$ 1,00 de verdade.** Carteira
HeyGen **16,50 → 15,50** por UM `photo_avatar`. Isso é dinheiro observado, não
estimativa.

**A tabela `provider_cost_rates` NÃO corresponde a isso.** Ela cobra vídeo por
`duration_seconds` *pedido* e voz por `script.length`, e **não tem linha nenhuma
para criação de avatar** — o custo que realmente apareceu na fatura. Ou seja: o
único custo medido até hoje é o único que a tabela não modela. Toda tela de
custo continua sendo estimativa sobre estimativa, agora com prova de que a
ordem de grandeza real existe e não passa por lá.

**O `// ASSUMPTION` de `data.avatar_item.id` está CONFIRMADO.** A resposta real:

```
data.avatar_item = { id, avatar_type: "photo_avatar", status: "processing",
                     group_id, supported_api_engines: ["avatar_iv","avatar_iii"], ... }
```

Três achados de graça, que só o LOG-1 tornou possíveis:
1. **`supported_api_engines` existe** — este avatar aceita `avatar_iv` e
   `avatar_iii`. A pergunta do bloco MOTOR-1 ("existe campo de motor?") tem
   resposta: o fornecedor DECLARA os motores por avatar. Continuamos sem
   enviar nenhum na geração.
2. **`status: "processing"`** — o avatar não fica pronto na hora. Nada no
   código espera por isso.
3. `avatar_type: "photo_avatar"` confirma o tipo criado.

**Os três defeitos medidos:**

**(A) Teto de upload por rota.** O DEMO-2 subiu o limite só na rota do vídeo de
referência; as outras quatro continuaram no padrão herdado de 1 MiB. `POST
/uploads` (cenário e traje do passo 3) recusava qualquer foto de celular.
Corrigido com um teto de **25 MB para as três rotas de imagem** — tamanho de
foto de celular moderno, e ainda bem abaixo dos 100 MB de vídeo.

O `try/catch` virou um helper único (`takeUpload` em `uploadLimits.ts`), porque
a duplicação foi exatamente o que deixou quatro rotas para trás. A orientação
da recusa agora é por tipo: vídeo manda baixar de 4K para 1080p, imagem manda
reduzir resolução — a alavanca é diferente e a errada custa uma regravação.

**`POST /documents` continua em 1 MiB, de propósito** (fora do escopo do
bloco): um PDF acima disso é comum, e essa rota vai falhar do mesmo jeito.

**(B) Gate de crédito.** O crédito de avatar zerou porque a criação live
consumiu o único que havia — comportamento correto, mensagem no lugar errado:
aparecia na coluna da câmera, do outro lado da tela do botão que falhou. Agora
fica na coluna das ações. E `GenerateStep` tinha `try/finally` **sem `catch`**:
um 403 virava promise rejeitada sem dono e a tela não dizia nada.

Recarregar crédito de dev agora tem caminho próprio:
```bash
docker compose exec backend npm run dev:grant-credits -- --slug dev-c77a5b --avatar 2
```
Ele escreve saldo **e** linha de ledger na mesma transação. `UPDATE` manual
escreve só o saldo, e os dois divergem em silêncio — **já aconteceu**: as
limpezas de teste do DEMO-1 e do ESTORNO-1 deixaram o avatar do tenant de dev
com ledger somando 1 e saldo 0. O script detecta e AVISA da divergência, sem
corrigir: decidir qual dos dois está certo não é decisão de script.

**(C) A causa não era o fornecedor.** O passo 5 falhou com "Não foi possível
concluir a operação no serviço de vídeo" — e **a HeyGen nunca foi chamada**. O
log mostra exatamente 2 requisições no dia (`uploadAsset`, `createAvatar`),
nenhuma para `/v3/videos`.

A causa é o **nosso** teto de sessão: `PROVIDER_LIVE_MAX_GENERATIONS=1`,
compartilhado entre clonagem de voz e geração de vídeo. Configurar o avatar
clonou a voz e consumiu a cota inteira; o vídeo seguinte foi recusado por nós
mesmos, e o sanitizador de erro de vendor transformou isso numa frase que
manda procurar defeito na HeyGen.

Agora é `LiveBudgetExhaustedError`, classe própria, tratada ANTES do
sanitizador: diz que o limite é local, que nada foi cobrado, que é
compartilhado com a voz, e que **um fluxo completo precisa de pelo menos 2**.
No caminho do avatar a mensagem diz também que o treino deu certo e só a voz
faltou — senão o operador refaz um treino que já custou US$ 1.

**Nada a recuperar do vídeo que falhou:** ele nunca foi gerado nem cobrado. O
avatar live (`provider_avatar_id` + `voice_id`) está no banco e é utilizável.

**Gotcha de log, medido:** `docker compose logs > arquivo.log` no PowerShell
grava em **UTF-16LE**, e `grep` não acha nada dentro. Use
`docker compose logs | Out-File -Encoding utf8`, ou converta antes de ler.

---

### Bloco DEMO-4 — os dois bloqueios do caminho live (CONCLUÍDO)

**1. O teto de sessão conta VOZ e VÍDEO juntos.** Esta é a frase que faltava.
`PROVIDER_LIVE_MAX_GENERATIONS` tem cara de "gerações de vídeo", mas
`consumeLiveGeneration()` é chamado em `cloneVoice()` **e** em
`generateVideo()`. Com o padrão de 1, configurar um avatar clona a voz, gasta a
única unidade, e o vídeo seguinte é recusado — foi exatamente isso que matou o
passo 5 na primeira passada live.

A mensagem agora diz **o que** consumiu, em ordem (`clonagem de voz → geração
de vídeo`), que o limite é DESTE aplicativo e não do fornecedor, que nada foi
cobrado, e como sair. *Provado reprovando:* removi o trecho que nomeia o
consumo e `npm run check` acusou.

**2. O avatar volta em `processing` e agora é esperado.**
`waitForAvatarReady()` roda dentro da requisição de treino: espera até 90 s,
consultando de 5 em 5. Estourar o tempo **não é erro** — grava `processing`, e
a tela passa a dizer "em treino". Quem estoura o tempo é a nossa paciência, não
o avatar.

O portão de geração está em `videos.ts` e devolve **409 `avatar_still_training`**.
*Provado nos dois sentidos:* `processing` → 409 com crédito intacto (video=2
antes e depois); `ready` → 201 `queued`. E provado reprovando: trocando a
condição por `if (false)`, o avatar em treino passou — e a guarda textual nova
acusou a remoção.

**A regra de quem passa importa mais que a de quem barra:** só `processing`
bloqueia. `NULL` (avatares criados antes da migration 036 — inclusive o avatar
live que a demo usa) e `unknown` (perguntamos e não entendemos a resposta)
**liberam**. Travar um avatar já pago por causa de uma suposição nossa seria
pior que deixar a tentativa seguir e o fornecedor recusar.

**`GET /v3/avatars/{id}` é ASSUMPTION**, não confirmado. Por isso qualquer
falha de leitura vira `unknown`, que libera: se a suposição estiver errada, o
comportamento degrada para o de antes deste bloco, e não para um avatar preso.
O corpo bruto vai ao log e confirma ou corrige na primeira vez em live.

**3. `supported_api_engines` existe na resposta de criação** —
`["avatar_iv", "avatar_iii"]` para o avatar criado hoje. O fornecedor DECLARA
os motores aceitos por avatar. **Registrado, não implementado:** continuamos
sem enviar motor nenhum em `POST /v3/videos`, então o vídeo sai no padrão da
conta. Isto é o insumo que faltava para a "derivação de formatos".

**Correção de registro do DEMO-3:** aquele bloco afirmou que `GenerateStep`
tinha ganhado o `catch` que faltava. **Não tinha.** O script de edição relatou
sucesso sem casar o texto, e o `tsc` passou porque as duas metades faltaram
juntas — o estado do erro e o bloco que o exibe. Aplicado de verdade agora.
Lição já registrada em outros blocos e repetida aqui: substituição por script
que não confirma o resultado é indistinguível de sucesso.
