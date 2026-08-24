-- DE ONDE VEIO O GASTO — a atribuição que a chave de plataforma apaga (R5).
--
-- ┌─ O problema, e ele nasceu de uma decisão certa ──────────────────────────┐
-- │ `resolveTenantAvatarFalKey` faz a chave de PLATAFORMA vencer a BYOK do   │
-- │ tenant. Isso é bom: uma chave só, trocada num lugar só, servindo todos   │
-- │ os tenants. O efeito colateral é que, do lado do FORNECEDOR, todo o      │
-- │ consumo passa a chegar por uma credencial única — o painel da fal mostra │
-- │ um total por endpoint e nada sobre quem pediu.                           │
-- │                                                                          │
-- │ E a fal não tem onde etiquetar: MEDIDO por leitura da doc da fila em     │
-- │ 24/08 — existem `hint`, `priority` e headers da própria plataforma       │
-- │ (`X-Fal-Store-IO`, `X-Fal-No-Retry`), e nenhum campo de metadado, tag ou │
-- │ id de usuário final. (A HeyGen TEM `callback_id`, e não o enviamos; o    │
-- │ ElevenLabs tem `labels`, restrito a language/accent/gender/age na doc.)  │
-- │ Logo a atribuição precisa ser NOSSA, e é isto aqui.                      │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ADITIVAS, as três anuláveis. Nenhuma linha existente muda, e nenhum caminho
-- passa a exigir os campos novos: consumo antigo continua legível, só sem a
-- procedência que ninguém gravava.
--
-- `endpoint_id`: QUAL rota do fornecedor produziu o consumo. Sem ele, duas
-- chamadas de preços muito diferentes (compor a US$ 0,08 e animar por segundo)
-- entram como a mesma coisa — e foi exatamente por não ter isto que a
-- reconciliação de 24/08 precisou ser feita à mão, cruzando `endpoint_id` de
-- `fal_pipeline_steps` com o painel.
ALTER TABLE provider_usage ADD COLUMN IF NOT EXISTS endpoint_id text;

-- `key_source`: a chave era da PLATAFORMA ou do tenant? É a coluna que
-- responde "este gasto aparece na MINHA fatura ou na dele?", e é a única
-- pergunta que nem o fornecedor nem o resto desta tabela conseguem responder
-- depois do fato.
ALTER TABLE provider_usage ADD COLUMN IF NOT EXISTS key_source text;

ALTER TABLE provider_usage DROP CONSTRAINT IF EXISTS provider_usage_key_source_check;
ALTER TABLE provider_usage ADD CONSTRAINT provider_usage_key_source_check
  CHECK (key_source IS NULL OR key_source IN ('platform', 'tenant_byok'));

-- `estimated_cost_usd`: o custo PREVISTO PELA RÉGUA no instante da chamada.
--
-- ⚠️ Isto NÃO reabre o erro do bloco 4A. Lá, o que se congelava era uma TAXA
-- lida de `provider_cost_rates`, tabela editável à mão e nunca reconciliada —
-- e ela multiplicava a duração PEDIDA, não a entregue: dois erros na mesma
-- conta, 4,5× de desvio saindo na tela com cara de fato. O custo de LEITURA
-- continua derivado de `billing/providerCost.ts`, como aquele bloco decidiu, e
-- nada aqui é lido para mostrar preço a ninguém.
--
-- O que esta coluna guarda é outra coisa: o que a régua AFIRMAVA quando a
-- chamada saiu. Ela existe para ser comparada com a fatura depois — e a
-- necessidade é medida, não hipotética. Em 24/08 a reconciliação achou a régua
-- EXATA no compor (13 × US$ 0,08 = US$ 1,04, ao centavo), ~2× ALTA no animar
-- do Wan, e possivelmente ~4,6× BAIXA no sync-lipsync. Sem um registro do
-- previsto por chamada, cada reconciliação dessas custa uma sessão inteira de
-- arqueologia.
ALTER TABLE provider_usage ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric;

COMMENT ON COLUMN provider_usage.endpoint_id IS
  'Rota do fornecedor que produziu este consumo (ex.: fal-ai/sync-lipsync/v2, /v3/videos). NULL em consumo anterior à migration 063.';
COMMENT ON COLUMN provider_usage.key_source IS
  'De qual chave saiu a chamada: platform (credencial da plataforma, fatura nossa) ou tenant_byok (credencial do proprio tenant). Responde a quem pertence o gasto quando uma chave unica serve todos os tenants.';
COMMENT ON COLUMN provider_usage.estimated_cost_usd IS
  'Custo PREVISTO pela regua no instante da chamada, em USD -- nunca o cobrado (nenhum destes fornecedores expoe custo por chamada). Existe para reconciliar regua x fatura depois; NAO e lido para mostrar preco (esse continua derivado em billing/providerCost.ts).';
