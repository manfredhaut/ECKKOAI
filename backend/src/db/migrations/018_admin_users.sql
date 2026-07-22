-- Identidade completamente separada de `users` (tenant). Não é uma role
-- dentro do tenant — é outro espaço de login, para a equipe interna do
-- eckko.ai (ver CLAUDE.md / plano de painel admin, Seção 7).
CREATE TABLE admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
