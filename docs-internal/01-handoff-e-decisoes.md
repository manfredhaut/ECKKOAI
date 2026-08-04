<!-- MOVIDO de CLAUDE.md em 2026-08-04, linhas 504-1080 do arquivo original.
     Nada foi apagado nem reescrito nesta movimentação. -->

# Handoff, decisões travadas, pendências com dono e riscos conhecidos

## 7. Status atual (atualize ao FIM de cada sessão)

> # 🟢 ANTES DE QUALQUER COISA (2026-08-03 21:45 UTC)
> **O AMBIENTE ESTÁ DESARMADO, e desta vez arquivo e processo CONCORDAM** —
> que é a diferença em relação ao aviso amarelo anterior. *MEDIDO pelos cinco
> critérios:*
>
> | Critério | Diz |
> |---|---|
> | `printenv` no container | `fixture`, CONFIRM comprimento **0** |
> | `docker compose config` | `fixture`, CONFIRM **`""`** (conferido com `cat -A`) |
> | log de boot | `"mode":"fixture","billable":false` |
> | `StartedAt` | **21:40:15 UTC** (novo; o boot em live foi 21:13:29) |
> | `RestartCount` | 0 |
>
> **A PASSADA LIVE ACONTECEU E ESTÁ FECHADA.** Um vídeo real, um clique,
> **US$ 0,70** medidos pelo delta de carteira. Ver o bloco **LIVE-3** no fim
> deste arquivo — ele traz a régua de cobrança, o ritmo de fala medido e as
> lacunas que continuam abertas.
>
> | | Antes | Depois | Delta |
> |---|---|---|---|
> | Cota HeyGen | 873 | **831** | **−42 unidades** |
> | Carteira | US$ 14,55 | **US$ 13,85** | **−US$ 0,70** |
> | Crédito `video` | 3 | **2** | −1 (`consumption`, `simulated=f`) |
>
> **O ativo da apresentação mudou.** O vídeo do topo da Biblioteca agora é
> `8d28fd47` (16:9, 1280×720, 14,807 s, `clean` 0% de barra), e logo abaixo
> dele está o ensaio em fixture **com o mesmo roteiro** e com o selo SIMULADO.
> Esse par é a melhor demonstração do badge que este projeto tem: mesmo texto,
> mesmo dia, ambiente em `fixture`, e só o simulado é carimbado.
>
> **Duas coisas a ler antes de armar de novo:** a seção TELA-1 (o botão "Novo
> avatar" do passo 1 custa **US$ 1,00** em live) e a FIXTURE-1 — a margem real
> do teto é **1 tentativa**. E a lição operacional do RETOMADA-1 continua
> valendo: **um `.env` armado torna "subir o ambiente" e "armar o modo pago" a
> mesma ação**.
>
> ### 🔄 TROCA DE CONTA aqui — estado entregue limpo
>
> HEAD **`ab943a3`**, árvore limpa, `npm run check` **exit 0** (rodado com
> `-e PROVIDER_MODE=fixture` só no processo), ambiente em **`fixture`** com
> CONFIRM vazio, 4 pastas de prova em disco. **Nada em andamento, nada pela
> metade, nenhuma geração pendente.** Pode começar do zero.
>
> **O que estava aberto FECHOU em 03/08:** o custo da voz do ElevenLabs foi
> **MEDIDO diretamente no painel** — 1 chamada, 180 caracteres, **90 créditos**,
> **US$ 0,018**. A cobrança é **por CARACTERE**; a hipótese "por byte" está
> reprovada (os 7 acentos UTF-8 não foram cobrados). Não foi preciso calcular
> delta, então **a base 698 / 64.917 é OBSOLETA, não é mais pendência.** Ver a
> subseção "O custo da voz" no bloco **LIVE-3**.
>
> **Não é preciso refazer medição nenhuma** para retomar: custo de vídeo, custo
> de voz, artefato, ritmo de fala e forma da resposta de voz estão todos
> medidos e no LIVE-3.
>
> ### 🎙 04/08: a voz passou a ser capturada PELO PRODUTO
>
> HEAD hoje é **`a047359`** (bloco de voz) mais o commit deste registro. Existe
> `POST /avatars/:id/voice-sample`, que clona **sozinha** — sem retreinar avatar
> e sem debitar crédito. 4 guardas, arnês em **104/104**. O ensaio E2E rodou os
> 8 passos em fixture, **zero chamadas a fornecedor**, e **fechou o NÃO
> VERIFICADO do webm/opus**: 2:33 de opus mono viram mp3 mono 128k em 983 ms.
>
> **🔴 ANTES DE LER QUALQUER LOG, leia o gotcha novo:** `docker compose logs`
> sem `--tail` devolve um arquivo **rotacionado e congelado**, internamente
> coerente e silenciosamente desatualizado. **Use `--tail 500`.** Ele já fez uma
> requisição bem-sucedida parecer inexistente e produziu uma conclusão errada
> inteira nesta mesma data. Ver a seção de gotchas e o bloco VOZ-1 + E2E-1.

**Última atualização:** 2026-08-03 — **bloco LIVE-3: a segunda passada live
horizontal, medida e fechada.** Um vídeo, um clique, **US$ 0,70** pelo delta de
carteira — e a previsão comprometida antes do tiro (14 s → 42 un → US$ 0,70)
bateu **exata**, quarta confirmação da regra de segundo inteiro truncado. Três
coisas que mudam registro: o **ritmo de fala** passou de suposto (125 wpm) a
medido (**137,8 wpm · 12,16 car/s**, n=1); a **régua de cobrança é a duração do
FORNECEDOR**, não o nosso `ffprobe`, e as duas divergem em 0,0177 s (aqui sem
consequência, mas vale US$ 0,05 perto de um inteiro); e a **forma real da
resposta do ElevenLabs** foi observada pela primeira vez, fechando um NÃO
VERIFICADO do LIVE-2. **E o custo da voz fechou em 03/08, por leitura direta do
painel e não por delta:** 180 caracteres → 90 créditos → **US$ 0,018**, ou seja
cobrança **por CARACTERE** (a hipótese "por byte" está reprovada: os 7 acentos
não foram cobrados), com a coerência independente de 180 ÷ 14,807 s = 12,16 c/s
batendo o ritmo do artefato. **A voz é 2,5% do custo da geração.** Ver o bloco
próprio no fim. Antes dele, o **bloco
RETOMADA-1: rodada de LEITURA
depois de uma troca de conta no meio do rearme.** Fecha a pergunta "houve
disparo?" com **não**, medido contra o fornecedor e contra o banco, e nomeia o
estado do ambiente como **rearmado-no-arquivo-não-aplicado** — que nenhuma das
duas leituras isoladas revelaria. Promoveu `quotaBaseline.ts` do scratchpad
efêmero para o repositório (segundo instrumento a viver fora do git sustentando
um número registrado; o primeiro foi o `scale-match.mjs` do INSTRUMENTOS-1),
mediu o teto do polling em **450 s** (confirma os 90 × 5 s do registro) e
corrigiu o recorte de `provider_usage` — o "93% inclassificáveis" misturava
populações. Ver o bloco próprio no fim. Antes dele, o **bloco FIXTURE-1: ambiente DESARMADO e
o que dava para saber antes de gastar, medido sem gastar.** Leia o aviso verde
acima primeiro, e depois a **seção FIXTURE-1, no fim deste arquivo**. Os três
achados que mudam decisão: a **Parte B do 5F já está respondida** pelos
arquivos em disco (Mário em 16:9 é `clean`, o mesmo Mário em 9:16 tem 57,8% de
barra ⇒ o preenchimento é do FORNECEDOR, e as 2 gerações de controle deixaram
de ser necessárias); a margem real do teto é **1 tentativa**, não 4; e
**fixture não exercita o TTS**, de modo que toda linha `tts_timestamps` gravada
em simulação é rótulo, não medição. A passada live continua **NÃO disparada**,
com gasto **ZERO** confirmado contra a HeyGen — mas o crédito `video` caiu para
**1**, consumido por um ensaio em fixture. Antes dele, **vá à seção TELA-1**:
ela abre com o achado que mais importa antes de qualquer coisa em
live — **existe SIM um ramo de clonagem de voz
alcançável da tela "Criar vídeo"**, no passo 1, atrás do botão "Novo avatar", e
arquivo**: ela abre com o achado que mais importa antes de qualquer coisa em
live — **existe SIM um ramo de clonagem de voz
alcançável da tela "Criar vídeo"**, no passo 1, atrás do botão "Novo avatar", e
ele treina um avatar de **US$ 1,00** antes de clonar. O passo 6 não alcança
clonagem por nenhum ramo (nem `catch`, nem retentativa, nem fallback). A seção
tem também o diagnóstico da tela (12 defeitos, nenhum corrigido) e a rodada live
**ARMADA e NÃO disparada**, parada na PARADA 1 — dos 3 itens, duração (**15 s**)
e nome da prova (`live-15s-03082026/`) estão fechados; **só o roteiro falta
aprovar**. Zero gasto, ambiente em `fixture`. Antes dele, INSTRUMENTOS-1 e APRESENTACAO-1: o arnês fechou em
**90/90 MEDIDO** (781 s), com os 4 mutantes de preenchimento que PROVAM a
guarda (86–89) mais 1 controle de robustez (90, que passa verde) provados
nominalmente, e o ativo da Biblioteca foi **repontado** para a cópia sem barra
branca. Ver o bloco próprio no fim. Antes dele, o Bloco 5F, Parte A (a Parte B
continua ARMADA e NÃO disparada). **Preenchimento do fornecedor deixou de ser
tratado como conteúdo.** A sonda mede a barra por perfil de luminância — `cropdetect` não
serve, porque procura borda preta e a nossa é branca. *MEDIDO:* o master 9:16 de
02/08 tem **57,8% de barra** e conteúdo útil de 720×540 (proporção 1,3333, 4:3
exato); o master 16:9 tem 0%. A régua passou a medir o **conteúdo**, e com isso
**dois alvos que constavam como atendidos (16:9 e 1:1) passaram a reprovar** —
eram aprovados com pixels de barra branca. O recorte entra antes do
enquadramento, e o ativo de 02/08 foi reprocessado **ao lado**, sem substituir
nada. Dois defeitos achados ao verificar: o SAR saía **5120:5121** (DAR 320:569
em vez de 9:16, player esticando de leve) e o arredondamento para dimensão par
**comia a última linha de imagem**. 90 mutantes. Ver o bloco próprio no fim.
Antes dele, o Bloco 5E, fases 0 a 4 (a Fase 5 NÃO foi
iniciada). **Dois achados mudam decisões abertas.** Primeiro: a constante de
custo estava errada — a cobrança é por **segundo INTEIRO truncado**, 3 unidades
cada, e as três medições já registradas fecham exatas nessa regra (sobre a
duração fracionária, nenhuma bate). Isso dá US$ 0,05/s, igual à tabela pública
do fornecedor; a estimativa de 30 s passa de US$ 1,35 para US$ 1,50. Segundo, e
ataca a premissa do próprio bloco: **o 9:16 da HeyGen é preenchimento, não
composição** — o master de 02/08 tem 57% de barra branca (útil 720×548 em
720×1280), enquanto o master 16:9 do LIVE-1 não tem barra nenhuma. Derivar de
um master 9:16 entrega menos imagem útil do que derivar do mesmo conteúdo em
16:9. **Nada foi revertido** — é decisão de produto, e `MASTER_ASPECT_RATIO` é
uma constante única. A derivação por software está construída, medida e
guardada (8 derivações reais: 0 ampliaram, 0 cortaram); ffmpeg já existia no
container. 85 mutantes. Ver o bloco próprio no fim. Antes dele, o Bloco 5D,
fases 0 e 1. **O achado
principal invalida uma garantia dos blocos anteriores: `PROVIDER_MODE=fixture`
nunca cobriu os provedores de TEXTO** (`complete()` não consultava
`isFixtureMode()`), então "zero chamadas tarifadas" valia por ninguém ter
clicado em "Gerar com IA". Fechado, com uma guarda que **descobre** os clientes
HTTP em vez de receber lista. O vídeo passou a ser reproduzível **dentro** do
produto (Biblioteca + passo 6, mesmo componente, proporção respeitada), o custo
apareceu no passo 4, e as telas que mentiam foram corrigidas. O ledger negativo
foi **medido e não alterado** — a causa é `UPDATE` manual de blocos antigos, e
qual dos dois números está certo não é decisão de script. As **Fases 2 a 5 (a
passada live) NÃO foram iniciadas.** Antes dele, o Bloco TETO-1: a última
decisão aberta que
podia travar a passada live foi fechada. O teto de sessão **devolve o gasto**
quando a chamada falha (mesma fronteira do estorno de crédito), e quem passou a
barrar o laço é um **segundo contador, de tentativas**, que nunca volta. Com
`MAX_GENERATIONS=2` a passada live ganhou 4 falhas de margem em vez de 0. O
arnês flagrou a guarda nova como inerte por um motivo novo — ela reprovava mas
**perdia a mensagem**, morrendo antes de devolvê-la. Ver o bloco próprio no fim.
Antes dele, o Bloco 4A (operacional): o custo REAL passou
a aparecer na tela, derivado de uma constante única e medida (US$ 0,045/s em
16:9/720p), com a estimativa ao lado e a diferença entre as duas; ausência de
medição aparece como ausência, nunca como zero. A tabela de taxas manual —
origem do desvio de 4,5× — foi **removida do banco**, junto com a tela que a
editava. Toda saída de log passou a ter um sumidouro único que redige segredo
por FORMA, e o freio de endpoints tarifáveis passou a DERIVAR de um catálogo.
Os quatro desfechos de geração foram medidos e tabelados (item 6), sem
correção — é decisão de produto. Antes dele, o Bloco PREVOO-1 (3.5), de
verificação:
confirmou que a geração usa **v3** (sem parada condicional), achou e corrigiu um
vazamento de chave no evento `vendor_error`, mediu que o **teto de sessão não
volta quando a geração falha** (registrado, NÃO corrigido — é decisão de
produto), criou a invariante de frescor da imagem do frontend, exigiu evidência
para declaração de suporte por vendor, e escreveu o plano da passada live. Tudo
em fixture, zero chamadas tarifadas. Antes dele, o Bloco FORMATO-1: o payload de geração
passou a levar `aspect_ratio` e `resolution` SEMPRE, derivados da plataforma
escolhida num passo novo ("Publicação", 5 de 6). O motor é selecionado a partir
do `supported_api_engines` declarado pelo avatar, gravado sempre e **enviado só
atrás de flag desligada** — a ligação entre os dois campos é dedução, não
contrato. Quatro fixtures por proporção, guarda nova (41 mutantes no total).
Ambiente em fixture do começo ao fim, zero chamadas a fornecedor. **Nada disso
foi confirmado em live** — ver a lista própria de pendências. Antes dele, o
Bloco LIVE-1: **uma** geração live real,
de ponta a ponta, com o avatar que já existia. Saiu vídeo utilizável em ~54 s,
custo medido de US$ 0,15, e o `ffprobe` do arquivo baixado deu 1280×720 16:9
25 fps. A unidade de `remaining_quota` foi reconciliada (60 por dólar). Três
lacunas novas registradas e não corrigidas — ver a lista na seção de fatos
verificados. **O ambiente foi desarmado de volta para `fixture` ao fim do
bloco, com prova no log de boot.** Antes dele, o Bloco DEMO-1: o caminho
principal do MVP
(foto → avatar → voz → vídeo → download) foi percorrido inteiro no navegador em
modo fixture, com **zero chamadas a fornecedor**. Corrigido o defeito que
impedia criar avatar sem câmera, adicionada validação de artefato de vídeo em
dois pontos, e criado `npm run preflight:live`. Antes dele, o Bloco CHAVES-2:
chaves da plataforma cifradas no banco, com tela no admin, resolução por
requisição (banco vence `.env`, invertível por `PLATFORM_KEYS_FORCE_ENV=1`) e
nenhuma rota que devolva valor em claro. Ver as seções próprias no fim.

**Este arquivo foi condensado nesta data**: o histórico cronológico virou uma
tabela de uma linha por bloco (seção 8), e o que ainda vale como regra está nas
seções **Decisões travadas**, **Riscos**, **Pendências** e **Gotchas** do
HANDOFF. O detalhe de execução de cada bloco está nas mensagens de commit, que
são longas de propósito neste projeto. Leia o HANDOFF antes de qualquer coisa.

---

## HANDOFF — leia esta seção inteira antes de tocar em qualquer coisa

Escrito para quem chega **sem nenhum contexto** da conversa anterior. O que
vem a seguir está em "Frente aberta".

### O que é isto, em cinco linhas

eckko.ai (nome antigo: TWINAI) é um SaaS multi-tenant que gera vídeos de
avatar digital falando um roteiro. Roda inteiro em Docker Compose com quatro
serviços — `traefik` (única porta exposta, `8090`), `postgres`, `backend`
(Fastify/TS) e `frontend` (React/Vite). Existe uma **demo a apresentar**, e a
maior parte do trabalho recente é blindagem para ela, não funcionalidade
nova. O produto é vendido com assinatura + créditos via Stripe (real,
testado), e as chaves de IA hoje ainda são BYOK por tenant no código.

### Como validar que está tudo de pé (faça isto primeiro)

```bash
./tools/up.sh
```

Sobe os quatro serviços, espera cada um ficar *healthy* (com timeout) e só
devolve o controle depois de confirmar **landing 200 e `/api/health` 200** —
porque `docker compose up -d` volta quando os containers foram criados, que
não é a mesma coisa que a aplicação responder. Não consome tentativa de
login nem fala com fornecedor. Equivalente: `npm run up`.

Depois, para conferir a demo inteira:

```bash
./tools/smoke-demo.sh
```

21 verificações numa passada: containers, landing, os três caminhos de
entrada, credenciais fixas, avatar treinado, créditos, credenciais de
provedor, e se o Vite está servindo bundle atualizado. **Não gasta nenhuma
requisição de fornecedor.** Sai 1 se algo que a demo usa estiver quebrado.
Ele consome 2 das 5 tentativas/15min do rate limiter de login — **rode uma
vez só**. Complemento, para o gate de qualidade do código:

```bash
docker compose exec backend npm run check
```

Typecheck + sete invariantes de documentação + duração de roteiro +
sanitização de erro de vendor + probe de credencial. Última execução:
ambos verdes, 21/21 e "todas as invariantes passaram".

### Estado por bloco (frente do copiloto como suporte real)

| Bloco | Assunto | Estado |
|---|---|---|
| 0 | Viabilidade do RAG | **Concluído — reprovou o RAG.** Falta peça, não é bug |
| 1 | Allowlist de visibilidade dos docs | Concluído |
| 1.5 | Política congelada em teste que falha (`npm run check`) | Concluído |
| 1.6 | Bateria adversarial no copiloto do tenant | Concluído — 10/10 bloqueadas |
| 2A | Remoção das afirmações falsas dos docs | Concluído (deixou buracos de propósito) |
| 2B | Escrever a documentação nova | **NÃO INICIADO — é o próximo** |
| 3 | RAG de verdade | **Bloqueado**: falta chave de embedding |
| 4 | Diagnóstico por SQL escopado | Livre |
| 5 | Ajuda por campo | Livre |
| 6 | Isolamento entre tenants | **Bloqueado**: depende do Bloco 3 |
| 7 | Teto de perguntas + truncagem | Livre |

Blocos de blindagem para a demo (numeração paralela, já concluídos): erro de
vendor sanitizado + falha visível na tela; duração-alvo de roteiro;
`tools/smoke-demo.sh`; e este Bloco 6 (resiliência de ambiente).

### Frente aberta e próximo bloco

**Próximo é o Bloco 2B: escrever a documentação nova.** O 2A apagou o que era
falso e deliberadamente **não** substituiu — apagar leva minutos, reescrever
leva horas, e uma declaração comercial falsa a quem é cobrado via Stripe não
podia esperar. A lista exata dos buracos, arquivo por arquivo, está na tabela
"LACUNAS DEIXADAS PELO 2A" mais abaixo nesta mesma seção. Comece por ela.

**Não comece o Bloco 3 (RAG)** antes de existir chave de embedding: hoje
`embeddingProvider.ts` devolve `Math.random()` e **não existe código de
recuperação vetorial** — nenhuma query usa `<=>`, `document_chunks` só recebe
`INSERT` e nunca é lido. Falta nas duas pontas. (Desde o CHAVES-2 já existe
**onde guardar** a chave — o slot `embedding` no painel admin, validável — mas
guardar não é usar: `embeddingProvider.ts` continua sem consumi-la.)

**Antes de trocar o ambiente para `live`, rode:**

```bash
docker compose exec backend npm run preflight:live
```

Não chama fornecedor nenhum e termina numa linha só: `PRONTO PARA LIVE` ou o
que falta. Hoje falta só `PROVIDER_LIVE_CONFIRM`.

**Frente aberta — upload de celular não cabe no desenho atual.** O teto de
100 MB e o `toBuffer()` do upload de referência foram dimensionados para
webcam. Um celular grava em 1080p (ou 4K) com bitrate bem maior: **2 minutos
em 1080p já passam dos 100 MB**, e o modo *completo* da decisão nº 9 pede 5.
Subir o teto sozinho não resolve — `toBuffer()` materializa o arquivo inteiro
em memória, então 300 MB de upload viram 300 MB de heap, e dois envios
simultâneos derrubam o processo. O caminho é **streaming direto para disco**
(`file.file` é um stream; gravar com `pipeline()` e só então validar), o que
muda também a validação de artefato, que hoje assume buffer. **Registrado, não
feito** — é reescrita do caminho de upload, não ajuste de constante.

**Também em aberto, do PENDENCIAS-1:** as Partes 3 e 4 nunca foram feitas (a
Parte 5 teve a origem dos `.mp4` de 16 bytes resolvida no DEMO-1, e a validação
de artefato no download foi construída lá; sobrou decidir se os 2 arquivos
órfãos são apagados).
A mais importante é a **Parte 3 — auditoria das guardas existentes**: levantar
quais guardas antigas passam verde sem inspecionar nada. Essa classe de defeito
já apareceu três vezes (a flag no VIDEO-0, a de credencial que só pegou por
acaso, e a de chave de plataforma no CHAVES-2, que na primeira versão acusava
o próprio comentário que a explicava).

### Decisões travadas — não reabrir

1. **`PLATFORM_COPILOT_API_KEY` será uma chave Anthropic.** Não invente
   `PLATFORM_COPILOT_VENDOR`: `askCopilot()` faz `vendor = input.vendor ??
   "anthropic"` e nem `public.ts` nem `adminCopilot.ts` passam vendor. Colar
   uma chave Gemini ali a manda para `api.anthropic.com` e dá 401.

1b. **A chave do copiloto do TENANT está FECHADA desde 2026-07-31**: é a
   chave **Google DA PLATAFORMA** (`PLATFORM_GOOGLE_API_KEY`), não a BYOK do
   cliente. Suporte deixou de exigir que o cliente conecte provedor — cobrar
   configuração de API para poder pedir ajuda sobre o produto era o oposto do
   que suporte deve ser. São **cinco** chaves de plataforma distintas, e
   confundi-las é o erro recorrente aqui:

   | Id / variável | Vendor | Serve a |
   |---|---|---|
   | `copilot` · `PLATFORM_COPILOT_API_KEY` | Anthropic | copiloto público e do admin |
   | `google` · `PLATFORM_GOOGLE_API_KEY` | Google | **só o copiloto do tenant** |
   | `embedding` · `PLATFORM_EMBEDDING_API_KEY` | Google | só embeddings |
   | `heygen` · `PLATFORM_HEYGEN_API_KEY` | HeyGen | nada ainda — só guardada e validável |
   | `elevenlabs` · `PLATFORM_ELEVENLABS_API_KEY` | ElevenLabs | idem |

   **Correção de 2026-08-01:** este arquivo dizia que a chave `google` servia
   "roteiro e copiloto do tenant". Serve só ao copiloto —
   `routes/scripts.ts` lê a credencial do tenant direto, sem passar por
   `resolveTenantAiKey`.

   A de embedding é separada da de roteiro **mesmo sendo o mesmo vendor**:
   indexação é consumo em lote com limite diário próprio, e dividir cota com
   o suporte faria uma reindexação derrubar o copiloto. Enquanto a chave
   `google` não existir (nem no painel nem no `.env`), o copiloto do tenant cai
   na credencial do cliente como retaguarda — ver
   `services/providers/platformKeys.ts`.
   **O teto de ~20 requisições/dia por projeto deixou de ser o limite do
   suporte** e não deve mais ser citado como restrição em doc nem em UI.

1c. **Desde 2026-08-01 estas chaves moram no BANCO, cifradas** (tabela
   `platform_credentials`), gravadas pela aba APIs do painel admin. As
   variáveis de ambiente continuam valendo como retaguarda.

   - **Precedência: banco > `.env`.** Gravar pelo painel vale na requisição
     seguinte, sem reiniciar.
   - **`PLATFORM_KEYS_FORCE_ENV=1` inverte**, e existe para um caso concreto:
     uma chave ruim gravada pela tela tranca do lado de fora justo quem
     precisaria entrar para consertá-la. É lida no boot — é decisão de
     operação, não de requisição.
   - **`ENCRYPTION_KEY` é a única que NÃO pode migrar para o banco**: ela é o
     que abre as outras. No banco, o cadeado ficaria dentro do cofre.
   - **Nenhuma rota devolve valor em claro, nem para admin.** Gravar e
     substituir, sim; ler de volta, nunca. Quatro invariantes de
     `npm run check` cobram isso. Não crie um endpoint de leitura "só para
     depurar".
2. **Embedding será `gemini-embedding-001`, a 1536 dimensões via
   `output_dimensionality`, com chave DA PLATAFORMA** em variável de
   ambiente própria — nunca a BYOK de um tenant.

   *(Correção de registro, 2026-07-31: este arquivo dizia
   "`text-embedding-3-small` da OpenAI" e listava os blocos de RAG como
   bloqueados por falta de chave OpenAI. Estava errado — a decisão travada
   é a de cima. A chave que falta é a da plataforma para o Gemini.)*

   Três gotchas que vêm junto com essa escolha e precisam estar no código
   desde a primeira versão, não descobertos depois:
   - **Normalização manual abaixo de 3072 dimensões.** O modelo só devolve
     vetor normalizado no tamanho nativo; pedindo 1536 via
     `output_dimensionality`, a normalização é responsabilidade nossa. Sem
     ela, similaridade de cosseno compara magnitudes além de direções, e o
     ranking sai errado de um jeito plausível — que é o pior tipo de erro,
     porque não parece defeito.
   - **Teto de 2048 tokens por texto.** O chunking
     (`services/chunking.ts`) precisa respeitar isso; chunk maior é
     truncado pelo vendor, e o pedaço perdido some sem aviso.
   - **Batelada obrigatória por causa do limite diário de requisições.**
     Uma chamada por chunk estoura a cota em qualquer base real. Indexar
     tem de agrupar chunks por requisição desde o começo — reescrever o
     ingestor depois é bem mais caro que já nascer em lote.

   Nada disso foi implementado, e nenhuma chave foi testada.
3. **A fonte única de limites de plano é a tabela `plans`**; `plans.ts` só lê
   dela. Não crie uma segunda fonte.
4. **O manifesto de exposição dos docs mora no backend**
   (`docsManifest.ts`), não em frontmatter dentro de `docs/`. Motivo: "o que
   um anônimo lê?" tem que se responder num arquivo só, e escrever
   documentação deve ser um ato separado de decidir sua exposição.
5. **Um índice é tão confidencial quanto o item mais confidencial que ele
   indexa.** Foi assim que o `README.md` de `docs/` vazou os nomes de
   `docs/admin/`. Nomear um arquivo de nível superior já é vazamento.
6. **Migração BYOK → chave-da-plataforma** (cliente consome crédito) está
   decidida e **não construída**. O código segue 100% BYOK.
7. **Créditos são "use ou perca"** — o grant mensal reseta o saldo, não
   acumula.
8. **O débito fica ANTES da chamada ao fornecedor, e a falha estorna.**
   Debitar depois eliminaria o estorno, mas abriria corrida: duas requisições
   simultâneas passariam as duas pela verificação de saldo e as duas gastariam
   cota. Prefere-se cobrar e devolver a arriscar gastar o que não existe. A
   fronteira do estorno está em `services/billing/creditGate.ts` e vale a pena
   ler antes de mexer: **estorna quando a chamada ao fornecedor lançou; não
   estorna nada depois de o fornecedor aceitar o trabalho.**
9. **Qualidade de treino do avatar será escolha do TENANT**, em dois modos:
   *rápido* (~30 s de amostra, resultado mais simples) e *completo* (2–5 min,
   melhor resultado). **NÃO implementado** — registrado aqui para não virar
   improviso na hora. Hoje existe só o cap único de `MAX_RECORDING_SECONDS`
   (120 s) e uma linha de orientação na tela. Quando for construído, os dois
   modos precisam de tetos de tamanho diferentes: 5 min em 1080p não cabe nos
   100 MB atuais.

10. **CHECKLIST OBRIGATÓRIO DE GUARDA — ancorar no USO, nunca na MENÇÃO.**
    Não é um aprendizado a lembrar; é uma lista a percorrer antes de declarar
    qualquer guarda pronta. `import`, comentário, string e nome de símbolo
    **não contam como uso**.

    - [ ] A busca ancora no **uso** (`<Componente`, `isFixtureMode()` seguido de
          `return`, chamada de função), e não no nome solto.
    - [ ] Existe um mutante que **remove o uso e preserva a menção** — apagar o
          JSX deixando o `import`, apagar a chamada deixando o comentário que a
          explica. Escrever esse mutante é obrigatório: é ele que separa guarda
          ativa de guarda inerte.
    - [ ] **Presença e LIGAÇÃO são proposições separadas.** Verificar que o
          elemento existe não prova que ele diz a verdade: `simulated={false}`,
          `simulated={!x.simulated}` e a prop ausente preservam a superfície
          inteira. Cada uma precisa do mutante próprio.
    - [ ] A guarda foi vista **reprovando** (`npm run check:mutants`), com a
          **mensagem dela** na saída — não a do `tsc`.
    - [ ] A guarda **não** acusa uso legítimo, nem o texto que a explica.

    **A regra já custou cinco ocorrências neste projeto**, todas com a mesma
    forma e nenhuma achada por leitura de código: a flag do VIDEO-0
    (`useFeatureFlag` que não existia); a `checkVendorLogPolicy` do LIVE-2
    (treze funções casadas, helper nunca inspecionado); a elisão de áudio do
    LIVE-2 (satisfeita pelo comentário); a de chave de plataforma do CHAVES-2
    (acusava o próprio comentário); e a do aviso de simulação do 5D
    (satisfeita pelo `import`). A sexta seria a **ligação** do badge, fechada
    na Fase 1-bis — a guarda estava corretamente ancorada no uso e ainda assim
    passava verde com o aviso preso em `false`.

### Pendências com dono

| O quê | Dono | Observação |
|---|---|---|
| Gravar a chave **Anthropic** (`copilot`) pelo painel | **usuário** | Sem ela, copiloto público e do admin **nunca responderam** |
| Gravar a chave **Google** (`google`, com créditos) pelo painel | **usuário** | Copiloto do tenant. Enquanto ausente, ele cai na credencial do cliente |
| Gravar a chave **Google de embedding** pelo painel | **usuário** | `gemini-embedding-001`; desbloqueia os Blocos 3 e 6 |
| **Trocar a chave Google de desenvolvimento antes de VPS/produção** | **usuário** | Passou por transcrição de chat ⇒ comprometida. Ver a seção de aviso própria |
| Gravar HeyGen/ElevenLabs da plataforma (opcional) | **usuário** | Só habilita validação e leitura de saldo; a geração continua na credencial do cliente |
| Rotacionar as senhas de `admin@eckkoai.com` e `demo@eckko.ai` | **usuário** | Mesmo motivo; via `npm run dev:seed-access` |
| Pôr saldo no HeyGen | **usuário** | US$ 13,85 / 831 unidades ⇒ ~19 vídeos de 15 s. Ver tabela de cota |
| ~~Ler o painel do ElevenLabs e fechar o delta de voz~~ | — | **FECHADO em 03/08**: medição direta no painel, 180 car → 90 créditos → US$ 0,018, cobrança **por caractere**. A base 698 / 64.917 é obsoleta — ver LIVE-3 |
| **Conceder `user_read` à chave do ElevenLabs** | **usuário** | Sem ela, `GET /v1/user/subscription` dá 401 e o consumo de voz só é legível a olho no painel. **Continua valendo**: o custo de 03/08 foi lido a olho, e sem `user_read` toda medição futura também será |
| Billing/cota do Gemini (sair do free tier) | **usuário** | Criar projeto novo a cada teto batido não escala |
| Conferir os 9 valores de `provider_cost_rates` | **usuário** | São placeholder; toda tela já mostra banner de estimativa |
| Escrever o Bloco 2B | próxima sessão | Insumo pronto na tabela de lacunas |
| Validar fundo virtual com câmera real | **usuário** | Câmera bloqueada em toda automação desta ferramenta |
| **Copiar `uploads/_prova/` para fora da máquina** | **usuário** | `uploads/*` é ignorado pelo git ⇒ a prova só existe neste disco. `uploads/_5e-prova/` já foi sobrescrito e a prova do 5E não é mais reconferível — o precedente está pago. **PENDENTE** |
| **Ligar o autostart do Docker Desktop** | **usuário** | Verificado: `AutoStart: false` em `%APPDATA%\Docker\settings-store.json`. **Não é código** — nenhuma política de restart do Compose ajuda se o próprio daemon não estiver rodando. Caminho: **Docker Desktop → ícone de engrenagem (Settings) → General → marcar "Start Docker Desktop when you sign in to your computer"** |

### Riscos conhecidos e NÃO corrigidos

- ~~Não há recuperação automática confiável do ambiente.~~ **Corrigido no
  bloco ACESSO-FINAL.** O backend agora morre quando o bootstrap falha e volta
  sozinho quando o Postgres retorna, medido. O que continua verdade é a
  dependência externa: **se o daemon do Docker não estiver rodando, nada disso
  vale** (ver pendência de autostart na tabela acima).
- ~~`/admin` pela barra de endereço entra em laço.~~ **Corrigido no bloco
  ACESSO-FINAL** — a causa era o `LoginPage` unificado navegando client-side,
  não o `AdminAuthProvider`, que sempre revalidou.
- **`Sair` em qualquer zona derruba admin e tenant juntos** —
  `session.destroy()`, as duas sessões vivem no mesmo cookie.
- **Em `/admin/login`, o autofill preenche a credencial do TENANT**, não a
  do admin. Não é bug: essa rota renderiza o `LoginPage` unificado, que é o
  formulário do cliente. Mas confunde — a porta certa do admin é o
  "Acesso administrativo" no rodapé da landing, que preenche o admin.
- **"Créditos restantes" mostra "—"** no painel do tenant embora
  `tenant_credits` tenha saldo real. Bug de UI, catalogado, não corrigido.
- **"6/2 vídeos este mês"** na Minha Assinatura: contador por plano e saldo
  de crédito se contradizem na tela.
- **Moeda inconsistente**: landing em `R$`, app em `$`.
- **`masked_key` mostra os últimos caracteres do texto cifrado**, não da
  chave — inútil para identificar qual chave está lá.
- **Header quebra abaixo de ~500px.**
- Nenhum destes bloqueia a demo pelo caminho ensaiado.

**Três fatos verificados no bloco POLL-1, registrados sem construir nada.** Os
três têm a mesma natureza: algo que se supõe verdade e não é, e que só
apareceria em live ou numa conversa com cliente.

1. ~~**"Derivação de formatos" é hoje INEXEQUÍVEL.**~~ **Metade FECHADA no
   FORMATO-1.** O payload passou a levar `aspect_ratio` e `resolution`
   sempre, derivados da plataforma escolhida no passo "Publicação" — ver o
   bloco próprio no fim. O que continua aberto é a outra metade, e ela só
   fecha em live: **se 9:16 sai vertical de verdade**, e se um mesmo avatar
   rende bem fora do horizontal. *(O usuário se refere a isto como "Decisão
   6"; essa numeração vem do planejamento dele, não deste arquivo.)*
2. **A UI exige 3 fotos e o provider usa só a primeira.**
   `AvatarSetupStep` bloqueia "Concluir configuração" com menos de 3
   (`photo_urls.length < 3`), e `trainAvatar()` faz
   `readUpload(input.photoUrls[0])` ([avatarProvider.ts:375](backend/src/services/providers/avatarProvider.ts:375)).
   As outras duas são gravadas, ocupam disco e **nunca chegam ao fornecedor**.
   Ou a exigência cai para 1, ou o provider passa a enviar as três — hoje
   pedimos ao cliente um trabalho que jogamos fora.
3. **`provider_cost_rates` nunca foi reconciliada com fornecedor nenhum, e as
   unidades são NOSSAS.** O vídeo registra `duration_seconds` *pedido*
   ([videos.ts:70](backend/src/routes/videos.ts:70)) e a voz registra
   `script.length` em caracteres — nenhum dos dois vem da resposta do
   fornecedor, que não é lida para isso. O custo é `taxa × unidades` com taxa
   de uma tabela mantida à mão. **O único número real que a HeyGen nos dá é
   `remaining_quota`**, lido só pelo botão "Validar" do painel e nunca
   gravado. Ou seja: toda tela de custo é estimativa sobre estimativa, e a
   diferença entre ela e a fatura real é desconhecida — não medida, não
   estimada, desconhecida.

   **Atualização do LIVE-1 (2026-08-01): a diferença deixou de ser
   desconhecida e é de 4,5× no caso medido.** Uma geração pediu
   `duration_seconds = 15`; o vídeo entregue tem **3,372 s** (`ffprobe`), e
   `provider_usage` gravou **15**. Não é imprecisão de arredondamento: é o
   número errado, porque `duration_seconds` é o que o cliente escolheu na
   tela, não o que a voz sintetizada de fato dura. O valor real existe e está
   à mão — `synthesizeSpeech()` já devolve `durationSeconds` medido pelo
   ElevenLabs ([voiceProvider.ts:140](backend/src/services/providers/voiceProvider.ts:140))
   e é registrado no log de duração, mas **não** é o que vai para
   `provider_usage`. NÃO corrigido.

**Três lacunas novas, medidas na passada live do LIVE-1 (2026-08-01). As duas
primeiras foram FECHADAS no LIVE-2; a terceira continua aberta:**

1. ~~**`provider_usage` grava a duração PEDIDA, não a real.**~~ **Fechada no
   LIVE-2.** `unit_count` passou a ser a duração real, com `unit_source`
   dizendo de onde veio e `requested_unit_count` guardando o pedido ao lado —
   nunca no lugar, senão não haveria como medir o erro da estimativa. Ordem:
   `vendor_response` (a HeyGen manda `data.duration`) → `tts_timestamps` (o
   ElevenLabs mede o áudio) → `requested` (último recurso, e declarado como
   tal). Migration `037`; linhas antigas ficaram marcadas `requested`.
2. ~~**O LOG-1 não cobre o ElevenLabs.**~~ **Fechada no LIVE-2** — ver o bloco
   próprio no fim. O texto abaixo fica como registro do que era.

   A captura de resposta bruta vivia em
   `fetchJson()`, que é do `avatarProvider` — cobre as 4 chamadas HeyGen e as
   3 D-ID. `voiceProvider.ts` faz `fetch` direto e **nunca** chama
   `logVendorResponse`. Medido: a passada live registrou `voice/elevenlabs/
   50 characters` em `provider_usage`, e **zero** eventos `vendor_response` de
   voz no log. Ou seja, a clonagem e a síntese — que gastam dinheiro — são
   exatamente os caminhos sem corpo de resposta registrado, que é o oposto da
   intenção do LOG-1.
3. **`GET /v2/user/remaining_quota` tem sunset declarado em 2026-10-31.** A
   própria resposta traz o aviso, apontando `GET /v3/users/me` como
   substituto. Dois caminhos vivos usam o endpoint condenado:
   `checkHeygenConnection()` ([avatarProvider.ts:314](backend/src/services/providers/avatarProvider.ts:314)),
   que atende `POST /credentials/avatar/test`, e `PROBE_ENDPOINTS.heygen`
   ([platformKeyProbe.ts:27](backend/src/services/providers/platformKeyProbe.ts:27)),
   que é o botão "Validar" do painel admin. Depois da data, os dois passam a
   falhar — e o sintoma será "chave inválida", não "endpoint removido", que é
   o diagnóstico errado. O `/v3/users/me` já foi exercitado com sucesso nesta
   passada e devolve a carteira em dólar.

