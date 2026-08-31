-- O PREÇO do endpoint NOVO da migração do item 2 (29/08/2026) --
-- `wan/v2.6/reference-to-video/flash` substituiu `wan/v2.6/image-to-video/
-- flash` como motor de animação do tier Normal. Sem uma linha aqui, o W2
-- (migration 065) recusa a etapa "animar" por CUSTO DESCONHECIDO ANTES de
-- qualquer chamada paga -- o comportamento CORRETO do freio, não um bug: um
-- endpoint sem preço cadastrado não é autorizado sozinho.
--
-- `unitario=true`, `origem='DOC'` -- mesma decisão já tomada para o Seedance
-- (migration 065, bloco final): a tarifa por segundo do fornecedor É o custo
-- por chamada (não um total de período a diluir), então o número já é
-- unitário por construção, mesmo sem nenhuma fatura real ainda.
--
-- US$ 0,025/s -- LIDO por WebFetch em 29/08 nos dois documentos do
-- fornecedor: <https://fal.ai/models/wan/v2.6/reference-to-video/flash/api>
-- ("generate_audio=False: Generate silent video (25% price of standard R2V)")
-- + <https://fal.ai/models/wan/v2.6/reference-to-video> ("Your request will
-- cost $0.10 per second for 720p"). 0,10 x 0,25 = 0,025 -- o MESMO número já
-- usado em código para o endpoint antigo (`PRECOS_FAL.animarUsdPorSegundo`,
-- providerCost.ts), porque o preço do flash mudo não mudou entre os dois
-- modos (image-to-video e reference-to-video) na doc do fornecedor.
INSERT INTO provider_prices (endpoint_id, vendor, usd, unidade, origem, medido_em, unitario, nota)
VALUES
  ('wan/v2.6/reference-to-video/flash', 'fal', 0.025, 'per_second', 'DOC', '2026-08-29', true,
   'Formula da doc: standard R2V US$0,10/s (720p) x 25% para generate_audio=false = US$0,025/s. NUNCA confrontado com fatura real -- endpoint migrado nesta rodada, sem chamada paga ainda no momento desta semente.')
ON CONFLICT (endpoint_id) DO NOTHING;
