# ESTADO — leia isto ANTES de qualquer coisa

Ponto de entrada de toda sessão. Escrito para o assistente, não para humano:
sem introdução, sem repetir o que o código já diz, cada afirmação marcada
**MEDIDO** / **DEDUZIDO** / **NÃO VERIFICADO**.

**Divisão com o CLAUDE.md, fixada em 12/08:** aqui fica o que é OPERACIONAL e
muda a cada sessão — onde o repositório está, como invocar, os gotchas do
arnês, o que está por verificar. Lá fica o ACUMULADO HISTÓRICO — o que foi
medido, o que custou dinheiro, o procedimento de desarme, as decisões de
fornecedor. Nada é duplicado de propósito: duas cópias garantem que uma
envelheça em silêncio.

**Este arquivo é atualizado no ÚLTIMO commit de TODA sessão.** Se a data abaixo
for mais velha que o último commit, ele está desatualizado — conserte antes de
qualquer outra coisa.

Atualizado em **13/08/2026** (fecho do BLOCO B2), HEAD `bcba0c3` + os dois
commits que fecham a rodada (o do mutante da G-a e o desta linha).

---

## 1 · Onde o repositório está

*(o último commit desta lista é sempre o penúltimo do repositório: o próprio
commit que atualiza este arquivo não caberia dentro dele. `git log -3
--oneline` fecha a diferença.)*

```
54bb282  BLOCO 3.5: o teto de gasto, a sonda de contrato, e a chave que ainda não chegou
2cd2987  Arnês: mutante podre passa a aparecer no commit, não 80 min depois
c0e57f7  ESTADO.md: o desfecho dos 231 foi lido — 229/231, zero INERTE, 2 podres
9cd1bc5  ESTADO.md: o desfecho dos 231 e o bloqueio do 3.5 viram o começo da próxima
faf7229  Arnês: o gate podia estourar o buffer e virar AMBÍGUO com a guarda saudável
94af14f  CORREÇÃO: duas das três guardas do pipeline nasceram INERTE e AMBÍGUA
5a6cbbc  BLOCO 4 parte 1: o orquestrador em série, sem rota e sem ramo
d49463e  Memória: o número do arnês passa a ser MEDIDO, e some a duplicação
c88b187  ESTADO.md: o desfecho da passada dos 227 vira o primeiro comando da próxima
4ea9fd7  Arnês: filtro explícito, retry de spawn, e um ponto de entrada por sessão
cbe0e10  BLOCO 3: o cliente da fal nasce preso à fila, ao catálogo e ao tenant
```

⚠️ **A mensagem de `5a6cbbc` AFIRMA que os 4 mutantes foram provados; não
foram** — a prova veio depois e devolveu 1/4. `94af14f` corrige e declara.
Ao ler aquele commit, leia os dois.

**ORDEM DE EXECUÇÃO do plano v6:**

| bloco | estado |
|---|---|
| 1 · chave da fal no painel | fechado (`9d2d1e6`) |
| 2 · a chave não vaza por nenhum lado | fechado (`9d2d1e6`) |
| 3 · `falClient` (upload, submit, poll, result) | fechado (`cbe0e10`) |
| 3.5 · prova de contrato | fechado (`e886c5d`) — o contrato está MEDIDO, ver §1.3 |
| 4 · pipeline em série — parte 1 (orquestrador) | fechado (`5a6cbbc`+`94af14f`) |
| 4 · parte 2 — o ramo por vendor | fechado no **B2** (ver §1.4) |
| **B3 · onde o débito mora, e o caminho de produto — PRÓXIMO** | ver [PROXIMA-RODADA.md](PROXIMA-RODADA.md) |
| 5 · a tela (aprovação da imagem composta) | não começado |
| 6 · custo por camada, régua `(provider, model, resolution)` | não começado |

### 1.1 · BLOCO 4, o que falta

> ⚠️ **SUPERADA pela §1.4 (B2).** A parte 2 está fechada: o ramo existe, e o
> orquestrador continua inalcançável por usuário — agora por DECISÃO explícita
> (o porteiro), e não por ausência de código. O que segue valendo desta seção é
> só o parágrafo do `consumeLiveGeneration()`.

~~A **parte 2** é o ramo de despacho por vendor em `avatarProvider.ts:1007`, que
hoje atende só `heygen`/`did`.~~

Segue pendente: `consumeLiveGeneration()` nas submissões pagas (o `falClient`
**não** o chama, de propósito — o orquestrador tampouco, e é ele quem deve). O
ramo da fal está FORA do `withLiveBudget`, e a razão está na §1.4.

### 1.2 · A FIAÇÃO DA TELA NÃO ALCANÇA A FAL — medido em 13/08

> ⚠️ **PARCIALMENTE SUPERADA pela §1.4 (B2).** Três dos seis pontos abaixo
> deixaram de valer: cenário e traje agora ATRAVESSAM até o provider (item 1e),
> o rosto sai de `photo_urls` **pelo fluxo** e não só pela sonda, e o ramo por
> vendor existe. O que continua exato é o descompasso ESTRUTURAL (`generateVideo`
> devolve job id + polling; `runFalPipeline` é síncrono) — é ele que faz o B3
> ser construção, e é por isso que o porteiro recusa a fal na rota.

**A chave está semeada e o contrato da fal foi medido de verdade** (ver §1.3).
O que impede um vídeo sair de "Criar vídeo direto" é a FIAÇÃO, e ela é assim:

- **Cenário vai para `background{type,value}` — campo do HeyGen.** Não há
  caminho para o `image_urls[]` do `nano-banana-2/edit`.
- **Traje vai para `avatar_look_id` — look do HeyGen**, que lá SUBSTITUI o
  avatar. **Não chega à fal.**
- **O rosto usado nas composições veio de `photo_urls` do avatar cadastrado**,
  lido direto pela sonda — **não de upload do fluxo**.
- **`generateVideo` devolve `providerJobId` + polling em `setInterval`;
  `runFalPipeline` é SÍNCRONO e tem 3 `request_id`.** É descompasso
  ESTRUTURAL: o ramo em `avatarProvider.ts:1007` é **CONSTRUÇÃO** (estado novo
  em `videos`, rota de aprovação, tela), **não refiação**.
- **O teto de 95 caracteres NÃO é cobrado**: tela e rota usam **1960** (180 s).
  O 95 só existe dentro do pipeline, que nenhum caminho de produto chama.
- **Crédito de avatar do tenant `c77a5b8a` está em 10**, concedido pelo caminho
  normal (`dev:grant-credits`), com saldo e ledger conferindo.
- **Chave da fal semeada** (`api_credentials`, provider avatar, vendor fal,
  last_four **cc1c**). O **backup cifrado da HeyGen** daquele tenant está em
  `uploads/_prova/backup-credenciais/heygen-c77a5b8a.enc` — a HeyGen NÃO deve
  ser restaurada (decisão do v6).
- **Gasto da sessão de 13/08: ~US$ 0,24. Saldo restante ~US$ 4,46.**

⚠️ **A composição pendente foi DESCARTADA pelo operador** — rosto de outro
avatar, cenário e traje nunca chegaram à fal. As 3 corridas em
`fal_pipeline_runs` estão `failed` com o motivo escrito, 1 etapa cada: nenhuma
passou de `compor`. **Nada de Wan, TTS ou lipsync rodou.**

### 1.3 · BLOCO 3.5 — o contrato da fal, MEDIDO

**A chave foi semeada em 13/08** (estava no ambiente como `FAL_KEY`, não
`FAL_API_KEY`) e o pipeline chamou a fal DE VERDADE. O contrato saiu de
DEDUZIDO para MEDIDO, e duas suposições estavam erradas:

1. **`falPoll` MONTAVA a URL de status — e a montada devolve 405.** O caminho
   usa o app id **BASE** (`fal-ai/nano-banana-2`), sem o sub-path (`/edit`). A
   fila devolve `status_url`/`response_url`/`cancel_url` prontas: **seguir é o
   contrato**. Corrigido em `e886c5d`.
2. **`resolution: "720p"` é inválido no nano-banana** — ele exige
   `0.5K|1K|2K|4K`. Agora são duas constantes (`RESOLUCAO_IMAGEM = "1K"`
   MEDIDO, `RESOLUCAO_VIDEO = "720p"` NÃO VERIFICADO no Wan).

⚠️ **E o achado que muda como se lê a fila: `COMPLETED` NÃO significa sucesso.**
A submissão inválida voltou **200 / IN_QUEUE**, o status foi a **COMPLETED**, e
só o **RESULTADO** trouxe o 422 — com `inference_time: 0.058`, o tempo de não
ter feito nada. Quem lê só o status segue para a etapa seguinte, que custa 12×
mais.

**MEDIDO no caminho feliz:** `IN_QUEUE` → `IN_PROGRESS` (HTTP **202**) →
`COMPLETED` (200); `images[0].url` como o pipeline assume; `num_images:1`
devolvendo 1 imagem; `resolution:"1K"` → 1195×896; `inference_time` de 7,99 s e
21,40 s em duas composições. Host dos artefatos: **`v3b.fal.media`** — o mesmo
das gerações que o operador aprovou fora do produto.

**O upload NÃO é tarifado e funciona**: `initiate` 200 com `file_url` +
`upload_url`, header `Authorization: Key` aceito, `PUT` 200.

**Todo o resto está pronto:** teto duro no orquestrador, `pararApos` por etapa,
a sonda (`probeFalPipeline.ts`) e o semeador (`seedFalKey.ts`). O passo a passo
com os comandos exatos está em **[PROXIMA-RODADA.md](PROXIMA-RODADA.md)** — é
por ele que se começa.

**MEDIDO nas duas rodadas, por consultas independentes:**

- `SELECT count(*) FROM api_credentials WHERE vendor='fal'` → **0**
- nenhuma linha de `api_credentials` tocada desde 09/08
- `platform_credentials` contém **só** `elevenlabs`

O caminho de gravação existe e aceita `fal` desde o BLOCO 2:
`PUT /admin/tenants/:tenantId/credentials/:provider` com `provider=avatar` e
`vendor=fal` (`adminPanel.ts`). **A rota do TENANT não serve** — `PUT
/credentials/:provider` devolve 403 `managed_by_platform` desde a migração
BYOK→plataforma.

⚠️ **Atenção ao gravar:** a rota faz `ON CONFLICT (tenant_id, provider) DO
UPDATE`, e o par é (tenant, provider) — **um tenant tem UMA credencial de
`avatar`**. Gravar `fal` num tenant que já tem `heygen` SUBSTITUI a chave da
HeyGen dele. Use um tenant de teste, ou aceite a troca conscientemente.

Assim que a chave existir, o 3.5 é: `falUpload()` com um arquivo pequeno,
`initiate` + `PUT`, e confrontar a resposta crua com o que o `falClient`
assume (nomes de campo, formato do header `Authorization: Key`, forma do
`file_url`, status). **O upload não é tarifado** — é a única chamada real que
esta fase autoriza.

### 1.4 · BLOCO B2 — o caminho da fal alcança o produto, e PARA na composição

**Fechado em 13/08.** Custo: **US$ 0,00** — nenhuma chamada a fornecedor, nem
uma. A prova é por fixture, por `fetch` substituído e por `pararApos`.

**A DECISÃO DO RECOVERY, registrada como decisão e não como acidente:** nesta
rodada a composição **NÃO cria linha em `videos`**. Ela grava só em
`fal_pipeline_runs`/`fal_pipeline_steps`. Motivo MEDIDO por leitura:
`recovery.ts:211` encerra como `recovery_orphan` qualquer vídeo sem
`provider_job_id`, **em qualquer idade** — e uma corrida que para em `compor`
não tem job id de VÍDEO nenhum para dar. Sem linha em `videos`, não há colisão.

**Consequência aceita: o débito único no `compor` SAI desta rodada e vira
decisão do B3.** Não foi esquecimento — é o preço da decisão acima: o débito
vive na rota, a rota não é o caminho que alcança a fal hoje, e inventar um
débito no orquestrador criaria um segundo lugar que cobra.

**A fal está FORA de `VENDORS_WITH_GENERATION_PATH`, mesmo tendo ramo.** É a
mesma decisão vista da rota: `POST /videos` INSERE a linha em `videos` antes de
chamar o provider, então deixar passar produziria exatamente a colisão que a
decisão evita. Quem alcança o ramo hoje é a **sonda**, que não passa pela rota.
Ligar o caminho de produto é o B3, e ele começa decidindo onde o débito mora.

**O TETO DE 95 CARACTERES deixou de ser literal.** Agora é
`floor(PIPELINE_TARGET_SECONDS × PIPELINE_CHARS_PER_SECOND ÷ (1 + 0,1436))` =
`floor(108,9 ÷ 1,1436)` = `floor(95,2256)` = **95**. Divide-se (em vez de
multiplicar por 0,8564) porque o teto é o que cabe no clipe **no pior caso do
ritmo**: se a voz sair 14,36% mais lenta, os 95 caracteres ainda cabem nos 10 s.

⚠️ **A dispersão de 14,36% é NÃO VERIFICADA neste repositório.** Ela foi FIXADA
no desenho do B0+B1 e a medição que a produziu não está registrada aqui —
nenhuma tabela deste projeto a reproduz (as seis gerações do caminho HeyGen
dispersam ~12%, sobre outra régua, com dois fatores). Ela ganhou nome
(`PIPELINE_RITMO_DISPERSAO`) exatamente para a origem poder ser cobrada depois:
um `95` solto não tinha onde pendurar a dúvida. **A disputa do 10,89 NÃO foi
reaberta** — não era desta rodada.

**O que ficou de pé, item a item:**

| item | o que é | onde |
|---|---|---|
| 1a | porteiro do vendor **antes** do débito, 403 sem tocar em crédito | `vendorCatalog.ts`, `routes/videos.ts` |
| 1b | ramo `if (input.vendor === "fal")` ACIMA do ternário, que fica intacto | `avatarProvider.ts` |
| 1c | `publicarEntradas` em série, cada `file_url` como etapa **ordem 0** | `falPipeline.ts` |
| 1d | `image_urls = [rosto, traje?, cenário?]` sobre colunas que já existiam | `falPipeline.ts`, `avatarProvider.ts` |
| 1e | o fio: `scenario`/`outfit` saem da tela e chegam ao provider | `GenerateStep.tsx`, `routes/videos.ts` |
| 1f | `pararApos: "compor"` é o default; a URL da imagem vai ao diário | `falPipeline.ts` |
| 1g | teto de 95 DERIVADO | `falPipeline.ts` |
| 1h | `_arnes-logs/` no `.gitignore` por nome | `.gitignore` |

**`publicarEntradas` roda ANTES do primeiro `autorizarGasto`, e a ordem é a
propriedade.** Publicar não custa (upload não tarifado, MEDIDO em 13/08);
autorizar é o freio da primeira etapa paga. O caso ruim de inverter não é
gastar à toa — é a corrida ser autorizada, um upload falhar no meio, e sobrar
uma corrida `failed` que já passou pelo porteiro do dinheiro. Falha de upload
fecha a etapa como `failed` com motivo `upload_failed` e custa zero.

**Em SÉRIE, e não em paralelo:** a ordem das `image_urls` é significativa para o
`nano-banana`, e em paralelo ela passaria a ser decidida pela ordem de
conclusão — variando de corrida para corrida sem nada no código dizendo isso.

**AS TRÊS GUARDAS, PROVADAS REPROVANDO (3/3, MEDIDO em 13/08):**

- `vendor sem caminho de geração é recusado antes do débito`
- `publicarEntradas roda antes do primeiro autorizarGasto`
- `o ramo da fal não altera o ternário did/heygen`

Log: `_arnes-logs/mutants-b2-guardas-2026-08-13-b.log`. Arnês passou de **234
para 237 mutantes**.

⚠️ **`if (false && …)` NÃO SERVE COMO MUTANTE — MEDIDO nesta rodada.** O
TypeScript trata o corpo como inalcançável, para de propagar o narrowing para
dentro dele, e o gate sai **2 pelo `tsc`**: o arnês devolveu **AMBÍGUO** com a
guarda saudável e sem ela ter opinado. Custou uma passada. O mutante que
funcionou antecipa o débito — mesma inversão sobre o que a guarda mede, numa
linha contígua que compila.

**G-c mede FORMA, e isso está declarado no fonte.** Transformar o `if` num
terceiro braço do ternário não muda comportamento nenhum — heygen, did e vendor
desconhecido continuam indo para o mesmo lugar, e nenhuma corrida distingue as
duas versões. O que ela mede por EXECUÇÃO é o despacho (fal alcança o pipeline,
did não alcança); o que mede por forma é o ternário estar inteiro.

**Duas guardas EXISTENTES precisaram de conserto, e as duas foram efeito
colateral desta rodada — o gate as pegou em segundos:**

1. `checkFalPipelinePolicy` media "`crus[0]` é o corpo do fornecedor", e a
   publicação passou a gravar antes dela. A propriedade não mudou; o filtro
   passou a ser por conteúdo em vez de por posição. **Provada reprovando à mão**
   com o mutante que ela já tinha.
2. O mutante `fal entra na lista de sondas sem ganhar uma` passou a casar **2×**:
   `VENDORS_WITH_GENERATION_PATH` tem corpo idêntico ao de
   `VENDORS_WITH_CONNECTION_PROBE`. Ganhou CONTEXTO ÚNICO (a linha do `export`).
   **Segunda vez** que este `find` precisa disso — o conserto é dar contexto,
   nunca apagar a linha nova do produto.

**O QUE FICOU FORA, e é escolha declarada:**

- **Débito de crédito no caminho da fal** — B3, junto com a decisão de onde ele
  mora.
- **`consumeLiveGeneration()` nas submissões pagas da fal.** O ramo está FORA do
  `withLiveBudget`: o orçamento de sessão conta GERAÇÕES de vídeo, e esta
  corrida para em `compor`. O freio dela é o teto em dólares, que soma antes de
  cada etapa paga.
- **`awaiting_approval`, rota de aprovação e tela** — BLOCO 5.
- **`pollFalRun` e retomada após morte do processo** — não foi desta rodada.
- **`mutants:dirty` não existe neste repositório.** O P2 o pedia; no lugar dele,
  as guardas foram provadas à mão durante o desenvolvimento e por **passada
  filtrada** depois do commit — e nenhuma mensagem de commit afirmou prova antes
  de ela existir.

## 2 · Decisões fechadas — não reabrir

Só as do caminho da fal. As de fornecedor (HeyGen: fundo, Avatar V, presets de
expressão) e o procedimento de desarme estão no CLAUDE.md — **não os duplique
aqui.**

- **Fila, sempre.** `queue.fal.run` é a única base de submissão. `fal.run`
  síncrono não devolve `request_id`, e sem ponteiro um processo morto perde
  trabalho já pago. O host síncrono está **fora** de `HOST_DO_VENDOR` em
  `checkNetworkEgressPolicy` de propósito, para ser a segunda rede.
- **Catálogo fechado.** Endpoint fora de `VENDOR_ENDPOINTS` não é alcançável; a
  recusa acontece **antes** do `fetch`.
- **A chave da fal vem do TENANT** (`api_credentials`, par avatar+fal), via
  `getCredential`. `platform_credentials` **não tem consumidor** neste caminho —
  MEDIDO, e supor o contrário custou um dia em 09/08.
- **`docs-internal/` é memória de engenharia** e fica fora de todo copiloto.

## 3 · Os gotchas do arnês — cada um já custou uma conclusão errada

1. **`| tee` engole o código de saída.** MEDIDO duas vezes. Uma passada que
   abortou com exit 2 foi reportada como exit 0. **Leia o LOG, nunca o exit do
   pipeline.**
2. **`expect` é TRANSCRITO da mensagem que a guarda emite, nunca parafraseado.**
   Descrever o defeito em vez de citar a guarda já fez guarda saudável aparecer
   como AMBÍGUA quatro vezes.
3. **CRLF.** O working copy vem em CRLF e os mutantes são escritos com `\n`. O
   runner normaliza; um `find` multi-linha escrito fora dele casa zero vezes.
4. **Árvore suja aborta a passada com exit 2.** Não há como rodar o arnês sobre
   código não commitado — `git status` é a única prova de que a reversão
   funcionou. Corolário caro: **uma passada em background trava a sessão
   inteira**, porque qualquer edição a mata no mutante seguinte.
5. **`fixture` esconde defeito.** Guarda que precisa exercitar caminho pago roda
   com `PROVIDER_MODE=live` e `globalThis.fetch` substituído, restaurando os
   dois no `finally`. Em fixture o caminho inteiro é desviado e a guarda não
   mede nada. **O gate precisa de `-e PROVIDER_MODE=fixture` na invocação** —
   sem isso ele herda o modo do container e nasce vermelho quando armado.
6. **Guarda ancorada no USO, âncora INTRÍNSECA.** Nunca ancorar recorte em
   wrapper de layout (`</Field>`): o recorte vaza para o bloco seguinte e a
   guarda acusa o vizinho. Toda guarda de recorte carrega rede anti-vazamento.
7. **Mutante se identifica por NOME, nunca por posição.**
8. **AMBÍGUO pode ser estouro de buffer, não guarda ruim.** MEDIDO em 12/08: a
   saída do gate chega a 1.071.347 bytes e o default do `execFileSync` é 1 MiB
   — truncado, o stdout perde a mensagem da guarda, que sai no fim. Corrigido
   em `faf7229` (`maxBuffer` no `runGate`). Se um AMBÍGUO aparecer, **meça o
   tamanho da saída antes de reescrever a guarda**: quantos falsos AMBÍGUOS
   isso já causou é NÃO VERIFICADO.
9. **Guarda de ORDEM só é observável quando a interpretação FALHA.** Duas
   guardas deste projeto nasceram inertes por medir ordem entre passos que não
   mudam: ler um campo não produz passo observável. A corrida que mede é a do
   corpo em forma inesperada — ali "gravou antes" e "gravou depois" viram
   estados distintos.
10. **Log de passada NUNCA em `/tmp`** (= `%TEMP%` no Windows): já foi apagado
   por fora com o processo escrevendo nele, e o watcher ficou cego. Duas cópias,
   em `_arnes-logs/`, com nome datado.

## 4 · Invocações exatas

**Gate** (~21 s, MEDIDO):
```bash
docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check
```

**Passada COMPLETA** — 20,84 s/mutante MEDIDO, ~79 min para 227. Exige árvore
limpa:
```bash
npm run check:mutants
```

**Passada FILTRADA** — carimba no começo E no fim quantos foram pulados:
```bash
npm run check:mutants -- --guard "fal:"
```
`--guard` e `--name` são repetíveis, seleção pela UNIÃO. Filtro que não casa
nada aborta com exit 2 em vez de terminar verde sem verificar nada.

> **REGRA (13/08, substitui a anterior) — a passada AFETADA fecha rodada; a
> COMPLETA roda fora do horário de trabalho.**
>
> ```bash
> npm run check:mutants -- --affected --base <ref-do-inicio-da-rodada>
> ```
>
> A seleção é DERIVADA do `git diff`, nunca de escolha humana: entra o mutante
> cujo ALVO foi tocado, o cujo arquivo de GUARDA foi tocado, e todos os de
> AMBIENTE (que vigiam o que não aparece em diff). **MEDIDO em 13/08:** 3
> arquivos tocados → 8 de 234 mutantes → **1,9 min**, contra ~82 min da
> completa. Uma rodada maior (16 arquivos) seleciona 47 → ~16 min.
>
> **A troca só é honesta por causa da conferência de cadastro:** o único
> defeito que só a completa pegava era mutante podre, e ele agora aparece no
> gate em segundos.
>
> ⚠️ **A COMPLETA é OBRIGATÓRIA antes de qualquer rodada que gaste dinheiro.**
> Uma etapa paga é irreversível; entrar nela sem o arnês inteiro verde é apostar
> a carteira numa cobertura parcial.
>
> **Antiga, ainda válida para o filtro manual:** `--guard`/`--name` servem para
> iterar DENTRO de uma rodada, NUNCA para fechá-la. Ele existe para que validar as guardas tocadas custe ~5 min em vez
> de 79. Fechar rodada com passada filtrada é declarar verde o que não foi
> exercitado. **Toda rodada termina com a passada COMPLETA em background**, sem
> filtro, e o ponteiro do log entra na §5 abaixo.
>
> **E lance-a por ÚLTIMO.** Pelo gotcha 4, ela trava a árvore: qualquer commit
> ou edição depois de arrancar a mata. MEDIDO em 12/08 — a passada lançada ao
> fim da sessão anterior ainda estava em 38/227 quando a seguinte começou, e foi
> preciso matá-la para trabalhar.

**Listar sem mutar:** `npm run check:mutants -- --list`

**Desarme:** procedimento e os 5 critérios estão no CLAUDE.md. Confira SEMPRE
antes de tocar em qualquer coisa — `live` gasta dinheiro real.

## 5 · Desfecho da última passada completa — LEIA ISTO PRIMEIRO

*(preenchido no último commit de cada sessão)*

**A rodada do B2 fechou com a passada AFETADA: 73/73, zero INERTE, zero
AMBÍGUO, zero ERRO, zero FALHOU.** `--affected --base 22e644f` → 12 arquivos
tocados → **73 de 237** mutantes selecionados (164 pulados). Log em
`_arnes-logs/mutants-b2-afetada-final-{a,b}.log`, duas cópias, md5
`8802b134cd32204f1cc72106264e3b85` nas duas. Árvore limpa em cada reversão.

Os **três mutantes das guardas novas** estão entre os 73 e reprovaram: log
próprio em `_arnes-logs/mutants-b2-guardas-2026-08-13-b.log`.

⚠️ **A PRIMEIRA tentativa desta mesma passada MORREU aos 37/73**, com
`status: 3221225794` (`0xC0000142`, a falha de spawn do Windows) no log. A
causa foi o **timeout de 10 minutos** em que ela estava envolvida: a passada
leva ~25 min. A árvore voltou limpa e nada ficou aplicado, mas aquele log **não
vale como desfecho**. **Passada do arnês roda em BACKGROUND, sem timeout em
volta** — o gotcha 10 fala de onde gravar o log; este fala de como lançá-la.

🔴 **DÍVIDA, que segue aberta e é PRÉ-CONDIÇÃO do B3: a passada COMPLETA.** A
última completa e válida continua sendo **234/234 de 13/08 de manhã** (HEAD
`23dce3a`), e o arnês está em **237**. A afetada cobre o que esta rodada tocou,
não o resto — e o B3 é a rodada que gasta dinheiro.

```bash
npm run check:mutants
```

**A última COMPLETA (13/08 manhã, HEAD `23dce3a`) fechou 234/234, 100% verde**
— zero INERTE, zero AMBÍGUO, zero ERRO. O diff desde então é o contrato da fal
(`e886c5d`), a sonda (`5595280`), os commits de ESTADO e **o BLOCO B2 inteiro**.

---

**Passada anterior, de 12/08 noite, HEAD `faf7229`, 231 mutantes: COMPLETA E LIDA.**
`mutants-231-2026-08-12-a.log` (cópia `-b` idêntica, md5 `a89b6440…`).

| desfecho | n |
|---|---|
| ok | **229** |
| INERTE | **0** |
| AMBÍGUO | 0 |
| FALHOU | 0 |
| ERRO (mutante desatualizado) | **2** |

Sem carimbo de PULADOS — completa. Retry de spawn: **não disparou nenhuma
vez** (segunda passada seguida sem ocorrência; o 0xC0000142 não se repetiu).

**Os 2 ERRO estão nomeados na §7 e NÃO foram consertados** — é a regra:
mutante desatualizado para a passada de prova daquela guarda, e consertar no
mesmo fôlego em que se descobre é como se troca uma prova por outra sem
ninguém conferir.

**Nada aqui bloqueia o BLOCO 4 parte 2.** Zero INERTE significa que nenhuma
guarda ficou verde com o defeito aplicado; as duas de `ERRO` continuam
rodando no gate, o que não têm hoje é prova de que reprovam.

**A passada anterior (227, HEAD `c88b187`) foi INCOMPLETA** — chegou a
**38/227, todos `ok`**, zero INERTE/AMBÍGUO/ERRO, e foi morta pela sessão
seguinte para liberar a árvore. Retry de spawn: **nunca disparou** nos 38.
Aquele log está em `mutants-227-2026-08-12-a.log` e não vale como desfecho.

## 6 · NÃO VERIFICADO

- **A fal.ai INTEIRA, o upload inclusive.** Nenhuma chamada real saiu deste
  repositório até 12/08 — o 3.5 foi bloqueado por credencial ausente (§1.2). As
  formas de resposta (`file_url`, `upload_url`, `request_id`, `status_url`,
  vocabulário de status, `images[].url`, `video.url`) são todas da documentação,
  e os três ids de modelo vieram por escrito. Um id errado vira 404, não
  cobrança.
- **`sync_mode: "loop"` foi escolhido por ELIMINAÇÃO, não por medição.** Sabe-se
  o que `cut_off` faria no caso inverso (cortar a fala); o que `loop` faz quando
  o vídeo é MAIS LONGO que o áudio — que é o caso desta fase, 10 s de clipe para
  ~8,72 s de fala — não está documentado nem foi observado.
- **A régua de 10,89 car/s desta fase.** Não é medição deste projeto: é o número
  desta fase, e não se mistura com `CHARS_PER_SECOND` (12,8151) nem com
  `VOICE_SPEED` (0,85).
- **Os vídeos que o operador aprovou foram feitos na fal.ai e não há registro
  nenhum disso aqui** — quatro varreduras deram zero. Qual modelo e qual prompt
  os produziram é informação que só ele tem.
- **O arnês não se auto-testa.** Não existe guarda nem mutante cobrindo
  `tools/run-mutants.mjs`. Filtro e retry de spawn foram provados por script no
  scratchpad.
- **Por que a passada de 11/08 levou 3 h 50.** Os ~65 s/mutante eram uma
  divisão, não uma medição, e o número real é 20,84 s — mas o tempo de parede
  daquele dia foi real e nenhuma medição sobreviveu para explicá-lo.
- **A régua de custo única erra até 10×.** `HEYGEN_VIDEO_COST` usa
  `unitsPerBilledSecond: 3` para tudo, sustentado por três medições que são
  todas de photo avatar 720p na HeyGen.

## 7 · Dívidas abertas

- ~~2 MUTANTES PODRES~~ **CONSERTADOS em 13/08** (`2cd2987`), e agora há guarda
  que os pega em segundos no `npm run check` em vez de 80 min na passada. O
  histórico do que eram:
  - `formato: suporte declarado precisa de evidência :: vendor sem evidência
    nenhuma passa a declarar suporte` — o `find` casa **2×** em
    `videoFormat.ts`. **Causa: o próprio BLOCO 2 (`9d2d1e6`)**, que acrescentou
    a linha da fal com `supported: false, evidence: "none"`. Ficou latente
    porque nenhuma passada completa rodou desde então. O conserto é dar contexto
    único ao `find` — não apagar a linha nova.
  - `passo 1: traje em preparo trava o Avançar :: a trava passa a valer também
    para o traje que falhou` — casava **0×**: a linha foi renomeada em
    `e483929`.
- **DÍVIDA DE RECONCILIAÇÃO, aberta e sem explicação inventada:** o plano v6
  anota ~US$ 1,14 nos testes A/B e o painel da fal mostra **US$ 5,30 em 7 dias
  com 12 requisições**. Nenhuma hipótese registrada — os preços do
  `providerCost.ts` estão marcados **DOCUMENTADO** até uma fatura ser conferida.
- 🔴 **O DÉBITO DO CAMINHO DA FAL FICOU FORA DO B2, e é decisão adiada, não
  esquecimento.** A composição não cobra crédito de tenant nenhum. A razão está
  na §1.4: a rota (que é quem debita) recusa a fal de propósito, e criar um
  débito dentro do orquestrador abriria um SEGUNDO lugar que cobra. **Escolher
  onde ele mora é o primeiro passo do B3**, e as três saídas estão listadas em
  [PROXIMA-RODADA.md](PROXIMA-RODADA.md).
- **O débito de crédito acontece ANTES da chamada ao fornecedor** — MEDIDO por
  leitura: `debitCredit` em `routes/videos.ts:1088`, `generateVideo` em `:1174`.
  Com crédito de avatar zerado o clique morre no crédito sem chegar à fal, e o
  erro parece falha de pipeline. Precisa ser resolvido antes do fluxo por
  produto (BLOCO 4 parte 2). A SONDA não passa por aqui: ela não consome
  crédito de tenant nem orçamento live, só o teto em dólares.
- **`voiceId: avatar.voice_id` (`routes/videos.ts:1179`) não tem guarda ancorada
  no uso.** Trocá-lo por um id fixo passa o gate inteiro.
- **Cenário e traje são coletados, persistidos e nunca enviados.** Não há campo
  no contrato do fornecedor; a proposta registrada é REMOVER o passo. Decisão do
  operador, não executada.
- **`deriveVariantsForVideo` existe, tem guardas verdes e zero chamadores** fora
  dos scripts.
- **4 mutantes DEVIDOS** do congelamento de 05/08, por NOME: `a estimativa volta
  a sair da duração pedida`, `o ritmo vira número digitado em vez de derivado da
  medição`, `o teto de confirmação some do veredito do servidor`, `o player
  volta a mostrar a duração pedida`.
- **Paralelizar o arnês está BLOQUEADO**, e a causa é o bind mount: o container
  monta caminhos fixos (`./backend/src:/app/src`), então um git worktree em
  outro diretório **não é visto por ele** — MEDIDO em 12/08. Sem worktree
  visível não há como dar a cada worker sua própria árvore, e paralelizar na
  mesma árvore corrompe a passada em silêncio. Destravar exige tocar
  `docker-compose.yml`.
