# RELATÓRIO DE APROFUNDAMENTO — eckko.ai (TWINAI)

**Data:** 2026-08-08 · **HEAD:** `c4d827e` · segunda passada sobre quatro pontos.
Somente leitura. Nenhum arquivo alterado além deste, nenhum serviço tocado, nenhuma consulta ao banco, nenhuma chamada de rede, `.env` e `.env.example` não foram lidos.

Companheiro de [RELATORIO-ESTADO-ECKKO-20260808.md](RELATORIO-ESTADO-ECKKO-20260808.md).

---

# A · O PADRÃO DE WEBHOOK DO STRIPE, COMO MOLDE

Arquivo único: [backend/src/routes/stripeWebhook.ts](backend/src/routes/stripeWebhook.ts), 198 linhas. Descrito abaixo como **molde de recepção de callback externo**, não como integração de pagamento.

## A1 · Como o corpo bruto chega intacto até a verificação de assinatura

Três mecanismos encadeados, e a ordem entre eles é o que faz funcionar.

**1. O plugin é registrado como função assíncrona própria, e isso cria um contexto de encapsulamento do Fastify.**
[app.ts:75](backend/src/app.ts:75) — `await app.register(stripeWebhookRoutes);`. Não é `app.get(...)` solto nem parte de um `register` compartilhado: é um plugin, e no Fastify tudo o que um plugin altera do ciclo de vida **fica dentro dele**.

**2. Dentro do plugin, o parser de `application/json` é substituído por um que entrega `Buffer`.**
[stripeWebhook.ts:98-100](backend/src/routes/stripeWebhook.ts:98):
```
app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
  done(null, body);
});
```
`parseAs: "buffer"` faz o Fastify acumular o corpo como bytes; o callback devolve esses bytes **sem `JSON.parse`**. Consequência: dentro deste plugin, `req.body` **é** um `Buffer`, não um objeto. O comentário em [:92-96](backend/src/routes/stripeWebhook.ts:92) declara exatamente por quê — o parser padrão já teria consumido e reinterpretado o stream antes de o handler rodar, e a assinatura do Stripe é calculada sobre os bytes exatos, não sobre um objeto reserializado.

**3. O plugin está registrado FORA do bloco autenticado.**
Ordem de registro em [app.ts:67-103](backend/src/app.ts:67):

| Ordem | O quê | Consequência para o webhook |
|---|---|---|
| [app.ts:65](backend/src/app.ts:65) | `app.addHook("preHandler", resolveTenantFromHost)` — hook **global** | Roda também no webhook; faz uma consulta a `tenants` por slug do Host e escreve `req.hostTenantId`. Não bloqueia nada ([resolveTenantFromHost.ts:15-25](backend/src/middleware/resolveTenantFromHost.ts:15)) |
| [:67-71](backend/src/app.ts:67) | `health`, `auth`, `adminAuth`, `login`, `public` | públicas |
| **[:75](backend/src/app.ts:75)** | **`stripeWebhookRoutes`** | **público** — o Stripe chama sem cookie de sessão, como diz o comentário em [:73-74](backend/src/app.ts:73) |
| [:78-94](backend/src/app.ts:78) | bloco com `preHandler: requireAuth` (14 grupos de rotas) | o webhook **não está aqui**; se estivesse, todo POST do Stripe voltaria 401 |
| [:98-103](backend/src/app.ts:98) | bloco com `preHandler: requireAdmin` | idem |

Registros globais que precedem tudo e afetam o corpo: `cors` ([:40](backend/src/app.ts:40)), `multipart` ([:41](backend/src/app.ts:41)), `staticFiles` ([:42](backend/src/app.ts:42)), `cookie` ([:47](backend/src/app.ts:47)), `session` ([:48](backend/src/app.ts:48)). Nenhum deles registra parser para `application/json`, então a substituição do plugin é a única que vale ali dentro.

**O uso na verificação:** [stripeWebhook.ts:115](backend/src/routes/stripeWebhook.ts:115) — `stripe.webhooks.constructEvent(req.body as Buffer, signature, config.stripeWebhookSecret)`. O `as Buffer` é a contrapartida em tipo do que o parser garante em execução.

**Resumo do molde:** corpo bruto = plugin próprio + `addContentTypeParser(..., {parseAs:"buffer"})` + registro fora de qualquer bloco autenticado, antes deles no arquivo.

## A2 · Idempotência de evento

**No nível do EVENTO: NÃO EXISTE.**

- **Não há tabela de eventos processados.** A busca por `stripe_event`, `event_id`, `webhook_event` e `processed_event` em `backend/src` (`.ts` e `.sql`) **não retorna nada**.
- **`event.id` nunca é lido.** Em todo o arquivo, o objeto `event` é usado apenas por `event.type` ([stripeWebhook.ts:121](backend/src/routes/stripeWebhook.ts:121)) e `event.data.object` ([:123](backend/src/routes/stripeWebhook.ts:123), [:170](backend/src/routes/stripeWebhook.ts:170), [:173](backend/src/routes/stripeWebhook.ts:173)). O identificador do evento não é gravado em lugar nenhum.

**O que existe é idempotência POR EFEITO, uma por caminho, e ela é forte onde há dinheiro:**

| Caminho | Mecanismo | Arquivo e linha |
|---|---|---|
| Compra de crédito | Chave `stripe_payment_intent_id` no ledger, com **lock antes da checagem**: `SELECT ... FOR UPDATE` na linha de `tenant_credits`, depois `SELECT 1 FROM credit_ledger WHERE stripe_payment_intent_id = $1 AND credit_type = $2`; se existe, `ROLLBACK` e devolve `alreadyGranted: true` | [creditGate.ts:159-171](backend/src/services/billing/creditGate.ts:159); ordem justificada em [:165-172](backend/src/services/billing/creditGate.ts:165) |
| Concessão mensal / top-up de plano | Idempotente por tenant/tipo/**mês**: `SELECT 1 FROM credit_ledger WHERE ... reason='grant' AND created_at >= date_trunc('month', now())` → `skipped`; e semântica de **reset** (`delta = planLimit - currentBalance`, `skipped` se `delta <= 0`) | [monthlyGrant.ts:61-71](backend/src/services/billing/monthlyGrant.ts:61), [:74-86](backend/src/services/billing/monthlyGrant.ts:74) |
| Mudança de plano / status de assinatura | **Nenhuma** — são `UPDATE` idempotentes por natureza (escrever o mesmo `plan_id`/`status` duas vezes dá o mesmo resultado), mas **cada reentrega grava uma linha nova em `audit_log`** ([stripeWebhook.ts:138-144](backend/src/routes/stripeWebhook.ts:138), [:47-53](backend/src/routes/stripeWebhook.ts:47)) |

Ou seja: **uma reentrega do mesmo evento é reprocessada do começo**; o que impede efeito duplicado é a checagem dentro de cada função de efeito, não um filtro na porta. O comentário em [creditGate.ts:165-167](backend/src/services/billing/creditGate.ts:165) declara isto explicitamente: *"Stripe can and does redeliver the same webhook event"* — a defesa foi posta no ledger, não no roteador.

## A3 · Evento desconhecido, fora de ordem, e antes do registro local existir

**Evento desconhecido** — `default: break` ([stripeWebhook.ts:192-193](backend/src/routes/stripeWebhook.ts:192)), seguido de `reply.code(200).send({ received: true })` ([:196](backend/src/routes/stripeWebhook.ts:196)). É aceito, ignorado em silêncio e **não gera log nem linha de auditoria**. Do ponto de vista do Stripe, foi processado com sucesso — não haverá reentrega.

**Evento fora de ordem** — **não há defesa.** `applySubscriptionStatus` aplica o estado do evento que chegou, sem comparar carimbo de tempo, versão ou estado anterior ([stripeWebhook.ts:26-54](backend/src/routes/stripeWebhook.ts:26)). O ramo escolhido depende só de `subscription.status` ([:33-45](backend/src/routes/stripeWebhook.ts:33)): `active`/`trialing` → ativa; `past_due`/`unpaid`/`incomplete_expired` → suspende; `canceled` → volta ao plano mais barato. **Último a chegar vence.** Um `updated` antigo entregue depois de um `deleted` reverteria o efeito do `deleted`. O que sobra como rastro é o `audit_log`, que grava o `before` ([:31](backend/src/routes/stripeWebhook.ts:31)) e o `after` ([:52](backend/src/routes/stripeWebhook.ts:52)) de cada aplicação — permite reconstruir a ordem *depois*, não impede a inversão.

**Evento antes de o registro local existir** — o padrão é **desistir em silêncio, com 200**. Três guardas de existência, todas com `return` mudo:
- [stripeWebhook.ts:29](backend/src/routes/stripeWebhook.ts:29) — `if (!tenantId || !(await tenantExists(tenantId))) return;`
- [:68](backend/src/routes/stripeWebhook.ts:68) — mesma checagem no caminho de compra de crédito
- [:132](backend/src/routes/stripeWebhook.ts:132) e [:175](backend/src/routes/stripeWebhook.ts:175) — a condição `if (tenantId && planId && (await tenantExists(tenantId)))` simplesmente não entra

**O tenant vem de `metadata`, não da nossa base:** `subscription.metadata?.tenantId` ([:27](backend/src/routes/stripeWebhook.ts:27)), `session.metadata?.tenantId` ([:63](backend/src/routes/stripeWebhook.ts:63), [:130](backend/src/routes/stripeWebhook.ts:130)) — o vínculo com o registro local é carregado pelo próprio evento externo. Se o `metadata` não veio, o evento é descartado sem rastro.

Validações extras no caminho de crédito, todas com `return` mudo exceto uma ([:69-74](backend/src/routes/stripeWebhook.ts:69)): `creditType` fora de `video|script|avatar` → descarta; `quantity` não finito ou ≤ 0 → descarta; **`payment_intent` ausente → descarta E registra** `logEvent("error", "stripe_checkout_without_payment_intent", ...)` ([:72](backend/src/routes/stripeWebhook.ts:72)). Este é o **único** caminho de descarte que deixa rastro.

**Não há fila de espera, nem reprocessamento posterior:** um evento que chegou cedo demais está perdido — nada o guarda para tentar de novo.

## A4 · Contrato de resposta

| Situação | HTTP | Corpo | Onde |
|---|---|---|---|
| Sucesso (inclusive evento desconhecido, ignorado ou descartado) | **200** | `{ received: true }` | [stripeWebhook.ts:196](backend/src/routes/stripeWebhook.ts:196) |
| Segredo de webhook não configurado | **400** | `{ error: "stripe_not_configured" }` | [:103-105](backend/src/routes/stripeWebhook.ts:103) |
| Header `stripe-signature` ausente ou não-string | **400** | `{ error: "Missing stripe-signature header" }` | [:107-110](backend/src/routes/stripeWebhook.ts:107) |
| Assinatura inválida (ou `getStripe()` falhou) | **400** | `{ error: "invalid_signature", message }` — `message` é o `err.message` do SDK | [:113-119](backend/src/routes/stripeWebhook.ts:113) |
| Erro no processamento | **não tratado** — não há `try/catch` em volta do `switch` ([:121-194](backend/src/routes/stripeWebhook.ts:121)). Uma exceção sobe ao handler de erro padrão do Fastify → **500**, e o Stripe reentrega | — |

**Uma exceção deliberada à regra acima:** o top-up de crédito após checkout é embrulhado em `try/catch` próprio e **nunca afeta o 200** ([:153-164](backend/src/routes/stripeWebhook.ts:153)). O comentário em [:146-152](backend/src/routes/stripeWebhook.ts:146) dá a razão: o pagamento e a troca de plano já commitaram, e a varredura de 24 h cobre a lacuna. A falha vira `logEvent("error", "stripe_topup_failed", ...)` ([:163](backend/src/routes/stripeWebhook.ts:163)).

**A regra do molde, então:** 400 é **rejeição na porta** (não sei quem é você); 200 é **aceite**, e inclui tudo o que foi ignorado por escolha; 500 é **falha nossa**, e é o único caso em que a reentrega do provedor é desejada.

## A5 · O que precisaria mudar para receber webhook de um fornecedor de vídeo

Lista, sem código.

- **Descobrir se o fornecedor sequer oferece callback.** Hoje o desfecho da geração é descoberto por polling ([routes/videos.ts:41-248](backend/src/routes/videos.ts:41)); nada no repositório afirma que HeyGen ou D-ID entreguem webhook — é NÃO VERIFICADO.
- **Novo plugin de rota registrado no mesmo ponto que o do Stripe** — em [app.ts](backend/src/app.ts), entre as rotas públicas e o bloco `requireAuth`, nunca dentro dele.
- **Decidir se o corpo bruto é necessário.** Só é, se a verificação de autenticidade for por HMAC sobre os bytes. Se for por token no header ou por mTLS, o parser padrão serve e o `addContentTypeParser` não é preciso.
- **Um mecanismo de autenticação do chamador que não seja "confio no caminho da URL".** O padrão do Stripe é assinatura + segredo em `config`; o equivalente precisa existir antes de a rota fazer qualquer coisa.
- **Um segredo novo em `config.ts`**, no formato `optional("...")` ([config.ts:16-19](backend/src/config.ts:16)), e repassado ao container em [docker-compose.yml](docker-compose.yml) — há guarda que reprova variável lida e não repassada (mutante *"uma variável nova é lida sem ser repassada"*, `checkEnvironmentPolicy.ts`).
- **Correlação do evento com a linha local.** O Stripe traz `metadata.tenantId`; um fornecedor de vídeo traria o job id, e o vínculo é `videos.provider_job_id` ([016_video_provider_job.sql:1](backend/src/db/migrations/016_video_provider_job.sql:1)) — a consulta seria por essa coluna, que hoje **não tem índice**.
- **Idempotência por evento, que hoje não existe em lugar nenhum** — ou uma tabela de eventos recebidos, ou uma condição de transição que torne o reprocessamento inócuo (por exemplo, só aplicar `ready` sobre linha que não esteja em estado terminal).
- **Reconciliar o webhook com o polling que já roda.** Os dois caminhos escreveriam nos mesmos campos; hoje o polling faz validação de artefato, persistência local e registro de consumo ([videos.ts:64-177](backend/src/routes/videos.ts:64)), e duplicar isso produziria duas linhas em `provider_usage` para a mesma geração.
- **Decidir o que fazer com evento para vídeo em estado terminal** — hoje só o caminho de timeout tem essa proteção, via `AND status != 'ready'` ([videos.ts:224](backend/src/routes/videos.ts:224)).
- **Alcançabilidade da rota de fora.** O único ingresso é o Traefik na porta 8090 ([docker-compose.yml:10](docker-compose.yml:10)), com `BASE_DOMAIN` — se o domínio não resolve pela internet, nenhum webhook chega. Isso é ambiente, não código.
- **Entrada no `endpointCatalog`?** Não — o catálogo cobre chamadas de saída ([endpointCatalog.ts:54](backend/src/services/providers/endpointCatalog.ts:54)). Um webhook é entrada e não pertence ali; mas a guarda de egresso não o cobriria também, então a proteção de modo (`fixture`/`live`) teria de ser pensada de novo para esse caminho.
- **Comportamento em modo `fixture`.** Um webhook real chegando a um ambiente simulado é um caso que o desenho atual não tem — o modo hoje só governa o que sai.

---

# B · CRÉDITOS, SALDO E COBRANÇA — O QUE JÁ EXISTE

## B1 · Tabelas de plano, assinatura, crédito, saldo, consumo, cobrança ou fatura

### `plans` — catálogo de planos
[020_plans_table.sql:6-16](backend/src/db/migrations/020_plans_table.sql:6)
`id text PK` · `name text` · `price_cents integer` · `video_limit_per_month integer` · `features jsonb` · `stripe_price_id text` (nullable) · `active boolean` · `created_at` · `updated_at`.
Semeada com `free`/`pro`/`business` ([:20-23](backend/src/db/migrations/020_plans_table.sql:20)). A 027 acrescentou `script_limit_per_month` e `avatar_limit_per_month` (referidas em [plans.ts:98](backend/src/plans.ts:98)).
**Propósito:** tirar os planos do array embutido em `plans.ts` e permitir edição pelo painel admin.

### `tenants` (colunas de cobrança)
[012_subscription_fields.sql:1-2](backend/src/db/migrations/012_subscription_fields.sql:1): `plan_id text NOT NULL DEFAULT 'free'` · `payment_method_masked text`.
[021_tenant_billing_fields.sql:4-14](backend/src/db/migrations/021_tenant_billing_fields.sql:4): `status text` (`active`|`suspended`) · `stripe_customer_id text` · ~~`credit_balance integer`~~.
**`credit_balance` foi CRIADA e DEPOIS REMOVIDA:** a 021 a introduziu como cache de `sum(delta)`; a 028 a derrubou (`ALTER TABLE tenants DROP COLUMN credit_balance`, [028:7](backend/src/db/migrations/028_tenant_credits.sql:7)) porque a decisão passou a ser três baldes independentes. A migração registra que a coluna foi confirmada sem leitura nem escrita em código antes de cair ([028:1-6](backend/src/db/migrations/028_tenant_credits.sql:1)).

### `tenant_credits` — SALDO em vigor
[028_tenant_credits.sql:9-15](backend/src/db/migrations/028_tenant_credits.sql:9)
`tenant_id uuid` · `credit_type text` (`video`|`script`|`avatar`; a 043 acrescentou os `_rehearsal`) · `balance integer DEFAULT 0` · `updated_at` · **PK composta `(tenant_id, credit_type)`**.
**Propósito:** o saldo consultável, **mutável**, atualizado sempre na mesma transação do lançamento. Toda linha existente foi semeada com zero explícito ([:22-25](backend/src/db/migrations/028_tenant_credits.sql:22)) para que o portão de débito sempre tenha linha a travar — a migração observa que **novos signups ainda não semeiam essas linhas**, e `debitCredit` trata a ausência como saldo 0 ([creditGate.ts:60-64](backend/src/services/billing/creditGate.ts:60)).

### `credit_ledger` — LIVRO-RAZÃO de crédito
[024_credit_ledger.sql:5-14](backend/src/db/migrations/024_credit_ledger.sql:5)
`id uuid PK` · `tenant_id uuid` · `delta integer` · `reason text` · `related_video_id uuid` · `stripe_payment_intent_id text` · `actor_admin_user_id uuid` · `created_at`.
Acrescentado depois: `credit_type text NOT NULL` + `related_script_generation_id` + `related_avatar_training_id` ([028:32-38](backend/src/db/migrations/028_tenant_credits.sql:32)), `simulated boolean NOT NULL DEFAULT false` ([032:16](backend/src/db/migrations/032_simulated_generation.sql:16)), `related_avatar_look_id` (046, usada em [creditGate.ts:108](backend/src/services/billing/creditGate.ts:108)).
`reason` evoluiu por três migrações: `purchase|consumption|manual_admin_adjustment` (024) → `+grant` ([029:9-10](backend/src/db/migrations/029_credit_ledger_grant_reason.sql:9)) → `+refund` ([035:10-11](backend/src/db/migrations/035_credit_ledger_refund_reason.sql:10)).
**Referências tipadas em vez de uma `related_entity_id` polimórfica**, para que a integridade referencial fique com o Postgres ([028:27-31](backend/src/db/migrations/028_tenant_credits.sql:27)).

### `provider_usage` — LIVRO-RAZÃO de consumo junto ao fornecedor
[023_provider_usage.sql:5-16](backend/src/db/migrations/023_provider_usage.sql:5)
`id` · `tenant_id` · `video_id` (nullable — consumo de voz não tem vídeo) · `provider` (`avatar|voice|script`) · `vendor` · `unit_type` (`seconds|characters|tokens_in|tokens_out`) · `unit_count numeric` · `rate_snapshot_cents_per_unit numeric` · `estimated_cost_cents numeric` · `created_at`.
Acrescentado: `requested_unit_count` + `unit_source` (`vendor_response|tts_timestamps|requested`) ([037:16-28](backend/src/db/migrations/037_real_duration.sql:16)); `aspect_ratio` + `resolution` + `provider_engine` ([038:57-60](backend/src/db/migrations/038_video_format_and_engine.sql:57)); `outcome` (`success|failed`) + `failure_reason` ([039:14-28](backend/src/db/migrations/039_usage_outcome.sql:14)).

### `provider_cost_rates` — tabela de tarifas
[022_provider_cost_rates.sql:7-16](backend/src/db/migrations/022_provider_cost_rates.sql:7)
`id` · `provider` · `vendor` · `unit_type` · `cost_per_unit_cents numeric` · `updated_at` · `updated_by_admin_user_id` · `UNIQUE(provider, vendor, unit_type)`.
A própria migração declara que os valores semeados são **placeholders de preço público, não verificados** ([:18-22](backend/src/db/migrations/022_provider_cost_rates.sql:18)). **Está fora do caminho de custo desde o bloco 4A** — ver B6.

### `credit_packages` — pacotes avulsos
[030_credit_packages.sql:7-16](backend/src/db/migrations/030_credit_packages.sql:7)
`id text PK` · `credit_type` · `quantity integer > 0` · `price_cents integer > 0` · `stripe_price_id` (preenchido preguiçosamente no primeiro checkout) · `active` · `created_at` · `updated_at`. Três linhas semeadas: `script_10` R$/US$ 19,90 · `video_10` 39,90 · `avatar_10` 59,90 ([:23-26](backend/src/db/migrations/030_credit_packages.sql:23)).

### `avatar_looks` (parcial — custo por linha)
[045_avatar_look_status.sql:13-23](backend/src/db/migrations/045_avatar_look_status.sql:13): `status` (`processing|completed|failed`) e **`cost_units integer`** — o que o fornecedor cobrou, guardado **por linha** e não derivado de constante, "porque a tarifa pode mudar, e um extrato que recalcula o passado com o preço de hoje deixa de ser extrato" ([:20-22](backend/src/db/migrations/045_avatar_look_status.sql:20)).

### Não existe
**Tabela de fatura, de recibo, de nota ou de evento de pagamento: NÃO EXISTE.** Nenhuma migração cria `invoices`, `payments`, `receipts` ou equivalente.

## B2 · Livro-razão append-only, ou campo de saldo mutável? — o ponto central

**Existem OS DOIS, por desenho, e a relação entre eles é declarada: o ledger é a fonte da verdade, o saldo é cache.**

- **`credit_ledger` é append-only.** Uma linha por movimento, com `delta` assinado. Não há `UPDATE` nem `DELETE` sobre ela em lugar nenhum do código — todas as ocorrências são `INSERT` ([creditGate.ts:107](backend/src/services/billing/creditGate.ts:107), [:193](backend/src/services/billing/creditGate.ts:193), [:336](backend/src/services/billing/creditGate.ts:336); [monthlyGrant.ts:104](backend/src/services/billing/monthlyGrant.ts:104)). A migração 024 a chama de "Immutable ledger" ([024:1](backend/src/db/migrations/024_credit_ledger.sql:1)).
- **`tenant_credits.balance` é mutável**, e é ele que o portão lê para decidir.
- **Os dois só se movem juntos.** `debitCredit` abre `BEGIN`, trava a linha com `SELECT ... FOR UPDATE`, faz `UPDATE ... balance = balance - $3` e o `INSERT` no ledger, e só então `COMMIT` — [creditGate.ts:71-130](backend/src/services/billing/creditGate.ts:71). O comentário em [:66-69](backend/src/services/billing/creditGate.ts:66) declara a invariante: "so the cached balance and the immutable ledger can never diverge if one write fails after the other". O mesmo padrão em `grantPurchasedCredit` ([:152-205](backend/src/services/billing/creditGate.ts:152)), `refundCredit` ([:259-345](backend/src/services/billing/creditGate.ts:259)) e `applyGrant` ([monthlyGrant.ts:61-110](backend/src/services/billing/monthlyGrant.ts:61)).
- **Há uma guarda que cobra isso:** mutante *"módulo novo mexe no saldo sem gravar ledger"*, em `checkRefundPolicy.ts`.

**`provider_usage` é o segundo livro-razão, e é independente do primeiro.** Também append-only, também "Immutable ledger" na migração ([023:1](backend/src/db/migrations/023_provider_usage.sql:1)), sem `UPDATE` em código — só o `INSERT` de `writeUsage` ([usageTracking.ts:111](backend/src/services/billing/usageTracking.ts:111)). Ele mede **unidades junto ao fornecedor**; o `credit_ledger` mede **crédito do cliente**. Os dois não se falam: um vídeo produz uma linha em cada, e elas não têm o mesmo denominador (1 crédito × N segundos).

**A única exceção histórica ao padrão** foi `tenants.credit_balance` (021), um saldo mutável **sem** ledger correspondente por tipo — e ela foi removida na 028.

## B3 · Onde o consumo é debitado hoje — antes ou depois da geração

**ANTES, sempre, nos quatro caminhos.** É decisão declarada: debitar depois abriria corrida ([checkRefundPolicy.ts:4-5](backend/src/scripts/checkRefundPolicy.ts:4)).

| Caminho | Débito | O que vem depois |
|---|---|---|
| Vídeo | [routes/videos.ts:797](backend/src/routes/videos.ts:797) | `generateVideo()` em [:822](backend/src/routes/videos.ts:822) |
| Roteiro | [routes/scripts.ts:29](backend/src/routes/scripts.ts:29) | chamada ao LLM |
| Treino de avatar | [routes/avatars.ts:317](backend/src/routes/avatars.ts:317) | `trainAvatar()` |
| Traje (look) | [services/avatar/looks.ts:152](backend/src/services/avatar/looks.ts:152) | `createAvatarLook()` |

**Ordem exata no caminho de vídeo** ([routes/videos.ts:659-948](backend/src/routes/videos.ts:659)): normalizar cena (:678) → derivar duração do roteiro (:690) → resolver formato (:698) → **portão de prontidão** (:704) → **teto diário** (:722) → `INSERT` em `videos` como `queued` (:753) → **`debitCredit`** (:797) → `generateVideo` (:822) → `UPDATE` com o job id (:853) → `pollJob` (:866).

**Quantidade debitada: 1 crédito por vídeo**, `amount ?? 1` ([creditGate.ts:72](backend/src/services/billing/creditGate.ts:72)), **independente da duração**. Um vídeo de 5 s e um de 60 s custam o mesmo crédito ao cliente, embora custem 15 e 180 unidades ao fornecedor.

**Em `fixture`, o débito vai para o balde de ensaio:** `contaDe(input.creditType)` escolhe a conta pelo modo, não pelo tipo ([creditGate.ts:74](backend/src/services/billing/creditGate.ts:74), [:42](backend/src/services/billing/creditGate.ts:42)), e a linha do ledger nasce com `simulated = true` — flag lida do modo, **nunca recebida como parâmetro**, para que nenhum chamador possa esquecê-la ([:100-104](backend/src/services/billing/creditGate.ts:100)).

## B4 · Estorno

**EXISTE**, em `refundCredit()` — [creditGate.ts:259-345](backend/src/services/billing/creditGate.ts:259). Chamado em quatro pontos, todos dentro do `catch` da chamada ao fornecedor:

| Chamador | Linha |
|---|---|
| Vídeo | [routes/videos.ts:883](backend/src/routes/videos.ts:883) |
| Roteiro | [routes/scripts.ts:56](backend/src/routes/scripts.ts:56) |
| Treino de avatar | [routes/avatars.ts:346](backend/src/routes/avatars.ts:346) |
| Traje | [services/avatar/looks.ts:184](backend/src/services/avatar/looks.ts:184) |

**Proteções:**
- **Exatamente uma referência** por estorno — `if (references.length !== 1) return { refunded: false, reason: "no_reference" }` ([creditGate.ts:270](backend/src/services/billing/creditGate.ts:270)).
- **Só estorna o que foi consumido:** procura a linha de consumo pela referência, `WHERE reason = 'consumption' AND ${column} = $1` ([:293](backend/src/services/billing/creditGate.ts:293)).
- **Nunca duas vezes:** `SELECT 1 FROM credit_ledger WHERE reason = 'refund' AND ${column} = $1` sob `FOR UPDATE` ([:300-310](backend/src/services/billing/creditGate.ts:300)), e **três índices únicos parciais no banco** cobrindo o que o lock não cobre — um caminho novo que esqueça a checagem, e o dia em que houver mais de uma réplica ([035:24-34](backend/src/db/migrations/035_credit_ledger_refund_reason.sql:24)). A migração nomeia o risco: "crédito devolvido duas vezes é dinheiro criado do nada, e é o tipo de erro que ninguém reclama".
- **Motivo próprio no ledger** (`refund`, não um `consumption` positivo), para que um relatório de consumo não some débito e estorno e mostre zero ([035:1-8](backend/src/db/migrations/035_credit_ledger_refund_reason.sql:1)).
- **A conta é a do LANÇAMENTO, não a do modo atual** — mutante *"o estorno volta a escolher a conta pelo modo atual"* (`checkRehearsalCreditPolicy.ts`).

**A FRONTEIRA, e é onde o estorno para:** vale **só antes do aceite do fornecedor**. Assim que `generateVideo()` devolve um `providerJobId`, o trabalho está enfileirado lá e a cota foi consumida — falha de polling, artefato inválido ou download quebrado **não estornam** ([routes/videos.ts:876-882](backend/src/routes/videos.ts:876)). Confirmado por leitura dos caminhos de falha do polling: [videos.ts:66-89](backend/src/routes/videos.ts:66) (artefato rejeitado), [:178-198](backend/src/routes/videos.ts:178) (erro do fornecedor), [:202-219](backend/src/routes/videos.ts:202) (exceção no laço), [:220-246](backend/src/routes/videos.ts:220) (timeout) — **nenhum dos quatro chama `refundCredit`**. Cada um grava linha `failed` em `provider_usage` e nada mais.

## B5 · Teto, limite ou cota por usuário/tenant

Seis camadas, e é importante que **duas delas não são por tenant**:

| # | Camada | Escopo | Onde | Momento |
|---|---|---|---|---|
| 1 | Saldo de crédito (`tenant_credits`) | **por tenant, por tipo** | [creditGate.ts:85-89](backend/src/services/billing/creditGate.ts:85) | antes da chamada |
| 2 | Limite mensal do plano (`plans.video_limit_per_month` e as duas irmãs) | **por tenant** | não é um freio: alimenta a **concessão** mensal ([monthlyGrant.ts:74-86](backend/src/services/billing/monthlyGrant.ts:74)) e a exibição em [routes/subscription.ts:44](backend/src/routes/subscription.ts:44) | mensal |
| 3 | Status do tenant (`suspended`) | **por tenant** | [middleware/requireActiveTenant.ts:14-19](backend/src/middleware/requireActiveTenant.ts:14) | antes de tudo |
| 4 | Teto diário de gerações pagas | **da INSTALAÇÃO inteira, não do tenant** | [dailyGenerationLimit.ts:85-103](backend/src/services/billing/dailyGenerationLimit.ts:85) | antes do débito ([videos.ts:724](backend/src/routes/videos.ts:724)) |
| 5 | Teto de sessão `live` (gerações e tentativas) | **do processo** | [liveGuard.ts:43-64](backend/src/services/providers/liveGuard.ts:43) | dentro da chamada |
| 6 | Confirmação de roteiro longo (> 60 s × margem 1,10) | por requisição | [scriptDuration.ts:94](backend/src/services/video/scriptDuration.ts:94), [:110](backend/src/services/video/scriptDuration.ts:110) | antes do clique |

**O limite do plano NÃO é aplicado como freio.** A busca por `video_limit_per_month`/`videoLimitPerMonth` em todo o backend devolve apenas: a definição do tipo e a leitura em `plans.ts`, o CRUD do painel admin (`adminPanel.ts:462-539`), a exibição em `subscription.ts:44`, e a guarda de documentação em `checkPolicy.ts:142`. **Nenhuma comparação com contagem de vídeos gerados.** O limite do plano vira **saldo** uma vez por mês (semântica de *reset*: `balance` passa a ser exatamente `planLimit`, [monthlyGrant.ts:78-86](backend/src/services/billing/monthlyGrant.ts:78)), e o que freia dali em diante é o saldo.

**Duas observações sobre o teto diário (#4), que é o único freio de gasto real por dia:**
- **Conta a instalação, não o tenant** — declarado em [dailyGenerationLimit.ts:80-84](backend/src/services/billing/dailyGenerationLimit.ts:80): "a chave do fornecedor é uma só e a carteira é uma só. Um teto por tenant deixaria dez tenants gastarem dez vezes o limite da mesma conta."
- **Conta vídeos E trajes no mesmo balde** ([:93-101](backend/src/services/billing/dailyGenerationLimit.ts:93)), pelo mesmo motivo.
- **Lança em vez de devolver booleano**, de propósito: "um valor de retorno pode ser ignorado por descuido num `if` esquecido, e o que está do outro lado é dinheiro real" ([:118-122](backend/src/services/billing/dailyGenerationLimit.ts:118)).

## B6 · Registra CUSTO em dinheiro, ou só contagem de unidades?

**As duas coisas, em lugares diferentes — e a coluna que gravava dinheiro foi deliberadamente abandonada.**

**O que é gravado no banco: UNIDADES.**
`provider_usage` grava `unit_count` (segundos, caracteres, tokens) e `requested_unit_count`, com `unit_source` dizendo de onde veio o número ([usageTracking.ts:111-125](backend/src/services/billing/usageTracking.ts:111)). `avatar_looks.cost_units` grava unidades do fornecedor por traje ([045:23](backend/src/db/migrations/045_avatar_look_status.sql:23)).

**A coluna de dinheiro existe no schema e não é mais alimentada pelo caminho de custo.**
`provider_usage.estimated_cost_cents` e `rate_snapshot_cents_per_unit` ([023:13-14](backend/src/db/migrations/023_provider_usage.sql:13)) foram criadas para congelar `taxa × unidades`. O comentário de `recordProviderUsage` declara a mudança do bloco 4A ([usageTracking.ts:39-61](backend/src/services/billing/usageTracking.ts:39)): **"O CUSTO NÃO É GRAVADO AQUI"** — porque a taxa estava errada (US$ 0,03/s contra US$ 0,045/s medido) **e** multiplicava a duração pedida, não a entregue; os dois erros na mesma conta deram **4,5× de desvio**, com o número saindo na tela "com cara de fato". O `INSERT` atual ([:111-125](backend/src/services/billing/usageTracking.ts:111)) **não lista** nenhuma das duas colunas de custo.

**O dinheiro é DERIVADO na leitura, a partir de uma medição real.**
[services/billing/providerCost.ts](backend/src/services/billing/providerCost.ts):
- `HEYGEN_VIDEO_COST` ([:81-97](backend/src/services/billing/providerCost.ts:81)) — `unitsPerDollar: 60`, `unitsPerBilledSecond: 3`, com `measuredUnder`, `measuredOn` e `method` (três gerações reais: 3,372 s → 9 un, 16,972 s → 48, 33,696 s → 99).
- `USD_PER_BILLED_SECOND` ([:105-106](backend/src/services/billing/providerCost.ts:105)) — **derivado**, `3/60`, nunca digitado, "se este número fosse uma constante própria, alguém poderia mudar `unitsPerBilledSecond` e deixar o dólar para trás".
- `billedSecondsFor()` ([:120-123](backend/src/services/billing/providerCost.ts:120)) — `Math.floor`, porque a cobrança é por segundo inteiro.
- `costFor()`, `estimateVideoCost()`, `costDifference()`, `costBasisNote()` e `HEYGEN_LOOK_COST` ([:163](backend/src/services/billing/providerCost.ts:163), [:203](backend/src/services/billing/providerCost.ts:203), [:264](backend/src/services/billing/providerCost.ts:264), [:278](backend/src/services/billing/providerCost.ts:278), [:230](backend/src/services/billing/providerCost.ts:230)).
- **Ausência nunca vira zero:** o tipo é `CostKnown | CostUnknown` com `CostAbsenceReason` ([:126-152](backend/src/services/billing/providerCost.ts:126)) — "Nunca é zero — zero seria mentira".

**Onde o dinheiro aparece:** `GET /videos/:id/cost` devolve estimado e real lado a lado com a diferença ([routes/videos.ts:502-578](backend/src/routes/videos.ts:502)); `GET /dashboard-summary` soma o mês **só do que foi medido** e informa quantas linhas ficaram de fora, devolvendo `null` (não 0) se nada foi medido ([videos.ts:468-486](backend/src/routes/videos.ts:468)).

**Custo em REAL (BRL): NÃO EXISTE.** Todo custo de fornecedor é em dólar. `price_cents` em `plans` e `credit_packages` é um inteiro de centavos **sem moeda declarada** em nenhuma das duas migrações.

**Guardas que cobram isso:** *"número de custo reaparece fora da constante"*, *"consumo sem medição passa a valer zero"*, *"estimativa volta a ser calculada sobre a duração fracionária"*, *"a truncagem sai dos segundos e vai para o total em dólar"*, *"o custo do traje vira número digitado"*.

---

# C · O CICLO DE VIDA DE UM VÍDEO

## C1 · Estados possíveis e onde cada um é escrito

**Quatro valores literais, fixados pelo banco:**
[002_videos.sql:8-9](backend/src/db/migrations/002_videos.sql:8) — `status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'error'))`. Nenhuma migração posterior alterou esse `CHECK`.

| Estado | Onde é escrito | Contexto |
|---|---|---|
| **`queued`** | `INSERT` sem coluna `status` — vale o `DEFAULT` — [routes/videos.ts:753-757](backend/src/routes/videos.ts:753) | nascimento da linha |
| **`processing`** | [videos.ts:200](backend/src/routes/videos.ts:200) — `UPDATE videos SET status = 'processing'` | **só na 1ª iteração do polling** (`else if (attempts === 1)`), e só se o fornecedor não devolveu nem `ready` nem `error` |
| **`ready`** | [videos.ts:130](backend/src/routes/videos.ts:130) — junto com `output_url` e `provider_output_url` | polling, **depois** de validar o artefato ([:64-66](backend/src/routes/videos.ts:64)) e tentar persisti-lo ([:107](backend/src/routes/videos.ts:107)) |
| **`error`** | **sete lugares** — ver abaixo | |

**Os sete pontos que escrevem `error`:**

| # | Linha | Gatilho | Estornou? | Deixou linha em `provider_usage`? |
|---|---|---|---|---|
| 1 | [videos.ts:804](backend/src/routes/videos.ts:804) | crédito insuficiente (`'Insufficient credits'`) | não houve débito | não |
| 2 | [videos.ts:898](backend/src/routes/videos.ts:898) | `LiveBudgetExhaustedError` — teto nosso, nenhuma chamada saiu | **sim** ([:883](backend/src/routes/videos.ts:883)) | não |
| 3 | [videos.ts:906](backend/src/routes/videos.ts:906) | fornecedor recusou antes do aceite | **sim** ([:883](backend/src/routes/videos.ts:883)) | sim ([:914](backend/src/routes/videos.ts:914)) |
| 4 | [videos.ts:68](backend/src/routes/videos.ts:68) | artefato inválido (`ready` do fornecedor sem vídeo utilizável) | **não** | sim ([:78](backend/src/routes/videos.ts:78)) |
| 5 | [videos.ts:181](backend/src/routes/videos.ts:181) | fornecedor devolveu `status: "error"` no polling | **não** | sim ([:186](backend/src/routes/videos.ts:186)) |
| 6 | [videos.ts:206](backend/src/routes/videos.ts:206) | exceção dentro do laço de polling | **não** | sim ([:208](backend/src/routes/videos.ts:208)) |
| 7 | [videos.ts:224](backend/src/routes/videos.ts:224) | timeout — 90 tentativas; **único com guarda `AND status != 'ready'`** | **não** | condicional ao `rowCount` ([:233](backend/src/routes/videos.ts:233)) |

**O caminho 7 é o único que protege contra sobrescrever um estado terminal.** Os outros seis fazem `UPDATE ... WHERE id = $1` sem olhar o estado atual. O `rowCount` em [:233](backend/src/routes/videos.ts:233) existe para não gravar uma falha ao lado de um sucesso — comentado em [:229-232](backend/src/routes/videos.ts:229).

**Tabelas vizinhas com máquina de estados própria** (não confundir):
- `video_variants.status` — `pending|ready|error`, DEFAULT `'ready'` ([041:46](backend/src/db/migrations/041_video_variants.sql:46)); escrito em [deriveVariants.ts:276](backend/src/services/video/deriveVariants.ts:276), que **não tem chamador de produto**.
- `avatar_looks.status` — `processing|completed|failed`, DEFAULT `'completed'` ([045:13-15](backend/src/db/migrations/045_avatar_look_status.sql:13)); `failed` é terminal e **não some da lista**, porque o look foi pago ([045:10-12](backend/src/db/migrations/045_avatar_look_status.sql:10)).
- `avatars` — status próprio, normalizado em [avatarProvider.ts:91](backend/src/services/providers/avatarProvider.ts:91).

## C2 · A máquina de estados que o código realmente implementa

```
                          POST /videos  (routes/videos.ts:659)
                                  │
             ┌────────────────────┴────────────────────┐
             │  recusas ANTES da linha existir          │  (nada é gravado)
             │  · readiness            :709             │
             │  · teto diário → 429    :727             │
             └────────────────────┬────────────────────┘
                                  ▼
                       INSERT videos  :753
                                  │
                                  ▼
                          ┌──────────────┐
                          │   queued     │  ← DEFAULT do banco (002:8)
                          └──────┬───────┘
                                 │
                  debitCredit :797
                                 │
              ┌──────────────────┼─────────────────────┐
              │ sem saldo        │ com saldo           │
              ▼ :804             ▼                     │
          ┌───────┐      generateVideo() :822          │
          │ error │              │                     │
          └───────┘   ┌──────────┼──────────┐          │
       (sem débito)   │ exceção  │ ok       │          │
                      ▼          ▼          │          │
              refundCredit :883  UPDATE job_id :853    │
                      │              │                 │
          ┌───────────┴──┐           ▼                 │
          │ teto :898    │      pollJob() :866  ────────┘
          │ vendor :906  │      setInterval 5 s, ≤ 90×
          ▼              ▼           │
       ┌───────┐    ┌───────┐        │
       │ error │    │ error │        │
       └───────┘    └───────┘        │
      (ESTORNADO)  (ESTORNADO)       │
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │ 1ª iteração e "nem pronto  │                            │
        │  nem erro"  :200           │                            │
        ▼                            │                            │
  ┌────────────┐                     │                            │
  │ processing │─────────────────────┤                            │
  └────────────┘                     │                            │
        │                            │                            │
        │   result.status="ready"    │   result.status="error"    │  attempts ≥ 90
        ▼                            ▼                            ▼
  probeArtifact + validate :64   toClientVendorError :180    timeout :220
        │                            │                            │
   ┌────┴────┐                       ▼                            ▼
   │ inválido│                  ┌───────┐                    ┌───────┐
   ▼ :68     │ válido           │ error │                    │ error │
┌───────┐    │                  └───────┘                    └───────┘
│ error │    ▼                (SEM estorno)      (SEM estorno; único com
└───────┘  persistRemoteArtifact :107             AND status != 'ready')
(SEM        │  falha aqui NÃO derruba: cai
 estorno)   │  na URL do fornecedor :118
            ▼
      ┌───────────┐
      │   ready   │  :130  → notificação :133 → recordProviderUsage :161
      └───────────┘
```

**Propriedades reais desta máquina, não as desejadas:**
1. **`processing` é opcional.** Só é escrito se a **primeira** iteração encontrar o job ainda em andamento ([:199-201](backend/src/routes/videos.ts:199)). Um job que fica pronto antes dos primeiros 5 s vai de `queued` direto a `ready`. Um job que fica pronto na iteração 2 e não na 1 passa por `processing`; se a iteração 1 já devolvesse `ready`, não passaria.
2. **Não há transição de `error` para lugar nenhum.** `error` é terminal, e não há caminho de retomada — "gerar novamente" cria **outra linha** de `videos`.
3. **`ready` pode ser sobrescrito.** Seis dos sete `UPDATE ... status='error'` não olham o estado atual. Na prática o `clearInterval` que precede cada um torna a corrida improvável dentro do mesmo laço, mas **não há proteção estrutural** — apenas em [:224](backend/src/routes/videos.ts:224).
4. **A validação do artefato acontece DEPOIS de o fornecedor dizer `ready`, e é ela que decide.** "Pronto segundo o fornecedor" não é estado nosso ([:59-63](backend/src/routes/videos.ts:59)).
5. **`error` significa cinco coisas financeiramente diferentes** (nunca cobrado / cobrado e estornado / cobrado e não estornado / cobrado, entregue e inutilizável / desconhecido). O que distingue é a linha em `provider_usage` e a linha `refund` em `credit_ledger`, não o campo `status`.

## C3 · Se o processo morrer exatamente ali

| Estado no instante da morte | O que acontece | Recuperável? |
|---|---|---|
| **Antes do `INSERT`** (:753) | Nada foi gravado. Nada foi debitado. Nada foi chamado. | **Nada a recuperar** |
| **`queued`, antes de `debitCredit`** (entre :753 e :797) | Linha existe, sem débito, sem job id, sem chamada. | **ÓRFÃ PARA SEMPRE** — nada a varre. Financeiramente inofensiva |
| **`queued`, dentro de `debitCredit`** (:797) | A transação é atômica: ou `COMMIT` (saldo e ledger juntos) ou nada. `ROLLBACK` no `catch` e `client.release()` no `finally` ([creditGate.ts:124-129](backend/src/services/billing/creditGate.ts:124)). Uma conexão perdida deixa a transação sem commit, e o Postgres a aborta | **Consistente por construção**; a linha de `videos` fica órfã em `queued` |
| **`queued`, débito feito, `generateVideo()` em voo** (:822) | **O pior caso.** Crédito debitado. A chamada pode ter chegado ao fornecedor — e se chegou, ele renderiza e cobra. Sem `providerJobId` gravado, **não há como saber qual job é** | **PERDIDO E SEM RASTRO.** O único vestígio é `Idempotency-Key` do lado do fornecedor, calculável de novo a partir da linha ([avatarProvider.ts:421-445](backend/src/services/providers/avatarProvider.ts:421)) — mas nada no código faz isso |
| **`queued`, entre o retorno de `generateVideo` e o `UPDATE`** (:848→:853) | Job aceito no fornecedor; `provider_job_id` **não gravado**. | **PERDIDO** — mesmo caso acima, com o agravante de que o vídeo com certeza será renderizado e cobrado |
| **`queued`, job id gravado, antes de `pollJob`** (:865→:866) | `provider_job_id` **está no banco**. O laço nunca começou. | **RECONCILIÁVEL EM TESE** — a informação está toda lá; **na prática fica em `queued` para sempre**, porque nada retoma |
| **`queued`/`processing`, polling em andamento** | O `setInterval` morre com o processo ([videos.ts:52](backend/src/routes/videos.ts:52)). O fornecedor termina de renderizar e cobra. A linha congela | **RECONCILIÁVEL EM TESE** (tem job id), **ÓRFÃ NA PRÁTICA** |
| **`processing`, entre `probeArtifact` e o `UPDATE ready`** (:64→:130) | O vídeo existe no fornecedor e foi validado; nada foi gravado | **ÓRFÃ** — com job id, reconciliável em tese |
| **`processing`, dentro de `persistRemoteArtifact`** (:107) | Pode restar arquivo parcial em `uploads/<tenant>/`. A linha continua sem `output_url` | **ÓRFÃ**, e com **lixo em disco** — nada limpa |
| **`ready` gravado, antes de `recordProviderUsage`** (:130→:161) | O cliente **vê e baixa o vídeo**. Não há linha de consumo | **VÍDEO OK, CONTABILIDADE FALTANDO** — o custo some do `dashboard-summary` e de `GET /videos/:id/cost`, que passa a devolver `actual: null` |
| **`ready` completo** | Terminal. | **Nada a recuperar** |
| **`error` já gravado** | Terminal. | **Nada a recuperar** |

**Duas observações estruturais:**
- **`recordProviderUsage` nunca lança** — é telemetria e "não pode derrubar a ação do usuário" ([usageTracking.ts:59-61](backend/src/services/billing/usageTracking.ts:59)). Um `INSERT` que falhe produz exatamente a mesma lacuna da linha "ready sem consumo" acima, sem processo nenhum morrer.
- **Nada no boot varre linhas presas.** [index.ts:36-47](backend/src/index.ts:36) faz: `assertLiveModeAuthorized`, `runMigrations`, `buildApp`, `startMonthlyGrantScheduler`, `listen`. Não há varredura de `videos` em estado não-terminal.

## C4 · Campo com identificador do fornecedor

**EXISTE, e há mais de um.**

| Campo | Migração | O que guarda |
|---|---|---|
| **`videos.provider_job_id text`** | [016:1](backend/src/db/migrations/016_video_provider_job.sql:1) | O id do job no fornecedor (`data.video_id` da HeyGen, [avatarProvider.ts:640](backend/src/services/providers/avatarProvider.ts:640)). **É a chave de reconciliação.** Gravado em [videos.ts:853-865](backend/src/routes/videos.ts:853) |
| `videos.provider_vendor text` | [016:2](backend/src/db/migrations/016_video_provider_job.sql:2) | Qual fornecedor — sem isso o job id é ambíguo |
| `videos.provider_output_url text` | [040:20](backend/src/db/migrations/040_local_artifact.sql:20) | URL assinada do fornecedor, guardada **só para rastreio**; o comentário diz que é "o único vínculo com o job que a produziu, e descartá-la tornaria impossível reconciliar uma fatura depois" ([040:17-19](backend/src/db/migrations/040_local_artifact.sql:17)) |
| `videos.provider_engine` / `provider_engine_reason` | [038:35-36](backend/src/db/migrations/038_video_format_and_engine.sql:35) | Motor enviado e por quê |
| `avatars.provider_avatar_id` | 001 | Id do avatar no fornecedor |
| `avatar_looks` + `cost_units` | 044, [045:23](backend/src/db/migrations/045_avatar_look_status.sql:23) | Id do look e o que ele custou |

**Três limitações medidas por leitura:**
1. **`provider_job_id` não tem índice.** Nenhuma migração cria índice sobre ele — uma reconciliação por job id varreria a tabela.
2. **Ele só existe depois de a chamada voltar.** A janela entre o `POST` ao fornecedor e o `UPDATE` de [:853](backend/src/routes/videos.ts:853) é exatamente o buraco descrito em C3.
3. **`provider_usage` NÃO guarda o job id.** As colunas são as de [023](backend/src/db/migrations/023_provider_usage.sql:5) + [037](backend/src/db/migrations/037_real_duration.sql:16) + [038](backend/src/db/migrations/038_video_format_and_engine.sql:57) + [039](backend/src/db/migrations/039_usage_outcome.sql:14); o vínculo com o fornecedor é indireto, por `video_id` — que é `ON DELETE SET NULL` ([023:8](backend/src/db/migrations/023_provider_usage.sql:8)). Apagado o vídeo, a linha de consumo perde qualquer ponte com o fornecedor.

**`Idempotency-Key` é um quarto identificador, e não é guardado em lugar nenhum** — é recalculável do conteúdo da linha ([avatarProvider.ts:421-445](backend/src/services/providers/avatarProvider.ts:421)), mas nenhuma coluna o registra.

## C5 · Quantos registros podem ficar em estado não-terminal para sempre

**Não há limite: um por geração interrompida, sem teto e sem varredura.** Nenhum processo, cron ou consulta reclassifica linha presa — a única leitura que as enxerga é `GET /jobs/processing` ([routes/jobs.ts:20-24](backend/src/routes/jobs.ts:20)), que **lista** `queued` e `processing` sem agir sobre eles.

**Os caminhos, em ordem de probabilidade:**

1. **Morte do processo com polling em andamento.** O caminho comum: `restart backend`, `docker compose up -d`, deploy, ou desligar a máquina. Toda linha `queued`/`processing` com `setInterval` vivo congela. **Uma linha por geração em voo naquele instante.**
2. **Morte entre `debitCredit` (:797) e o `UPDATE` do job id (:853).** Fica `queued` **sem job id** — presa e **não reconciliável**, porque falta a chave.
3. **Morte entre o `UPDATE` do job id (:865) e o `pollJob` (:866).** Fica `queued` **com** job id — presa, reconciliável em tese.
4. **Exceção não capturada dentro do laço, depois do `clearInterval`.** O `catch` de [:202-219](backend/src/routes/videos.ts:202) chama `clearInterval` em [:204](backend/src/routes/videos.ts:204) e depois grava `error` com `.catch(() => {})` em [:207](backend/src/routes/videos.ts:207) — **se esse `UPDATE` falhar, o erro é engolido e o laço já foi cancelado**. A linha fica presa em `queued`/`processing` e nada mais tenta.
5. **Mesma forma no timeout:** [:223-228](backend/src/routes/videos.ts:223) usa `.catch(() => ({ rowCount: 0 }))`. Falha do banco ali → `rowCount` 0 → nenhuma linha de consumo e nenhuma mudança de estado, com o laço já cancelado em [:221](backend/src/routes/videos.ts:221).
6. **Falha do `UPDATE ready` (:129) com o artefato já validado e persistido.** Sem `.catch`, a exceção sobe para o `catch` do laço ([:202](backend/src/routes/videos.ts:202)) e vira `error` — mas o vídeo existe e foi pago. Não fica não-terminal; fica **terminal com o rótulo errado**.
7. **Vídeos anteriores à existência do polling atual, ou de qualquer processo já morto.** Quantos existem hoje é NÃO VERIFICADO — exigiria consultar o banco.

**A consequência financeira, declarada no próprio código** ([videos.ts:876-882](backend/src/routes/videos.ts:876)): em todos os casos de 1 a 5, o crédito **já foi debitado** e **não será estornado**, porque o estorno só vale antes do aceite do fornecedor — e nesses caminhos o aceite ou já ocorreu ou é desconhecido.

---

# D · AS 29 GUARDAS, CLASSIFICADAS

Todas em `backend/src/scripts/`, executadas por `checkPolicy.ts` via `npm run check`. Os nomes de `guard:` de cada arquivo estão no relatório anterior; aqui vai a função de cada arquivo.

## D1 · As 29, uma linha cada

| # | Arquivo | O que protege |
|---|---|---|
| 1 | `checkCloneSampleFormatPolicy.ts` | A amostra que vai para a clonagem não pode ter perda — provado convertendo, não lendo código |
| 2 | `checkCostPolicy.ts` | Custo tem um número só e ele é medido; ausência nunca vira zero; o log não vaza; endpoint tarifável novo entra no freio sozinho |
| 3 | `checkDerivationPolicy.ts` | Na derivação de formato, o sujeito nunca é cortado nem ampliado (só o fundo desfocado pode); o master vem do nosso disco |
| 4 | `checkDocsInternalPolicy.ts` | O histórico de engenharia (`docs-internal/`) não alcança copiloto nenhum — provado por execução do carregador |
| 5 | `checkEnvironmentPolicy.ts` | Serviço do Compose sem restart ou healthcheck; variável lida pelo código e não repassada ao container; autofill/galeria/limiter frouxos em produção |
| 6 | `checkGenerationReadinessPolicy.ts` | O botão da tela e a recusa da rota usam o MESMO predicado, com os mesmos bloqueios |
| 7 | `checkImageFreshnessPolicy.ts` | A imagem do frontend em execução corresponde ao repositório (arquivos fora do bind mount) |
| 8 | `checkLegacyEndpointPolicy.ts` | Nenhuma chamada v2 fora do inventário datado; traje sumido do fornecedor para de ser "em preparo" eterno |
| 9 | `checkLiveBudgetPolicy.ts` | O teto de operações tarifadas conta voz e vídeo juntas, a mensagem diz o que consumiu, a falha devolve o gasto e a tentativa não volta |
| 10 | `checkNativeBatchPolicy.ts` | No lote nativo, N gerações = N débitos = N unidades de teto; nativo é gerado, nunca reaproveitado |
| 11 | `checkNetworkEgressPolicy.ts` | Todo cliente HTTP do backend respeita o modo; todo host de fornecedor está no catálogo; o freio deriva do catálogo |
| 12 | `checkOutfitPolicy.ts` | Criar traje passa pelo teto diário, em preparo não é escolhível, o custo declarado é o medido, a espera cobre o preparo |
| 13 | `checkPaddingPolicy.ts` | A sonda enxerga a barra do fornecedor, mede o conteúdo e não o quadro, e o recorte nunca avança sobre a imagem |
| 14 | `checkPlatformKeyPolicy.ts` | Nenhum caminho devolve chave de plataforma em claro; o probe é somente leitura; credenciais distintas em variáveis distintas |
| 15 | `checkPolicy.ts` | Exposição de documentação: classificação, deny-list, promessa falsa, limites de plano citados, tamanho de prompt, erro de vendor sanitizado |
| 16 | `checkPollPolicy.ts` | "Concluído sem artefato" falha na hora, e a mensagem não induz a esperar estorno |
| 17 | `checkPreflightSummaryPolicy.ts` | A tela mostra os seis campos do que vai ser enviado antes de o dinheiro sair; traje em preparo trava o Avançar |
| 18 | `checkProviderPolicy.ts` | `fixture` com `NODE_ENV=production`; `live` sem a frase de autorização; vendor que consulta o modo e ignora; flag inexistente |
| 19 | `checkRecordingGuidancePolicy.ts` | Durante a gravação, a META aparece (não só o teto), a mínima é > 0, e as três faixas são distinguidas |
| 20 | `checkRefundPolicy.ts` | Toda rota que debita, estorna; o banco admite `reason='refund'`; ninguém mexe no saldo sem gravar ledger |
| 21 | `checkRehearsalCreditPolicy.ts` | Ensaio em `fixture` não toca o saldo real: débito, portão e estorno usam a conta certa |
| 22 | `checkSpendControlPolicy.ts` | O teto diário não é contornável; o portão de roteiro longo mantém a margem; os cinco controles de cena chegam ao payload |
| 23 | `checkStepOneFlowPolicy.ts` | A ordem de leitura do passo 1; caminho rápido não regride; pendências vêm do servidor e não são recalculadas na tela |
| 24 | `checkVendorErrorPathPolicy.ts` | Recusa do fornecedor não volta como 201; 400 interrompe o caminho; o corpo vai ao log; a máscara é em profundidade |
| 25 | `checkVendorLogPolicy.ts` | Toda função com `fetch` a fornecedor registra a resposta bruta, e o helper que registra não pode estar vazio |
| 26 | `checkVideoContractPolicy.ts` | O corpo e os headers de `POST /v3/videos`: traje chega, fundo manda remover o original, o quadro é preenchido, a chave de idempotência é da tentativa, nenhum campo fora do schema |
| 27 | `checkVideoFormatPolicy.ts` | Nenhuma geração chega ao fornecedor sem proporção e resolução explícitas; suporte declarado precisa de evidência |
| 28 | `checkVideoPlaybackPolicy.ts` | A Biblioteca reproduz (não só baixa), respeita a proporção, e todo player avisa quando é simulação |
| 29 | `checkVoiceSamplePolicy.ts` | Captura e clonagem de voz: porta estreita da voz protegida, duração mínima, slots do fornecedor, formato e tamanho, ids no log |

## D2 · DINHEIRO ou CORREÇÃO

Critério aplicado: **DINHEIRO** = a guarda existe porque quebrá-la faz sair, entrar ou sumir valor (gasto no fornecedor, saldo do cliente, duplicidade de cobrança). **CORREÇÃO** = formato, validação, dados, exposição.

### DINHEIRO — 13 guardas

| Guarda | Por quê |
|---|---|
| `checkCostPolicy.ts` | O número que o produto afirma sobre custo (2 dos 4 blocos são de log/catálogo — o de catálogo também é dinheiro: freio de endpoint tarifável) |
| `checkLiveBudgetPolicy.ts` | O teto de operações tarifadas e a devolução do gasto |
| `checkSpendControlPolicy.ts` | Teto diário e portão de roteiro longo — o instante entre o clique e a cobrança |
| `checkRefundPolicy.ts` | O crédito volta quando o fornecedor recusa |
| `checkRehearsalCreditPolicy.ts` | Ensaio não consome saldo pago |
| `checkNativeBatchPolicy.ts` | N gerações = N débitos = N unidades de teto |
| `checkOutfitPolicy.ts` | Traje custa US$ 1,00 medido; teto, custo declarado e "não recrie" |
| `checkNetworkEgressPolicy.ts` | Impede chamada tarifada sair sem passar pelo modo |
| `checkProviderPolicy.ts` | `live` sem autorização e `fixture` cobrado — os dois são dinheiro, em direções opostas |
| `checkVideoContractPolicy.ts` | **Parcialmente** — a idempotência é anti-duplicidade (dinheiro); traje/fundo/`fit`/schema são correção |
| `checkVoiceSamplePolicy.ts` | **Parcialmente** — slot de voz é irreversível e a clonagem é tarifada; formato e bytes são correção |
| `checkPreflightSummaryPolicy.ts` | O que a tela diz **antes de o dinheiro sair**; a trava do traje em preparo |
| `checkLegacyEndpointPolicy.ts` | **Parcialmente** — o traje pago que fica eterno é dinheiro; o inventário v2 é correção |

### CORREÇÃO — 16 guardas

`checkCloneSampleFormatPolicy.ts` (formato de áudio) · `checkDerivationPolicy.ts` (geometria) · `checkDocsInternalPolicy.ts` (exposição) · `checkEnvironmentPolicy.ts` (ambiente e acesso) · `checkGenerationReadinessPolicy.ts` (coerência tela/rota) · `checkImageFreshnessPolicy.ts` (imagem vs. repositório) · `checkPaddingPolicy.ts` (medição de quadro) · `checkPlatformKeyPolicy.ts` (segredo — segurança, não dinheiro) · `checkPolicy.ts` (documentação e prompt) · `checkPollPolicy.ts` (contrato de polling) · `checkRecordingGuidancePolicy.ts` (orientação na tela) · `checkStepOneFlowPolicy.ts` (fluxo de tela) · `checkVendorErrorPathPolicy.ts` (código HTTP e log) · `checkVendorLogPolicy.ts` (rastro) · `checkVideoFormatPolicy.ts` (proporção explícita) · `checkVideoPlaybackPolicy.ts` (reprodução).

**Fronteiras que este corte não resolve, e ficam declaradas:** `checkPlatformKeyPolicy` protege uma chave que, vazada, produz gasto de terceiro — classifiquei como correção porque o vetor é exposição, não a nossa carteira. `checkVideoFormatPolicy` fica em correção, embora um vídeo entregue no formato errado seja um vídeo pago e inútil. `checkPollPolicy` fica em correção, embora o mutante *"mensagem perde a menção a estorno"* seja sobre expectativa financeira.

## D3 · Para as de dinheiro: impedem ANTES, ou só detectam depois?

Distinção necessária: as guardas **não rodam em produção** — rodam no `npm run check`, no desenvolvimento. Nenhuma delas impede gasto em tempo de execução. **O que elas impedem é que o mecanismo que impede o gasto seja desfeito.** A pergunta é, então: **o mecanismo protegido age antes do gasto ou depois?**

| Guarda | O mecanismo protegido age... | Evidência |
|---|---|---|
| `checkSpendControlPolicy` | **ANTES** — teto diário roda antes do débito e de qualquer chamada | [videos.ts:722-736](backend/src/routes/videos.ts:722); [dailyGenerationLimit.ts:118-133](backend/src/services/billing/dailyGenerationLimit.ts:118) |
| `checkLiveBudgetPolicy` | **ANTES** de cada operação tarifada — mas **DEPOIS** do débito de crédito: o `LiveBudgetExhaustedError` já vem com estorno | [videos.ts:896-903](backend/src/routes/videos.ts:896) |
| `checkProviderPolicy` | **ANTES, no boot** — em `live` sem autorização o processo não sobe | [index.ts:40](backend/src/index.ts:40) |
| `checkNetworkEgressPolicy` | **ANTES** — desvia para fixture no ponto de saída | [providerMode.ts](backend/src/services/providers/providerMode.ts) |
| `checkRehearsalCreditPolicy` | **ANTES** — a conta é escolhida no próprio débito | [creditGate.ts:74](backend/src/services/billing/creditGate.ts:74) |
| `checkPreflightSummaryPolicy` | **ANTES** — o resumo e a trava são anteriores ao clique | tela |
| `checkVideoContractPolicy` (idempotência) | **ANTES** — o header impede o segundo vídeo do duplo clique | [avatarProvider.ts:455-467](backend/src/services/providers/avatarProvider.ts:455) |
| `checkVoiceSamplePolicy` (slots, duração, proteção) | **ANTES** — a recusa acontece antes da clonagem, sem gastar slot | [voiceSample.ts:466](backend/src/services/voice/voiceSample.ts:466) |
| `checkOutfitPolicy` (teto, "em preparo") | **ANTES** — o teto diário cobre traje; a espera é posterior | [dailyGenerationLimit.ts:93-101](backend/src/services/billing/dailyGenerationLimit.ts:93) |
| `checkNativeBatchPolicy` | **ANTES** — débito e teto por geração, na hora | `nativeBatch.ts` |
| `checkRefundPolicy` | **DEPOIS, e só até o aceite** — é reparação, não prevenção; e a janela fecha quando `generateVideo` devolve job id | [videos.ts:883](backend/src/routes/videos.ts:883), fronteira em [:876-882](backend/src/routes/videos.ts:876) |
| `checkCostPolicy` | **DEPOIS** — protege o número **afirmado**, não o gasto. Uma taxa errada não gasta a mais; faz a tela mentir | [providerCost.ts](backend/src/services/billing/providerCost.ts) |
| `checkOutfitPolicy` (custo declarado) | **DEPOIS** — mesma natureza | |
| `checkLegacyEndpointPolicy` (traje eterno) | **DEPOIS** — o traje já foi pago; a guarda impede que ele suma da vista | |

**Resumo:** **10 das 13** protegem mecanismos preventivos; **3** (`checkCostPolicy`, `checkRefundPolicy`, e a metade de custo declarado de `checkOutfitPolicy`) protegem mecanismos de **reparação ou de veracidade depois do fato**.

**A assimetria que o código declara:** o gasto no fornecedor é irreversível, e a única prevenção real é não chamar. Por isso as camadas preventivas são quatro e independentes, e o estorno cobre **só** a janela entre o débito e o aceite — depois disso, nenhuma guarda pode devolver nada.

## D4 · Como um mutante é declarado — o molde

**Contrato:** [backend/src/scripts/mutants.ts](backend/src/scripts/mutants.ts). Um mutante é uma **substituição textual determinística** que introduz exatamente o defeito que uma guarda existe para pegar. O arnês aplica, roda o gate, exige saída 1 **com a mensagem daquela guarda**, reverte e exige saída 0 ([mutants.ts:16-19](backend/src/scripts/mutants.ts:16)).

### Campos

| Campo | Tipo | Obrigatório | O que faz |
|---|---|---|---|
| `guard` | `string` | **sim** | Nome da guarda que este mutante testa. Agrupa o relatório ([:35](backend/src/scripts/mutants.ts:35)) |
| `name` | `string` | **sim** | O que o mutante faz, em poucas palavras. **É por ele que o mutante é identificado — nunca por posição** ([:37](backend/src/scripts/mutants.ts:37)) |
| `kind` | `"obvio" \| "esperto"` | **sim** | `obvio` = remover a chamada, apagar a linha; `esperto` = deslocar a verdade **sem** mexer na superfície que a guarda olha ([:20-25](backend/src/scripts/mutants.ts:20)) |
| `file` | `string` | não | Caminho **relativo à raiz do repositório**. Opcional porque algumas guardas vigiam **configuração**, não código — nesses casos usa-se `env` ([:40-48](backend/src/scripts/mutants.ts:40)) |
| `find` | `string` | não | Trecho a substituir. Precisa ocorrer **exatamente uma vez**: o arnês aborta com zero ocorrências (mutante apodreceu) ou com mais de uma (substituição ambígua) ([:49-54](backend/src/scripts/mutants.ts:49)) |
| `replace` | `string` | não | O que entra no lugar. String vazia = remoção |
| `env` | `Record<string,string>` | não | Variáveis injetadas **só nesta execução do gate**. Não tocam disco, então a reversão é automática ([:57-61](backend/src/scripts/mutants.ts:57)) |
| `expect` | `string` | **sim** | Trecho que precisa aparecer na saída do gate para a reprovação contar. **Garante que quem reprovou foi a guarda, e não o compilador** ([:63-67](backend/src/scripts/mutants.ts:63)) |
| `expectGreen` | `boolean` | não | **Inverte a expectativa:** este mutante DEVE manter o gate verde, e `expect` passa a ser o trecho que precisa aparecer na saída de sucesso ([:68-77](backend/src/scripts/mutants.ts:68)) |

### A regra dos dois mutantes

Tirada do que aconteceu ([mutants.ts:6-14](backend/src/scripts/mutants.ts:6)): `checkVendorLogPolicy` casava **treze** funções — aparência de cobertura sólida — e era inerte, porque verificava a proposição errada: exigia que quem chama `fetch` **mencionasse** um helper, sem nunca olhar se o helper ainda registrava alguma coisa. Esvaziar o helper deixava treze funções descobertas de uma vez, e o check continuava verde.

- **óbvio** — pega a regressão comum.
- **esperto** — é o único que detecta guarda que verifica a proposição errada.

### O papel de `expectGreen`

O contraponto importa tanto quanto a reprovação: **uma guarda que reprova tudo também "reprova o mutante"**, e passaria no arnês sem distinguir nada ([:71-76](backend/src/scripts/mutants.ts:71)). Exemplos existentes: *"amostra que CABE continua passando (contraponto)"*, *"trunc no lugar de floor — mesma semântica, deve seguir verde"*, *"lanczos → bicubic: muda a reamostragem, não a geometria — segue verde"*, *"filter → reduce: mesma contagem, deve seguir verde"*, *"amostrar em outros instantes — mesma medida, deve seguir verde"*, *"o prompt de tenant continua sendo montado (contraponto)"*, *"amostra longa continua passando (contraponto)"*.

### Exemplo real — o par completo de uma mesma guarda

De [checkVideoContractPolicy.ts:99-121](backend/src/scripts/checkVideoContractPolicy.ts:99). Os dois testam a guarda **"contrato de vídeo: a chave de idempotência é da tentativa"**.

**O ESPERTO** — [:99-110](backend/src/scripts/checkVideoContractPolicy.ts:99):
```ts
{
  guard: "contrato de vídeo: a chave de idempotência é da tentativa",
  name: "a chave de idempotência passa a variar por request",
  kind: "esperto",
  // O header continua sendo enviado, continua no formato certo, continua
  // aparecendo no log. Só que agora ele nunca colide — e a proteção contra
  // duplo clique, que é a única razão de o campo existir, some inteira sem
  // que nada mude de aparência.
  file: "backend/src/services/providers/avatarProvider.ts",
  find: "  return `eckko-${createHash(\"sha256\").update(material).digest(\"hex\")}`;",
  replace: "  return `eckko-${createHash(\"sha256\").update(material + String(Date.now())).digest(\"hex\")}`;",
  expect: "a chave de idempotência deixou de ser derivada da tentativa",
},
```

**O ÓBVIO** — [:112-121](backend/src/scripts/checkVideoContractPolicy.ts:112):
```ts
{
  guard: "contrato de vídeo: a chave de idempotência é da tentativa",
  name: "a chave de idempotência deixa de ser enviada",
  kind: "obvio",
  // Nada muda de aparência: o corpo é o mesmo, a resposta é a mesma, o vídeo
  // sai igual. Só que o duplo clique volta a custar dois vídeos.
  file: "backend/src/services/providers/avatarProvider.ts",
  find: '    "Idempotency-Key": heygenIdempotencyKey(input),',
  replace: "",
  expect: "a requisição de vídeo saiu sem chave de idempotência",
},
```

**O que este par ilustra:**
- O `find` casa **uma linha inteira, com a indentação exata** — é isso que garante ocorrência única.
- No **esperto**, o código continua compilando, o header continua saindo, o log continua mostrando: só a **propriedade** (colidir para tentativas iguais) morre.
- No **óbvio**, `replace: ""` remove a linha.
- Os dois `expect` são **frases distintas**, cada uma correspondendo à mensagem que aquela metade da guarda emite ([checkVideoContractPolicy.ts:371](backend/src/scripts/checkVideoContractPolicy.ts:371) e [:385](backend/src/scripts/checkVideoContractPolicy.ts:385)) — é o que impede um mutante de passar por conta da falha do outro.
- O comentário acima de cada um explica **por que o defeito é invisível**, não o que a substituição faz.

**Um exemplo de mutante `env`** (guarda sobre configuração, sem arquivo): os de `checkProviderPolicy.ts` — *"fixture com NODE_ENV=production"*, *"live com a frase de confirmação errada"* — e os de `checkEnvironmentPolicy.ts` — *"DEV_AUTOFILL=1 com NODE_ENV=production"*, *"limiter afrouxado em produção"*. Forçá-las por edição de código faria a guarda ser testada contra si mesma, "que não prova nada" ([mutants.ts:44-47](backend/src/scripts/mutants.ts:44)).

**Onde declarar um mutante novo:** dentro do array `MUTANTS` do arquivo `check*Policy.ts` da guarda correspondente. `collectMutants.ts` os reúne e `tools/run-mutants.mjs` os executa ([package.json:9](package.json:9)).

---

# O QUE EU NÃO CONSEGUI VERIFICAR E POR QUÊ

1. **Se o Fastify entrega mesmo `Buffer` em `req.body` dentro daquele plugin.** É o que `parseAs: "buffer"` documenta e o que o `as Buffer` de [stripeWebhook.ts:115](backend/src/routes/stripeWebhook.ts:115) pressupõe, mas **não executei nada** — nenhuma requisição foi feita. É leitura de contrato, não observação.

2. **Se o Stripe de fato reentrega eventos neste ambiente, e com que frequência.** A afirmação está no comentário de [creditGate.ts:165-167](backend/src/services/billing/creditGate.ts:165); não a verifiquei contra o painel nem contra log.

3. **Quantos vídeos estão hoje presos em `queued`/`processing`.** Exigiria consultar o banco, o que está fora do escopo. A resposta de C5 é sobre **caminhos possíveis**, não sobre a contagem atual.

4. **Se as migrações 043, 044 e 046 estão aplicadas.** Li os arquivos, mas `schema_migrations` só se lê conectando. Colunas que menciono a partir delas (`related_avatar_look_id`, `cost_units`, baldes `_rehearsal`) existem **no código e nas migrações** — que estejam no banco corrente é NÃO VERIFICADO.

5. **Se `credit_ledger` e `tenant_credits` estão de fato em acordo hoje.** A invariante é garantida por transação no código; conferi-la exigiria `SELECT sum(delta)` contra `balance`.

6. **O conteúdo de `checkOutfitPolicy.ts` e dos demais arquivos de guarda além do cabeçalho e das declarações de mutante.** Li os primeiros 8 blocos de cada um e as declarações; a lógica de verificação de cada guarda foi lida por amostragem, não integralmente. As descrições de D1 vêm dos cabeçalhos que os próprios arquivos escrevem sobre si.

7. **Se o arnês passa hoje.** Não executei `npm run check` nem `npm run check:mutants` — exigem `docker compose exec`.

8. **A classificação DINHEIRO/CORREÇÃO de D2 é minha**, não do código. Nenhum arquivo carrega essa marcação; apliquei o critério declarado no início de D2, e as três fronteiras discutíveis ficaram nomeadas ali.

9. **`plans.script_limit_per_month` e `avatar_limit_per_month`.** Aparecem em [plans.ts:98](backend/src/plans.ts:98) e no painel admin, e a 027 se chama `script_avatar_limits.sql` — mas **não abri essa migração**, então a forma exata dessas colunas é NÃO VERIFICADA.

10. **Se algum caminho fora de `routes/videos.ts` escreve `videos.status`.** A busca cobriu `routes/` e `services/` por `SET status`/`status = '`; os únicos resultados fora daquele arquivo escrevem em `video_variants` ([deriveVariants.ts:276](backend/src/services/video/deriveVariants.ts:276)) e em estruturas de memória (`nativeBatch.ts`). Um `UPDATE` montado por string dinâmica escaparia dessa busca.

11. **Se o `Idempotency-Key` de fato faz o fornecedor replicar a resposta.** É o que a doc lida em 06/08 afirma, segundo o comentário em [avatarProvider.ts:404-407](backend/src/services/providers/avatarProvider.ts:404). Nenhuma medição minha.

12. **A moeda de `price_cents`.** Nem [020](backend/src/db/migrations/020_plans_table.sql) nem [030](backend/src/db/migrations/030_credit_packages.sql) declaram se é USD ou BRL; os valores semeados (1990, 3990, 5990) são compatíveis com as duas leituras.
