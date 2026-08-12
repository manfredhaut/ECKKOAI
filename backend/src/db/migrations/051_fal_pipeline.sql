-- O PIPELINE DA FAL: a corrida, as etapas, e a resposta CRUA de cada uma.
--
-- ADITIVA. Duas tabelas novas, nenhuma coluna existente tocada, tudo com
-- IF NOT EXISTS — reaplicar é inócuo (a lição do MergeWithExistingConstraint
-- da migration 039).
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA TABELA, E NÃO COLUNAS EM `videos`
--
-- Uma geração pela fal são TRÊS trabalhos pagos em fornecedores diferentes
-- (compor imagem, animar, sincronizar lábios) mais uma síntese de voz. `videos`
-- tem UM `provider_job_id` e UM `provider_vendor`: cabe um trabalho, não
-- quatro. Espremer os três ali obrigaria a escolher qual deles é "o" job, e os
-- outros dois — igualmente pagos — ficariam sem ponteiro, que é exatamente o
-- estado que este projeto já pagou para sair.
--
-- ---------------------------------------------------------------------------
-- POR QUE A RESPOSTA CRUA VAI PARA O BANCO, E NÃO SÓ PARA O LOG
--
-- O log já registra (`vendor_response`, LOG-1), e ele resolve o diagnóstico
-- DEPOIS do fato — enquanto o log existir e enquanto a janela de `--tail`
-- alcançar. O que ele não resolve é o BLOCO 6: cobrar por camada exige o corpo
-- que o fornecedor devolveu, associado à corrida, meses depois. Um log
-- rotacionado apaga a base da fatura; uma coluna não.
--
-- É também o que faz um clique que FALHA ainda valer o dinheiro: o trabalho da
-- etapa 1 continua utilizável quando a etapa 3 quebra, desde que a resposta
-- dela tenha sido guardada antes de alguém tentar interpretá-la.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fal_pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  -- NULL enquanto o pipeline não tem rota. O BLOCO 4 parte 2 liga os dois.
  -- ON DELETE SET NULL pelo mesmo motivo de `provider_usage`: o registro do
  -- que foi PAGO tem de sobreviver ao vídeo que o originou.
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running',
  script text NOT NULL,
  -- Os números da tentativa, gravados como foram DECIDIDOS e não recalculados
  -- depois: a régua muda, e uma corrida antiga precisa continuar explicável
  -- pela régua que a produziu.
  target_seconds numeric NOT NULL,
  script_chars integer NOT NULL,
  chars_per_second numeric NOT NULL,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE fal_pipeline_runs IS
  'Uma geração pelo pipeline da fal: 3 trabalhos pagos + 1 síntese. `videos` não comporta os quatro.';
COMMENT ON COLUMN fal_pipeline_runs.chars_per_second IS
  'A régua usada NESTA corrida. Gravada porque a régua muda e a corrida antiga precisa seguir explicável.';

CREATE TABLE IF NOT EXISTS fal_pipeline_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES fal_pipeline_runs(id) ON DELETE CASCADE,
  -- compor | animar | narrar | sincronizar | biblioteca
  etapa text NOT NULL,
  ordem integer NOT NULL,
  vendor text NOT NULL,
  endpoint_id text,

  -- O PONTEIRO para o trabalho pago. Gravado ANTES de qualquer processamento
  -- local da etapa — é a regra que o `falSubmit` já impõe pelo `onRequestId`,
  -- e esta coluna é o destino dele.
  request_id text,
  request_at timestamptz,

  -- A resposta como o fornecedor a mandou, ANTES de qualquer parsing.
  raw_response text,
  raw_response_at timestamptz,

  status text NOT NULL DEFAULT 'running',
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN fal_pipeline_steps.request_id IS
  'Ponteiro para o trabalho JÁ PAGO. Gravado antes de qualquer interpretação da resposta.';
COMMENT ON COLUMN fal_pipeline_steps.raw_response IS
  'Corpo bruto do fornecedor, gravado ANTES de ser interpretado. Base da cobrança por camada (BLOCO 6).';

-- "Que corrida corresponde a este request_id?" — a pergunta da reconciliação,
-- e a única forma de recuperar um trabalho pago cujo processo morreu no meio.
CREATE INDEX IF NOT EXISTS fal_pipeline_steps_request_id_idx
  ON fal_pipeline_steps (request_id)
  WHERE request_id IS NOT NULL;

-- "O que está preso?" — a varredura de recuperação. Parcial no estado
-- não-terminal e ordenada por idade, mesmo desenho de `videos_em_voo_idx`.
CREATE INDEX IF NOT EXISTS fal_pipeline_steps_em_voo_idx
  ON fal_pipeline_steps (created_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS fal_pipeline_runs_tenant_idx
  ON fal_pipeline_runs (tenant_id, created_at DESC);
