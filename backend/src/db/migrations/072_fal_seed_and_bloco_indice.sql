-- V30, itens 1-2 -- pre-requisitos para retomar um video fracionado sem
-- regerar blocos ja pagos.
--
-- seed_wan (fal_pipeline_runs): o seed Wan desta corrida, gerado uma vez na
-- ABERTURA da corrida (abrirCorrida) e reutilizado em toda retomada. Antes
-- desta migration, gerarSeedWan() era Math.random() em memoria, nunca
-- persistido (falPipeline.ts) -- um bloco retomado numa invocacao NOVA do
-- processo sortearia um seed DIFERENTE dos blocos ja pagos, quebrando a
-- "assinatura visual" entre eles (achado do V29, item 4). NULL para toda
-- corrida existente (nunca gravada antes) -- essas corridas nao sao
-- retomaveis por este mecanismo; `lerSeed()` gera e grava um seed novo na
-- primeira leitura se encontrar NULL, de forma que nenhum chamador precisa
-- tratar o caso ausente.
--
-- bloco_indice (fal_pipeline_steps): o indice (0-based) do bloco de
-- animacao que esta etapa representa, para um video Normal fracionado em
-- N blocos. NULL para toda etapa que nao seja um bloco de animacao
-- fracionada (publicar, compor, narrar, sincronizar, biblioteca, e tambem
-- o `animar` de um video que coube num bloco so). Antes desta migration,
-- `ordem` era sempre o literal 2 para TODO bloco `animar` -- "qual bloco e
-- este" so se inferia contando linhas por created_at, inferencia que nao
-- sobrevive a uma retomada fora de ordem ou a uma linha perdida.
ALTER TABLE fal_pipeline_runs
  ADD COLUMN seed_wan integer;
ALTER TABLE fal_pipeline_steps
  ADD COLUMN bloco_indice integer;
