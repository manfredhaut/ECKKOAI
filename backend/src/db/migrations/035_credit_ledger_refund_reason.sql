-- Estorno de crédito quando a chamada ao fornecedor falha.
--
-- `reason` próprio, e não um `consumption` positivo: o ledger é o registro
-- imutável do que aconteceu, e "devolvi porque o fornecedor recusou" é um
-- fato diferente de "comprou" ou de "a plataforma ajustou à mão". Sem um
-- motivo próprio, um relatório de consumo somaria débito e estorno e mostraria
-- zero — verdadeiro no saldo, e mentiroso sobre o que ocorreu: a tentativa
-- existiu, falhou, e isso é justamente o que se quer conseguir contar depois.
ALTER TABLE credit_ledger DROP CONSTRAINT credit_ledger_reason_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_reason_check
  CHECK (reason IN ('purchase', 'consumption', 'manual_admin_adjustment', 'grant', 'refund'));

-- Um estorno por tentativa, garantido pelo banco e não só pela aplicação.
--
-- A checagem em `refundCredit()` já roda sob `FOR UPDATE`, o que basta para
-- duas requisições concorrentes do mesmo processo. Estes índices cobrem o que
-- o lock não cobre: um caminho novo que esqueça de checar, e o dia em que
-- houver mais de uma réplica gravando. Crédito devolvido duas vezes é dinheiro
-- criado do nada, e é o tipo de erro que ninguém reclama — só aparece na
-- conciliação, meses depois.
--
-- Índices PARCIAIS (só `reason = 'refund'`) porque a coluna related_* é
-- preenchida também pelas linhas de consumo, e ali a repetição é legítima.
CREATE UNIQUE INDEX credit_ledger_one_refund_per_training
  ON credit_ledger (related_avatar_training_id)
  WHERE reason = 'refund' AND related_avatar_training_id IS NOT NULL;

CREATE UNIQUE INDEX credit_ledger_one_refund_per_generation
  ON credit_ledger (related_script_generation_id)
  WHERE reason = 'refund' AND related_script_generation_id IS NOT NULL;

CREATE UNIQUE INDEX credit_ledger_one_refund_per_video
  ON credit_ledger (related_video_id)
  WHERE reason = 'refund' AND related_video_id IS NOT NULL;
