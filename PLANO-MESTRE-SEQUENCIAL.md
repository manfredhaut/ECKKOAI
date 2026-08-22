# PLANO-MESTRE-SEQUENCIAL — leia isto em toda troca de conta

Ponto de entrada de sessão, escrito para o assistente. Regenerado só em troca
de conta — não em toda mudança de código. Quando este arquivo e o
[ESTADO.md](ESTADO.md) discordarem sobre o estado ATUAL, confira `git log`
primeiro: os dois podem envelhecer, e o `git log` nunca mente.

**HEAD nesta escrita: `4c5b66c`, árvore limpa.** `PROVIDER_MODE=fixture`
(desarmado, `PROVIDER_LIVE_CONFIRM` len=0) — confirmado no processo E no
`docker compose config` no início desta sessão.

```
4c5b66c  checkAvatarMultiVendorPolicy: G-4 saía INERTE — a checagem casava com o comentário, não com o código
5192168  Fase B: admin "Integrações por tenant" vira multi-seleção para Avatar
20a4240  Migration 060: multi-vendor de avatar por tenant (Fase A)
a03d6ab  GenerateStep: cartão "Simples" desabilitado para tenants sem credencial HeyGen
af6848c  ESTADO.md: fecho da sessão de 21/08 — Fase 1 por HTTP real, Fase 2/Modo B, 296/296
2b27d3a  PLANO-MESTRE-SEQUENCIAL.md: novo — fecho de sessão (Fase 1 refeita por HTTP real, Fase 2/Modo B, HEAD)
fc6f7d6  checkFalVideoApprovalPolicy: 2 mutantes disparavam TS2367 (gotcha do "if false") em vez de reprovar
```

⚠️ **Arnês: NÃO RODADA UMA PASSADA COMPLETA desde `fc6f7d6` (296/296).** Mudança
de processo desta sessão, a pedido do operador: a passada completa não é
mais lançada em background depois de cada commit intermediário dentro de um
bloco de trabalho (abortou 3 vezes por esse motivo — ver gotcha novo
abaixo). Só roda UMA vez, no fim do bloco inteiro (depois da Fase D fechar,
ou quando o operador pedir explicitamente). Os commits desde `fc6f7d6` (Fase
1 refeita por HTTP, correção do cartão Simples, Fase A, Fase B) foram
fechados com **passada FILTRADA** (`--guard`) provando só os mutantes novos
de cada rodada — 5+3+6 mutantes, todos `ok`, mas isso NÃO substitui a
completa. Registro de mutantes hoje: **305 declarados** (296 → +3 do cartão
Simples desabilitado → +6 do multi-vendor de avatar; +1 líquido porque um
mutante antigo foi reancorado, não somado, e a contagem exata está nos
commits individuais).

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

## 2.5 · Decisão de produto (22/08) — multi-vendor de avatar por tenant

**Contexto que abriu esta linha de trabalho**: a lacuna de UX do cartão
"Simples" (§2, correção `a03d6ab`) revelou a causa raiz: `routes/videos.ts`
decide o VENDOR (heygen/fal) pela credencial FIXA do tenant, antes de olhar
`tier_video` — então "Simples" só faz diferença num tenant vendor=heygen.
Decisão: um tenant vai poder ter MAIS DE UM vendor de avatar configurado ao
mesmo tempo (heygen + fal, por exemplo), e `tier_video` passa a decidir QUAL
usar, por vídeo. Plano em 4 fases, sequenciais, cada uma aprovada
explicitamente antes da próxima.

### Fase A — modelo de dados (fechada, aprovada, commit `20a4240`)

`api_credentials` tinha `UNIQUE (tenant_id, provider)` — uma linha por
categoria, sem exceção. **Migration 060**, aplicada só no banco de dev:

- `is_default boolean NOT NULL DEFAULT true` — backfill automático via o
  próprio `ADD COLUMN` (sem `UPDATE` separado). É a credencial que os 11
  call sites NÃO-tier-aware de `getCredential` continuam vendo depois da
  Fase C existir.
- `api_credentials_tenant_provider_key` — voice/script, `UNIQUE (tenant_id,
  provider) WHERE provider <> 'avatar'`, a MESMA garantia de sempre, agora
  como índice parcial.
- `api_credentials_tenant_avatar_vendor_key` — avatar, `UNIQUE (tenant_id,
  provider, vendor) NULLS NOT DISTINCT WHERE provider = 'avatar'`. É isto
  que permite heygen E fal ao mesmo tempo. `NULLS NOT DISTINCT` preserva a
  garantia atual das linhas legadas sem vendor (23 de 34 no dia da medição).
- `api_credentials_tenant_avatar_default_key` — `UNIQUE (tenant_id,
  provider) WHERE provider = 'avatar' AND is_default`. No máximo UMA linha
  default por tenant — proposto pelo assistente ALÉM do que foi pedido
  ("prefiro erro alto e imediato a não-determinismo silencioso em
  produção", palavras do operador ao aprovar).

**Verificado**: SELECT fresco (102 linhas antes/depois, hash idêntico de
id/provider/vendor/connected — nada perdido; as 102 ficaram `is_default:
true`) + os 3 índices testados AO VIVO numa transação revertida (vendor
duplicado rejeitado, segundo default rejeitado, voice/script duplicado
continua rejeitado como sempre). **Sem mutante declarado** — mutar o texto
da migration não afeta o schema já aplicado (o gate não roda migrations de
novo); seria estruturalmente INERTE. Cobertura por mutante vem com o código
de aplicação (Fases B/C).

**Pendência registrada, não-urgente** (a pedido do operador): um teste de
integração comum (não mutante) cobrindo os mesmos 5 cenários contra um
banco de teste, até existir código de aplicação que os exercite de verdade.

### Fase B — admin multi-seleção (fechada, aprovada, commits `5192168` +
`4c5b66c`)

A tela "Integrações por tenant" (`AdminApisPanel.tsx` + o editor irmão em
`AdminPanelPage.tsx`) tinha um card por provider, um vendor por card.
Avatar passa a ser uma LISTA.

- **Backend** (`adminPanel.ts`): o `PUT` de credenciais bifurca por
  provider. Avatar mira `ON CONFLICT (tenant_id, provider, vendor) WHERE
  provider = 'avatar'`; voice/script miram `ON CONFLICT (tenant_id,
  provider) WHERE provider <> 'avatar'`. A primeira credencial de avatar do
  tenant (nenhuma linha ainda, de vendor nenhum) nasce `is_default: true`;
  toda seguinte nasce `false` e nunca desloca a que já é default — sem essa
  checagem, adicionar um segundo vendor colidiria com
  `api_credentials_tenant_avatar_default_key` e devolveria 500 no clique.
  `/credentials/:provider/test` aceita `?vendor=` para escolher qual linha
  testar (sem isso, com 2+ linhas de avatar, "Testar" pegaria uma
  arbitrária, `rows[0]` sem `ORDER BY`).
- **Frontend**: `AvatarCredentialsCard.tsx` (novo, COMPARTILHADO entre os
  dois editores — duplicar a lógica de lista divergiria na primeira mudança
  futura) — uma linha por vendor já configurado + bloco para adicionar um
  vendor novo. `voice`/`script` continuam exatamente como estavam nos dois
  arquivos. `updateCredential` (a função de merge de estado local, nos dois
  arquivos) passa a casar por `(provider, vendor)` só para avatar — casar só
  por `provider` faria salvar o fal SUBSTITUIR a entrada do heygen na tela.

**Verificado por HTTP real** (sessão de ADMIN montada na tabela `sessions`,
nunca senha): tenant descartável → `GET` vazio → `PUT` heygen
(`is_default:true`) → `PUT` fal (`is_default:false`) → resalvar heygen
(`is_default` continua `true`) → `GET` final com as DUAS linhas → `POST
.../test?vendor=heygen` (200 ok) e `?vendor=fal` (400 `probe_unavailable`,
como o catálogo já previa — fal não tem sonda).

**6 mutantes novos** em `checkAvatarMultiVendorPolicy.ts` (4 backend FORMA,
2 frontend LÓGICA AVALIADA), todos provados reprovando por passada
filtrada. Um deles (G-4) saiu INERTE na primeira tentativa e foi corrigido
antes de ser declarado provado — ver gotcha novo em §4.

### Fase C — backend: tier_video decide o vendor (NÃO INICIADA)

**Aguardando aprovação explícita do operador antes de tocar em qualquer
código desta fase.** Os 3 call sites já identificados em sessões
anteriores, em `routes/videos.ts`:

- criação (~linha 1003 nas notas do operador — conferir número atual antes
  de editar, linhas deste projeto já mudaram de lugar mais de uma vez)
- aprovação (~1596–1598)
- `rearmVideoPolling` (~394)

Hoje os três pegam "a credencial de avatar do tenant" (`getCredential`,
sem saber de tier). Precisam passar a pegar "a credencial de avatar do
tenant que corresponde ao vendor exigido pelo `tier_video` escolhido" — o
que exige uma função de leitura NOVA (`getCredential` genérico continua
servindo os 11 call sites não-tier-aware via `is_default`, mas os 3 desta
lista precisam de uma busca por vendor explícito). Regras já combinadas
com o operador para esta fase:

- Se o tenant não tiver a credencial necessária para o tier escolhido:
  MESMO padrão de fallback seguro do commit `a03d6ab` — nunca cair
  silenciosamente em outro vendor sem avisar.
- Reavaliar o cartão "Simples" desabilitado (`GenerateStep.tsx`, commit
  `a03d6ab`): deve voltar a ficar HABILITADO quando o tenant tiver AMBAS as
  credenciais (fal + heygen), continuar desabilitado se só tiver uma.
- Guardas novas provadas reprovando com mutante declarado, gate verde,
  commit separado — mesma disciplina de sempre.

### Fase D — validar HeyGen ponta a ponta pela primeira vez (NÃO INICIADA)

Bloqueada até Fase C ser aprovada. `PROVIDER_MODE=fixture`, custo zero.
Gerar um vídeo tier Simples de verdade, roteando para HeyGen (nunca
exercitado nesta sessão nem em nenhuma anterior visível neste histórico),
confirmar pelo diário/log (não pelo código): motor chamado, teto de gasto
equivalente ao `autorizarGasto` (existe? qual valor?), se o fluxo de
aprovação do HeyGen é estruturalmente igual ao do Modo B da fal ou
diferente — SE for diferente, não tentar unificar nesta fase, só relatar e
parar.

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
- **O backend roda com `tsx src/index.ts` (o script `serve`), SEM
  `--watch`** — só o script `dev` (`tsx watch`) recarrega sozinho, e é o
  `serve` que o `docker-entrypoint.sh` usa. Editar uma rota e testar por
  HTTP contra o processo vivo continua batendo no código ANTIGO até um
  `docker compose restart backend` manual. MEDIDO nesta sessão como bug
  real, não hipotético: o primeiro ensaio HTTP da Fase B devolveu 500
  (`ON CONFLICT` sem `WHERE`, código de ANTES da migration 060) porque o
  processo não tinha sido reiniciado depois da edição — a query em si
  estava certa o tempo todo. Isto NÃO afeta o `npm run check` (o gate): ele
  roda `tsx` fresco a cada invocação, lê o arquivo do zero, sempre atual.
- **Uma guarda por `string.includes(...)` pode casar com um COMENTÁRIO, não
  com o código** — e sai INERTE (gate verde com o defeito aplicado) sem
  avisar. MEDIDO nesta sessão: `checkAvatarMultiVendorPolicy.ts` procurava
  `"req.query.vendor"` no recorte da rota de teste, e o comentário
  explicativo LOGO ACIMA da query também continha esse texto — mutar o
  CÓDIGO real (remover o uso funcional) não mudava o veredito da guarda,
  porque o comentário sozinho já bastava para o `includes()` achar
  verdadeiro. Corrigido trocando a âncora para um trecho que só existe em
  código executável (o array de parâmetros da query, nunca escrito em
  prosa). Ao escrever uma guarda por FORMA (não por lógica avaliada),
  prefira âncoras que não têm como aparecer num comentário explicativo
  sobre a mesma coisa — e teste o mutante à mão antes de declarar provado
  (a regra de sempre, reforçada por este caso específico).
- **Verificação visual pelo navegador ficou bloqueada nesta sessão inteira**
  (Fase B e a correção do cartão Simples): a sessão (de tenant OU de admin)
  autentica com sucesso quando testada direto contra o backend
  (`fetch`/`curl` interno, sem passar pelo navegador — 200, identidade
  correta), mas o MESMO cookie falha (401) em toda tentativa pela
  automação de navegador desta sessão — fetch com `credentials:'include'`,
  `SameSite=Lax` explícito, e até navegação completa de página. Traefik foi
  descartado como causa (proxy transparente, sem middleware de cookie,
  CORS com `credentials:true` confirmado). NÃO investigado além disso —
  é provavelmente uma política de cookie do próprio ambiente de navegador
  automatizado, não um bug do app, mas isso é DEDUZIDO, não confirmado.
  Verificação de UI nesta sessão ficou inteiramente por HTTP direto
  (sessão montada no banco + `fetch` contra o backend, sem navegador),
  nunca por captura de tela real.
