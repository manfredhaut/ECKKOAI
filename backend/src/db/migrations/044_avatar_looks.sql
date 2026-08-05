-- Trajes criados AQUI, ao lado dos que o fornecedor já tem.
--
-- O passo 1 coletava um traje desde sempre: um upload de imagem e um prompt,
-- guardados em `videos.outfit`/`videos.outfit_prompt`. Nunca foram enviados a
-- fornecedor nenhum, e depois do DEMO-2 pararam até de sair da tela — o corpo
-- de `POST /videos` passou a ser montado por `corpoDaGeracao()`, que não os
-- inclui. Ficou um formulário que aceita arquivo do cliente e não alimenta
-- coisa alguma, o que é pior que um campo ausente: ele promete.
--
-- Traje, no contrato do fornecedor, é LOOK do avatar — não parâmetro de vídeo.
-- Escolher entre looks existentes já funciona (passo Cena, desde 1ba8f39).
-- O que falta é CRIAR um.
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA TABELA, E O QUE ELA NÃO É
--
-- Os looks simulados de hoje são derivados por função pura
-- (`listAvatarLooksFixture`), e função pura não guarda nada: um traje criado
-- sumiria no request seguinte, e o passo Cena nunca o veria. Esta tabela é o
-- que faz o traje criado existir depois do clique.
--
-- Ela NÃO é um espelho do catálogo do fornecedor. As linhas de `avatar_looks`
-- são trajes criados por NÓS, e hoje só em simulação: o endpoint real de
-- criação de look não é conhecido, sondá-lo exigiria um POST — que gasta — e
-- inventar um path seria pior que não ter o recurso. Em live a rota recusa,
-- explicitamente, dizendo isso. `simulated` marca cada linha para que o dia em
-- que o caminho real existir não comece com um catálogo já contaminado por
-- trajes que nunca saíram daqui.
CREATE TABLE avatar_looks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  avatar_id         uuid NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
  -- O id que vai ao fornecedor no lugar de `provider_avatar_id` quando este
  -- traje é o escolhido. Em simulação é derivado do avatar, com a mesma forma
  -- dos looks de fixture, para que o payload impresso não precise de caso
  -- especial nenhum para distinguir "look criado" de "look que já existia".
  provider_look_id  text NOT NULL,
  name              text NOT NULL,
  -- A imagem que a pessoa enviou, servida pelo nosso `/uploads`. NULL quando o
  -- traje foi descrito só por texto.
  preview_image_url text,
  -- A descrição livre. Guardada porque é o que o dia do caminho real vai
  -- precisar mandar, e porque sem ela o traje criado vira um nome sem conteúdo.
  prompt            text,
  simulated         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Dois trajes com o mesmo id de fornecedor no mesmo avatar seriam ambíguos na
-- hora de escolher, e a escolha é o que vai ao payload.
CREATE UNIQUE INDEX avatar_looks_provider_look_id_idx ON avatar_looks (avatar_id, provider_look_id);
CREATE INDEX avatar_looks_avatar_idx ON avatar_looks (tenant_id, avatar_id);
