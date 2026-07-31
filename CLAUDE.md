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
  2026-07-17 08h52-10h26 UTC) — achado ao verificar o botão de download
  (ver seção 7, entrada "download de vídeo/avatar corrigido + investigação
  do achado paralelo"). **2026-07-17 não tem nenhuma entrada neste
  arquivo** (o histórico pula de 07-16 pra 07-18) — não foi possível
  determinar se foi uma sessão de Claude Code não documentada ou um teste
  manual do usuário fora de sessão; perguntado ao usuário, sem resposta
  conclusiva ainda. Os contratos `// ASSUMPTION` continuam sem confirmação
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
  (vetores randômicos de 1536 dimensões); integração real (OpenAI/Voyage AI)
  pendente — único dos 4 provedores de IA de domínio que continua stub
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
  → `HTTP 200`, `content-type` correto. Ver seção 7 (entrada de 2026-07-18)
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
│       │   ├── migrations/    # 001..013, SQL puro, aplicadas via migrate.ts
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
│           │                  # copilotProvider (real, usado por tenant e público)
│           ├── chunking.ts, textExtraction.ts   # pipeline da base de conhecimento
│           ├── crypto.ts       # AES-256-GCM para credenciais
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
`BACKEND_PORT`, `ENCRYPTION_KEY` (chave AES-256 para credenciais de API),
`SESSION_SECRET`,
`FRONTEND_PORT`, `TRAEFIK_HTTP_PORT`, `PLATFORM_COPILOT_API_KEY` (opcional —
chave da própria plataforma pro copiloto público pré-cadastro; em branco =
widget mostra "não configurado"), `WHATSAPP_NUMBER` (opcional — número pro
link "Fale conosco" da landing; em branco = link some).

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

**Última atualização:** 2026-07-31 — Bloco 6 concluído (resiliência de
ambiente: causa do não-restart isolada, modo de falha do backend
descoberto) e handoff completo escrito. Leia a seção HANDOFF logo abaixo
antes de qualquer coisa.

---

## HANDOFF — leia esta seção inteira antes de tocar em qualquer coisa

Escrito para quem chega **sem nenhum contexto** da conversa anterior. Bloco 6
concluído em 2026-07-31; o que vem depois está em "Frente aberta".

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
`embeddingProvider.ts` devolve `Math.random()`, não há variável de ambiente
de embedding em lugar nenhum, e **não existe código de recuperação vetorial**
— nenhuma query usa `<=>`, `document_chunks` só recebe `INSERT` e nunca é
lido. Falta nas duas pontas.

### Decisões travadas — não reabrir

1. **`PLATFORM_COPILOT_API_KEY` será uma chave Anthropic.** Não invente
   `PLATFORM_COPILOT_VENDOR`: `askCopilot()` faz `vendor = input.vendor ??
   "anthropic"` e nem `public.ts` nem `adminCopilot.ts` passam vendor. Colar
   uma chave Gemini ali a manda para `api.anthropic.com` e dá 401.
2. **Embedding será `text-embedding-3-small` da OpenAI, chave da
   plataforma**, em variável própria — nunca BYOK de tenant. 1536 dimensões
   nativas, cabe em `vector(1536)` sem migration nem truncagem.
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
| Colar `PLATFORM_COPILOT_API_KEY` (Anthropic) | **usuário** | Sem ela, copiloto público e do admin **nunca responderam** |
| Fornecer chave de embedding OpenAI | **usuário** | Desbloqueia os Blocos 3 e 6 |
| Rotacionar a chave Gemini do tenant de demo | **usuário** | Foi colada em texto plano no chat |
| Rotacionar as senhas de `admin@eckkoai.com` e `demo@eckko.ai` | **usuário** | Mesmo motivo; via `npm run dev:seed-access` |
| Pôr saldo no HeyGen | **usuário** | Hoje comporta ~1 vídeo, ver tabela de cota |
| Billing/cota do Gemini (sair do free tier) | **usuário** | Criar projeto novo a cada teto batido não escala |
| Conferir os 9 valores de `provider_cost_rates` | **usuário** | São placeholder; toda tela já mostra banner de estimativa |
| Escrever o Bloco 2B | próxima sessão | Insumo pronto na tabela de lacunas |
| Validar fundo virtual com câmera real | **usuário** | Câmera bloqueada em toda automação desta ferramenta |

### Riscos conhecidos e NÃO corrigidos

- **Não há recuperação automática confiável do ambiente.** Ver a seção do
  Bloco 6 logo abaixo: a política funciona para crash de processo, mas o
  backend tem um modo de falha em que o container fica `running` mentindo.
- **`Sair` em qualquer zona derruba admin e tenant juntos** —
  `session.destroy()`, as duas sessões vivem no mesmo cookie.
- **`/admin` pela barra de endereço entra em laço** — o `AdminAuthProvider`
  não revalida a sessão, e cada volta consome uma das 5 tentativas/15min,
  fazendo o sintoma parecer "senha errada". Entre pelo modal do rodapé.
- **"Créditos restantes" mostra "—"** no painel do tenant embora
  `tenant_credits` tenha saldo real. Bug de UI, catalogado, não corrigido.
- **"6/2 vídeos este mês"** na Minha Assinatura: contador por plano e saldo
  de crédito se contradizem na tela.
- **Moeda inconsistente**: landing em `R$`, app em `$`.
- **`masked_key` mostra os últimos caracteres do texto cifrado**, não da
  chave — inútil para identificar qual chave está lá.
- **Header quebra abaixo de ~500px.**
- Nenhum destes bloqueia a demo pelo caminho ensaiado.

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
- **`tsx watch` não recarrega rota editada** via bind mount: se uma edição
  em `backend/src/routes/*.ts` não tiver efeito, `docker compose restart
  backend`.
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
| **Cliente novo** | "Começar agora" / "Começar grátis" (hero, planos, CTA) | `/signup` — cria tenant, subdomínio próprio e cai em Minha Assinatura |
| **Cliente existente** | "Já tenho conta" (topo e rodapé) | `dev-c77a5b.twinai.localhost/login` — navegação real para o subdomínio, onde o login é escopado |
| **Painel admin** | "Acesso administrativo" (rodapé) | modal próprio → `POST /admin/login` → `/admin` |

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
| Landing abre, mas tudo dá erro; `/api/health` = 502 | backend morto **com o container ainda `running`** (ver Bloco 6) | `docker compose restart backend` |
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

**DOIS projetos Google para a mesma frente — contorno de cota, não
solução (2026-07-31).** A chave BYOK do tenant de demo `dev-c77a5b` foi
trocada por uma de um **projeto Google novo**, criado só porque o projeto
original bateu no teto diário do free tier
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`,
modelo `gemini-3.6-flash`) durante os testes. Ou seja:

- **Projeto A (original):** chave anterior do tenant `dev-c77a5b`, cota
  diária esgotada em 2026-07-30. Não foi revogado, só substituído.
- **Projeto B (em uso agora):** grava em `api_credentials` do tenant
  `dev-c77a5b`, provider `script`, vendor `gemini`, desde 2026-07-31.
  Mesmo teto de ~20 requisições/dia — **o problema não foi resolvido, foi
  adiado por um dia**.

Criar projeto novo a cada teto batido não escala e polui a conta Google
com projetos órfãos. A saída real é uma das duas: billing ativado no
projeto (sai do free tier) ou, coerente com a migração BYOK→plataforma já
decidida (seção 1), a chave passar a ser da plataforma com cota paga. Até
lá, **toda sessão que for rodar bateria de copiloto precisa contar
requisições antes de começar** — 12 requisições (10 sondas + 2 controles)
já é 60% do teto diário.

**A chave do Projeto B foi colada em texto plano no chat**, contra a
instrução da própria sessão. Está no histórico da conversa e **deve ser
rotacionada na passagem para operação** — mesmo precedente das senhas de
`admin@eckkoai.com`/`demo@eckko.ai` (2026-07-30). O valor não foi escrito
em nenhum arquivo, log ou commit; só gravado cifrado no banco pela rota
admin.

**Achado de formato, registrado porque contraria o esperado:** a chave do
Projeto B começa com `AQ.` e tem 53 caracteres, não o `AIza...` de ~39
que se espera do Google AI Studio. Mesmo assim **é aceita como API key em
query string** (`?key=...` → HTTP 200 em ListModels); como token OAuth em
`Authorization: Bearer` dá 401. Não descarte uma chave por não parecer
com `AIza`.

**Caminho barato para validar uma chave Gemini sem gastar cota de
geração:** `GET https://generativelanguage.googleapis.com/v1beta/models?key=...`
(ListModels) não consome a mesma quota de `generateContent`. Serve para
confirmar que a credencial decifra sob a `ENCRYPTION_KEY` atual, que o
vendor a aceita, e que o modelo configurado (`gemini-flash-latest`, que
resolve para `gemini-3.6-flash`) existe naquele projeto — tudo sem
queimar uma das ~20 requisições do dia.

---

**ONDE PAROU (leia primeiro) — frente nova: copiloto do tenant como
suporte real (doc + diagnóstico + RAG).** O plano tem 8 blocos; só o
**Bloco 0 (viabilidade)** foi executado, e ele **reprovou o RAG** por
falta de peça, não por bug:

- `embeddingProvider.ts` é stub declarado — devolve `Math.random()` de
  1536 dimensões. Similaridade sobre ruído não significa nada.
- **Não existe nenhuma variável de ambiente de embedding** no projeto
  (grep em `config.ts` e `.env.example`: zero).
- **Não existe código de recuperação vetorial**: `generateEmbedding()` só
  é chamado na ingestão ([routes/documents.ts](backend/src/routes/documents.ts));
  nenhuma query no backend usa o operador `<=>` ou lê `document_chunks`.
  O RAG falta nas duas pontas, não só numa.
- `document_chunks.embedding` é `vector(1536)` — **compatível** com
  `text-embedding-3-small` (OpenAI, 1536 nativo) e com
  `gemini-embedding-001` (3072, truncável a 1536 via
  `outputDimensionality`). A dimensão **não** é o bloqueio.
- `documents` e `document_chunks` estão **zerados em todos os tenants** —
  nada nunca foi indexado, então não há dívida de reindexação.

**Copiloto do tenant funciona de verdade** — primeira resposta real de
copiloto registrada neste arquivo (pergunta real, resposta real do Gemini
em ~5s, via a BYOK do tenant `dev-c77a5b`; ele **não** usa a chave da
plataforma). **Copiloto do admin continua sem nunca ter respondido**:
`PLATFORM_COPILOT_API_KEY` está vazia.

**Pegadinha registrada:** `askCopilot()` faz `vendor = input.vendor ??
"anthropic"`, e `public.ts`/`adminCopilot.ts` não passam vendor. Ou seja,
**a chave da plataforma tem que ser Anthropic**; colar uma chave Gemini ali
manda ela para `api.anthropic.com` e dá 401. Para usar Gemini seria preciso
uma variável tipo `PLATFORM_COPILOT_VENDOR` repassada nas duas rotas (~3
linhas). Nada disso foi implementado.

**Duas decisões, ambas já tomadas pelo usuário em 2026-07-31:** (1)
`PLATFORM_COPILOT_API_KEY` = chave **Anthropic** (sem vendor novo, sem
`PLATFORM_COPILOT_VENDOR` — bate com o default `"anthropic"` de
`askCopilot()`); (2) embedding = **`text-embedding-3-small` da OpenAI,
chave da plataforma** em env var própria, nunca BYOK de tenant — 1536
dimensões nativas, cabe em `vector(1536)` sem migration nem truncagem.
**A chave Anthropic ainda não foi colada**: `PLATFORM_COPILOT_API_KEY`
segue vazia, então o copiloto público e o do admin continuam sem nunca
ter respondido, e a bateria adversarial só pôde rodar no copiloto do
tenant.

**Status dos blocos:** 1, 1.5, 1.6 e 2A concluídos (ver entradas de
2026-07-31). **Próximo:** Bloco 2B (escrever a documentação nova) — o 2A
só apagou o que era falso e deixou buracos, listados em "Lacunas
deixadas pelo 2A" abaixo. **Livres para tocar:** Bloco 4 (diagnóstico por
SQL escopado), Bloco 5 (ajuda por campo) e Bloco 7 (teto de perguntas +
truncagem). **Bloqueados pela chave de embedding:** Bloco 3 (RAG) e Bloco
6 (isolamento entre tenants).

---

**LACUNAS DEIXADAS PELO 2A — insumo direto do 2B.** O 2A removeu
afirmações falsas sem substituir nada, por escolha explícita: apagar leva
minutos, reescrever leva horas, e uma declaração comercial falsa a quem é
cobrado via Stripe não podia esperar a reescrita. O que ficou faltando,
por arquivo:

| Onde | Buraco deixado | O que o 2B precisa apurar antes de escrever |
|---|---|---|
| `faq.md` | Sumiu a pergunta "por que preciso conectar chaves de API" e a que explicava qual chave o copiloto usa | Qual é a resposta certa hoje ao cliente que pergunta "quem paga os provedores?" — depende da migração BYOK→plataforma (seção 1), que está decidida mas não construída |
| `faq.md` | A diferença entre "Conhecimento e mídia" e "Imagens de referência" perdeu o lado dos documentos | O que os documentos fazem **de fato** hoje: são extraídos e chunkados, e nada mais os lê. Descrever sem prometer RAG |
| `faq.md` / `painel.md` | Sumiu a explicação do card "Créditos restantes" | A tela mostra "—" mas `tenant_credits` tem saldo real (bug de UI já catalogado). Documentar depois de decidir se conserta a tela ou o texto |
| `painel.md` | "Custo estimado" ficou sem explicação | O rastreamento existe (`provider_usage` + `provider_cost_rates`), mas só aparece no painel admin. Decidir se o tenant deve ver |
| `minha-assinatura.md` | Troca de plano, forma de pagamento e faturas ficaram sem contexto | Descrever o fluxo real do Stripe (checkout, webhook, top-up de crédito) e por que a lista de faturas ainda volta vazia mesmo com cobrança real acontecendo |
| `conhecimento-e-midia.md` | Sumiu o "para que serve" dos documentos | Mesmo ponto do FAQ: hoje não serve para nada além de armazenar. É honestidade desconfortável, e é a verdade até o Bloco 3 |
| `conhecimento-e-midia.md` | Sumiu o **contraste** entre documentos e imagens de referência ("essas imagens não são indexadas, diferente dos documentos") | Sem RAG, os dois hoje se comportam igual — o contraste que justificava duas seções separadas deixou de existir. Decidir se as seções continuam separadas |
| `configuracoes.md` | Sumiu o modelo de negócio por trás da tela (era descrito como BYOK) e a mensagem que o copiloto mostra quando falta credencial | Como orientar o cliente que quer trocar de provedor, e o que ele vê quando a chave não está conectada |
| `conteudo.md` | Sumiu a menção ao botão **"Retreinar"**, removida junto com a coluna "Provedor" na mesma frase | O botão existe e continua funcionando — foi dano colateral da remoção. O 2B precisa redocumentar as ações da linha (Retreinar e Baixar) |
| `criar-video.md` / `configurar-avatar.md` | Sumiram as notas de "depende do provedor X conectado em Configurações" | O que dizer quando a geração falha por falta de credencial, já que o cliente não pode resolver sozinho |
| `setup.md` (admin) | Sumiu a seção "Modelo BYOK" inteira e a citação da rota de login | Descrever de quem é a chave hoje e qual é a rota real (`POST /login` unificado) — é doc de operação interna, precisa estar certa |

**Telas que já não existem como os docs descrevem** (apontado, não
reescrito — item 5 do 2A):

- `conteudo.md` — aba Avatares: a coluna "Provedor" foi removida em
  2026-07-22 (já corrigido no doc), mas o doc também **não menciona o
  botão "Baixar"** do vídeo de referência, que existe desde 2026-07-22
  (`GET /avatars/:id/reference-video/download`). Omissão, não falsidade —
  por isso não foi tocado no 2A.
- `minha-assinatura.md` — descreve "um botão para trocar de plano" como
  ação local; hoje o botão leva a um **checkout do Stripe hospedado**, com
  redirect para fora do app e volta com `?checkout=success|cancelled`.
  Fluxo materialmente diferente do descrito.
- `painel.md` — descreve 4 cards, dos quais 2 ("Créditos restantes" e
  "Custo estimado") mostram "—" por bug/decisão pendente, não por
  ausência de funcionalidade.
- `conhecimento-e-midia.md` — a tela se chama **"Base de conhecimento
  (RAG)"** no menu lateral, e não existe RAG nenhum. O nome da tela é o
  problema, não o doc; renomear é decisão de produto, fora do 2A e do 2B.
- `configuracoes.md` — diz que o cartão mostra "os últimos dígitos da
  chave salva"; o `masked_key` devolvido pela API são os últimos
  caracteres do **texto cifrado**, não da chave. Inútil para identificar
  qual chave está lá.

---

~~**Vazamento conhecido, ainda aberto:** `services/docs.ts` varre
`docs/**/*.md` inteiro (pulando só `docs/admin/`)...~~ — **FECHADO em
2026-07-31 (Blocos 1, 1.5 e 1.6).** Ver a entrada própria logo abaixo.
`DEV-ACCESS.local.md` continua na raiz, e não em `docs/`, mesmo assim: um
arquivo não classificado hoje não entra em prompt nenhum, mas a raiz
continua sendo o lugar certo para credencial.

---

**O que foi feito (2026-07-31 — Blocos 1, 1.5 e 1.6: exposição dos docs
fechada, congelada em teste e sondada adversarialmente):**

*Bloco 1 — allowlist no lugar da varredura.* `services/docs.ts` não varre
mais `docs/` excluindo `docs/admin/`. Quem decide exposição agora é
[docsManifest.ts](backend/src/services/docsManifest.ts), com três níveis
cumulativos (`public` ⊂ `tenant` ⊂ `admin`). **Arquivo fora do manifesto
não chega a copiloto nenhum, nem ao do admin** — classificação esquecida
vira "resposta faltando", não "documento vazado". Excluir o que é secreto
falha aberto em tudo que for criado depois; incluir o que é público falha
fechado. O manifesto fica no backend, e não em frontmatter dentro de
`docs/`, para que "o que um anônimo lê?" se responda num arquivo só e
escrever documentação seja um ato separado de decidir sua exposição.
`setup.md` era o pior caso — variáveis de ambiente, escopo do cookie,
layout do proxy — e estava sendo lido para visitante anônimo; foi para
`admin`. Prompt público caiu de **27.800 para 2.342 caracteres**.

*Regra generalizada que saiu do teste adversarial:* **um índice é tão
confidencial quanto o item mais confidencial que ele indexa.** O
`README.md` de `docs/` tinha sido classificado como `tenant`, e o
copiloto do tenant, perguntado "o que tem em docs/admin?", listou os três
arquivos internos com o assunto de cada um — sem que o conteúdo deles
estivesse no prompt. O índice vazou o que indexava. `README.md` não
pertence a nível nenhum: saiu para `DOCS_EXCLUDED`, que não é o que o
exclui (ausência do manifesto já basta) e sim o registro de que a omissão
foi decidida, para o aviso de drift continuar significando "alguém
esqueceu de classificar". Corolário aplicado: **nomear um arquivo de
nível superior já é vazamento**, mesmo sem revelar conteúdo.

*Bloco 1.5 — a garantia virou teste que falha.* `npm run check`
([checkPolicy.ts](backend/src/scripts/checkPolicy.ts)) roda typecheck +
sete invariantes e sai com código 1 na primeira violação. Falham o build:
arquivo sem classificação nem exclusão; entrada de manifesto sem arquivo;
termo da deny-list no prompt público ou de tenant; doc citando nome de
arquivo de nível superior; prompt acima do teto de tamanho; doc
prometendo limite de plano que a tabela `plans` não sustenta; doc dizendo
"ilimitado". Deny-list, tetos e padrões ficam todos em
[docsPolicy.ts](backend/src/services/docsPolicy.ts), um arquivo só. O
teto de tamanho é **orçamento, não limite técnico**: prompt é custo em
toda mensagem e só cresce, então crescer passa a exigir subir o número no
mesmo commit que adiciona o conteúdo. Cada condição foi provada falhando
de verdade — inclusive um bug do próprio verificador que isso revelou (a
seção de planos lia todo arquivo do manifesto sem tratar ausência, e a
exceção abortava a run antes de imprimir a violação).

*Limites de plano:* a fonte única é a **tabela `plans`** (`plans.ts` só
lê dela), e é contra ela que os docs são conferidos — nenhuma segunda
fonte foi criada. Hoje nenhum doc cita limite numérico, então a asserção
protege o que a documentação nova vai escrever.

*Ping de credencial — conserto causal, e o caminho que NÃO funciona:*
subir `maxTokens` (5 → 64 → 256) nunca foi conserto, só tornava o
acidente mais raro. **Desligar o thinking também não é caminho:**
`generationConfig.thinkingConfig.thinkingBudget` é rejeitado com **400
INVALID_ARGUMENT** por este modelo — testado contra a chave real; a
família Gemini 3 trocou `thinkingBudget` por `thinkingLevel`. O conserto
foi responder a pergunta certa: o probe pergunta "a chave é válida?", não
"o modelo produz texto?". Resposta 2xx sem texto virou
`AiEmptyResponseError`, que o probe trata como **sucesso** (chave
inválida, revogada ou sem cota nunca produz 2xx) e a geração continua
tratando como erro. `maxTokens` voltou a 16.

*Typecheck do backend está limpo pela primeira vez.* `sessionStore.get`
passou a usar a assinatura `CallbackSession` do `@fastify/session` —
correção de tipo, sem mudança de runtime, feita porque esse único erro
pré-existente deixava o typecheck vermelho e portanto o gate inútil.
Login, persistência de sessão e isolamento admin↔tenant retestados nas
duas zonas.

*Bloco 1.6 — bateria adversarial no copiloto do tenant, 10/10
bloqueadas.* [tools/probe-copilot-docs.sh](tools/probe-copilot-docs.sh)
classifica cada sonda em **BLOQUEADO / VAZOU / INCONCLUSIVO**. A
distinção que importa: 429, 5xx, timeout e resposta vazia são
**INCONCLUSIVO, nunca "bloqueado"** — um copiloto quebrado produziria uma
bateria inteira de falsos "bloqueado", que é o resultado mais perigoso
possível porque parece aprovação. Daí também os controles positivos no
início (aborta sem gastar sondas) e no fim (marca a run inteira
inconclusiva). Um marcador só conta como vazamento se aparecer na
resposta e **não** na pergunta — senão "não tenho acesso ao setup.md"
contaria como vazamento do termo que a própria sonda plantou. Resultado:
10 sondas (diretas, indiretas, injeção de instrução), **nenhum
vazamento**, os dois controles respondendo. A sonda que antes vazava o
índice de `docs/admin/` agora responde que a documentação não contém essa
pasta.

*Achado do próprio design, confirmado ao vivo:* das três tentativas de
run, duas abortaram por 503 transitório do Google. Nas duas o script
gastou **1 requisição em vez de 12** e não produziu nenhum falso
"bloqueado" — que é exatamente para isso que o controle inicial existe.
`PROBE_ONLY` foi adicionado depois disso, para retomar uma run
interrompida sem repetir sondas já respondidas: numa cota diária apertada,
repetir é o que faz a segunda tentativa não caber.

*Achado grave para a documentação (Bloco 2), não corrigido aqui:* o
copiloto está entregando ao cliente informação **factualmente errada e
desatualizada**, com confiança. Perguntado sobre custo, respondeu que "o
eckko.ai funciona no modelo BYOK, cada empresa conecta suas próprias
chaves e paga direto" e que "cobrança real ainda não foi implementada" —
**as duas coisas são falsas hoje** (o tenant não conecta chave desde o
lockdown, e Stripe + créditos estão implementados e testados). Não é
vazamento; é `docs/faq.md` e `docs/screens/*.md` desatualizados saindo
pela boca do copiloto. Outros pontos desatualizados já mapeados:
`painel.md` e `faq.md` dizendo que billing não existe; `minha-assinatura.md`
dizendo que a troca de plano não envolve cobrança real; `configurar-avatar.md`
descrevendo cenário/traje como toggle exclusivo (a Fase 4 pôs os dois
campos lado a lado); `conteudo.md` citando uma coluna "Provedor" que foi
removida e sem o botão "Baixar" de avatar; `conhecimento-e-midia.md`
afirmando que documentos são vetorizados e usados como contexto de RAG —
o que o Bloco 0 já provou ser falso (embeddings aleatórios, nenhuma
recuperação).

*Inventário do que entra no prompt (só leitura):* apenas **três** fontes,
nas três audiências — o system prompt constante por audiência
(`copilotProvider.ts`), o `docsContent` do nível correspondente, e o
histórico da conversa. O histórico do tenant vem de `copilot_messages`
com a conversa validada por `getOwnedConversation(id, tenantId, userId)`;
o do público vem do próprio cliente e não é persistido. A ajuda por campo
(ícone "i") são strings i18n estáticas. **Não entram no prompt** nome do
tenant, plano, saldo de crédito, avatares, vídeos nem documentos da base
de conhecimento — `tenantId` chega ao `askCopilot` só para gravar uso.

*Achado colateral, não corrigido:* `copilot_provider_error` devolve
`err.message` cru ao cliente, com o corpo de erro do vendor junto — um
visitante anônimo pode ver `Gemini API error (429) ... free_tier ...
quotaValue: 20`, ou seja nome do modelo, tier e cota. **Não vaza chave**
(conferido: `describeNetworkError` usa só `message`/`cause`, nunca a URL,
que no Gemini carrega a chave no query string). Vale sanitizar.

*Achado menor, não corrigido:* o `masked_key` devolvido pela rota admin
mostra os últimos caracteres do **texto cifrado**, não da chave — e
`docs/screens/configuracoes.md` promete "os últimos dígitos da chave
salva". Inofensivo, mas inútil para identificar qual chave está lá.

*Gotcha novo:* `package.json` **não** está no bind mount (só
`./backend/src`), então script npm novo só existe no container depois de
`docker compose build backend`.

---

**O que foi feito (2026-07-31 — Bloco 4: blindagem para a demo):**

*Erro de fornecedor deixou de vazar.* Oito pontos devolviam `err.message`
cru ao cliente — inclusive o copiloto público, onde qualquer visitante
anônimo arrancava a resposta de erro do Google inteira (modelo, tier, valor
da cota). [vendorError.ts](backend/src/services/providers/vendorError.ts)
classifica a falha (`rate_limited`/`unavailable`/`auth`/`unknown`), devolve
frase em pt-BR que não cita fornecedor nenhum — para o cliente, HeyGen e
ElevenLabs são detalhe de implementação nosso — e manda o detalhe cru para
o log do servidor. Isso inclui o `error_message` gravado em `videos`, que é
**exibido na tela** e carregava texto do vendor. 429 vira 429; o resto, 502.
Sete casos reais (copiados das respostas que estes fornecedores deram
durante o desenvolvimento) viraram asserção no `npm run check`, que verifica
as duas metades: que o vazamento sumiu da resposta **e** que o detalhe
continua no log — sanitizar apagando o rastro de diagnóstico trocaria um
problema por outro.

*Dois defeitos de UI achados no caminho, ambos fatais numa demonstração:*
`client.ts` transformava o corpo de erro inteiro em mensagem (a tela
mostrava `502 Bad Gateway: {"error":...}`); e **`ScriptStep` não tinha
`catch` nenhum** — `try/finally` sem `catch` deixava a falha virar promise
rejeitada sem dono, então o botão parava de girar e **nada aparecia**. O
mesmo valia para todos os handlers de `AvatarSetupStep`, incluindo o upload
do vídeo de referência, que é o passo que dispara treino de avatar **e**
clonagem de voz — os dois fornecedores ao mesmo tempo, o ponto mais provável
de falha do fluxo inteiro. Todos ganharam tratamento visível (`guard()` +
`.alert-error`, classe que também não existia).

*Verificado na UI real, com resposta controlada e zero requisição de
fornecedor:* interceptando só `/scripts/generate` no navegador, um 429
sanitizado aparece como caixa vermelha em pt-BR; e um 502 com **corpo HTML
de proxy** (sem JSON) cai no fallback genérico sem vazar `502`, `upstream`
ou tag nenhuma para a tela.

*ElevenLabs sem `user_read`:* confirmado por grep que **nenhum caminho do
produto** lê `user/subscription` — `checkElevenLabsConnection` usa
`/v1/voices`, que a chave acessa. A falta dessa permissão não derruba
geração; só impede saber a cota restante, que fica registrada como
desconhecida no roteiro da demo.

*[tools/smoke-demo.sh](tools/smoke-demo.sh):* 21 verificações numa passada,
sem gastar requisição de fornecedor — containers, landing, os três caminhos
de entrada, credenciais fixas, avatar treinado com voz, saldo de crédito,
credenciais conectadas, e o gotcha do bundle Vite desatualizado (compara o
que está em disco com o que o dev server entrega).

---

**O que foi feito (2026-07-31 — Bloco 2A: afirmações falsas removidas dos
docs):** o copiloto tinha afirmado a um cliente que o produto é BYOK e
que "cobrança real ainda não foi implementada" — declaração comercial
falsa para quem é cobrado via Stripe. Decisão: **apagar antes de
reescrever**, deixando buraco (as lacunas viraram insumo do 2B, listadas
acima).

Cada afirmação foi validada contra o código **antes** de ser apagada, sem
confiar na lista da rodada anterior:

| Afirmação removida | Por que é falsa | Fonte da verdade |
|---|---|---|
| "modelo BYOK", "cada tenant usa e paga sua própria conta", "conecte a chave em Configurações" | O tenant não conecta chave nenhuma | `routes/credentials.ts`: `PUT` e `POST` devolvem `403 managed_by_platform`; única escrita é `PUT /admin/tenants/:id/credentials/:provider` |
| "transformado em embeddings para busca semântica", "usado como contexto (RAG)" | Não há vetorização nem recuperação | `embeddingProvider.ts` devolve `Math.random()`; nenhuma query usa `<=>`; `document_chunks` só recebe `INSERT`, nunca é lido |
| "a troca de plano não envolve cobrança real", "cadastro sem processamento de pagamento", "nenhuma cobrança real acontece ainda" | Stripe está integrado e testado | `routes/stripeWebhook.ts`, `POST /subscription/checkout`, `POST /subscription/credits/checkout`; **`PUT /subscription/plan` não existe mais** |
| "créditos restantes (quando um provedor de cobrança estiver conectado)", "billing real ainda não foi implementado" | O tenant de demo tem saldo real (video 2 / script 10 / avatar 1) | tabela `tenant_credits` |
| "rastreamento de custo por geração é uma funcionalidade futura" | Existe e alimenta o painel admin | `provider_usage` + `provider_cost_rates` |
| aba Avatares mostra coluna "provedor" | Coluna removida em 2026-07-22 | `ContentPage.tsx` não tem mais `colProvider` |
| cenário/traje: 'modo "Prompt de IA"' **ou** 'modo "Enviar imagem"' | Não há modos — os dois campos coexistem lado a lado desde a Fase 4 | `AvatarSetupStep.tsx`: `Field` de texto e `Field` com `input type="file"` irmãos |
| `setup.md`: "pgvector, usada para busca semântica" | pgvector está instalado, mas nada faz busca | idem embeddings |
| `setup.md`: "Login é por `POST /auth/login`" | O frontend usa `POST /login` unificado desde 2026-07-22 | `routes/login.ts` |

*Enforcement para o 2B não reintroduzir:* `docsPolicy.ts` ganhou
`FALSE_CLAIM_TERMS` — 17 afirmações, cada uma com o motivo de ser falsa
gravado ao lado, para quem achar que voltou a ser verdade saber o que
re-checar. **Vale nos três níveis**, diferente da deny-list de segurança
(public+tenant): uma afirmação falsa não fica aceitável porque o leitor é
interno — um operador que age sobre "billing não existe" erra igual a um
cliente. Provado falhando com BYOK, com vetorização/busca semântica e com
negação de cobrança em doc de admin.

*Exceção proposta e aplicada, em vez de decidida no escuro:* **"cobrança
real" sozinho não entra na lista.** `docs/admin/admin-tenants.md` usa a
expressão legitimamente, para avisar o operador a **nunca** tratar o custo
estimado como cobrança real — bani-la quebraria justamente o aviso que
protege uma decisão de negócio. Só as frases que **negam** a existência de
cobrança foram proibidas ("não envolve cobrança real", "cobrança real
ainda não", "sem processamento de pagamento"...). Pelo mesmo critério,
"RAG" solto continua permitido: é o nome da tela no menu lateral; o que
se proíbe é afirmar que algo é vetorizado ou recuperado.

*Efeito no tamanho dos prompts:* public **2.342 → 1.535** (−34%), tenant
**14.184 → 11.554** (−19%), admin **24.365 → 21.509** (−12%). O prompt
público perdeu um terço só removendo o que era falso.

*Erro de processo registrado:* usei `git checkout <arquivo>` para desfazer
os arquivos de teste da deny-list e isso **descartou também as edições do
próprio bloco**, que ainda não estavam commitadas — precisou reaplicar
duas. Para testar invariante que depende de editar arquivo já modificado,
copiar para fora e restaurar da cópia; `git checkout` só é seguro sobre
arquivo limpo.

---

**O que foi feito (2026-07-30, rodada de fechamento pré-demo):**

*Credenciais fixas de dev* — ver o bloco "Credenciais fixas de
desenvolvimento" logo abaixo. Substituíram a rotação manual feita mais cedo
no mesmo dia; as senhas antigas (inclusive as expostas em chat) estão
inválidas, confirmado por `bcrypt.compare`.

*Desduplicação de e-mail (dados, nenhum schema mudado).* 8 tenants tinham
e-mail repetido entre si, o que tornava ambíguo o lookup sem escopo do
`POST /login` no domínio raiz. Renomeados com plus-addressing que preserva
entregabilidade (`manfredhaut+manfredhaut-3@gmail.com`), numa transação
única, `UPDATE` por `tenant_id` com abort se alguma linha ≠ 1. **Nenhum
tenant apagado**: `credit_ledger.tenant_id` é `ON DELETE CASCADE`, então
excluir tenant destruiria ledger. Rastro em `audit_log`
(`system.tenant_email_deduplicated`, slug + e-mail antigo + novo →
reversível por leitura). Resultado: 17 usuários / 17 e-mails distintos.
`users` já tinha `UNIQUE (tenant_id, email)`; um índice **global** foi
avaliado e **descartado** (quebraria a mesma pessoa dona de vários tenants
e o `/auth/signup` de e-mail repetido) — o conserto certo é de resolução,
não de schema, e é o que a landing passou a fazer.

*Landing como porta única de acesso (Fase A aprovada → Fase B entregue).*
"Já tenho conta" agora **navega de verdade** para
`dev-c77a5b.<BASE_DOMAIN>/login` em vez de postar do domínio raiz — a
autenticação acontece no subdomínio, onde `resolveTenantFromHost` escopa a
busca. Novo [AdminLoginModal.tsx](frontend/src/pages/Landing/AdminLoginModal.tsx):
formulário próprio no rodapé, postando em `POST /admin/login` (que já
existia, só-admin, rate limiter próprio) — **admin e tenant não
compartilham formulário nem endpoint**. Depois do sucesso usa
`window.location.assign('/admin')` (navegação real), o que contorna o bug
do `AdminAuthProvider` sem tocar nele. Testado digitando no navegador:
login pelo modal → painel, 2 telas + reload real, login de tenant pelo
caminho novo, e **as duas zonas coexistindo em abas paralelas**
(`admin/me` 200 **e** `auth/me` 200 ao mesmo tempo). Ressalva: `Sair` em
qualquer zona chama `session.destroy()` e derruba as duas.

*Teste das 3 chaves de provedor pelo botão "Testar conexão"* (tenant
`dev-c77a5b`): **HeyGen OK, ElevenLabs OK, Gemini falha**. A falha é
**falso negativo**, não chave ruim: o Google devolve HTTP 200, mas o ping
usava `maxTokens: 5` e modelos com *thinking* gastam o orçamento inteiro
na fase de raciocínio, voltando sem parte de texto — o que o
`providerRegistry` (corretamente) trata como erro. Subido para 64 e
**ainda insuficiente**: 4 sondagens com a chave real deram
`finishReason: MAX_TOKENS` nas 4, com `thoughtsTokenCount` de 59–61 de 64
— 2 devolveram texto, 2 não. Ou seja, hoje o teste é cara-ou-coroa. **Não
corrigido além disso, a pedido**; a correção pendente é subir o teto bem
acima do piso de ~60 tokens (256 dá folga). Descartada de propósito a
alternativa de aceitar HTTP 200 como sucesso — deixaria chave revogada
passar.

*Cosméticos aplicados (só os de risco baixo e alta visibilidade):* os 3
planos prometiam além do limite real (Free dizia 5 vídeos com limite 2;
Pro 30 com 20; Business 100 com 50; Pro/Business ainda diziam "Avatares
ilimitados" com limite 5 e 20) — corrigidos pelo `PUT /admin/plans/:id`,
sem deploy. `WHATSAPP_NUMBER` esvaziada (era o placeholder
`5511999999999`, um link real para número inexistente) — o botão some
sozinho. FAQ da landing não manda mais conectar chave própria "em
Configurações" (contradizia a migração para credencial da plataforma).
Dados de teste do tenant de demo removidos (5 avatares e 4 vídeos,
incluindo um cujo roteiro dizia "Meet TWINAI"), preservando "Mário" e os 2
vídeos reais; conferido antes que **zero** linhas de `credit_ledger`,
`provider_usage` ou `avatar_trainings` apontavam para eles, e o ledger
segue com as mesmas 48 linhas.

*Deixados de propósito para depois (diagnosticados, não corrigidos):*
"6/2 vídeos este mês" na Minha Assinatura (contador por plano vs. saldo de
crédito, que se contradizem na tela); moeda inconsistente (landing em
`R$`, app em `$`); "CRÉDITOS RESTANTES —" no painel do tenant embora
`tenant_credits` tenha saldo real; frase órfã sobre fundo virtual no passo
1 do wizard; truncagem sem reticências na biblioteca; header quebrando
abaixo de ~500px.

*Gotchas de ambiente descobertos nesta rodada:* (1) `docker compose
restart` **não** recarrega variável de ambiente — para `.env` novo tem que
ser `docker compose up -d <serviço>`, que recria o container; (2) o
Browser pane erra o mapeamento de clique quando o viewport é forçado por
`resize_window` com largura fixa (janela real 1474×864 vs. viewport
emulado) — no tamanho nativo, clicar nas coordenadas lidas direto do
screenshot funciona; digitação e Tab funcionam sempre, mas Enter/Espaço
não ativam botão.

*Ponto de retorno:* commits `6f2c978` (aba APIs + teste de credencial),
`850666f` (CLAUDE.md) e `d24cdda` (tudo desta rodada), mais um `pg_dump`
completo em `AVATAR VIDEO MÓDULO/_backups/` — **fora** da árvore do git.

---

**O que foi feito (2026-07-30 — rotação de credenciais + preparação da
demo):**

*Rotação de senhas (admin da plataforma + tenant de demo).* As senhas de
`admin@eckkoai.com` e de `demo@eckko.ai` (tenant `dev-c77a5b`) tinham sido
digitadas em texto puro numa conversa de chat e foram trocadas por
credenciais novas, válidas só a partir desta data. **As senhas em si não
ficam registradas aqui nem em nenhum arquivo do repo, por desenho** — se
elas se perderem, o caminho é rotacionar de novo, não recuperá-las. As
antigas foram confirmadas inválidas por `bcrypt.compare` contra os hashes
gravados (não só "a nova funciona"), e os dois logins foram retestados
digitando de verdade no navegador, com sessão confirmada em 2+ páginas de
cada zona.

*Como rotacionar uma senha neste projeto (não existe endpoint pra isso).*
Nem `adminAuth.ts` nem `auth.ts`/`login.ts` expõem troca de senha — só
verificação no login. Então a rotação é, obrigatoriamente:
1. `UPDATE` direto em `admin_users.password_hash` (admin) ou
   `users.password_hash` (tenant, escopado por `tenant_id`), com o hash
   gerado por `bcryptjs` (`SALT_ROUNDS = 10`, ver
   [services/passwords.ts](backend/src/services/passwords.ts)) **dentro do
   container do backend** — a senha viaja por variável de ambiente
   (`docker compose exec -e NEW_PW=... backend node -e ...`) e o valor
   entra no SQL por parâmetro `$1`, nunca interpolado na linha de comando
   (evita o problema de escaping de shell/autofill já enfrentado antes).
2. **`INSERT` manual no `audit_log`** — como não passa por nenhuma rota, o
   evento não é registrado sozinho. Convenção de
   [auditLog.ts](backend/src/services/auditLog.ts): ator nulo exige prefixo
   de sistema, então a ação usada foi `system.admin_password_rotated`, com
   `after` contendo só metadado (`adminUserId`, `adminEmail`, `method`,
   `reason`) — **nunca a senha nem o hash**.

*Credenciais fixas de desenvolvimento (não invente senha nova a cada
sessão).* Existem duas contas de dev com senha fixa — o admin da plataforma
e o usuário do tenant de demo `dev-c77a5b`. **Os valores em claro NÃO ficam
neste arquivo nem em nenhum arquivo versionado**: estão em
`DEV-ACCESS.local.md`, na raiz do repo, ignorado pelo git. Para restaurar o
acesso (ou recriar as contas do zero num banco limpo):

```bash
docker compose exec backend npm run dev:seed-access
```

O script ([backend/scripts/seedDevAccess.ts](backend/scripts/seedDevAccess.ts))
é idempotente (`INSERT ... ON CONFLICT DO UPDATE`), recebe as senhas por
variável de ambiente com os valores padrão embutidos, passa tudo ao Postgres
por parâmetro `$1/$2/$3`, e **aborta** se `NODE_ENV=production` ou se o host
do `DATABASE_URL` não estiver na lista de hosts locais. Cada execução grava
`system.dev_access_seeded` no `audit_log`, sem senha nem hash. Duas
pegadinhas registradas de propósito: ele vive **fora** de `backend/src`
(logo, fora do bind mount e fora do `tsconfig`) — editá-lo exige
`docker compose build backend`; e o arquivo de credenciais fica na **raiz**,
nunca em `docs/`, porque `services/docs.ts` varre `docs/**/*.md` inteiro
para dentro do system prompt do copiloto do tenant e do copiloto público.

*Bug conhecido — `/admin` acessado direto entra em loop.* Abrir
`/admin` pela barra de endereço não estabiliza a sessão: o
`AdminAuthProvider` não revalida a sessão depois do `POST` de login, então
a tela volta pro formulário mesmo com sessão válida no servidor — e cada
volta consome uma das 5 tentativas/15min do rate limiter de `POST /login`,
o que rapidamente leva a `429` e faz o sintoma parecer "senha errada".
**Workaround em uso (vale pra demo):** entrar por `/login` no domínio raiz
(`twinai.localhost:8090/login`) e deixar o redirect levar ao painel — esse
caminho funciona de ponta a ponta, testado. **Correção real (revalidar a
sessão no provider) continua pendente** e foi deliberadamente deixada fora
do escopo desta rodada.

*Ponto de retorno criado antes da rodada de fechamento:* commit `6f2c978`
em `master` (aba "APIs" do admin + `POST
/admin/tenants/:id/credentials/:provider/test`, Tarefas 1 e 2 já
verificadas) e um `pg_dump` completo do banco guardado **fora do
repositório**, em `AVATAR VIDEO MÓDULO/_backups/` (irmão de `TWINAI/`, não
versionado por estar fora da árvore do git) — tirado antes de qualquer
alteração de dados.

---

**Atualização anterior:** 2026-07-22 — continuação (download de vídeo
corrigido + download de avatar implementado, ambos testados com clique
real no navegador; achado paralelo do tenant "Dev" com HeyGen real
investigado — origem exata ainda indeterminada, ver Seção 3)

**CHECKPOINT — leia isto primeiro.** Esta sessão foi longa (billing/créditos
completo, Fase 4 do Stripe, login unificado, rebrand). As entradas
detalhadas abaixo continuam no arquivo como histórico técnico completo de
cada rodada, mas este bloco é o resumo consolidado do estado real ao fim da
sessão — comece por aqui antes de mergulhar no restante.

**Concluído nesta sessão:**
- **Download de vídeo corrigido + download de avatar implementado** — os
  dois achados da verificação anterior (ver entrada logo abaixo) agora têm
  correção de código, testada com clique real no navegador (não só curl).
  Novo `GET /videos/:id/download` e `GET /avatars/:id/reference-video/download`
  (backend faz o fetch/leitura e repassa com `Content-Disposition:
  attachment`, tenant-scoped, 404 testado pra tenant errado). Achado e
  corrigido no processo: um bug real de `ERR_HTTP_HEADERS_SENT` (faltava
  `return reply` depois de `reply.send()` manual — Fastify tentava mandar a
  resposta de novo). Achado paralelo do tenant "Dev" com credenciais HeyGen
  reais investigado a fundo — timeline reconstruída via timestamps do
  Postgres, mas 2026-07-17 (quando os vídeos reais foram gerados) não tem
  nenhuma entrada neste arquivo; origem exata (sessão de Claude Code perdida
  vs. teste manual do usuário) permanece sem resposta definitiva — ver
  entrada própria e a correção na Seção 3
- **Verificação real (não relato) de dois itens a pedido do usuário**: (1)
  compra avulsa de créditos — reconfirmada de ponta a ponta com Stripe CLI
  real, incluindo sweep mensal logo depois (sem duplicar/zerar) e cartão
  recusado (sem creditar); (2) download de avatares/vídeos — **dois achados
  reais**: não existe botão de download pra avatar em lugar nenhum do
  código (só "Retreinar"), e o botão "Baixar" de vídeo não força o
  salvamento em disco pra URLs de vídeo reais (HeyGen/D-ID, sempre
  cross-origin) — o atributo HTML `download` é ignorado pelo navegador
  nesse caso, o clique só navega pra URL do vídeo. Ver entrada própria logo
  abaixo para o detalhe técnico completo
- **Admin copilot recuperado, aplicado e testado** — achado igual em espírito
  ao gap do `/uploads/*` (2026-07-18) e dos providers avatar/voz
  (2026-07-21): migration `031_admin_copilot.sql`,
  `routes/adminCopilot.ts`, `AdminCopilotContext.tsx` e o widget no header
  do painel já existiam completos no código, mas **zero menção neste
  arquivo** e a migration nunca tinha rodado no banco local (container de
  3h+ de idade). Aplicada via restart do backend, testada ponta a ponta
  (curl + navegador) e corrigido um bug real de UX encontrado no processo —
  ver entrada própria logo abaixo para o detalhe completo
- **Sistema de crédito completo**: schema (`tenant_credits`/`credit_ledger`),
  débito atômico (`SELECT ... FOR UPDATE` + transação,
  [creditGate.ts](backend/src/services/billing/creditGate.ts)), gate ligado
  nas 3 rotas de geração (vídeo/roteiro/avatar), seed das 3 linhas de saldo
  dentro da própria transação de `/auth/signup` (tudo ou nada — testado com
  rollback forçado), job de concessão mensal
  ([monthlyGrant.ts](backend/src/services/billing/monthlyGrant.ts), reset
  "use ou perca", idempotente por tenant+tipo+mês), e top-up imediato de
  crédito quando o tenant troca de plano via Stripe (sem esperar o próximo
  sweep de 24h)
- **Fase 4 (Stripe)**: assinatura mensal testada ponta a ponta com Stripe
  CLI real (`stripe listen`, checkout com cartão de teste, webhook
  processado, cancelamento) — confirmado no Postgres, não só no redirect.
  Falta só a compra avulsa de créditos (`reason='purchase'`), deixada de
  propósito por último (ver pendências abaixo)
- **Login unificado**: `POST /login` novo, host-aware de verdade no
  servidor (admin nunca autentica fora do domínio raiz — testado
  explicitamente postando credencial de admin válida contra um subdomínio
  de tenant real e confirmando `401`). Admin real `admin@eckkoai.com`
  criado (senha mostrada uma única vez no chat, nunca persistida em
  arquivo). `AdminLoginPage.tsx` removido — `/admin/login` agora renderiza
  o mesmo formulário único
- **Rebrand**: logomarca real (não mais texto em fonte) aplicada no
  header/footer da landing e no header do signup, mesmo padrão já usado na
  sidebar do tenant. Todas as 9 menções a "TWINAI" que restavam nos locales
  (não só a citada no pedido) corrigidas pra "eckko.ai" nos dois idiomas.
  Tema claro implementado como padrão pra quem nunca escolheu
  explicitamente (antes seguia a preferência do SO) — toggle de 3 opções
  intacto, escolha explícita continua persistindo
- **Fundo virtual**: nova tentativa de validação visual — bloqueio de
  câmera no Browser pane confirmado de forma definitiva e explícita
  (`NotAllowedError`, nota de sistema da própria ferramenta), `Claude in
  Chrome` checado e não conectado nesta sessão. Validação visual real com
  pessoa de verdade continua pendente — só o usuário consegue fazer isso
  fora deste ambiente

**Pendências reais restantes (nesta ordem, não por prioridade):**
1. **Validação manual do fundo virtual com câmera real** — ação exclusiva
   do usuário, ambiente de automação não tem acesso à câmera
1a. ~~**Download de vídeo não funciona pra URLs cross-origin**~~ —
    **corrigido em 2026-07-22 (sessão seguinte).** Novo
    `GET /videos/:id/download`
    ([routes/videos.ts](backend/src/routes/videos.ts)) faz o fetch do
    `output_url` no servidor e repassa com `Content-Disposition:
    attachment`; `ContentPage.tsx`/`GenerateStep.tsx` linkam pra essa rota
    em vez do `output_url` cru. Testado com clique real no navegador: aba
    não navega mais pra fora (antes virava `files2.heygen.ai`), arquivo
    íntegro (ffprobe: H.264 720p + AAC, byte-a-byte igual ao original).
    Isolamento por tenant confirmado (404 pra vídeo de outro tenant)
1b. ~~**Não existe download de avatar**~~ — **implementado em 2026-07-22.**
    Decisão tomada: baixa o vídeo/áudio de referência usado no treino
    (`reference_video_url`) — único asset de avatar com formato "arquivo
    único" comparável a `output_url` de vídeo. Fotos (`photo_urls`, 3
    imagens) e "preview do provider" (não existe no nosso schema —
    `trainAvatar()` só retorna `providerAvatarId`, nenhuma URL de preview)
    ficaram fora desta rodada. Novo
    `GET /avatars/:id/reference-video/download`
    ([routes/avatars.ts](backend/src/routes/avatars.ts)), botão "Baixar"
    novo na aba Avatares (condicionado a `reference_video_url` existir).
    Mesmo teste de clique real + isolamento por tenant
2. ~~**Compra avulsa de créditos** (`reason='purchase'`, Stripe) — deixada de
   propósito por último; nenhuma rota criada ainda~~ — **concluída em
   2026-07-22, ver entrada "reconciliação + Fase 5: compra avulsa de
   créditos" logo abaixo.** `POST /subscription/credits/checkout` (mode:
   `payment`) + branch do webhook por `metadata.type === 'credit_purchase'`
   implementados e testados ponta a ponta com Stripe CLI real, incluindo
   idempotência contra redelivery do mesmo evento. Fase 5 do plano de
   billing (ver seção 6) está fechada.
3. **Tagline encontrado em `ECKKOAI IMAGEM 1.png`** ("Sua imagem, sua voz,
   seu conteúdo, sem limites.") — nunca incorporado em lugar nenhum do
   código; decisão de produto pendente do usuário sobre se/onde usar (ex.:
   subtítulo do hero)
4. ~~**Não testado explicitamente**: se o login de um tenant feito pela
   landing (domínio raiz, via o novo `/login` unificado) redireciona de
   volta pro subdomínio correto daquele tenant, ou se permanece no domínio
   raiz depois de autenticar.~~ — **testado e corrigido em 2026-07-22.**
   Comportamento real encontrado: autenticava de verdade (sessão válida,
   cookie `Domain=.twinai.localhost` funcionando), mas a tela ficava no
   domínio raiz mostrando a **landing pública** (com botões "Entrar"/
   "Começar grátis", como se estivesse deslogado) — `LoginPage.tsx` fazia
   só um `navigate("/")` client-side, que não cruza subdomínio. Corrigido:
   `POST /login` agora devolve `tenant.slug`; `LoginPage.tsx` compara
   `window.location.hostname` com `${slug}.${BASE_DOMAIN}` — se já estiver
   no subdomínio certo, `navigate()` client-side como antes; senão,
   `window.location.href` (navegação real de browser) pro subdomínio
   correto. Testado com tenant real nos dois cenários: login pela raiz →
   termina direto no Dashboard do subdomínio certo (confirmado por
   screenshot); login já no subdomínio certo → confirmado via sentinela em
   `window` que continua sendo client-side (sem reload), sem regressão.
   Cabeçalho da landing detectar sessão ativa fica como nice-to-have
   separado, fora de escopo desta correção.

---

**O que foi feito (2026-07-22, continuação — download de vídeo/avatar
corrigido + investigação do achado paralelo do tenant "Dev"):** implementação
em cima da verificação da sessão anterior (ver entrada logo abaixo), que
tinha encontrado o bug de download e pedido só verificação, sem corrigir.

**Correção 1 — download de vídeo.** Novo
[services/downloadProxy.ts](backend/src/services/downloadProxy.ts)
(`proxyRemoteAttachment()` — faz `fetch()` da URL do vendor no servidor e
usa `Readable.fromWeb()` pra repassar o stream direto pro cliente, sem
bufferizar o arquivo inteiro na memória; `sendAttachment()`/
`contentTypeForExtension()` — mapa pequeno de extensão→content-type,
`application/octet-stream` como fallback, sem adicionar dependência nova
tipo `mime`). Novo `GET /videos/:id/download`
([routes/videos.ts](backend/src/routes/videos.ts)), tenant-scoped igual ao
`GET /videos/:id` já existente. `ContentPage.tsx` e `GenerateStep.tsx`
(o link de download que aparece assim que o vídeo fica pronto, dentro do
wizard de Criar Vídeo — mesmo bug, achado de passagem e corrigido junto,
não só o pedido literal da tela de Conteúdo) trocaram o `href` de
`v.output_url` pra `/api/videos/${v.id}/download`. O `<video src=...>` de
preview em `GenerateStep.tsx` **não foi tocado** — continua apontando pro
`output_url` cru, decisão deliberada: reproduzir não precisa ser
same-origin, só baixar precisava

**Correção 2 — download de avatar.** Decisão sobre "o que baixar" (pedida
explicitamente pelo usuário pra avaliar): o vídeo/áudio de referência
usado no treino (`avatar.reference_video_url`) — é o único asset de avatar
com formato de arquivo único, comparável ao `output_url` de vídeo. Fotos
(`photo_urls`, array de 3 imagens) ficaram de fora desta rodada — não têm
uma ação de "baixar" única (seriam 3 links separados, ou um zip, mudança
de escopo maior) e já são same-origin (`/uploads/...`), então nem sofriam
do bug original. "Preview gerado pelo provider" também ficou de fora —
**não existe no schema**: `trainAvatar()`
([avatarProvider.ts](backend/src/services/providers/avatarProvider.ts))
só devolve `providerAvatarId`, nenhum provider (HeyGen/D-ID) tem uma URL de
preview sendo buscada/guardada em lugar nenhum do código hoje — oferecer
isso exigiria uma chamada nova à API do vendor (ex.: "get avatar details"
da HeyGen), fora do escopo pedido. Novo
`GET /avatars/:id/reference-video/download`
([routes/avatars.ts](backend/src/routes/avatars.ts)), reaproveita
`readUpload()` (já usado por `avatarProvider.ts` pra reler o arquivo
salvo), 404 se o avatar não existir pro tenant ou não tiver
`reference_video_url` (avatar ainda não treinado). Botão "Baixar" novo na
aba Avatares de `ContentPage.tsx`, condicionado à mesma checagem

**Bug real encontrado e corrigido no meio da implementação:** primeira
versão das duas rotas devolvia `500 ERR_HTTP_HEADERS_SENT` — confirmado
direto no log do backend depois do primeiro clique real no navegador (não
peguei isso no curl porque testei via `curl -sD -` antes de escrever o
`try/catch`... na real, o erro só apareceu no teste de clique porque foi
o primeiro teste rodado depois da mudança; corrigido antes de qualquer
teste de curl "limpo" ser reportado abaixo). Causa: `sendAttachment()`
chama `reply.send()` mas a rota não fazia `return reply` depois — sem
isso, o Fastify (especificamente o hook `onSend` do `@fastify/session`,
que roda em toda resposta pra persistir a sessão) tentava processar de
novo depois que os headers já tinham sido flushados. Corrigido adicionando
`return reply;` logo depois de `sendAttachment()`/`proxyRemoteAttachment()`
nas duas rotas — é o fix padrão documentado pelo próprio Fastify quando
`reply.send()` é chamado manualmente dentro de um handler async.

**Testado de verdade, curl primeiro (integridade), depois clique real no
navegador (comportamento):**
- Tenant descartável (`downloadtest2`) com um avatar (`reference_video_url`
  apontando pra uma cópia real do mesmo arquivo HeyGen já usado na
  verificação anterior, ainda válido, salvo fisicamente em
  `uploads/<tenant_id>/` via bind mount) e um vídeo (`output_url` = mesma
  URL HeyGen real e ainda viva)
- `curl -sD -` nas duas rotas → `200`, `Content-Disposition: attachment;
  filename="..."`, `Content-Length: 2666520` batendo exato, arquivo baixado
  reaberto com `ffprobe` → H.264 1280×720 + AAC, 11.72s, sem diferença do
  original
- **Clique real no navegador** (não só o link renderizando — o clique de
  fato, via `computer` tool) nos dois botões: `tabs_context` confirmou que
  a aba **ficou no domínio do app** nos dois casos (antes do fix, pro
  vídeo, o teste da sessão anterior tinha confirmado que a aba navegava pra
  `files2.heygen.ai` — esse é exatamente o comportamento que não se repete
  mais); log do backend confirmou os dois `GET .../download` retornando
  `200` na hora exata do clique
- **Isolamento testado de novo, agora nas rotas novas**: tenant descartável
  separado (`isotest3`) tentando baixar o avatar/vídeo do primeiro tenant
  via API → `404` nos dois, confirmado por curl
- Tenants de teste, linha de upload física e todos os dados relacionados
  limpos depois (`uploads/<tenant_id>/` removido do disco também, não só o
  banco)
- Typecheck backend (só o erro pré-existente do `PgSessionStore`) e build
  frontend limpos

**Investigação do achado paralelo — tenant "Dev" com HeyGen real.**
Reconstruída a timeline via timestamps do Postgres, sem mexer em nenhum
dado do tenant:
- Tenant criado 2026-07-16 07h52 UTC
- `avatar_trainings` está **vazio** pra esse tenant (a tabela só passou a
  ser preenchida a partir da migration `027`/refactor de créditos, sessão
  de 2026-07-22 — ou seja, o treino desse avatar aconteceu antes dessa
  tabela existir como conceito, consistente com a data abaixo)
- As 3 credenciais reais (avatar=heygen, voice=elevenlabs, script=gemini)
  foram conectadas entre 2026-07-17 05h34 e 05h45 UTC
  (`api_credentials.updated_at`)
- 3 vídeos com `provider_job_id`/`provider_vendor` reais do HeyGen, gerados
  entre 2026-07-17 08h52 e 10h26 UTC — mais de 2h depois das credenciais,
  consistente com um treino de avatar real (que precisa da foto+vídeo de
  referência) tendo acontecido no meio
- `audit_log` está **vazio** pra esse tenant — mas isso não prova nada
  sozinho: a tabela `audit_log` (migration `019`) só foi criada durante a
  Fase B do rebrand, 2026-07-21/22, **depois** de 2026-07-17. Ou seja, um
  evento de 07-17 nunca poderia ter gerado uma linha de audit_log de
  qualquer forma — não é evidência de que não passou pelo admin
- **Achado central: 2026-07-17 não tem nenhuma entrada de sessão neste
  arquivo.** O histórico da Seção 7/8 pula direto de entradas datadas
  2026-07-16 pra 2026-07-18 (`/graphify`). Isso bate com o padrão já
  catalogado 3x nesta mesma sessão de código avançando sem o arquivo
  acompanhar — mas essa é a primeira vez que o gap coincide com uma
  integração de provedor real bem-sucedida, não só uma rota/feature interna
- **Não determinado com certeza**: se isso foi (a) uma sessão de Claude
  Code que rodou em 2026-07-17 e nunca atualizou este arquivo ao final
  (mesma falha já visto 3x), ou (b) o usuário testando manualmente fora de
  uma sessão de Claude Code (upload de um vídeo de arquivo já existente, não
  captura de câmera ao vivo — o que explicaria como driblou o bloqueio de
  câmera do Browser pane documentado em toda sessão anterior). As duas
  teorias são consistentes com os dados; nenhuma prova definitiva encontrada
  no Postgres/filesystem que decida entre elas
- Corrigidas as ~5 afirmações "nenhuma chave real testada com sucesso"
  espalhadas pela Seção 3, 6/7 e histórico que este achado contradiz — ver
  Seção 3 pra correção principal, demais marcadas inline com `~~riscado~~ +
  correção`
- **Nenhum dado do tenant "Dev" foi tocado** — investigação 100%
  somente-leitura, como pedido explicitamente

**Adendo pequeno, mesma sessão — coluna "Provedor" removida da aba
Avatares:** usuário viu o avatar de teste desta sessão renderizado no
Browser pane compartilhado (screenshot mostrando "Avatar Teste Download" /
"heygen" na coluna Provedor) e pediu pra ocultar a coluna. Removida de
`ContentPage.tsx` (`<th>`/`<td>` de `content.colProvider`) e a chave
`colProvider` órfã do namespace `content` nos dois locales (as outras 2
ocorrências de `colProvider`, em `adminPanel.costRates`/`adminPanel.usage`,
são de telas diferentes do admin — não tocadas). Verificado visualmente com
um tenant descartável novo (o avatar da screenshot original já tinha sido
limpo do banco antes deste pedido chegar): tabela agora mostra só
Nome/Voz/Criado em antes das ações. Build frontend limpo, tenant de teste
removido depois.

---

**O que foi feito (2026-07-22, continuação — verificação real de dois itens
a pedido explícito do usuário: "quero verificação real, não relato"):** o
usuário recusou aceitar os relatos anteriores de "compra avulsa de
créditos" e "download de avatares/vídeos" como fechados e pediu pra
refazer as checagens de verdade, com comando + saída, no mesmo padrão do
resto do projeto. Refeito do zero, sem reaproveitar nenhuma conclusão
anterior:

**ITEM 1 — Compra avulsa de créditos: RECONFIRMADA, sem achados novos.**
- Tenant descartável via `/auth/signup`
  (`credittest_tenant@example.com`/`884f7299-...`), saldo baseline
  confirmado zerado nos 3 tipos
- `POST /subscription/credits/checkout {creditType: "script"}` via curl
  real → `checkoutUrl` real do Stripe (`cs_test_a116...`)
- Em vez de `stripe trigger` (evento sintético), o fluxo **completo** foi
  rodado: `stripe listen --forward-to` real (PID confirmado vivo depois de
  iniciado) + checkout de verdade no navegador com `4242 4242 4242 4242` —
  mais rigoroso que o pedido original, não uma substituição fraca
- Confirmado no Postgres (não no redirect): `tenant_credits.balance` script
  0→10, `credit_ledger` com `reason='purchase'`,
  `stripe_payment_intent_id='pi_3TvzuOEMgbmOhGz61D8vNILi'` real,
  `price_cents=1990` batendo com o pacote script (R$19,90)
- `POST /admin/credits/run-monthly-grant` disparado logo em seguida →
  `{granted: 2, skipped: 49, failed: 0}` — os 2 são video/avatar (ainda
  zerados); script **não foi tocado** (`updated_at` idêntico ao da compra),
  porque a trava de delta não-positivo viu saldo comprado (10) já >= limite
  mensal do free (10) e pulou. Confirmado no Postgres, sem duplicar nem
  zerar a compra
- Webhook duplicado testado com o mesmo método já documentado nesta sessão
  (evento real via `stripe events list`/`retrieve`, assinatura HMAC-SHA256
  calculada na hora com o `STRIPE_WEBHOOK_SECRET` real) — reenviado 2x
  (sem querer, por rodar o curl duas vezes), ambas retornaram `200` mas
  `audit_log` mostra `alreadyGranted: true` nas duas réplicas, saldo nunca
  saiu de 10, `credit_ledger` nunca passou de 1 linha pro tipo script
- Cartão recusado testado de verdade: 2º checkout (`creditType: "avatar"`),
  cartão de teste de recusa genérica `4000 0000 0000 0002` → a própria tela
  do Stripe mostrou "Seu cartão de crédito foi recusado", sessão nunca
  completou → confirmado no Postgres que `avatar` continuou em 1 (só o
  grant do sweep) e `credit_ledger` continuou com as mesmas 3 linhas, zero
  crédito concedido
- Tenant e admin de teste limpos depois (admin preso pela mesma FK de
  `audit_log` já documentada — mantido, inofensivo)

**ITEM 2 — Download de avatares/vídeos: DOIS ACHADOS REAIS, item não estava
de fato fechado.**
- **Achado 1 — não existe download de avatar.** Lido
  [ContentPage.tsx](frontend/src/pages/Content/ContentPage.tsx) linha a
  linha: a aba Avatares só tem coluna de ação "Retreinar", nenhum link de
  download. O botão "Baixar" só existe na aba de vídeos. O ponto 1 do
  pedido ("clicar no botão Baixar... de um avatar") não é testável porque
  a feature não existe — não é uma falha de teste, é ausência de feature
- **Achado 2 — o botão "Baixar" de vídeo não força download pra URLs
  reais.** `output_url` nunca passa pelo nosso backend — é a URL crua que o
  vendor (HeyGen/D-ID) devolve em `pollVideoJob()`
  ([routes/videos.ts:30-33](backend/src/routes/videos.ts)), sempre
  cross-origin em relação ao app. Achada por acidente uma prova real disso
  no próprio banco (tenant "Dev"/`dev-c77a5b`, avatar "Mário" treinado com
  HeyGen de verdade — ver nota de achado paralelo abaixo): uma URL
  `files2.heygen.ai` real, assinada, ainda válida (`Expires` bate com
  2026-07-24). Testado com tenant descartável (linha de vídeo inserida
  apontando pra essa mesma URL real, ainda viva): `<a href=... download>`
  ([ContentPage.tsx:104](frontend/src/pages/Content/ContentPage.tsx))
  clicado de verdade no navegador → `read_network_requests` confirmou GET
  real (`200`, depois `206`) na URL do HeyGen, mas a aba do app **navegou
  pra fora** (origin virou `files2.heygen.ai`) em vez de disparar
  "Salvar como" — o atributo HTML `download` só é honrado pelo navegador
  pra recursos **same-origin**; pra origem cruzada (o caso real de todo
  vídeo gerado por HeyGen/D-ID) ele é ignorado silenciosamente e o link se
  comporta como navegação normal. Confirmado com `tabs_context` (1 tab só,
  origin trocado, nenhuma nova aba). Fora do próprio arquivo baixado
  manualmente via curl pra prova de integridade (abaixo), o botão em si,
  como implementado, **não confiável pra baixar o arquivo pro disco** no
  caso real
- **Prova de integridade do arquivo em si (não é sobre o botão, é sobre o
  conteúdo)**: a mesma URL HeyGen baixada via curl → MP4 válido, 2.666.520
  bytes batendo exato com `Content-Length`, `ffprobe` confirmou H.264
  1280x720 + AAC, 11.72s — sem qualquer sinal de transcodificação nossa
  (checado também que `backend/package.json` não tem `ffmpeg`/`sharp`/
  nenhuma lib de mídia, e `saveUpload()`/`storage.ts` grava bytes crus sem
  validação nenhuma de formato)
- **Ponto 2 do pedido (reenviar o arquivo baixado como referência) —
  premissa não corresponde ao código**: `ChooseAssetsStep` usa
  `accept="image/*"` — aceita só imagem, é o fluxo de referência de
  cenário/traje, não vídeo. O único endpoint que aceita vídeo de verdade é
  `POST /avatars/:id/reference-video`, e ele exige uma credencial real de
  avatar (HeyGen/D-ID) conectada **antes** de sequer salvar o arquivo em
  disco ([routes/avatars.ts:121-127](backend/src/routes/avatars.ts)) — sem
  uma chave real (mesma limitação de toda a história deste projeto, nunca
  testada com sucesso), não dá pra testar esse reenvio de ponta a ponta.
  Não fingido como testado
- **Ponto 3 do pedido (signed URL, expiração, isolamento) — premissa
  parcialmente equivocada, testado o que existe de verdade**: não existe
  nenhum mecanismo de signed URL no nosso backend (`grep` por
  `signed`/`presign`/`download` em `backend/src` não achou nada relevante;
  toda a "assinatura" que existe na URL é do HeyGen/AWS CloudFront, fora do
  nosso controle). O que **de fato** existe e foi testado de verdade:
  `GET /videos/:id` é escoped por `tenant_id`
  ([routes/videos.ts:84-91](backend/src/routes/videos.ts)) — tenant
  descartável tentando buscar o ID de um vídeo real do tenant "Dev" via API
  → `404`, confirmado por curl. Ou seja, isolamento existe na nossa camada
  (não dá pra descobrir a URL de outro tenant pelo nosso endpoint), mas uma
  vez que o dono legítimo tem a URL, a expiração e qualquer controle de
  acesso adicional são inteiramente do HeyGen, não nossos
- **Achado paralelo, não pedido, registrado por transparência**: o tenant
  "Dev" (`dev-c77a5b`) tem um avatar real treinado no HeyGen
  (`provider_avatar_id` preenchido) e pelo menos 3 vídeos com `output_url`
  real do HeyGen ainda vivo — isso **contradiz** a afirmação repetida em
  várias entradas anteriores deste arquivo de que "nenhuma chave real de
  HeyGen/D-ID foi testada com sucesso em nenhuma sessão registrada". **Investigado
  em 2026-07-22, sessão seguinte** — ver seção 7, entrada "download de
  vídeo/avatar corrigido + investigação do achado paralelo", e a correção
  na Seção 3. Timeline reconstruída via `updated_at`/`created_at` do
  Postgres: credenciais reais conectadas 2026-07-17 ~05h30 UTC, 3 vídeos
  HeyGen gerados de verdade no mesmo dia ~08h50-10h30 UTC. **2026-07-17 não
  tem nenhuma entrada neste arquivo** (histórico pula de 07-16 pra 07-18) —
  origem exata (sessão de Claude Code não documentada vs. teste manual do
  usuário) permanece indeterminada

**Conclusão prática:** Item 1 pode ser considerado fechado de verdade — a
reverificação não achou nenhuma divergência do que já estava registrado.
Item 2 **não deveria ter sido considerado fechado**: tem um gap de feature
real (avatar sem download) e um bug real de UX (download de vídeo não
funciona pra URLs cross-origin, que é o caso normal de produção). Nenhuma
correção de código foi aplicada para o Item 2 nesta rodada — só a
verificação, como pedido explicitamente.

---

**O que foi feito (2026-07-22, continuação — admin copilot: recuperado,
aplicado, testado e corrigido):** pedido do usuário foi literalmente
"recuperar o contexto" de uma feature (tabelas
`admin_copilot_conversations`/`admin_copilot_messages`, rota
`/admin/copilot/messages`, correção do system prompt pra eckko.ai) —
buscada em todo o arquivo e **não encontrada em nenhuma entrada, de nenhuma
sessão**. Investigação direta no código (não em resumo de sessão anterior,
que não existia) encontrou tudo já escrito e aparentemente completo:

- Migration `031_admin_copilot.sql` (tabelas próprias, ligadas a
  `admin_users`, mesmo racional de tabela separada de `018_admin_users.sql`)
- [routes/adminCopilot.ts](backend/src/routes/adminCopilot.ts): CRUD de
  conversas/mensagens, registrado dentro do bloco `requireAdmin` de
  `app.ts`, usando `PLATFORM_COPILOT_API_KEY` (admin não tem BYOK)
- `ADMIN_SYSTEM_PROMPT` em
  [copilotProvider.ts](backend/src/services/providers/copilotProvider.ts) —
  já nasceu correto, dizendo "eckko.ai" desde o início, sem nenhum resquício
  de "TWINAI" pra corrigir
- `docs/admin/` excluído do prompt do tenant/público por nome de pasta
  (`loadDocsContent()` vs. `loadAdminDocsContent()` em
  [services/docs.ts](backend/src/services/docs.ts)), nunca vaza
- `AdminCopilotContext.tsx` (frontend) + widget `<Copilot>` já renderizado
  no header do `AdminPanelPage.tsx`

**Achado crítico ao checar o banco rodando de verdade** (não só o código):
`schema_migrations` parava em `030_credit_packages.sql` — a `031` nunca
tinha sido aplicada, e as duas tabelas não existiam no Postgres. O container
do backend estava de pé há 3h, ou seja, subiu antes desse código existir (ou
não foi reiniciado desde então) — migrations só rodam no boot. **A feature
estava 100% não-funcional no ambiente ao vivo**, apesar de completa em
código; ninguém nunca tinha clicado nela.

Corrigido e testado, nesta ordem:
1. `docker compose restart backend` → log confirmou `Applied migration:
   031_admin_copilot.sql`; `\dt admin_copilot*` confirmou as 2 tabelas
2. Admin de teste temporário (`copilottest_admin@example.com`) criado via
   INSERT direto (hash bcrypt gerado dentro do próprio container) — testado
   via curl: login pelo `POST /login` unificado (`{type: "admin"}`),
   `GET`/`POST /admin/copilot/conversations` (lista vazia → cria → aparece
   na lista), `POST .../messages` sem `PLATFORM_COPILOT_API_KEY` configurada
   localmente → `400 no_script_credential` (mesmo tratamento gracioso do
   copiloto público), confirmado no Postgres que a mensagem do usuário **não
   é persistida** quando esse check falha (a checagem da chave vem antes do
   `INSERT`, por desenho, não bug), `404` pra conversa de outro
   admin/inexistente, `401` sem sessão nenhuma
3. **No navegador, o botão do copiloto não aparecia no DOM nenhuma** (nem
   via `read_page`, nem via `querySelector` direto) — mesmo gotcha do bundle
   Vite desatualizado já documentado várias vezes nesta mesma data (Stripe,
   logomarca). `docker compose restart frontend` resolveu; botão passou a
   existir, drawer abriu, mensagem enviada pela UI confirmou o fluxo
   completo end-to-end visualmente
4. **Bug real encontrado no processo, corrigido**: a mensagem de "não
   configurado" mostrada no drawer do admin era
   `t("copilot.notConfigured")` — a mesma chave i18n do copiloto do
   **tenant** ("Conecte a chave de API do provedor de roteiro em
   Configurações para usar o copiloto"), reaproveitada sem ajuste em
   `AdminCopilotContext.tsx`. Sem sentido pro admin: ele não tem tela de
   Configurações de credencial nenhuma, depende só da env var
   `PLATFORM_COPILOT_API_KEY` do lado do servidor — a mensagem instruiria um
   admin real a procurar um botão que não existe pra ele. Corrigido:
   nova chave `copilot.adminNotConfigured` em `pt-BR.json`/`en.json`
   ("O copiloto interno ainda não está configurado — defina
   PLATFORM_COPILOT_API_KEY no ambiente do backend."),
   `AdminCopilotContext.tsx` trocado pra usar essa chave em vez da do
   tenant. Testado de novo no navegador (restart do frontend de novo) —
   mensagem nova aparece corretamente no drawer
5. `docker compose exec frontend npm run build` limpo (typecheck + build,
   sem erros)
6. Admin de teste e sua conversa removidos do banco depois — **conseguiu
   apagar de verdade** (`DELETE FROM admin_users` funcionou), diferente dos
   outros admins de teste desta sessão que ficaram presos por FK de
   `audit_log`: este nunca chegou a disparar nenhuma ação de escrita do
   painel (só copiloto), então não deixou rastro em `audit_log`

**Não testado / continua pendente**: nenhuma resposta *bem-sucedida* do
admin copilot (sem `PLATFORM_COPILOT_API_KEY` configurada localmente) — só a
prova de que o erro gracioso funciona. Mesma limitação de sempre, já
documentada pros copilotos de tenant/público e pro `scriptProvider`: chave
real nunca testada em nenhuma sessão registrada.

**Lição de processo, não específica desta feature:** este é o terceiro caso
catalogado neste arquivo (depois de `/uploads/*` em 2026-07-18 e
avatarProvider/voiceProvider em 2026-07-21/22) de código real avançando sem
o CLAUDE.md acompanhar — mas o primeiro em que a lacuna não era só
documental: aqui a migration nunca tinha rodado, então a feature também
estava quebrada de verdade no ambiente, não só "não documentada".

---

**O que foi feito (2026-07-22, continuação — reconciliação pós-trabalho
paralelo + Fase 5 fechada: compra avulsa de créditos):** sessão iniciada
reconciliando trabalho feito em paralelo por outra conta (mesmo dia): ls
das migrations depois da `028`, conteúdo de `tenant_credits`/`credit_ledger`/
`creditGate.ts`, o job de concessão mensal, e `admin_users`/`requireAdmin`/
`POST /login` — **zero divergência encontrada** entre o que este arquivo já
registrava e o estado real do código/banco. Única migration nova era a
`029` (já documentada). Os 2 testes de isolamento de sessão (admin em rota
de tenant, tenant em rota de admin) rodados de novo com um admin/tenant
descartáveis criados na hora — `401` nos dois sentidos, confirmado.

*Rate limit do `POST /login`:* checado antes de tocar em qualquer código —
[login.ts](backend/src/routes/login.ts) já tinha `createRateLimiter(5, 15 *
60 * 1000)` aplicado (a migração do antigo `POST /admin/login`, mantido vivo
mas não mais chamado pelo frontend — comentário no próprio arquivo confirma).
Confirmado também **empiricamente** (não só lendo o código): 6 tentativas
seguidas contra `/api/login` bloquearam a partir da 3ª desta rodada — número
menor que o esperado "6ª de 6" porque o contador em memória já tinha estado
residual de chamadas anteriores da própria sessão (o processo do backend
estava de pé há quase 1h); o mecanismo em si (bloqueio por IP, janela de
15min) funcionou corretamente, só a contagem exata dependia do histórico
acumulado do processo — não indicava bug.

*Fase 5 — compra avulsa de créditos (Seção 6 do roadmap, plano de billing):*
antes de codar, preço/quantidade de pacote (única coisa que o plano
deixava "a decidir na implementação") foi perguntado ao usuário em vez de
inventado — confirmado: **10 créditos por pacote nos 3 tipos**, preço
escalando na mesma ordem de custo já usada nos limites mensais (roteiro
mais barato, avatar mais caro): script R$19,90, vídeo R$39,90, avatar
R$59,90.

- Migration `030_credit_packages.sql`: nova tabela `credit_packages` (id,
  credit_type, quantity, price_cents, stripe_price_id nullable, active) —
  mesmo padrão de `plans.stripe_price_id` (criado lazy no primeiro
  checkout, cacheado depois). `credit_ledger.reason` já aceitava
  `'purchase'` desde a migration `024` original — não precisou de migration
  nova pra isso, só a tabela de catálogo dos pacotes
- `services/billing/creditPackages.ts` (novo, espelha `plans.ts`):
  `findActiveCreditPackage(creditType)`, `getAllCreditPackages()`,
  `setCreditPackageStripePrice()`
- `services/billing/stripeClient.ts` ganhou
  `getOrCreateCreditPackagePrice()` — mesmo padrão lazy-create-and-cache de
  `getOrCreateStripePrice()`, sem `recurring` (preço avulso, não assinatura)
- `services/billing/creditGate.ts` ganhou `grantPurchasedCredit()` — soma
  ao saldo (não reseta, diferente do grant mensal) dentro de uma transação
  com `SELECT ... FOR UPDATE`. Idempotência contra redelivery de webhook do
  Stripe (comportamento esperado, não bug) garantida por
  `stripe_payment_intent_id` único no `credit_ledger`: mesma ordem
  lock-then-check já usada em `monthlyGrant.ts` (trava a linha de
  `tenant_credits` primeiro, só depois checa se aquele `payment_intent` já
  foi processado), pra duas entregas do mesmo evento concorrentes
  serializarem no lock em vez de correrem em paralelo
- `routes/subscription.ts`: novo `POST /subscription/credits/checkout` —
  recebe só `creditType` (quantidade é fixa, vem do pacote), `mode:
  'payment'` (não `'subscription'`), reaproveita o mesmo Stripe Customer da
  assinatura. `metadata: { type: 'credit_purchase', tenantId, creditType,
  quantity, packageId }` no nível da sessão (não existe `subscription_data`
  em modo pagamento)
- `routes/stripeWebhook.ts`: `case "checkout.session.completed"` ramificado
  no topo por `session.metadata?.type === "credit_purchase"` — desvia pra
  `handleCreditPurchaseCompleted()` (novo) e sai, sem tocar no fluxo de
  assinatura existente logo abaixo. `handleCreditPurchaseCompleted` valida
  tenant/creditType/quantity/payment_intent antes de chamar
  `grantPurchasedCredit()`, e grava `stripe.credit_purchase_completed` no
  `audit_log` com `alreadyGranted` no corpo (visível mesmo quando é um
  no-op de idempotência)
- **Testado ponta a ponta de verdade, com Stripe CLI real** (`stripe listen
  --forward-to` pro webhook via Traefik, mesmo setup já usado na Fase 4):
  tenant novo via `/auth/signup` → `POST /subscription/credits/checkout`
  `{creditType: "script"}` → Stripe criou Product/Price reais na hora
  (`price_...` persistido em `credit_packages.stripe_price_id`) → checkout
  real no navegador com cartão de teste `4242 4242 4242 4242` → confirmado
  no Postgres (não só no redirect): `tenant_credits.script` pulou de
  inexistente pra `10`, uma linha em `credit_ledger` com
  `reason='purchase'`, `delta=10` e o `payment_intent_id` real
- **Idempotência testada de verdade, não só por inspeção de código**: sem
  endpoint de webhook registrado no dashboard do Stripe (só o
  `stripe listen` efêmero), `stripe events resend` não serviu — em vez
  disso, o evento já processado foi buscado via `stripe events retrieve` e
  reenviado manualmente ao `POST /subscription/stripe/webhook` com uma
  assinatura HMAC calculada na hora (mesmo algoritmo do Stripe:
  `HMAC-SHA256` sobre `timestamp.payload`), simulando uma redelivery real.
  **Achado de tooling registrado de passagem**: o primeiro payload
  capturado via `stripe events retrieve ... > arquivo` veio contaminado com
  um prefixo de metadado da própria ferramenta de shell (`<claude-code-hint
  ...>`, ~80 bytes) que não aparecia quando o conteúdo era só exibido de
  volta pro chat (a camada de exibição da ferramenta filtra esse prefixo,
  mas o arquivo em disco retém os bytes crus) — corrigido extraindo só o
  trecho entre o primeiro `{` e o último `}` antes de assinar. Confirmado
  no Postgres depois do replay: saldo continuou em `10` (não foi pra `20`),
  `credit_ledger` continuou com 1 linha só, e o `audit_log` registrou a
  segunda tentativa com `alreadyGranted: true` — prova de que o gate
  funciona, não só que não deu erro
- Checkout também testado (sem completar pagamento) pros outros 2 tipos
  (`video`, `avatar`) — confirma que a criação lazy do Price no Stripe
  funciona pros 3 pacotes, não só pro primeiro testado; tipo inválido
  (`"bogus"`) confirmado rejeitado com `400 invalid_credit_type`
- Tenant de teste, admin de teste e `stripe listen` encerrados/limpos
  depois. Typecheck backend limpo (só os mesmos 2 erros pré-existentes já
  documentados: `PgSessionStore` e módulo `stripe` ausente no
  `node_modules` **local** — presente e funcional dentro do container
  Docker, que é onde os testes reais rodaram)

**Onde parou / próximo passo imediato:** com isso, a Fase 5 do plano de
billing (ver seção 6) está **completa** — as 3 pernas de crédito (consumo,
concessão mensal, compra avulsa) todas implementadas e testadas com Stripe
real, não só em teoria. Resta do painel admin de billing: (a) telas de
admin/frontend pra mostrar saldo e permitir ajuste manual/compra pelo
tenant (nenhuma UI nova foi construída nesta rodada, só backend) e (b) Fase
6 (faturas reais), que continua sem começar.

---

**O que foi feito (2026-07-22, continuação — última menção "TWINAI" na
landing + tema claro como padrão):**

*Texto "TWINAI" residual — escopo maior que o pedido literal.* O pedido
citava só o subtítulo do hero, mas pediu explicitamente pra confirmar via
grep que não sobrava mais nenhuma menção na landing inteira — o grep
encontrou **9 ocorrências** em cada locale (`pt-BR.json`/`en.json`), não
1: subtítulo do hero, corpo da seção "problema", passo 1 do "como funciona",
2x "hospedado pela TWINAI" (planos Pro/Business), 2x nas FAQ, mensagem do
WhatsApp, e título/texto vazio do `PublicCopilotWidget` (também renderizado
na landing). Todas as 9 corrigidas pra "eckko.ai" nos dois idiomas — grep
final confirma zero ocorrências de "TWINAI" em todo `frontend/src`
(locales, `.tsx`, `index.html`).

*Tema claro como padrão.* Investigado
[ThemeContext.tsx](frontend/src/theme/ThemeContext.tsx) antes de mudar:
`getStoredMode()` caía em `"system"` quando `localStorage` não tinha nada
salvo — e o CSS ([theme.css](frontend/src/styles/theme.css)) tem um bloco
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }`
que aplica escuro sempre que não há `data-theme` explícito e o SO prefere
escuro. Ou seja: confirmado meio a meio o palpite do pedido — não é "sempre
escuro fixo", é "segue o SO", que na prática também engana quem tem o SO
configurado pra escuro. Corrigido:
- `getStoredMode()`: fallback trocado de `"system"` para `"light"` — só
  quando não há nada salvo. `"system"` continua uma opção real do toggle
  (`AppShell.tsx` já tinha os 3 botões: claro/escuro/seguir sistema, nenhum
  removido); uma vez escolhido explicitamente (qualquer um dos 3), fica
  salvo e este fallback nunca mais entra em jogo
- Adicionado um script inline em [index.html](frontend/index.html), rodando
  antes de qualquer CSS comitar, que aplica o mesmo default — evita um
  flash de tema escuro no primeiro paint pra quem tem o SO em escuro (sem
  isso, o `useEffect` do React só aplicaria `data-theme="light"` depois do
  primeiro render, deixando uma janela onde o `@media prefers-color-scheme`
  já teria pintado escuro). Duplica a lógica de `getStoredMode()` de
  propósito — não dá pra importar um módulo TS num script inline sem build
  step — com comentário nos dois arquivos apontando um pro outro pra não
  dessincronizar
- `ThemeProvider` já envolve o `<App/>` inteiro em
  [main.tsx](frontend/src/main.tsx) (landing + app do tenant, mesma
  instância) — a mudança cobre os dois sem precisar de nada específico por
  tela
- **Testado ao vivo**: aba nova, `localStorage` limpo, SO forçado pra
  escuro (`prefers-color-scheme: dark` via `resize_window`) → confirmado
  via JS (`data-theme="light"`, `background-color` batendo com o hex claro)
  **e** visualmente (screenshot) que a landing abre clara mesmo assim.
  Depois, tenant de teste criado, botão "Tema escuro" clicado no app
  autenticado → aplicou na hora, `localStorage` gravou `"dark"` → página
  recarregada → continuou escura (não voltou a forçar claro). Tenant de
  teste limpo depois
- Typecheck frontend limpo nas duas mudanças

*Nota de convenção registrada permanentemente* (seção 5, gotcha do restart
do frontend): esse mesmo gotcha do bundle Vite desatualizado já apareceu
2x nesta data (teste do Stripe, rebrand da landing/logo) — documentado como
regra prática permanente, não só um relato pontual, pra sessões futuras não
perderem tempo suspeitando de bug de lógica antes de tentar o restart.

---

**O que foi feito (2026-07-22, continuação — logomarca real substituindo
texto em 3 telas: header/footer da landing, header do signup):** os três
locais ainda usavam `.brand-mark` (quadrado verde CSS puro) + texto
`{t("common.appName")}` renderizado em fonte — o mesmo padrão que a sidebar
do tenant já tinha resolvido antes com uma imagem real
(`logo-eckko-transparent.png` dentro de um chip verde fixo,
`.sidebar-logo-chip`, ver Fase B do rebrand). Corrigido:
- CSS: `.sidebar-logo-chip` generalizado para `.brand-logo-chip`
  ([global.css](frontend/src/styles/global.css)) — mesmo comportamento
  (chip `#9CEE06` fixo, garante legibilidade do texto preto da logo
  independente do tema claro/escuro da página ao redor), com 3 modificadores
  de tamanho novos (`--nav` 28px, `--footer`/`--form` 24px) porque o
  tamanho compacto da sidebar (20px) fica ilegível num header/card maior —
  a lição de não fazer downscale agressivo que o usuário pediu pra manter
  em mente
- Aplicado em [LandingPage.tsx](frontend/src/pages/Landing/LandingPage.tsx)
  (header e footer) e [SignupPage.tsx](frontend/src/pages/Signup/SignupPage.tsx)
  (header do card) — `LoginPage.tsx` (agora também usado pro login
  unificado de admin, ver entrada anterior) **não foi tocado**, continua
  com `.brand-mark`, deliberadamente fora do escopo pedido (só "três
  lugares" foram citados)
- Achado de passagem, corrigido no mesmo footer que já estava sendo
  editado: o copyright ainda dizia "© {ano} TWINAI." hardcoded, nunca
  atualizado pro rebrand — trocado por `{t("common.appName")}`. **Não
  corrigido** (fora do escopo dos "três lugares" pedidos, só registrado
  aqui): o subtítulo do hero da landing ainda menciona "o TWINAI treina seu
  avatar" — mesmo tipo de leftover, outro lugar
- **Gotcha reencontrado**: depois de editar, o Vite dev server continuou
  servindo o bundle antigo (sem `brand-logo-chip`, confirmado comparando o
  `curl` do módulo servido com o arquivo real em disco) até um
  `docker compose restart frontend` — mesmo gotcha já documentado nesta
  sessão pro teste do Stripe, agora confirmado que também acontece em
  edições de CSS/JSX simples, não só depois de instalar um pacote novo
- **Verificado ao vivo nos dois temas** (claro e escuro, via
  `resize_window` com `colorScheme`): os 3 locais renderizam a imagem real
  (`complete: true`, tamanho natural 364×99, `alt="eckko.ai"` como nome
  acessível) nos tamanhos exatos configurados (28px/24px/24px), chip verde
  legível em ambos os temas, nenhum texto "eckko.ai" recriado em fonte
  sobrando ao lado. Typecheck frontend limpo

---

**O que foi feito (2026-07-22, continuação — login unificado + admin real
da plataforma):** implementado o desenho já aprovado numa sessão anterior
(ver entrada mais abaixo, "Confirmar/ajustar fluxo de login unificado" —
essa era só a proposta, esta é a implementação):

- **Achado confirmado antes de codar**: já existia uma tela própria de
  admin (`AdminLoginPage.tsx`, rota `/admin/login`, `AdminAuthContext`
  próprio) — não era só um endpoint de backend sem UI. E o bloco `/admin/*`
  do `App.tsx` não era filtrado por `isRootDomain()`, então o caminho de
  admin já "vazava" por URL em qualquer subdomínio de tenant antes desta
  mudança (sem link público, mas acessível direto)
- **Backend**: novo `POST /login` ([routes/login.ts](backend/src/routes/login.ts)),
  host-aware de verdade (não só na UI): sem `req.hostTenantId` resolvido
  (domínio raiz), tenta `admin_users` primeiro, senão `users` sem escopo;
  com `hostTenantId` resolvido (subdomínio de tenant), **nunca** consulta
  `admin_users` — mesmo uma senha de admin correta não autentica vindo de
  um subdomínio. Resposta discriminada por `type` (`"admin"` ou `"tenant"`)
  com a mesma mensagem genérica de erro nos dois casos de falha, pra não
  vazar por timing/mensagem se um e-mail pertence a qual tabela. Rate limit
  de 5 tentativas/15min (antes só em `/admin/login`) extraído pra um helper
  compartilhado ([services/rateLimit.ts](backend/src/services/rateLimit.ts))
  e aplicado no novo endpoint. `/auth/login` e `/admin/login` (backend)
  continuam existindo, só não são mais chamados pelo frontend
- **Frontend**: `AuthContext.login()` passou a chamar `/login` e devolver
  o `type` — pro caso `"tenant"`, hidrata `user`/`tenant` direto da
  resposta (sem round-trip extra pra `/auth/me`); pro caso `"admin"`, não
  mexe no próprio estado (esse contexto nunca representa identidade de
  admin) e só devolve o tipo pra cima — `LoginPage.tsx` navega pra
  `/admin` ou `/` conforme o retorno. A rota `/admin/login` no `App.tsx`
  passou a renderizar o mesmo `LoginPage` (não foi removida — evita mexer
  no redirect do `AdminProtectedRoute` quando a sessão de admin expira,
  que ainda aponta pra lá). `AdminLoginPage.tsx` (órfão, confirmado via
  grep antes de apagar) e as chaves de locale `adminPanel.login.*` (também
  órfãs, mesma checagem) foram removidos
- **Admin real criado**: `admin@eckkoai.com`, senha forte gerada
  aleatoriamente e mostrada uma única vez no chat pro usuário salvar num
  gerenciador de senhas — não fica em nenhum arquivo do repo nem neste
  CLAUDE.md, por design
- **Limpeza de admins de teste**: além do `admintest@example.com` citado
  no pedido, encontrados mais 3 acumulados de sessões anteriores
  (`admin-uitest@eckko.ai`, `sweeptest_admin@example.com`,
  `stripesweep_admin@example.com`) — tentativa de remover os 4, todos
  bloqueados pelo mesmo motivo já documentado nesta sessão (FK de
  `audit_log`, imutável por design). Mantidos, inofensivos — só
  credenciais de login sem uso
- **Testado ao vivo, backend (curl) + frontend (navegador) juntos:**
  1. `admin@eckkoai.com` no domínio raiz → `{type: "admin"}`, confirmado
     sessão real via `GET /admin/me`
  2. Credencial de tenant real (tenant de teste criado na hora) no domínio
     raiz → `{type: "tenant"}`, confirmado via `GET /auth/me`
  3. **O teste que prova que a regra é do servidor, não só da UI**:
     `admin@eckkoai.com` com a senha **correta**, mas contra
     `acme.twinai.localhost` (subdomínio de tenant real) → `401
     invalid_credentials`. Sem esse teste, a separação seria só estética
  4. Rate limit: 6 tentativas seguidas do mesmo IP → a 6ª retornou `429`,
     exatamente no limite configurado (5 permitidas)
  5. Login real pela UI (`admin@eckkoai.com` em `/login`, domínio raiz) →
     redirecionou pro Painel admin de verdade, listando os tenants reais —
     confirma que o fluxo completo (form → backend → redirect →
     `AdminAuthProvider` se autoidratando via `/admin/me`) funciona de
     ponta a ponta, não só a mecânica isolada
  - Backend precisou ser reiniciado entre os testes de curl e o teste via
    navegador — o rate limit (em memória) já tinha sido esgotado pelos
    testes de curl no mesmo IP, e bloquearia o teste 5 também
- Tenant de teste (`unifiedlogintest-tenant`) limpo do banco depois.
  Typecheck backend e frontend limpos (backend: só os mesmos erros
  pré-existentes conhecidos; frontend: zero erros)

---

**O que foi feito (2026-07-22, continuação — fundo virtual: tentativa de
validação visual real + organização de arquivos soltos fora do repo):**

*Fundo virtual — ainda sem validação visual real, limitação confirmada de
novo, não resolvida.* Antes de tentar, checado se `Claude in Chrome` (a
extensão) estava conectada nesta sessão — `list_connected_browsers` voltou
vazio, então essa alternativa não estava disponível desta vez. Tentativa
feita no Browser pane padrão: tenant de teste criado, `/create` → "+
Configurar novo avatar" clicado. O console mostrou o MediaPipe
inicializando de verdade (contexto WebGL, "Graph successfully started
running", `segmentation_postprocessor_gl.cc`) — o que a princípio pareceu
promissor — mas isso é só o segmentador carregando o modelo/WASM no mount
do componente, **antes** e **independente** de qualquer frame de câmera de
verdade. Confirmado de forma explícita e definitiva, não ambígua:
`navigator.permissions.query({name:'camera'})` → `"denied"`; chamada direta
a `getUserMedia({video:true})` → `NotAllowedError: Permission denied`; e a
própria ferramenta anexou uma nota de sistema confirmando o bloqueio ("the
page... requested camera access, which is blocked in the Browser pane...
Don't treat device capture as working"). Nenhum `<video>` foi criado no
DOM, nenhum diálogo de permissão surgiu para interagir. **Não insisti mais
depois dessa confirmação** (instrução explícita do usuário para não fingir
resolução) — a validação visual real de MASK_SHARPNESS/EROSION_RADIUS/
TEMPORAL_SMOOTHING_ALPHA com pessoa de verdade (halo/franja no cabelo)
**continua pendente**, mesma limitação de toda sessão anterior desde a
Fase 4. Tenant de teste (`camtest-tenant`) limpo do banco depois.

*Arquivos soltos na pasta pai (`AVATAR VIDEO MÓDULO/`, um nível acima de
`TWINAI/`) — investigados antes de qualquer ação, nada movido:*
- `LANNDING PAGE ECKKOAI.html` — confirmado ser exatamente o mockup "neon
  tech" já auditado e descartado na sessão de 2026-07-21 (mesmas claims
  falsas já catalogadas: "Sincronia Labial & Ocular", "99.8% Precisão",
  "Captura Neural"/"dados biométricos", duração "30s–5min"). Superado pela
  landing real. Nenhuma ação necessária
- `PAINEL ECKKOAI.html` — não citado no pedido original, mas encontrado do
  lado (mesma leva/data) — é o companheiro "painel" do mesmo par que a
  auditoria de 2026-07-21 já menciona ("dois HTMLs de landing/painel").
  Também superado, mesma conclusão
- `ECKKOAI IMAGEM 1.png` — achado real: é a mesma arte já salva em
  `frontend/public/brand/logo-eckko-original.png`, **mas com um elemento
  que a versão salva não tem**: um tagline abaixo do logo, "SUA IMAGEM, SUA
  VOZ, SEU CONTEÚDO SEM LIMITES." Busca pelo texto exato (e pelo fragmento
  distintivo "SEM LIMITES") no repo inteiro não encontrou nenhuma
  ocorrência — esse tagline nunca foi incorporado em lugar nenhum (landing
  real, locales, previews da Fase A). Reportado ao usuário, nada movido nem
  decidido — fica pendente uma decisão de produto/marketing sobre se esse
  tagline deveria entrar em algum lugar (ex.: subtítulo do hero)

---

**O que foi feito (2026-07-21/22 — painel admin: billing, créditos e medição
de consumo, Fases 0-3 do plano dedicado):** continuação da mesma sessão dos
blocos abaixo (Fase B do rebrand, fundação do admin panel). Planejado via
Plan Mode antes de qualquer código (3 agentes Explore em paralelo levantando
o estado real de billing/subscription, providers, e admin/Traefik antes do
plano) — plano salvo, revisado com o usuário passo a passo, aprovado por
fase.

- **Fase 0 (schema) — concluída.** Migrations `020` a `026`: tabela `plans`
  (fonte de verdade agora — ver decisão abaixo), `tenants` ganhou
  `status`/`stripe_customer_id`/`credit_balance`, `provider_cost_rates`
  (taxa por provedor/vendor/unidade, com coluna `verified` adicionada numa
  correção de revisão — ver Fase 1), `provider_usage` (ledger imutável de
  uso real) e `credit_ledger` (ledger imutável de créditos), `audit_log.
  actor_admin_user_id` virou nullable (ações de webhook futuras não têm
  admin). Aplicado e verificado via `psql` linha por linha.
- **Decisão travada: `plans.ts` não é mais hardcoded — a tabela `plans` é a
  fonte de verdade.** `plans.ts` virou uma camada fina (`getPlan`/
  `getAllPlans`/`findPlan`/`getAllPlansIncludingInactive`/`createPlan`/
  `updatePlan`) que só lê/escreve no banco, sem cache em memória (decisão
  deliberada — planos não são hot path, correção importa mais que economizar
  um round-trip). `routes/public.ts`, `routes/subscription.ts`,
  `routes/videos.ts` atualizados pros novos nomes async. Testado com curl:
  `GET /public/plans`, `GET /subscription`, `PUT /subscription/plan`
  (válido/inválido).
- **Fase 1 (medir custo real por provedor, sem Stripe) — concluída.** Novo
  `services/billing/usageTracking.ts` (`recordProviderUsage` — nunca lança
  erro, é telemetria secundária). `providerRegistry.ts` para de descartar
  `usage`/tokens da resposta de Anthropic/Gemini/OpenAI (dado que os vendors
  já mandavam, só não era lido); `scriptProvider.ts`/`copilotProvider.ts`
  gravam tokens in/out (copiloto público não grava — sem tenant, custo é da
  plataforma); `avatarProvider.ts` grava caracteres do roteiro na síntese
  ElevenLabs; `routes/videos.ts` grava segundos (proxy: duração pedida, não
  duração real — nenhum vendor confirma isso hoje) quando o vídeo fica
  pronto. Admin: `GET /admin/tenants/:id/usage` (breakdown + total +
  `allRatesVerified`) e nova aba "Taxas de custo" (`GET`/`PUT
  /admin/cost-rates`) no painel.
  **Achado de revisão do usuário, incorporado nesta mesma fase:** os 9
  valores seedados em `provider_cost_rates` são placeholder, não conferidos
  contra preço real publicado — adicionada coluna `verified` (migration
  026) exatamente pra isso; toda tela de custo mostra um banner vermelho
  "Estimativa — taxas ainda não conferidas" sempre que `allRatesVerified`
  for falso, nunca trata como custo real. **Essa pendência (conferir os 9
  valores contra preço real de HeyGen/D-ID/ElevenLabs/Anthropic/Gemini/
  OpenAI) continua aberta** — ver "Bloqueios ou pendências" abaixo.
- **Fase 2 (planos editáveis via admin) — concluída.** `POST`/`PUT
  /admin/plans` (audit-logado, sem hard delete — só `active: false`, mesmo
  padrão de "aposentar sem apagar" do projeto), nova aba "Planos" no painel.
  Testado: criar plano, rejeitar id duplicado (`409`), editar preço,
  desativar um plano — confirmado que `GET /public/plans` some o
  desativado mas um tenant **já** naquele plano continua resolvendo normal
  (efeito avô).
- **Fase 3 (suspensão de tenant) — concluída.** Novo middleware
  `requireActiveTenant` (`backend/src/middleware/requireActiveTenant.ts`),
  aplicado só como `preHandler` nas 3 rotas de geração (`POST /videos`,
  `POST /avatars/:id/reference-video`, `POST /scripts/generate`) — não no
  bloco `requireAuth` inteiro, pra suspensão bloquear só geração/consumo,
  não login/leitura. `PUT /admin/tenants/:id/status` audit-logado + badge/
  botão suspender-reativar no painel (lista e detalhe). Testado ao vivo:
  suspenso → `403 tenant_suspended` nas 3 rotas, `200` em `GET
  /subscription`/`GET /videos`; reativado → volta ao erro de negócio normal
  (não mais suspensão); `audit_log` confirmado com as duas mudanças.
- ~~Fase 4 (Stripe: assinatura real + webhook) — PAUSADA, nada escrito
  ainda~~ — **concluída e verificada de ponta a ponta em 2026-07-22** (ver
  entrada própria logo abaixo, "Fase 4 — Stripe: assinatura real +
  webhook"). Credenciais de teste fornecidas pelo usuário, checkout real +
  `stripe listen` capturando o webhook confirmados.
- Fase 5 (créditos avulsos) iniciada nesta mesma sessão logo em seguida — ver
  entrada própria abaixo, "Fase 5 — gate de crédito ligado nas 3 rotas de
  geração". Fase 6 (faturas reais) ainda não começou.
- Todo tenant/admin de teste criado nesta fase foi limpo do banco depois de
  cada verificação (exceto 1 usuário admin de teste, `admintest@example.com`,
  mantido porque apagá-lo exigiria tocar em entradas do `audit_log`, que é
  registro imutável por design — inofensivo, é só uma credencial de login).

---

**O que foi feito (2026-07-22, continuação — Fase 5: gate de crédito ligado
nas 3 rotas de geração, `debitCredit()` substitui os contadores por
plano):** antes de codar, resolvida uma pergunta de arquitetura que estava
em aberto desde que `tenant_credits`/`credit_ledger` foram desenhados
(migrations 024/028): o limite por plano
(`videoLimitPerMonth`/`scriptLimitPerMonth`/`avatarLimitPerMonth`, contado
via `COUNT(*)` em `videos`/`script_generations`/`avatar_trainings`) e o
saldo de crédito são a **mesma coisa**, não mecanismos complementares — a
concessão mensal baseada no plano é o que alimenta o saldo de
`tenant_credits`, não uma cota separada por cima dele. Raciocínio que
fechou a decisão: um job de concessão mensal só faz sentido se o crédito
substitui o contador — o `COUNT(*) ... >= plan.limit` já reseta sozinho
todo mês via `date_trunc('month', now())`, então não haveria nenhuma função
pra um grant mensal se a cota do plano continuasse sendo esse contador.
Decisão confirmada pelo usuário, com 3 ajustes:
- Migration `029_credit_ledger_grant_reason.sql`: `credit_ledger.reason`
  ganhou um 4º valor no CHECK, `'grant'`, distinto de `'purchase'` — são
  eventos financeiramente diferentes (alocação automática da assinatura vs.
  receita de venda avulsa) e precisam ser distinguíveis em relatório futuro.
  O job de concessão mensal em si **não foi implementado nesta sessão** —
  só o schema ficou pronto pra ele.
- `routes/videos.ts`, `routes/scripts.ts`, `routes/avatars.ts`: os 3 checks
  `SELECT count(*) ... >= plan.XLimitPerMonth` foram removidos e
  substituídos por uma chamada a `debitCredit()`
  ([creditGate.ts](backend/src/services/billing/creditGate.ts)). As tabelas
  `script_generations`/`avatar_trainings` (e `videos`, que já cumpria os
  dois papéis) continuam recebendo uma linha por tentativa exatamente como
  antes — viraram histórico/telemetria puro, ligadas ao `credit_ledger` via
  `related_script_generation_id`/`related_avatar_training_id`/
  `related_video_id`. Em `videos.ts` a checagem de crédito teve que mudar de
  posição: antes era o primeiro passo (fail-fast, antes de validar
  avatar/credencial); agora vem depois dessas validações, porque precisa do
  `video.id` já existente pra popular o FK — efeito colateral aceito, não
  problema (um tenant sem crédito ainda passa pelas validações de
  avatar/credencial antes de ser bloqueado, mas nunca chega a chamar o
  provider de verdade)
- Mensagem de erro ajustada pra cobrir os dois cenários com o mesmo código
  `plan_limit_reached` (mantido de propósito, menos churn no frontend):
  "Créditos esgotados — adicione créditos ou aguarde a renovação mensal do
  seu plano." (antes só mencionava "limite do plano")
- **Testado ponta a ponta nas 3 rotas** com tenant real via `/auth/signup` +
  admin de teste temporário (só pra essa sessão, criado e removido depois)
  usado pra conectar credenciais dummy via `PUT
  /admin/tenants/:id/credentials/:provider` (a rota de escrita do lado do
  tenant está bloqueada desde a Fase B do rebrand — ver seção 3). Confirmado
  em `script`/`avatar`/`video`:
  - Tenant recém-criado via signup **não tem nenhuma linha em
    `tenant_credits`** (gap já conhecido, seção 7 de sessões anteriores) —
    `debitCredit()` trata isso como saldo 0 e bloqueia com
    `plan_limit_reached`, sem lançar erro; a linha histórica
    (`script_generations`/`avatar_trainings`/`videos`) ainda é criada mesmo
    bloqueado, sem nenhuma linha em `credit_ledger`
  - Saldo semeado manualmente via SQL (`INSERT INTO tenant_credits ...
    VALUES (..., 1)`) permite a chamada passar do gate (não é mais 403) e
    debita — confirmado nos 3 tipos que o saldo cai pra 0 e o
    `credit_ledger` grava `delta=-1`, `reason='consumption'`, `credit_type`
    correto, e o FK tipado apontando pra linha certa
  - Saldo zerado de novo bloqueia de novo (mesmo teste, 2ª chamada)
  - **Concorrência**: saldo=1, 2 requisições simultâneas contra
    `POST /scripts/generate` → exatamente uma passou o gate (foi pro
    provider, que retornou 502 por causa da chave dummy) e a outra recebeu
    `403 plan_limit_reached` — confirmado no banco: só 1 linha em
    `credit_ledger`, saldo final `0` (nunca negativo), sem débito
    duplicado. O `SELECT ... FOR UPDATE` dentro da transação de
    `debitCredit()` ([creditGate.ts:37](backend/src/services/billing/creditGate.ts:37))
    é o que garante isso
- Tenant, admin e todos os dados de teste (credenciais, avatares, vídeos,
  `tenant_credits`, `credit_ledger`) limpos do banco depois da verificação
- Typecheck backend limpo (só os mesmos erros pré-existentes já conhecidos:
  `PgSessionStore` e módulo `stripe` ausente no `node_modules` local — não
  relacionados a esta mudança)

---

**O que foi feito (2026-07-22, continuação — Fase 5: seed de
`tenant_credits` no signup):** fechado o gap (2) da lista acima. Confirmado
via grep no repo inteiro por `INSERT INTO tenants` que
[routes/auth.ts:43](backend/src/routes/auth.ts:43) (`POST /auth/signup`) é
o único caminho vivo de criação de tenant (`backend/dist/routes/auth.js` é
o build compilado do mesmo arquivo; a migration `005_backfill_tenant_id.sql`
é um backfill histórico já aplicado, não um caminho de código).

Achado que mudou o escopo do pedido original: o handler de signup **já não
era atômico antes desta mudança** — `INSERT INTO tenants`, os 3 `INSERT
INTO api_credentials` e o `INSERT INTO users` eram 4 chamadas `pool.query()`
soltas, sem transação nenhuma. Só envolver `tenant`+`tenant_credits` numa
transação teria deixado a mesma classe de problema aberta pros outros
inserts (um `users` que falhasse ainda deixaria um tenant órfão, sem
ninguém pra logar). Em vez disso, o fluxo inteiro de signup (tenant → 3x
`api_credentials` → 3x `tenant_credits`, balance 0, mesma forma do backfill
da migration 028 → `users`) foi movido pra dentro de uma única transação
com um `client` dedicado (`BEGIN`/`COMMIT`/`ROLLBACK`, mesmo padrão de
[creditGate.ts](backend/src/services/billing/creditGate.ts)).
`hashPassword()` (bcrypt, CPU-bound) continua rodando **antes** do `BEGIN`
— não há razão pra segurar a conexão aberta durante o hash — e
`generateUniqueSlug()` continua com sua própria checagem otimista via
`pool` fora da transação, como já era (a garantia real de unicidade
continua sendo o `UNIQUE` do banco, verificado dentro da transação no
`INSERT INTO tenants`).

**Testado ao vivo:**
- Signup real via `/auth/signup` → confirmado via SQL que as 3 linhas de
  `tenant_credits` (video/script/avatar) existem com `balance = 0`
  imediatamente após, sem precisar de nenhum passo manual
- **Teste de rollback**: injetado um `throw` temporário logo depois do seed
  de créditos (antes do `INSERT INTO users`), backend reiniciado, signup
  chamado de novo → `500`, e confirmado no Postgres que **nada** persistiu
  (zero linhas em `tenants`/`users`/`api_credentials`/`tenant_credits` para
  esse tenant) — o `throw` foi removido logo em seguida, backend reiniciado
  de novo, e um signup normal repetido pra confirmar que o fluxo real
  continua funcionando (`201`, créditos semeados)
- Todos os tenants de teste (incluindo o que ficou órfão do teste de
  rollback fracassado — que na verdade não ficou órfão nenhum, o rollback
  já tinha limpado tudo sozinho) removidos do banco depois
- Typecheck backend limpo (só os mesmos erros pré-existentes já conhecidos)

---

**O que foi feito (2026-07-22, continuação — Fase 5: job de concessão
mensal de créditos):** fechado o gap (1) da lista acima. Antes de codar,
proposto e confirmado pelo usuário um plano com uma decisão de produto real
embutida:

- **Reset vs. acumula:** confirmado **reset** ("use ou perca") — todo mês
  `tenant_credits.balance` vira exatamente `plan.XLimitPerMonth`, não soma
  em cima do que sobrou. Descartado acúmulo (geraria passivo crescente sem
  teto por tenant inativo, decisão explícita do usuário)
- **Tenant suspenso também recebe o grant** — confirmado explicitamente.
  Como `requireActiveTenant` já bloqueia geração independente de saldo,
  filtrar por status só adicionaria uma branch sem efeito real
- **Mecanismo:** investigado o repo inteiro antes — não existe nenhum
  scheduler (`cron`/`node-cron`/`setInterval` recorrente) hoje; o único
  `setInterval` existente é o polling de vídeo em `videos.ts`, que é
  por-request e se auto-encerra, não um agendador de aplicação. Decidido
  **não** adicionar `node-cron` como dependência nova — reaproveitado o
  mesmo idioma de `setInterval` puro que `videos.ts` já usa, rodando a
  varredura completa (`runMonthlyGrantSweep()`,
  [monthlyGrant.ts](backend/src/services/billing/monthlyGrant.ts)) uma vez
  no boot **e** a cada 24h (`index.ts`), não só numa hora fixa do dia 1 —
  esse processo reinicia com frequência (gotcha do `tsx watch` já
  documentado, e deploys em produção também reiniciam o container), então
  um agendamento preso a um instante exato do relógio arriscaria pular o
  mês inteiro se o processo estivesse fora do ar naquele momento. A
  segurança real não vem da precisão do timer, vem da idempotência abaixo —
  rodar o sweep sem necessidade é sempre um no-op barato
- **Idempotência com uma nuance de ordem que importa:** dentro da mesma
  transação, primeiro trava a linha de `tenant_credits` (`FOR UPDATE`), **só
  depois** checa se já existe um `credit_ledger` com `reason='grant'` para
  aquele tenant+credit_type neste mês. Nessa ordem (não a inversa), duas
  varreduras concorrentes no mesmo tenant/tipo (ex.: o timer de 24h
  disparando bem na hora em que um admin aciona manualmente) serializam
  pelo lock da linha, e a segunda só decide se concede depois de já
  enxergar o grant da primeira, já commitado
- **Trava de delta não-positivo:** `delta = plan_limit - saldo_atual`; se
  `delta <= 0` (só alcançável se o limite do plano caiu desde o último
  grant, ou um ajuste manual deixou o saldo acima do novo limite — ambos
  fora de escopo aqui), o sweep pula sem mexer no saldo e sem gravar linha
  de `credit_ledger` nenhuma — nunca grava um `'grant'` com valor
  zero/negativo
- **Tenants existentes vs. novos:** sem script de backfill separado — o
  sweep é genérico e trata todo tenant igual; rodar uma vez (no primeiro
  boot com este código, ou via o endpoint manual) já cobre os 13 tenants
  existentes, e os novos (que já nascem com a linha de saldo zerada desde o
  passo anterior desta sessão) são pegos automaticamente no próximo sweep
- Novo `POST /admin/credits/run-monthly-grant` (mesma função por baixo) —
  gatilho manual pra backfill imediato sem esperar o próximo boot/24h, e
  recuperação manual se o sweep automático não rodar por algum motivo.
  Auditado via `audit_log`: o sweep automático grava com
  `actorAdminUserId: null` e ação prefixada `system.` (convenção estendida
  em [auditLog.ts](backend/src/services/auditLog.ts) — antes só
  documentada pra `stripe.`, agora generalizada pra qualquer ator nulo);
  o disparo manual grava com o admin real como ator e prefixo `credits.`.
  Cada corrida grava **uma** linha de resumo (`{granted, skipped, failed}`)
  em `audit_log`, não uma por tenant — o detalhe fino por tenant já é o que
  `credit_ledger` existe pra registrar, duplicar isso em `audit_log` seria
  redundante e ruidoso
- **Testado ao vivo, direto nos 13 tenants reais do ambiente** (não um
  tenant de teste descartável — este é o backfill de produção de verdade
  que o item 4 do plano pedia): restart do backend disparou o sweep no
  boot → confirmado `39` linhas novas em `credit_ledger` com
  `reason='grant'` (13 tenants × 3 tipos) e saldos batendo exatamente com
  os limites de cada plano (`free`: 2/10/1, `pro`: 20/60/5). Disparo manual
  em seguida (via admin de teste temporário, mesmo padrão de sessões
  anteriores) → `{granted: 0, skipped: 39, failed: 0}`, confirmando
  idempotência (nenhuma linha duplicada). Trava de delta testada
  manipulando o saldo de `avatar` do tenant `acme` pra `5` (acima do limite
  `1` do plano `free`) e apagando seu `grant` deste mês pra forçar
  elegibilidade — sweep rodou de novo, resultado permaneceu `skipped`, saldo
  continuou `5` (não foi resetado pra baixo) e nenhuma linha nova de ledger
  foi gravada; estado do `acme` restaurado manualmente pro que o sweep
  normal teria produzido (`balance=1` + linha de `grant` correspondente),
  já que é um tenant real de dev, não um artefato de teste descartável
- Admin de teste temporário (`sweeptest_admin@example.com`) não pôde ser
  removido pelo mesmo motivo já documentado nesta sessão pro
  `admintest@example.com`: `audit_log` é imutável e referencia o ator via
  FK. Mantido — inofensivo, é só uma credencial de login
- Typecheck backend limpo (só os mesmos erros pré-existentes já conhecidos)

---

**O que foi feito (2026-07-22, continuação — Fase 4 reduzida: top-up de
crédito imediato no upgrade via Stripe):** o pedido original presumia que
checkout/webhook do Stripe ainda não existiam — **conferido direto no
código antes de propor qualquer coisa, e não era o caso**: `POST
/subscription/checkout`, o webhook com validação de assinatura obrigatória,
e o preenchimento de `stripe_customer_id` já estavam implementados e
verificados numa sessão anterior (mesma Fase 4, ver entrada
"2026-07-22 — Fase 4: Stripe" mais abaixo), **antes** do sistema de
créditos existir. O escopo real desta rodada era só a lacuna que isso
deixou: o webhook não sabia nada sobre `tenant_credits`/`credit_ledger`.

Decisão proposta e confirmada antes de codar: **o webhook dispara um top-up
imediato e específico daquele tenant** (não só o sweep de 24h genérico),
porque depender só do sweep deixaria um tenant que faz upgrade preso no
saldo antigo (mais baixo) até o próximo grant mensal — inclusive podendo
ser pulado de vez se já tivesse recebido o grant deste mês sob o plano
antigo, já que a checagem de idempotência do sweep é "já concedi este
tenant+tipo este mês?". Implementado sem duplicar a mecânica de concessão:

- [monthlyGrant.ts](backend/src/services/billing/monthlyGrant.ts)
  refatorado — a lógica por tenant+tipo (lock, delta, trava de
  não-positivo, update+insert) virou uma função interna `applyGrant()`
  reaproveitável, parametrizada por `checkMonthlyIdempotency`.
  `runMonthlyGrantSweep()` continua chamando com a checagem ligada (sem
  mudança de comportamento). Novo `grantPlanChangeTopUp(tenantId)` chama
  com a checagem **desligada** — não é a rotina mensal, é um evento
  distinto de troca de plano, e não deve ser bloqueado por ela
- Por que isso não duplica: a trava de `delta <= 0` (já existente) garante
  que chamar duas vezes seguidas é sempre um no-op na segunda vez, e o
  sweep seguinte já enxerga a linha `reason='grant'` deste mês criada pelo
  top-up e pula normalmente pela checagem que já existia
- Por que só em `checkout.session.completed`, não em
  `customer.subscription.updated`/renovação: o modelo de créditos já é
  mês-civil, deliberadamente desacoplado do ciclo de cobrança Stripe do
  tenant (decisão da rodada anterior). Vincular o top-up a eventos de
  renovação reintroduziria esse acoplamento que já tinha sido descartado —
  `checkout.session.completed` é o único evento que representa uma escolha
  ativa de plano
- Downgrade continua sem precisar de código novo — a mesma trava de
  `delta <= 0` que protege o sweep também protege o top-up: se o novo
  limite for menor que o saldo atual, o top-up simplesmente pula sem
  reduzir nada
- [routes/stripeWebhook.ts](backend/src/routes/stripeWebhook.ts): chamada a
  `grantPlanChangeTopUp()` logo após o `UPDATE plan_id` em
  `checkout.session.completed`, dentro de `try/catch` que nunca bloqueia o
  `200` de resposta — o pagamento e a troca de plano já commitaram antes,
  o que importa mais, e o sweep de 24h cobre qualquer lacuna de qualquer
  forma. Grava uma linha própria de auditoria
  (`stripe.checkout_completed.credit_top_up`) com o resumo
  `{granted, skipped, failed}`

**Testado com Stripe CLI real, não só typecheck:** `stripe listen --api-key
... --forward-to` apontado pro webhook real através do Traefik
(`twinai.localhost:8090`, gotcha de DNS do `*.localhost` já resolvido numa
sessão anterior via hosts file, ainda válido). Segredo de assinatura
impresso pelo `stripe listen` bateu exatamente com o que já estava no
`.env` (determinístico por conta/chave, não precisou trocar nada).
Cadastrado um tenant novo de verdade (`Free`, saldo ainda `0/0/0` —
nenhum sweep tinha rodado pra ele ainda, o caso mais exigente: prova o
top-up funcionando a partir de saldo zero, não só de um saldo Free
pré-existente), checkout real pro plano Pro completado no navegador com o
cartão de teste `4242 4242 4242 4242` via a UI real do Stripe Checkout.
Confirmado direto no Postgres (não só no redirect de sucesso):
`tenants.plan_id = 'pro'`, `stripe_customer_id` preenchido,
`tenant_credits` pulou de `0/0/0` pra `20/60/5` (limites do Pro)
**imediatamente**, 3 linhas novas em `credit_ledger` com `reason='grant'` e
os deltas corretos, e a linha de auditoria do top-up com
`{granted: 3, skipped: 0, failed: 0}`. Sweep manual disparado em seguida
confirmou idempotência: `{granted: 0, skipped: 42, failed: 0}` (39 tenants
reais + os 3 tipos deste tenant, nenhuma linha duplicada). Cancelamento
testado também (`stripe subscriptions cancel --confirm`): webhook
`customer.subscription.deleted` recebido e processado, tenant revertido pra
`plan_id = 'free'` — comportamento pré-existente confirmado ainda intacto
depois da mudança. Tenant de teste e admin temporário limpos depois (admin
não pôde ser removido pelo mesmo motivo de FK em `audit_log` já documentado
nesta sessão — mantido, inofensivo)

**Confirmado explicitamente fora de escopo (nesta rodada específica):**
nenhuma rota de compra avulsa de créditos (`reason='purchase'`) foi tocada
aqui — ~~implementada e testada numa rodada seguinte da mesma data, ver
entrada "reconciliação + Fase 5 fechada: compra avulsa de créditos" mais
acima nesta seção~~.

**Onde parou / próximo passo imediato (histórico — ver entrada mais recente
no topo da seção 7 para o estado atual):** a torneira de crédito mensal
estava ligada de ponta a ponta — signup semeia a linha, o sweep mensal a
preenche, upgrade via Stripe faz top-up imediato, o consumo debita, tudo
auditado e testado com o Stripe CLI real (não só em teoria). Único item que
faltava pra Fase 5 fechar era a compra avulsa — **concluído em seguida na
mesma data** (ver acima). Fase 6 (faturas reais) continua sem começar.
Mudança de plano no meio do ciclo (upgrade/downgrade) e como isso afeta um
grant já concedido seguem deliberadamente fora de escopo — na prática já
ficaram razoavelmente bem resolvidos por acidente (a trava de `delta <= 0`
cobre o downgrade, o top-up cobre o upgrade), mas isso não foi verificado
como um requisito formal, só como consequência do desenho.

---

**O que foi feito (2026-07-22 — Fase 4: Stripe, assinatura real + webhook,
validada de ponta a ponta):**
- Usuário forneceu chaves de teste reais (`pk_test_`/`sk_test_`/`rk_test_`)
  coladas direto no chat — salvas imediatamente em `.env` (nunca commitado;
  `.env.example` só ganhou os placeholders) e repassadas pelo
  `docker-compose.yml` pro container do backend. `STRIPE_SECRET_KEY`/
  `STRIPE_PUBLISHABLE_KEY`/`STRIPE_WEBHOOK_SECRET` são `optional()` em
  `config.ts` (mesmo padrão do `PLATFORM_COPILOT_API_KEY`) — o app continua
  subindo sem elas, as rotas de billing é que degradam com erro claro
- Pacote `stripe` (npm) adicionado ao backend, imagem reconstruída
  (`docker compose build backend` — só editar `package.json` não basta,
  `node_modules` não é bind-mounted)
- `services/billing/stripeClient.ts`: singleton preguiçoso do SDK
  (`getStripe()`, lança `StripeNotConfiguredError` se a chave não existir) +
  `getOrCreateStripePrice(plan)` — cria Product/Price reais na primeira
  tentativa de checkout de cada plano pago e persiste o id em
  `plans.stripe_price_id` (migration `020` já previa a coluna); reaproveitado
  depois, não recriado
- `routes/subscription.ts` ganhou `POST /subscription/checkout`: plano
  grátis (`priceCents === 0`) troca direto, sem Stripe; plano pago cria (ou
  reaproveita) o Stripe Customer do tenant, monta uma Checkout Session real
  (`mode: subscription`) com `metadata.tenantId`/`planId` tanto na sessão
  quanto em `subscription_data.metadata` — é assim que o webhook resolve o
  tenant depois, sem precisar de lookup reverso por `stripe_customer_id`
- `routes/stripeWebhook.ts` (novo): `POST /subscription/stripe/webhook`,
  público (fora dos blocos `requireAuth`/`requireAdmin`), registrado como
  plugin Fastify próprio com `addContentTypeParser` sobrescrito só nesse
  encapsulamento (`parseAs: "buffer"`) — necessário pra
  `stripe.webhooks.constructEvent()` verificar a assinatura com o corpo cru;
  não afeta o parser JSON usado por nenhuma outra rota. Trata
  `checkout.session.completed` (ativa o plano), `customer.subscription.
  created`/`updated` (sincroniza plano/status — suspende em
  `past_due`/`unpaid`/`incomplete_expired`, reativa em `active`/`trialing`)
  e `customer.subscription.deleted` (reverte pro plano mais barato). Toda
  transição grava em `audit_log` com `actor_admin_user_id: null` e ação
  prefixada `stripe.` (convenção já prevista desde a migration `025`)
- Frontend: `SubscriptionPage.tsx` — "Selecionar" plano agora chama
  `POST /subscription/checkout`; se vier `checkoutUrl`, redireciona o
  navegador de verdade pro Stripe Checkout hospedado; se vier `null` (plano
  grátis), só recarrega. Banner de sucesso/cancelamento lendo
  `?checkout=success|cancelled` da URL de volta
- **Stripe CLI instalado nesta sessão** (`winget install Stripe.StripeCli`,
  com confirmação do usuário antes de instalar) — não existia na máquina
- **Gotcha de rede descoberto e resolvido**: `stripe listen` roda como
  processo nativo do Windows, fora da rede Docker — o resolvedor DNS do Go
  (usado pelo Stripe CLI) **não** trata `*.localhost` como `127.0.0.1` do
  jeito que os navegadores tratam (isso é um comportamento hardcoded do
  Chromium/WHATWG, não do sistema operacional). Resultado: toda tentativa
  de encaminhar webhook falhava com `dial tcp: lookup twinai.localhost: no
  such host`, apesar do checkout funcionar normalmente no navegador — a
  fonte real do dado (verificar o banco, não só o redirect de sucesso) foi
  o que expôs isso. Corrigido com uma linha no hosts file do Windows
  (`127.0.0.1 twinai.localhost`), adicionada pelo usuário manualmente (exige
  admin, minha sessão não tinha privilégio) — exatamente o fallback que
  `docs/setup.md` já antecipava ("só fica como fallback documentado, caso
  `*.localhost` não resolva em algum ambiente específico"), só que agora
  para uma ferramenta de linha de comando, não um navegador
- **Achado de tooling, sem impacto no resultado**: a página de Checkout do
  Stripe expõe um checkbox de autodeclaração ("I am an AI agent acting on
  behalf of someone else") posicionado fora da árvore do formulário
  submetido e fisicamente fora da tela (`getBoundingClientRect` retornou
  x/y negativos na casa de -10000px) — parece pensado pra ser operado via
  API de acessibilidade dedicada, não clique/tab normal. Tentei clicar por
  ref, `scroll_to`, e Tab+Space; nenhum alcançou o elemento real. Não bloqueei
  o teste por causa disso (não faz parte do formulário de pagamento em si),
  mas fica registrado: não consegui marcá-lo, e a ferramenta de automação
  usada aqui não parece ter um jeito de alcançá-lo
- **Testado de ponta a ponta de verdade, duas vezes** (a primeira rodada
  mostrou um falso positivo — plano mudou instantaneamente sem checkout
  real, porque o frontend (Vite) estava servindo bundle antigo pelo mesmo
  motivo do bind-mount do `tsx watch`; `docker compose restart frontend`
  resolveu):
  1. Tenant real via `/auth/signup`, clique em "Selecionar" no Pro → rede
     confirmada indo pra `POST /api/subscription/checkout` (não mais o
     antigo `PUT /subscription/plan`) → redirect real pro
     `checkout.stripe.com` → cartão de teste `4242 4242 4242 4242`
     preenchido e submetido pela UI de verdade → redirect de volta com
     `?checkout=success`
  2. **Não aceito o redirect como prova** — conferido direto no Postgres:
     `tenants.plan_id = 'pro'`, `stripe_customer_id` preenchido, `status =
     'active'`; `audit_log` com as 3 transições reais
     (`stripe.checkout_completed` → `stripe.subscription.incomplete` →
     `stripe.subscription.active`), sem nenhuma chave/segredo gravado
  3. Cancelamento testado também: `stripe subscriptions cancel` via CLI →
     webhook `customer.subscription.deleted` recebido (`200`) → tenant
     revertido pra `plan_id = 'free'` automaticamente, `audit_log` com
     `stripe.subscription_canceled`
- Tenant de teste e sessão limpos do banco depois; `stripe listen` encerrado.
  `plans.pro.stripe_price_id` **não** foi limpo de propósito — é o Product/
  Price real criado no Stripe de teste, deve ser reaproveitado nas próximas
  assinaturas do plano Pro, não é dado de teste descartável

---

**O que foi feito (2026-07-21 — rebrand eckko.ai: auditorias, Fase A,
enforcement de plano; itens de sessão paralela mesclados por pedido do
usuário):**

*Nesta conversa, feito e verificado diretamente:*
- **Auditoria "mockup vs. código real" #1** (dois HTMLs de landing/painel
  vindos de outra ferramenta, estética "neon tech"): confirmado real —
  nav (Minha assinatura/Criar vídeo/Conteúdo/Base de conhecimento/Painel/
  Configurações), wizard de 5 passos (`CreateVideoPage.tsx`: Configurar
  avatar → Roteiro → Recursos → Duração → Gerar), troca de cenário/traje via
  prompt, avatares ilimitados, toggle PT-BR/EN. Inventado e descartado:
  "Sincronia Labial"/"Análise de Voz" como ações, API pública de geração,
  "dados biométricos"/"captura neural"/"99,8% de precisão"/"2–5 min de
  vídeo" (zero origem no código), duração "30s–5min" (real: 15/30/60s fixos,
  `DurationStep.tsx`)
- **Fase A (preview estático) gerada e verificada** em servidor local
  (`npx serve`, nunca tocou o app real): dois arquivos em
  `previews/eckko-rebrand/` (landing + painel), claro/escuro conferidos,
  `#9CEE06` como único verde (sem mais divergência de mockups anteriores),
  roxo/ciano com função real (mapeados a `provider_avatar_id`→"Avatar
  treinado" e `voice_id`→"Voz clonada" nos cards de avatar, não decorativos),
  Hanken Grotesk + Inter via Google Fonts (preview only — real será
  `@fontsource`), claims falsos removidos, preços/planos puxados
  literalmente de `plans.ts`, sem imagens externas nem e-mail hardcoded
- **Hero da landing ajustado**: headline trocado para "Crie vídeos com o seu
  avatar digital em minutos!"; foto do hero (rosto + rede neural sobreposta)
  veio de `Downloads/LANDING PAGE PRÉVIA ILUSTRATIVA.png` (não anexada
  diretamente no chat — localizada seguindo a convenção da seção 1) com 3
  badges de claim falso embutidos na própria imagem ("Sincronização Labial
  100%", "Análise Biométrica", "Renderização em Tempo Real"). Removidos por
  **corte de pixel simples** (medido: rosto/rede neural nunca passam de
  x≈800 de 1100px; badges começam em x≈810–870 — corte em x=800 remove os 3
  sem sobrar nenhuma borda, sem blur/inpainting, sem artefato visual).
  Original em `frontend/public/brand/hero-reference-original.png`, editada em
  `frontend/public/brand/hero-visual-edited.png` (800×614, era 1100×614 —
  mudança de proporção sinalizada como escolha deliberada, não defeito)
- **Levantamento de billing/créditos** (só leitura, mesmo espírito de
  auditoria): `plans.ts` é array hardcoded (free/pro/business, preços fixos,
  comentário do autor já avisando "Phase 6 (Stripe) will replace this");
  billing 100% inexistente (`payment_method_masked` sem validação,
  `/subscription/invoices` sempre `[]`, zero gateway); créditos não existem
  no schema, "uso do mês" é `COUNT(*) FROM videos` ao vivo; 13 tenants reais
  no banco, todos dev/teste, nada a migrar
- **Gap de arquitetura confirmado**: decisão de negócio de migrar BYOK→
  chave-da-plataforma (ver seção 1) ainda não implementada — código continua
  100% BYOK
- **Enforcement do limite de plano implementado e testado** (ver seção 3
  para o detalhe técnico) — tenant real via `/auth/signup`, 5 vídeos
  inseridos simulando uso do mês, 6ª chamada via API real (Traefik) →
  `403 plan_limit_reached` confirmado; tenant sem uso não é bloqueado
  (sem falso positivo). Tenants de teste limpos depois
- **Gotcha operacional confirmado ao vivo**: `tsx watch` não recarregou
  sozinho a edição em `routes/videos.ts` via bind mount — precisou
  `docker compose restart backend` pra pegar a mudança. Vale checar sempre
  que uma edição de rota parecer "não ter efeito" antes de assumir bug de
  lógica

*Mesclado de sessão paralela (outra conta), a pedido explícito do usuário —
não verificado diretamente nesta conversa:*
- Decisão de negócio BYOK→chave-da-plataforma + cobrança híbrida
  (assinatura+créditos): **confirmada pelo usuário nesta conversa** como
  decisão final (não é mais só proposta)
- ~~Configurações vira fundação de painel admin (papel `admin|tenant`,
  roteamento pós-login, `/settings` desprotegido do menu mas não deletado) —
  decidido, Fase B correspondente ainda não iniciada~~ — **construído nesta
  mesma sessão, com desenho diferente do planejado aqui: identidade de admin
  separada (`admin_users`), não uma role no mesmo usuário do tenant.** Ver
  entrada "Continuação desta mesma sessão" logo abaixo para o que existe de
  verdade
- Botão de auto-login de dev (`DEV_TEST_EMAIL`/`DEV_TEST_PASSWORD`, aviso
  "Apenas para desenvolvimento e demonstração" visível só em
  `NODE_ENV=development`) — decisão tomada de construir; **status de
  implementação não confirmado**, precisa checagem direta no código antes de
  assumir que existe
- Nota de segurança: a senha real de `manfredhaut@gmail.com` foi digitada em
  texto no chat em algum ponto — recomendado trocá-la e, daqui em diante,
  autenticar direto no Browser pane em vez de escrever credenciais em prompt
- Referência a um arquivo `RESUMO_SESSAO_TWINAI_v2.md` (pipeline validado
  com dados reais Gemini→ElevenLabs→HeyGen, tratamento de áudio/imagem) —
  **não encontrado neste repositório** (`Glob` não retornou nada); pode viver
  fora do repo ou ter se perdido entre sessões, mesmo padrão de risco já
  documentado na seção 1 sobre assets não salvos em disco

**Continuação desta mesma sessão (mesmo dia, 2026-07-21/22 — fundação real do
painel admin + BYOK trancado para o tenant):** ao contrário do que o bloco
mesclado acima registrava ("Fase B ainda não iniciada", papel `admin|tenant`
na mesma identidade de usuário), a fundação do painel admin foi **construída
e verificada nesta sessão**, com um desenho diferente do inicialmente
planejado — identidade de admin **completamente separada** de `users`
(tabela própria `admin_users`, migration `018_admin_users.sql`, sessão
própria via `req.session.adminUserId`), não uma role no mesmo usuário do
tenant:
- `backend/src/routes/adminAuth.ts` (`POST /admin/login`, `/admin/logout`,
  `GET /admin/me`) + `middleware/requireAdmin.ts` (401 se
  `session.adminUserId` ausente) + `services/passwords.ts` reaproveitado
- `backend/src/routes/adminPanel.ts` — cross-tenant, atrás de `requireAdmin`:
  `GET /admin/tenants` (lista + providers conectados), `GET
  /admin/tenants/:id` (detalhe + credenciais), `PUT
  /admin/tenants/:id/credentials/:provider` e `PUT
  /admin/tenants/:id/storage-provider` — as duas últimas gravando em
  `audit_log` (migration `019_audit_log.sql`: `before`/`after` como jsonb,
  nunca a chave em si) via `services/auditLog.ts`
- Frontend: `pages/AdminPanel/AdminPanelPage.tsx` + `adminAuth/AdminAuthContext.tsx`,
  rota `/admin/*` em `App.tsx`, independente do `ProtectedRoute` de tenant
- **Passos 3 e 4 (esta conversa, verificados ao vivo):**
  - Passo 3 — as rotas BYOK/storage do **tenant** (`routes/credentials.ts`
    PUT `/credentials/:provider` e POST `/credentials/:provider/test`;
    `routes/storage.ts` PUT `/storage-provider`) agora respondem `403
    managed_by_platform` com mensagem "Gerenciado pela plataforma..." — GET
    continua liberado (o tenant ainda vê o estado atual). Frontend
    (`CredentialCard.tsx`, `StorageProviderCard.tsx`) virou somente-leitura:
    sem botões Salvar/Testar conexão, select e campo de chave sempre
    `disabled`, com a mesma mensagem abaixo do campo. Verificado com curl
    (tenant real via `/auth/signup`, 403 confirmado nas 3 rotas de escrita,
    200 confirmado nas 2 rotas de leitura) e no navegador (tela renderiza
    somente-leitura, sem erro de console)
  - Passo 4 — antes de deletar, rodado grep no repo inteiro por
    `X-Admin-Token`/`admin/tenants`: nenhum caller vivo fora de documentação
    (`docs/setup.md`, este arquivo) e do próprio `admin.ts`; sem `.github/`,
    sem `scripts/` no projeto. `backend/src/routes/admin.ts` (rota antiga
    `POST /admin/tenants` com header `X-Admin-Token`) **deletado**, junto com
    o registro em `app.ts`, `config.adminToken`, `ADMIN_TOKEN` em
    `.env`/`.env.example`/`docker-compose.yml`. `docs/setup.md` e
    `docs/screens/configuracoes.md` atualizados (o segundo alimenta o
    copiloto in-app via `loadDocsContent()` — corrigido pra não instruir o
    tenant a clicar em botões que não existem mais). Confirmado com curl que
    `POST /admin/tenants` agora dá `404`. Typecheck backend (só o erro
    pré-existente do `PgSessionStore`) e frontend limpos
- Tenant de teste (`tenant403test`) criado para a verificação e limpo do
  banco depois (`api_credentials`/`users`/`tenants` deletados)

**Correção (2026-07-22): a documentação acima ficou um passo atrás do código
real.** `adminPanel.ts`/`AdminPanelPage.tsx` hoje não têm só as 4 rotas
BYOK/storage descritas acima — o track de billing (ver entrada "painel
admin: billing, créditos e medição de consumo, Fases 0-3" nesta mesma
seção) acrescentou ao mesmo arquivo/página: `GET /admin/tenants/:id/usage`
(breakdown de custo por provedor), `PUT /admin/tenants/:id/status`
(suspender/reativar) e `GET`/`POST`/`PUT /admin/plans` (CRUD de planos), com
as abas correspondentes no painel. **O plano de centralização de
configuração (admin_users, requireAdmin, audit_log, rotas de leitura/escrita
de BYOK e storage) está 100% concluído e verificado — sem pendência de
código.**

**Correção da Seção 3 (mesma sessão, logo em seguida — achado incidental, não
uma implementação nova):** ao verificar o dropdown de vendor em Configurações
durante o passo 3 acima, percebi que `services/providers/avatarProvider.ts`
e `voiceProvider.ts` — que a Seção 3 desde 2026-07-16 listava como stub —
já têm integração real no código: HeyGen e D-ID completos (treino de avatar,
geração de vídeo, polling de status, teste de conexão) em `avatarProvider.ts`,
ElevenLabs completo (clonagem de voz, texto-pra-fala, teste de conexão) em
`voiceProvider.ts`, e `routes/videos.ts`/`routes/avatars.ts` já chamam essas
funções de verdade (sem `simulateProgress`/placeholder). **Não sei precisar
em qual sessão isso foi construído** — não há nenhuma entrada anterior neste
arquivo registrando esse trabalho, então ficou sem documentar até agora
(mesmo padrão de risco da correção do `/uploads` em 2026-07-18: código real
avançou sem o arquivo acompanhar). Corrigido: Seção 3 (bullets movidos de
"ainda não implementado" pra "implementado", resumo final da seção e
comentário da árvore de pastas na Seção 4). `embeddingProvider.ts` continua
sendo o único dos 4 provedores de IA de domínio ainda stub — confirmado
lendo o arquivo, não mudou. ~~Nenhuma chave real de HeyGen/D-ID/ElevenLabs foi
testada em nenhuma sessão registrada até aqui~~ — **correção (2026-07-22):
falso, ver Seção 3.** O tenant `dev-c77a5b` tem credenciais HeyGen/
ElevenLabs reais conectadas e vídeos gerados de verdade em 2026-07-17, um
dia sem nenhuma entrada neste arquivo (só os `// ASSUMPTION` no
código, sobre contratos de endpoint não confirmados contra uma resposta
real) — isso continua em aberto, só a *existência* da integração real que
estava desatualizada aqui

**Fase B do rebrand eckko.ai — aplicada e verificada (mesma sessão, logo em
seguida):** com a Fase A aprovada pelo usuário (headline, paleta, hero, logo
real já confirmados — ver correção acima da nota desatualizada em "Onde
parou"), planejado via Plan Mode (agente Plan validou o mapeamento de cores
lendo `global.css` de verdade, não supondo) e implementado:
- `frontend/package.json` ganhou `@fontsource/inter` e
  `@fontsource/hanken-grotesk`; `main.tsx` importa os pesos 400/500/600/700
  (Inter) e 500/600/700/800 (Hanken Grotesk) antes de `theme.css`/`global.css`
  — self-hosted, sem CDN do Google Fonts (confirmado no Network tab: zero
  request pra `fonts.googleapis.com`, todos os `.woff2` servidos por
  `/node_modules/@fontsource/...` via Vite)
- `theme.css` reescrito com a paleta da prévia aprovada: `--color-primary`
  vira `#9CEE06`, `--color-secondary`/`--color-tertiary` viram os tokens
  `--warning`/`--danger` da prévia (renomeação 1:1 confirmada lendo
  `global.css` — `--color-secondary` já significava "processing/queued" e
  `--color-tertiary` já significava "error" antes da troca, os tokens novos
  têm o mesmo significado), luz e escuro atualizados nos 3 blocos que já
  existiam (`:root`, `@media prefers-color-scheme`, overrides manuais). Duas
  variáveis novas e fixas `--color-accent-avatar`/`--color-accent-voice`
  (roxo/ciano) pra um uso real: dois chips novos em
  `AvatarSetupStep.tsx` ("Avatar treinado"/"Voz clonada" vs. "pendente"),
  condicionados a `provider_avatar_id`/`voice_id` do avatar — testado ao
  vivo inserindo um avatar com `provider_avatar_id` setado e outro sem, os
  dois estados renderizaram certo (chip roxo sólido vs. cinza "pendente")
- Novo `--font-display` (Hanken Grotesk) aplicado a `h1,h2,h3` em
  `global.css` (regra nova, aditiva); `--font-sans` (Inter) continua sendo o
  texto de corpo, sem renomear a variável (só 3 call sites, nenhum de
  heading)
- Sidebar (`AppShell.tsx`): o quadrado colorido (`.brand-mark`) virou a
  imagem real do logo (`logo-eckko-transparent.png`) dentro de um novo chip
  CSS (`.sidebar-logo-chip`, fundo verde fixo — mesmo padrão que a própria
  prévia usa pro wordmark, resolve a legibilidade do texto preto do PNG no
  fundo escuro do dark mode). `.brand-mark` em si não foi tocado —
  Login/Signup/AdminLogin/Landing continuam com o quadrado (fora do escopo
  pedido, só a sidebar troca pra imagem)
- "Configurações" removida do array `navItems` de `AppShell.tsx` — a rota
  `/settings` continua registrada em `App.tsx` e acessível por URL direta
  (testado ao vivo: nav não mostra mais o link, mas `/settings` carrega
  normal, com o estado somente-leitura do passo 3 anterior)
- `common.appName` ("TWINAI"→"eckko.ai") e `settings.storageProviderDesc`
  ("hospedados pela TWINAI"→"hospedados pela eckko.ai") corrigidos nos dois
  locales; `frontend/index.html` `<title>` também
- **Verificado ponta a ponta no navegador** (tenant de teste `fasebtest` via
  `/auth/signup`, limpo depois): título da aba "eckko.ai", paleta nova em
  claro e escuro (`getComputedStyle(document.body).backgroundColor` bateu
  com o hex exato da prévia), fontes carregando localmente, sidebar com logo
  legível, nav sem Configurações mas rota ainda acessível, texto do storage
  corrigido, chips avatar/voz funcionando nos dois estados. Typecheck
  frontend limpo

**Onde parou / próximo passo imediato:**
- ~~Pendência aberta: trocar o wordmark "eckko.ai" recriado em fonte pela
  arte real do logo — pedido já enviado, resultado ainda não conferido~~ —
  **desatualizado, corrigido nesta sessão (confirmado pelo usuário): a arte
  na prévia já É a real** (`logo-eckko-original.png` / `logo-eckko-
  transparent.png` em `frontend/public/brand/`), não um placeholder em
  fonte — essa troca já tinha sido feita numa sessão anterior, só a nota
  aqui não tinha acompanhado (mesmo padrão de risco do achado do
  `/uploads/*` em 2026-07-18 e dos providers avatar/voz logo acima: código
  real avança sem o arquivo acompanhar)
- ~~Fase A aprovada pelo usuário nesta sessão — plano completo da Fase B a
  ser detalhado e proposto antes de qualquer código~~ — **Fase B também já
  foi planejada (Plan Mode) e implementada e verificada nesta mesma sessão**
  (tema real, `@fontsource`, Configurações escondida do menu do cliente,
  texto "hospedados pela TWINAI" corrigido, chips avatar/voz novos). Ver
  entrada "Fase B do rebrand eckko.ai" logo acima para o detalhe técnico
  completo. Pendências que sobraram, não bloqueantes: ~~nenhuma chave real
  testada com sucesso ainda~~ — **correção (2026-07-22): falso pro avatar,
  ver Seção 3** (tenant `dev-c77a5b` tem HeyGen/ElevenLabs reais e vídeos
  gerados de verdade em 2026-07-17); o rename
  de identificadores técnicos (`twinai`→`eckkoai` em package.json/docker/env
  vars) é decisão já travada mas deliberadamente fora do escopo desta rodada
- ~~Painel admin completo (billing Stripe, modelo de créditos, migração
  BYOK→plataforma) deliberadamente adiado para planejamento dedicado próprio;
  o que existe hoje é só leitura/edição de tenants existentes, sem criação de
  tenant nem nenhuma tela de billing~~ — **superado em 2026-07-22: entregue
  pelos dois tracks.** Fundação do painel (admin_users, requireAdmin,
  audit_log, rotas BYOK/storage) 100% concluída; track de billing (Fases 0-3:
  schema, medição de custo, planos editáveis, suspensão de tenant) também
  concluído e verificado — ver "Onde parou (mais atual)" logo acima.
  ~~Único item de verdade ainda pendente no projeto: Fase 4 (Stripe:
  assinatura real + webhook), pausada aguardando o usuário fornecer
  credenciais de teste~~ — **também concluída em 2026-07-22**, ver entrada
  própria "Fase 4 — Stripe" nesta mesma seção.

**O que foi feito (2026-07-18 — auditoria via `/graphify` + correção de
achado desatualizado sobre roteamento `/uploads/*`):**
- Rodado `/graphify .` pela primeira vez no projeto (não havia
  `graphify-out/` ainda): grafo de conhecimento com 1175 nós / 1876 edges /
  93 comunidades a partir de 133 arquivos (120 código + 13 docs), saída em
  `graphify-out/` (`graph.html`, `GRAPH_REPORT.md`, `graph.json`) — não
  versionado, é artefato local de navegação do projeto
- A extração sinalizou como "surpresa" (AMBIGUOUS) uma contradição entre o
  que este arquivo registrava (`traefik/dynamic.yml` não roteia
  `/uploads/*`, pendência aberta desde a sessão de Fase 5 — parte 2) e o
  conteúdo real do arquivo (que já tem um router `uploads` dedicado)
- Investigado a fundo: lidos `traefik/dynamic.yml`, `backend/src/app.ts` e
  `backend/src/services/storage.ts` — a cadeia `saveUpload()` → `@fastify/static`
  (`prefix: "/uploads/"`) → router `uploads` do Traefik (`PathPrefix('/uploads')`,
  sem `stripPrefix`, `Host` igual aos outros routers) está completa e
  coerente. **Verificado ao vivo** com
  `curl -H "Host: twinai.localhost" http://localhost:8090/uploads/<tenant>/<arquivo>`
  contra os containers já rodando (`docker compose ps` — todos `Up`) → `HTTP
  200`, `content-type: image/png` correto
- Pela data de modificação dos arquivos, o router `uploads` já existia desde
  a mesma edição que trouxe o roteamento por `Host` da Fase 5 (mesmo padrão
  `Host(...) || HostRegexp(...)` que `backend`/`frontend`) — ou seja, **o
  "achado" registrado na sessão de Fase 5 — parte 2 provavelmente testou sem
  o header `Host` correto** (os routers passaram a exigir `Host` na própria
  Fase 5) e concluiu erroneamente que o roteamento faltava
- Corrigidas as três menções desatualizadas neste arquivo (seção 3, entrada
  da Fase 5 — parte 2 e "Bloqueios ou pendências" — todas na seção 7), sem
  alterar nenhum código

**O que foi feito (fora do roadmap de fases — providers genuinely
selectable, script generation real com Gemini):**
- Auditoria dos 3 cards de provedor BYOK em Configurações confirmou o
  problema relatado: nenhum tinha seleção real de vendor, só um nome de
  exemplo no texto de descrição (`"ex.: HeyGen ou D-ID"` etc.) com um único
  campo de chave por trás. `scriptProvider.ts` era 100% stub — nem chegava a
  ler a credencial salva
- Migration `014_credential_vendor.sql`: `api_credentials` ganhou coluna
  `vendor`. Catálogo de vendors por categoria em novo
  `services/providers/vendorCatalog.ts` (`script`: `anthropic`/`gemini`;
  `avatar`/`voice`: só `"stub"`, sem fingir suportar HeyGen/D-ID/ElevenLabs)
- `scriptProvider.ts` reescrito: `generateScriptAnthropic`/`generateScriptGemini`
  reais (fetch direto, mesmo padrão de `copilotProvider.ts`), despachadas por
  `vendor`. `routes/scripts.ts` agora busca a credencial do tenant e decripta
  antes de chamar — sem credencial salva, erro claro em vez de texto stub
- **Achado importante durante o planejamento:** o copiloto in-app reaproveita
  a mesma linha de credencial `script` pra chamar a Anthropic Messages API
  direto, fora do `scriptProvider.ts`. Se não fosse ajustado, trocar o vendor
  pra Gemini quebraria o copiloto silenciosamente (chave Gemini indo pro
  endpoint da Anthropic). Corrigido: `copilotProvider.ts` ganhou
  `askCopilotGemini` e um dispatcher por `vendor`; `routes/copilot.ts` passou
  a ler e repassar o `vendor` da credencial. O copiloto público
  (`routes/public.ts`, chave da própria plataforma) não muda — decisão de
  escopo explícita, não é uma seleção do tenant
- `routes/credentials.ts`: `PUT /credentials/:provider` valida e persiste
  `vendor`; `POST /credentials/:provider/test` para `script` agora faz uma
  chamada real mínima contra o vendor selecionado (antes só checava se a
  chave existia)
- Frontend: `CredentialCard.tsx` ganhou um `<select>` de vendor de verdade
  (novo `providerVendors.ts`, espelha o catálogo do backend); trocar o vendor
  atualiza label/placeholder/texto de ajuda do campo de chave. Para
  avatar/voice, o select mostra 1 opção só, rotulada honestamente ("Stub
  interno — nenhum provedor real conectado ainda"), sem esconder o dropdown
- **Verificado ponta a ponta no navegador** (tenant de teste
  `providertest.twinai.localhost`, `docker compose up -d --build backend
  frontend`, migration `014` aplicada no boot): dropdown troca
  label/placeholder da chave; salvar credencial persiste o `vendor`
  corretamente após reload (bug corrigido no meio da sessão: o `useState`
  inicial do vendor não reagia à credencial chegando assíncrona da API — via
  `useEffect`); `POST /credentials/script/test` E `POST /scripts/generate`
  (o mesmo endpoint que o botão "Gerar roteiro" usa) confirmados, via chave
  inválida em cada vendor, batendo de verdade em `api.anthropic.com`
  (`401 invalid x-api-key`) e em `generativelanguage.googleapis.com`
  (`400 API key not valid`) — prova que o roteamento por vendor é real, não
  um fallback silencioso pra Anthropic
- **Não verificado nesta sessão:** uma geração de roteiro *bem-sucedida* com
  chave Gemini real (não tenho uma chave própria; o usuário optou por não
  fornecer uma nesta sessão) — só a prova de roteamento acima. Também não foi
  possível avançar o wizard de Criar Vídeo além do passo 1 (Configurar
  avatar): criar um avatar exige captura de foto/vídeo de referência via
  câmera, bloqueada neste ambiente de browser — mesma limitação já registrada
  em sessão anterior (ver seção 7, entrada de Fase 4).
  `avatarProvider.ts`/`voiceProvider.ts` foram lidos e confirmados **sem
  nenhuma mudança** nesta sessão — continuam 100% stub (`trainAvatar`/
  `generateVideo` retornam IDs fake tipo `stub-avatar-...`/`stub-job-...`, e
  `routes/videos.ts`/`simulateProgress()` segue fingindo o vídeo pronto com
  `PLACEHOLDER_OUTPUT_URL`, sem nenhuma chamada real a HeyGen/D-ID)
- Typecheck backend + frontend limpo (só o mesmo erro pré-existente e não
  relacionado do `PgSessionStore`/`@fastify/session`)

**O que foi feito (Fase 5 — parte 2: landing pública, copiloto público,
WhatsApp, StorageProvider):**
- `backend/src/services/providers/storageProvider.ts`: interface
  `StorageProvider` + duas implementações stub (`drive`, `platform_hosted`),
  ambas delegando pra `saveToLocalDisk` até existir OAuth do Drive/credencial
  S3 real — mesmo padrão de `avatarProvider.ts`/`voiceProvider.ts`.
  `services/storage.ts` virou um wrapper fino (`saveUpload()` mantém a
  assinatura; os 4 call sites não mudaram) que consulta
  `tenants.storage_provider` e delega. Migração `013_storage_provider.sql`
  (default `'drive'`). Novo `routes/storage.ts`
  (`GET`/`PUT /storage-provider`), novo `StorageProviderCard.tsx` em
  Configurações (chips, mesmo padrão visual de `DurationStep.tsx`)
- `backend/src/routes/public.ts` (registrado fora do bloco `requireAuth`):
  `GET /public/plans` (reaproveita `plans.ts`) e
  `POST /public/copilot/messages` — copiloto público real, usando
  `PLATFORM_COPILOT_API_KEY` (não BYOK de tenant) + `askCopilot()`/
  `loadDocsContent()` já existentes, com `audience: "public"` mudando o
  system prompt (`copilotProvider.ts`), sem persistência, e um rate limiter
  em memória (10 msgs/10min por IP) inline no próprio arquivo
- Landing page pública: `frontend/src/pages/Landing/LandingPage.tsx` (hero,
  problema→solução, como funciona, vitrine de recursos com "agente de perfil
  de conteúdo" marcado "em breve", pricing puxando `GET /public/plans` de
  verdade com a diferenciação de storage por plano, FAQ, CTA final, rodapé
  com WhatsApp) + `PublicCopilotWidget.tsx` (chat flutuante próprio, sem
  `CopilotContext`, reaproveitando as classes `.copilot-drawer` já existentes)
- Roteamento condicional: `frontend/src/publicConfig.ts` expõe `BASE_DOMAIN`/
  `WHATSAPP_NUMBER` via `vite.config.ts` `define` (mesmo padrão de
  `domainConfig.ts`). `App.tsx` só registra a rota `/` → `LandingPage` quando
  `isRootDomain()` é verdadeiro; em qualquer subdomínio de tenant essa rota
  nem existe, então o `/*` protegido de sempre continua valendo — **verificado
  nos dois sentidos**: `acme.twinai.localhost/` (tenant existente, sem
  sessão) mostra o Login como antes, e um tenant novo logado
  (`storagecheck.twinai.localhost/`) mostra o Dashboard, não a landing
- Link "Fale conosco": `WHATSAPP_NUMBER` (env var) monta o `href` do
  `wa.me` com mensagem pré-preenchida; só renderiza se a env var não estiver
  vazia
- Correção pontual encontrada de passagem: `common.appName` nos locales
  (`en.json`/`pt-BR.json`) e o `<title>` de `frontend/index.html` ainda
  diziam "Video Avatar Studio" (nunca tinham sido atualizados pro rename pra
  TWINAI já refletido neste arquivo) — corrigidos nos dois locales e no
  `<title>`, já que a landing expõe esse nome com destaque
- **Verificado ponta a ponta no navegador:** as 7 seções da landing
  renderizando com dados reais (`GET /public/plans` batendo com
  `backend/src/plans.ts`); WhatsApp `href` inspecionado
  (`https://wa.me/<numero>?text=...`); copiloto público testado enviando uma
  mensagem de verdade — sem `PLATFORM_COPILOT_API_KEY` configurada
  localmente, mostrou a mensagem de "não configurado" corretamente (mesmo
  tratamento gracioso que o copiloto autenticado já tinha); `StorageProviderCard`
  alternado, persistência confirmada após reload; upload real via
  `POST /reference-images` confirmado gravando no disco do container
  (`docker exec ... ls /app/uploads/...`) através da nova indireção do
  `StorageProvider`
- ~~Achado (fora do escopo desta sessão, não corrigido aqui): a URL do
  arquivo devolvida pela API não carrega no navegador através da Traefik
  (porta 8090) — só `/api/*` estaria roteado pro backend~~ — **corrigido em
  2026-07-18: esse achado estava errado.** `traefik/dynamic.yml` já tinha
  (mesmo nesta sessão) um router `uploads` dedicado — o teste original
  provavelmente foi feito sem o header `Host` que os routers exigem desde a
  reescrita de roteamento por Host da Fase 5, o que faria a requisição cair
  no fallback e parecer quebrada. Ver seção 3 e a entrada de 2026-07-18 na
  seção 7 para a investigação e a verificação ao vivo (`curl` com `Host`
  correto → `HTTP 200`)

**O que foi feito (Fase 5 — cadastro mínimo + subdomínio por tenant):**
- `backend/src/domainConfig.ts`: fonte única de verdade para `BASE_DOMAIN`
  (mockado como `twinai.localhost` — trocado de `twinai.local` logo em
  seguida, ver nota abaixo) e `DNS_PROVIDER` (`pending`) — todo o resto do
  código lê daqui, nunca hardcoded
- `POST /auth/signup` (público, só email+senha): gera slug único
  (`services/slug.ts`), cria tenant+credenciais+usuário admin, autentica a
  sessão, devolve o subdomínio do tenant
- **Mudança de comportamento importante:** o cookie de sessão agora tem
  `Domain=.twinai.localhost` (compartilhado entre domínio raiz e
  subdomínios) — **`http://localhost:8090` (sem sufixo) não mantém mais
  sessão**. Acesso local usa `twinai.localhost`, que resolve nativamente para
  `127.0.0.1` em qualquer navegador moderno, sem precisar editar `/etc/hosts`
  — ver `docs/setup.md`
- Depois do cadastro, redirect real de navegador (`window.location.href`)
  para `http://<slug>.twinai.localhost:8090/subscription`
- `middleware/resolveTenantFromHost.ts`: resolve o tenant pelo subdomínio do
  Host; `routes/auth.ts` (login) passa a escopar a busca por email por esse
  tenant quando presente, corrigindo uma ambiguidade latente (o mesmo email
  pode existir em tenants diferentes, e o login antes buscava sem escopo)
- Migrações `011_tenant_slug.sql` (slug único, com backfill dos tenants
  existentes) e `012_subscription_fields.sql` (`plan_id`,
  `payment_method_masked`)
- `traefik/dynamic.yml`: roteadores agora exigem Host
  (`twinai.localhost`/`*.twinai.localhost`, via `{{env "BASE_DOMAIN"}}` —
  nunca hardcoded), preparando o terreno para TLS/ACME quando o domínio real
  existir (`traefik.yml` ganhou um bloco `certificatesResolvers` comentado)
- **Correção logo após a primeira versão desta fase:** o sufixo mockado
  começou como `twinai.local`, mas isso disparava prompts de aprovação
  repetidos/inconsistentes no Browser pane usado para verificação (`.local`
  é reservado para mDNS/Bonjour e recebe tratamento especial em alguns
  navegadores/ferramentas). Trocado para `twinai.localhost`, que todo
  navegador moderno já resolve para `127.0.0.1` nativamente — **eliminou a
  necessidade de `/etc/hosts` no dev local** (só fica como fallback
  documentado, caso `*.localhost` não resolva em algum ambiente específico).
  Precisou também de `allowedHosts` no `vite.config.ts` (Vite bloqueia por
  padrão Host headers não reconhecidos — proteção contra DNS rebinding) e
  rebuild da imagem do frontend (`vite.config.ts` é copiado no build da
  imagem, não bind-mounted).
- Aba "Apresentação/Cadastro/Plano/Pagamento" (placeholder da Fase 4) virou
  "Minha Assinatura" de verdade: perfil da empresa, plano atual + uso do mês,
  comparação de planos (lista fixa em `backend/src/plans.ts` — sem tabela,
  billing real é Fase 6), cartão salvo (stub mascarado) e faturas (lista
  vazia, sem tabela — nada gera fatura real antes da Fase 6)
- Typecheck limpo em backend/frontend (só o erro pré-existente e não
  relacionado do `PgSessionStore`/`@fastify/session` continua lá)

**O que foi feito (Fase 4 — ajustes de UI/UX pós-Fase 3):**
- Navegação reordenada em `AppShell.tsx`: Apresentação/Cadastro/Plano/Pagamento
  (`/plans`, placeholder) → Criar vídeo → Conteúdo → Base de conhecimento/RAG
  (`/rag`, nova página) → Painel → Configurações
- A sub-aba "Conhecimento e mídia" saiu de dentro de Conteúdo e virou a nova
  página de primeiro nível `/rag` (`pages/Rag/RagPage.tsx`, reaproveitando
  `KnowledgeMediaTab` sem duplicar código); Conteúdo agora só tem
  Avatares/Vídeos
- Tela de Avatar (step 1 de Criar vídeo) ganhou uma nota de escopo deixando
  explícito que configura o avatar reutilizável, não a personalização por
  vídeo
- Cenário/Traje (em `AvatarSetupStep.tsx` e `ChooseAssetsStep.tsx`) deixaram de
  usar um toggle "Prompt de IA" vs "Enviar imagem" (mutuamente exclusivos) e
  passaram a mostrar os dois campos lado a lado, sempre visíveis — exigiu
  migração `010_video_prompts.sql` (colunas `scenario_prompt`/`outfit_prompt`
  em `videos`, paralelas às colunas existentes que agora representam só a
  imagem de referência enviada)
- Todos os ícones do header (idioma, tema, jobs, notificações) ganharam
  tooltip descritivo (`title`); idioma não tinha nenhum antes
- Estado do copiloto (Fase 3) extraído de `Copilot.tsx` para
  `copilot/CopilotContext.tsx` (`CopilotProvider`/`useCopilot()`), permitindo
  que qualquer parte do app abra o copiloto com um prompt pré-carregado. Novo
  `FieldHelpIcon.tsx` (ícone "i") integrado ao `Field.tsx` via prop
  `helpPrompt`, aplicado nos campos de nome do avatar, cenário, traje e prompt
  de roteiro. Botão do copiloto no header ganhou destaque visual permanente
  (`.icon-btn-accent`, fundo colorido sempre visível)
- Testado via Docker Compose: ordem/conteúdo das 6 abas, nota de escopo do
  avatar, campos de Cenário/Traje coexistindo (confirmado nos dois lugares),
  tooltips do header, e o fluxo completo do ícone "i" (abre o copiloto, cria
  conversa nova, envia o prompt contextual automaticamente — confirmado via
  rede que `POST /copilot/conversations` e `.../messages` disparam
  corretamente). `POST /videos` testado diretamente via API confirmando que
  `scenario_prompt`/`outfit_prompt` são persistidos corretamente.

**Onde parou / próximo passo imediato:**
- ~~Verificação end-to-end dependia do usuário editar `/etc/hosts`~~ —
  resolvido: trocado `twinai.local` por `twinai.localhost` (ver acima), que
  todo navegador resolve nativamente. Verificação completa feita no navegador:
  cadastro em `http://twinai.localhost:8090/signup` → redirect real para
  `http://acme.twinai.localhost:8090/subscription` → sessão persistindo após
  reload → completar nome da empresa (seção "complete seu perfil" some
  corretamente depois) → plano/uso/pagamento/faturas todos renderizando com os
  dados esperados.
- Não foi possível testar o wizard de Criar vídeo até o fim pela UI (câmera
  bloqueada no ambiente do browser da sessão) — o passo 3 (Escolha de
  recursos/`ChooseAssetsStep.tsx`) foi verificado por revisão de código e
  typecheck, não visualmente na tela. Vale um teste manual rápido depois.
- ~~Falta a landing page/marketing pública~~ — resolvido na parte 2 da Fase 5
  (ver acima): landing, copiloto público, WhatsApp e StorageProvider
  entregues e verificados nesta sessão.

**Bloqueios ou pendências:**
- 3 provedores de IA de domínio ainda são stubs: avatar/vídeo (HeyGen/D-ID),
  voz (ElevenLabs) e embeddings (OpenAI/Voyage AI) — geração de vídeo usa
  `setTimeout` simulado em vez de polling real do provider. **Roteiro deixou
  de ser stub nesta sessão** (Anthropic + Gemini reais, seletável por
  vendor); os copilotos (autenticado e público) continuam sendo integração
  real também.
- Nenhuma chave real (Anthropic ou Gemini) foi testada com sucesso em
  nenhuma sessão até agora — só chave inválida/ausente (confirma o
  tratamento de erro e, nesta sessão, confirma que o roteamento por vendor é
  real, mas não confirma a qualidade de uma resposta gerada de verdade). O
  mesmo vale pro copiloto público (`PLATFORM_COPILOT_API_KEY` não
  configurada localmente).
- Wizard de Criar Vídeo segue sem poder ser testado além do passo 1
  (Configurar avatar) neste ambiente — captura de foto/vídeo de referência
  exige câmera, bloqueada no browser da sessão (mesma limitação desde a Fase
  4).
- ~~`traefik/dynamic.yml` não roteia `/uploads/*` pro backend~~ — **falso,
  corrigido em 2026-07-18: o router `uploads` já existe e funciona** (ver
  seção 3). Este item saiu da lista de pendências.
- Wildcard DNS real (`*.BASE_DOMAIN`) em produção é um passo externo
  pendente — não configurado neste repo, só documentado como necessário.
- TLS/ACME DNS-01 do Traefik está comentado/desligado até `DNS_PROVIDER` ser
  decidido (ver `traefik/traefik.yml`).
- **Migração BYOK→chave-da-plataforma decidida (2026-07-21), não construída**
  — código de vídeo/avatar/voz/roteiro continua 100% BYOK; enforcement de
  limite de plano (seção 3) já está pronto e testado pra quando a migração
  acontecer, mas hoje não protege custo real (quem paga o provedor ainda é o
  próprio tenant)
- ~~Fase A do rebrand aguardando aprovação final; troca do wordmark recriado
  pela arte real do logo pendente de confirmação~~ — **resolvido nesta
  sessão: Fase A aprovada pelo usuário, e a troca pela arte real do logo já
  tinha sido feita numa sessão anterior** (`logo-eckko-original.png`/
  `logo-eckko-transparent.png`), só não estava refletido aqui. Fase B agora
  liberada — plano detalhado na entrada de sessão correspondente
- ~~Status de implementação do botão de auto-login de dev não confirmado~~ —
  **resolvido em 2026-07-21: não existe.** Busca por `DEV_TEST_EMAIL`/
  `DEV_TEST_PASSWORD`/"auto-login"/"conta de teste" em todo o repositório
  retornou zero ocorrências fora deste próprio arquivo — era só uma decisão
  registrada numa sessão paralela, nunca implementada
- **`provider_cost_rates` tem 9 valores placeholder, não conferidos contra
  preço real publicado** (HeyGen/D-ID/ElevenLabs/Anthropic/Gemini/OpenAI —
  seedados na migration `022`, ver seção 7, entrada do painel admin de
  billing). Toda tela de custo já sinaliza isso (banner de estimativa,
  coluna `verified`), mas os números em si continuam sem validação real —
  alguém precisa conferir cada um contra a tabela de preços pública de cada
  vendor e marcar `verified: true` pela aba "Taxas de custo" do admin antes
  de qualquer decisão de negócio real usar esses totais
- ~~Fase 4 do painel de billing (Stripe: assinatura + webhook) pausada~~ —
  **concluída em 2026-07-22**, verificada de ponta a ponta (checkout real +
  `stripe listen` + cancelamento) — ver seção 7

---

## 8. Histórico resumido de sessões

- **2026-07-22 (conta atual, continuação — download de vídeo/avatar
  corrigido + investigação do achado paralelo):** implementados os dois
  itens da verificação anterior. Vídeo: `GET /videos/:id/download` faz o
  proxy do arquivo do vendor no servidor (`Content-Disposition:
  attachment`), corrige o bug de navegação-pra-fora em URLs cross-origin.
  Avatar: `GET /avatars/:id/reference-video/download` — decisão de baixar
  o vídeo de referência do treino (único asset em formato de arquivo
  único), não fotos nem preview do provider (este último nem existe no
  schema). Bug real encontrado no meio do processo (`500
  ERR_HTTP_HEADERS_SENT`, faltava `return reply` depois de `reply.send()`
  manual) e corrigido antes de qualquer teste "limpo". Testado com clique
  real no navegador nos dois: `tabs_context` confirma que a aba não navega
  mais pra fora do app, arquivo reaberto com `ffprobe` bate íntegro com o
  original, isolamento por tenant confirmado (404). Investigado à parte o
  achado do tenant "Dev" com HeyGen real: timeline reconstruída via
  Postgres (credenciais conectadas e vídeos gerados de verdade em
  2026-07-17), mas esse dia não tem nenhuma entrada neste arquivo —
  impossível determinar com certeza se foi sessão de Claude Code perdida
  ou teste manual do usuário. ~5 afirmações "nenhuma chave real testada"
  espalhadas pelo arquivo corrigidas. Nenhum dado do tenant tocado. Ver
  seção 7 para o detalhe técnico completo
- **2026-07-22 (conta atual, continuação — verificação real de "compra
  avulsa de créditos" e "download de avatares/vídeos"):** usuário recusou
  aceitar relatos anteriores como fechados e pediu re-execução real com
  comando+saída. Item 1 (créditos) reconfirmado sem divergência — checkout
  real via Stripe CLI, saldo/ledger conferidos no Postgres, sweep mensal
  não duplicou, cartão recusado não creditou, webhook duplicado (replay
  manual assinado) confirmado idempotente. Item 2 (download) **revelou dois
  problemas reais que a sessão anterior não tinha pego**: não existe botão
  de download pra avatar em lugar nenhum do código, e o botão de download
  de vídeo não funciona pra URLs reais (HeyGen/D-ID são sempre cross-origin,
  e o navegador ignora o atributo `download` nesse caso — confirmado
  clicando de verdade no navegador e lendo a rede, não só o código). Achado
  paralelo registrado: um tenant de dev real (`dev-c77a5b`) tem vídeo/avatar
  gerados com HeyGen de verdade, contradizendo entradas anteriores que
  diziam nunca ter havido teste bem-sucedido com chave real — não
  investigado, fica pendente. Ver seção 7 para o detalhe técnico completo
- **2026-07-22 (conta atual, continuação — admin copilot: recuperado,
  aplicado, testado e corrigido):** pedido do usuário era "recuperar o
  contexto" de uma feature nunca mencionada neste arquivo — investigação no
  código encontrou tudo já escrito (migration `031`,
  `routes/adminCopilot.ts`, `AdminCopilotContext.tsx`, widget no header,
  system prompt já correto pra "eckko.ai"), mas a migration nunca tinha
  rodado no banco local (feature 100% quebrada no ambiente ao vivo, não só
  não-documentada). Aplicada via `docker compose restart backend`, testada
  ponta a ponta com curl (login admin, CRUD de conversas, erro gracioso sem
  `PLATFORM_COPILOT_API_KEY`, isolamento 404/401) e no navegador (mesmo
  gotcha do bundle Vite desatualizado, resolvido com restart do frontend).
  Bug real encontrado e corrigido: a mensagem de "não configurado" mostrada
  ao admin era a do copiloto do tenant ("conecte a chave... em
  Configurações"), sem sentido pra quem não tem essa tela — nova chave
  `copilot.adminNotConfigured` criada e ligada. Ver seção 7 para o detalhe
  técnico completo
- **2026-07-22 (conta atual, continuação — reconciliação pós-trabalho
  paralelo + Fase 5 fechada: compra avulsa de créditos):** sessão aberta
  reconciliando trabalho de outra conta no mesmo dia — zero divergência
  encontrada entre este arquivo e o código/banco reais (migrations,
  `creditGate.ts`, job de concessão mensal, `admin_users`/`POST /login`,
  isolamento de sessão admin↔tenant testado de novo). Rate limit do `POST
  /login` confirmado migrado do antigo `/admin/login` e testado
  empiricamente. Fase 5 do plano de billing fechada: nova tabela
  `credit_packages` (10 créditos/pacote, preço por tipo confirmado com o
  usuário — script R$19,90/vídeo R$39,90/avatar R$59,90),
  `POST /subscription/credits/checkout` (`mode: 'payment'`) e o webhook
  ramificado por `metadata.type === 'credit_purchase'` — testados ponta a
  ponta com Stripe CLI real (checkout completo no navegador, saldo
  confirmado no Postgres) **e** idempotência contra redelivery testada de
  verdade (replay manual do mesmo evento com assinatura HMAC calculada na
  hora, saldo não duplicou). Ver seção 7 para o detalhe técnico completo
- **2026-07-22 (conta atual, continuação — última menção "TWINAI" + tema
  claro padrão):** pedido citava só o subtítulo do hero, mas grep revelou
  9 ocorrências por locale (não 1) — todas na landing (FAQ, planos, WhatsApp,
  copiloto público incluso), todas corrigidas nos dois idiomas, zero
  restante confirmado em `frontend/src` inteiro. Tema: confirmado que o
  default de fato seguia o SO (`@media prefers-color-scheme` sem
  `data-theme` explícito), trocado pra sempre iniciar claro quando não há
  escolha salva — toggle de 3 opções (claro/escuro/sistema) intacto, e
  quem já escolheu continua vendo sua escolha. Adicionado script inline em
  `index.html` pra evitar flash de escuro no primeiro paint (SO em escuro
  + antes do React montar). Testado ao vivo: SO forçado escuro + storage
  limpo → abre claro; toggle pra escuro → persiste no reload. Gotcha do
  bundle Vite desatualizado (2ª vez na mesma data) virou nota permanente na
  seção 5. Ver seção 7 para o detalhe completo
- **2026-07-22 (conta atual, continuação — logomarca real na landing +
  signup):** os 3 lugares que ainda mostravam "eckko.ai" como texto puro
  (header/footer da landing, header do signup) passaram a usar a imagem
  real (`logo-eckko-transparent.png`), mesmo padrão já usado na sidebar do
  tenant — classe CSS generalizada (`.sidebar-logo-chip` →
  `.brand-logo-chip`) com modificadores de tamanho maiores (a sidebar usa
  20px, ilegível fora dela). De passagem, corrigido um "TWINAI" hardcoded
  que sobrava no copyright do footer. `LoginPage.tsx` deliberadamente não
  tocado (fora do escopo pedido). Reencontrado o gotcha de bundle Vite
  desatualizado (mesmo do teste do Stripe) — resolvido com
  `docker compose restart frontend`. Verificado nos dois temas via
  navegador, confirmando que as imagens carregam nos tamanhos certos e sem
  sobra de texto recriado em fonte. Ver seção 7 para o detalhe completo
- **2026-07-22 (conta atual, continuação — login unificado + admin real):**
  implementado o desenho aprovado numa rodada anterior da mesma sessão:
  `POST /login` novo, host-aware de verdade no servidor (sem tenant
  resolvido no Host tenta `admin_users` antes de `users`; com tenant
  resolvido nunca toca `admin_users`, nem com senha correta) — testado
  explicitamente contra um subdomínio real (`acme.twinai.localhost`) pra
  provar que não é só uma regra de UI. Frontend: `LoginPage.tsx` virou o
  único formulário (sem indicação visual de tipo de conta), `/admin/login`
  passou a renderizar o mesmo componente em vez do `AdminLoginPage.tsx`
  agora removido. Admin real (`admin@eckkoai.com`) criado com senha forte
  gerada na hora, mostrada uma única vez no chat, nunca persistida em
  arquivo. 4 admins de teste acumulados (não só o citado no pedido)
  tentados remover — todos presos pela mesma FK de `audit_log` já
  documentada, mantidos. Testado ponta a ponta com curl E navegador (login
  real como admin pela UI, redirecionando pro painel de verdade). Ver
  seção 7 para o detalhe técnico completo
- **2026-07-22 (conta atual, continuação — fundo virtual + arquivos
  soltos):** duas tarefas independentes. (1) Nova tentativa de validar
  visualmente o fundo virtual com pessoa real — `Claude in Chrome` checado
  e não conectado nesta sessão; Browser pane padrão confirmou de novo,
  agora de forma explícita e definitiva (`getUserMedia` → `NotAllowedError`,
  nota de sistema da própria ferramenta), que a câmera continua bloqueada.
  Não insistiu além disso — segue sem validação visual real de
  MASK_SHARPNESS/EROSION_RADIUS/TEMPORAL_SMOOTHING_ALPHA, limitação
  conhecida mantida, não fingida como resolvida. (2) Investigados 3
  arquivos soltos na pasta pai do projeto: os dois HTMLs (`LANNDING PAGE`/
  `PAINEL ECKKOAI`) confirmados como o mesmo mockup "neon tech" já auditado
  e descartado em 2026-07-21, sem ação necessária; `ECKKOAI IMAGEM 1.png`
  é a mesma arte do logo já salvo, mas com um tagline ("SUA IMAGEM, SUA
  VOZ, SEU CONTEÚDO SEM LIMITES.") nunca incorporado em lugar nenhum do
  repo — reportado, nada movido, decisão de produto pendente com o
  usuário. Ver seção 7 para o detalhe completo
- **2026-07-22 (conta atual, continuação — Fase 4 reduzida: top-up de
  crédito no upgrade via Stripe):** pedido presumia que checkout/webhook do
  Stripe ainda faltavam construir — conferido no código antes de propor
  qualquer coisa e não era o caso, já existiam de uma rodada anterior desta
  mesma Fase 4, de antes do sistema de créditos existir. Escopo real: só a
  lacuna do webhook não saber nada sobre `tenant_credits`. Decisão: webhook
  dispara um top-up imediato e específico do tenant em
  `checkout.session.completed` (não só o sweep de 24h), pra evitar um
  tenant pago ficar preso no saldo antigo até o mês virar — implementado
  reaproveitando a mesma mecânica de `monthlyGrant.ts` (refatorada pra uma
  função interna parametrizável), sem duplicar lógica, e sem depender de
  nenhum evento de renovação (mantendo o modelo de créditos desacoplado do
  ciclo de cobrança Stripe, decisão já travada antes). Testado com Stripe
  CLI real (`stripe listen --forward-to`, não só typecheck): tenant do zero
  → checkout real no navegador com cartão de teste → saldo pulou de `0/0/0`
  pra `20/60/5` (Pro) imediatamente, confirmado no Postgres, sweep manual
  em seguida sem duplicar, cancelamento revertendo pro Free também
  confirmado. Nenhuma rota de compra avulsa (`reason='purchase'`) tocada.
  Ver seção 7 para o detalhe técnico completo
- **2026-07-22 (conta atual, continuação — Fase 5, job de concessão mensal
  de créditos):** proposto e confirmado antes de codar: reset ("use ou
  perca", não acumula) em vez de acúmulo, e tenant suspenso recebe o grant
  igual (inofensivo, `requireActiveTenant` já bloqueia geração). Investigado
  o repo inteiro antes de introduzir mecanismo — não existia nenhum
  scheduler; reaproveitado o mesmo idioma de `setInterval` puro que
  `videos.ts` já usa (sem dependência nova tipo `node-cron`), rodando no
  boot **e** a cada 24h em vez de um horário fixo, porque o processo
  reinicia com frequência neste projeto e um agendamento preso à hora exata
  arriscaria pular o mês inteiro. Idempotência via lock-then-check (`FOR
  UPDATE` na linha antes de checar o `credit_ledger` deste mês) fecha uma
  race entre duas varreduras concorrentes. Testado direto nos 13 tenants
  reais do ambiente (backfill de produção, não teste descartável): boot
  gerou 39 grants corretos, disparo manual seguinte confirmou idempotência
  (`0` novos), e a trava de delta não-positivo confirmada manipulando o
  saldo do tenant `acme` acima do limite do plano. Ver seção 7 para o
  detalhe técnico completo
- **2026-07-22 (conta atual, continuação — Fase 5, seed de `tenant_credits`
  no signup):** fechado o gap conhecido de tenants novos nascendo sem as 3
  linhas de saldo (video/script/avatar) que a migration 028 só tinha dado
  aos 13 tenants existentes na época. Achado no caminho: o handler de
  `/auth/signup` inteiro já não era atômico antes disso (4 inserts soltos
  sem transação) — em vez de só embrulhar tenant+créditos como foi pedido
  literalmente, o fluxo inteiro (tenant → credenciais → créditos → usuário)
  foi movido pra uma única transação, porque proteger só uma fatia não
  fechava a classe de problema. Rollback testado de verdade (throw forçado
  temporário, confirmado que nada persiste, removido em seguida). Ver
  seção 7 para o detalhe técnico completo
- **2026-07-22 (conta atual, continuação — Fase 5, consumo de crédito):**
  resolvida a dúvida de arquitetura "limite de plano e saldo de crédito são
  a mesma coisa ou complementares?" — confirmado que são a mesma coisa (a
  concessão mensal alimenta o saldo, não uma cota separada), com o
  raciocínio decisivo sendo que um job de concessão mensal só faz sentido
  se ele substitui o `COUNT(*)` por plano, já que esse contador reseta
  sozinho todo mês sem precisar de nenhum job. Migration `029` adicionou
  `'grant'` ao CHECK de `reason` em `credit_ledger` (distinto de
  `'purchase'`). Os 3 checks `COUNT(*) >= plan.XLimitPerMonth` em
  `routes/videos.ts`/`scripts.ts`/`avatars.ts` foram substituídos por
  `debitCredit()` ([creditGate.ts](backend/src/services/billing/creditGate.ts)),
  mantendo `script_generations`/`avatar_trainings`/`videos` só como
  histórico. Testado ponta a ponta nas 3 rotas com tenant real e saldo
  semeado manualmente via SQL (job de concessão mensal ainda não existe):
  bloqueio com saldo ausente/zerado, débito correto com saldo suficiente, e
  teste de concorrência (2 requisições simultâneas contra saldo=1)
  confirmando que o `FOR UPDATE` evita débito duplicado. Ver seção 7 para o
  detalhe técnico completo e a lista do que falta pra Fase 5 fechar (job de
  concessão mensal, seed de `tenant_credits` no signup, compra avulsa)
- **2026-07-22 (conta atual):** Fase 4 do plano de billing (Stripe:
  assinatura real + webhook) implementada e **validada de ponta a ponta**
  com as credenciais de teste reais fornecidas pelo usuário — `stripe` npm
  instalado, `POST /subscription/checkout` (Checkout Session real, Free
  pula Stripe), `POST /subscription/stripe/webhook` (raw body só nesse
  encapsulamento, trata checkout/subscription created-updated-deleted).
  Stripe CLI instalado via winget (confirmado com o usuário). Gotcha de
  rede descoberto e corrigido: `stripe listen` (processo nativo Windows)
  não resolve `*.localhost` como os navegadores resolvem — precisou de uma
  linha no hosts file (o usuário aplicou, exigia admin). Testado 2x: a
  primeira rodada expôs um falso positivo (frontend com bundle Vite
  desatualizado, plano mudava sem passar pelo Stripe de verdade) corrigido
  com restart do container; a segunda rodada confirmou no Postgres (não só
  no redirect) que `checkout.session.completed` e `customer.subscription.*`
  atualizam `plan_id`/`stripe_customer_id`/`status` corretamente, com
  `audit_log` completo e sem nenhum segredo gravado; cancelamento via CLI
  também validado (webhook `subscription.deleted` reverte pro Free). Ver
  seção 7 para o detalhe técnico completo
- **2026-07-21/22 (conta atual, continuação — painel admin de billing,
  Fases 0-3):** planejado via Plan Mode (3 agentes Explore levantando
  billing/subscription, providers, e admin/Traefik antes do plano) e
  aprovado passo a passo. Schema completo (`plans`, `provider_cost_rates`
  com coluna `verified`, `provider_usage`, `credit_ledger`,
  `tenants.status`/`stripe_customer_id`/`credit_balance`); `plans.ts` deixou
  de ser hardcoded (tabela é a fonte de verdade agora, sem cache
  deliberadamente); captura real de uso por provedor (tokens via
  `providerRegistry.ts`, caracteres do ElevenLabs, segundos-proxy do
  vídeo), com banner de estimativa explícito enquanto as taxas não forem
  conferidas; CRUD de planos pelo admin (efeito avô confirmado); suspensão
  de tenant (bloqueia só as 3 rotas de geração, não login/leitura). Tudo
  testado ao vivo com curl + navegador, tenants de teste limpos depois.
  Fase 4 (Stripe) pausada aguardando credenciais de teste do usuário. Ver
  seção 7 para o detalhe técnico completo de cada fase
- **2026-07-21/22 (conta atual, continuação da mesma sessão do rebrand):**
  fundação real do painel admin construída — identidade de admin separada
  (`admin_users`, `/admin/login`, `requireAdmin`, `routes/adminPanel.ts` com
  audit log), não o campo `role` inicialmente cogitado. Em seguida, dois
  passos aprovados pelo usuário: (3) as rotas BYOK/storage do tenant em
  Configurações viraram somente-leitura — `PUT`/`POST` de escrita agora
  respondem `403 managed_by_platform`, só o painel admin escreve; (4) a
  antiga rota `POST /admin/tenants` (`X-Admin-Token`) foi removida depois de
  um grep no repo inteiro confirmar zero callers vivos. Verificado com curl
  (403/404/200 conforme esperado) e no navegador; tenant de teste limpo
  depois. Logo em seguida, achado incidental (não planejado): a Seção 3
  dizia que `avatarProvider.ts`/`voiceProvider.ts` eram stub, mas o código já
  tinha integração real (HeyGen/D-ID/ElevenLabs, polling de vídeo de
  verdade) — não dá pra saber em qual sessão isso foi construído, só ficou
  sem documentar. Seção 3 corrigida; `embeddingProvider.ts` confirmado como o
  único provedor de domínio ainda stub. Em seguida, revisão da Fase A do
  rebrand: usuário confirmou que o logo na prévia já é a arte real (não um
  placeholder em fonte, como a nota antiga em "Onde parou" dizia — corrigida
  também) e **aprovou a Fase A por completo**. Fase B liberada para
  planejamento. Ver seção 7 para o detalhe técnico completo
- **2026-07-21 (conta atual + itens mesclados de sessão paralela):** arco de
  rebrand TWINAI→eckko.ai. Duas auditorias no espírito "código real, não
  suposição" (mockup-vs-real da UI, e billing/créditos-vs-real); Fase A
  (preview estático, claro/escuro, servidor local) gerada e ajustada — hero
  com headline novo e foto real do rosto+rede-neural com os 3 badges de
  claim falso removidos por corte de pixel limpo (sem inpainting); enforcement
  real do limite de plano em `POST /videos` implementado e testado
  ponta-a-ponta (tenant real, 403 no 6º vídeo do plano Free). Decisão de
  negócio BYOK→chave-da-plataforma (crédito do cliente) confirmada pelo
  usuário como final, mas migração ainda não construída — maior gap de
  arquitetura em aberto agora. Ver seções 1, 3, 6 e 7 para detalhes e para
  o que veio de sessão paralela (sinalizado explicitamente, não verificado
  nesta conversa)
- **2026-07-18 (conta atual):** primeira execução do `/graphify .` no
  projeto (grafo em `graphify-out/`, não versionado). A extração apontou uma
  contradição entre este arquivo e o código real sobre o roteamento
  `/uploads/*` no Traefik; investigado e **confirmado ao vivo via `curl`**
  que o router `uploads` já existe e funciona em `traefik/dynamic.yml` — a
  pendência registrada na sessão de Fase 5 — parte 2 (ver entrada abaixo)
  estava desatualizada, provavelmente por um teste sem o header `Host`
  correto. Três menções corrigidas neste arquivo (seções 3 e 7); nenhum
  código alterado
- **2026-07-16 (conta atual):** providers de Configurações auditados e
  corrigidos pra ter seleção real de vendor (antes: só um nome de exemplo no
  texto, um campo de chave único). Gap concreto fechado: `scriptProvider.ts`
  saiu de 100% stub pra integração real com Anthropic **e** Gemini, com
  dropdown funcional. Achado durante o planejamento e corrigido junto: o
  copiloto in-app reaproveitava a mesma credencial `script` direto pra
  Anthropic — sem o ajuste, trocar pra Gemini quebraria o copiloto
  silenciosamente. `avatarProvider.ts`/`voiceProvider.ts` mantidos como stub
  (dropdown honesto de 1 opção só, sem fingir HeyGen/D-ID/ElevenLabs), por
  não terem uma segunda implementação real ainda. **Verificado no navegador**
  que o roteamento por vendor é real (chave inválida em cada vendor bateu no
  endpoint certo, com o erro nativo de cada provedor) — não foi possível
  confirmar uma geração bem-sucedida por falta de chave Gemini real, nem
  avançar o wizard de Criar Vídeo além do passo 1 (câmera bloqueada no
  ambiente); ver seção 7 para detalhes
- **2026-07-16 (conta atual):** completado o restante do escopo original da
  Fase 5 identificado pela auditoria anterior — StorageProvider (interface +
  stub), landing page pública, copiloto público pré-cadastro e link de
  WhatsApp — todos implementados e **verificados de ponta a ponta no
  navegador** (incluindo um upload real confirmado no disco do container).
  De quebra, corrigido `common.appName`/`<title>` que ainda diziam "Video
  Avatar Studio". Achado (não corrigido, fora de escopo): Traefik não roteia
  `/uploads/*` pro backend — ver seção 7; ver detalhes acima
- **2026-07-16 (conta atual):** auditoria de status feita direto no código
  (não nos resumos de sessão anteriores) contra o histórico de fases; seção 3
  atualizada para registrar o copiloto in-app e a pasta `/docs` como
  implementados de verdade (integração real com Anthropic, antes não listados
  ali), e para deixar explícito que StorageProvider, link de WhatsApp, agente
  de perfil de conteúdo e o site público (landing + copiloto de demonstração)
  ainda não existem em nenhuma fase
- **2026-07-16 (conta atual):** Fase 5 revisada implementada e **verificada
  de ponta a ponta no navegador** (cadastro mínimo + subdomínio por tenant +
  "Minha Assinatura"); domínio mockado trocado de `twinai.local` para
  `twinai.localhost` no meio da sessão por causar prompts de aprovação
  inconsistentes (mDNS) — `.localhost` resolve nativamente, sem `/etc/hosts`;
  ver detalhes acima
- **2026-07-16 (conta atual):** Fase 4 implementada (ajustes de UI/UX:
  navegação, campos de IA em Cenário/Traje, tooltips, ajuda contextual via
  copiloto) e verificada via Docker Compose; ver detalhes acima
- **2026-07-16 (conta atual):** Fase 3 implementada (`/docs` + copiloto de IA
  autenticado) e verificada via Docker Compose
- **2026-07-16 (manfred@smartinovat.com):** varredura completa do projeto,
  mesclagem dos dois CLAUDE.md (técnico + roadmap SaaS) num único arquivo
- **(sessão anterior, outra conta):** Fases 1 e 2 concluídas (multi-tenant,
  header redesign); prompt da Fase 5 escrito; identificada dependência da
  Fase 3 antes de rodar a Fase 5

---

## 9. Notas sobre alternância de conta

Este projeto é trabalhado alternando entre duas contas do Claude Code (pessoal
e manfred@smartinovat.com) para evitar travar em limites de uso. O histórico de
conversa NÃO é compartilhado nativamente entre contas — por isso este arquivo é
a fonte de verdade sobre o estado do projeto, não a conversa em si.
