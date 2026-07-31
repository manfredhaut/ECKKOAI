-- Marca de simulação: o que foi gerado em PROVIDER_MODE=fixture nunca pode
-- ser confundido com o que custou dinheiro de verdade.
--
-- A coluna existe em vez de um `reason` novo no ledger porque simulação é
-- uma propriedade ORTOGONAL ao motivo: um consumo simulado continua sendo
-- consumo, uma concessão simulada continua sendo concessão. Codificar isso
-- dentro de `reason` dobraria a lista de motivos a cada modo novo e
-- quebraria todo relatório que agrupa por motivo.
--
-- Default `false` e NOT NULL: tudo que já existe no banco foi gerado antes
-- deste modo existir, ou seja, é real. O default seguro é "não simulado" —
-- errar para o lado de tratar simulado como real seria pior, mas nenhuma
-- linha anterior pode ter vindo de simulação, então o backfill é exato e
-- não uma suposição.

ALTER TABLE credit_ledger ADD COLUMN simulated boolean NOT NULL DEFAULT false;
ALTER TABLE videos ADD COLUMN simulated boolean NOT NULL DEFAULT false;
ALTER TABLE avatars ADD COLUMN simulated boolean NOT NULL DEFAULT false;

-- Índice parcial: as telas que separam real de simulado filtram por
-- simulated = true, que é a minoria das linhas. Um índice parcial cobre
-- essa consulta sem pesar nas escritas do caminho normal.
CREATE INDEX credit_ledger_simulated_idx ON credit_ledger (tenant_id, credit_type)
  WHERE simulated;
