-- O traje criado por texto é ASSÍNCRONO, e a linha precisa dizer em que pé está.
--
-- Medido em 06/08, na conta real: `POST /v3/avatars` com `type: "prompt"`
-- devolve 200 com `status: "processing"`, e o look só fica utilizável quando
-- vira `completed` (≤ 15 s naquela medição). Sem esta coluna a tela teria de
-- perguntar ao fornecedor a cada abertura do seletor, e um traje em preparo
-- apareceria como escolhível — a geração sairia com um look que ainda não
-- existe.
--
-- `failed` é estado terminal e NÃO some da lista: o look foi pago (60 unidades,
-- US$ 1,00 medidos) e sumir em silêncio esconderia dinheiro gasto. A tela mostra
-- e explica.
ALTER TABLE avatar_looks
  ADD COLUMN status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('processing', 'completed', 'failed'));

-- O que o fornecedor cobrou por este traje, em unidades. NULL para os criados
-- em simulação, que não custaram nada.
--
-- Guardado por LINHA em vez de derivado de uma constante: a tarifa pode mudar, e
-- um extrato que recalcula o passado com o preço de hoje deixa de ser extrato.
-- Mesma razão pela qual `provider_usage` guarda o número medido.
ALTER TABLE avatar_looks ADD COLUMN cost_units integer;

-- Os trajes já existentes nasceram todos em fixture (o caminho live recusava
-- até este bloco), então `completed` e sem custo é o estado correto para eles —
-- e é o que o DEFAULT acima já deu.
CREATE INDEX avatar_looks_pendentes_idx ON avatar_looks (tenant_id, avatar_id) WHERE status = 'processing';
