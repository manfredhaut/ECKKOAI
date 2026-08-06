-- O traje ganha referência própria no ledger.
--
-- POR QUE, e o defeito que isto conserta: `refundCredit()` exige EXATAMENTE UMA
-- referência (vídeo, geração de roteiro ou treino de avatar) — ela é a chave de
-- idempotência, e sem ela um estorno pode repetir, o que cria dinheiro. A
-- criação de traje não tinha nenhuma das três, então o estorno era recusado com
-- `no_reference` e o crédito NÃO voltava quando o fornecedor lançava.
--
-- Isto não foi deduzido: a guarda de traje reprovou com "houve 0 estorno(s),
-- esperado 1" na primeira execução, antes de qualquer linha deste arquivo.
--
-- Reaproveitar `related_avatar_training_id` não serve: ele tem FK para
-- `avatar_trainings`, e um traje não é um treino. Inventar um uuid ali quebraria
-- a chave estrangeira; deixar sem referência mantém o defeito.
ALTER TABLE credit_ledger
  ADD COLUMN related_avatar_look_id uuid REFERENCES avatar_looks(id) ON DELETE SET NULL;

-- Um estorno por traje, garantido pelo banco — mesmo padrão dos outros três
-- (migration 035). A checagem em `refundCredit()` roda depois do `FOR UPDATE`,
-- mas duas chamadas concorrentes em processos diferentes só serializam de
-- verdade com o índice.
CREATE UNIQUE INDEX credit_ledger_one_refund_per_look
  ON credit_ledger (related_avatar_look_id)
  WHERE reason = 'refund' AND related_avatar_look_id IS NOT NULL;

-- O id do fornecedor passa a ser opcional.
--
-- A linha de `avatar_looks` nasce ANTES da chamada, para poder ser a chave de
-- idempotência do débito — e nesse instante o id do look ainda não existe: ele
-- só chega no 200. Um placeholder inventado ficaria no banco para sempre quando
-- a chamada falhasse, e seria indistinguível de um id de verdade.
ALTER TABLE avatar_looks ALTER COLUMN provider_look_id DROP NOT NULL;
