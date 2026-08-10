-- Escolha de LEGENDA do vídeo, guardada na linha.
--
-- Coluna, e não só campo de corpo, pelo mesmo motivo de `motion_prompt` e
-- `background_type`: "Gerar novamente" remonta o pedido a partir da linha, e
-- uma escolha que só existisse no formulário sumiria na segunda geração — que
-- é paga igual à primeira.
--
-- DEFAULT false porque o padrão do produto é SEM legenda. O valor também é o
-- que descreve corretamente todo vídeo já gerado até aqui: nenhum deles pediu
-- `caption` ao fornecedor, e a resposta de `GET /v3/videos/{id}` do último
-- (medido em 10/08) não trouxe `subtitle_url` nem `captioned_video_url`.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS captions boolean NOT NULL DEFAULT false;

-- A URL da versão COM legenda queimada, quando o fornecedor a devolve.
--
-- Separada de `output_url` de propósito: o fornecedor entrega as duas, e
-- sobrescrever uma com a outra apagaria a versão limpa de um vídeo que já foi
-- pago. Guardar as duas custa uma coluna; regerar custa dinheiro.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS captioned_output_url text;
