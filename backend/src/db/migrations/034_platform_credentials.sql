-- Chaves DA PLATAFORMA, cifradas em repouso.
--
-- Tabela separada de `api_credentials` pela mesma razão que `admin_users` é
-- separada de `users`: são identidades de escopos diferentes. `api_credentials`
-- é sempre de um tenant e carrega `tenant_id`; estas chaves não pertencem a
-- tenant nenhum — quem paga a conta é a plataforma. Guardá-las na mesma tabela
-- exigiria um `tenant_id` nulo com significado especial, e uma consulta
-- esquecida do filtro entregaria a chave da casa a um cliente.
--
-- Qual conjunto de chaves EXISTE vive no código (services/platformCredentials.ts,
-- cobrado por `npm run check`); esta tabela guarda só o valor cifrado e o
-- rastro. Mesma divisão de feature_flags: o catálogo é o código, o estado é a
-- tabela.

CREATE TABLE platform_credentials (
  -- Id do registro em services/platformCredentials.ts. Sem foreign key para
  -- uma tabela de catálogo, de propósito: linha órfã (chave removida do
  -- registro) é inofensiva porque ninguém a lê; o inverso é que importa.
  key                    text PRIMARY KEY,

  -- Mesmo formato de api_credentials.encrypted_key: AES-256-GCM via
  -- services/crypto.ts, sob a ENCRYPTION_KEY do ambiente. Não existe segundo
  -- mecanismo de cifra no projeto e não deve existir.
  encrypted_key          text NOT NULL,

  -- Os 4 últimos caracteres da chave EM CLARO, gravados no momento da escrita.
  --
  -- Existe porque o `masked_key` do resto do projeto mascara o TEXTO CIFRADO:
  -- os caracteres que ele mostra são do base64 do ciphertext, não da chave, e
  -- portanto não identificam nada. Quem precisa responder "é a chave nova ou a
  -- velha que está aí?" não consegue com aquele valor.
  --
  -- Guardar 4 caracteres em claro é aceitável e deliberado: 4 caracteres não
  -- reconstroem uma chave, e a alternativa (decifrar para exibir) obrigaria a
  -- ter um caminho de leitura em claro, que é exatamente o que este bloco
  -- proíbe.
  last_four              text NOT NULL,

  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Quem gravou. Nullable porque uma gravação por script/seed não tem ator
  -- humano — a mesma convenção de audit_log.actor_admin_user_id.
  updated_by             uuid REFERENCES admin_users (id),

  -- Resultado da última validação. Guardado para a tela poder dizer "validada
  -- em <data>" sem chamar o fornecedor a cada carregamento — uma tela que
  -- valida ao montar viraria uma chamada a fornecedor por refresh.
  last_validated_at      timestamptz,
  last_validation_ok     boolean,
  -- Texto curto para humano: erro sanitizado, ou o saldo/cota lido do
  -- fornecedor. NUNCA material de chave.
  last_validation_detail text
);
