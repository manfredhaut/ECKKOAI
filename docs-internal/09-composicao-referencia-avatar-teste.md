# Composição de referência do avatar de teste — 31/08/2026

Memória de engenharia, NÃO documentação de produto — vive em `docs-internal/`
(raiz do repositório) de propósito, para nunca alcançar o copiloto
(`checkDocsInternalPolicy.ts` prova isso por execução).

## O que é

A imagem composta **oficial e permanente** para os testes de vídeo com o
avatar "TESTE REAL 15:40 01/08" (`7557957c-d22f-4fba-a1e0-c19f07f47536`),
tenant `dev-c77a5b` (`c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd`).

**URL:** `https://v3b.fal.media/files/b/0aa87c2a/invwgbw2J0_v3jahS3Y1j_jPD6Kvvf.png`

**Confirmada por `request_id`:** `01a0556e-d809-73c1-8327-5c967e4f2fbb`
(tabela `fal_pipeline_steps`, coluna `raw_response`) — MEDIDO, `content-length`
da URL (1.473.740 bytes) bate exatamente com o arquivo local salvo durante a
geração (V16, "tentativa 2" / "Composição 2").

## Por que esta, e não outra

RODADA V16 (31/08/2026): 3 composições geradas em paralelo, mesma foto de
rosto (`FOTO AVATAR TESTE MANFRED.png`, 1200×1599, fora do repositório),
mesmo cenário (corredor neon) e traje (jaqueta jeans + echarpe) já
aprovados, mesma frase de cabelo calibrada no meio-termo ("sparse, thin
gray hair strands visible at both temples..."). O operador escolheu esta
(pose sentada casual, mais recostada) por mostrar cabelo grisalho fino
visível e CONSISTENTE nas duas têmporas — nem careca total (RODADA 13b),
nem remendo demarcado demais (RODADA 13).

## Regra para sessões futuras

**Não recompor esta imagem sem necessidade real.** Se uma sessão futura
precisar da imagem composta deste avatar para testes de vídeo (animar,
concatenar, etc.), usar a URL acima diretamente — reservar uma nova
composição (~US$0,08 cada, e cada rodada de calibração já visitada custou
dinheiro real) só se o cenário/traje/foto mudarem de verdade.

**Risco conhecido:** URLs `v3b.fal.media` podem expirar/parar de resolver
com o tempo (não é CDN permanente do nosso lado). Se esta URL parar de
responder (`HEAD` != 200), a imagem precisa ser recomposta — mas SÓ nesse
caso, não por rotina.
