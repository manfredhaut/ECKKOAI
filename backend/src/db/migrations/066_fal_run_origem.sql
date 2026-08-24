-- QUAL ROTA ABRIU A CORRIDA — o dado que faltava para contar refações (W3.1).
--
-- ┌─ Por que inferir não serve ──────────────────────────────────────────────┐
-- │ `fal_pipeline_runs` registra tenant, vídeo, roteiro e agora o gasto, mas │
-- │ nunca registrou QUEM a abriu. Contar refações exigia reconstruir a       │
-- │ intenção a partir do conjunto de etapas: uma corrida com `compor` podia  │
-- │ ser a criação OU um `/recompose`; uma com `animar`, a aprovação OU um    │
-- │ `/redo-video`. Foi assim que a contagem de 24/08 foi feita — à mão, e    │
-- │ só porque eram 24 linhas.                                                │
-- │                                                                          │
-- │ Um limite de refações contado por inferência erra nos dois sentidos: ou  │
-- │ barra uma aprovação legítima, ou deixa passar a quarta refação. Nenhum   │
-- │ dos dois é aceitável num freio de dinheiro.                              │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ADITIVA e anulável: as 24 corridas existentes ficam com `origem` NULL, e a
-- contagem as ignora. Isso SUBESTIMA o histórico — o `d450c86c` tem uma
-- refação real que não será contada —, e é a escolha certa: inventar origem
-- para linha antiga seria fabricar dado, e o efeito de subestimar é dar ao
-- operador mais margem num vídeo antigo, não menos.
ALTER TABLE fal_pipeline_runs ADD COLUMN IF NOT EXISTS origem text;

ALTER TABLE fal_pipeline_runs DROP CONSTRAINT IF EXISTS fal_pipeline_runs_origem_check;
ALTER TABLE fal_pipeline_runs ADD CONSTRAINT fal_pipeline_runs_origem_check
  CHECK (origem IS NULL OR origem IN ('criacao', 'aprovacao', 'aprovacao_video', 'refazer_imagem', 'refazer_video'));

-- As DUAS que contam como refação. Índice parcial: a contagem pergunta
-- exatamente por elas, e um índice sobre a tabela inteira varreria criação e
-- aprovação junto.
CREATE INDEX IF NOT EXISTS fal_pipeline_runs_refacoes_idx
  ON fal_pipeline_runs (video_id)
  WHERE origem IN ('refazer_imagem', 'refazer_video');

COMMENT ON COLUMN fal_pipeline_runs.origem IS
  'Qual rota abriu esta corrida. `refazer_imagem` (/recompose) e `refazer_video` (/redo-video) sao as que contam para o limite de refacoes. NULL = corrida anterior a migration 066, ignorada na contagem.';
