# RELATÓRIO DE CORREÇÃO — eckko.ai (TWINAI)

**Data:** 2026-08-08 · **HEAD antes:** `c4d827e` · árvore com as alterações desta rodada, **não commitada**
**Escopo:** os seis itens de 2.1 a 2.6, e nada além.
**Não executado:** nenhuma migração, nenhum `docker compose up/down/build/restart/start/stop`, nenhuma chamada de rede a fornecedor, nenhum serviço reiniciado. `.env` e `.env.example` não foram lidos.

Base: [RELATORIO-ESTADO-ECKKO-20260808.md](RELATORIO-ESTADO-ECKKO-20260808.md), [RELATORIO-APROFUNDAMENTO-ECKKO-20260808.md](RELATORIO-APROFUNDAMENTO-ECKKO-20260808.md), [RELATORIO-EXPOSICAO-20260808.md](RELATORIO-EXPOSICAO-20260808.md).

---

## 1 · ARQUIVOS ALTERADOS

### Criados (7)

| Arquivo | O que é | Linhas |
|---|---|---:|
| [backend/src/services/providers/vendorTimeout.ts](backend/src/services/providers/vendorTimeout.ts) | Teto de tempo de toda chamada a fornecedor: dois tetos configuráveis, o classificador de erro de timeout, e a frase de procedência. Nenhum `fetch` aqui dentro — a guarda de egresso reprova arquivo com saída de rede que não consulte o modo, e este módulo só fabrica o sinal. | 110 |
| [backend/src/services/video/videoFailure.ts](backend/src/services/video/videoFailure.ts) | Os **10 motivos enumerados**, a classificação de gasto (`nao_saiu`/`saiu`/`indeterminado`) e `decidirEstorno()`. | 140 |
| [backend/src/services/video/recovery.ts](backend/src/services/video/recovery.ts) | A varredura única de boot: recolhe presos, re-arma os recuperáveis, encerra órfãos e antigos, estorna pela mesma regra. | 205 |
| [backend/src/scripts/checkVideoRecoveryPolicy.ts](backend/src/scripts/checkVideoRecoveryPolicy.ts) | A guarda nova, com os **16 mutantes** de G1 a G6. | 430 |
| [backend/src/db/migrations/047_video_job_reconciliation.sql](backend/src/db/migrations/047_video_job_reconciliation.sql) | Aditiva: chave da tentativa, instante da chamada, job id em `provider_usage`, 4 índices. **NÃO EXECUTADA.** | 105 |
| [backend/src/db/migrations/048_video_failure_reason.sql](backend/src/db/migrations/048_video_failure_reason.sql) | Aditiva: `videos.failure_reason` + `CHECK` fechado + índice. **NÃO EXECUTADA.** | 75 |
| [RELATORIO-EXPOSICAO-20260808.md](RELATORIO-EXPOSICAO-20260808.md) | E1, o passo 1. | — |

### Modificados (11)

```
 backend/src/index.ts                               |  27 ++
 backend/src/routes/videos.ts                       | 372 ++++++++++++++++-----
 backend/src/scripts/checkPolicy.ts                 |  11 +
 backend/src/scripts/collectMutants.ts              |   2 +
 backend/src/services/billing/usageTracking.ts      |  20 +-
 backend/src/services/downloadProxy.ts              |  13 +-
 backend/src/services/providers/avatarProvider.ts   |  36 +-
 backend/src/services/providers/platformKeyProbe.ts |  10 +-
 backend/src/services/providers/providerRegistry.ts |   4 +
 backend/src/services/providers/voiceProvider.ts    |   9 +
 docker-compose.yml                                 |  20 ++
 11 files changed, 428 insertions(+), 96 deletions(-)
```

**[routes/videos.ts](backend/src/routes/videos.ts) — o núcleo.**
- Duas funções novas: `decidirEEstornar()` ([:74](backend/src/routes/videos.ts:74)) isola a decisão de dinheiro; `encerrarComMotivo()` ([:106](backend/src/routes/videos.ts:106)) faz estado + motivo + consumo + estorno num lugar só, com `AND status = ANY(['queued','processing'])` — a proteção contra sobrescrever um `ready` que só o caminho de timeout tinha.
- Os **quatro caminhos do polling** passaram a chamar `encerrarComMotivo` ([:175](backend/src/routes/videos.ts:175), [:281](backend/src/routes/videos.ts:281), [:302](backend/src/routes/videos.ts:302), [:320](backend/src/routes/videos.ts:320)) — antes, nenhum deles decidia estorno.
- **Gravação antecipada** ([:960-1002](backend/src/routes/videos.ts:960)): `provider_idempotency_key` e `provider_request_at` gravados **antes** de `generateVideo()`.
- `rearmVideoPolling()` exportado ([:339](backend/src/routes/videos.ts:339)) — o **mesmo** `pollJob`, para não existir um segundo mecanismo de acompanhamento.
- `catch` da criação: `motivoDaCriacao` distingue `vendor_timeout` / `live_budget_exhausted` / `vendor_rejected`; o `refundCredit()` incondicional saiu e virou `decidirEEstornar()`.
- **Preservado ao pé da letra:** `return reply.code(vendorErrorStatus(failure)).send(errored[0]);`, `if (!readiness.ready) {` e `const vendor = video.provider_vendor ?? "heygen";` — são `find` de mutantes existentes e a regex de `checkVendorErrorPathPolicy`.

**[index.ts](backend/src/index.ts):** `recoverInFlightVideos(rearmVideoPolling)` **antes** do `listen` ([:56](backend/src/index.ts:56)), com linha em `audit_log` quando encontra algo.

**[usageTracking.ts](backend/src/services/billing/usageTracking.ts):** campo `providerJobId` nas duas entradas e na coluna nova do `INSERT`.

**Cinco arquivos de fornecedor:** só o acréscimo de `signal:`. **29 pontos de saída, 29 com sinal** — avatarProvider 14, voiceProvider 5, platformKeyProbe 4, providerRegistry 3, downloadProxy 3 (estes com o teto de download).

**[docker-compose.yml](docker-compose.yml):** três variáveis novas. **Não é escopo esticado:** a guarda `ambiente: variável lida chega ao container` reprova variável lida pelo código e ausente do compose, e a forma `_ENV = "NOME"` que usei é justamente uma das quatro que ela detecta ([checkEnvironmentPolicy.ts:470-475](backend/src/scripts/checkEnvironmentPolicy.ts:470)). Sem estas linhas o gate nasceria vermelho.

---

## 2 · CONTAGEM DE MUTANTES

| | Antes | Depois | Δ |
|---|---:|---:|---:|
| Mutantes declarados | **159** | **175** | **+16** |
| Arquivos de guarda | 29 | 30 | +1 |

Medido por `grep -c '    guard:'` sobre `backend/src/scripts/check*Policy.ts`. Os 159 de antes batem com o registrado no CLAUDE.md.

Os 16 novos: 6 espertos, 4 óbvios, 4 contrapontos `expectGreen`, 2 dos quais só com `env`.

| # | Guarda | Mutante | Tipo | Alvo |
|---|---|---|---|---|
| G1 | a chave da tentativa é gravada antes da chamada | grava a chave depois da chamada, não antes | esperto | `routes/videos.ts` |
| G1 | " | não grava a chave | óbvio | `routes/videos.ts` |
| G1 | " | a gravação antecipada continua no lugar | **expectGreen** | `routes/videos.ts` |
| G2 | falha sem cobrança estorna, falha com cobrança não | estorna também quando o fornecedor cobrou | esperto | `videoFailure.ts` |
| G2 | " | não estorna nunca | óbvio | `videoFailure.ts` |
| G2 | " | a nota do estorno muda de redação | **expectGreen** | `videoFailure.ts` |
| G3 | o estorno é único | estorna duas vezes em corrida | esperto | `creditGate.ts` |
| G3 | " | ignora o índice único | óbvio | migration 035 |
| G4 | o boot recolhe o que ficou preso | recolhe só os recentes e ignora os antigos | esperto | `recovery.ts` |
| G4 | " | não recolhe nada | óbvio | `index.ts` |
| G4 | " | a idade máxima muda de valor | **expectGreen / env** | `VIDEO_RECOVERY_MAX_AGE_MS=900000` |
| G5 | toda chamada a fornecedor tem teto de tempo | AbortSignal criado mas não passado ao fetch | esperto | `avatarProvider.ts` |
| G5 | " | fetch sem AbortSignal | óbvio | `voiceProvider.ts` |
| G5 | " | o teto vem do ambiente e é respeitado | **expectGreen / env** | `VENDOR_HTTP_TIMEOUT_MS=45000` |
| G6 | cada ponto de falha grava o seu motivo | grava motivo genérico em todos os sete pontos | esperto | `routes/videos.ts` |
| G6 | " | não grava motivo | óbvio | `routes/videos.ts` |

**Os 14 mutantes com `file` foram verificados: cada `find` casa EXATAMENTE UMA VEZ** no arquivo alvo, aplicando a mesma normalização CRLF que o runner faz ([run-mutants.mjs:98-103](tools/run-mutants.mjs:98)). Isso importa porque o repositório é misto — `routes/videos.ts`, `index.ts` e `avatarProvider.ts` são CRLF; `creditGate.ts`, `voiceProvider.ts` e as migrações são LF. Sem a normalização do runner, todo `find` multi-linha casaria zero vezes.

**Uma escolha de desenho no G1 esperto, que vale registrar.** A primeira versão movia a gravação para dentro de uma closure definida antes da chamada — e a guarda **não a pegaria**, porque o texto continuava aparecendo antes de `generateVideo({` e a verificação era só de ordem. Troquei por um defeito que a guarda de fato detecta: a chave gravada deixa de ser a enviada (`idempotencyKey + "-" + Date.now()`). É pior e mais sutil que a reordenação — a coluna fica preenchida, a tela não acusa nada, e a reconciliação procura no fornecedor um valor que nunca existiu lá. A verificação correspondente exige que o parâmetro seja exatamente `idempotencyKey` e que ele venha de `heygenIdempotencyKey` ([checkVideoRecoveryPolicy.ts:298-313](backend/src/scripts/checkVideoRecoveryPolicy.ts:298)).

---

## 3 · OS VALORES LITERAIS DE `failure_reason`

**Dez**, declarados em [videoFailure.ts:29-58](backend/src/services/video/videoFailure.ts:29) e repetidos no `CHECK` de [048](backend/src/db/migrations/048_video_failure_reason.sql). A guarda confere que as duas listas coincidem — um motivo no código e ausente do `CHECK` derrubaria a escrita no meio de um caminho de falha.

| Valor | Onde é escrito | Aceite? | Gasto | Estorna? |
|---|---|---|---|---|
| `insufficient_credits` | [videos.ts:924](backend/src/routes/videos.ts:924) | não | `nao_saiu` | não há débito |
| `live_budget_exhausted` | [videos.ts:1084](backend/src/routes/videos.ts:1084) | não | `nao_saiu` | **sim** |
| `vendor_rejected` | [videos.ts:1098](backend/src/routes/videos.ts:1098) | não | `nao_saiu` | **sim** |
| `vendor_timeout` | [videos.ts:1098](backend/src/routes/videos.ts:1098) (criação) e [:302](backend/src/routes/videos.ts:302) (polling) | depende | `nao_saiu` sem job / `indeterminado` com job | **sim** sem job |
| `artifact_invalid` | [videos.ts:175](backend/src/routes/videos.ts:175) | sim | **`saiu`** | não |
| `vendor_reported_error` | [videos.ts:281](backend/src/routes/videos.ts:281) | sim | `indeterminado` | não |
| `poll_loop_error` | [videos.ts:302](backend/src/routes/videos.ts:302) | sim | `indeterminado` | não |
| `poll_timeout` | [videos.ts:320](backend/src/routes/videos.ts:320) | sim | `indeterminado` | não |
| `recovery_orphan` | [recovery.ts:186](backend/src/services/video/recovery.ts:186) | não | `nao_saiu` | **sim** |
| `recovery_stale` | [recovery.ts:192](backend/src/services/video/recovery.ts:192) | sim | `indeterminado` | não |

**A máquina de estados não mudou:** `queued`, `processing`, `ready`, `error` — o `CHECK` da migração 002 não foi tocado. `failure_reason` é coluna ao lado.

**A regra de estorno, e a fronteira que ela usa.** A regra pedida foi "se o dinheiro não saiu para o fornecedor, o crédito volta; se saiu, não volta, e o motivo fica registrado". O que o código consegue observar não é "cobrou", é **"aceitou"** — a existência de `provider_job_id`. É a mesma fronteira que `routes/videos.ts` já declarava em prosa desde o ESTORNO-1: assim que `generateVideo()` devolve job id, o trabalho está enfileirado lá e a cota é consumida.

Daí as três classes, e a do meio é a que precisa ficar explícita:
- **`nao_saiu`** — sem job id. Estorna.
- **`saiu`** — só `artifact_invalid`, porque o fornecedor entregou artefato pronto: prova de renderização. Não estorna.
- **`indeterminado`** — job aceito, desfecho desconhecido. **Não estorna**, e essa é uma escolha, não uma dedução: devolver crédito sobre gasto que pode ter acontecido cria crédito do nada, e é o erro que ninguém reclama — só aparece na conciliação (a mesma frase que a migração 035 usa para justificar os índices únicos). Errar para o lado de não devolver é visível: o cliente reclama, e a linha agora guarda o motivo e o job id para responder.

**Consequência prática, dita sem rodeio:** os quatro caminhos do polling passaram a *decidir* estorno pela mesma função dos sete pontos, e nos quatro a decisão dá **não estorna**, porque nos quatro o job foi aceito. O estorno que de fato passou a existir está nos caminhos novos — `vendor_timeout` na criação e `recovery_orphan` —, que são justamente os que a janela 797→853 produzia e que antes não devolviam nada. Reclassificar `indeterminado` para "estorna" é decisão de negócio; deixei-a onde a regra escrita a coloca e **não a tomei**.

---

## 4 · MEDIDO / DEDUZIDO / NÃO VERIFICADO

### MEDIDO

- **Zero vídeos em estado não-terminal** hoje (`SELECT`, 08/08). O acervo tem 24 linhas: 23 `ready`, 1 `error`.
- **As 46 migrações estão aplicadas**, incluindo 043, 044 e 046 (`schema_migrations`). Isso fechou o item 4 dos "não verificados" do relatório de aprofundamento.
- **`videos` tinha um único índice**, `videos_pkey`. Buscar por `provider_job_id` varria a tabela — justifica os índices da 047.
- **`failure_reason` não existia** em `videos` (30 colunas listadas) — a 048 é estritamente aditiva.
- **15 linhas de `provider_usage` de `avatar` com `video_id` nulo** — consumo que sobreviveu ao vídeo (`ON DELETE SET NULL`) e perdeu qualquer ponte com o fornecedor. É a medição que justifica repetir `provider_job_id` em `provider_usage`.
- **4 vídeos `ready` sem linha de consumo** — a lacuna prevista em C3.
- **São QUATRO índices únicos parciais de estorno, não três**: a 035 criou três e a 046 acrescentou `credit_ledger_one_refund_per_look`. O usado aqui é `credit_ledger_one_refund_per_video`.
- **O único vídeo em `error` foi debitado E estornado** — saldo líquido preso: zero.
- **29 pontos de saída a fornecedor, 29 com `AbortSignal`.** Contados por varredura de parênteses balanceados, não por `grep` de linha.
- **`tsc --noEmit` passa** nos arquivos novos e alterados. Os dois únicos erros são `Cannot find module 'stripe'` em [stripeWebhook.ts:2](backend/src/routes/stripeWebhook.ts:2) e [stripeClient.ts:1](backend/src/services/billing/stripeClient.ts:1) — o pacote não está no `node_modules` do host, é anterior a esta rodada e não tem relação com o que mudei.
- **Os 14 `find` de mutante casam 1× cada**, com normalização CRLF.
- **159 → 175 mutantes**, 29 → 30 guardas.

### DEDUZIDO

- **`DEFAULT_VENDOR_TIMEOUT_MS = 120_000`.** Nenhuma chamada de API deste projeto foi cronometrada. Folgado para não transformar lentidão normal em erro, curto para o cliente não ficar minutos numa tela parada — a criação é síncrona até `POST /v3/videos`.
- **`DEFAULT_VENDOR_DOWNLOAD_TIMEOUT_MS = 600_000`.** Igualado ao teto que [video/ffmpeg.ts:23](backend/src/services/video/ffmpeg.ts:23) já usa para trabalho local pesado.
- **`DEFAULT_VIDEO_RECOVERY_MAX_AGE_MS = 6 h`.** Duas pontas conhecidas: o polling desiste em ~7,5 min, então acima disso já é anômalo; e a URL assinada do fornecedor expira, então reacompanhar algo de ontem tende a achar artefato inalcançável. Seis horas cobre uma noite de máquina desligada. **Não há amostra** — a varredura de 08/08 achou zero presos.
- **Que os 4 `ready` sem consumo sejam ausência histórica** (todos de 16–17/07, anteriores ao uso de `provider_usage` no caminho de vídeo) e não perda de registro. A data sustenta; nada no banco decide.
- **Que `poll_timeout`, `poll_loop_error` e `vendor_reported_error` correspondam a cota consumida.** Vem da semântica registrada no repositório ("aceite = cota consumida"), não de medição por motivo.

### NÃO VERIFICADO

- **As guardas G1–G6 NÃO foram provadas reprovando.** É o padrão da casa e eu não o cumpri — pelos dois motivos abaixo, e nenhum deles é contornável dentro dos guardrails desta tarefa:
  1. O arnês roda o gate com `docker compose exec` dentro do container ([run-mutants.mjs:10-13](tools/run-mutants.mjs:10)). A autorização (b) desta tarefa cobre **consultas SELECT ao banco**, não execução de comandos no container.
  2. O arnês **exige árvore limpa** e prova a reversão com `git status --short` ([run-mutants.mjs:30-33](tools/run-mutants.mjs:30)). Com as alterações desta rodada não commitadas, ele aborta antes do primeiro mutante — não é escolha minha, é a condição de entrada dele.

  O que **está** verificado: que cada `find` casa exatamente uma vez (a condição de aborto mais comum), que o TypeScript compila, e que cada `expect` corresponde a uma string que a guarda de fato emite — conferido lendo as duas pontas. Que a guarda **reprove** quando o mutante é aplicado permanece **NÃO VERIFICADO**.
- **O gate (`npm run check`) não foi executado.** Mesmo motivo. A guarda nova troca `pool.query` por um duplo e restaura no `finally`, no mesmo padrão de `checkRehearsalCreditPolicy`, mas isso não foi exercitado.
- **Nenhuma migração foi executada**, então as colunas `provider_idempotency_key`, `provider_request_at`, `videos.failure_reason` e `provider_usage.provider_job_id` **não existem no banco**. O código as referencia. **Até as migrações rodarem, criar vídeo falha** — ver a ordem na seção 5.
- **A varredura de boot nunca rodou contra o banco real.** Foi exercitada só com `pool.query` substituído, dentro da guarda.
- **O comportamento do `AbortSignal` contra um fornecedor lento de verdade** — nenhuma chamada de rede foi feita. Que `AbortSignal.timeout` produza `TimeoutError` e que o `fetch` do Node embrulhe a causa é contrato lido, não observado aqui.
- **Se `heygenIdempotencyKey` calculada antes é idêntica à que o header leva.** As duas chamam a mesma função com o mesmo objeto, mas isso não foi observado em execução.
- **O custo em tempo do gate com a guarda nova.** O arnês custava ~21,5 min com 159 mutantes; com 175 o produto cresce, e não medi.
- **Fins de linha:** meus arquivos novos saíram em LF num repositório majoritariamente CRLF. O runner normaliza e o `git` avisa que converterá no próximo toque. Não normalizei — mexer em fim de linha de arquivo alheio está fora do escopo.

---

## 5 · ORDEM EXATA DE APLICAÇÃO DAS MIGRAÇÕES

As duas são **aditivas** e **idempotentes** (`IF NOT EXISTS`; a 048 faz `DROP CONSTRAINT IF EXISTS` antes do `ADD`, pela lição da 039). Nenhuma altera ou remove nada existente. Nenhuma foi executada.

**A ordem entre elas é indiferente** — não há dependência de uma para a outra. **A ordem em relação ao código NÃO é indiferente:** o código já referencia as quatro colunas novas, então rodar as migrações **antes** de o backend recarregar o código novo é o caminho sem janela de erro. Como o backend roda as migrações no boot ([index.ts:42](backend/src/index.ts:42)) e o `src` está em bind mount, um `restart` faz as duas coisas na ordem certa por construção.

```bash
docker compose exec -T backend npm run migrate
```

Aplica, em ordem alfabética, o que faltar:

1. `047_video_job_reconciliation.sql` — `videos.provider_idempotency_key`, `videos.provider_request_at`, `provider_usage.provider_job_id`, e 4 índices (`videos_provider_job_id_idx`, `videos_provider_idempotency_key_idx`, `videos_em_voo_idx`, `provider_usage_provider_job_id_idx`).
2. `048_video_failure_reason.sql` — `videos.failure_reason`, o `CHECK` com os 10 literais, e `videos_failure_reason_idx`.

Conferência, somente leitura:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT name FROM schema_migrations WHERE name LIKE '\''04[78]%'\'' ORDER BY name;"'
```

**Três coisas que ficam pendentes de você, e que eu não fiz de propósito:**
- Recarregar o backend para o código novo entrar (`restart backend`) — proibido nesta tarefa.
- Rodar o gate e o arnês, que exigem árvore limpa: **`npm run check:mutants` só roda depois do commit**.
- As três variáveis novas de ambiente não estão no `.env` (não o li, não o toquei). Sem elas o código usa os padrões declarados, que é o comportamento desenhado.
