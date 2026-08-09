# RELATÓRIO DE EXPOSIÇÃO — eckko.ai (TWINAI)

**Data:** 2026-08-08 · **HEAD:** `c4d827e`
**Método:** consultas `SELECT` somente-leitura, via `docker compose exec -T postgres psql`, sob a autorização (b) desta tarefa. Nenhuma escrita, nenhuma migração, nenhum serviço reiniciado. Executado **antes** de qualquer alteração de código.

Os quatro containers estavam `running (healthy)`, de pé há 2 dias.

---

## 1.1 · Registros de vídeo em estado não-terminal

**Estado não-terminal = `queued` ou `processing`** (os quatro estados vêm do `CHECK` de [002_videos.sql:8-9](backend/src/db/migrations/002_videos.sql:8)).

```sql
SELECT status,
       CASE WHEN now()-created_at < interval '1 hour'   THEN 'a) < 1h'
            WHEN now()-created_at < interval '24 hours' THEN 'b) 1h-24h'
            ELSE 'c) > 24h' END AS idade,
       count(*) FROM videos WHERE status IN ('queued','processing') GROUP BY 1,2;
```

### Resultado: **ZERO**

```
 status | idade | n
--------+-------+---
(0 rows)
```

**Não há hoje nenhum vídeo preso.** A quebra por idade fica vazia por consequência — não há linha para classificar em `< 1h`, `1h–24h` ou `> 24h`.

### Acervo inteiro, para contexto

| status | n | mais antigo | mais novo |
|---|---:|---|---|
| `error` | 1 | 2026-08-01 19:03:23 UTC | idem |
| `ready` | 23 | 2026-07-16 12:01:49 UTC | 2026-08-06 09:12:12 UTC |
| **total** | **24** | | |

**O que este zero significa, e o que não significa.** Significa que nenhuma geração ficou pendurada nas passadas que produziram estas 24 linhas. **Não** significa que a janela descrita no defeito não exista: ela se abre por processo morto durante uma geração em voo, e o backend está de pé há 2 dias sem geração nova (a última é de 06/08). O zero mede o histórico desta base, não a ausência do caminho.

---

## 1.2 · Não-terminais com e sem `provider_job_id`

**Vazio por consequência de 1.1** — não há não-terminal para classificar.

### O acervo inteiro, que é onde o dado aparece

| status | com `provider_job_id` | sem `provider_job_id` |
|---|---:|---:|
| `error` | 0 | **1** |
| `ready` | **21** | **2** |

**Três leituras:**
- O único `error` **não tem job id** — coerente com o caminho de recusa antes do aceite ([routes/videos.ts:906](backend/src/routes/videos.ts:906)), em que a chamada nunca produziu job.
- **Dois `ready` sem job id.** São anteriores ao caminho atual (a coluna nasceu na migração 016) ou vieram de fixture. Qual dos dois é **NÃO VERIFICADO** — não cruzei com `simulated`.
- Um vídeo sem `provider_job_id` **não é reconciliável hoje por nenhum meio**: é exatamente o buraco que 2.1 fecha.

---

## 1.3 · Créditos debitados para vídeos não-terminais ou em `error`

```sql
SELECT v.status, count(*) FILTER (WHERE l.reason='consumption') ...
  FROM credit_ledger l JOIN videos v ON v.id = l.related_video_id
 WHERE v.status IN ('queued','processing','error') GROUP BY 1;
```

### Total

| status | lançamentos de consumo | créditos debitados | lançamentos de estorno | créditos estornados |
|---|---:|---:|---:|---:|
| `error` | 1 | **1** | 1 | **1** |
| `queued` | — | — | — | — |
| `processing` | — | — | — | — |

### Por tenant

| tenant_id | tipo | status | motivo | simulated | n | Σ delta |
|---|---|---|---|---|---:|---:|
| `c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd` | `video` | `error` | `consumption` | `f` | 1 | **−1** |
| `c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd` | `video` | `error` | `refund` | `f` | 1 | **+1** |

**Saldo líquido preso: ZERO.** O único vídeo em `error` foi debitado **e estornado** — o caminho de estorno anterior ao aceite funcionou. Um tenant envolvido, um crédito, devolvido.

### Contexto: o `credit_ledger` inteiro

| motivo | tipo | simulated | n | Σ delta |
|---|---|---|---:|---:|
| `consumption` | avatar | f | 3 | −3 |
| `consumption` | avatar | t | 1 | −1 |
| `consumption` | script | f | 7 | −7 |
| `consumption` | video | f | 11 | −11 |
| `consumption` | video | t | 17 | −17 |
| `consumption` | video_rehearsal | t | 5 | −5 |
| `grant` | avatar | f | 21 | +26 |
| `grant` | avatar_rehearsal | f | 18 | +9000 |
| `grant` | script | f | 20 | +234 |
| `grant` | script_rehearsal | f | 18 | +9000 |
| `grant` | video | f | 25 | +76 |
| `grant` | video_rehearsal | f | 18 | +9000 |
| `manual_admin_adjustment` | avatar | f | 1 | −1 |
| `manual_admin_adjustment` | video | f | 1 | +4 |
| `refund` | video | f | 1 | +1 |
| `refund` | video | t | 4 | +4 |

**Uma observação que a tabela expõe:** há **17 lançamentos `consumption` de `video` com `simulated = t` no balde `video` (real)**, contra 5 no balde `video_rehearsal`. Isso é coerente com a história registrada na migração 043 — o ensaio debitava o saldo real até 05/08, e os baldes `_rehearsal` só passaram a receber depois. Não é defeito ativo; é o passado que a correção de 043 deixou para trás. **Corrigir isso está FORA DO ESCOPO desta tarefa** e não foi tocado.

---

## 1.4 · Linhas de `provider_usage` sem vídeo terminal correspondente

| caso | provider | outcome | n |
|---|---|---|---:|
| **a) sem `video_id`** | avatar | failed | **4** |
| **a) sem `video_id`** | avatar | success | **11** |
| a) sem `video_id` | script | success | 64 |
| a) sem `video_id` | voice | success | 10 |
| b) `video_id` apontando para linha inexistente | — | — | **0** |
| c) vídeo em estado não-terminal | — | — | **0** |
| d) vídeo terminal (`ready`/`error`) | avatar | success | 19 |

**A resposta à pergunta, no sentido estrito (linhas de `avatar` sem vídeo terminal): 15** — 4 `failed` e 11 `success`.

**As de `script` (64) e `voice` (10) nunca têm `video_id` por desenho** — consumo de roteiro e de voz não pertence a um vídeo; a coluna é nullable exatamente por isso ([023_provider_usage.sql:8](backend/src/db/migrations/023_provider_usage.sql:8)).

**As 15 de `avatar` são o achado.** `recordProviderUsage` e `recordFailedProviderUsage` **sempre** recebem `videoId` no caminho de vídeo ([routes/videos.ts:78](backend/src/routes/videos.ts:78), [:161](backend/src/routes/videos.ts:161), [:186](backend/src/routes/videos.ts:186), [:208](backend/src/routes/videos.ts:208), [:234](backend/src/routes/videos.ts:234), [:914](backend/src/routes/videos.ts:914)). Um `video_id` nulo ali só pode ter vindo do `ON DELETE SET NULL` da FK ([023:8](backend/src/db/migrations/023_provider_usage.sql:8)): **os vídeos foram apagados e o consumo sobreviveu, órfão**. A aritmética sustenta: são 34 linhas de `avatar` (4+11+19) para 24 vídeos.

**Quem apagou e quando é NÃO VERIFICADO** — não há coluna de exclusão nem trilha em `audit_log` que eu tenha consultado para isto.

### Consumo total registrado

| provider | outcome | unit_source | n | Σ unidades |
|---|---|---|---:|---:|
| avatar | failed | (null) | 4 | 0 |
| avatar | success | `requested` | 7 | 135 |
| avatar | success | `vendor_response` | 23 | 231,53423 |
| script | success | `requested` | 58 | 98.164 |
| script | success | (null) | 6 | 4.286 |
| voice | success | `requested` | 2 | 479 |
| voice | success | (null) | 8 | 2.033 |

### Lacuna no sentido inverso: vídeos `ready` **sem** linha de consumo

**4 vídeos.** É exatamente a forma prevista em C3 do relatório de aprofundamento ("`ready` gravado, antes de `recordProviderUsage`"):

| id | simulated | created_at |
|---|---|---|
| `22952193-74ca-4b4a-b7e1-4cab561c0b56` | f | 2026-07-16 12:01:49 |
| `0b7634f3-9a99-4e78-b9d5-e5eba6fc1b34` | f | 2026-07-17 07:03:21 |
| `b7cd291b-7dbf-4b57-a6e5-b87b325223e3` | f | 2026-07-17 09:22:41 |
| `64895f2c-0d97-4fc4-b285-ba37e6e0f02d` | f | 2026-07-17 10:26:12 |

**Os quatro são de 16–17/07**, anteriores à migração 023 (`provider_usage`) ter entrado em uso pelo caminho de vídeo. Que sejam ausência histórica e não a lacuna de C3 é **DEDUZIDO pela data**, não medido — nada no banco distingue "nunca houve registro" de "o registro se perdeu".

---

## 1.5 · Migrações 043, 044 e 046

```sql
SELECT count(*), max(name) FROM schema_migrations;
SELECT name FROM schema_migrations WHERE name LIKE '04%' ORDER BY name;
```

| migração | aplicada? |
|---|---|
| `043_rehearsal_credits.sql` | **SIM** |
| `044_avatar_looks.sql` | **SIM** |
| `046_ledger_look_reference.sql` | **SIM** |

**As 46 migrações estão aplicadas**, sem lacuna: `count(*) = 46`, última `046_ledger_look_reference.sql`. A série 04x aparece completa (040 a 046).

Isto **fecha o item 4 da seção "não consegui verificar"** do relatório de aprofundamento: as colunas `related_avatar_look_id`, `cost_units` e os baldes `_rehearsal` existem no banco corrente, não só nos arquivos.

---

## Achados colaterais que sustentam o passo 2

Duas consultas de estrutura, feitas para confirmar que os itens 2.2 e 2.3 são necessários e aditivos:

### Índices existentes

| tabela | índices |
|---|---|
| `videos` | **`videos_pkey` — e mais nenhum** |
| `provider_usage` | `provider_usage_pkey`, `provider_usage_tenant_id_idx`, `provider_usage_created_at_idx`, `provider_usage_failed_idx` |
| `credit_ledger` | `credit_ledger_pkey`, `credit_ledger_tenant_id_idx`, `credit_ledger_simulated_idx`, e os **quatro** índices únicos parciais de estorno: `..._one_refund_per_video`, `..._per_training`, `..._per_generation`, **`..._per_look`** |

**MEDIDO: `videos` não tem nenhum índice além da chave primária.** Uma busca por `provider_job_id` — que é o que a reconciliação de 2.5 faz — varre a tabela inteira. Justifica 2.2.

**MEDIDO: são QUATRO índices únicos parciais de estorno, não três.** O enunciado desta tarefa fala em três; a migração 035 cria três ([035:24-34](backend/src/db/migrations/035_credit_ledger_refund_reason.sql:24)) e a **046 acrescentou o quarto** (`credit_ledger_one_refund_per_look`). O item 2.4 se apoia neles; o de vídeo, que é o que interessa aqui, é `credit_ledger_one_refund_per_video`.

### Colunas de `videos` (30)

`id · avatar_id · script · scenario · outfit · duration_seconds · status · output_url · created_at · tenant_id · scenario_prompt · outfit_prompt · provider_job_id · provider_vendor · error_message · simulated · audio_duration_seconds · audio_duration_source · publish_platform · aspect_ratio · resolution · provider_engine · provider_engine_reason · provider_output_url · background_type · background_value · motion_prompt · expressiveness · engine_choice · avatar_look_id`

**MEDIDO: não existe `failure_reason` nem nenhuma coluna de chave de idempotência.** Justifica 2.1 e 2.3, e confirma que ambos são **aditivos**.

### O único vídeo em `error`

| id | erro | job id | simulated | criado |
|---|---|---|---|---|
| `04d84461-…` | "Não foi possível concluir a operação no serviço de vídeo. Tente novame…" | (nulo) | f | 2026-08-01 19:03 |

Mensagem sanitizada, sem job id, com estorno feito. É o caminho [routes/videos.ts:906](backend/src/routes/videos.ts:906) funcionando como desenhado — e é também a ilustração do problema de 2.3: **a mensagem não diz qual dos sete pontos a escreveu**, nem se houve cobrança.

---

## O QUE EU NÃO CONSEGUI VERIFICAR E POR QUÊ

1. **Se os 2 vídeos `ready` sem `provider_job_id` vieram de fixture ou de antes da migração 016.** Não cruzei com `simulated`; a consulta feita agrupa só por status.
2. **Quem apagou os vídeos cujo consumo ficou órfão (15 linhas de `avatar`).** Não há coluna de exclusão em `videos` e não consultei `audit_log` para isso.
3. **Se as 4 lacunas "ready sem consumo" são ausência histórica ou perda de registro.** A data sustenta a primeira hipótese; nada no banco decide entre as duas.
4. **Se algum vídeo já esteve preso e foi corrigido à mão.** `videos` não guarda histórico de transição — só o estado atual.
5. **A causa dos 17 `consumption` de vídeo simulado no balde real.** Coerente com a história da migração 043, mas não investiguei linha a linha; e corrigir está fora do escopo.
6. **O tamanho das tabelas em disco e o custo real da varredura de 2.5.** Não rodei `EXPLAIN` nem consultei `pg_class` — com 24 vídeos a diferença não seria observável de qualquer forma.
