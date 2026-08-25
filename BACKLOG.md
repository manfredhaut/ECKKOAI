<!-- revisado-em: 141ca3f -->
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

## ✅ ACHADO NO W4 — CONSERTADO NO DISCO em `bc38394`, a confirmar NA TELA

| item | estado | o que o desbloqueia |
|---|---|---|
| **Os cartões de NÍVEL ficam desabilitados para tenant zerado** — a tela lê `GET /credentials` (as linhas DO TENANT) e testa `vendor === "heygen"` / `=== "fal"`. Um tenant novo tem `vendor` VAZIO nas três linhas, então `podeEscolherSimples` e `podeEscolherFal` são ambos `false` e **os três cartões nascem travados** | `FEITO NO DISCO — NÃO CONFIRMADO NA TELA` (rótulo corrigido no F0, 25/08: estava `FILA` embora `bc38394` já o tivesse consertado em 24/08 às 21:58) | o W1 consertou o SERVIDOR (que herda a chave de plataforma) e a TELA ficou para trás. **O conserto saiu como previsto:** a tela parou de reimplementar a regra e passou a perguntá-la — `GET /videos/tier-availability`, que responde pela MESMA cadeia (`vendorRequiredByTier` + `getCredentialForVendor`) que a criação usa para RECUSAR, e nunca devolve o nome do fornecedor. **O que falta é só a confirmação humana na tela** — que é o A1, e que só agora pode acontecer, porque até o F0 o navegador servia o bundle anterior a este commit |

**Medido em 24/08** (`admin-3`, e mais 22 tenants no mesmo estado): as três
linhas de `api_credentials` têm `vendor = ''`. O servidor gera; a tela não
deixa escolher o nível. **Resíduo notado no F0, sem gravidade e NÃO consertado:** o `useEffect` que troca o tier indisponível ainda guarda por `credentials === null` ([GenerateStep.tsx:302](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:302)) enquanto os predicados já vêm de `tiersDisponiveis` — se `/credentials` responder primeiro, o efeito roda com os dois predicados `false` e **não faz nada**, e roda de novo quando a disponibilidade chega (está nas deps). Resultado idêntico; a guarda é que ficou ancorada na variável de antes. É o defeito que o W4 existe para achar — só aparece
percorrendo a tela, e não há guarda que o pegue porque os dois lados estão
"certos" isoladamente.

## 🔎 ACHADOS DO PERCURSO ASSISTIDO PELA TELA (24–25/08) — A1 a A6

**Modo:** o OPERADOR clica, o assistente rastreia o log. **Nenhum destes foi
consertado**, por ordem explícita: o operador manda consertar tudo de uma vez
no fim do percurso, e aí sai UM commit. Origem completa, com a causa medida de
cada um: [RETOMAR-TESTE.md](RETOMAR-TESTE.md).

## ⛔ TODOS OS SEIS ESTÃO `INVALIDADO — MEDIDO SOBRE BUNDLE VELHO`

**Nenhum destes tem status hoje.** O percurso 1–4 inteiro foi medido com o
container servindo um `GenerateStep.tsx` anterior a dois commits (W3.1b e
W4.1): `Up 35 hours (unhealthy)`, **1300 sondas seguidas** acusando `frescor
do Vite`, `RestartCount=0`. Observação feita sobre código que não é o do disco
não vale como observação — vale como pergunta.

Isso **não** quer dizer que os seis sejam falsos. Quer dizer que cada um
precisa cair numa de duas caixas, e a tabela já faz isso onde houve leitura:

- **o bundle PODE explicar** — comportamento decidido em tempo de execução por
  código que mudou (A1);
- **o bundle NÃO explica** — texto ou constante idêntica no disco e no bundle
  velho (A2, A3). Estes são defeitos de **hoje**, e reconferir é formalidade,
  não investigação.

**O ambiente foi destravado no F0** (25/08, commit desta rodada):
`server.watch.usePolling` no `vite.config.ts` — o watcher do Vite não enxerga
bind mount no Windows, e sem polling o `restart` conserta até a próxima edição
e volta a divergir calado.

| item | gravidade | o quê | causa | estado |
|---|---|---|---|---|
| **A1** | 🔴 | cartões **Normal e Premium cinzas** no passo 4, tenant `passada-zerada`, com a rota devolvendo `{"simples":true,"normal":true,"premium":true}` | **MEDIDA: bundle velho.** O navegador executava o predicado anterior (`/credentials` + `vendor === "heygen"`); o conserto do W4.1 está no disco e correto. Mesmo defeito da seção "ACHADO NO W4" abaixo, consertado em `bc38394` | `INVALIDADO — MEDIDO SOBRE BUNDLE VELHO`. **O bundle PODE explicar por inteiro.** Reconferir: os três cartões devem nascer habilitados. Se continuar cinza, é defeito novo e investiga-se do zero |
| **A2** | 🔴 | a mensagem diz *"**Um** dos níveis acima ainda não está disponível para esta conta"* com **dois** bloqueados | **MEDIDA por leitura de `GenerateStep.tsx`:** `{(!podeEscolherSimples \|\| !podeEscolherFal) && <p>tierUnavailable</p>}` — texto fixo que não conta. A hipótese de que o motivo fosse o teto de 15 s está **REFUTADA**: não há checagem de duração nenhuma; o motivo é credencial/disponibilidade, e *"para esta conta"* está certo | `INVALIDADO — MEDIDO SOBRE BUNDLE VELHO`, mas **o bundle NÃO explica**: a frase é literal e não conta em versão nenhuma. Ela some da tela quando os três cartões destravarem — o defeito continua armado para o próximo tenant de um vendor só |
| **A3** | 🔴 | Premium precifica **US$ 14,19 para 28,5 s** num nível cujo teto é **15 s** | **ORIGEM MEDIDA (F0, 25/08) — é FRONTEND e é LITERAL, não cálculo:** [`GenerateStep.tsx:132`](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:132), `{ value: "premium", range: "US$ 14,19" }` dentro de `TIER_OPTIONS`. O comentário logo acima declara a régua: *"A faixa é a mesma da tabela decidida na sessão do sistema de tiers (**30 s de referência**)"*. Entrou em `c066168` (BLOCO A) e **nunca foi tocada desde** (`git log -S "14,19"` devolve esse único commit). O teto de 15 s é do SERVIDOR: `PIPELINE_DURACAO_MAXIMA` ([falPipeline.ts:60](backend/src/services/video/falPipeline.ts:60)), porque `duration` é enum `"5"\|"10"\|"15"` no fornecedor e **este pipeline não emenda clipes** | `INVALIDADO — MEDIDO SOBRE BUNDLE VELHO` na forma, **mas o bundle NÃO explica nada**: a string é idêntica no disco e no bundle velho. **Defeito real HOJE.** E são DOIS, não um: (1) a faixa é ancorada em **30 s** num nível que anima no máximo **15 s** — cita o dobro do que entrega; (2) ela é constante, não reage ao roteiro, então os "28,5 s" da tela e os "US$ 14,19" do cartão vêm de duas fontes que não se falam |
| **A4** | 🟡 | passo 3: o campo **Interpretação** trunca em **600/600** no meio da palavra (`"…Leg"`), **sem aviso nenhum** | não investigado | `INVALIDADO — MEDIDO SOBRE BUNDLE VELHO`, a reconferir |
| **A5** | 🟡 | **traje/cenário aparecem em quatro lugares** — passo 1: "Adicionar traje" (Look), "Cenário padrão", "Traje deste vídeo"; passo 3: "Fundo" + dropdown "Traje". Contradiz a decisão de **pacote visual único**, e a própria tela do passo 3 admite que *"Fundo por vídeo não está disponível"* | não investigado | `INVALIDADO — MEDIDO SOBRE BUNDLE VELHO`, a reconferir. **Pedido do operador: levantar só o MAPA** de qual campo alimenta o quê e o que é redundante. **Não redesenhar** |
| **A6** | 🟢 | passo 2: o campo **"Gerar com IA"** é pequeno e corta o texto digitado | não investigado | `INVALIDADO — MEDIDO SOBRE BUNDLE VELHO`, a reconferir |

**O que o log registrou nos passos 1–4: nenhum erro, nenhum 4xx/5xx.** Quatro
eventos — `voice_sample_rejected` ×2 (`reason: voice_exists`, recusa correta e
de graça), `voice_sample_normalized` (8.447.054 B, `pcm_s16le`, mono, 24 kHz,
`input == output`), `voice_id_replaced`, e `script_duration` (40 palavras →
17,1 s estimados, alvo 30 s, `attempts: 2`, `truncated: false`).

**Falta percorrer:** o clique em **Gerar** · **Refazer** (primeira prova humana
do teto de 3 refações do W3) · **Galeria**.

---

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
