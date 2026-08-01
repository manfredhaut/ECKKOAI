-- Formato do vídeo e motor de renderização: escolhidos por nós, gravados.
--
-- O defeito que isto fecha, registrado no POLL-1 e confirmado por medição no
-- LIVE-1: `POST /v3/videos` levava três campos (`type`, `avatar_id`,
-- `audio_asset_id`) e nada mais. O vídeo saiu 1280×720 16:9 porque esse é o
-- padrão da conta na HeyGen — ninguém decidiu. Escolher por omissão é escolher
-- mesmo assim, só que delegando a decisão a quem não sabe onde o vídeo vai ser
-- publicado.

-- Motores que o FORNECEDOR declara para cada avatar.
--
-- Medido em 2026-08-01 (`heygen.createAvatar`, 200): a resposta traz
-- `avatar_item.supported_api_engines = ["avatar_iv","avatar_iii"]`. O campo já
-- vinha em toda criação e era descartado junto com o corpo.
--
-- NULL é "não declarou", e não "nenhum": todos os avatares que já existem ficam
-- NULL, e a seleção cai no default do fornecedor com a razão registrada. Um
-- default de '{}' seria indistinguível de um avatar que declarou lista vazia.
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS provider_engines text[];

COMMENT ON COLUMN avatars.provider_engines IS
  'supported_api_engines declarado pelo fornecedor na criação. NULL = não declarou (avatar anterior a esta leitura).';

-- O que foi PEDIDO (plataforma, proporção, resolução) e o que foi USADO
-- (motor), na linha do vídeo.
--
-- A plataforma fica gravada junto da proporção mesmo sendo derivável dela: a
-- derivação pode mudar (uma plataforma pode passar a pedir outra proporção), e
-- sem o pedido original não haveria como reprocessar nem como responder "que
-- destino o cliente escolheu naquele dia".
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS publish_platform text,
  ADD COLUMN IF NOT EXISTS aspect_ratio text,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS provider_engine text,
  ADD COLUMN IF NOT EXISTS provider_engine_reason text;

-- `provider_engine` NULL significa "não foi enviado ao fornecedor" — o estado
-- normal enquanto a flag `explicit_avatar_engine` estiver desligada. A razão é
-- gravada de qualquer forma, inclusive nesse caso ('flag_off'), porque o valor
-- do registro está em saber o que TERIA sido escolhido antes de arriscar
-- enviá-lo.
COMMENT ON COLUMN videos.provider_engine IS
  'Motor enviado ao fornecedor. NULL = não enviado (ver provider_engine_reason).';
COMMENT ON COLUMN videos.provider_engine_reason IS
  'Por que este motor: declared_preference | declared_first_unlisted | default_no_declaration | default_unknown_declaration | flag_off | vendor_unsupported.';

-- O mesmo no registro de consumo, para que a conciliação futura possa separar
-- custo por formato e por motor.
--
-- Sem estas colunas, a pergunta "9:16 custa mais que 16:9?" só teria resposta
-- cruzando provider_usage com videos por id — o que funciona hoje e deixa de
-- funcionar no dia em que um consumo não tiver vídeo associado (a voz já não
-- tem). Repetir o dado aqui é deliberado: provider_usage é o registro de
-- consumo e precisa se sustentar sozinho, como já faz com a taxa
-- (`rate_snapshot_cents_per_unit`).
ALTER TABLE provider_usage
  ADD COLUMN IF NOT EXISTS aspect_ratio text,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS provider_engine text;

-- Linhas anteriores continuam NULL de propósito. Preenchê-las com '16:9' — que
-- é o que o ffprobe mediu no único vídeo real baixado — transformaria uma
-- observação de UMA amostra em fato sobre todas, e é exatamente assim que a
-- estimativa virou verdade em `provider_cost_rates`.
