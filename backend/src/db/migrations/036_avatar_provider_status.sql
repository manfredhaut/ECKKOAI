-- Estado do avatar DO LADO DO FORNECEDOR.
--
-- Medido na primeira passada live (bloco DEMO-3): a resposta de criação da
-- HeyGen volta com `avatar_item.status = "processing"`. O avatar existe, já foi
-- cobrado (~US$ 1), e ainda NÃO está pronto para gerar vídeo. Até aqui nada no
-- código sabia disso: o fluxo seguia direto para a geração como se estivesse
-- pronto.
--
-- NULL é deliberadamente "não sei", e não "em treino". Todos os avatares que já
-- existem — inclusive o avatar live utilizável que a demo vai usar — ficam com
-- NULL, e o portão de geração LIBERA nesse caso. Um valor default de
-- 'processing' teria travado exatamente o avatar que precisa funcionar amanhã,
-- em nome de uma informação que não temos sobre ele.
--
-- Valores: 'ready' | 'processing' | 'unknown' | NULL.
-- 'unknown' é gravado quando perguntamos ao fornecedor e não conseguimos
-- entender a resposta — e também libera, pela mesma razão: uma suposição nossa
-- errada não pode impedir o cliente de usar o que ele pagou.
ALTER TABLE avatars ADD COLUMN provider_status text;

COMMENT ON COLUMN avatars.provider_status IS
  'Estado do avatar no fornecedor: ready | processing | unknown | NULL (desconhecido, libera geração).';
