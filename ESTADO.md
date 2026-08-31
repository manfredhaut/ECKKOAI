# ESTADO — leia isto ANTES de qualquer coisa

Ponto de entrada de toda sessão. Escrito para o assistente, não para humano:
sem introdução, sem repetir o que o código já diz, cada afirmação marcada
**MEDIDO** / **DEDUZIDO** / **NÃO VERIFICADO**.

**Divisão com o CLAUDE.md, fixada em 12/08:** aqui fica o que é OPERACIONAL e
muda a cada sessão — onde o repositório está, como invocar, os gotchas do
arnês, o que está por verificar. Lá fica o ACUMULADO HISTÓRICO — o que foi
medido, o que custou dinheiro, o procedimento de desarme, as decisões de
fornecedor. Nada é duplicado de propósito: duas cópias garantem que uma
envelheça em silêncio.

**Este arquivo é atualizado no ÚLTIMO commit de TODA sessão.** Se a data abaixo
for mais velha que o último commit, ele está desatualizado — conserte antes de
qualquer outra coisa.

Atualizado em **31/08/2026 (V24)**. HEAD **`0493235`**, árvore limpa. Esta
sessão NÃO abriu trabalho novo de produto — commitou, em 7 commits nomeados,
o trabalho de tier Normal de 6 sessões anteriores (29-31/08: migração para
`wan/v2.6/reference-to-video/flash`, Bugs D/E, RODADA 6, guarda de upload/
payload) que tinha ficado pendente na árvore (12 modificados + 15 untracked)
por sessões interrompidas sem commit. **Esta §1 estava 47 commits atrás**
antes desta escrita — ver a nota de SÉTIMA divergência logo abaixo. O
parágrafo anterior a este (I1/L1, `b679ea2`/`b00b744`, 23/08) é histórico e
está coberto por §15 mais abaixo.

> ⚠️ **TROCA DE CONTA: o gatilho é `RETOMAR-P7`.** Numa conta nova, digite
> **RETOMAR-P7** — [RETOMAR-P7.md](RETOMAR-P7.md) traz o estado completo do
> bloco P7 (vídeos longos na fal): o que está medido, o bloqueio da chave
> inválida, e o próximo passo exato. Foi escrito para dispensar a releitura
> da sessão anterior.

A sessão anterior (22/08, HEAD `50324c6`) está em §12 (Fase 1+2, 21/08), §13
(cartão Simples + Fases A e B) e §14 (Fase C), e em
[PLANO-MESTRE-SEQUENCIAL.md](PLANO-MESTRE-SEQUENCIAL.md) — este arquivo é o
operacional/gotchas, aquele é o resumo de handoff daquele bloco.

⚠️ **Arnês SEM passada completa desde `fc6f7d6` (296/296, 21/08).** Mudança
de processo desta sessão (pedido do operador, depois de a completa abortar
3 VEZES por edição concorrente): ela deixa de ser lançada em background
depois de cada commit intermediário dentro de um bloco de trabalho, e passa
a rodar só UMA vez, no fim do bloco inteiro. Os 7 commits entre `fc6f7d6` e
`50324c6` (Fase 1 HTTP, cartão Simples, Fase A, Fase B, Fase C + 2 correções
de guarda da própria Fase C) foram fechados só com passada FILTRADA
(`--guard`) provando os mutantes novos/reescritos de cada rodada — real, mas
não substitui a completa. **Registro atual: 315 mutantes declarados**
(296 → 299 no cartão Simples → 305 no multi-vendor A/B → 315 na Fase C),
contagem confirmada por `npm run check:mutants -- --list` nesta escrita.
Rodar a completa é decisão do operador, não automática — **e nesta sessão
ele pediu explicitamente para PARAR depois da Fase C, sem iniciar a Fase D
nem lançar a completa.**

⚠️ **GAP CONHECIDO, NÃO RECONSTRUÍDO NESTA RODADA (herdado, mais um layer):**
entre o HEAD anterior registrado aqui (`22f9db8`, 14/08) e o início da sessão
de 18/08 (`b314c5d`) o repositório recebeu uma dúzia de commits de blocos NÃO
cobertos por este arquivo — VITE-PROD-3, domínio único, perfil ampliado,
verificação de e-mail, guarda G-D. A sessão de 18/08 (BLOCO N+3, §11) também
NÃO reconstruiu esse gap, e fechou sem commitar a própria atualização deste
arquivo (a linha "Atualizado em 18/08" ficou registrada como não-commitada).
**Esta sessão (21/08) soma um SEGUNDO gap por cima:** entre `fd1ba07` (último
HEAD que este arquivo já viu) e `b8164b4` (HEAD no início desta sessão) há
mais uma leva de commits não cobertos aqui — troca de avatar de referência,
independência foto/vídeo de referência, BLOCO A inteiro (sistema de tiers
Simples/Normal/Premium). **O BLOCO A está coberto no CLAUDE.md**, seção
histórica, não aqui. `git log --oneline` entre os HEADs é a fonte de verdade
para o resto até alguém reconstruir essa história neste arquivo.

---

## 9 · BLOCO N+1 (17/08/2026) — videoId opcional em abrirCorrida, video_id
gravado, Backlog 8 (fixture da fal simulava como HeyGen) corrigido

**Custo: US$ 0,00.** Nenhuma chamada a fornecedor, nenhum crédito REAL
tocado — só o saldo de ENSAIO (`video_rehearsal`) do tenant `dev-c77a5b8a`, e
só num script descartável, apagado ao final, nunca commitado.

**Três commits, em sequência a partir de `b314c5d`:**

- `eeb3ef4` — `AbrirCorridaInput` ganha `videoId?: string`; os dois call
  sites reais em `routes/videos.ts` (`/approve` e `/recompose`) passam
  `videoId: video.id`; `abrirCorrida()` grava `video_id` no INSERT de
  `fal_pipeline_runs` (coluna já existente desde a migration 051 — SEM
  migration nova). Duas guardas novas em `checkFalApprovalPolicy.ts`: G-E
  (forma, os dois call sites) e G-F (EXECUÇÃO real — `abrirCorrida()`
  chamada de verdade com `pool.query` substituído, inspecionando SQL e
  valores capturados, não grep). 4 mutantes novos, **provados reprovando
  4/4** por passada filtrada depois do commit.
  ⚠️ **Existia um TERCEIRO call site real de `abrirCorrida` em
  `routes/videos.ts`** — dentro do handler de criação (`POST /videos`, ramo
  `ehFal`, ~linha 1214), com `video.id` já disponível no mesmo ponto que os
  outros dois. **NÃO foi tocado nesta rodada** (o pedido enumerava
  explicitamente só os dois de aprovação/recomposição) — **fechado no BLOCO
  N+2, §10.**

- `2e34ef3` — **Backlog 8, causa raiz eram DOIS defeitos empilhados, achados
  rodando o rehearsal Criar→Aprovar de verdade** (não só lendo código):
  1. `generateVideo()` (`avatarProvider.ts`) tinha `if (isFixtureMode())
     return generateVideoFixture(input);` ANTES do despacho por vendor.
     `generateVideoFixture` monta payload de FORMATO HEYGEN e nunca soube da
     fal — o retorno não tem `imagemCompostaUrl`, e `routes/videos.ts`
     recusa vendor fal sem esse campo com "a corrida terminou sem devolver a
     imagem composta". Em fixture, `generateVideoFal` nunca era alcançado
     para vendor fal. **Fix:** o ramo `if (input.vendor === "fal") return
     generateVideoFal(input);` subiu para ANTES do atalho de fixture —
     `generateVideoFal` não precisa dele, porque `runFalPipeline` chama
     `falSubmit`/`falPoll`/`falResult` e `synthesizeSpeech`, e cada uma já
     consulta `isFixtureMode()` sozinha.
  2. Uma vez alcançado, `falResult()` em fixture devolvia SEMPRE `{fixture:
     true, response_url}` — a mesma forma vazia para compor, animar e
     sincronizar. `falPipeline.ts` lê `saida.images[0].url` na composição e
     `saida.video.url` na animação/sincronia; nenhum existia, e a corrida
     quebrava no primeiro passo com "a composição concluiu sem devolver
     imagem" (mensagem parecida com a citada no pedido, mas de OUTRO
     arquivo — só alcançável depois de corrigir o defeito 1). **Fix:**
     `falSubmit` codifica o `endpointId` sem perdas (`encodeURIComponent`)
     na query da URL de fixture; `falResult` decodifica e devolve a forma
     certa por etapa (imagem para `nano-banana-2/edit`, vídeo para os
     outros dois). Literais duplicados de propósito em vez de importar
     `ENDPOINT_*` de `falPipeline.ts` — isso criaria ciclo (`falPipeline.ts`
     já importa de `falClient.ts`).
  Efeito colateral pego pelo próprio gate: o mutante `o if vira um terceiro
  braço do ternário` (`checkFalGenerationPathPolicy.ts`) tinha `find`
  ancorado em `RAMO_FAL` + retorno CONTÍGUOS — deixaram de ser contíguos com
  o bloco de comentário novo no meio. Reancorado só no retorno. **Provado
  reprovando** junto com o mutante da guarda "provedor: vendor respeita
  modo" (3/3, passada filtrada pós-commit).
  ⚠️ **SEM guarda nova de regressão para o Backlog 8 em si** — não foi
  pedida nesta etapa. Fica como dívida, no mesmo padrão dos "4 mutantes
  DEVIDOS" já registrados no §7.

**Rehearsal Criar→Aprovar, 100% fixture, MEDIDO ponta a ponta** (script
descartável, chamando `generateVideo`/`aprovarEAnimar`/
`runFalPipelineDaImagem` — os MESMOS exports que a rota chama — não HTTP: a
camada de sessão/auth não foi exercitada, só o serviço): saldo de ENSAIO
(`video_rehearsal`) do tenant `dev-c77a5b8a` foi de 492 para 491 (1 débito na
criação, nenhum na aprovação); saldo REAL (`video`) ficou intocado em 19;
compor US$0,08 + animar US$0,25 + sincronizar US$0,3673 previstos =
US$0,6173; `videoUrl` de fixture devolvido, sem erro.

**Gate final: 272 de 280 mutantes declarados casam 1x no alvo, exit 0.**
**NÃO rodada a passada completa (280 mutantes)** — por instrução explícita
desta rodada, fica para sessão isolada fora do horário de trabalho, árvore
já limpa.

HEAD final `2e34ef3`, árvore limpa.

---

## 10 · BLOCO N+2 (17/08/2026) — o terceiro call site (POST /videos, ramo
ehFal) fechado

**Custo: US$ 0,00.** Só leitura e edição de arquivo — nenhum arnês completo,
nenhum deploy, como pedido.

**Commit `5dad2a9`.** `video.id` confirmado em escopo no ponto da chamada
(linha 1122, bem antes da chamada em ~1214 — o INSERT do vídeo e o débito de
crédito já aconteceram, exatamente o que o comentário "GRAVAÇÃO ANTECIPADA"
já existente no fonte descrevia). Passar `videoId: video.id` aqui é o MESMO
padrão dos outros dois, não uma mudança de ordem de execução — não havia
razão para não forçar.

`abrirCorrida()` no ramo `ehFal` do handler de criação (`POST /videos`)
passou a levar `videoId: video.id`. G-E (`checkFalApprovalPolicy.ts`)
estendida dos dois call sites para os TRÊS: o terceiro recorte usa uma âncora
extra à esquerda (`}>("/videos", { preHandler: requireActiveTenant }`, a
mesma que `checkFalGenerationPathPolicy.ts` já usa para este handler) porque
a chamada ali é `? await abrirCorrida({` — braço de TERNÁRIO, não `const
runId = await abrirCorrida({` como nos outros dois; esse texto é
distinguível por si só. Mutante novo (`obvio`), **provado reprovando** junto
com os outros dois de G-E (3/3, passada filtrada pós-commit, árvore
conferida por hash contra HEAD em cada reversão).

**Gate final: 273 de 281 mutantes declarados casam 1x no alvo, exit 0.**
**NÃO rodada a passada completa** — por instrução explícita, mesma regra do
N+1.

**Consequência do fix:** `fal_pipeline_runs.video_id` deixa de ficar NULL
para gerações diretas pela fal (`POST /videos`) — antes só aprovação e
recomposição gravavam o vínculo, e é exatamente essa lacuna que o BLOCO N+1
tinha deixado registrada como dívida.

HEAD final `5dad2a9`, árvore limpa.

---

## 11 · BLOCO N+3 (18/08/2026) — logs de erro em POST /videos, arnês completo,
e três investigações de produção sem tocar código

**Custo: US$ 0,00 em toda a sessão.** Nenhum deploy, nenhuma chamada a
fornecedor, nenhum acesso à VPS de produção (SSH/SCP foram pedidos e
RECUSADOS — ver o item de memória `feedback_no_ssh_prod`, criado nesta
sessão: SSH e leitura de `.env` de produção são exclusivos do operador).

**1) Commit `fd1ba07`, MEDIDO por `git show`.** `POST /videos`
(`routes/videos.ts`) tinha 9 respostas 4xx/5xx no handler inteiro
(linhas 887-1524); 5 já logavam antes do `reply.send` (direto, ou via
`decidirEEstornar`/`encerrarComMotivo`, que sempre logam `video_falhou`
primeiro). As 4 sem log ganharam `logEvent("error", ...)`: readiness
bloqueada (`video_create_readiness_blocked`), teto diário
(`daily_generation_limit`), tradução da Interpretação sem credencial
(`direction_translation_unavailable`), e o catch de `DirectionTranslationError`
que motivou o pedido (`direction_translation_response_502`). Nenhum status
code, mensagem ao cliente ou fluxo mudou — só as 4 linhas de log. 21 inserções,
0 remoções, 1 arquivo.

**2) Arnês de mutação COMPLETO, MEDIDO: 281/281, exit 0, zero
INERTE/ERRO/AMBÍGUO/FALHOU.** Rodado em background (~35 min de parede) depois
do commit acima, com `git status` limpo antes e depois. Log em
`_arnes-logs/mutants-videos-logging-2026-08-17-2241.log`. Cobre também os
guardas que já exercitavam os três caminhos onde os `logEvent` novos entraram
— nenhum `expect` de guarda colidiu com o texto novo.

**3) Pacote de deploy gerado e ENTREGUE ao usuário (`SendUserFile`), não
publicado nem enviado à VPS.** `git archive --format=tar --prefix=twinai-deploy/
HEAD`, HEAD `fd1ba07` (confere), 41.256.960 bytes, sha256
`67c996aaacbfc3c27024f84357bb18b2be3d6327586aa4a6c24e0c3ace89839b` — MEDIDO
duas vezes por ferramentas independentes (`sha256sum` e `Get-FileHash` do
PowerShell), os dois batem. **Nota de processo:** uma resposta anterior desta
sessão colou o hash CORTADO em 1 caractere (63 em vez de 64) por erro de
transcrição — o valor acima é o verificado, não o da primeira colagem.

**4) Investigação — ENOENT no fornecedor fal, avatar "Mário" (`983c7de4…`).**
`readUpload()` ([storage.ts:24-27](backend/src/services/storage.ts:24)) lê
`avatars.photo_urls` do disco local (`config.uploadsDir`) só no caminho `fal`
([avatarProvider.ts:1163-1173](backend/src/services/providers/avatarProvider.ts:1163));
o caminho HeyGen nunca precisa disso. **MEDIDO no banco local:** o Mário tem
`provider: heygen` (foi treinado lá, não na fal) — a geração que falhou usava
`vendor: fal` porque a credencial ATUAL do tenant aponta para fal, não porque
o avatar foi feito para esse caminho. Os 3 arquivos de foto EXISTEM neste
ambiente local (`uploads/c77a5b8a…/*.jpg`, datados 16/07). **NÃO VERIFICADO:**
se esses arquivos existem no `uploads/` da VPS — `uploads/*` é gitignored, e
`git archive` (como o pacote do item 3) nunca inclui esse diretório; se o
`uploads/` de produção não foi populado por um caminho separado (rsync/scp),
o ENOENT lá seria esperado por construção, não regressão. Fica pergunta para
o operador, não investigada além disso (sem acesso à VPS).

**5) Investigação — prompt vazio na composição fal.**
`promptDaComposicao()` ([avatarProvider.ts:1103-1105](backend/src/services/providers/avatarProvider.ts:1103))
é `[scenarioPrompt, outfitPrompt].filter(Boolean).join(". ")`. Quando os dois
presets sem-customização são escolhidos juntos (frontend manda os dois `null`,
[GenerateStep.tsx:53,55](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:53))
E não há imagem de referência, o resultado é `""`, que a fal recusa (mínimo 3
caracteres). Causa raiz IDENTIFICADA por leitura; nenhuma correção aplicada
(pedido era só investigação).

**6) Investigação — `invalid_uid` da ElevenLabs, avatar "test um"
(`ecc3f232…`).** `voiceId` vem cru de `avatars.voice_id`
([videos.ts:1263](backend/src/routes/videos.ts:1263)) sem NENHUMA validação
de formato antes de `synthesizeSpeech()`. **MEDIDO por SELECT no banco
local:** o `voice_id` deste avatar é
`fixture-voice-2e8a3561-c2c1-440c-b2fe-dc00ad56bb8a` (50 caracteres) — o
formato exato que `fixtureProvider.ts:407` gera em modo fixture, bem
diferente de um id real da ElevenLabs (20 caracteres alfanuméricos, como o do
Mário ou do "TESTE REAL"). Hipótese mais provável: avatar clonado em fixture,
depois usado numa tentativa live sem reclonar de verdade. **NÃO VERIFICADO:**
se este é o mesmo avatar usado no vídeo `9704eb5f…` citado pelo operador — a
linha desse vídeo NÃO existe neste banco local (só existe em produção), então
a ligação avatar↔vídeo é plausível mas não confirmada por consulta direta.

**7) Escrito, NÃO EXECUTADO, NÃO COMMITADO:**
[backend/src/scripts/reconciliarVideo9704eb5f.ts](backend/src/scripts/reconciliarVideo9704eb5f.ts)
— reconciliação pontual do vídeo `9704eb5f-cf9e-419a-b261-cfeeabe6db33`
(tenant `c77a5b8a…` / `dev-c77a5b`), que ficou `error` sem estorno porque a fal
já tinha aceito o job antes da falha de voz. Confere tenant/slug, exige
`status='error'`, checa idempotência (sai sem duplicar se já houver
`reason='refund'` para este vídeo), lê o `credit_type`/`simulated` do débito
ORIGINAL antes de agir, e chama `refundCredit()` — nunca `UPDATE` cru. Arquivo
é **untracked** no git (`?? backend/src/scripts/reconciliarVideo9704eb5f.ts`).
**DECISÃO PENDENTE DO OPERADOR:** revisar o script, decidir se roda (na VPS,
não localmente — o vídeo é de produção), e se apaga depois.

⚠️ **PRÓXIMO PASSO DESTA LINHA DE TRABALHO:** decidir se este arquivo
(`ESTADO.md`) e o script do item 7 entram num commit, ou ficam como estão
(uncommitted) até a próxima sessão decidir. Nenhum dos dois foi commitado
nesta escrita — só o item 1 (`fd1ba07`) está no histórico do git.

HEAD no fim desta sessão: `fd1ba07` (sem novo commit desta seção).

---

## 12 · FASE 1 (reensaio) + FASE 2 "Modo B" (21/08/2026)

**Custo: US$ 0,00 na sessão inteira.** `PROVIDER_MODE=fixture` do início ao
fim, confirmado desarmado (processo E `docker compose config`) antes de
qualquer coisa. Nenhuma chamada real à fal.ai. Commits, em sequência a
partir de `b8164b4`: `5efeaa1` (Fase 2, backend), `fc6f7d6` (2 mutantes que
disparavam TS2367 em vez de reprovar — corrigidos), `2b27d3a`
(`PLANO-MESTRE-SEQUENCIAL.md`, novo). Este bloco (§12) é o quarto commit,
fechando a sessão.

### Fase 1 — ensaio dos 3 tiers, refeito por HTTP real

**A primeira tentativa NÃO contava como ponta a ponta e foi rejeitada pelo
operador**, corretamente: um script chamando `generateVideo`/
`aprovarEAnimar`/`runFalPipelineDaImagem` direto bypassa Fastify, sessão,
`evaluateGenerationReadiness`, o porteiro de vendor e a tradução da
Interpretação. **Refeito por HTTP de verdade** contra o processo rodando,
autenticado por uma sessão montada na tabela `sessions` e assinada com
`@fastify/cookie` + `config.sessionSecret` — **nunca com senha**: entrar
com senha para autenticar é ação vedada ao assistente sem exceção de
contexto, mesmo com autorização explícita do operador em chat. Ver o
gotcha novo no §3 abaixo.

`POST /videos` (201) → `POST /videos/:id/approve` (200, parou em
`awaiting_approval_video`) → `POST /videos/:id/approve-video` (200,
`ready`), nos 3 tiers. `tier_video` conferido por SELECT fresco no banco
DEPOIS do fluxo completo (não só na resposta do POST): `simples`/`normal`/
`premium`, os três batendo. Motor conferido pelo diário real das 3
corridas: `normal`/`simples` → `wan/v2.6/image-to-video/flash`; `premium`
→ `bytedance/seedance-2.5/reference-to-video`.

**Teto do Premium provado isolado do global**: `PIPELINE_TETO_USD_PREMIUM`
baixado para US$ 1,00 só para o teste (revertido antes do commit, `git
diff` conferido vazio, imagem reconstruída de novo), a etapa `animar` do
Premium recusou citando literalmente **"acima do teto de US$ 1.00"**
enquanto Simples/Normal seguiram em `tetoUsd:2` — a régua de teto lida é
`PIPELINE_TETO_USD_PREMIUM`, não `PIPELINE_TETO_USD`.

### Fase 2 ("Modo B") — segunda aprovação, o vídeo mudo

Reusa `pararApos` (já existente no `falPipeline.ts`, antes só `"compor"`
tinha caminho de produto) com o valor `"animar"`: a corrida para depois do
vídeo ANIMADO e MUDO, antes de narrar+sincronizar.

- Migration 059: `awaiting_approval_video` no `CHECK` de `videos.status`,
  coluna `fal_muted_video_url`.
- `falPipeline.ts`: `animarNarrarSincronizar` para em `animar` quando
  `pararApos==="animar"`; `narrarSincronizar` extraída (as etapas 3–5, dois
  chamadores); `runFalPipelineDoVideoMudo` novo — retoma direto de um vídeo
  mudo conhecido, `gastoAcumuladoUsd` zerado (mesma razão de
  `runFalPipelineDaImagem`), NÃO rechama `animar`.
- `routes/videos.ts`: `/approve` passa a passar `pararApos: "animar"`
  (parava em `ready`, agora para em `awaiting_approval_video`);
  `/approve-video` novo (retoma, completa); `/redo-video` novo (reroda só
  `animar`, via `runFalPipelineDaImagem` com `pararApos:"animar"` forçado
  — reusa o mecanismo do "Refazer" da imagem, não duplica lógica).
- `recovery.ts`: `awaiting_approval_video` entra em `STATUS_VARRIDOS`,
  tratado como `awaiting_approval` (ignorado se recente, expira SEM
  estorno se velho), com mensagem PRÓPRIA
  (`MENSAGEM_APROVACAO_VIDEO_EXPIRADA`) — testada por mutante dedicado, não
  reaproveita a mensagem da imagem.
- `routes/jobs.ts`, `routes/notifications.ts`: `awaiting_approval_video`
  somado aos estados "pendente de ação".

**5 mutantes provados reprovando** (4 novos em
`checkFalVideoApprovalPolicy.ts` + 1 reancorado em
`checkFalApprovalPolicy.ts`), passada filtrada pós-commit, árvore
conferida limpa em cada reversão. **Passada COMPLETA depois: 296/296, zero
INERTE/AMBÍGUO/ERRO** — HEAD `fc6f7d6`, log em
`_arnes-logs/mutants-fase2-completa-2026-08-21-{a,b}.log`, md5
`99dfb1959afd61966e91e20cc344e28a` nas duas cópias.

Ensaiado ponta a ponta duas vezes: por chamada direta às funções de
serviço (criar → aprovar imagem, para em `animar` → refazer o vídeo mudo
→ aprovar vídeo, retoma sem reanimar — confirmado pelo `run_id` da
aprovação final não ter etapa `animar` nenhuma no diário), e depois pela
Fase 1 refeita por HTTP (acima), que exercitou `/approve` e
`/approve-video` pela ROTA real.

⚠️ **CONSEQUÊNCIA ACEITA, não regressão descoberta depois do fato — mas
REAL enquanto durar:** o frontend atual (`frontend/src/types.ts`,
`GenerateStep.tsx`) não conhece `awaiting_approval_video` — o botão
"Aprovar" só aparece com `video.status === "awaiting_approval"` (a string
exata). **Todo vídeo fal aprovado hoje pela tela atual fica preso em
`awaiting_approval_video` sem nenhum botão para avançar**, até a UI do
Modo B existir. Mostrado ao operador nesta sessão via pergunta estruturada
(mecanismo de UI de escolha, não mensagem de chat digitada — ver a
ressalva sobre timestamp/proveniência dessa confirmação registrada na
conversa desta sessão); ele optou por seguir sem UI nesta rodada. Sem
teste pago: a primeira aprovação real (`/approve` parando em `animar`,
depois `/approve-video` completando) contra o fornecedor de verdade segue
NÃO VERIFICADA.

**UI do Modo B e teste pago ficam para o próximo bloco** — não iniciados
nesta sessão, por instrução explícita.

---

## 13 · Cartão Simples + multi-vendor de avatar, Fases A e B (22/08/2026)

**Custo: US$ 0,00.** `PROVIDER_MODE=fixture` do início ao fim; migration 060
aplicada só no banco de DEV, nunca produção.

**Achado em ensaio manual pelo operador**: tenant fal-only escolhe o cartão
"Simples" e recebe um vídeo idêntico ao "Normal" — mesmo motor (Wan), mesmo
custo, sem aviso. Causa raiz confirmada por leitura + execução:
`videoTierParaPipeline` (`falPipeline.ts`) só conhece `"normal"`/`"premium"`
como `PipelineTier`, e o vendor (heygen/fal) já é decidido por
`routes/videos.ts` pela credencial FIXA do tenant, antes de `tier_video` ser
consultado. Correção IMEDIATA (`a03d6ab`, escopo fechado — sem mexer no
roteamento): `GenerateStep.tsx` consulta `GET /credentials` e desabilita o
cartão "Simples" quando o avatar não está no vendor HeyGen, com legenda que
nunca nomeia o fornecedor. 3 mutantes (`checkTierAvailabilityPolicy.ts`,
lógica avaliada), gate verde, `tsc` limpo nos dois lados.

**Decisão de produto que isso abriu**: tenant vai poder ter MAIS DE UM
vendor de avatar ao mesmo tempo, e `tier_video` decide qual usar por vídeo.
Plano em 4 fases (A/B/C/D), cada uma aprovada explicitamente antes da
próxima — ver [PLANO-MESTRE-SEQUENCIAL.md §2.5](PLANO-MESTRE-SEQUENCIAL.md)
para o detalhe completo de cada fase. Resumo:

- **Fase A (fechada, `20a4240`)** — migration 060: `api_credentials` troca
  `UNIQUE (tenant_id, provider)` por três índices parciais —
  `api_credentials_tenant_provider_key` (voice/script, mesma garantia de
  sempre), `api_credentials_tenant_avatar_vendor_key` (avatar, uma linha
  por vendor, `NULLS NOT DISTINCT` preserva as linhas legadas sem vendor),
  `api_credentials_tenant_avatar_default_key` (no máximo uma linha
  `is_default=true` por tenant — PROPOSTO pelo assistente além do pedido
  original, aprovado pelo operador: "prefiro erro alto e imediato a
  não-determinismo silencioso em produção"). Coluna `is_default` nova,
  backfill automático via `ADD COLUMN ... DEFAULT true` (sem `UPDATE`
  separado). Verificado por SELECT fresco (102 linhas antes/depois, hash
  idêntico) + os 3 índices testados AO VIVO numa transação revertida.
  **Sem mutante declarado** — mutar o texto da migration não afeta o schema
  já aplicado (`npm run check` não roda migrations de novo); seria
  estruturalmente INERTE, o defeito que este projeto proíbe.
- **Fase B (fechada, `5192168` + `4c5b66c`)** — admin "Integrações por
  tenant" vira multi-seleção para avatar. Backend (`adminPanel.ts`): o
  `PUT` de credenciais bifurca por provider, mirando o índice parcial
  certo em cada `ON CONFLICT`; a primeira credencial de avatar do tenant
  nasce `is_default=true`, as seguintes nascem `false`;
  `/credentials/:provider/test` aceita `?vendor=`. Frontend:
  `AvatarCredentialsCard.tsx` (novo, compartilhado entre os dois editores
  que já existiam) — uma linha por vendor configurado + bloco para
  adicionar um vendor novo; `updateCredential` corrigido nos dois arquivos
  para casar por `(provider,vendor)` só no avatar. **Verificado por HTTP
  real** (sessão de admin montada no banco, nunca senha): heygen primeiro
  → `is_default:true`, fal segundo → `is_default:false`, resalvar heygen
  → `is_default` intacto, GET final com as duas linhas, teste por vendor
  funcionando. 6 mutantes novos (`checkAvatarMultiVendorPolicy.ts`), todos
  provados reprovando.
- **Fase C (NÃO INICIADA)** — os 3 call sites de `routes/videos.ts`
  (criação, aprovação, `rearmVideoPolling`) passam a escolher a credencial
  pelo vendor exigido pelo `tier_video`, não mais pela credencial fixa do
  tenant. Bloqueada por aprovação explícita do operador.
- **Fase D (NÃO INICIADA)** — primeiro vídeo tier Simples de verdade
  roteando pra HeyGen, ainda em fixture. Bloqueada até C ser aprovada.

**Dois achados reais no caminho da Fase B, os dois corrigidos antes de
fechar — viram gotchas no §3 abaixo**: (1) um bug genuíno de produto — a
rota de credenciais devolvia 500 (`42P10`, `ON CONFLICT` sem `WHERE`
casando nenhum índice) porque o backend não recarrega sozinho; (2) uma
guarda MINHA saiu INERTE porque a checagem casava com um comentário, não
com o código.

⚠️ **Verificação visual pelo navegador ficou bloqueada nesta sessão
inteira** (correção do cartão Simples e Fase B) — mesmo cookie de sessão
que autentica com sucesso direto contra o backend falha em toda tentativa
pela automação de navegador. NÃO investigado a fundo (Traefik descartado
como causa). Toda verificação de UI desta sessão foi por HTTP direto, nunca
por captura de tela. Ver gotcha detalhado no §3.

---

## 14 · Fase C do multi-vendor de avatar (22/08/2026) — o vendor sai do
tier_video, não mais da credencial fixa do tenant

**Custo: US$ 0,00.** `PROVIDER_MODE=fixture` do início ao fim, mesma sessão
que fechou as Fases A e B (§13). Três commits em sequência a partir de
`4c5b66c`: `ed4e634` (implementação), `de1258b` (3 `expect` de guarda eram
paráfrase da mensagem real, não transcrição, mais 1 mutante planejado que
faltava por inteiro), `50324c6` (1 mutante saía AMBÍGUO por remover
narrowing do TypeScript, mesma família do gotcha "`if (false && …)`" já
registrado neste arquivo).

**O que mudou, `ed4e634`:** antes, os 3 call sites de `routes/videos.ts`
que precisam de credencial de avatar (criação, aprovação,
`rearmVideoPolling`) chamavam `getCredential(tenantId, "avatar")` — "a
credencial do tenant", sem `ORDER BY` determinístico e sem saber de vendor.
Com a Fase B permitindo dois vendors por tenant (heygen + fal), isso virou
ambíguo. Agora:

- `vendorRequiredByTier` (novo, `credentialLookup.ts`) mapeia
  `"simples" → heygen`, `"normal"/"premium" → fal`.
- `getCredentialForVendor` (novo) busca a credencial de avatar de UM vendor
  específico — os 3 call sites passam a chamar esta, não a genérica.
- `getCredential` (a genérica) ganhou `ORDER BY is_default DESC LIMIT 1` —
  ela continua servindo os outros 11 call sites não-tier-aware, e sem o
  `ORDER BY` o Postgres não prometia qual das duas linhas (heygen/fal)
  viria com dois vendors configurados.
- Credencial ausente para o vendor exigido pelo tier vira **400
  `tier_vendor_unavailable`** nos 3 call sites, **antes de qualquer
  débito** — nunca fallback silencioso para o outro vendor, nunca crash.
- **Frontend (`GenerateStep.tsx`):** a restrição do cartão "Simples"
  (commit `a03d6ab`, §13) virou SIMÉTRICA — "Normal"/"Premium" também
  desabilitam sem credencial fal configurada, mesma legenda neutra (nunca
  nomeia o fornecedor). Um `useEffect` novo troca o tier selecionado para
  um disponível quando o atual deixa de ser — sem ele, um tenant
  heygen-only bateria na recusa do servidor ao clicar em Gerar com o
  default "normal" nunca tocado pela pessoa.

**As duas correções, cada uma um gotcha registrável:**

- `de1258b` — 3 `expect` de `checkTierAvailabilityPolicy.ts` saíam
  AMBÍGUOS na passada filtrada porque o texto esperado era paráfrase da
  mensagem real ("o cartão" vs "um cartão", palavra inserida, frase da
  condição reescrita) — a mesma regra de sempre (`expect` é transcrição
  literal, nunca paráfrase) pegou a própria guarda desta rodada. Também
  faltava por inteiro o 7º mutante planejado de `checkTierVendorPolicy.ts`
  (`rearmVideoPolling` ignorar `provider_vendor` e voltar a usar sempre a
  credencial default) — não é que ele saísse INERTE, é que **não existia**:
  a guarda tinha execução saudável provada, mas nenhum mutante quebrava o
  código para provar a reprovação.
- `50324c6` — apagar o bloco `if (!avatarCredential) {...}` inteiro (o
  jeito "óbvio" de mutar essa guarda) removia o narrowing do TypeScript e o
  `tsc` reprovava por **TS18047** antes de a guarda opinar — nova variante
  do gotcha "`if (false && …)`" (lá era TS2367, aqui TS18047; mesma
  família: o compilador barra o mutante antes do runtime). Corrigido
  trocando de mutante "óbvio" para "esperto": o `if` fica, só o corpo muda
  para um 500 genérico (preserva o narrowing, e o corpo genérico ainda é
  uma reprovação real — perde a mensagem `tier_vendor_unavailable` que a
  tela precisa para orientar a pessoa).

**Mutantes: 10 novos/reescritos** (7 em `checkTierVendorPolicy.ts`, novo —
6 declarados em `ed4e634`, o 7º completado em `de1258b`; 3 em
`checkTierAvailabilityPolicy.ts`, que ganhou a reescrita de G-1 para avaliar
os dois predicados — cartão disponível E tier selecionável — por execução
em vez de só por forma). Registro total: **305 → 315**, confirmado por
`--list` nesta escrita (§ acima). **Gate relatado nesta sessão: 307/315
verde** — não é a passada completa (essa segue sem rodar desde `fc6f7d6`,
ver o aviso no topo deste arquivo); `tsc` limpo nos dois lados
(backend/frontend) em cada um dos 3 commits.

⚠️ **PENDÊNCIA REGISTRADA, NÃO INVESTIGADA — não inventar resposta.** Ao
fechar a Fase C ficou em aberto se o avatar HeyGen de um tenant é
**genérico** (um avatar serve para qualquer vídeo, o que a Fase C já
assume implicitamente ao tratar "a credencial heygen do tenant" como uma
coisa só) ou se, na prática de uso, um tenant vai precisar de **múltiplos
avatares HeyGen** para casos que hoje não têm modelagem nenhuma no
multi-vendor — troca de traje, troca de cenário, ou avatares com
movimento diferente. A Fase A/B/C resolveram "qual VENDOR" (heygen × fal)
por tier; **não resolveram "qual AVATAR dentro do mesmo vendor"** para
esses casos. Sem medição nem decisão de produto ainda — fica para quando o
operador quiser abrir essa linha.

**Fase D (validar HeyGen ponta a ponta pela primeira vez) segue NÃO
INICIADA — parado aqui por instrução explícita do operador nesta sessão.**
Nenhum código tocado além dos 3 commits acima; nenhuma passada completa do
arnês lançada; nenhuma chamada real a fornecedor.

---

## 1 · Onde o repositório está

*(o último commit desta lista é sempre o penúltimo do repositório: o próprio
commit que atualiza este arquivo não caberia dentro dele. `git log -3
--oneline` fecha a diferença.)*

> **Esta lista é conferida por máquina desde 24/08 — `npm run estado`.** Ela
> compara o penúltimo commit do repositório contra os hashes abaixo e acusa
> ponteiro velho. Roda também no começo de toda passada do arnês. Ver §17.

```
0493235  Scripts de sondagem manual (RODADA 4-20, 29-31/08) — preservados, não removidos
fd222d8  docs-internal: composição de referência oficial do avatar de teste (31/08)
ca91495  Guardas: texto de prova em inglês, para não disparar o linter do Wan
cab08cb  Guarda: URL local não vaza à fal, e o payload enviado fica auditável (RODADA 1, 29/08)
44003a8  Bugs D/E: direção por janela em Normal fracionado + cláusula de pose/roupa (RODADA 2/3, 29/08)
cd43ec3  Guardas: seed compartilhado, linter do Wan e aspect_ratio por bloco (29/08)
a2c4be3  Tier Normal migra para wan/v2.6/reference-to-video/flash (item 2, 29/08)
ff79467  Linter do Wan: corrige /\bvocê\b/i e /\bestá\b/i, que nunca reprovavam nada
```

⚠️ **SÉTIMA divergência, MEDIDA em 31/08/2026 (V24) — a maior distância já
registrada: 47 commits, não 4 ou 8.** O topo da lista acima estava em
`bc38394` (fechamento de 24/08); entre ele e o início desta sessão (HEAD
`ff79467`) o repositório recebeu 6 sessões inteiras não refletidas aqui —
W1 (herança de credencial por plataforma), B0/V0/W2/W3, W4, e toda a linha
de trabalho do tier Normal registrada só no CLAUDE.md (§6, fechamentos de
25 a 28/08) e em comentários de código datados de 29-31/08 (migração para
`wan/v2.6/reference-to-video/flash`, Bugs D/E, RODADA 6). **Também estava
VELHA no início desta MESMA sessão** (banner do topo do arquivo dizia
`23/08`/`b00b744`, HEAD real já era `ff79467`) — a divergência não nasceu
nesta sessão, só foi medida e corrigida nela. `npm run estado` (existe
desde 24/08, ver comentário abaixo) não rodou em nenhuma das 6 sessões
intermediárias, ou rodou e o aviso não virou correção — as duas hipóteses
têm a mesma consequência e nenhuma foi investigada aqui. **Reforça o padrão
que a ferramenta já registrava: o commit de fechamento é estruturalmente o
mais fácil de esquecer**, e agora com um agravante — passou a valer também
entre CONTAS diferentes, não só entre sessões da mesma conta. Registrado em
[docs-internal/08-ocorrencias.md](docs-internal/08-ocorrencias.md).
`BACKLOG.md` estava na MESMA situação — `revisado-em` 45 commits atrás,
fora da janela desta §1 — e não foi tocado nesta rodada (fora do escopo
pedido).

⚠️ **A conferência do R8 acusou a §1 mais DUAS vezes em 24/08** — sempre no
mesmo ponto: o fechamento escreve o commit do ESTADO.md, e o commit SEGUINTE
(o ponteiro do arnês) já a desancora. Não é desatenção: é estrutural, e é o
que a ferramenta existe para pegar. As duas foram corrigidas antes de a
sessão fechar, e nenhuma delas dependeu de alguém notar.

⚠️ **SEXTA divergência — e a mais reveladora, porque foi a conferência nova que
a pegou, minutos depois de a quinta ter sido corrigida à mão.** Em 23/08 esta
lista foi reancorada com topo em `043caf6`; o MESMO fechamento escreveu mais
dois commits depois (`03aa59d`, `ca49361`) e a lista voltou a mentir na mesma
sessão que a consertou. É a prova de que o problema nunca foi desatenção de
uma sessão específica: **o commit de fechamento é estruturalmente o último a
ser escrito e o primeiro a ser esquecido.** Foi por isso que a §17 parou de
pedir atenção e passou a medir.

⚠️ **QUINTA divergência, registrada em 23/08 (segunda sessão do dia).** A lista
acima estava com topo em `50324c6`, **quatro commits atrás do HEAD real**: os
dois da sessão de 23/08 (`b679ea2`, `b00b744`) e o do gatilho (`818ca10`)
entraram sem que ela fosse tocada — a §15 daquela sessão descreveu o trabalho
e deixou a âncora velha. É exatamente o modo de falha que o aviso abaixo já
descrevia, acontecendo mais uma vez no arquivo que o descreve. **Confira
`git log -3` antes de confiar nesta lista.**

⚠️ **QUARTA vez que esta lista divergiu do HEAD** — a lista anterior (topo em
`bfd5364`, 13/08) sobreviveu intacta até esta reescrita em 21/08, oito
commits atrás do HEAD real por semanas. O registro das ocorrências
anteriores e o padrão que as une está em
[docs-internal/08-ocorrencias.md](docs-internal/08-ocorrencias.md) (não
atualizado com esta quarta ocorrência — fica como dívida). Quem lê esta
seção confiando nela e não confere `git log` recebe um mapa de outro
repositório: **conferir a âncora é o primeiro comando da sessão**, não o
último.

⚠️ **A mensagem de `5a6cbbc` AFIRMA que os 4 mutantes foram provados; não
foram** — a prova veio depois e devolveu 1/4. `94af14f` corrige e declara.
Ao ler aquele commit, leia os dois. (Os dois estão FORA da janela acima desde
esta correção; a nota fica porque o defeito que ela descreve é da mensagem do
commit, e mensagem de commit não se reescreve.)

**ORDEM DE EXECUÇÃO do plano v6:**

| bloco | estado |
|---|---|
| 1 · chave da fal no painel | fechado (`9d2d1e6`) |
| 2 · a chave não vaza por nenhum lado | fechado (`9d2d1e6`) |
| 3 · `falClient` (upload, submit, poll, result) | fechado (`cbe0e10`) |
| 3.5 · prova de contrato | fechado (`e886c5d`) — o contrato está MEDIDO, ver §1.3 |
| 4 · pipeline em série — parte 1 (orquestrador) | fechado (`5a6cbbc`+`94af14f`) |
| 4 · parte 2 — o ramo por vendor | fechado no **B2** (ver §1.4) |
| B3 · onde o débito mora, e o caminho de produto | fechado (`c849b50`+`ff9628e`) |
| 5 · a tela (aprovação da imagem composta) | fechado no **B3** (`awaiting_approval`, rotas de aprovar/refazer) |
| BLOCO B5 · vídeo de 10 s pelo Wan — direção ligada, `sync_mode: cut_off`, `model` do lipsync | fechado (`1f4b0d4`…`5ccd090`) |
| BLOCO B5c · cenário/traje no fluxo de avatar EXISTENTE | fechado (`dfd5657`+`cf8d869`) |
| **COMPOR-1 · a composição paga, ponta a ponta pela tela** | fechado (ver §1.6) — **a animação bateu em 404** |
| **ENDPOINTS-2 · o candidato do id do Wan foi testado por fusível** | fechado (ver §1.7) — **também 404, id correto SEGUE não encontrado** |
| **ENDPOINTS-3 · o id certo (sem prefixo `fal-ai/`), MEDIDO por fusível, aplicado e restart feito** | fechado (ver §1.8) — **`de2a366e` segue aprovável, nunca aprovada de verdade** |
| ~~PRÓXIMO · aprovar `de2a366e` de verdade~~ | **SUPERADO** — `de2a366e` não foi tocado; o produto seguiu para o BLOCO A antes disso ser retomado. Estado atual daquela linha NÃO VERIFICADO nesta sessão. |
| BLOCO A · sistema de níveis (Simples/Normal/Premium), tier_video, teto próprio do Premium | fechado (`c066168`+`a1c8d46`), completa 292/292 |
| FASE 1 · ensaio dos 3 tiers, ponta a ponta por HTTP real | fechado 21/08 — ver §12 |
| FASE 2 "Modo B" · segunda aprovação (vídeo mudo), backend | fechado 21/08 (`5efeaa1`+`fc6f7d6`), completa 296/296 — ver §12. **UI e teste pago NÃO iniciados.** |
| multi-vendor de avatar · cartão Simples desabilitado sem HeyGen | fechado 22/08 (`a03d6ab`) — ver §13 |
| multi-vendor de avatar · Fase A (migration 060, índices parciais) | fechado 22/08 (`20a4240`) — ver §13 |
| multi-vendor de avatar · Fase B (admin multi-seleção) | fechado 22/08 (`5192168`+`4c5b66c`) — ver §13 |
| multi-vendor de avatar · Fase C (vendor pelo tier_video, 3 call sites) | fechado 22/08 (`ed4e634`+`de1258b`+`50324c6`) — ver §14. **Fase D NÃO iniciada, parado por instrução do operador.** |
| 6 · custo por camada, régua `(provider, model, resolution)` | não começado |

### 1.1 · BLOCO 4, o que falta

> ⚠️ **SUPERADA pela §1.4 (B2).** A parte 2 está fechada: o ramo existe, e o
> orquestrador continua inalcançável por usuário — agora por DECISÃO explícita
> (o porteiro), e não por ausência de código. O que segue valendo desta seção é
> só o parágrafo do `consumeLiveGeneration()`.

~~A **parte 2** é o ramo de despacho por vendor em `avatarProvider.ts:1007`, que
hoje atende só `heygen`/`did`.~~

Segue pendente: `consumeLiveGeneration()` nas submissões pagas (o `falClient`
**não** o chama, de propósito — o orquestrador tampouco, e é ele quem deve). O
ramo da fal está FORA do `withLiveBudget`, e a razão está na §1.4.

### 1.2 · A FIAÇÃO DA TELA NÃO ALCANÇA A FAL — medido em 13/08

> ⚠️ **PARCIALMENTE SUPERADA pela §1.4 (B2).** Três dos seis pontos abaixo
> deixaram de valer: cenário e traje agora ATRAVESSAM até o provider (item 1e),
> o rosto sai de `photo_urls` **pelo fluxo** e não só pela sonda, e o ramo por
> vendor existe. O que continua exato é o descompasso ESTRUTURAL (`generateVideo`
> devolve job id + polling; `runFalPipeline` é síncrono) — é ele que faz o B3
> ser construção, e é por isso que o porteiro recusa a fal na rota.

**A chave está semeada e o contrato da fal foi medido de verdade** (ver §1.3).
O que impede um vídeo sair de "Criar vídeo direto" é a FIAÇÃO, e ela é assim:

- **Cenário vai para `background{type,value}` — campo do HeyGen.** Não há
  caminho para o `image_urls[]` do `nano-banana-2/edit`.
- **Traje vai para `avatar_look_id` — look do HeyGen**, que lá SUBSTITUI o
  avatar. **Não chega à fal.**
- **O rosto usado nas composições veio de `photo_urls` do avatar cadastrado**,
  lido direto pela sonda — **não de upload do fluxo**.
- **`generateVideo` devolve `providerJobId` + polling em `setInterval`;
  `runFalPipeline` é SÍNCRONO e tem 3 `request_id`.** É descompasso
  ESTRUTURAL: o ramo em `avatarProvider.ts:1007` é **CONSTRUÇÃO** (estado novo
  em `videos`, rota de aprovação, tela), **não refiação**.
- **O teto de 95 caracteres NÃO é cobrado**: tela e rota usam **1960** (180 s).
  O 95 só existe dentro do pipeline, que nenhum caminho de produto chama.
- **Crédito de avatar do tenant `c77a5b8a` está em 10**, concedido pelo caminho
  normal (`dev:grant-credits`), com saldo e ledger conferindo.
- **Chave da fal semeada** (`api_credentials`, provider avatar, vendor fal,
  last_four **cc1c**). O **backup cifrado da HeyGen** daquele tenant está em
  `uploads/_prova/backup-credenciais/heygen-c77a5b8a.enc` — a HeyGen NÃO deve
  ser restaurada (decisão do v6).
- **Gasto da sessão de 13/08: ~US$ 0,24. Saldo restante ~US$ 4,46.**

⚠️ **A composição pendente foi DESCARTADA pelo operador** — rosto de outro
avatar, cenário e traje nunca chegaram à fal. As 3 corridas em
`fal_pipeline_runs` estão `failed` com o motivo escrito, 1 etapa cada: nenhuma
passou de `compor`. **Nada de Wan, TTS ou lipsync rodou.**

### 1.3 · BLOCO 3.5 — o contrato da fal, MEDIDO

**A chave foi semeada em 13/08** (estava no ambiente como `FAL_KEY`, não
`FAL_API_KEY`) e o pipeline chamou a fal DE VERDADE. O contrato saiu de
DEDUZIDO para MEDIDO, e duas suposições estavam erradas:

1. **`falPoll` MONTAVA a URL de status — e a montada devolve 405.** O caminho
   usa o app id **BASE** (`fal-ai/nano-banana-2`), sem o sub-path (`/edit`). A
   fila devolve `status_url`/`response_url`/`cancel_url` prontas: **seguir é o
   contrato**. Corrigido em `e886c5d`.
2. **`resolution: "720p"` é inválido no nano-banana** — ele exige
   `0.5K|1K|2K|4K`. Agora são duas constantes (`RESOLUCAO_IMAGEM = "1K"`
   MEDIDO, `RESOLUCAO_VIDEO = "720p"` NÃO VERIFICADO no Wan).

⚠️ **E o achado que muda como se lê a fila: `COMPLETED` NÃO significa sucesso.**
A submissão inválida voltou **200 / IN_QUEUE**, o status foi a **COMPLETED**, e
só o **RESULTADO** trouxe o 422 — com `inference_time: 0.058`, o tempo de não
ter feito nada. Quem lê só o status segue para a etapa seguinte, que custa 12×
mais.

**MEDIDO no caminho feliz:** `IN_QUEUE` → `IN_PROGRESS` (HTTP **202**) →
`COMPLETED` (200); `images[0].url` como o pipeline assume; `num_images:1`
devolvendo 1 imagem; `resolution:"1K"` → 1195×896; `inference_time` de 7,99 s e
21,40 s em duas composições. Host dos artefatos: **`v3b.fal.media`** — o mesmo
das gerações que o operador aprovou fora do produto.

**O upload NÃO é tarifado e funciona**: `initiate` 200 com `file_url` +
`upload_url`, header `Authorization: Key` aceito, `PUT` 200.

**Todo o resto está pronto:** teto duro no orquestrador, `pararApos` por etapa,
a sonda (`probeFalPipeline.ts`) e o semeador (`seedFalKey.ts`). O passo a passo
com os comandos exatos está em **[PROXIMA-RODADA.md](PROXIMA-RODADA.md)** — é
por ele que se começa.

**MEDIDO nas duas rodadas, por consultas independentes:**

- `SELECT count(*) FROM api_credentials WHERE vendor='fal'` → **0**
- nenhuma linha de `api_credentials` tocada desde 09/08
- `platform_credentials` contém **só** `elevenlabs`

O caminho de gravação existe e aceita `fal` desde o BLOCO 2:
`PUT /admin/tenants/:tenantId/credentials/:provider` com `provider=avatar` e
`vendor=fal` (`adminPanel.ts`). **A rota do TENANT não serve** — `PUT
/credentials/:provider` devolve 403 `managed_by_platform` desde a migração
BYOK→plataforma.

⚠️ **Atenção ao gravar:** a rota faz `ON CONFLICT (tenant_id, provider) DO
UPDATE`, e o par é (tenant, provider) — **um tenant tem UMA credencial de
`avatar`**. Gravar `fal` num tenant que já tem `heygen` SUBSTITUI a chave da
HeyGen dele. Use um tenant de teste, ou aceite a troca conscientemente.

Assim que a chave existir, o 3.5 é: `falUpload()` com um arquivo pequeno,
`initiate` + `PUT`, e confrontar a resposta crua com o que o `falClient`
assume (nomes de campo, formato do header `Authorization: Key`, forma do
`file_url`, status). **O upload não é tarifado** — é a única chamada real que
esta fase autoriza.

### 1.4 · BLOCO B2 — o caminho da fal alcança o produto, e PARA na composição

**Fechado em 13/08.** Custo: **US$ 0,00** — nenhuma chamada a fornecedor, nem
uma. A prova é por fixture, por `fetch` substituído e por `pararApos`.

**A DECISÃO DO RECOVERY, registrada como decisão e não como acidente:** nesta
rodada a composição **NÃO cria linha em `videos`**. Ela grava só em
`fal_pipeline_runs`/`fal_pipeline_steps`. Motivo MEDIDO por leitura **no B2**:
`recovery.ts` encerrava como `recovery_orphan` qualquer vídeo sem
`provider_job_id`, **em qualquer idade** — e uma corrida que para em `compor`
não tem job id de VÍDEO nenhum para dar. Sem linha em `videos`, não há colisão.

> ⚠️ **ESTE PARÁGRAFO DESCREVE O B2 E FOI SUPERADO PELO B3 — corrigido em
> 14/08 (EXPOSICAO-1), depois de a referência falsa sobreviver a quatro
> rodadas.** A afirmação era exata quando escrita; hoje ela é o oposto do
> código, e sustentava uma decisão de DINHEIRO — daí a correção valer commit
> próprio. O que vale HOJE, MEDIDO por leitura em 14/08:
>
> - **A composição CRIA linha em `videos`**, em estado próprio
>   `awaiting_approval` ([videos.ts:1337](backend/src/routes/videos.ts:1337)),
>   com `provider_job_id` já gravado ([:1298](backend/src/routes/videos.ts:1298)
>   — o `request_id` do `compor`).
> - **`awaiting_approval` é varrido de propósito para ser IGNORADO**
>   ([recovery.ts:77](backend/src/services/video/recovery.ts:77)), e o ramo que
>   o trata vem **ANTES** do ramo do órfão
>   ([:297](backend/src/services/video/recovery.ts:297) contra
>   [:319](backend/src/services/video/recovery.ts:319)). Dentro de 24 h a linha
>   é deixada em paz com log.
> - **Nem ao expirar há estorno:** acima de 24 h vira `approval_expired`, e
>   `classificarGasto` trata esse motivo **antes** do teste de `temJobId`,
>   devolvendo `"saiu"`
>   ([videoFailure.ts:121](backend/src/services/video/videoFailure.ts:121)) —
>   `decidirEstorno` retorna `estorna: false`. A composição paga não gera
>   crédito de volta, por construção.
>
> **A referência `recovery.ts:211` não deve ser reusada em lugar nenhum:** a
> linha 211 hoje é `requestedUnitCount: linha.duration_seconds`, que não tem
> relação com órfão. É o caso exemplar da regra do §3 — âncora por NÚMERO DE
> LINHA apodrece em silêncio; âncora por NOME (`recovery_orphan`,
> `STATUS_AGUARDANDO_APROVACAO`) sobrevive ao arquivo ser reescrito.

**Consequência aceita: o débito único no `compor` SAI desta rodada e vira
decisão do B3.** Não foi esquecimento — é o preço da decisão acima: o débito
vive na rota, a rota não é o caminho que alcança a fal hoje, e inventar um
débito no orquestrador criaria um segundo lugar que cobra.

**A fal está FORA de `VENDORS_WITH_GENERATION_PATH`, mesmo tendo ramo.** É a
mesma decisão vista da rota: `POST /videos` INSERE a linha em `videos` antes de
chamar o provider, então deixar passar produziria exatamente a colisão que a
decisão evita. Quem alcança o ramo hoje é a **sonda**, que não passa pela rota.
Ligar o caminho de produto é o B3, e ele começa decidindo onde o débito mora.

**O TETO DE 95 CARACTERES deixou de ser literal.** Agora é
`floor(PIPELINE_TARGET_SECONDS × PIPELINE_CHARS_PER_SECOND ÷ (1 + 0,1436))` =
`floor(108,9 ÷ 1,1436)` = `floor(95,2256)` = **95**. Divide-se (em vez de
multiplicar por 0,8564) porque o teto é o que cabe no clipe **no pior caso do
ritmo**: se a voz sair 14,36% mais lenta, os 95 caracteres ainda cabem nos 10 s.

⚠️ **A dispersão de 14,36% é NÃO VERIFICADA neste repositório.** Ela foi FIXADA
no desenho do B0+B1 e a medição que a produziu não está registrada aqui —
nenhuma tabela deste projeto a reproduz (as seis gerações do caminho HeyGen
dispersam ~12%, sobre outra régua, com dois fatores). Ela ganhou nome
(`PIPELINE_RITMO_DISPERSAO`) exatamente para a origem poder ser cobrada depois:
um `95` solto não tinha onde pendurar a dúvida. **A disputa do 10,89 NÃO foi
reaberta** — não era desta rodada.

**O que ficou de pé, item a item:**

| item | o que é | onde |
|---|---|---|
| 1a | porteiro do vendor **antes** do débito, 403 sem tocar em crédito | `vendorCatalog.ts`, `routes/videos.ts` |
| 1b | ramo `if (input.vendor === "fal")` ACIMA do ternário, que fica intacto | `avatarProvider.ts` |
| 1c | `publicarEntradas` em série, cada `file_url` como etapa **ordem 0** | `falPipeline.ts` |
| 1d | `image_urls = [rosto, traje?, cenário?]` sobre colunas que já existiam | `falPipeline.ts`, `avatarProvider.ts` |
| 1e | o fio: `scenario`/`outfit` saem da tela e chegam ao provider | `GenerateStep.tsx`, `routes/videos.ts` |
| 1f | `pararApos: "compor"` é o default; a URL da imagem vai ao diário | `falPipeline.ts` |
| 1g | teto de 95 DERIVADO | `falPipeline.ts` |
| 1h | `_arnes-logs/` no `.gitignore` por nome | `.gitignore` |

**`publicarEntradas` roda ANTES do primeiro `autorizarGasto`, e a ordem é a
propriedade.** Publicar não custa (upload não tarifado, MEDIDO em 13/08);
autorizar é o freio da primeira etapa paga. O caso ruim de inverter não é
gastar à toa — é a corrida ser autorizada, um upload falhar no meio, e sobrar
uma corrida `failed` que já passou pelo porteiro do dinheiro. Falha de upload
fecha a etapa como `failed` com motivo `upload_failed` e custa zero.

**Em SÉRIE, e não em paralelo:** a ordem das `image_urls` é significativa para o
`nano-banana`, e em paralelo ela passaria a ser decidida pela ordem de
conclusão — variando de corrida para corrida sem nada no código dizendo isso.

**AS TRÊS GUARDAS, PROVADAS REPROVANDO (3/3, MEDIDO em 13/08):**

- `vendor sem caminho de geração é recusado antes do débito`
- `publicarEntradas roda antes do primeiro autorizarGasto`
- `o ramo da fal não altera o ternário did/heygen`

Log: `_arnes-logs/mutants-b2-guardas-2026-08-13-b.log`. Arnês passou de **234
para 237 mutantes**.

⚠️ **`if (false && …)` NÃO SERVE COMO MUTANTE — MEDIDO nesta rodada.** O
TypeScript trata o corpo como inalcançável, para de propagar o narrowing para
dentro dele, e o gate sai **2 pelo `tsc`**: o arnês devolveu **AMBÍGUO** com a
guarda saudável e sem ela ter opinado. Custou uma passada. O mutante que
funcionou antecipa o débito — mesma inversão sobre o que a guarda mede, numa
linha contígua que compila.

**G-c mede FORMA, e isso está declarado no fonte.** Transformar o `if` num
terceiro braço do ternário não muda comportamento nenhum — heygen, did e vendor
desconhecido continuam indo para o mesmo lugar, e nenhuma corrida distingue as
duas versões. O que ela mede por EXECUÇÃO é o despacho (fal alcança o pipeline,
did não alcança); o que mede por forma é o ternário estar inteiro.

**Duas guardas EXISTENTES precisaram de conserto, e as duas foram efeito
colateral desta rodada — o gate as pegou em segundos:**

1. `checkFalPipelinePolicy` media "`crus[0]` é o corpo do fornecedor", e a
   publicação passou a gravar antes dela. A propriedade não mudou; o filtro
   passou a ser por conteúdo em vez de por posição. **Provada reprovando à mão**
   com o mutante que ela já tinha.
2. O mutante `fal entra na lista de sondas sem ganhar uma` passou a casar **2×**:
   `VENDORS_WITH_GENERATION_PATH` tem corpo idêntico ao de
   `VENDORS_WITH_CONNECTION_PROBE`. Ganhou CONTEXTO ÚNICO (a linha do `export`).
   **Segunda vez** que este `find` precisa disso — o conserto é dar contexto,
   nunca apagar a linha nova do produto.

**O QUE FICOU FORA, e é escolha declarada:**

- **Débito de crédito no caminho da fal** — B3, junto com a decisão de onde ele
  mora.
- **`consumeLiveGeneration()` nas submissões pagas da fal.** O ramo está FORA do
  `withLiveBudget`: o orçamento de sessão conta GERAÇÕES de vídeo, e esta
  corrida para em `compor`. O freio dela é o teto em dólares, que soma antes de
  cada etapa paga.
- ~~`awaiting_approval`, rota de aprovação e tela — BLOCO 5.~~ **FECHADO no
  B3** (`c849b50`+`ff9628e`): migration 052, `recovery.ts` ensinado a não
  reclamar do estado, rotas `/approve` e `/recompose`.
- **`pollFalRun` e retomada após morte do processo** — não foi desta rodada.
- **`mutants:dirty` não existe neste repositório.** O P2 o pedia; no lugar dele,
  as guardas foram provadas à mão durante o desenvolvimento e por **passada
  filtrada** depois do commit — e nenhuma mensagem de commit afirmou prova antes
  de ela existir. **Segue valendo em toda rodada posterior** (B5, B5c):
  provar por `--guard`/`--name` depois do commit, nunca antes.

### 1.5 · BLOCO B5c — cenário e traje ganham campo no fluxo de avatar EXISTENTE

**Fechado em 13/08** (`dfd5657`+`cf8d869`). Continuação do B5 (vídeo de 10 s
pelo Wan): antes de gastar o P3/P4 pago, o gap de UI encontrado ao tentar
operar a tela precisou ser fechado primeiro.

**O gap, MEDIDO por leitura antes de qualquer código:**
`videos.scenario`/`scenario_prompt` e `outfit`/`outfit_prompt` já chegavam à
fal desde o B2/B5 — o que faltava era a TELA. `defaults.scenario` só era
preenchível dentro de "criar avatar novo" (US$ 1,00 + 1 crédito, 3 fotos +
vídeo de referência); `defaults.outfit` não era preenchível em LUGAR NENHUM —
o campo antigo tinha sido removido por decorativo (não alimentava
`corpoDaGeracao()`) e nunca recolocado quando o backend passou a consumi-lo de
verdade. Um avatar existente — o caminho normal de gerar vídeo — não tinha
onde preencher nenhum dos dois.

**O conserto (`dfd5657`):** novo bloco em `AvatarSetupStep.tsx`, no ramo de
avatar EXISTENTE (`!creating`), reaproveitando o layout que já existia para
cenário dentro de "criar avatar novo" — mesmo `Field`, mesmo
`handleAssetUpload` (que já aceitava `"outfit"` como `kind`, só nunca tinha
sido chamado com ele). Zero componente novo. `outfitName` deliberadamente NÃO
adicionado — `AssetDefaults` não tem esse campo e criar um por simetria
cosmética sem consumidor não foi autorizado; o traje mostra "Imagem salva."
genérico. O "Adicionar traje" antigo (LOOK do fornecedor, US$ 1,00,
`avatar_look_id`) não foi tocado — são sistemas diferentes que o nome "traje"
confundia, e o comentário do fonte que descrevia isso errado foi reescrito.

**Efeito colateral pego pela própria passada `--affected`, não por leitura:**
`checkPreflightSummaryPolicy.ts` conferia `defaults.scenarioName ?
imageSavedNamed : …` por PRESENÇA em qualquer lugar do arquivo, não por
posição. O bloco novo criou uma segunda instância legítima do mesmo padrão, e
um mutante que apaga a instância ANTIGA passava despercebido porque a nova
continuava lá — 35/36 na primeira afetada, 1 INERTE. Corrigido em `cf8d869`
por CONTAGEM de ocorrências (2 para `scenarioName` desde o B5c, 1 para
`lookImageName`, que este bloco não tocou) em vez de presença.

⚠️ **GAP DE UI QUE FICOU DE FORA, escolha declarada, não esquecimento:** o
fluxo de "criar avatar novo" continua SEM campo de traje (só cenário) — por
instrução explícita, esta rodada não tocou naquele fluxo (caro: US$ 1,00 + 1
crédito). Preencher cenário/traje para um avatar recém-criado exige passar
primeiro por ele já pronto (existente), ou esperar uma rodada que também mexa
no fluxo de criação.

### 1.6 · BLOCO COMPOR-1 — a composição saiu, a animação não. 14/08

**Custo real da rodada: US$ 0,16 na fal (2 composições) + 2 créditos de vídeo +
1 chamada ao Gemini.** Saldo de vídeo: 21 → **19**. Nenhum código de produto
tocado — só documentação.

**O QUE FUNCIONOU PELA PRIMEIRA VEZ:**

- **Duas composições pagas saíram inteiras** (`nano-banana-2/edit`), 20 s e
  19 s, `inference_time` 11,78 s na segunda. O caminho tela → rota → provider →
  fal → `awaiting_approval` está MEDIDO ponta a ponta.
- **O cache de tradução FUNCIONA e está provado:** a 1ª geração emitiu
  `direction_translated` (`tokensIn 101, tokensOut 30`); a 2ª, com o mesmo texto,
  emitiu **`direction_translation_reused`** e `provider_usage` **não ganhou
  linha nova de gemini**. ⚠️ **A métrica certa é `provider_usage`, não
  `count(*) WHERE motion_prompt_en IS NOT NULL`** — este último conta LINHAS DE
  VÍDEO (foi de 1 para 2 justamente porque a 2ª geração copiou a tradução
  reusada), e lê-lo como "chamadas" inverte a conclusão.
- **O 409 do segundo clique em Aprovar funcionou:** `approval_not_pending`,
  nenhuma etapa paga disparada.

**⚠️ O ACHADO QUE PARA O PIPELINE: `ENDPOINT_ANIMAR` NÃO EXISTE NA FAL.**
`fal-ai/wan/v2.6/reference-to-video/flash`
([falPipeline.ts:151](backend/src/services/video/falPipeline.ts:151), espelhado
em [endpointCatalog.ts:188](backend/src/services/providers/endpointCatalog.ts:188))
devolve **404 `Path /v2.6/reference-to-video/flash not found`**. A fal resolveu
`fal-ai/wan` como app e o resto como sub-path inexistente.

**E ele falhou pelo caminho MAIS CARO DE LER, que é o segundo caso registrado
do mesmo padrão:** `POST` → **200 IN_QUEUE** com `request_id` legítimo →
status → **COMPLETED (200)** → e só o **RESULTADO** trouxe o 404.
`inference_time: 0.049` — o tempo de não ter feito nada. É exatamente o que a
§1.3 registrou em 13/08 com o 422 (`inference_time: 0.058`). **Duas ocorrências
independentes: `COMPLETED` não é sucesso, e ler só o status faria o pipeline
seguir para a etapa seguinte com o trabalho anterior inexistente.**

**O ESTADO §6 previu isto por escrito** — "os três ids de modelo vieram por
escrito. Um id errado vira 404, não cobrança." **A previsão está MEDIDA**, e o
custo dela foi zero na fal.

**O que segue NÃO VERIFICADO, e é o bloqueio da próxima rodada:** qual é o id
correto do Wan. Não foi procurado — exigiria consultar a fal, e esta rodada
estava fechada em leitura. **`ENDPOINT_SINCRONIZAR` e o preço do lipsync
seguem igualmente sem uma única corrida real.**

**O PREÇO DO WAN NÃO FOI RESOLVIDO, e não podia ter sido.** O Wan não rodou.
Além disso, **o custo REAL de nenhuma etapa é observável deste repositório**:
`gastoPrevistoUsd` é PREVISTO, calculado por `PRECOS_FAL` antes da chamada, e
nenhuma resposta da fal traz preço. Só o painel/fatura da fal responde — é a
mesma dívida de reconciliação já aberta no §7.

⚠️ **NÃO VERIFICADO, TRANSFERIDO DO REGISTRO EXTERNO DO OPERADOR em 14/08
(ENDPOINTS-1) — vivia só fora deste repositório.** Uma medição de 11/08 aponta
o Wan a **~25% de US$ 0,10/s** (≈ US$ 0,025/s), pelo `request_id`
`019ff2dd-9096-75e2-b443-21870e952cc7`. **Nada disto foi conferido a partir
daqui:** não há consulta a esse `request_id` neste repositório, não se sabe se
o endpoint que o produziu é `ENDPOINT_ANIMAR` de hoje (nem o de antes do
ENDPOINTS-1, nem o corrigido nele) e não se sabe resolução nem duração. Fica
registrada como DÍVIDA, não como preço confirmado — some da lista de "NÃO
VERIFICADO" só quando alguém a conferir contra o painel da fal ou reproduzir
com uma corrida real. Procedência: registro externo do operador, não deste
projeto.

**Estado das duas linhas ao fim da rodada:**

| linha | estado | imagem |
|---|---|---|
| `de2a366e` | `awaiting_approval` — **intacta e aprovável** | paga, US$ 0,08 |
| `ca88822c` | `error` / `vendor_rejected` — **NÃO volta a ser aprovável** | paga, US$ 0,08, viva no diário |

**A imagem de `ca88822c` foi paga e está inalcançável pela tela** — a linha em
`error` não retorna a `awaiting_approval` por decisão declarada
([videos.ts:1767](backend/src/routes/videos.ts:1767): a etapa paga pode ter
saído). A URL continua em `videos.fal_composed_image_url` e no diário da corrida
`fb4577a3`. **Não estornou, e está correto:** a composição aconteceu.

### 1.7 · BLOCO ENDPOINTS-2 — o candidato do relatório anterior TAMBÉM está errado, MEDIDO por fusível, custo US$ 0,00

**O candidato `fal-ai/wan/v2.6/image-to-video/flash`, proposto no fecho do
ENDPOINTS-1 com base em páginas de doc da fal lidas por `WebFetch`, foi
disparado pelo fusível (corpo `{}`, submissão → status → resultado, sem nunca
gerar) e devolveu o MESMO padrão de 404 do original:** `"Path
/v2.6/image-to-video/flash not found"` — a fal resolve o app como `fal-ai/wan`
e trata o resto como sub-path inexistente, idêntico ao 404 do COMPOR-1. Os
outros dois ids testados na mesma passada confirmam que o método funciona:
`fal-ai/nano-banana-2/edit` (controle, já MEDIDO funcionando) devolveu **422**
`"prompt: Field required"`, e `fal-ai/sync-lipsync/v2` devolveu **422** com os
dois campos obrigatórios — as duas rotas EXISTEM nesta conta. **A distinção
422-vs-404 é real e o fusível a captura**; ela só não confirmou o candidato do
Wan.

⚠️ **Consequência para a credibilidade da leitura anterior:** como o id era a
única afirmação FALSEÁVEL das três que o `WebFetch` trouxe (id, preço
US$ 0,05/s, parâmetros batendo com o payload), e ela se provou errada, as
outras duas perderam o direito de serem tratadas como "documentado" sem
confirmação independente — inclusive o preço, que não deve ser aplicado a
`providerCost.ts` enquanto o id não for confirmado.

**O diff 3a/3b/3c do relatório do ENDPOINTS-1 NÃO foi aplicado.**
`ENDPOINT_ANIMAR` continua `fal-ai/wan/v2.6/reference-to-video/flash` — o
mesmo 404 de sempre. Parado por instrução explícita ao primeiro sinal do
fusível (regra da rodada: trocar um 404 por outro é o que ela existia para
impedir).

**A medição externa de 11/08 (§1.6, `request_id
019ff2dd-9096-75e2-b443-21870e952cc7`, ~25% de US$ 0,10/s) NÃO PODE TER VINDO
DESTE REPOSITÓRIO — não é "não se sabe", é estrutural.** A primeira chamada
real à fal feita por este código foi em **13/08** (BLOCO 3.5, contrato do
`nano-banana` medido pela primeira vez); a primeira tentativa de alcançar o
Wan foi em **14/08** (COMPOR-1), e ela devolveu 404 sem gerar nada. O
`request_id` de 11/08 é de **dois dias antes** da primeira chamada real à fal
que este repositório já fez, e de **três dias antes** de qualquer tentativa de
Wan. Não há janela de tempo em que este código pudesse ter produzido aquela
medição. Ela veio de fora — do ambiente do operador, com um id que este
repositório nunca usou (correto ou não) — e segue como dívida externa, não
como algo a reconciliar contra este código.

### 1.8 · BLOCO ENDPOINTS-3 — o id CERTO, MEDIDO por fusível: falta o prefixo `fal-ai/`, não o sub-path

**Causa raiz do 404 dos dois blocos anteriores: o Wan 2.6 é modelo Partner e
mora direto no namespace `wan/`, SEM `fal-ai/` na frente.** `fal-ai/wan`
EXISTE como app (é onde vive a família Wan 2.2) — por isso o fornecedor
sempre aceitava a submissão (200/IN_QUEUE) e só 404ava no sub-path, nunca no
app. `fal-ai/nano-banana-2/edit`, usado como gabarito por já estar MEDIDO
funcionando, tinha prefixo `fal-ai/` — e foi exatamente essa semelhança que
escondeu o defeito real nas duas rodadas anteriores.

**Fusível, corpo `{}`, 4 candidatos, custo US$ 0,00 (nenhum chegou perto de
gerar):**

| candidato | resultado | veredito |
|---|---|---|
| `wan/v2.6/image-to-video/flash` | **422** `prompt`+`image_url` faltando | rota EXISTE — é o id certo |
| `wan/v2.6/image-to-video` (sem `/flash`) | **422**, mesmos campos | também existe (variante sem tier, não usada) |
| `wan/v2.6/reference-to-video` (controle de namespace) | **422** `prompt`+`video_urls` faltando | existe — confirma o namespace `wan/` sem prefixo |
| `fal-ai/nano-banana-2/edit` (controle já conhecido) | **422** `prompt` faltando | inalterado |

**Item 2 — nenhuma suposição de prefixo achada no código.**
`assertFalEndpointNoCatalogo` ([falClient.ts:156](backend/src/services/providers/falClient.ts:156))
só compara string exata contra `VENDOR_ENDPOINTS`; o catálogo já tinha um
endpoint SEM `fal-ai/` (`/storage/upload/initiate`, upload REST), então a
convenção "todo id da fal começa com fal-ai/" nunca foi imposta em código —
só no hábito de quem escreveu os outros dois. Nenhum `split`/`startsWith`
estrutural sobre o id em `falClient.ts` ou `endpointCatalog.ts`.

**Aplicado (`62e67f9`): os três pontos, juntos.** `ENDPOINT_ANIMAR`
([falPipeline.ts:178](backend/src/services/video/falPipeline.ts:178)), a
chave de `DEFAULTS_NUNCA_HERDADOS`
([falPipeline.ts:157](backend/src/services/video/falPipeline.ts:157)) e o
`path` do catálogo
([endpointCatalog.ts:190](backend/src/services/providers/endpointCatalog.ts:190))
— agora os três `wan/v2.6/image-to-video/flash` (catálogo com barra inicial:
`/wan/v2.6/image-to-video/flash`).

**Dois campos novos, MEDIDOS aceitos pelo schema no mesmo fusível (corpo com
`duration`/`resolution`/`generate_audio` + os dois novos, ainda sem
`prompt`/`image_url` — nenhum erro de tipo apareceu para nenhum dos cinco):**
`enable_prompt_expansion: false` e `multi_shots: false`, agora explícitos no
corpo e na lista de `DEFAULTS_NUNCA_HERDADOS` (5 campos para o Wan). Sem eles
o default do fornecedor (`true` nos dois) deixaria um LLM reescrever
`promptDeDirecao` e segmentar o clipe de 10 s em várias tomadas — risco de
qualidade, não de dinheiro, mas do mesmo padrão dos outros defaults.

⚠️ **Contra a suposição do pedido: `duration` como NÚMERO passa o schema sem
erro** — testado `10` (número) e `"10"` (string) lado a lado, mesmo fusível,
nenhum dos dois produziu erro de tipo no `detail`. O código continua mandando
número (`PIPELINE_TARGET_SECONDS`, sem conversão) — não havia defeito aqui.

**Dois mutantes novos, PROVADOS reprovando por passada filtrada DEPOIS do
commit do fix** (`--name` nos dois, 2/2 `ok`, árvore revertida e conferida por
HASH — não só `git status` — em cada um):
- `pipeline: nenhum default do fornecedor é herdado` :: *a chave do Wan em
  DEFAULTS_NUNCA_HERDADOS desalinha do endpoint em uso*
- `pipeline: as três etapas pagas completam no caminho feliz` :: *o catálogo
  desalinha do endpoint que falPipeline.ts realmente usa* (guarda nova,
  não existia mutante nomeado para esta asserção antes desta rodada)

Arnês: **245 mutantes declarados** (`--list`, medido nesta rodada).

**Preço corrigido, `providerCost.ts:314-329`: US$ 0,10/s → US$ 0,025/s,
marcado DOCUMENTADO com URL, não medido.** Citação verbatim de
<https://fal.ai/models/wan/v2.6/image-to-video/flash/api>: *"Audio video
(generate_audio=True, default) is billed at half the standard I2V rate;
silent video (generate_audio=False) at 25%."* O "standard I2V rate" é
US$ 0,10/s a 720p — o preço do tier NÃO-flash
(<https://fal.ai/models/wan/v2.6/reference-to-video/api>), e as duas
porcentagens (50%, 25%) são do MESMO número-base, não uma da outra:
`0,10 × 0,25 = 0,025`. Como este pipeline sempre manda `generate_audio:
false`, **US$ 0,025/s é a taxa que se aplica**, e o valor anterior
(US$ 0,10/s) era o preço do tier ERRADO — não uma medição inválida do tier
certo.

**Custo previsto do pipeline inteiro, recalculado:** `compor` US$ 0,08 +
`animar` (0,025 × 10 s) US$ 0,25 + `sincronizar` (0,05 ×
até ~8,72 s de fala) ≈ US$ 0,44 → **≈ US$ 0,77 no pior caso**, contra
≈ US$ 1,52 antes da correção. `PIPELINE_TETO_USD = 2,0` não muda — já tinha
margem antes (0,48 acima do previsto antigo) e agora sobra quase o triplo
(1,23 acima do novo previsto). Nenhum ajuste de teto foi necessário.

**A medição externa de 11/08 (`request_id 019ff2dd-...`, ~25% de US$ 0,10/s)
passa de "não verificada" a COERENTE com a doc.** A aritmética bate exatamente
com o que a doc do fornecedor descreve: 25% do standard I2V rate. Isso não
muda a conclusão de proveniência do §1.7 (ela continua sem poder ter saído
deste código, por janela de tempo) — muda o que se pensa da medição em si:
não era um número solto, era o `generate_audio: false` do tier `flash`
batendo com a mesma conta que a doc descreve. **O que estava errado não era a
medição de fora, era o preço DESTE repositório**, herdado do tier não-flash.

**Restart feito às `2026-08-14T05:43:24Z`, dentro do prazo** (expiração de
`de2a366e` em `2026-08-15T04:26:40Z`, ~22h45min de folga). **Id confirmado
DENTRO do processo, não só no repositório** — `ENDPOINT_ANIMAR` lido de
dentro do container após o restart devolveu `wan/v2.6/image-to-video/flash`.
`de2a366e` **sobreviveu**: log de boot mostra
`video_recovery_aguardando_aprovacao` com `idadeMs: 4606830` contra
`maxAgeMs: 86400000` — a linha segue `awaiting_approval`, imagem intacta,
aprovável.

⚠️ **DÍVIDA REGISTRADA, NÃO IMPLEMENTADA — o `sync-lipsync` (a etapa mais
cara, US$ 0,05/s) pode ser dispensável.** O schema do `wan/v2.6/image-to-video/flash`
tem um campo `audio_url` opcional. Se o Wan já sincroniza a animação contra
uma faixa de áudio fornecida (e não só gera uma trilha própria quando
`generate_audio` está ligado), mandar o áudio do ElevenLabs DIRETO nessa
etapa poderia produzir lipsync sem precisar da etapa 4 — cortando a etapa
mais cara do pipeline. **A pergunta que mediria isso, sem gastar além do
fusível:** o schema descreve `audio_url` como entrada de sincronização de
verdade (lábios acompanham a fala) ou como trilha de fundo substituível (o
texto encontrado numa leitura anterior, não confirmada por fusível, dizia
"background music" — o que sugeriria que NÃO serve para lipsync, e a etapa 4
continuaria necessária)? Só um teste pago comparando os dois caminhos
responde com certeza; a doc sozinha já é ambígua o bastante para não decidir
nada aqui.

### 1.9 · VPS pré-produção (DEPLOY-4) — SSH, swap e RAM: REGISTRO do operador, NÃO medição desta sessão

**Bloco PARALELO ao plano v6 acima** (deploy em VPS, não pipeline da fal).
As decisões DEPLOY-1/DEPLOY-2/DEPLOY-3 citadas nos comentários de
`docker-compose.prod.yml` e `traefik/*.prod.yml` nunca tinham sido gravadas
aqui — viviam só nesses arquivos e no chat. Esta entrada não reconstrói esse
histórico inteiro; grava só o que o DEPLOY-4 pediu para corrigir.

- **SSH por senha está DESATIVADO de propósito, desde 02/08/2026.** Acesso
  por chave `ed25519` (`~/.ssh/eckko-prod`, máquina Windows).
  `Permission denied (publickey)` ao tentar senha é o comportamento
  ESPERADO — **não reverter, não reativar `PasswordAuthentication`.**
  CORRIGE a leitura da rodada anterior (RETOMADA-DEPLOY), que tratou a
  recusa como pendência a destravar; não era. Afirmado pelo operador nesta
  rodada — **NÃO VERIFICADO por mim**: sem SSH funcional nesta sessão não há
  como ler `sshd_config` na VPS e confirmar o estado atual por medição.
- **Swap de 4 GB — registrado pelo operador como já existente e persistente
  desde 02/08/2026.** NÃO VERIFICADO nesta sessão, mesma razão (sem SSH).
  Antes de criar qualquer swap novo, confirmar com `free -h` e
  `swapon --show` — criar um segundo sem checar duplica memória reservada
  numa VPS pequena.
- **RAM da VPS = 4 GB, segundo o registro de compra (Kamatera).** NÃO
  VERIFICADO por medição direta nesta sessão, mesma razão.

## 2 · Decisões fechadas — não reabrir

Só as do caminho da fal. As de fornecedor (HeyGen: fundo, Avatar V, presets de
expressão) e o procedimento de desarme estão no CLAUDE.md — **não os duplique
aqui.**

- **Fila, sempre.** `queue.fal.run` é a única base de submissão. `fal.run`
  síncrono não devolve `request_id`, e sem ponteiro um processo morto perde
  trabalho já pago. O host síncrono está **fora** de `HOST_DO_VENDOR` em
  `checkNetworkEgressPolicy` de propósito, para ser a segunda rede.
- **Catálogo fechado.** Endpoint fora de `VENDOR_ENDPOINTS` não é alcançável; a
  recusa acontece **antes** do `fetch`.
- **A chave da fal vem do TENANT** (`api_credentials`, par avatar+fal), via
  `getCredential`. `platform_credentials` **não tem consumidor** neste caminho —
  MEDIDO, e supor o contrário custou um dia em 09/08.
- **`docs-internal/` é memória de engenharia** e fica fora de todo copiloto.

## 3 · Os gotchas do arnês — cada um já custou uma conclusão errada

1. **`| tee` engole o código de saída.** MEDIDO duas vezes. Uma passada que
   abortou com exit 2 foi reportada como exit 0. **Leia o LOG, nunca o exit do
   pipeline.**
2. **`expect` é TRANSCRITO da mensagem que a guarda emite, nunca parafraseado.**
   Descrever o defeito em vez de citar a guarda já fez guarda saudável aparecer
   como AMBÍGUA quatro vezes.
3. **CRLF.** O working copy vem em CRLF e os mutantes são escritos com `\n`. O
   runner normaliza; um `find` multi-linha escrito fora dele casa zero vezes.
4. **Árvore suja aborta a passada com exit 2.** Não há como rodar o arnês sobre
   código não commitado — `git status` é a única prova de que a reversão
   funcionou. Corolário caro: **uma passada em background trava a sessão
   inteira**, porque qualquer edição a mata no mutante seguinte.
5. **`fixture` esconde defeito.** Guarda que precisa exercitar caminho pago roda
   com `PROVIDER_MODE=live` e `globalThis.fetch` substituído, restaurando os
   dois no `finally`. Em fixture o caminho inteiro é desviado e a guarda não
   mede nada. **O gate precisa de `-e PROVIDER_MODE=fixture` na invocação** —
   sem isso ele herda o modo do container e nasce vermelho quando armado.
6. **Guarda ancorada no USO, âncora INTRÍNSECA.** Nunca ancorar recorte em
   wrapper de layout (`</Field>`): o recorte vaza para o bloco seguinte e a
   guarda acusa o vizinho. Toda guarda de recorte carrega rede anti-vazamento.
7. **Mutante se identifica por NOME, nunca por posição.**
8. **AMBÍGUO pode ser estouro de buffer, não guarda ruim.** MEDIDO em 12/08: a
   saída do gate chega a 1.071.347 bytes e o default do `execFileSync` é 1 MiB
   — truncado, o stdout perde a mensagem da guarda, que sai no fim. Corrigido
   em `faf7229` (`maxBuffer` no `runGate`). Se um AMBÍGUO aparecer, **meça o
   tamanho da saída antes de reescrever a guarda**: quantos falsos AMBÍGUOS
   isso já causou é NÃO VERIFICADO.
9. **Guarda de ORDEM só é observável quando a interpretação FALHA.** Duas
   guardas deste projeto nasceram inertes por medir ordem entre passos que não
   mudam: ler um campo não produz passo observável. A corrida que mede é a do
   corpo em forma inesperada — ali "gravou antes" e "gravou depois" viram
   estados distintos.
10. **Log de passada NUNCA em `/tmp`** (= `%TEMP%` no Windows): já foi apagado
   por fora com o processo escrevendo nele, e o watcher ficou cego. Duas cópias,
   em `_arnes-logs/`, com nome datado.
11. **NUNCA backgroundar o mesmo comando duas vezes.** MEDIDO em 13/08: lançar
   `npm run check:mutants -- --affected ... &` DENTRO de uma chamada já
   marcada para rodar em background mata o processo real assim que o shell
   externo termina — ele só espera o `echo` seguinte, não o job em `&`. O
   sintoma: o log parou em "1/40" e a árvore ficou com DOIS mutantes de
   documentação aplicados e nunca revertidos (`docsManifest.ts`,
   `docs/faq.md`) — identificáveis por diff como mutantes conhecidos, não
   trabalho perdido do operador, mas ainda assim uma árvore suja que precisou
   ser limpa à mão antes de relançar. Lançar como **um único comando de
   shell** (`npm run check:mutants > logA 2>&1; cp logA logB`), passado
   inteiro para rodar em background, sem `&` interno.
12. **`git status` pode mentir por `mtime`, não por conteúdo, neste ambiente.**
   MEDIDO em 13/08: depois de reverter um arquivo com `git checkout`, `git
   status --porcelain` continuou acusando modificação — mas `git hash-object
   <arquivo>` bateu EXATAMENTE com `git rev-parse HEAD:<arquivo>`. É o bind
   mount do Docker Desktop no Windows mexendo em timestamp sem mexer em
   bytes. `git update-index --refresh` sozinho não bastou; `git add
   <arquivo>` (no-op de conteúdo, já que o hash bate) resolveu. **Antes de
   tratar qualquer "dirty" como real, comparar hash contra HEAD** — evita
   tanto pânico à toa quanto, pior, descartar trabalho de verdade por engano.
13. **`npm run check:mutants` roda no HOST, não dentro do container.**
   MEDIDO em 21/08: `docker compose exec backend npm run check:mutants`
   falha com "Missing script" — esse script só existe no `package.json` da
   RAIZ (`node tools/run-mutants.mjs`), que por sua vez chama `docker
   compose exec` por mutante. O gate (`npm run check`) é o oposto: roda
   DENTRO do container. Confundir os dois custa um comando por engano, não
   uma conclusão errada — mas já aconteceu.
14. **Path do Git Bash (Windows) mangla argumento que começa com `/`.**
   MEDIDO em 21/08: `--guard "/approve passa pararApos"` virou `--guard
   "C:/Program Files/Git/approve passa pararApos"` na linha de comando
   efetiva, e o filtro casou zero mutantes — sem erro, só silenciosamente
   pulou o que devia testar. Mesmo mecanismo já visto com caminhos tipo
   `/app/fixtures` em `docker compose exec ... ls /app/fixtures`. **Prefixe
   `MSYS_NO_PATHCONV=1`** em qualquer comando cujo argumento comece com `/`.
15. **Comparar duas vezes a mesma variável narrowed contra literais
   incompatíveis dispara TS2367 — mesma família do `if (false && …)`, forma
   nova.** MEDIDO em 21/08: um mutante que troca `if (x === A) {` por `if (x
   === "sentinela") {` parece seguro (mesmo padrão que já funcionava antes),
   mas se o BLOCO do `if` compara `x` de novo contra um OUTRO literal (`x
   === B`, para escolher uma mensagem, por exemplo), o TypeScript narrowed
   `x` para o tipo do sentinela dentro do bloco, e a segunda comparação vira
   "sem sobreposição" — `tsc` reprova, o gate sai com o código do `tsc`
   (2), e a guarda NUNCA chega a rodar: AMBÍGUO, não reprovação limpa. Some
   isso à lista de formas que produzem AMBÍGUO sem a guarda ter opinado
   (gotcha 8 e a nota do `if (false && …)` espalhada pelos mutantes deste
   arquivo). Correção: `String(x) === "sentinela"` evita o narrowing sem
   mudar comportamento em runtime.
16. **Mutantes com o MESMO `find`, em arquivos de guarda DIFERENTES, se
   derrubam mutuamente na passada.** MEDIDO em 21/08: dois mutantes (um em
   `checkFalApprovalPolicy.ts`, outro em `checkFalVideoApprovalPolicy.ts`)
   miravam a mesma linha em `recovery.ts` com o find IDÊNTICO. Aplicar
   qualquer um dos dois faz o `find` do OUTRO desaparecer do arquivo — e
   `checkMutantRegistryPolicy` (parte do próprio `npm run check`) acusaria
   os dois como "não casam mais no alvo" na mesma passada. Ancorar em textos
   DIFERENTES (aqui: o `if` externo guarda-chuva vs. um `if` interno de
   escolha de mensagem, alvos de invariantes genuinamente distintas) resolve
   sem reduzir cobertura.
17. **O backend roda com `tsx src/index.ts` (script `serve`), SEM
   `--watch`** — só `dev` (`tsx watch`) recarrega sozinho, e é `serve` que
   `docker-entrypoint.sh` usa em todo ambiente deste projeto. Editar uma
   rota e testar contra o processo HTTP vivo continua batendo no código
   ANTIGO até um `docker compose restart backend` manual. MEDIDO em 22/08
   como bug real, não hipotético: o primeiro ensaio HTTP da Fase B (§13)
   devolveu 500 (`42P10`, `ON CONFLICT` sem `WHERE` casando nenhum índice)
   porque o processo não tinha sido reiniciado depois da edição — a query
   em si estava certa o tempo todo, e o tempo perdido foi todo de
   diagnóstico. **Isto NÃO afeta `npm run check`** (o gate): cada invocação
   roda `tsx` fresco, lê o arquivo do zero — só o SERVIDOR de pé é que
   fica com código velho.
18. **Uma guarda por `string.includes(...)` pode casar com um COMENTÁRIO,
   não com o código, e sai INERTE sem avisar.** MEDIDO em 22/08:
   `checkAvatarMultiVendorPolicy.ts` procurava `"req.query.vendor"` no
   recorte de uma rota, e o comentário explicativo logo ACIMA da query
   também continha esse texto — mutar o código real (remover o uso
   funcional) não mudava o veredito da guarda, porque o comentário sozinho
   já bastava pro `includes()` achar verdadeiro. Corrigido trocando a
   âncora para um trecho que só existe em código executável (o array de
   parâmetros da query: `[tenantId, provider, req.query.vendor]`, nunca
   escrito em prosa). Ao escrever guarda por FORMA, prefira âncoras que não
   têm como aparecer num comentário explicativo sobre a MESMA coisa que o
   código faz — e teste o mutante à mão antes de declarar provado, sempre
   (a regra de sempre, reforçada por este caso específico de colisão).
19. **Verificação visual pelo navegador ficou bloqueada na sessão de
   22/08 inteira, gotcha NÃO RESOLVIDO.** A sessão (de tenant OU de admin)
   autentica com sucesso quando testada direto contra o backend
   (`fetch`/`curl` interno, sem passar pelo navegador — 200, identidade
   correta), mas o MESMO cookie falha (401) em toda tentativa pela
   automação de navegador desta sessão — fetch com `credentials:'include'`,
   `SameSite=Lax` explícito, e até navegação completa de página (não só
   XHR). Traefik foi DESCARTADO como causa: é proxy transparente para
   `/api/*` (só `stripPrefix`, sem middleware de cookie), e CORS já está
   com `credentials:true`. **NÃO investigado além disso** — a hipótese mais
   provável é uma política de cookie do próprio ambiente de navegador
   automatizado, não um bug do app, mas isso é DEDUZIDO, não confirmado.
   Enquanto durar, verificação de UI depende inteiramente de HTTP direto
   (sessão montada no banco + `fetch`/`curl` contra o backend, nunca
   captura de tela real) — mais trabalhoso, mas já provado suficiente para
   fechar a Fase B com confiança.

## 4 · Invocações exatas

**Gate** (~21 s, MEDIDO):
```bash
docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check
```

**Passada COMPLETA** — 20,84 s/mutante MEDIDO, ~79 min para 227. Exige árvore
limpa:
```bash
npm run check:mutants
```

**Passada FILTRADA** — carimba no começo E no fim quantos foram pulados:
```bash
npm run check:mutants -- --guard "fal:"
```
`--guard` e `--name` são repetíveis, seleção pela UNIÃO. Filtro que não casa
nada aborta com exit 2 em vez de terminar verde sem verificar nada.

> **REGRA (13/08, substitui a anterior) — a passada AFETADA fecha rodada; a
> COMPLETA roda fora do horário de trabalho.**
>
> ```bash
> npm run check:mutants -- --affected --base <ref-do-inicio-da-rodada>
> ```
>
> A seleção é DERIVADA do `git diff`, nunca de escolha humana: entra o mutante
> cujo ALVO foi tocado, o cujo arquivo de GUARDA foi tocado, e todos os de
> AMBIENTE (que vigiam o que não aparece em diff). **MEDIDO em 13/08:** 3
> arquivos tocados → 8 de 234 mutantes → **1,9 min**, contra ~82 min da
> completa. Uma rodada maior (16 arquivos) seleciona 47 → ~16 min.
>
> **A troca só é honesta por causa da conferência de cadastro:** o único
> defeito que só a completa pegava era mutante podre, e ele agora aparece no
> gate em segundos.
>
> ⚠️ **A COMPLETA é OBRIGATÓRIA antes de qualquer rodada que gaste dinheiro.**
> Uma etapa paga é irreversível; entrar nela sem o arnês inteiro verde é apostar
> a carteira numa cobertura parcial.
>
> **Antiga, ainda válida para o filtro manual:** `--guard`/`--name` servem para
> iterar DENTRO de uma rodada, NUNCA para fechá-la. Ele existe para que validar as guardas tocadas custe ~5 min em vez
> de 79. Fechar rodada com passada filtrada é declarar verde o que não foi
> exercitado. **Toda rodada termina com a passada COMPLETA em background**, sem
> filtro, e o ponteiro do log entra na §5 abaixo.
>
> **E lance-a por ÚLTIMO.** Pelo gotcha 4, ela trava a árvore: qualquer commit
> ou edição depois de arrancar a mata. MEDIDO em 12/08 — a passada lançada ao
> fim da sessão anterior ainda estava em 38/227 quando a seguinte começou, e foi
> preciso matá-la para trabalhar.

**Listar sem mutar:** `npm run check:mutants -- --list`

**Desarme:** procedimento e os 5 critérios estão no CLAUDE.md. Confira SEMPRE
antes de tocar em qualquer coisa — `live` gasta dinheiro real.

## 5 · Desfecho da última passada completa — LEIA ISTO PRIMEIRO

*(preenchido no último commit de cada sessão)*

> **ESTA É A PASSADA COMPLETA VIGENTE — 23/08/2026 (segunda sessão).
> 368/368, zero INERTE, zero AMBÍGUO, zero ERRO, zero FALHOU.** HEAD
> `03aa59d`, árvore limpa antes e depois (`git status` vazio, e a reversão de
> cada mutante conferida pelo próprio arnês). Log em
> `_arnes-logs/mutants-gasto-completa-2026-08-23-a.log`, md5
> `664cbe9d7361e572194fab1ac37022c4`, **idêntico** à segunda cópia gravada no
> scratchpad da sessão (as duas cópias existem por causa do gotcha de 11/08:
> log de passada em `/tmp` foi apagado por fora com o processo escrevendo
> nele). **Zero ocorrências de "PASSADA FILTRADA"/"PULADO" no log** — é a
> completa de verdade, sem filtro.
>
> Ela roda DEPOIS de `03aa59d`, então o único commit à frente dela é o que
> escreve este parágrafo. Os 5 mutantes de `checkFalGastoInstrumentadoPolicy`
> estão entre os 368 e reprovaram aqui também, não só na afetada.
>
> **O texto abaixo, de 296/296 em `fc6f7d6`, e a completa de 358/358 do I1
> (§15) são HISTÓRICO** — ficam porque registram de onde o número veio, não
> porque descrevem o arnês de hoje.

⚠️ **Esta é a última passada completa MEDIDA — HEAD `4c5b66c` (fim de
22/08) já está 4 commits À FRENTE dela.** Por mudança de processo desta
sessão (§3, gotcha correlato no CLAUDE.md), a completa não roda mais a
cada commit intermediário — só uma vez, no fim de um bloco de trabalho
inteiro. Os 4 commits desde `fc6f7d6` (Fase 1 HTTP, cartão Simples, Fase
A, Fase B) foram fechados só com passada FILTRADA, cada mutante novo
provado individualmente — real, mas não é a mesma garantia de uma
completa. **Não leia o "296/296" abaixo como o estado ATUAL do arnês**
(hoje são 305 mutantes declarados) — é o histórico da última vez que a
completa rodou de verdade.

**A passada COMPLETA do fecho da FASE 2 (Modo B): 296/296, zero INERTE,
zero AMBÍGUO, zero ERRO, zero FALHOU.** HEAD `fc6f7d6`. Log em
`_arnes-logs/mutants-fase2-completa-2026-08-21-{a,b}.log`, md5
`99dfb1959afd61966e91e20cc344e28a` nas duas cópias — idênticas. Sem carimbo
de PASSADA FILTRADA/PULADOS: é a completa de verdade. Árvore limpa em cada
reversão. **NÃO chega a bater por hash contra HEAD** (gotcha 12) —
verificada só por `git status`; nenhuma divergência de `mtime` observada
nesta passada.

**Esta passada teve uma PRIMEIRA TENTATIVA ABORTADA no mutante 53/296**,
por um erro do próprio operador da sessão (o assistente): um arquivo
`.ts` descartável foi criado no repositório enquanto a passada rodava em
background, e isso sozinho bastou para `git status` acusar sujeira e
abortar a reversão — mesmo o arquivo não tendo relação nenhuma com o
mutante em teste. Relançada do zero sem tocar o repositório até o fim; a
segunda tentativa fechou 296/296. Ver gotcha 4 (já registrado) e a lição
de que ele vale para QUALQUER arquivo novo, não só os que fazem parte do
alvo.

**O arnês foi de 292 (fecho do BLOCO A) para 296 nesta janela** — os 4
novos são os de `checkFalVideoApprovalPolicy.ts` (a segunda aprovação, o
vídeo mudo — ver §12), todos provados reprovando dentro desta mesma
sessão. 1 mutante existente (`checkFalApprovalPolicy.ts`, G-A) foi
REANCORADO, não somado — a linha que ele media ganhou um segundo braço na
condição.

---

**A passada COMPLETA do fecho do B5c: 243/243, zero INERTE, zero AMBÍGUO,
zero ERRO, zero FALHOU.** HEAD `cf8d869`. Log em
`_arnes-logs/mutants-b5c-completa-2026-08-13-{a,b}.log`, md5
`6c67ea4fa2e84b8c87d538f1717e2747` nas duas cópias — idênticas. Sem carimbo de
PASSADA FILTRADA/PULADOS: é a completa de verdade. Árvore limpa em cada
reversão, e conferida por **hash contra HEAD** (não só `git status`, por
causa do gotcha 12) antes de escrever esta linha.

**Esta é a primeira completa desde a manhã de 13/08 (234/234, HEAD
`23dce3a`).** O arnês foi de 234 para **243** nesta janela: +3 no B3
(aprovação), +2 no B5 (cena/direção — G-1 e G-2 de `checkFalSceneWiringPolicy`)
e +1 no B5c (`checkExistingAvatarAssetsPolicy`). Todo o código pago do B3, do
B5 (`sync_mode: cut_off`, `model` do lipsync, `promptDeDirecao`) e do B5c
passou por esta completa — nada disso tinha sido confirmado pela completa
antes, só por afetadas.

```bash
npm run check:mutants
```

---

**Passada anterior — B2, `73/73` pela AFETADA (`--base 22e644f`), 12 arquivos
tocados, 164 pulados.** Log em `_arnes-logs/mutants-b2-afetada-final-{a,b}.log`,
md5 `8802b134cd32204f1cc72106264e3b85`. A **primeira tentativa dela morreu aos
37/73** com `0xC0000142` — causa: timeout de 10 min em volta de uma passada
que leva ~25 min. Não vale como desfecho; é o exemplo que fundou o gotcha 4.

**Antes dela, a última COMPLETA válida era a de 13/08 manhã (HEAD `23dce3a`):
234/234, 100% verde.**

---

**Passada anterior, de 12/08 noite, HEAD `faf7229`, 231 mutantes: COMPLETA E LIDA.**
`mutants-231-2026-08-12-a.log` (cópia `-b` idêntica, md5 `a89b6440…`).

| desfecho | n |
|---|---|
| ok | **229** |
| INERTE | **0** |
| AMBÍGUO | 0 |
| FALHOU | 0 |
| ERRO (mutante desatualizado) | **2** |

Sem carimbo de PULADOS — completa. Retry de spawn: **não disparou nenhuma
vez** (segunda passada seguida sem ocorrência; o 0xC0000142 não se repetiu).

**Os 2 ERRO estão nomeados na §7 e NÃO foram consertados** — é a regra:
mutante desatualizado para a passada de prova daquela guarda, e consertar no
mesmo fôlego em que se descobre é como se troca uma prova por outra sem
ninguém conferir.

**Nada aqui bloqueia o BLOCO 4 parte 2.** Zero INERTE significa que nenhuma
guarda ficou verde com o defeito aplicado; as duas de `ERRO` continuam
rodando no gate, o que não têm hoje é prova de que reprovam.

**A passada anterior (227, HEAD `c88b187`) foi INCOMPLETA** — chegou a
**38/227, todos `ok`**, zero INERTE/AMBÍGUO/ERRO, e foi morta pela sessão
seguinte para liberar a árvore. Retry de spawn: **nunca disparou** nos 38.
Aquele log está em `mutants-227-2026-08-12-a.log` e não vale como desfecho.

## 6 · NÃO VERIFICADO

- **A FASE 2 (Modo B) contra o fornecedor real.** Tudo — as duas paradas
  (`awaiting_approval` e `awaiting_approval_video`), `/approve`,
  `/approve-video`, `/redo-video` — foi exercitado só em
  `PROVIDER_MODE=fixture`. Nenhuma chamada real à fal.ai nesta sessão. O
  primeiro clique pago no fluxo de duas aprovações segue bloqueado por
  decisão do operador, não por falta de código.
- **BLOCO A + FASE 2 juntos, contra o fornecedor real, no MESMO vídeo.**
  Ninguém ainda gerou um vídeo Premium (Seedance) passando pelas duas
  aprovações de verdade — só em fixture, separadamente.
- **A fal.ai INTEIRA, o upload inclusive.** Nenhuma chamada real saiu deste
  repositório até 12/08 — o 3.5 foi bloqueado por credencial ausente (§1.2). As
  formas de resposta (`file_url`, `upload_url`, `request_id`, `status_url`,
  vocabulário de status, `images[].url`, `video.url`) são todas da documentação,
  e os três ids de modelo vieram por escrito. Um id errado vira 404, não
  cobrança.
- **`sync_mode: "loop"` foi escolhido por ELIMINAÇÃO, não por medição.** Sabe-se
  o que `cut_off` faria no caso inverso (cortar a fala); o que `loop` faz quando
  o vídeo é MAIS LONGO que o áudio — que é o caso desta fase, 10 s de clipe para
  ~8,72 s de fala — não está documentado nem foi observado.
- **A régua de 10,89 car/s desta fase.** Não é medição deste projeto: é o número
  desta fase, e não se mistura com `CHARS_PER_SECOND` (12,8151) nem com
  `VOICE_SPEED` (0,85).
- **Os vídeos que o operador aprovou foram feitos na fal.ai e não há registro
  nenhum disso aqui** — quatro varreduras deram zero. Qual modelo e qual prompt
  os produziram é informação que só ele tem.
- **O arnês não se auto-testa.** Não existe guarda nem mutante cobrindo
  `tools/run-mutants.mjs`. Filtro e retry de spawn foram provados por script no
  scratchpad.
- **Por que a passada de 11/08 levou 3 h 50.** Os ~65 s/mutante eram uma
  divisão, não uma medição, e o número real é 20,84 s — mas o tempo de parede
  daquele dia foi real e nenhuma medição sobreviveu para explicá-lo.
- **A régua de custo única erra até 10×.** `HEYGEN_VIDEO_COST` usa
  `unitsPerBilledSecond: 3` para tudo, sustentado por três medições que são
  todas de photo avatar 720p na HeyGen.

## 7 · Dívidas abertas

- **Fase C (multi-vendor por tier em `routes/videos.ts`) e Fase D (primeiro
  teste real HeyGen) NÃO INICIADAS.** Fases A (migration 060) e B (admin
  multi-vendor) fechadas e aprovadas — ver §13. Bloqueadas por aprovação
  explícita do operador, não por falta de desenho: os 3 call sites e a
  regra de fallback já estão descritos em §13 e no
  [PLANO-MESTRE-SEQUENCIAL.md](PLANO-MESTRE-SEQUENCIAL.md), §2.5.
- 🔴 **O FRONTEND ATUAL FICA PRESO EM `awaiting_approval_video`.** Aberta em
  21/08 (FASE 2/Modo B, ver §12). `frontend/src/types.ts` (`VideoStatus`) e
  `GenerateStep.tsx` (`PROGRESS_BY_STATUS`, o botão "Aprovar") só conhecem
  `awaiting_approval`. Todo vídeo fal aprovado pela tela HOJE fica sem
  botão para avançar depois de `/approve`. Aceito conscientemente pelo
  operador nesta sessão para não construir UI ainda — mas é um estado REAL
  do produto, não hipotético, enquanto a UI do Modo B não existir.
- **UI do Modo B não existe.** Tela do vídeo mudo (preview + Aprovar +
  Refazer), espelhando a existente para a imagem. Sem ela, o item acima
  não se resolve. Ver §12.
- **Teste pago do Modo B não iniciado.** `/approve` parando em `animar` e
  `/approve-video` completando seguem NÃO VERIFICADOS contra a fal.ai real
  — só contra fixture. Bloqueado por decisão do operador.
- 🔴 **BLOQUEIO DURO — `ENDPOINT_ANIMAR` está ERRADO e o pipeline não passa da
  composição. Aberta em 14/08 (COMPOR-1), MEDIDA numa aprovação real.**
  `fal-ai/wan/v2.6/reference-to-video/flash` → **404 `Path
  /v2.6/reference-to-video/flash not found`**. Vive em dois lugares que precisam
  mudar juntos: [falPipeline.ts:151](backend/src/services/video/falPipeline.ts:151)
  e [endpointCatalog.ts:188](backend/src/services/providers/endpointCatalog.ts:188)
  — mais `DEFAULTS_NUNCA_HERDADOS`
  ([falPipeline.ts:146](backend/src/services/video/falPipeline.ts:146)), que é
  chaveado pelo mesmo id e ficaria órfão em silêncio se só um dos três mudasse.
  **Qual é o id CORRETO é NÃO VERIFICADO** — não foi procurado nesta rodada.
  ⚠️ **`ENDPOINT_SINCRONIZAR` (`fal-ai/sync-lipsync/v2`) está sob a MESMA
  suspeita e nunca foi exercitado** — a corrida morreu antes dele. Descobrir o
  id do Wan sem conferir o do lipsync troca um 404 por outro, uma etapa e
  US$ 1,00 depois.
- **O custo REAL de etapa nenhuma é observável deste repositório.** MEDIDO no
  COMPOR-1: `gastoPrevistoUsd` é calculado por `PRECOS_FAL` **antes** da
  chamada, e nenhuma resposta da fal traz preço — nem no submit, nem no status,
  nem no resultado. `metrics` traz só `inference_time`. Toda pergunta de
  "quanto custou de verdade" depende do painel/fatura da fal, e é a mesma
  dívida de reconciliação de 11/08 (US$ 1,14 previsto × US$ 5,30 no painel)
  vista por outro ângulo. **`animarUsdPorSegundo: 0.1` segue DECLARADO, não
  medido** — a corrida que o mediria foi a que deu 404.

- 🔴 **BLOQUEIA TERCEIROS — o campo "Cenário · Gerar via IA" é, de fato, o
  prompt da IMAGEM INTEIRA, e o rótulo não diz isso. Aberta em 14/08
  (COMPOR-1), MEDIDA numa composição real paga.** O que entra em
  `scenario_prompt`+`outfit_prompt` vira o **único** `prompt` do
  `nano-banana-2/edit` ([falPipeline.ts:579](backend/src/services/video/falPipeline.ts:579),
  montado em [avatarProvider.ts:1104](backend/src/services/providers/avatarProvider.ts:1104)):
  cenário, traje, **pose, orientação do rosto e enquadramento**, tudo. E a
  **Interpretação — o único campo onde a pose PARECE caber — não chega a esse
  modelo**: ela vira `promptDeDirecao`, lido só em
  [falPipeline.ts:699](backend/src/services/video/falPipeline.ts:699), dentro do
  Wan, que é a etapa DEPOIS da aprovação.
  **O sintoma medido:** com Interpretação dizendo "de frente para a câmera",
  foto de referência frontal (conferida a olho: `photo_urls[0]`, plano do peito,
  olhando para a lente) e um prompt de composição sem nenhuma palavra sobre
  pose, a imagem voltou **de perfil, olhando para fora do quadro**. Custou
  US$ 0,08 e 1 crédito. Nada falhou — o produto fez exatamente o que o texto
  pedia, e o texto não pedia pose porque nada na tela sugere pedi-la ali.
  **Por que é dívida e não preferência:** nenhum usuário adivinha que pose se
  escreve no campo de cenário, e a frente de deploy pressupõe terceiros
  operando isto sem ler o código. A separação em si é DELIBERADA e está
  justificada em [falPipeline.ts:295-308](backend/src/services/video/falPipeline.ts:295)
  (concatenar faria a imagem ser negociada por um texto escrito para o Wan) —
  **o defeito não é a separação, é a TELA não explicá-la.** Consertos possíveis,
  nenhum escolhido: renomear o campo e reescrever o `help`; um terceiro campo
  explícito de pose/enquadramento que entre no `promptDeComposicao`; ou um
  trecho fixo de enquadramento anexado por nós — este último **mente menos só
  se for visível na tela**, senão é o mesmo defeito do "prompt mínimo default"
  já recusado. **Não corrigir sem decidir qual.**
- **O CORPO ENVIADO À FAL NÃO É GRAVADO — "que prompt foi enviado" é sempre
  RECONSTRUÇÃO. Aberta em 14/08 (COMPOR-1).**
  `gravarRespostaCrua` grava só a **saída**
  ([falPipeline.ts:553](backend/src/services/video/falPipeline.ts:553)); o
  `corpo` que vai em `etapaNaFal`
  ([:534](backend/src/services/video/falPipeline.ts:534)) morre na chamada.
  Responder "por que a imagem saiu assim?" exige reaplicar
  `promptDaComposicao` aos campos da linha — determinístico, verificável, e
  ainda assim **DEDUZIDO**. A pergunta só aparece quando a imagem sai errada, e
  é exatamente aí que a reconstrução vale menos que o registro.
  **O que custaria, dimensionado por leitura — a elisão NÃO é o trabalho:**
  `redactDeep` já existe, já cobre aninhamento, `Error` e referência circular
  ([safeLog.ts:114](backend/src/services/log/safeLog.ts:114)), e
  `JSON.stringify(redactDeep(corpo))` resolve o sigilo numa linha. O trabalho é
  o resto: **coluna nova** (`request_body` em `fal_pipeline_steps`, migration),
  **método novo** na interface `DiarioDoPipeline`
  ([falPipeline.ts:244-252](backend/src/services/video/falPipeline.ts:244)) e na
  implementação ([falPipelineJournal.ts:73](backend/src/services/video/falPipelineJournal.ts:73)),
  **a chamada** em `etapaNaFal` entre `abrirEtapa` e `falSubmit`, e — o item que
  já mordeu uma vez — **revisar `checkFalPipelinePolicy`**, que mede a ORDEM das
  gravações e no B2 quebrou por exatamente este motivo (uma gravação nova
  passou a acontecer antes da que ela media). Some uma guarda nova ("o corpo é
  gravado ANTES da submissão") e o mutante dela. **Nenhuma linha escrita.**

- **BAIXO RISCO — `VENDOR_FORMAT_SUPPORT.fal` ([videoFormat.ts:171-180](backend/src/services/providers/videoFormat.ts:171))
  tem texto DESATUALIZADO desde o B2, achado em 13/08 lendo a tela do passo
  Cena.** O `reason` ainda afirma "não há ramo de geração para ela
  (`generateVideo` despacha só heygen/did)" — verdade até `9d2d1e6`, falsa
  desde que o B2 acrescentou `if (input.vendor === "fal") return
  generateVideoFal(input);` acima do ternário. Nunca foi revisado no B2, B3,
  B5 nem B5c. **NÃO bloqueia nem distorce a geração** — MEDIDO por leitura do
  call site: `vendorAcceptsFormat()` em `avatarProvider.ts:1296` só decide se
  um `logEvent("warn", "video_format_not_applied", …)` é emitido; não há
  `return` nem `throw`, e o despacho para `generateVideoFal` que vem depois é
  indiferente a esse descritor. O sintoma visível é só o aviso vermelho de
  proporção no passo Cena (que renderiza `PublishStep` internamente,
  [SceneStep.tsx:268](frontend/src/pages/CreateVideo/steps/SceneStep.tsx:268)) — a
  afirmação em si (a fal não recebe `aspect_ratio`/`resolution`) segue
  verdadeira, só a explicação do "por quê" que mente. Conserto: reescrever o
  `reason` para refletir a realidade atual do Wan, numa rodada de limpeza de
  dívidas — não é desta.
- ~~2 MUTANTES PODRES~~ **CONSERTADOS em 13/08** (`2cd2987`), e agora há guarda
  que os pega em segundos no `npm run check` em vez de 80 min na passada. O
  histórico do que eram:
  - `formato: suporte declarado precisa de evidência :: vendor sem evidência
    nenhuma passa a declarar suporte` — o `find` casa **2×** em
    `videoFormat.ts`. **Causa: o próprio BLOCO 2 (`9d2d1e6`)**, que acrescentou
    a linha da fal com `supported: false, evidence: "none"`. Ficou latente
    porque nenhuma passada completa rodou desde então. O conserto é dar contexto
    único ao `find` — não apagar a linha nova.
  - `passo 1: traje em preparo trava o Avançar :: a trava passa a valer também
    para o traje que falhou` — casava **0×**: a linha foi renomeada em
    `e483929`.
- **DÍVIDA DE RECONCILIAÇÃO, aberta e sem explicação inventada:** o plano v6
  anota ~US$ 1,14 nos testes A/B e o painel da fal mostra **US$ 5,30 em 7 dias
  com 12 requisições**. Nenhuma hipótese registrada — os preços do
  `providerCost.ts` estão marcados **DOCUMENTADO** até uma fatura ser conferida.
- 🔴 **O DÉBITO DO CAMINHO DA FAL FICOU FORA DO B2, e é decisão adiada, não
  esquecimento.** A composição não cobra crédito de tenant nenhum. A razão está
  na §1.4: a rota (que é quem debita) recusa a fal de propósito, e criar um
  débito dentro do orquestrador abriria um SEGUNDO lugar que cobra. **Escolher
  onde ele mora é o primeiro passo do B3**, e as três saídas estão listadas em
  [PROXIMA-RODADA.md](PROXIMA-RODADA.md).
- **O débito de crédito acontece ANTES da chamada ao fornecedor** — MEDIDO por
  leitura: `debitCredit` em `routes/videos.ts:1088`, `generateVideo` em `:1174`.
  Com crédito de avatar zerado o clique morre no crédito sem chegar à fal, e o
  erro parece falha de pipeline. Precisa ser resolvido antes do fluxo por
  produto (BLOCO 4 parte 2). A SONDA não passa por aqui: ela não consome
  crédito de tenant nem orçamento live, só o teto em dólares.
- **`voiceId: avatar.voice_id` (`routes/videos.ts:1179`) não tem guarda ancorada
  no uso.** Trocá-lo por um id fixo passa o gate inteiro.
- **Cenário e traje são coletados, persistidos e nunca enviados.** Não há campo
  no contrato do fornecedor; a proposta registrada é REMOVER o passo. Decisão do
  operador, não executada.
- **`deriveVariantsForVideo` existe, tem guardas verdes e zero chamadores** fora
  dos scripts.
- **4 mutantes DEVIDOS** do congelamento de 05/08, por NOME: `a estimativa volta
  a sair da duração pedida`, `o ritmo vira número digitado em vez de derivado da
  medição`, `o teto de confirmação some do veredito do servidor`, `o player
  volta a mostrar a duração pedida`.
- **Paralelizar o arnês está BLOQUEADO**, e a causa é o bind mount: o container
  monta caminhos fixos (`./backend/src:/app/src`), então um git worktree em
  outro diretório **não é visto por ele** — MEDIDO em 12/08. Sem worktree
  visível não há como dar a cada worker sua própria árvore, e paralelizar na
  mesma árvore corrompe a passada em silêncio. Destravar exige tocar
  `docker-compose.yml`.

## 8 · SYNC-VPS-1 — a VPS já está em produção; esta rodada só trouxe 3 correções do filesystem dela para o git

**Custo: US$ 0,00. Guardas da rodada: zero chamada a fornecedor, zero
docker/npm/build local — só leitura e edição de arquivo.** Esta seção registra
o que o OPERADOR relatou sobre a VPS `eckko-prod-mia-01` mais o que foi
MEDIDO localmente nesta sessão sobre os 3 arquivos corrigidos.

**Estado da VPS — REGISTRO DO OPERADOR, NÃO VERIFICADO por esta sessão**
(nenhum SSH/docker foi executado aqui, por guarda G2 da rodada):
- Deploy em produção pela **primeira vez**, os 4 containers (`traefik`,
  `postgres`, `backend`, `frontend`) relatados **healthy**.
- TLS emitido pelo Let's Encrypt para `eckkoai.smartinovat.com` e
  `dev-c77a5b.eckkoai.smartinovat.com` — coerente com a lista estática de
  `tls.domains` já registrada em `traefik/dynamic.prod.yml` (ver §1.9 e o
  comentário do próprio arquivo).
  `https://eckkoai.smartinovat.com/` foi conferido carregando em produção
  pelo navegador nesta sessão.
- Banco restaurado com sucesso: **18 tenants / 29 videos / 54
  api_credentials**.
- **`PROVIDER_MODE=fixture` é o estado ATUAL de produção** — nenhum gasto
  real acontece na VPS até decisão explícita de armar `live` (mesmos 5
  critérios de desarme do CLAUDE.md, aplicados agora ao ambiente da VPS, não
  só ao dev local).

**Os 3 bugs — achados e corrigidos À MÃO direto no filesystem da VPS, fora do
git; esta rodada os replicou nos arquivos locais para não se perderem no
próximo `git archive` a partir do HEAD.**

1. **CRLF em `backend/docker-entrypoint.sh` — MEDIDO: o arquivo local (HEAD
   `22f9db8`) já está em LF, tanto no índice quanto na árvore de trabalho**
   (`git show HEAD:… | grep -c $'\r'` → 0; `git ls-files --eol` → `i/lf
   w/lf`). Não havia CRLF para normalizar localmente — o bug ocorreu na
   cópia da VPS, não neste checkout. **O que faltava era prevenção**: o
   arquivo não tinha atributo de EOL declarado (`git check-attr eol` →
   `unspecified`), e `core.autocrlf` local está em **`true`** — a
   combinação que deixa qualquer clone/checkout futuro nesta máquina
   Windows sujeito a reintroduzir CRLF num `.sh`. Criado `.gitattributes`
   na raiz com `*.sh text eol=lf` (e `* text=auto eol=lf` como default
   geral) para fechar essa porta.
2. **`traefik/dynamic.prod.yml` — as 3 regras `rule:` (backend/uploads/
   frontend) trocaram aspas duplas externas por aspas simples**, preservando
   as aspas duplas internas de `{{env "BASE_DOMAIN"}}` sem escapar e o `\.`
   do regex intacto. Confirmado por leitura das 3 linhas e por
   `grep -n '\\"'` no arquivo devolvendo **zero ocorrências**.
3. **`traefik/traefik.prod.yml` — `email: <PREENCHER-EMAIL>` trocado por
   `manfredhaut@gmail.com`**, o e-mail de contato ACME já em uso e
   confirmado funcionando na VPS agora (não é segredo — é o contato do
   certificado, publicamente visível em qualquer consulta ao certificado
   emitido).

**Commit único desta rodada leva só os arquivos do G3 que de fato mudaram:**
`.gitattributes` (novo), `traefik/dynamic.prod.yml`, `traefik/traefik.prod.yml`,
`ESTADO.md`. `backend/docker-entrypoint.sh` **não entra no commit** — nenhuma
mudança de conteúdo foi necessária nele (já estava correto).

---

## 15 · Sessão de 23/08/2026 — guardas inertes, frescor do Vite, e o bloco P7

**HEAD `b00b744`, árvore limpa. Nada gasto nesta sessão: US$ 0,00.**
Troca de conta: gatilho **`RETOMAR-P7`** → [RETOMAR-P7.md](RETOMAR-P7.md).

### I1 — as 4 guardas inertes eram `expect` desalinhado, não lógica quebrada

A passada completa devolvera 4 INERTE/AMBÍGUO (posições 79, 249, 257, 258).
**MEDIDO, investigando um a um:** nos quatro a checagem própria da guarda
DISPAROU CERTO desde sempre; o que não batia era o campo `expect` do mutante
contra a mensagem real (`output.includes(m.expect)`,
`tools/run-mutants.mjs:382` — substring exata). Nenhuma lógica de guarda
mudou. Commit `b679ea2`. **Passada completa seguinte: 358/358, zero
inerte/ambíguo/erro** (`_arnes-logs/mutants-i3-completa-2026-08-22-b.log`,
md5 `b3461c14ac5a4666be6f3390c2d968eb`).

**X0 reconciliado:** `cb7d66f` = 342 mutantes exatos; os 4 até `1fb17cd` (346)
vieram todos de `checkScriptLimitPolicy.ts` (12 → 16), commit do E1.

### L1 — o bypass do diálogo aconteceu DUAS vezes, e o motivo era ALCANCE

`checkFrontendBundleFreshness.mjs` existia e estava no `tools/up.sh`, e não
impediu. **MEDIDO:** o ambiente sobe por ≥6 caminhos e só `up.sh` passa pela
checagem — `docker compose restart <svc>` (o caso real, e o conserto que o
próprio gotcha 2 do CLAUDE.md manda rodar), `up -d`, `start`, boot da
máquina, botão do Docker Desktop.

**Mecanismo real, MEDIDO:** `frontend/src` é bind mount, então o arquivo em
disco DENTRO do container está sempre atual — com o bundle servido ainda
pré-G3, o `grep` no `/app/src` do container já achava o G3. Quem estava velho
era o **cache de transformação do Vite** (watcher não recebe eventos de FS
através do bind mount no Windows). É isso que torna a checagem possível sem
git e sem docker: **os dois lados da comparação estão dentro do container.**

**Conserto:** `tools/viteServeFreshness.mjs` no **healthcheck do frontend** —
roda a cada 10 s, independente do caminho de subida. Compara chaves de i18n
**e** nomes declarados do arquivo de maior mtime (sem marcador a manter; os
dois tipos importam, o G3 renomeou handlers E acrescentou chaves).
Descartados, com motivo no cabeçalho do script: boot do backend (ordem de
subida), middleware por request (custo + exige versão que o velho não tem),
banner no frontend (**ovo e galinha — bundle velho não executa o banner
novo**). 5 mutantes provados à mão + ponta a ponta no container real (disco
com sinal a mais → exit 1 nomeando o sinal). Commit `b00b744`.
**Limite escrito no script:** edição que não mude nome declarado nem chave de
i18n passa despercebida.

### Achados de leitura desta sessão — MEDIDOS, corrigem o CLAUDE.md

- **`/v1/user/subscription` do ElevenLabs responde 200** (o CLAUDE.md registra
  401 por falta de `user_read`, e lista como item ABERTO). A chave da
  plataforma tem a permissão. **O item pode ser fechado.**
- **`voice_limit: 10` MEDIDO** — o `DEFAULT_VOICE_SLOT_LIMIT = 10` deixou de
  ser suposto. A GUARDA B está calibrada.
- **9 de 10 slots de voz ocupados** (30 vozes = 21 `premade` + 9 `cloned`).
- **Plano ElevenLabs: `starter`**, `can_use_professional_voice_cloning:
  false` → **PVC indisponível**; exige Creator (+US$ 16/mês).
- **`remove_background` FUNCIONA com Look selecionado** — fechado a custo
  zero pelo vídeo histórico `5b3773da` (look `800e04f0` + fundo `#1B2A4A`):
  os 4 cantos medem RGB(28,41,71) contra (27,42,74) pedido, fundo sólido
  uniforme. **Alcance:** o look medido tem fundo de estúdio quase uniforme;
  que funcione em look com CENÁRIO composto (neon hallway) segue
  **NÃO VERIFICADO**.
- **Chave de plataforma da HeyGen: `servedBy: ""`** — armazena e valida
  apenas, zero chamadores em produção. É decisão registrada do bloco
  CHAVES-2, não bug. Migrar exigiria mudar a ORDEM em `videos.ts:1231/1249`,
  não só acrescentar um `if`.

### ⚠️ BLOQUEIO ABERTO — a chave da fal está inválida

**MEDIDO em 23/08:** `POST queue.fal.run/fal-ai/nano-banana-2/edit` com a
chave do tenant `dev-c77a5b` → **401 `{"detail":"invalid key credentials"}`**.
Formato correto (`uuid:hex`, 69 chars, 2 partes); chave de PLATAFORMA da fal
**ausente**. **Nenhuma geração pela fal funciona hoje** — tiers Normal e
Premium inertes na prática. Gasto da tentativa: **US$ 0,00** (401 é recusa
antes de qualquer trabalho). **Ação do operador:** repor a chave, de
preferência no painel de plataforma.

## 16 · Sessão de 23/08/2026 (segunda) — RETOMAR-P7 e a instrumentação do gasto

**HEAD `043caf6` + o commit deste fechamento. Árvore limpa. Nada gasto:
US$ 0,00, nenhuma chamada a fornecedor nenhum.** Desarme conferido no começo
e depois do `restart backend`: `fixture len=0`, `healthy`.

### O bloqueio da fal segue de pé — e foi MEDIDO sem tocar no fornecedor

O RETOMAR-P7 §6 manda perguntar ao operador se a chave foi reposta. Não foi
preciso: a resposta está no banco local, e sondar a fal com uma chave que
pode ter voltado a valer custaria dinheiro num endpoint que gera imagem.

- `platform_credentials` tem **UMA** linha: `elevenlabs` (last_four `f13d`,
  validada 09/08). **Chave de plataforma da fal: ausente.**
- `api_credentials` do tenant `dev-c77a5b`, `avatar`/`fal`: `updated_at`
  **19/08/2026 16:48Z** — é a MESMA chave que devolveu 401 em 23/08.

**P7.c continua bloqueado.** Não há segunda fonte de chave para contornar.

### O obstáculo 1 era maior do que o RETOMAR-P7 registrava

Ele descrevia um risco do multi-clipe que ainda não existe. **MEDIDO: já está
aberto no produto de hoje.**

| o quê | medido |
|---|---|
| coluna de custo em `fal_pipeline_runs` | **não existia** — `gastoPrevistoUsd` vivia na memória da invocação e num `logEvent` |
| corridas por vídeo | **24 corridas para 7 vídeos**; `d450c86c` com **4**, outros três com 2 |
| limite de cliques em "Refazer" | **nenhum**, nos dois botões |
| custo de um clique em `/redo-video` | **US$ 0,375** (Wan) · **US$ 6,93** (Seedance 15 s) — re-paga `animar` |

Dez cliques no Premium são **~US$ 69,33**, e as dez corridas passam pelo teto
de US$ 10,00 **sem uma reclamação**: cada uma cabe sozinha. O freio existe e
mede a coisa errada.

⚠️ **O `gastoAcumuladoUsd: 0` NÃO foi mexido, e não deve ser.** É decisão
declarada em três lugares (`runFalPipelineDaImagem`,
`runFalPipelineDoVideoMudo`, `recompor`) e o argumento está CERTO no escopo
dela: somar o gasto passado ao teto da CORRIDA recusaria a segunda metade por
dinheiro que já saiu. O que faltava era o escopo do **VÍDEO**, que aquele
argumento não cobre. Quem vier "consertar o zero" está desfazendo a coisa
errada.

### O que foi feito — `043caf6`, e SÓ INSTRUMENTA

**Decisão explícita do operador (23/08): medir com dados reais antes de
escolher o número de um freio.** Nenhum teto novo nasceu; o teto por corrida
segue idêntico e nenhuma corrida legítima muda de comportamento.

- **migration 062** — `fal_pipeline_runs.gasto_previsto_usd`, `numeric NOT
  NULL DEFAULT 0`. As 24 corridas antigas entram em zero: subestima o passado
  (rodaram sem instrumentação) e é exato do primeiro registro novo em diante.
  NULL faria toda soma por vídeo virar NULL.
- **`DiarioDoPipeline.registrarGastoPrevisto()`** nos 3 pontos onde
  `autorizarGasto` libera etapa paga, **sempre antes da submissão**. Grava o
  ACUMULADO, não o custo da etapa — sobrescreve, não incrementa, então uma
  gravação perdida não desalinha o total.
- **`gastoAcumuladoDoVideoUsd(videoId)`** soma por `video_id`; `abrirCorrida`
  a lê **antes** do INSERT e a registra em `fal_gasto_acumulado_do_video`.
  Ponto único de propósito — as 4 rotas que abrem corrida passam por ele, e
  instrumentação copiada em 4 call sites some de um deles na próxima rodada.
- **`checkFalGastoInstrumentadoPolicy.ts`** — 5 guardas, 5 mutantes. G-1/G-2/
  G-3 medem por EXECUÇÃO (orquestrador real, `fetch` substituído); a ordem de
  G-2 sai da intercalação **`gsgsgs`** de gravações e submissões numa lista
  só. G-4/G-5 medem forma, porque `abrirCorrida` fala com o Postgres direto.
- **6 diários em memória de 5 guardas** ganharam o método como no-op —
  inclusive o de `checkFalPipelinePolicy.ts`, cujo `as never` no call site
  esconderia do `tsc` um erro de tempo de execução.

**Arnês: 368 mutantes declarados** (eram 363). Passada **AFETADA**, base
`818ca10`, 11 arquivos tocados → **64/64 com o comportamento esperado**, zero
INERTE/AMBÍGUO/ERRO, árvore limpa em cada reversão. Os 5 novos entre eles,
cada um nomeado no log.

**E a passada COMPLETA fechou: 368/368, zero INERTE/AMBÍGUO/ERRO/FALHOU** —
rodada depois de `03aa59d`, ponteiro e md5 na §5. Os 304 que a afetada tinha
pulado foram exercitados nela.

### Onde retomar

1. **A chave da fal.** Sem ela, P7.c não roda e os tiers Normal/Premium
   seguem inertes. Nada disso se contorna daqui.
2. **O freio por vídeo, quando houver dado.** A coluna agora responde
   `SELECT SUM(gasto_previsto_usd) … GROUP BY video_id`. Os números
   derivados na sessão, para quando o operador escolher: pior caso de um
   vídeo completo de 15 s = **US$ 1,205** (Normal) / **US$ 7,76** (Premium);
   orçamento apertado (3 refazeres de imagem + 1 de vídeo) = **US$ 1,82** /
   **US$ 14,94**; folgado (3 + 3) = **US$ 2,57** / **US$ 28,80**.
3. Os obstáculos 2, 3 e 4 do RETOMAR-P7 §4 seguem abertos e intocados.

## 17 · Sessão de 24/08/2026 — R0–R8: leitura, atribuição, voz e ensaio

**Nada gasto: US$ 0,00.** Nenhuma chamada paga; três GETs não tarifados
(inventário de vozes, assinatura do ElevenLabs, docs públicas). `fixture
len=0` conferido na abertura e depois de cada `restart`.

### ⚠️ R4 PARADO por decisão do operador — leia antes de retomar

O gatilho de parada do R1.5 disparou: **a régua diverge da cobrança nos três
motores, em direções diferentes**, e o operador foi conferir o painel da fal
por chamada/data. **Não construa o teto em dinheiro antes dessa resposta.**

| etapa | nossas chamadas | régua diz | painel cobra | veredito |
|---|---|---|---|---|
| compor | 13 | US$ 1,04 | **US$ 1,04** | **EXATO ao centavo — agora MEDIDO** |
| animar (Wan) | 7 (80 s completos) | US$ 2,00 | US$ 1,00 | **SUPERESTIMA 2×** (tarifa real ≈ 0,0125/s) |
| sincronizar | 2 | US$ 0,69 | US$ 3,20 | **SUBESTIMA 4,6×** — ou o painel tem teste manual |
| animar (Seedance) | 1 | US$ 6,93 | **linha ausente** | sem contraparte nenhuma |

**O achado que importa:** `autorizarGasto` autoriza usando a MESMA régua que
pode estar 4,6× baixa. Ele calcula o sync a 0,05/s, vê US$ 0,45 e libera sob
o teto de US$ 2,00 — **o teto nunca foi confrontado com dinheiro real**.
Nunca barrou nada porque nunca soube o preço.

⚠️ E `estimateVideoCost` devolve **`known: false`** para `fal`. A fórmula que
o R4.2 pedia (`estimateVideoCost(nível, duração) × 3`) **não é aplicável hoje
aos dois níveis que precisam do freio**.

**US$ 5,03 do painel são de endpoints que o produto NUNCA chamou** — kling
ai-avatar (1,51), wan reference-to-video/flash (2,13), wan image-to-video sem
`/flash` (1,00), seedance v1.5 pro (0,39). Zero ocorrências no repositório
inteiro: são testes manuais do operador.

**Namespace — a hipótese do operador está REFUTADA, com data.** As três
linhas `fal-ai/wan/*` de US$ 0,00 **não são o 401 de 19/08**: são os **404**
de 13–14/08, do id com prefixo errado (`Path /v2.6/reference-to-video/flash
not found`, ENDPOINTS-3). O diário confirma: 1 etapa com esse `endpoint_id`,
14/08, presa em `running`. O 401 nem chega a registrar endpoint.

### R0 — as 24 corridas: o limite de 3 refações está LIVRE

**Não são etapas** (cada corrida tem as suas em `fal_pipeline_steps`) — são
INVOCAÇÕES de rota. **Máximo de refações no histórico: 1**, no `d450c86c`
(dois `animar` a 13 s de distância = aprovação + um Refazer). **Zero refações
de imagem.** O limite de 3 não barra nada já ocorrido.

⚠️ Obstáculo para implementá-lo: **`fal_pipeline_runs` não registra QUAL rota
a abriu.** Contar refações hoje exige inferir pelo conjunto de etapas.

### R2 — custo de refação

| nível | refazer imagem | refazer vídeo | base |
|---|---|---|---|
| **Direto** (HeyGen) | **não existe** | **não existe** — refazer é criar outro | MEDIDO |
| **Cena Composta** (Wan) | US$ 0,08 | US$ 0,375 (15 s) | compor MEDIDO · animar DECLARADO |
| **Premium** (Seedance) | US$ 0,08 | **US$ 6,93** | DOCUMENTADO, nunca medido |

O Direto é regeração completa e chamada única: `videoTierParaPipeline` mostra
que `"simples"` nunca alcança `falPipeline.ts`, e o fluxo vai de `queued` a
`ready` sem aprovação.

### R3 — vozes, usuário novo, vínculo

- **9 vozes próprias, 1 em uso.** `voice_limit: 10`, `voice_slots_used: 9`,
  `tier: starter` — MEDIDO. **8 liberáveis.** Cinco se chamam "TESTE REAL
  15:40 01/08".
- ⚠️ **Um avatar já é ÓRFÃO:** "Mário" → `wAd9MJ2I…`, ausente do inventário.
- **O usuário zerado NÃO funciona hoje.** Tenant novo nasce com 3 linhas de
  vendor VAZIO; a geração responde 400 `tier_vendor_unavailable`. **A chave
  de plataforma não resolve:** `resolveTenantAvatarFalKey` recebe a BYOK como
  parâmetro OBRIGATÓRIO e roda DEPOIS de a credencial do tenant ter sido
  lida. Ela substitui o VALOR, nunca a EXISTÊNCIA da linha.
- **HeyGen no painel de plataforma não muda nada:** `servedBy: ""`. Só a
  `fal` é consumida de verdade.
- **Etiqueta no fornecedor:** fal **não tem** (só `hint`, `priority`, headers
  da plataforma) · HeyGen **tem `callback_id`** e não enviamos · ElevenLabs
  `labels` é "map from string to string" mas a doc restringe a
  language/accent/gender/age — chave livre **NÃO VERIFICADO**.

### R5, R6, R7, R8 — entregues e provados

- **R8** `tools/estadoAnchor.mjs` — no HOST, porque o container **não vê
  `.git` nem `ESTADO.md`** (MEDIDO: `ls /repo` dá backend, frontend, tools,
  docker-compose.yml, package.json). `npm run estado` + começo de toda
  passada do arnês (avisa, nunca aborta). **Pegou a SEXTA divergência no
  primeiro tiro**, minutos depois de a quinta ter sido corrigida à mão.
- **R5** migration 063 — `endpoint_id`, `key_source`, `estimated_cost_usd` em
  `provider_usage`. Buracos MEDIDOS que fecha: das 12 linhas de
  `voice/elevenlabs`, **zero** tinham `video_id`; os dois pontos que resolviam
  a chave da fal descartavam o `source`.
- **R6** migration 064 `voice_clone_samples` + `DELETE /voice/voices/:id`
  (confirmação = o id digitado de volta; recusa voz em uso; não apaga a
  amostra em cascata) + `POST /avatars/:id/voice-reclone` (clona → reaponta)
  + `GET /voice/voices` + `remove_background_noise` explícito. **O teto
  deixou de ser palpite.**
- **R7** `ensaioSimulado.ts` — dois níveis, falha parcial e usuário novo, com
  **zero rede medida**. Item 4 PARCIAL: o custo na tela depende da régua.

### Dois defeitos que esta sessão criou e consertou

1. **Ciclo de importação (`5e5e041`).** O R5 fez `avatarProvider` importar
   `providerCost`, fechando o anel com `scriptDuration`/`voiceProvider`.
   Como `providerCost` chama `estimateSecondsFromChars` no topo do módulo, a
   entrada por `falPipeline` morria com `Cannot access 'VOICE_SPEED' before
   initialization`. **O gate não pegava** (entra por `checkPolicy`, ordem
   diferente); quem descobriu foi o ensaio. Conserto: `billing/voiceCost.ts`,
   módulo FOLHA sem importação nenhuma.
2. **Guarda INERTE (`3a8c377`).** O mutante do ensaio punha um `fetch` no
   `main()`, que a guarda não importa. Alcance, não lógica — mesmo padrão do
   I1. Conserto: segunda perna por forma, no arquivo inteiro.

### Arnês

**380 mutantes declarados** (eram 368). Os 12 novos provados individualmente.

**Passada AFETADA, base `ca49361`: 136/136, zero INERTE/AMBÍGUO/ERRO/FALHOU**
— 22 arquivos tocados, 244 mutantes NÃO exercitados. Log em
`_arnes-logs/mutants-r0r8-afetada-2026-08-24.log` (segunda cópia no
scratchpad da sessão, pelo gotcha de 11/08). Árvore limpa em cada reversão. A COMPLETA fica
para quando o operador pedir — está verde em `ca49361` e leva ~2 h.

⚠️ **A primeira tentativa desta passada NÃO RODOU, e o erro foi de invocação
minha:** `node tools/run-mutants.mjs … | tee arquivo | head -8`. O `head`
fechou o pipe depois de 11 linhas, o arnês morreu por SIGPIPE, e o `exit 0`
que voltou era do `head`. **Um verde que não existia.** Nunca canalize a
saída do arnês para um comando que fecha o pipe cedo — redirecione para
arquivo e leia depois.

### E a passada pagou por si, pela segunda vez em dois dias

Ela devolveu **1 INERTE**, e a causa era minha, encadeada a partir do R6:

1. A rota de reclonagem virou o SEGUNDO chamador de
   `voiceNameWithTimestamp`. **O gate pegou o primeiro efeito na hora:** o
   `find` do mutante passou a casar 2×. Consertado com contexto único.
2. **A passada pegou o segundo, que o gate não vê:** a GUARDA checava
   PRESENÇA da função no arquivo inteiro. Com dois chamadores, mutar a
   clonagem original deixava a da reclonagem no arquivo, o regex casava, e a
   guarda dizia verde sobre uma clonagem sem carimbo. Consertado por
   PAREAMENTO (`cloneVoice({` conta N, `name: voiceNameWithTimestamp(` conta
   M, M === N) — mais forte que o original: chamador novo sem carimbo
   reprova sozinho.
3. Isso reescreveu a mensagem da guarda e o mutante saiu **AMBÍGUO**: o
   `expect` ficou na frase antiga. **Mesmo defeito do bloco I1 de 23/08.**
   Regra que sai daqui: **reescrever a mensagem de uma guarda obriga a reler
   o `expect` do mutante dela.**

Dois defeitos da mesma causa, e cada camada pegou um — é o argumento de por
que a afetada fecha rodada.

## 18 · Sessão de 24/08/2026 (segunda parte) — W0 e W1

**US$ 0,00.** Nenhuma chamada paga; três leituras públicas (`/__image-stamp`,
`/api/health`, docs) e o banco local. `fixture len=0` o tempo todo.

### ⚠️ W0 — DOIS AMBIENTES, e as medições da §17 são do LOCAL

O operador comparou dois painéis e o quadro mudou. **Tudo o que a §17 mede é
`docker compose` desta máquina.**

| pergunta | resposta MEDIDA |
|---|---|
| bancos diferentes? | **sim** — a §8 registra produção com 18 tenants; o local tem **34** |
| commit em produção | **entre 14/08 e 21/08**, ≥ **46 commits** atrás do HEAD |
| migrations pendentes | **7 certas** (058–064) + 5 prováveis (053–057) |
| P7.c destravado? | **só no local.** Em produção nem existe o mecanismo |

**Como o commit de produção foi medido, sem SSH** (a memória proíbe, e o
operador é o único com acesso à VPS) — dois sinais independentes:
- `GET eckkoai.com/__image-stamp` = `a086dd81e3a98377`. **Piso:** imagem de
  14/08 14:50 (`7ca81b1`) ou depois.
- **O cartão da fal não aparece** no painel de produção. Ele nasceu em
  `2a04b4a` (21/08 10:31). **Teto:** produção é anterior a ele.

⚠️ **O carimbo NÃO serve para versionar, e isso é limitação da nossa
instrumentação.** Ele cobre 4 arquivos (`package.json`, `tsconfig.json`,
`vite.config.ts`, `Dockerfile` do frontend) que não mudam desde 14/08:
rodando o cálculo dele contra os últimos 200 commits, **75 produzem o mesmo
hash, inclusive o HEAD**. Ele existe para pegar imagem velha, não para dizer
qual código roda. E `/api/health` devolve só `{"status":"ok"}` — não há
endpoint de versão em lugar nenhum. **Dívida registrada.**

### W1 — o tenant zerado nasce funcionando

**MEDIDO: 23 de 34 tenants** não tinham vendor de avatar próprio. A chave de
plataforma substituía o VALOR de uma linha existente e nunca cobria a
ausência dela — então tenant novo (três linhas de vendor VAZIO, chave nula)
recebia `null` e a geração respondia 400, com as chaves gravadas ali do lado.

Decisão do operador, fechando o CHAVES-2: **a plataforma paga quando o tenant
não tem chave própria; quem tem continua pagando a dele.**

- `platformInheritance.ts` — mapa `(provider, vendor)` → chave, com a
  **precedência como campo**. Mapa explícito porque 3 dos 5 pares quebram a
  regra do nome; o pior é `script/anthropic`, cuja chave parecida (`copilot`)
  serve o SUPORTE.
- A herança entra em `credentialLookup`, **abaixo de todos os leitores** —
  nenhum call site mudou. `ResolvedCredential` ganha `source`, que alimenta
  `provider_usage.key_source` (R5): os dois blocos se encontram.
- `vendorHerdavel`: quem nunca escolheu recebe o primeiro vendor COBERTO, não
  o `defaultVendor` — sem isso `script` ficava de fora (o default é
  `anthropic`, que é `null` de propósito).

⚠️ **DIVERGÊNCIA DE PRECEDÊNCIA, declarada e PENDENTE de decisão.** A fal faz
`plataforma_vence` desde 21/08 — o oposto da regra do W1. Não é descuido: a
BYOK do `dev-c77a5b` é a chave que deu **401 em 19/08**, e alinhá-la à regra
geral **re-bloquearia o P7.c**. Por isso a precedência é um campo: mudar é
editar uma palavra. **Qual das duas a fal deve seguir é decisão do operador.**

**`servedBy`:** heygen, elevenlabs e google deixam de dizer "ainda sem
consumidor". O **embedding NÃO muda**, com motivo medido: `generateEmbedding`
devolve `Math.random()` e nunca consulta chave; `resolveEmbeddingKey()` não
tem um chamador. Ligá-lo exige implementar embeddings, não herdar chave.

**Selo (item 6):** cinco estados, verde só quando o fornecedor respondeu.
Motivo medido: o operador gravou 4 chaves e as 4 ficaram com
`last_validated_at` NULL — a validação só roda por clique — e a tela dizia
"conectado" nas quatro.

### Três defeitos que a rodada revelou

1. **Duas guardas existentes acusaram a mudança na passada em que ela nasceu,
   e as duas estavam certas:** `PLAINTEXT_ALLOWED` (quem lê chave de
   plataforma em claro precisa de motivo escrito) e o duplo de banco da
   prontidão. O segundo virou, por acidente feliz, o caso (c) do W1.
2. **`resolvePlatformKey` estourava com id desconhecido** (`0472f14`) — o
   tipo dizia que era inalcançável, mas o id chega de um MAPA. Agora falha
   fechado.
3. **Mutante em auto-colisão** (`f0203e3`) — mutava a mesma linha que o
   próprio `find` procura, e o AMBÍGUO encobria uma reprovação correta.

### Onde retomar

1. **A régua (R1) segue esperando o painel da fal** — trava o R4.2.
2. **A precedência da fal** — decisão pendente, descrita acima.
3. **O deploy**, se a apresentação for em `eckkoai.com`: 46+ commits e 7–12
   migrations. Nada disso foi feito nem dimensionado.
4. **W2, W3 e V0 nunca chegaram a esta sessão** — o operador os menciona como
   já passados; não estão aqui e não foram reconstruídos de memória.

### Arnês

**385 mutantes declarados** (eram 380). Os 5 novos provados individualmente.
Passada **AFETADA**, base `bcfc98d`, 16 arquivos tocados → **37/37, zero
INERTE/AMBÍGUO/ERRO/FALHOU**, árvore limpa em cada reversão. 348 NÃO
exercitados. Log em `_arnes-logs/mutants-w1-afetada-2026-08-24.log`.

⚠️ **PENDENTE do W1 item 6, proposto e NÃO implementado:** gravar deveria
disparar a validação onde há sonda. O desenho proposto é o `PUT` responder
já com a chave gravada e disparar a validação em seguida, com a tela indo de
`GRAVADA` para `VALIDADA`/`RECUSADA` sozinha — gravar e validar são coisas
diferentes, e a gravação não pode falhar porque o fornecedor está lento. Sem
isso, o caminho normal (gravar pelo painel) deixa quatro selos âmbar e
ninguém sabe que faltava clicar.

## 19 · Sessão de 24/08/2026 (terceira parte) — B0, V0, W2, W3

**US$ 0,00.** Um commit (`58aaec2`), dez rascunhos squashed em ramo próprio.
Passada **AFETADA**: **89/89**, zero INERTE/AMBÍGUO/ERRO — e ela rodou **em
paralelo, ancorada em `58aaec2`**, que é o V0 se pagando na primeira vez que
foi usado para valer. Log em
`_arnes-logs/mutants-b0v0w2w3-afetada-2026-08-24.log`.

**394 mutantes declarados** (eram 385). Os 9 novos provados individualmente,
mais **6 `find` regenerados** que as mudanças desta rodada invalidaram — a
conferência de cadastro pegou os seis no gate, em segundos.

### O que mudou no processo de trabalho

- **`BACKLOG.md`** é o segundo arquivo lido na abertura. `npm run estado`
  confere os DOIS ponteiros. O plano deixou de morar no chat.
- **O arnês roda em PARALELO por default**, 6 workers, cada um num
  `git worktree`. `--serial` é a retaguarda. **~135 min → ~40 min.**
- **Editar o repositório durante uma passada deixou de ser proibido** — o
  gotcha 4 do ESTADO.md (que mandava não mexer na árvore) **não vale mais
  para o modo paralelo**: a passada roda contra um COMMIT.

### Os números medidos, para não serem remedidos

| N workers | tempo | vazão |
|---|---|---|
| 1 | 16,4 s | 0,061 gates/s |
| 4 | 28,0 s | 0,143 |
| **6** | **37,8 s** | **0,159** ← ótimo |
| 10 | 66,6 s | 0,150 |

A vazão **cai** depois de 6: o `tsc` satura a CPU. "Um por núcleo" (12)
seria pior. Serial × paralelo num subconjunto real: 76,7 s → 37,3 s, com os
**vereditos idênticos**.

### Três erros meus que as provas pegaram

1. **A checagem do V0 contradizia o V0.** A primeira versão ABORTAVA quando
   o repositório principal mudava durante a passada — exatamente o que o
   bloco veio permitir. Provei editando `falPipeline.ts` com a passada em
   curso: 5/5 `ok` (a passada É íntegra) e a checagem abortou mesmo assim.
   Virou aviso; o isolamento se prova por construção.
2. **Multipliquei um total de período pela duração.** US$ 1,00 (total do
   Wan) × 5 s = US$ 5,00 — número sem sentido que barrava toda geração no
   teto de US$ 2,00. **Um agregado não tem unidade.** Agora ele alerta e não
   entra na conta.
3. **Reportei uma passada como lançada quando ela tinha morrido.** `| head -8`
   fechou o pipe, o arnês morreu por SIGPIPE e o `exit 0` era do `head`. Virou
   guarda (`SIGPIPE não é sucesso`) e regra escrita.

### O que segue aberto

1. **A régua** — o custo POR CHAMADA do Request History. É o que troca
   AGREGADO por unitário em `provider_prices` e destrava o teto do R4.2.
2. **O Premium sem prova** — teste mínimo de **US$ 2,3112**, precedido de um
   fusível de US$ 0,00. Ver BACKLOG.
3. **O botão de Refazer não desabilita na tela** — o servidor recusa a 4ª com
   409 e devolve `{feitas, limite}`; a tela ainda não consome.
4. **Produção 46+ commits atrás.** Fila, por decisão do operador.

## 20 · Sessão de 24/08/2026 (quarta parte) — o botão de Refazer e o W4

**US$ 0,00.** **396 mutantes** (eram 394).

### O botão de Refazer desabilita (W3.1b)

Os dois botões travam **assim que a 3ª refação é registrada** (`>=`, não
`>`), com o motivo em texto. A leitura entrega `refacoes: {feitas, limite}`;
ausência NÃO trava — o servidor continua sendo o freio real.

### Os cartões de nível destravaram (W4.1) — um defeito que o W1 criou

**MEDIDO: 23 de 34 tenants tinham os TRÊS cartões travados enquanto o
servidor gerava normalmente.** A tela lia `GET /credentials` e testava
`vendor === "heygen"` / `=== "fal"` nas linhas DO TENANT — exato até o W1, e
errado depois dele: com a herança, a linha fica com `vendor` VAZIO.

**O W1 consertou o servidor e a tela ficou para trás.** O defeito não aparece
em nenhum dos dois lados isoladamente, e nenhuma guarda de servidor o pegaria.

`GET /videos/tier-availability` responde pela MESMA cadeia que a criação usa
para RECUSAR (`vendorRequiredByTier` + `getCredentialForVendor`). A tela
parou de reimplementar a regra e passou a perguntá-la. Nunca devolve o nome
do fornecedor.

**VERIFICADO NA TELA**, com um tenant criado do zero pelo cadastro real
(`passada-zerada`) e sessão real no navegador:
`{"simples":true,"normal":true,"premium":true}`.

### A passada pela tela, e o limite dela

Percorridos cadastro → verificação de e-mail → login → painel → passo 1.
Nada quebrou: conta criada, e-mail confirmado, 500 créditos, avatar listado
com os selos certos, "Avançar" travado com o motivo escrito.

⚠️ **A automação de navegador NÃO consegue clicar nos controles do React
deste projeto** — cliques não disparam `onClick`/submit. MEDIDO: o login
falhou pelo botão e ENTROU por `form.requestSubmit()` com os mesmos valores,
e o backend responde 200 para as mesmas credenciais. **Não é defeito do
produto e não deve ser lido como tal.** Os passos 2 a 4 não foram
percorridos por clique; o que importava neles foi medido pela rota.

**Um falso positivo descartado:** o cartão do avatar mostrou "voz ainda não
configurada" ao lado do selo "Voz clonada". O texto depende de
`reference_video_url`, que o INSERT manual desta passada não preencheu — com
o campo completo passou a dizer "3/3 fotos · voz pronta". **Não é defeito.**

### Conta de teste deixada pronta

`passada-zerada@exemplo.invalido` / tenant `passada-zerada`, ativa, com
avatar pronto e 500 créditos — para clicar sem precisar cadastrar.

### Três erros meus nesta parte, todos pegos pelas provas

1. **Edição por script converteu 7 arquivos de LF para CRLF.** O índice fica
   LF, mas o GATE lê o working copy pelo bind mount, e duas guardas de
   recorte multi-linha quebraram com sintoma que parecia defeito de lógica.
   Registrado na FILA do BACKLOG.
2. **O mutante do W4 colidia com `checkTierAvailabilityPolicy`** (que AVALIA
   o predicado da tela) e saiu AMBÍGUO. Passou a mirar a FONTE — o endpoint.
3. **A guarda casava o COMENTÁRIO em vez da chamada:** o mutante trocou o
   endpoint por `/credentials` e ela seguiu verde (INERTE). Agora casa a
   chamada inteira. Mesmo defeito histórico da `checkVendorLogPolicy`.
