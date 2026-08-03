-- Variantes de formato de um vídeo.
--
-- O modelo é master + variantes, e a separação em tabela própria é o que torna
-- a origem AUDITÁVEL. A alternativa — mais colunas em `videos` — obrigaria uma
-- linha por formato, e aí uma geração cobrada e uma derivação gratuita ficariam
-- indistinguíveis na contagem de vídeos, que é justamente o número que aparece
-- na assinatura do cliente.
--
-- A regra que esta tabela materializa: UMA linha de custo por geração
-- (`provider_usage`, intocada aqui), N linhas de artefato. Uma derivação nunca
-- produz linha de custo, porque não custa — e essa assimetria precisa ser
-- visível no schema, não só no código.

CREATE TABLE IF NOT EXISTS video_variants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id          uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id),

  aspect_ratio      text NOT NULL,
  width             integer NOT NULL,
  height            integer NOT NULL,

  -- 'generated' = veio do fornecedor, custou dinheiro e tem linha em
  -- provider_usage. 'derived' = saiu do master por software, custo zero.
  -- Sem este campo, um artefato derivado seria indistinguível de um gerado, e
  -- a pergunta "por que a fatura não bate com a contagem de vídeos?" não teria
  -- resposta no banco.
  origin            text NOT NULL CHECK (origin IN ('generated', 'derived')),

  output_url        text,

  -- Geometria MEDIDA do sujeito dentro do quadro, por ffprobe do artefato.
  -- Guardada porque é o que sustenta a invariante do bloco 5E: o sujeito nunca
  -- é ampliado. Sem o número gravado, a afirmação só existiria em comentário.
  subject_width     integer,
  subject_height    integer,

  -- Tempo de parede da derivação. Alimenta a tela: o cliente precisa saber
  -- quanto espera antes de escolher.
  elapsed_ms        integer,

  -- Preenchido quando o quadro final ficou abaixo do alvo do formato porque o
  -- master não tinha resolução para ele. NULL significa que atendeu.
  shortfall         text,

  status            text NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready', 'error')),
  error_message     text,

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Um formato por vídeo: pedir 9:16 duas vezes é a mesma variante, não duas.
CREATE UNIQUE INDEX IF NOT EXISTS video_variants_video_aspect_uniq
  ON video_variants (video_id, aspect_ratio);

CREATE INDEX IF NOT EXISTS video_variants_video_idx ON video_variants (video_id);
CREATE INDEX IF NOT EXISTS video_variants_tenant_idx ON video_variants (tenant_id);
