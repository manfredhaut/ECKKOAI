# ESTADO — leia isto ANTES de qualquer coisa

Este arquivo substitui a recontextualização. É escrito para o assistente, não
para humano: sem introdução, sem repetir o que o código já diz, e cada
afirmação marcada **MEDIDO** / **DEDUZIDO** / **NÃO VERIFICADO**.

Ele é atualizado no **ÚLTIMO commit de toda sessão**. Se a data do último
commit for mais recente que a deste arquivo, ele está desatualizado — confie no
`git log` e conserte isto antes de fechar a sessão.

Atualizado em **12/08/2026**, HEAD `cbe0e10` + o commit desta rodada.

---

## 1 · Onde o repositório está

```
cbe0e10  BLOCO 3: o cliente da fal nasce preso à fila, ao catálogo e ao tenant
9d2d1e6  BLOCO 2: a chave da fal cabe no painel, e não vaza por nenhum dos dois lados
0965f7b  Clicar no card em treino deixa de derrubar o passo 1
```

**ORDEM DE EXECUÇÃO do plano v6:**

| bloco | estado |
|---|---|
| 1 · chave da fal no painel | fechado (`9d2d1e6`) |
| 2 · a chave não vaza por nenhum lado | fechado (`9d2d1e6`) |
| **3 · `falClient` (upload, submit, poll, result)** | **fechado (`cbe0e10`)** |
| **4 · pipeline em série — PRÓXIMO** | não começado |
| 5+ · custo por camada, régua por `(provider, model, resolution)` | não começado |

**BLOCO 4, o que ele é:** encadear as três camadas (voz → aparência → animação)
usando o `falClient` que já existe. É onde entram: `consumeLiveGeneration()` na
submissão (o cliente NÃO o chama hoje, de propósito), o laço de polling com teto
de tempo (o `falPoll` é UMA leitura, o laço é do chamador), a persistência do
`request_id` numa tabela, e o despacho por vendor em
`avatarProvider.ts:1007` — que continua atendendo só `heygen`/`did`.

## 2 · Decisões fechadas — não reabrir

- **Fila, sempre.** `queue.fal.run` é a única base de submissão. `fal.run`
  síncrono não devolve `request_id`, e sem ponteiro um processo morto perde
  trabalho já pago. O host síncrono está **fora** de `HOST_DO_VENDOR` em
  `checkNetworkEgressPolicy` de propósito, para ser a segunda rede.
- **Catálogo fechado.** Endpoint fora de `VENDOR_ENDPOINTS` não é alcançável; a
  recusa acontece **antes** do `fetch`.
- **A chave da fal vem do TENANT** (`api_credentials`, par avatar+fal), via
  `getCredential`. `platform_credentials` **não tem consumidor** neste caminho —
  MEDIDO, e supor o contrário custou um dia em 09/08.
- **Fundo por vídeo não existe** na HeyGen; cor e imagem apenas.
- **Avatar V não serve** ao caminho de áudio clonado; IV padrão, III alternativa.
- **Presets de expressão/gesto/olhar não existem** — só `motion_prompt` +
  `expressiveness`, e qualquer orientação na tela é recomendação NOSSA.
- **`docs-internal/` é memória de engenharia** e fica fora de todo copiloto.
- **HeyGen Video Agent: teste CANCELADO** pelo operador (sem parâmetro de
  duração, logo sem teto de custo por contrato).

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
   código não commitado. Isto é estrutural: `git status` é a única prova de que
   a reversão funcionou.
5. **`fixture` esconde defeito.** Guarda que precisa exercitar caminho pago roda
   com `PROVIDER_MODE=live` e `globalThis.fetch` substituído, restaurando os
   dois no `finally`. Em fixture o caminho inteiro é desviado e a guarda não
   mede nada.
6. **Guarda ancorada no USO, âncora INTRÍNSECA.** Nunca ancorar recorte em
   wrapper de layout (`</Field>`): o recorte vaza para o bloco seguinte e a
   guarda acusa o vizinho. Toda guarda de recorte carrega rede anti-vazamento.
7. **`docker compose logs` sem `--tail 500`** devolve arquivo rotacionado e
   congelado. Nunca concluir ausência de evidência com ele.
8. **`restart` não recarrega `.env`** (só `up -d`); `ps` esconde parado (use
   `-a`); código novo exige `restart backend` / `restart frontend`.

## 4 · Invocações exatas

**Gate** (~21 s, MEDIDO):
```bash
docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check
```

**Passada COMPLETA** (~79 min para 227, MEDIDO por decomposição). Exige árvore
limpa:
```bash
npm run check:mutants
```

**Passada FILTRADA** — subconjunto explícito; carimba no começo E no fim quantos
foram pulados:
```bash
npm run check:mutants -- --guard "fal:"
```
`--guard` e `--name` são repetíveis e a seleção é a UNIÃO. Filtro que não casa
nada aborta com exit 2 em vez de terminar verde sem verificar nada.

**Listar sem mutar:**
```bash
npm run check:mutants -- --list
```

**Desarme (conferir ANTES de tocar em qualquer coisa; `live` gasta dinheiro):**
```bash
docker compose exec -T backend sh -c 'printf "%s len=%s\n" "$PROVIDER_MODE" "${#PROVIDER_LIVE_CONFIRM}"'
```
Exigido `fixture` + `len=0` nos 5 critérios (`printenv`, `docker compose
config`, `StartedAt`, `RestartCount` comparado ao valor **pós-boot** e não a
zero, linha de boot — que pode estar fora da janela do log, e aí o `printenv` é
evidência mais forte).

## 5 · Desfecho da última passada completa — LEIA ISTO PRIMEIRO

**227 mutantes, lançada em 12/08/2026 ao fim da sessão, em background, sobre o
HEAD desta mesma data.** Duração esperada ~79 min (DERIVADO de 20,84 s/mutante
MEDIDO). Ninguém viu o desfecho — a sessão que a lançou terminou antes.

**O primeiro comando desta sessão é este.** O log é a única fonte: não o exit
do processo (o `| tee` já mascarou um exit 2 como 0), não a memória de sessão
nenhuma.

```bash
tail -40 "C:/Users/manfr/Documents/1A_A_PROJETOS/_arnes-logs/mutants-227-2026-08-12-a.log"
```

Se o arquivo não existir ou estiver truncado no meio, a cópia `-b` no mesmo
diretório é idêntica e independente.

Duas cópias idênticas (`-a` e `-b`) no mesmo diretório. O que procurar, nesta
ordem: `INERTE` (gate verde com o defeito aplicado — **PARE e relate, não
conserte**), `AMBÍGUO` (reprovou sem a mensagem da guarda), `ERRO` (mutante
desatualizado: o `find` não casou), e a linha final `N/227`.

Se o log terminar em `arnês falhou de forma inesperada` com `status
3221225794`, é o 0xC0000142 — falha de spawn do Windows, **não** guarda podre.
O `treeStatus()` agora retenta 3× com 2 s, então isso deve ter ficado raro;
árvore suja continua abortando na primeira leitura, sem retry.

## 6 · NÃO VERIFICADO

- **Toda a fal.ai.** Nenhuma chamada real saiu deste repositório. Os três ids de
  modelo vieram por escrito; as formas de resposta (`file_url`, `upload_url`,
  `request_id`, `status_url`, vocabulário de status) são da documentação. Um id
  errado vira 404, não cobrança.
- **Os vídeos que o operador aprovou foram feitos na fal.ai e não há registro
  nenhum disso aqui** — quatro varreduras deram zero (código, logs, `uploads/`,
  histórico do git). Qual modelo e qual prompt os produziram é informação que só
  ele tem, e recuperá-la antes do piloto vale metade do orçamento.
- **O arnês não se auto-testa.** Não existe guarda nem mutante cobrindo
  `tools/run-mutants.mjs`. As mudanças de 12/08 (filtro, retry de spawn) foram
  provadas por script no scratchpad, não pelo arnês.
- **A régua de custo única erra até 10×.** `HEYGEN_VIDEO_COST` usa
  `unitsPerBilledSecond: 3` para tudo, e as três medições que a sustentam são
  todas de photo avatar 720p na HeyGen.
- **O teto real de vozes do ElevenLabs.** `DEFAULT_VOICE_SLOT_LIMIT = 10` é
  declarado; o real vive em `/v1/user/subscription`, que responde 401 sem
  `user_read`.

## 7 · Dívidas abertas

- **`voiceId: avatar.voice_id` (`routes/videos.ts:1179`) não tem guarda ancorada
  no uso.** Trocá-lo por um id fixo passa o gate inteiro.
- **Cenário e traje são coletados, persistidos e nunca enviados.** Não há campo
  no contrato do fornecedor; a proposta registrada é REMOVER o passo, não
  ligá-lo. Decisão do operador, não executada.
- **`deriveVariantsForVideo` existe, tem guardas verdes e zero chamadores** fora
  dos scripts.
- **4 mutantes DEVIDOS** do congelamento de 05/08, identificados por NOME: `a
  estimativa volta a sair da duração pedida`, `o ritmo vira número digitado em
  vez de derivado da medição`, `o teto de confirmação some do veredito do
  servidor`, `o player volta a mostrar a duração pedida`.
- **`falSubmit` não consome `consumeLiveGeneration()`.** Sem chamador de produto
  não há risco; é do BLOCO 4.
- **Paralelizar o arnês está BLOQUEADO**, e a causa é o bind mount: o container
  monta caminhos fixos (`./backend/src:/app/src`), então um git worktree em
  outro diretório **não é visto por ele** — MEDIDO em 12/08. Sem worktree
  visível não há como dar a cada worker sua própria árvore, e paralelizar na
  mesma árvore corrompe a passada em silêncio, porque mutantes escrevem nos
  mesmos arquivos. Destravar exige tocar `docker-compose.yml`.
