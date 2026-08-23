-- O GASTO AUTORIZADO de cada corrida da fal, em dólares -- a INSTRUMENTAÇÃO
-- que faltava para responder "quanto este vídeo já custou?".
--
-- ┌─ O que estava aberto, MEDIDO em 23/08 ──────────────────────────────────┐
-- │ O teto de gasto (`autorizarGasto`, falPipeline.ts) é por CORRIDA, e     │
-- │ toda retomada começa com `gastoAcumuladoUsd: 0` -- decisão declarada em │
-- │ três lugares (`runFalPipelineDaImagem`, `runFalPipelineDoVideoMudo`,    │
-- │ `recompor` em falApproval.ts) e correta no escopo dela: somar o gasto   │
-- │ passado recusaria a segunda metade por dinheiro que já saiu.            │
-- │                                                                         │
-- │ Só que o VÍDEO passa por várias corridas. Medido neste banco:           │
-- │ 24 corridas para 7 vídeos, com um vídeo (`d450c86c`) em 4. Cada         │
-- │ "Refazer" abre corrida nova com teto zerado, e não há limite de         │
-- │ cliques -- `/redo-video` re-paga `animar` a cada um (US$ 0,375 no Wan,  │
-- │ ~US$ 6,93 no Seedance a 15 s). Dez cliques no Premium são ~US$ 69, e as │
-- │ dez corridas passam pelo teto de US$ 10,00 sem uma reclamação: cada     │
-- │ uma cabe sozinha.                                                       │
-- │                                                                         │
-- │ E não havia ONDE somar: `fal_pipeline_runs` não guardava custo nenhum.  │
-- │ O `gastoPrevistoUsd` vivia na memória da invocação e num `logEvent`.    │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ADITIVA, e SÓ INSTRUMENTA. Nenhum freio novo nasce com esta coluna: o teto
-- por corrida segue exatamente como está, e nenhuma corrida legítima muda de
-- comportamento. Decisão explícita do operador (23/08): medir primeiro com
-- dados reais, escolher o número depois.
--
-- DEFAULT 0 e NOT NULL: as 24 corridas que já existem entram com zero, que é
-- falso mas HONESTO -- elas rodaram antes de haver instrumentação, e um NULL
-- ali faria toda soma por vídeo virar NULL em vez de contar o que se sabe.
-- Zero subestima o passado e é exato do primeiro registro novo em diante.
--
-- PREVISTO, não COBRADO -- e o nome é a diferença. O que se grava é o que
-- `autorizarGasto` AUTORIZOU antes da submissão, sempre antes de o dinheiro
-- sair. A fal não tem endpoint de saldo (ver `PRECOS_FAL`), então não existe
-- número cobrado para conferir contra este. Gravar depois da submissão daria
-- um número mais parecido com a fatura e perderia justamente o caso que
-- importa: a corrida que morre no meio, com etapas já aceitas pelo
-- fornecedor.
ALTER TABLE fal_pipeline_runs
  ADD COLUMN IF NOT EXISTS gasto_previsto_usd numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN fal_pipeline_runs.gasto_previsto_usd IS
  'Gasto ACUMULADO autorizado nesta corrida, em USD -- a soma do que `autorizarGasto` liberou, gravada ANTES de cada submissão paga. PREVISTO, não cobrado: a fal não expõe saldo. Corridas anteriores à migration 062 ficam em 0 (rodaram sem instrumentação). Somar por video_id responde quanto um vídeo já custou ao longo de todas as suas corridas -- ver `gastoAcumuladoDoVideoUsd` em falPipelineJournal.ts.';
