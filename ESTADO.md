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

Atualizado em **12/08/2026**, HEAD `9cd1bc5` + o commit desta linha (desfecho dos 231 já LIDO).

---

## 1 · Onde o repositório está

*(o último commit desta lista é sempre o penúltimo do repositório: o próprio
commit que atualiza este arquivo não caberia dentro dele. `git log -3
--oneline` fecha a diferença.)*

```
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
| 3.5 · prova de contrato do upload | **BLOQUEADO — ver §1.2** |
| 4 · pipeline em série — parte 1 (orquestrador) | fechado (`5a6cbbc`+`94af14f`) |
| **4 · parte 2 — o ramo em `avatarProvider.ts:1007` — PRÓXIMO** | não começado |
| 5 · a tela | não começado |
| 6 · custo por camada, régua `(provider, model, resolution)` | não começado |

### 1.1 · BLOCO 4, o que falta

A **parte 2** é o ramo de despacho por vendor em `avatarProvider.ts:1007`, que
hoje atende só `heygen`/`did`. Enquanto ele não existir, o orquestrador não é
alcançável por usuário nenhum — que é o estado desejado até a tela existir.

Também pendente do BLOCO 4: `consumeLiveGeneration()` nas submissões pagas (o
`falClient` **não** o chama, de propósito — o orquestrador ainda não o chama
tampouco, e é ele quem deve).

### 1.2 · BLOCO 3.5 — bloqueado por credencial ausente, NÃO por erro

O upload real não aconteceu. **MEDIDO em 12/08, por três consultas
independentes: a chave da fal NÃO está no banco.**

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

> **REGRA — o filtro serve para iterar DENTRO de uma rodada, NUNCA para
> fechá-la.** Ele existe para que validar as guardas tocadas custe ~5 min em vez
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

**Passada de 12/08 noite, HEAD `faf7229`, 231 mutantes: COMPLETA E LIDA.**
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

- **2 MUTANTES PODRES, identificados por NOME (nunca por posição), medidos na
  passada de 12/08 noite.** As duas guardas rodam verdes no gate; o que falta é
  a prova de que reprovam.
  - `formato: suporte declarado precisa de evidência :: vendor sem evidência
    nenhuma passa a declarar suporte` — o `find` casa **2×** em
    `videoFormat.ts`. **Causa: o próprio BLOCO 2 (`9d2d1e6`)**, que acrescentou
    a linha da fal com `supported: false, evidence: "none"`. Ficou latente
    porque nenhuma passada completa rodou desde então. O conserto é dar contexto
    único ao `find` — não apagar a linha nova.
  - `passo 1: traje em preparo trava o Avançar :: a trava passa a valer também
    para o traje que falhou` — o `find` casa **0×**: a linha virou
    `const outfitPreparing = lookPendentes.some((p) => p.status ===
    "processing");` no commit `e483929`, anterior a esta série. Podre há mais
    tempo, e só apareceu agora porque as duas passadas anteriores morreram antes
    do mutante 165.
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
