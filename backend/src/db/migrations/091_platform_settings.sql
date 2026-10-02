-- PAINEL-HIGGSFIELD-1, 01/10/2026 — configurações numéricas da plataforma,
-- editáveis pelo admin sem editar .env nem recriar container. Distinta de
-- platform_credentials: aqui não há segredo, o valor é lido de volta e
-- mostrado na tela antes de editar.
--
-- chave/valor genérico (não só Higgsfield) para não precisar de uma tabela
-- nova a cada novo número que precisar virar editável no futuro.
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES admin_users(id)
);
