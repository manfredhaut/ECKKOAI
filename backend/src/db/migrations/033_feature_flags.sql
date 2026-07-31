-- Estado das feature flags. A lista de quais flags EXISTEM vive no código
-- (services/featureFlags.ts, cobrado por npm run check); esta tabela guarda
-- só o estado, para o admin alternar sem rebuild e sem deploy.
--
-- Sem foreign key para uma tabela de catálogo, de propósito: o catálogo é o
-- código. Uma linha órfã aqui (flag removida do registro) é inofensiva —
-- ninguém a lê — enquanto uma flag do código sem linha aqui simplesmente
-- assume o default declarado no registro.

CREATE TABLE feature_flags (
  key        text PRIMARY KEY,
  enabled    boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Quem virou a chave. Nullable porque o seed inicial não tem ator humano.
  updated_by uuid REFERENCES admin_users (id)
);

-- Primeira flag: fundo removível, DESLIGADA. O motivo ("depende de teste
-- ainda não realizado com a HeyGen") mora no registro do código, junto do
-- texto que o cliente lê.
INSERT INTO feature_flags (key, enabled) VALUES ('removable_background', false);
