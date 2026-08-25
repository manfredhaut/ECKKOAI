<!-- revisado-em: 86d98cf -->
# BACKLOG — o plano, versionado

> **Leia junto com o [ESTADO.md](ESTADO.md), na abertura de toda sessão.**
> O ESTADO.md diz onde o repositório ESTÁ; este arquivo diz para onde ele
> VAI, e o que trava cada coisa.
>
> **Por que ele existe (B0, 24/08/2026):** o plano vivia no chat. Três blocos
> — V0, W2 e W3 — foram passados numa sessão e **não chegaram à seguinte**:
> a conta trocou, o contexto foi embora, e a sessão nova recebeu itens 5 e 6
> de uma lista cujos itens 1 a 4 não existiam mais. Isso custou uma rodada
> inteira de "me passe o texto". Plano que mora em conversa não sobrevive a
> troca de conta.
>
> **Conferido por máquina:** `npm run estado` avisa quando o comentário
> `revisado-em` do topo deste arquivo fica para trás de um fechamento —
> mesmo mecanismo da âncora da §1 do ESTADO.md. Atualize o hash ao revisar.

**Estados:** `FILA` · `EM CURSO` · `FEITO` · `PARADO ESPERANDO DECISÃO` ·
`FORA DE ESCOPO`

---

## LINHA DE CORTE — o que fecha o simulado

Instrução do operador (24/08): **V0, W2 e W3 fecham o simulado. Nada além
disso entra antes.** O que for descoberto no caminho é REGISTRADO aqui, não
implementado.

| item | estado | o que o desbloqueia |
|---|---|---|
| **B0** · backlog versionado + conferência de frescor | `FEITO` | — |
| **V0** · paralelizar o arnês + worktree | `FEITO` | — |
| **W2** · preços em tabela, não em código | `FEITO` | falta só o custo POR CHAMADA do Request History para trocar AGREGADO por unitário — a tabela já recebe sem migration |
| **W3** · refações, avatar órfão, estorno, exit code | `FEITO` | — |

---

## ⭐ PRÓXIMA PRIORIDADE

| item | estado | o que o desbloqueia |
|---|---|---|
| **O custo POR CHAMADA do Request History da fal** — o operador traz o CSV (Usage → Export CSV) na próxima sessão | `FILA` | **acima de produção e do botão de Refazer, por decisão do operador (24/08).** É a peça que mais destrava: troca `unitario=false` (AGREGADO) por `true` em `provider_prices`, e com isso `custoDe` passa a AUTORIZAR pelo número do fornecedor em vez de pela régua do código. É o que resolve o **teto do R4.2**, hoje `PARADO`. Sem ela, os três preços do painel só alertam |

**O que fazer quando o CSV chegar:** um `UPDATE` por endpoint em
`provider_prices` — `usd` (o custo de UMA chamada), `unitario = true`,
`medido_em` e `nota` com a procedência. Nenhuma migration, nenhum deploy: a
tabela foi feita para receber isto. Depois disso, `custoDaEtapa` passa a usar
o preço do fornecedor e o teto do R4.2 pode ser calibrado.

## ⚠️ ACHADO NO W4 — bloqueia a demo do usuário novo

| item | estado | o que o desbloqueia |
|---|---|---|
| **Os cartões de NÍVEL ficam desabilitados para tenant zerado** — a tela lê `GET /credentials` (as linhas DO TENANT) e testa `vendor === "heygen"` / `=== "fal"`. Um tenant novo tem `vendor` VAZIO nas três linhas, então `podeEscolherSimples` e `podeEscolherFal` são ambos `false` e **os três cartões nascem travados** | `FILA` | o W1 consertou o SERVIDOR (que agora herda a chave de plataforma) e a TELA ficou para trás. O conserto é a tela perguntar pelo mesmo critério do servidor — o predicado precisa considerar a herança, não só a linha do tenant |

**Medido em 24/08** (`admin-3`, e mais 22 tenants no mesmo estado): as três
linhas de `api_credentials` têm `vendor = ''`. O servidor gera; a tela não
deixa escolher o nível. É o defeito que o W4 existe para achar — só aparece
percorrendo a tela, e não há guarda que o pegue porque os dois lados estão
"certos" isoladamente.

## PARADO ESPERANDO DECISÃO

| item | estado | o que o desbloqueia |
|---|---|---|
| **R4.2** · teto em dinheiro derivado da régua | `PARADO ESPERANDO DECISÃO` | a reconciliação régua × painel (R1). O W2 é o que a destrava: com preço por endpoint na tabela, `estimateVideoCost` para de devolver `known:false` para a fal |
| **P7.c** · 3 clipes encadeados, US$ 1,20 autorizados | `PARADO ESPERANDO DECISÃO` | ordem explícita do operador para executar. Tecnicamente destravado no LOCAL desde 24/08 (chave de plataforma da fal resolve, `source=platform`, final 2674) |
| **Apresentação: local ou `eckkoai.com`?** | `PARADO ESPERANDO DECISÃO` | decisão do operador. Ver "produção 46+ commits atrás" abaixo |
| **Premium sem prova** — o operador decidiu não pagar o Premium no teste real | `PARADO ESPERANDO DECISÃO` | **US$ 2,3112** — o teste pago MÍNIMO, e ele cobre só o trecho exclusivo. Ver a seção abaixo |

### Premium × Cena Composta — o que a decisão de não pagar deixa sem prova

**MEDIDO por leitura do código (24/08).** Os dois níveis compartilham
**cinco das seis etapas**; divergem em UMA.

| etapa | Cena Composta | Premium | mesmo? |
|---|---|---|---|
| 0 · publicar | storage `rest.fal.ai` | idem | **sim** |
| 1 · compor | `fal-ai/nano-banana-2/edit` | idem | **sim** |
| 2 · **animar** | `wan/v2.6/image-to-video/flash` | **`bytedance/seedance-2.5/reference-to-video`** | **NÃO** |
| 3 · narrar | ElevenLabs TTS | idem | **sim** |
| 4 · sincronizar | `fal-ai/sync-lipsync/v2` | idem | **sim** |
| 5 · biblioteca | local, sem rede | idem | **sim** |

Confirmado: são as três etapas conhecidas, nessa ordem, nos dois — e o
Premium diverge **só em `animar`**.

**O que SÓ o Premium exercita, e por isso fica sem prova:**

| o que | estado |
|---|---|
| o **id** `bytedance/seedance-2.5/reference-to-video` — sem prefixo `fal-ai/` por ANALOGIA com o Wan | **NÃO VERIFICADO.** O Wan precisou ter o prefixo removido, e o id errado custou dois 404 |
| o **corpo**: `image_urls` (lista, não `image_url`), `end_user_id`, `aspect_ratio`, `duration` **numérico** (o Wan manda string) | **NÃO VERIFICADO** |
| o **preço** pela fórmula de tokens (US$ 2,3112 / 4,6224 / 6,9336 para 5/10/15 s) | **DOCUMENTADO**, nunca confrontado com fatura |
| o **teto próprio** `PIPELINE_TETO_USD_PREMIUM = 10,00` | nunca exercitado com custo real |
| a **forma da resposta** — o código lê `saida.video.url`, e isso é o formato do Wan | **DEDUZIDO** |

**O teste pago MÍNIMO, e ele não é o vídeo inteiro: US$ 2,3112.**
`runFalPipelineDaImagem` partindo de uma imagem JÁ COMPOSTA (existem no
banco) com `pararApos: "animar"` e roteiro curto (5 s) paga **só o
`animar`** — nem `compor` (US$ 0,08), nem `narrar`, nem `sincronizar`.

⚠️ **E antes dele cabe um passo de US$ 0,00:** um **fusível** com corpo
inválido responde se o ENDPOINT EXISTE. Se o id estiver errado, volta 404 e
não há o que pagar — foi assim que os dois 404 do Wan foram diagnosticados
sem gastar. **A ordem certa é fusível (grátis) → decidir → US$ 2,3112.**

**Comparação para dimensionar:** o mesmo clipe de 5 s custa **US$ 0,1250**
no Wan. O Seedance é **18,5×** mais caro por segundo.

---

## FILA — registrado, não executado

| item | estado | o que o desbloqueia |
|---|---|---|
| **Produção 46+ commits atrás** — 7 migrations certas (058–064) + 5 prováveis (053–057), sem o cartão da fal | `FILA` | decisão sobre onde a apresentação acontece. O operador pediu para NÃO dimensionar agora |
| **Não sabemos que código roda em produção** — `/api/health` devolve só `{"status":"ok"}`, e o carimbo `/__image-stamp` cobre 4 arquivos: **75 dos últimos 200 commits produzem o mesmo hash** | `FILA` | nada — é barato (um campo no health ou no carimbo). Fora da linha de corte |
| **Validar ao gravar chave de plataforma** — desenho de duas etapas: o `PUT` responde já gravado e dispara a validação em seguida, com a tela indo de `GRAVADA` para `VALIDADA`/`RECUSADA` sozinha | `FILA` | nada. Proposto em 24/08, aprovado como ideia, fora da linha de corte |
| **Embeddings devolvem `Math.random()`** — `generateEmbedding` nunca consulta chave; `resolveEmbeddingKey()` não tem um chamador | `FILA` | implementar embeddings de verdade. **Decisão do operador (24/08): não escrever `servedBy` onde não há consumo** |
| **Formatos 16:9, 4:5 e 1:1 nunca testados** | `FILA` | um tiro pago por formato |
| **fal: existem Wan 2.7 e 3.0? qual o teto de duração de cada um?** Se algum passar de 15 s, o multi-clipe morre antes de nascer | `FILA` | **só depois do simulado.** É LEITURA do painel, custo zero |
| ~~Contar refações exige saber qual rota abriu~~ | `FEITO` | migration 066 acrescentou `origem`; os 5 call sites declaram |
| **Editar arquivo por script converte LF→CRLF no Windows** — `io.open` em modo texto traduz `
` para `os.linesep`. O índice fica LF, mas o GATE lê o working copy pelo bind mount, e guardas de recorte multi-linha quebram com sintoma que parece defeito de lógica (aconteceu 24/08, no `GenerateStep.tsx`) | `FILA` | uma guarda de EOL no working copy, ou usar `newline=""` sempre. O `.gitattributes` já declara `eol=lf` e não impede isto |

---

## DECISÕES TOMADAS — não reabrir

| decisão | quando | por quê |
|---|---|---|
| **A fal mantém `plataforma_vence`** — a chave de plataforma vence a BYOK do tenant, ao contrário da regra geral do W1 | 24/08 | alinhá-la à regra geral traria de volta a BYOK do `dev-c77a5b`, que é a chave do **401 de 19/08**, e re-bloquearia o P7.c. A divergência está declarada como campo em `HERANCA_DE_PLATAFORMA`, com mutante protegendo |
| **A plataforma paga quando o tenant não tem chave própria** — tenant COM chave própria continua pagando a dele | 24/08 | fecha o que o bloco CHAVES-2 deixou em aberto. Implementado no W1 |
| **Não escrever `servedBy` onde não há consumo** | 24/08 | o painel afirmaria um consumo que não existe. Vale para o cartão `embedding` |
| **Deploy e `eckkoai.com` ficam na fila** | 24/08 | a apresentação será decidida depois; não dimensionar agora |
| ~~Qual modelo o ElevenLabs faturou~~ | 04/08 | ENCERRADO como NÃO VERIFICADO — responder exige o fornecedor, não o nosso log |
| **Cenário por VÍDEO não existe na HeyGen; Avatar V não serve; presets de expressão não existem** | 06/08 | contrato do fornecedor, lido. Ver CLAUDE.md |

---

## FEITO — o que saiu, para não ser refeito

| item | quando | onde |
|---|---|---|
| **R5** · atribuição de gasto (`endpoint_id`, `key_source`, `estimated_cost_usd`) | 24/08 | migration 063 |
| **R6** · slot de voz rotativo (apagar, reclonar, teto lido do fornecedor) | 24/08 | migration 064 |
| **R7** · ensaio ponta a ponta com zero rede medida | 24/08 | `ensaioSimulado.ts` |
| **B0** · backlog versionado + conferência de frescor | 24/08 | este arquivo + `estadoAnchor.mjs` |
| **V0** · arnês paralelo (6 workers, worktree), 135 min → ~40 min | 24/08 | `gateRunner.mjs` |
| **W2** · preços em tabela, editáveis sem deploy | 24/08 | migration 065 + `providerPrices.ts` |
| **W3** · teto de 3 refações, órfão resolvido, estorno visível, exit code | 24/08 | migration 066 + `checkRefacoesPolicy.ts` |
| **R8** · âncora do ESTADO.md conferida por máquina | 24/08 | `tools/estadoAnchor.mjs` |
| **W0** · o quadro dos dois ambientes | 24/08 | ESTADO.md §18 |
| **W1** · tenant zerado nasce funcionando + selo de 5 estados | 24/08 | `platformInheritance.ts` |
| **P7-obstáculo-1** · gasto da corrida gravado | 23/08 | migration 062 |
