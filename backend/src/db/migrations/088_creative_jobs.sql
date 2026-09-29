-- ABAS-3, 29/09/2026 — motor de jobs da aba "5. Gerar Vídeos & Imagens"
-- (Higgsfield). Só o banco: nenhum provedor, nenhuma rota, nenhuma UI ligada
-- ainda. As duas tabelas existem para validar a estrutura de dados sozinhas
-- antes de qualquer código em cima delas.
--
-- `creative_jobs` — um job por chamada ao fornecedor (imagem, propaganda,
-- b-roll ou sobreposição). `entrada` guarda o pedido inteiro em jsonb —
-- prompt, referências por ID, proporção, duração — e NUNCA uma URL externa:
-- toda referência é resolvida contra `creative_refs` no momento do envio, do
-- mesmo jeito que `identity_snapshot` (videos, migration 082) nunca guarda
-- URL de fornecedor.
--
-- `chave_cliente`, única por tenant, é a defesa contra duplo clique: o
-- fornecedor não aceita chave de idempotência no envio (ver o levantamento
-- da API), então a barreira é nossa, antes de qualquer chamada.
--
-- `request_id` é único QUANDO presente — um job pode nascer sem ele (estado
-- "incerto": o envio saiu, a resposta não voltou). `correlation_id` é o que
-- permite ao webhook, que carrega esse id na URL, devolver o request_id que
-- se perdeu — sem ele, um job "incerto" fica incerto para sempre.
--
-- `arquivo_url` só aceita `/uploads/...`, igual a todo artefato final deste
-- projeto (ver o comentário de `output_url`/`persistRemoteArtifact`): a
-- retenção do fornecedor é de dias, a nossa cópia é a que fica.
--
-- `credencial_origem` reusa os MESMOS dois valores de
-- `ResolvedCredential.source` (credentialLookup.ts) — "platform" ou
-- "tenant_byok" — em vez de inventar um terceiro vocabulário para a mesma
-- ideia (quem pagou esta chamada).
CREATE TABLE creative_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  video_id          uuid REFERENCES videos(id) ON DELETE SET NULL,
  modo              text NOT NULL CHECK (modo = ANY (ARRAY['imagem', 'propaganda', 'broll', 'sobreposicao'])),
  modelo            text NOT NULL,
  titulo            text NOT NULL,
  entrada           jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimativa_usd    numeric,
  chave_cliente     text NOT NULL,
  request_id        text,
  status_url        text,
  cancel_url        text,
  estado            text NOT NULL DEFAULT 'estimado' CHECK (
    estado = ANY (ARRAY[
      'estimado', 'aguardando_vaga', 'enviando', 'incerto', 'na_fila',
      'gerando', 'baixando', 'pronto', 'falhou', 'recusado', 'cancelado'
    ])
  ),
  erro_fornecedor   text,
  correlation_id    uuid NOT NULL DEFAULT gen_random_uuid(),
  arquivo_url       text,
  simulated         boolean NOT NULL DEFAULT false,
  credencial_origem text CHECK (credencial_origem = ANY (ARRAY['platform', 'tenant_byok'])),
  created_at        timestamptz NOT NULL DEFAULT now(),
  enviado_em        timestamptz,
  terminado_em      timestamptz
);

-- Duplo clique no mesmo pedido não gera um segundo job.
CREATE UNIQUE INDEX creative_jobs_tenant_chave_cliente_idx
  ON creative_jobs (tenant_id, chave_cliente);

-- Igual a `videos_provider_idempotency_key_idx` (migration 047): único só
-- quando presente, porque um job "incerto" pode não ter request_id ainda.
CREATE UNIQUE INDEX creative_jobs_request_id_idx
  ON creative_jobs (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX creative_jobs_tenant_estado_idx ON creative_jobs (tenant_id, estado);
CREATE INDEX creative_jobs_correlation_id_idx ON creative_jobs (correlation_id);

-- `arquivo_url` só pode ser NULL enquanto o job não terminou, ou apontar
-- para a nossa cópia — nunca para a CDN do fornecedor, que expira.
ALTER TABLE creative_jobs ADD CONSTRAINT creative_jobs_arquivo_url_check
  CHECK (arquivo_url IS NULL OR arquivo_url LIKE '/uploads/%');

-- `creative_refs` — as imagens de referência dos quatro cartões (Produto,
-- Cenário, Personagem, Marca). `job_id` é NULL quando a referência veio de
-- upload direto, e aponta para o job que a gerou quando veio de "Gerar
-- referência". `mestre`: até uma por (tenant, tipo) pode estar marcada —
-- aplicado no código, não neste índice, porque a regra de "qual substitui
-- qual" ainda não foi decidida (ver a pergunta aberta sobre edit_assets no
-- plano da Higgsfield).
CREATE TABLE creative_refs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  tipo       text NOT NULL CHECK (tipo = ANY (ARRAY['produto', 'cenario', 'personagem', 'marca'])),
  rotulo     text,
  arquivo_url text NOT NULL,
  origem     text NOT NULL CHECK (origem = ANY (ARRAY['upload', 'gerada'])),
  job_id     uuid REFERENCES creative_jobs(id) ON DELETE SET NULL,
  mestre     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE creative_refs ADD CONSTRAINT creative_refs_arquivo_url_check
  CHECK (arquivo_url LIKE '/uploads/%');

CREATE INDEX creative_refs_tenant_tipo_idx ON creative_refs (tenant_id, tipo);
