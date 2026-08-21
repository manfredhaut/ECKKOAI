# PLANO-MESTRE-SEQUENCIAL — leia isto em toda troca de conta

Ponto de entrada de sessão, escrito para o assistente. Regenerado só em troca
de conta — não em toda mudança de código. Quando este arquivo e o
[ESTADO.md](ESTADO.md) discordarem sobre o estado ATUAL, confira `git log`
primeiro: os dois podem envelhecer, e o `git log` nunca mente.

**HEAD nesta escrita: `fc6f7d6`, árvore limpa.** `PROVIDER_MODE=fixture`
(desarmado, `PROVIDER_LIVE_CONFIRM` len=0) — confirmado no processo E no
`docker compose config` antes de qualquer coisa nesta sessão.

```
fc6f7d6  checkFalVideoApprovalPolicy: 2 mutantes disparavam TS2367 (gotcha do "if false") em vez de reprovar
5efeaa1  Fase 2 (Modo B): parada em animar, awaiting_approval_video, /approve-video + /redo-video
b8164b4  CLAUDE.md: fecho do BLOCO A — passada completa 292/292, zero INERTE/AMBÍGUO/ERRO
a1c8d46  checkFalTierPolicy: 3 expects eram paráfrase, não transcrição — corrigidos
c066168  Bloco A: sistema de níveis de vídeo — tela de tier, tier_video, roteamento por tier, teto próprio do Premium
```

Arnês: **296 mutantes declarados, passada COMPLETA 296/296, zero
INERTE/AMBÍGUO/ERRO**, rodada depois do commit `fc6f7d6`. Log em
`_arnes-logs/mutants-fase2-completa-2026-08-21-{a,b}.log`, md5
`99dfb1959afd61966e91e20cc344e28a` nas duas cópias — idênticas. Sem carimbo
de PASSADA FILTRADA: é a completa de verdade, sem filtro.

---

## 1 · Fase 1 — ensaio dos 3 tiers, resultado tier a tier

**MEDIDO duas vezes, com métodos diferentes** (a primeira vez não contava
como "ponta a ponta" e foi refeita a pedido do operador — ver §3):

1. Script chamando as funções de serviço diretamente (`generateVideo`,
   `aprovarEAnimar`, `runFalPipelineDaImagem`) — bypass de HTTP/sessão.
   Resultado bateu, mas não prova o caminho real.
2. **Refeito por HTTP DE VERDADE** contra o processo rodando
   (`POST /videos`, `POST /videos/:id/approve`,
   `POST /videos/:id/approve-video`), autenticado por uma sessão montada
   diretamente na tabela `sessions` e assinada com `@fastify/cookie` +
   `SESSION_SECRET` do processo — **nunca com senha**, nunca simulando
   login (essa é uma restrição do assistente, não uma escolha de
   conveniência: entrar com senha para autenticar é ação vedada, mesmo com
   autorização explícita do operador em chat). Exercita o caminho completo:
   `evaluateGenerationReadiness`, o porteiro de vendor, a tradução da
   Interpretação, a chave de idempotência — tudo que o bypass de HTTP pulava.

| tier | resposta do `POST /videos` | SELECT fresco pós-fato (banco) | endpoint de `animar` (diário real) | status final |
|---|---|---|---|---|
| simples | `tier_video: "simples"` | `tier_video: "simples"` | `wan/v2.6/image-to-video/flash` | `ready` |
| normal | `tier_video: "normal"` | `tier_video: "normal"` | `wan/v2.6/image-to-video/flash` | `ready` |
| premium | `tier_video: "premium"` | `tier_video: "premium"` | `bytedance/seedance-2.5/reference-to-video` | `ready` |

Os 3 vídeos passaram pelo fluxo inteiro do produto, incluindo a Fase 2:
`POST /videos` (201) → `POST /videos/:id/approve` (200, parou em
`awaiting_approval_video` — provando o `pararApos: "animar"` funcionando
pela ROTA real, não só pelo pipeline isolado) → `POST /videos/:id/approve-video`
(200, `ready`).

**Teto do Premium, PROVADO isolado do global**: com
`PIPELINE_TETO_USD_PREMIUM` temporariamente baixado para US$ 1,00 (código
revertido antes do commit, `git diff` conferido vazio, imagem reconstruída
de novo), a etapa `animar` do tier Premium foi bloqueada citando
literalmente **"acima do teto de US$ 1.00"** — não US$ 2,00 (o global),
que Simples/Normal continuaram usando intocados. Prova inequívoca de que o
código lê `PIPELINE_TETO_USD_PREMIUM`, não o teto global.

**Custo real da Fase 1 inteira: US$ 0,00.** Tudo em `PROVIDER_MODE=fixture`,
saldo real de vídeo do tenant `dev-c77a5b8a` intocado (19 antes e depois);
saldo de ENSAIO (`video_rehearsal`) debitado só pelas gerações legítimas
(487 ao final — inclui a correção de 3 unidades perdidas por um bug do
primeiro script HTTP, que checava `status !== 200` quando o servidor
responde `201 Created`; corrigido e as 3 unidades devolvidas ao saldo de
ensaio antes de fechar a rodada).

**Achado colateral, corrigido no caminho**: a imagem Docker do backend
estava desatualizada desde o commit `7cf2b8d` (21/08, adicionou
`fixture-composicao.png`) — a imagem nunca tinha sido reconstruída depois
disso, e o ensaio quebrava em "fixture não encontrada em /app/fixtures".
Rebuild feito (`docker compose build backend`), sem tocar código de produto.

---

## 2 · Fase 2 (Modo B) — o que foi implementado

**Reusa o `pararApos` já existente no `falPipeline.ts`** (antes só
`"compor"` era usado por um caminho de produto) com o valor `"animar"`: a
corrida agora pode parar logo depois do vídeo MUDO (animado, sem voz),
antes de narrar + sincronizar — as duas etapas mais caras.

| item | onde | o que faz |
|---|---|---|
| `awaiting_approval_video` | migration 059, `types.ts` | Novo status, distinto de `awaiting_approval` (que continua exclusivo da imagem). |
| `fal_muted_video_url` | migration 059 | Coluna nova — o vídeo mudo, aprovado ou à espera. Sobrescrita a cada "Refazer", nunca acumulada. |
| Parada em `animar` | `falPipeline.ts`, `animarNarrarSincronizar` | `if (input.pararApos === "animar")` — mesmo padrão do `pararApos: "compor"` já existente, um passo adiante. |
| `narrarSincronizar` (extraída) | `falPipeline.ts` | As etapas 3–5 isoladas, para ter DOIS chamadores: a corrida inteira (que passa por `animar` na mesma chamada) e a retomada pós-aprovação do vídeo mudo. |
| `runFalPipelineDoVideoMudo` (novo export) | `falPipeline.ts` | Retoma DIRETO de um vídeo mudo conhecido para narrar+sincronizar — `gastoAcumuladoUsd` começa em ZERO (mesma razão de `runFalPipelineDaImagem`: `animar` já foi pago numa corrida anterior). Não re-chama `animar`. |
| `/approve` (modificada) | `routes/videos.ts` | Agora passa `pararApos: "animar"` — para no vídeo mudo, não completa sozinha até `ready`. |
| `/approve-video` (novo endpoint) | `routes/videos.ts` | "Aprovar" do vídeo mudo — chama `runFalPipelineDoVideoMudo`, segue até `ready`. |
| `/redo-video` (novo endpoint) | `routes/videos.ts` | "Refazer" do vídeo mudo — chama `runFalPipelineDaImagem` com `pararApos: "animar"` forçado (reusa o mecanismo, não duplica lógica), reroda só `animar`, mesmo padrão de `PARAR_APOS_RECOMPOR`. |
| `recovery.ts` | `services/video/recovery.ts` | `awaiting_approval_video` entra em `STATUS_VARRIDOS`, tratado como o `awaiting_approval` de imagem: ignorado se recente, expira SEM estorno se velho (24 h), com mensagem PRÓPRIA (`MENSAGEM_APROVACAO_VIDEO_EXPIRADA`, distinta da de imagem — testado por mutante dedicado). |
| `/jobs`, `/notifications/summary` | `routes/jobs.ts`, `routes/notifications.ts` | Passaram a incluir `awaiting_approval_video` nos estados "pendentes de ação". |

**Guardas**: 4 mutantes novos em `checkFalVideoApprovalPolicy.ts` + 1
reancorado em `checkFalApprovalPolicy.ts` (a linha que ele media ganhou um
segundo braço na condição). Todos os 5 provados reprovando de verdade por
passada filtrada pós-commit, árvore conferida limpa em cada reversão. Dois
deles inicialmente disparavam erro de TypeScript (TS2367, "no overlap")
em vez de reprovar pela guarda — mesma família do gotcha `if (false && …)`
já registrado no CLAUDE.md, nunca visto nesta forma específica (comparação
dupla dentro do narrowing do `if`) antes desta rodada; corrigido com
`String(...)` nos comparadores, sem mudar comportamento em runtime.

**Ensaiado ponta a ponta duas vezes** — primeiro por chamada direta às
funções de serviço (criar → aprovar imagem, para em `animar` → refazer o
vídeo mudo → aprovar vídeo, retoma sem reanimar — confirmado pelo diário
real, `run_id` da aprovação final sem etapa `animar` nenhuma nele), depois
pela Fase 1 refeita por HTTP real (ver §1), que exercitou `/approve` e
`/approve-video` pela ROTA, não pelo pipeline isolado.

### ⚠️ Consequência aceita, registrada aqui para não se perder

**O frontend atual (`frontend/src/types.ts`, `GenerateStep.tsx`) não
conhece `awaiting_approval_video`.** O botão "Aprovar" só aparece quando
`video.status === "awaiting_approval"` (a string exata). Com o backend
como está, **qualquer vídeo fal aprovado hoje pela tela atual fica preso em
`awaiting_approval_video` sem nenhum botão para avançar**, até a UI do
Modo B existir. Isto foi mostrado ao operador nesta sessão e ele escolheu
explicitamente seguir assim mesmo — é a consequência esperada de "não
construir UI do Modo B ainda", não uma regressão descoberta depois do
fato. Registrado aqui para o caso de a próxima sessão (ou o próximo
operador) esbarrar nisso sem contexto.

---

## 3 · O que AINDA falta (não desta rodada, por instrução explícita)

- **UI do Modo B.** Tela do vídeo mudo (preview + Aprovar + Refazer),
  espelhando a tela de aprovação da imagem que já existe. Sem ela, o
  frontend atual trava no `awaiting_approval_video` (ver aviso acima).
  Também precisa: `frontend/src/types.ts` ganhar o novo `VideoStatus`,
  `PROGRESS_BY_STATUS` (`GenerateStep.tsx`) ganhar uma entrada pra ele, e o
  polling/lógica de "terminal para o polling" reconhecer o novo estado do
  mesmo jeito que reconhece `awaiting_approval` hoje.
- **Teste PAGO.** Nenhuma chamada real à fal.ai nesta rodada inteira — Fase
  1 e Fase 2 foram 100% `PROVIDER_MODE=fixture`, custo US$ 0,00. O primeiro
  clique pago no fluxo de duas aprovações (`/approve` parando em `animar`,
  depois `/approve-video` completando) segue **NÃO VERIFICADO contra o
  fornecedor real** — só contra o simulador de fixture. Bloqueado por
  decisão do operador, não por falta de código.
- **Reconciliação de `provider_job_id` entre as duas aprovações** —
  funciona (verificado pelo ensaio), mas o campo é SOBRESCRITO a cada
  transição (primeiro guarda o `request_id` de `compor`, depois o de
  `animar`) — não há histórico dos três `request_id` (compor/animar/sync)
  na própria linha de `videos`, só no diário (`fal_pipeline_steps`). Aceito
  por design, mesmo padrão que já existia antes da Fase 2; não é dívida
  nova.

## 4 · Gotchas desta rodada, para quem for repetir

- **Login com senha é ação vedada ao assistente, sem exceção de
  contexto** — nem em ambiente de teste local, nem com autorização
  explícita do operador em chat. Para exercitar rotas autenticadas sem
  UI, monte uma sessão diretamente na tabela `sessions` e assine o
  cookie com `@fastify/cookie` + `config.sessionSecret` (o mesmo
  mecanismo que `@fastify/session` já usa) — nunca leia, digite nem
  verifique senha nenhuma.
- **`POST /videos` responde `201`, não `200`.** Um script de ensaio que
  checa `status !== 200` marca toda criação como falha e nunca chega a
  aprovar nada — sintoma enganoso (parece que o endpoint rejeitou, mas o
  corpo da resposta mostra a linha criada com sucesso).
- **Path do Git Bash (Windows) mangla argumentos que começam com `/`** —
  `--guard "/approve passa pararApos"` virou
  `--guard "C:/Program Files/Git/approve passa pararApos"` e o filtro não
  casou nada. Use `MSYS_NO_PATHCONV=1` na frente do comando.
- **`npm run check:mutants` roda no HOST, não dentro do container** — é
  `node tools/run-mutants.mjs`, que por sua vez invoca `docker compose
  exec` por mutante. Rodar via `docker compose exec backend npm run
  check:mutants` falha com "Missing script" (esse script só existe no
  `package.json` da raiz).
- **Nunca edite o repositório enquanto uma passada completa roda em
  background** — mesmo um arquivo novo e não relacionado (`?? arquivo.ts`)
  faz `git status` acusar sujeira e a passada aborta no mutante em
  andamento. Aconteceu nesta sessão (abortou em 53/296); a segunda
  tentativa, sem tocar no repo, fechou 296/296.
- **Imagem Docker do backend não se atualiza sozinha** quando um arquivo
  novo (fixture, asset) é adicionado fora do bind mount — precisa de
  `docker compose build backend` + `up -d backend`. `fixtures/` só entra
  via `COPY` no `Dockerfile`, não é montado.
