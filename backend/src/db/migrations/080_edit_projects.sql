-- BLOCO STUDIO-EDIT-1 -- modelo de dados da aba "5. Studio Movie Edit"
-- (era "5. Editar"). ADITIVA: nenhuma tabela existente muda.
--
-- `payload` guarda a sequência de trechos e as sobreposições NO FORMATO QUE
-- O PROTOTIPO PRODUZ (trechos/insercoes/volVoz/fundo), sem coluna por campo
-- -- normalizar cada campo do editor em colunas SQL obrigaria a migration
-- nova toda vez que o protótipo ganhasse um controle, e o editor ainda está
-- mudando de modelo (cutaway -> emenda nesta mesma rodada). Cada referência
-- de arquivo DENTRO do payload é um asset_id (string) apontando para
-- `POST /tenant/edit-assets` -- nunca uma URL de blob local (ver G3 em
-- checkStudioMovieEditPolicy.ts).
--
-- `source_video_id` e `duration_seconds` SAEM do payload para colunas
-- próprias porque os dois são consultados fora do editor: listar projetos de
-- um vídeo, e mostrar a duração sem reabrir o projeto inteiro.
CREATE TABLE edit_projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_video_id   uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  payload           jsonb NOT NULL,
  duration_seconds  numeric NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX edit_projects_tenant_idx ON edit_projects (tenant_id);
CREATE INDEX edit_projects_source_video_idx ON edit_projects (source_video_id);
