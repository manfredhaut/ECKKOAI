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

Atualizado em **18/08/2026** (BLOCO N+3 — 4 pontos de `logEvent` sem log em
`POST /videos`, arnês completo 281/281, e três investigações de produção sem
código alterado: ENOENT de foto do Mário, prompt vazio na composição fal,
`invalid_uid` da ElevenLabs), HEAD `fd1ba07`. **Esta linha NÃO está
commitada** — ver nota no fim do BLOCO N+3, §11, sobre o que falta decidir
antes de fechar a sessão.

⚠️ **GAP CONHECIDO, NÃO RECONSTRUÍDO NESTA RODADA:** entre o HEAD anterior
registrado aqui (`22f9db8`, 14/08) e o início desta sessão (`b314c5d`) o
repositório recebeu uma dúzia de commits de blocos NÃO cobertos por este
arquivo — VITE-PROD-3 (Dockerfile de 3 estágios do frontend, BASE_DOMAIN
obrigatória em build), domínio único (sem redirect de subdomínio), perfil
ampliado com endereço/WhatsApp (migration 057), verificação de e-mail por
clique manual + domínio `mail.eckkoai.com`, e a guarda G-D (motion prompt
vazio recusado antes de `abrirCorrida` em `/approve`, com estorno de crédito
quando a fal rejeita antes de aceitar o job). Nenhum desses blocos foi lido a
fundo nesta sessão — o escopo pedido era só o BLOCO N+1 abaixo. `git log
--oneline` entre os dois HEADs é a fonte de verdade até alguém escrever essa
história aqui.

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

## 1 · Onde o repositório está

*(o último commit desta lista é sempre o penúltimo do repositório: o próprio
commit que atualiza este arquivo não caberia dentro dele. `git log -3
--oneline` fecha a diferença.)*

```
bfd5364  ESTADO.md: dívida de baixo risco — VENDOR_FORMAT_SUPPORT.fal está desatualizado desde o B2
a8020af  ESTADO.md: fecho do B5c — 243/243 na completa, dois gotchas novos, o gap de UI declarado
cf8d869  Guarda B5c: a passada --affected pegou uma INERTE — presença virou CONTAGEM
dfd5657  BLOCO B5c: cenário e traje ganham campo no fluxo de avatar EXISTENTE
5ccd090  lipsync: a variante passa a ser NOSSA escolha — `model` era o único default que trocava de preço
fc784fb  Expect da G-1: TRANSCRITO da mensagem nova, e o rótulo é `cenario` sem acento
16a164c  G-1 nasceu INERTE: o "ou" da invariante era satisfeito pelo texto quando a imagem sumia
97c30e8  Mutante da G-1: o corpo precisa ir junto — `if (false as boolean)` matava o narrowing
c8dd236  BLOCO B5 · P2: duas guardas para a cena, com os mutantes AINDA NÃO provados
1f4b0d4  BLOCO B5 · P1: a direção deixa de morrer na ponte, e o sync_mode sai do desconhecido
ff9628e  BLOCO B3 · P2: três guardas para a aprovação, com os mutantes AINDA NÃO provados
```

⚠️ **TERCEIRA vez que esta lista divergiu do HEAD** — corrigida em 14/08 no
EXPOSICAO-1, quando estava **nove commits atrasada** (topo em `54bb282`, HEAD
em `bfd5364`). O registro das três ocorrências e o padrão que as une está em
[docs-internal/08-ocorrencias.md](docs-internal/08-ocorrencias.md). Quem lê
esta seção confiando nela e não confere `git log` recebe um mapa de outro
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
| **PRÓXIMO · aprovar `de2a366e` de verdade (primeiro clique pago no Wan) — exige autorização explícita de gasto** | bloqueado por decisão do operador, não por NÃO VERIFICADO |
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
