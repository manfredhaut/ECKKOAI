-- A Biblioteca guardava um PONTEIRO, não um vídeo.
--
-- Medido na Fase 4.5 do bloco 5D: em live, o laço de polling gravava
-- `data.video_url` direto em `videos.output_url` — uma URL ASSINADA de
-- `files2.heygen.ai`, que expira. O produto ficava dependendo de um host de
-- terceiro responder para conseguir mostrar um vídeo que o cliente já pagou.
--
-- Dois efeitos, e o segundo é o que morde primeiro:
--
--  1. Expirada a assinatura, a Biblioteca lista o vídeo, o selo diz "pronto",
--     e o player não toca nada. Sem erro nosso em lugar nenhum.
--  2. Com o ambiente de volta em `fixture`, a guarda de saída de rede e o
--     próprio desenho do modo simulado tornam a busca em heygen.ai um
--     comportamento que não se quer ali — ou seja, o artefato morre
--     justamente no modo em que a apresentação roda.
--
-- `output_url` passa a ser SEMPRE nosso. A URL do fornecedor é preservada
-- aqui ao lado, para rastreio: é o único vínculo com o job que a produziu, e
-- descartá-la tornaria impossível reconciliar uma fatura depois.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS provider_output_url TEXT;

COMMENT ON COLUMN videos.provider_output_url IS
  'URL assinada devolvida pelo fornecedor, guardada só para rastreio. EXPIRA — nunca sirva o cliente a partir dela; output_url é a cópia no nosso armazenamento.';
