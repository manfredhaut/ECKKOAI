-- BLOCO STUDIO-EXPORT-1 -- exportação assíncrona do Estúdio de Edição
-- (migration 090; a 087 reservada no plano original de 28/09 foi
-- consumida por 087_video_title.sql antes desta rodada -- numeração
-- atualizada aqui, confirmado por `ls backend/src/db/migrations` em
-- 30/09/2026).
--
-- Concorrência 1 em TODO O PROCESSO (não por tenant): exportação sempre
-- recodifica (nunca -c copy -- as fixtures medidas em 28/09 têm um único
-- keyframe em 0,000s, que torna corte por cópia impossível sem corromper)
-- e roda IN-PROCESS, sem fila externa -- ver services/video/exportRunner.ts.
--
-- params_hash é o hash do payload exportado (trechos+insercoes+volVoz+
-- fundo, mais o source_video_id) -- clicar "Exportar" duas vezes com a
-- MESMA timeline reaproveita o resultado já pronto em vez de gastar CPU de
-- novo; o índice único por (edit_project_id, params_hash) é a garantia
-- disso, não só uma checagem de aplicação.
CREATE TABLE edit_project_exports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  edit_project_id  uuid NOT NULL REFERENCES edit_projects(id) ON DELETE CASCADE,
  params_hash      text NOT NULL,
  status           text NOT NULL DEFAULT 'queued',
  arquivo_url      text,
  erro             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  finished_at      timestamptz
);

CREATE UNIQUE INDEX edit_project_exports_project_hash_idx
  ON edit_project_exports (edit_project_id, params_hash);
CREATE INDEX edit_project_exports_tenant_idx ON edit_project_exports (tenant_id);
CREATE INDEX edit_project_exports_status_idx ON edit_project_exports (status);
