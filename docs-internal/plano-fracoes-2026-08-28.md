# Plano — vídeos >15s em Normal/Premium (fracionamento)

**PLANEJAMENTO, NÃO IMPLEMENTAÇÃO.** Nenhum código foi escrito ou alterado
para produzir este documento. Base: leitura de código de hoje
(`falPipeline.ts`, `providerCost.ts`, `scriptDuration.ts`, `ffmpeg.ts`) +
achados já registrados do POC standalone `POC-MOTORES/05-fracoes/` (fora
deste repositório, sessão de 21/08/2026). HEAD `84d6c25a8a1a597a3cbeb42d1e1fee6b782660e2`.
Nenhuma chamada a vendor foi feita nesta rodada.

O problema de origem: `PIPELINE_DURATION_OPTIONS = [5, 10, 15]` segundos
([falPipeline.ts:60](../backend/src/services/video/falPipeline.ts#L60)) é o que o Wan (`wan/v2.6/image-to-video/flash`)
aceita por chamada, e `conferirRoteiro()` ([falPipeline.ts:723-739](../backend/src/services/video/falPipeline.ts#L723)) RECUSA
qualquer roteiro que exija mais de 15s — hoje, sem emenda de clipes.

---

## 1. Mecanismo de fracionamento

**A régua de caracteres/segundo já existe e é reaproveitável tal como está:**
`PIPELINE_CHARS_PER_SECOND = 10.89` e `PIPELINE_RITMO_DISPERSAO = 0.1436`
([falPipeline.ts:79,91](../backend/src/services/video/falPipeline.ts#L79)) alimentam
`PIPELINE_MAX_CHARS_POR_DURACAO` ([falPipeline.ts:111-116](../backend/src/services/video/falPipeline.ts#L111)) — o teto de
caracteres por duração, já calculado no pior caso do ritmo:

| Duração do bloco | Teto de caracteres |
|---|---|
| 5 s | 47 |
| 10 s | 95 |
| 15 s | 142 |

**O que NÃO existe hoje: um separador de texto por fronteira de frase.**
Busquei por qualquer utilitário de split por sentença em `backend/src` e não
encontrei nenhum — `escolherDuracao()` ([falPipeline.ts:127-132](../backend/src/services/video/falPipeline.ts#L127)) e
`conferirRoteiro()` trabalham sobre o roteiro INTEIRO, nunca fatiado. Um
fracionador precisaria de lógica NOVA: um empacotador guloso (greedy) que
acumula frases (separadas por `.`, `!`, `?`, e possivelmente reticências)
até que a próxima não caiba no teto de caracteres do maior bloco disponível
(142), fecha o bloco ali, e recomeça. Caso ÚNICO A TRATAR: uma frase sozinha
maior que 142 caracteres — hoje isso já é recusado no vídeo inteiro
(`conferirRoteiro` lança), e um fracionador precisaria de uma decisão própria
(cortar a frase de qualquer jeito, ou continuar recusando esse caso).

**Quantos blocos, na prática — estimativa, não contagem exata** (depende de
onde caem as fronteiras de frase reais do roteiro; os números abaixo usam
`chars = segundos × 10,89` para o total de fala, dividido pelo teto de 142
caracteres do bloco de 15s, arredondado para cima):

| Duração alvo | Caracteres estimados (10,89 c/s) | Blocos de 15s (mínimo teórico) | Nota |
|---|---|---|---|
| 30 s | ≈327 | 3 | 2×15s cobrem só 284 car. — não fecha 327; precisa de um 3º bloco (pode ser curto) |
| 45 s | ≈490 | 4 | 3×15s cobrem 426 car. — precisa de um 4º |
| 60 s | ≈654 | 5 | 4×15s cobrem 568 car. — precisa de um 5º |

Esses números são o PISO — respeitar fronteira de frase quase sempre produz
folga desperdiçada em algum bloco (uma frase que quase cabe em 142 caracteres
mas empurra o próximo bloco), então o número real tende a ser igual ou um
pouco maior. **Escopo: MÉDIO** — ver seção 6.

---

## 2. Continuidade — cenário/traje/avatar entre blocos

**Resposta direta à pergunta "recompor por bloco ou reusar a mesma imagem
composta": nenhuma das duas — o POC já testou uma terceira opção e ela
funcionou.** `compor` (`nano-banana-2/edit`) roda **UMA VEZ só**, para o
PRIMEIRO bloco. Do segundo bloco em diante, a entrada de animação não é nem
a imagem composta original nem uma nova composição — é o **último frame do
vídeo do bloco anterior**, extraído por `ffmpeg`.

Isso está PROVADO no POC (`POC-MOTORES/05-fracoes/`, sessão 21/08/2026, fora
deste repositório): `frame-final-1.png` foi extraído de `fracao-1.mp4` e
usado como imagem de entrada de `fracao-2.mp4`, nos dois motores testados
(Seedance e Wan) — ver `README-CONTINUIDADE.md` nesse diretório, seção
"POC-FRACOES-1"/"POC-FRACOES-2". Cenário, traje e identidade do avatar se
preservam POR CONSTRUÇÃO com essa técnica: o frame de entrada do bloco N é
literalmente um recorte do vídeo já gerado do bloco N-1, então qualquer
cenário/traje que apareceu ali persiste sem precisar ser reafirmado por
prompt.

**Por que reusar a MESMA imagem composta original em todos os blocos NÃO
funcionaria bem:** a pessoa se move dentro do bloco 1 (o motor de animação
existe para produzir movimento) — reusar a imagem-base original para o
bloco 2 ignoraria esse movimento e o vídeo "voltaria" à pose inicial a cada
corte, produzindo um salto visível.

**Por que recompor a cada bloco seria pior, não só mais caro:** o
`nano-banana-2/edit` não promete determinismo (comentário já registrado no
código deste repositório, [avatarProvider.ts linha citada na doc de tiers](pipelines-tiers-2026-08-28.md)) — duas
composições do "mesmo" cenário/traje podem sair visualmente diferentes
(iluminação, enquadramento), e cada recomposição custaria mais US$0,08.

**O que isso exige de NOVO no código deste repositório (nenhum existe hoje):**
- Uma função de extração do último frame de um vídeo (`ffmpeg -sseof` ou
  equivalente) — `services/video/ffmpeg.ts` já tem o runner genérico
  (`runFfmpeg()`, [ffmpeg.ts:96](../backend/src/services/video/ffmpeg.ts#L96)) e a leitura de geometria
  (`probeVideo()`, [ffmpeg.ts:49](../backend/src/services/video/ffmpeg.ts#L49)) reaproveitáveis; a função de
  extração em si não existe.
- Upload desse frame extraído de volta à fal como nova imagem de entrada
  (`falUpload`, já existe e é genérico — [falClient.ts](../backend/src/services/providers/falClient.ts), reaproveitável sem
  mudança).
- Orquestração de N chamadas `animar` em sequência, cada uma dependendo do
  resultado da anterior — hoje `animarNarrarSincronizar()` ([falPipeline.ts:1209-1269](../backend/src/services/video/falPipeline.ts#L1209))
  assume UMA chamada de animação só.

**Escopo: MÉDIO-GRANDE** — ver seção 6.

---

## 3. Emenda dos vídeos

**O que o POC testou e validou: concatenação simples por `ffmpeg`, sem
função nativa de continuidade em nenhum motor.** Não foi encontrada, nem
usada, nenhuma API de "continuação" nos dois motores testados — a técnica
inteira é a extração+encadeamento de frame descrita na seção 2, seguida de
concat.

- **Seedance:** os dois clipes saíram com o MESMO codec/resolução/fps
  exatos (h264 Constrained Baseline, 1280×720, 24fps) e a concatenação foi
  DIRETA, sem recodificar (`composto-mudo-10s.mp4`). Nenhum corte visível
  encontrado na checagem por amostragem de quadros.
- **Wan:** o motor **não reproduziu a mesma dimensão de pixel exata** entre
  as duas chamadas mesmo pedindo `resolution="720p"` nas duas (1284×716 na
  fração 1, 1286×716 na fração 2 — 2px de diferença de largura) — foi
  preciso RECODIFICAR antes de concatenar. Nenhum corte visível encontrado
  também.
- **Áudio:** nas duas comparações, o lipsync final (`sync-lipsync/v2`) rodou
  **UMA VEZ**, sobre o vídeo mudo JÁ CONCATENADO inteiro, com a voz clonada
  completa — não uma vez por bloco. Isso é relevante para o custo (seção 4):
  a etapa mais cara depois de `animar` não precisa multiplicar por bloco.

**Sobre "Wan 2.7" e uma suposta referência combinada de sujeito e voz —
NÃO ENCONTRADO.** Procurei por esse termo em todo o repositório TWINAI, no
diretório `POC-MOTORES` inteiro (incluindo o brief HTML de engines) e nos
arquivos de planejamento do nível acima (`BACKLOG.md`). O único achado
relacionado é uma pergunta ainda EM ABERTO, nunca respondida:
`BACKLOG.md:172` — *"fal: existem Wan 2.7 e 3.0? qual o teto de duração de
cada um? Se algum passar de 15s, o multi-clipe morre antes de nascer"* —
status `FILA`, ação prevista "**só depois do simulado.** É LEITURA do
painel, custo zero". Ou seja: **não há pesquisa prévia registrada sobre uma
capacidade nativa do Wan 2.7 de referência combinada de sujeito+voz** — se
essa informação existe, ela não está em nenhum arquivo que eu consegui ler
nesta rodada. Recomendo tratar como não verificado até uma leitura real do
catálogo da fal (a mesma ação já prevista no BACKLOG, custo zero).

**Escopo: PEQUENO** para a concatenação em si (`runFfmpeg()` já existe;
falta só a função de concat) — ver seção 6.

---

## 4. Custo

Preços de lista de hoje ([providerCost.ts](../backend/src/services/billing/providerCost.ts), "DOCUMENTADO, não
MEDIDO" para tudo que é fal — mesma ressalva já registrada no código):
`comporUsd: 0.08` (uma vez), `animarUsdPorSegundo: 0.025` (Wan),
`sincronizarUsdPorSegundoDeAudio: 0.05`, `custoSeedanceUsd(d) ≈ 0,462×d`
(Seedance, fórmula por token).

**Arquitetura assumida para a conta abaixo (a que o POC validou): `compor`
1×, `animar` N× (uma por bloco), `sincronizar` 1× sobre o áudio completo.**
Isto NÃO é uma decisão tomada aqui — é a arquitetura que o POC provou
funcionar; a alternativa (recompor e/ou ressincronizar por bloco) está
descartada na seção 2/3 por motivo técnico, não por preferência.

### Tier Normal (Wan) — `compor + animarUsdPorSegundo×D + sincronizarUsdPorSegundoDeAudio×D`

| Duração | Custo estimado | Hoje recusaria? |
|---|---|---|
| 30 s | 0,08 + 0,75 + 1,50 = **US$ 2,33** | Sim — acima de `PIPELINE_TETO_USD` (US$ 2,00) |
| 45 s | 0,08 + 1,125 + 2,25 = **US$ 3,46** | Sim |
| 60 s | 0,08 + 1,50 + 3,00 = **US$ 4,58** | Sim |

`PIPELINE_TETO_USD = 2.0` ([providerCost.ts:531](../backend/src/services/billing/providerCost.ts#L531)) foi dimensionado para
o pior caso de UM clipe (~US$0,77, margem ~2,6×). Para 60s, um teto com
margem proporcional parecida ficaria em torno de **US$ 9-12**.

### Tier Premium (Seedance) — `compor + custoSeedanceUsd(D) + sincronizarUsdPorSegundoDeAudio×D`

| Duração | Custo estimado | Hoje recusaria? |
|---|---|---|
| 30 s | 0,08 + 13,86 + 1,50 = **US$ 15,44** | Sim — muito acima de `PIPELINE_TETO_USD_PREMIUM` (US$ 10,00) |
| 45 s | 0,08 + 20,79 + 2,25 = **US$ 23,12** | Sim |
| 60 s | 0,08 + 27,72 + 3,00 = **US$ 30,80** | Sim |

`PIPELINE_TETO_USD_PREMIUM = 10.0` ([providerCost.ts:552](../backend/src/services/billing/providerCost.ts#L552)) foi
dimensionado para o pior caso de UM clipe de 15s (~US$7,58, margem ~1,3×,
deliberadamente menor "porque o motor Premium é caro o bastante para que
uma folga generosa custe caro" — comentário do próprio código). Para 60s,
com a MESMA margem de 1,3×, o teto ficaria perto de **US$ 40**; com a margem
maior do Normal (~2,6×), perto de **US$ 80**. A diferença entre as duas
margens hoje é ~18,5× de preço por segundo entre os dois motores — o mesmo
fator que já separa os dois tetos atuais.

**Nota sobre o "mínimo por chamada" do `sync-lipsync/v2`:** este ponto já
está registrado como NÃO VERIFICADO no próprio código
([ensaioSimulado.ts](../backend/src/scripts/ensaioSimulado.ts), lista de pendências no fim do script). Se existir um
mínimo por chamada, rodar `sincronizar` UMA VEZ (em vez de por bloco) já é a
opção mais barata possível — reforça a arquitetura da seção 2/3, não muda a
tabela acima.

**Reconciliação com saldo real da fal:** continua não existindo (mesmo
achado já documentado em `docs-internal/pipelines-tiers-2026-08-28.md`,
seção 6 de Normal/Premium) — todos os números desta seção são projeção
sobre preço de lista, nunca confirmados contra fatura ou painel.

---

## 5. Aprovação humana — duas opções, sem decisão tomada aqui

O mecanismo de parada já existe no código (`pararApos: "compor"` /
`"animar"` / `"narrar"`, [falPipeline.ts:646](../backend/src/services/video/falPipeline.ts#L646)) e o POC já registrou uma
decisão PARA O CASO DE UM CLIPE SÓ (README-CONTINUIDADE.md, seção "Aprovação
humana no pipeline"): Modo A (aprova só a imagem inicial, resto roda
sozinho) é o padrão de lançamento; Modo B (aprova também o vídeo mudo antes
de voz+lipsync) ficou como opção configurável, não implementada. Essa
decisão foi tomada para UM bloco — com fracionamento, a pergunta se repete
em nova forma:

### Opção A — aprovação só na composição do 1º bloco (como hoje, sem mudança de UX)
- **Prós:** fluxo idêntico ao atual; menos cliques; nenhuma tela nova.
- **Contras:** o usuário só vê a imagem-base ANTES de qualquer segundo ser
  animado. Se o bloco 3 de 5 sair com um gesto ruim (o motor não promete
  determinismo), os blocos 1-3 inteiros já foram pagos antes de alguém
  perceber — para 60s/Premium, isso pode significar ~US$18-20 já gastos
  (3 blocos de ~US$6-7 cada) antes da primeira chance de intervir.

### Opção B — aprovação por bloco (ou ao menos do vídeo mudo final antes do lipsync)
- **Prós:** dá para interromper cedo se um bloco sair errado, sem pagar os
  blocos seguintes; alinhado ao "Modo B" já cogitado no POC, só que
  generalizado para N blocos em vez de 1.
- **Contras:** N cliques em vez de 1 — para 60s isso são ~5 aprovações
  numa única geração; a semântica de "Refazer" ([videos.ts:2417-2471](../backend/src/routes/videos.ts#L2417),
  hoje pensada para UM bloco) precisaria decidir se "refazer" reabre só o
  bloco atual ou desfaz também os posteriores já aprovados — pergunta em
  aberto, não resolvida aqui.

Nenhuma das duas foi escolhida neste documento.

---

## 6. Esforço estimado por item

| Item | O que mudaria | Escopo |
|---|---|---|
| **1. Fracionamento** | Nova função de empacotamento guloso por fronteira de frase, reaproveitando `PIPELINE_CHARS_PER_SECOND`/`PIPELINE_MAX_CHARS_POR_DURACAO` ([falPipeline.ts](../backend/src/services/video/falPipeline.ts)) como constantes de capacidade. Precisa decidir o caso de frase única >142 caracteres. | **MÉDIO** |
| **2. Continuidade** | Nova função de extração de último frame (`services/video/ffmpeg.ts`, reaproveitando `runFfmpeg()`/`probeVideo()` já existentes); nova orquestração de N chamadas `animar` sequenciais em `falPipeline.ts` (hoje `animarNarrarSincronizar()` assume uma só); upload do frame extraído via `falUpload()` (já existe, sem mudança). Provavelmente exige nova forma de registrar N etapas "animar" em `fal_pipeline_steps`/`fal_pipeline_runs` (migration) — hoje o esquema assume etapas nomeadas fixas (compor/animar/narrar/sincronizar), não uma lista. | **MÉDIO-GRANDE** |
| **3. Emenda** | Nova função de concat via `ffmpeg` (reaproveitando `runFfmpeg()`); precisa lidar com o caso medido no POC de dimensões divergentes entre chamadas do Wan (recodificar antes de concatenar, não copiar direto). | **PEQUENO** |
| **4. Custo/teto** | `PIPELINE_TETO_USD`/`PIPELINE_TETO_USD_PREMIUM` ([providerCost.ts](../backend/src/services/billing/providerCost.ts)) deixam de ser constantes fixas e passam a depender da duração total (fórmula, não número); guardas que hoje assumem um teto fixo por corrida (`checkCostPolicy.ts`, `checkFalGastoInstrumentadoPolicy.ts`, `checkFalTierPolicy.ts`) precisariam de revisão. | **PEQUENO-MÉDIO** (a fórmula em si é simples; o raio de guardas afetadas é o que cresce) |
| **5. Aprovação** | Opção A: quase nenhuma mudança de UX (só estender o que já existe para N blocos internos, invisíveis ao usuário). Opção B: novas telas, novos estados de `videos.status` por bloco, redesenho de `/approve`/`/recompose` para granularidade de bloco. | **PEQUENO** (opção A) **ou GRANDE** (opção B) — depende da decisão do item 5 |

**Nenhum destes itens foi implementado.** Este documento é só o levantamento
pedido, para decisão do usuário sobre por onde começar (se começar).

---

*Documento gerado por leitura de código e de registros de POC já existentes
em 28/08/2026. Nenhuma chamada a vendor foi feita nesta rodada.*
