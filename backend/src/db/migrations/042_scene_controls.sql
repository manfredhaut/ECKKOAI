-- Os controles de CENA, guardados na linha do vídeo.
--
-- Até aqui a tela coletava cenário e traje, gravava os dois em `scenario` e
-- `outfit`, e nenhum dos dois chegava ao fornecedor — o call site de
-- `generateVideo()` simplesmente não os passava, e o tipo de entrada não tinha
-- onde recebê-los. Ficaram semanas assim, coletando arquivo de cliente para
-- guardar num banco que ninguém lia.
--
-- As colunas novas existem por dois motivos, e o segundo é o que decide o
-- desenho:
--
--  (a) o que foi escolhido precisa VOLTAR na leitura, para a tela conseguir
--      dizer o que produziu aquele vídeo; e
--  (b) "gerar de novo com os mesmos parâmetros" é requisito de produto, porque
--      o fornecedor declara que o mesmo prompt com o mesmo áudio pode dar
--      resultados diferentes. Sem estas colunas, repetir uma geração exigiria
--      que a pessoa reconstruísse a cena de memória — e cada tentativa custa.
--
-- `scenario`/`outfit` continuam onde estão, intocadas: elas guardam o histórico
-- do que foi coletado antes, e sobrescrevê-las apagaria a evidência de um
-- defeito que ainda não foi todo desfeito.
ALTER TABLE videos
  -- 'color' ou 'image'. NULL = sem fundo escolhido, que é o que toda geração
  -- deste produto fez até hoje. O fornecedor NÃO aceita fundo por vídeo:
  -- `BackgroundSetting` enumera exatamente estes dois (levantado por GET em
  -- 2026-08-05, sem gerar nada).
  ADD COLUMN IF NOT EXISTS background_type text,
  -- Hex `#rrggbb` quando 'color'; caminho do nosso upload quando 'image'. O
  -- asset do fornecedor não é guardado: ele é resolvido a cada geração, e um id
  -- de asset velho apontaria para algo que pode não existir mais lá.
  ADD COLUMN IF NOT EXISTS background_value text,
  -- Texto livre de interpretação. NULL, e nunca '', porque campo vazio não é
  -- campo: o payload omite o que está vazio.
  ADD COLUMN IF NOT EXISTS motion_prompt text,
  -- 'low' | 'medium' | 'high'. O fornecedor documenta o default como 'low'.
  ADD COLUMN IF NOT EXISTS expressiveness text,
  -- Motor ESCOLHIDO na tela, que é diferente de `provider_engine` (o que foi
  -- de fato enviado). Os dois divergem sempre que a flag de envio está
  -- desligada, e é essa diferença que permite responder "o que teria sido
  -- usado?" depois.
  ADD COLUMN IF NOT EXISTS engine_choice text,
  -- Look do avatar usado nesta geração. Traje é look, não parâmetro de vídeo.
  ADD COLUMN IF NOT EXISTS avatar_look_id text;

ALTER TABLE videos
  ADD CONSTRAINT videos_background_type_check
  CHECK (background_type IS NULL OR background_type IN ('color', 'image'));

ALTER TABLE videos
  ADD CONSTRAINT videos_expressiveness_check
  CHECK (expressiveness IS NULL OR expressiveness IN ('low', 'medium', 'high'));

-- Sem CHECK em `engine_choice`: o vocabulário de motores do fornecedor muda
-- sem nos avisar (o Avatar V apareceu depois do III e do IV), e um CHECK aqui
-- transformaria um motor novo em erro de banco no meio de uma geração paga. A
-- validação vive em videoEngine.ts, onde a lista é declarada.
