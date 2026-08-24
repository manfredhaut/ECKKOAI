-- OS PREÇOS SAEM DO CÓDIGO E VÃO PARA UMA TABELA — W2, 24/08/2026.
--
-- ┌─ O defeito de DIREÇÃO que isto conserta, medido em 24/08 ────────────────┐
-- │ `costFor` devolve `known:false` para a fal, e o produto trata ausência   │
-- │ de preço como se fosse BARATO: o teto de US$ 2,00 liberou uma chamada    │
-- │ de sync-lipsync achando que custava US$ 0,45 quando o painel cobrou      │
-- │ US$ 3,20. O freio existia, mediu com a régua errada e autorizou.         │
-- │                                                                          │
-- │ Não basta corrigir o número: enquanto ele viver em código, cada correção │
-- │ exige deploy — e a régua erra em DIREÇÕES DIFERENTES por endpoint        │
-- │ (compor exato ao centavo, animar ~2x alto, sincronizar possivelmente     │
-- │ 4,6x baixo). Preço é dado, não lógica.                                   │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ORIGEM é coluna, e é a parte que impede a tabela de virar outro palpite:
--   PAINEL   — lido na fatura/painel do fornecedor. É medição.
--   DOC      — lido na documentação pública. É promessa do fornecedor.
--   DEDUZIDO — derivado por analogia ou fórmula. É nosso raciocínio.
-- Um número PAINEL e um DEDUZIDO não valem o mesmo, e a tela precisa poder
-- dizer qual é qual em vez de afirmar os dois com a mesma voz.
--
-- UNIDADE separa o que a régua antiga confundia: `per_second` (o Wan),
-- `per_call` (o nano-banana, preço fixo por imagem), `per_audio_second` (o
-- lipsync, que cobra pelo ÁUDIO e não pelo vídeo).
--
-- ⚠️ AGREGADO vs UNITÁRIO. Os três preços semeados abaixo são TOTAIS DO
-- PERÍODO lidos no painel, divididos por nada: `fal-ai/sync-lipsync/v2` custou
-- US$ 3,20 em 2 chamadas, mas o painel não diz o preço de UMA. Enquanto
-- `unitario = false`, o número serve para ALERTAR e não para autorizar — ver
-- `precoConfiavel` em providerPrices.ts. O operador vai trazer o custo por
-- chamada do Request History; a coluna existe para receber sem migration nova.
CREATE TABLE IF NOT EXISTS provider_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A rota do fornecedor, exatamente como o código a chama — é a chave de
  -- junção com `provider_usage.endpoint_id` e com `fal_pipeline_steps`.
  endpoint_id text NOT NULL UNIQUE,
  vendor text NOT NULL,
  usd numeric NOT NULL CHECK (usd >= 0),
  unidade text NOT NULL CHECK (unidade IN ('per_second', 'per_call', 'per_audio_second')),
  origem text NOT NULL CHECK (origem IN ('PAINEL', 'DOC', 'DEDUZIDO')),
  -- Quando o número foi obtido — NÃO quando a linha foi escrita. Preço de
  -- fornecedor envelhece, e `created_at` responderia a pergunta errada.
  medido_em date NOT NULL,
  -- `false` = o valor é um TOTAL de período, não o preço de uma chamada.
  unitario boolean NOT NULL DEFAULT false,
  -- De onde veio, em uma linha. Vai para a tela ao lado do número.
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_prices_vendor_idx ON provider_prices (vendor);

COMMENT ON TABLE provider_prices IS
  'Precos por endpoint de fornecedor. Editavel sem deploy. `origem` distingue medicao (PAINEL) de promessa (DOC) de raciocinio (DEDUZIDO); `unitario=false` marca total de periodo, que ALERTA mas nao autoriza.';

-- ---------------------------------------------------------------------------
-- SEMENTE — só o que está MEDIDO no painel em 24/08, e marcado como AGREGADO.
--
-- Os três totais do período, com a contagem de chamadas do NOSSO diário ao
-- lado na `nota`: é ela que permite ao operador comparar com o Request
-- History sem refazer a arqueologia.
-- ---------------------------------------------------------------------------
INSERT INTO provider_prices (endpoint_id, vendor, usd, unidade, origem, medido_em, unitario, nota)
VALUES
  ('fal-ai/sync-lipsync/v2', 'fal', 3.20, 'per_audio_second', 'PAINEL', '2026-08-24', false,
   'TOTAL do periodo no painel, 2 chamadas nossas no diario. A regua declarava US$ 0,69 para elas -- possivel subestimacao de 4,6x, ou parte do total e teste manual do operador. NAO e preco unitario.'),
  ('fal-ai/nano-banana-2/edit', 'fal', 1.04, 'per_call', 'PAINEL', '2026-08-24', false,
   'TOTAL do periodo, 13 chamadas nossas. 13 x US$ 0,08 = US$ 1,04 -- bate AO CENTAVO com a regua, entao US$ 0,08 por imagem esta MEDIDO na pratica, mesmo com unitario=false por procedencia.'),
  ('wan/v2.6/image-to-video/flash', 'fal', 1.00, 'per_second', 'PAINEL', '2026-08-24', false,
   'TOTAL do periodo, 7 chamadas / 80s completos. A regua declarava US$ 2,00 -- SUPERESTIMA ~2x, tarifa real implicita ~US$ 0,0125/s. NAO e preco unitario.')
ON CONFLICT (endpoint_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- O motor do PREMIUM, por DOC — nao ha cobranca dele no painel.
--
-- Entra unitario=true porque a formula de tokens do fornecedor E o custo por
-- chamada, e nao um total de periodo: com input_video_duration=0 ela e linear
-- na duracao, entao 720x1280x24/1024 x US$ 0,0214/1000 = US$ 0,462240 por
-- segundo de saida. `origem: DOC` e o que diz ao leitor que isto e promessa
-- do fornecedor e nao medicao nossa.
--
-- ⚠️ Sem esta linha o tier Premium para de funcionar por CUSTO DESCONHECIDO —
-- e esse e o comportamento correto do W2, medido em 24/08: a guarda de tier
-- reprovou com "a etapa animar usaria bytedance/... que nao tem preco". O
-- endpoint nao pode ser autorizado sem preco cadastrado, entao cadastra-se o
-- preco DOCUMENTADO em vez de abrir excecao no codigo.
INSERT INTO provider_prices (endpoint_id, vendor, usd, unidade, origem, medido_em, unitario, nota)
VALUES
  ('bytedance/seedance-2.5/reference-to-video', 'fal', 0.462240, 'per_second', 'DOC', '2026-08-21', true,
   'Formula de tokens da doc publica: (720 x 1280 x segundos x 24) / 1024 tokens, a US$ 0,0214 por 1000. Com input_video_duration=0 e linear -> US$ 0,46224/s. NUNCA confrontado com fatura: nao ha linha de seedance-2.5 no painel. ~18,5x o Wan.')
ON CONFLICT (endpoint_id) DO NOTHING;
