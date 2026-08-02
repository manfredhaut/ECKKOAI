-- Uma tentativa que FALHA passa a deixar linha em provider_usage.
--
-- Medido no bloco PREVOO-1: uma geração recusada pelo fornecedor não deixava
-- registro nenhum — 70 linhas antes, 70 depois. Numa passada paga isso
-- significa que o pós-morte depende inteiramente do stdout do container, que
-- some no primeiro `docker compose up -d`. A pergunta "o que foi tentado hoje,
-- e o que aconteceu com cada tentativa?" não tinha resposta em lugar nenhum
-- que sobrevivesse a um restart.
--
-- `outcome` é coluna PRÓPRIA, e não um `unit_type` novo nem um custo negativo:
-- o desfecho é ortogonal ao que foi consumido, e codificá-lo dentro de outro
-- campo dobraria a lista de valores daquele campo a cada desfecho novo — o
-- mesmo raciocínio que separou `credit_ledger.simulated` de `reason`.
ALTER TABLE provider_usage
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- Linhas anteriores a esta migration são todas de sucesso: até agora a escrita
-- só acontecia no caminho em que o vídeo ficava pronto. O default 'success'
-- as classifica corretamente, e não por conveniência.
-- DROP antes de ADD: `ADD CONSTRAINT` NÃO é idempotente, e reaplicar a
-- migration falha com `MergeWithExistingConstraint`. Não é hipótese — foi o
-- que aconteceu ao reaplicar esta mesma migration durante o bloco, e derrubou
-- o backend (corretamente: o entrypoint morre quando o migrate falha).
ALTER TABLE provider_usage DROP CONSTRAINT IF EXISTS provider_usage_outcome_check;
ALTER TABLE provider_usage
  ADD CONSTRAINT provider_usage_outcome_check
  CHECK (outcome IN ('success', 'failed'));

COMMENT ON COLUMN provider_usage.outcome IS
  'success | failed. Uma linha failed tem unit_count = 0 e failure_reason preenchido.';
COMMENT ON COLUMN provider_usage.failure_reason IS
  'Motivo sanitizado da falha (nunca o corpo bruto do fornecedor — esse vive só no log).';

-- Índice para a pergunta que se faz depois de uma passada live: "o que falhou
-- hoje?". Sem ele, a varredura é sequencial na tabela inteira; parcial porque
-- as falhas são a minoria e é só elas que se procura por aqui.
CREATE INDEX IF NOT EXISTS provider_usage_failed_idx
  ON provider_usage (tenant_id, created_at DESC)
  WHERE outcome = 'failed';

-- ---------------------------------------------------------------------------
-- O caminho de custo antigo sai do banco, e não só do código.
--
-- `estimated_cost_cents` era `taxa_palpite × unidades_PEDIDAS`. Os dois
-- fatores estavam errados ao mesmo tempo — taxa de US$ 0,03/s contra
-- US$ 0,045/s medido, multiplicada pela duração pedida (15 s) em vez da
-- entregue (3,372 s) — e o resultado saía na tela com cara de fato. 4,5x de
-- desvio, medido.
--
-- DROP, e não "deixar de escrever". Três razões, em ordem de peso:
--
--  1. Enquanto a coluna existir, alguém vai lê-la de novo. É um número
--     numérico, com nome plausível, numa tabela de consumo. A forma mais
--     forte de garantir que ninguém volte a lê-la é ela não existir: aí
--     "voltar a ler" é erro de SQL, não um gráfico errado.
--  2. O que se perde é justamente o número errado. As UNIDADES ficam
--     (`unit_count`, `requested_unit_count`, `unit_source`) — e é delas que
--     o custo passa a ser derivado, com a medição real que vive em
--     `billing/providerCost.ts`. Nenhum dado observado é perdido; o que sai
--     é uma conta que sabíamos estar errada.
--  3. As duas eram NOT NULL sem default. Parar de escrevê-las sem removê-las
--     faz TODA escrita de consumo falhar — e falhar em silêncio, porque
--     registrar consumo nunca lança. Medido: três gerações não deixaram
--     linha nenhuma. Um caminho de telemetria que falha calado é pior que
--     não ter telemetria, porque a ausência parece "nada aconteceu".
--
ALTER TABLE provider_usage
  DROP COLUMN IF EXISTS estimated_cost_cents,
  DROP COLUMN IF EXISTS rate_snapshot_cents_per_unit;

-- E a tabela de taxas manuais sai junto, pelas mesmas três razões.
--
-- Ela era a origem do número errado, e nenhum código a lê desde este bloco: o
-- custo passou a derivar da medição real em `billing/providerCost.ts`. Mantê-la
-- de pé com uma tela de admin para editá-la seria manter uma SEGUNDA verdade
-- sobre dinheiro — e é justamente a primeira que errou 4,5x. Duas fontes que
-- discordam produzem o pior tipo de defeito aqui, porque as duas parecem
-- autorizadas.
--
-- As rotas `/admin/cost-rates` e a tela que as consumia foram removidas no
-- mesmo commit. Nenhuma taxa é perdida que valha guardar: os nove valores eram
-- placeholder declarados como tal, e o único deles conferido contra a realidade
-- (avatar/heygen/seconds = US$ 0,03/s) estava errado por 1,5x.
DROP TABLE IF EXISTS provider_cost_rates;
