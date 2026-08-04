<!-- MOVIDO de CLAUDE.md em 2026-08-04, linhas 4069-5308 do arquivo original.
     Nada foi apagado nem reescrito nesta movimentação. -->

# TELA-1, a passada live de 03/08, FIXTURE-1, RETOMADA-1 e LIVE-3

### TELA-1 — diagnóstico de "Criar vídeo" + rodada live ARMADA (2026-08-03)

**LEIA ISTO PRIMEIRO SE VOCÊ ACABOU DE TROCAR DE CONTA.** Esta seção é o fio da
meada de uma sessão interrompida a pedido do usuário ("pare tudo"), na véspera
de uma apresentação. **Nada foi gasto, nada foi disparado, nada foi corrigido.**

#### ⚠ EXISTE UM RAMO DE CLONAGEM DE VOZ ALCANÇÁVEL DA TELA "CRIAR VÍDEO" — e ele é o caminho MAIS CARO do produto

*Fechado por leitura em 2026-08-03. MEDIDO, ancorado em uso — nenhum item desta
subseção vem de `import`.*

`cloneVoice` tem **um único** call site em `backend/src` fora dos scripts de
guarda: [avatars.ts:266](backend/src/routes/avatars.ts:266), dentro de
`POST /avatars/:id/reference-video` ([avatars.ts:152](backend/src/routes/avatars.ts:152)).
E o único `fetch` a `/v1/voices/add` está em
[voiceProvider.ts:72](backend/src/services/providers/voiceProvider.ts:72) (URL
declarada em [:12](backend/src/services/providers/voiceProvider.ts:12)) — não
existe segundo caminho que crie voz.

**Essa rota é chamada de DENTRO da tela Criar vídeo, em dois pontos, os dois no
passo 1:** [AvatarSetupStep.tsx:192](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:192)
(gravação, `handleUploadRecording`) e
[:209](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:209) (arquivo,
`handleReferenceFileChange`).

**O que a alcança, exatamente:** as duas abrem com `if (!draftAvatar) return`
([:186](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:186) e
[:203](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:203)), e
`draftAvatar` só é preenchido com um avatar **NOVO**, criado em
`handleCreateAvatar` ([:103](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:103)),
atrás do botão "Novo avatar" que faz `setCreating(true)`
([:259](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:259));
`handleFinishSetup` o zera ([:224](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:224)).
**Selecionar um avatar existente é `onSelectAvatar(avatar.id)` e NUNCA preenche
`draftAvatar`** — não há caminho partindo de "selecionar o Mário" que clone voz.

**Por que isso importa mais que a voz:** antes de clonar, essa mesma rota
**treina um avatar** — `trainAvatar` em
[avatars.ts:212](backend/src/routes/avatars.ts:212), **US$ 1,00** de
`photo_avatar` no HeyGen, mais 1 crédito de avatar debitado em
[avatars.ts:193](backend/src/routes/avatars.ts:193). Em live, um clique errado em
"Novo avatar" seguido de um envio de vídeo custa ~6× um vídeo de 15 s. O botão
fica na **mesma tela** do disparo planejado.

**Consequência operacional para a rodada: em live, no passo 1, não clicar em
"Novo avatar".** Selecionar o Mário na grade é seguro.

**O passo 6 NÃO alcança clonagem, por nenhum ramo.**
`GenerateStep.handleGenerate` chama só `POST /videos`
([GenerateStep.tsx:79](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:79))
e `GET /videos/:id` ([:94](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:94));
o `catch` ([:100](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:100)) só
faz `setError` + `setReloadKey`, e `reloadKey` reroda apenas
`POST /videos/readiness` ([:48](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:48)),
que é leitura pura. **Não há retentativa automática, fallback nem caminho de erro
que fale com voz.** O botão "Retreinar" que existe no produto é **decorativo** —
[ContentPage.tsx:82](frontend/src/pages/Content/ContentPage.tsx:82) é um
`<button>` **sem `onClick`**, e está na tela Conteúdo, não nesta.

Ambiente ao fim: `PROVIDER_MODE=fixture`, `PROVIDER_LIVE_CONFIRM` vazia, árvore
limpa, gate verde, **zero chamadas a fornecedor**. Crédito do tenant de demo
intacto (`video=2`, reconferido por `SELECT` em 03/08), 5 avatares, 9 vídeos —
nada gerado, nada excluído.

#### A rodada live está ARMADA e NÃO disparada — 3 decisões travam a partida

O usuário planejou **um único vídeo real** (HeyGen + a voz já clonada do Mário)
com paradas obrigatórias: Parte A (leitura) → **PARADA 1** → Parte B (pré-voo) →
**PARADA 2, em que O USUÁRIO vira o `.env` para live** → Parte C (disparo) →
Parte D (medição) → **PARADA 3, em que O USUÁRIO devolve `fixture`**.

**A Parte A foi entregue. Paramos na PARADA 1.** Dos três itens, **dois foram
fechados em 03/08** e **um continua pendente** — e sem ele não se passa para a
Parte B:

1. ~~**A duração: 10 s NÃO EXISTE.**~~ **RESOLVIDO: 15 s.** O seletor do passo 4
   oferece `15 | 30 | 60`
   ([DurationStep.tsx:4](frontend/src/pages/CreateVideo/steps/DurationStep.tsx:4)),
   sem campo livre; o mínimo é **15 s**, estimativa **US$ 0,75**.
2. ~~**O nome do diretório de prova.**~~ **RESOLVIDO: `live-15s-03082026/`.** O
   nome antigo (`live-10s-03082026/`) diria 10 s com um vídeo de 15 s dentro.
   **Nada foi criado em `uploads/_prova/`** — criar é PARADA 2.
3. **O roteiro — ÚNICO ITEM AINDA PENDENTE.** Proposta de 35 palavras (o alvo do
   próprio sistema para 15 s), **sem aprovação registrada**. Nenhuma sessão deve
   escolher o roteiro por conta própria.

**Regras que o usuário fixou para essa rodada:** não clicar em "Gerar com IA"
(em live chama o Gemini de verdade); **se falhar, PARAR e não retentar**; baixar
o mp4 ANTES de medir qualquer coisa (o `output_url` é CDN e expira — 2 vídeos
deste tenant já morreram em 403); e não pedir 9:16, 4:5, 1:1 nem 1080p.

#### Parte A — o levantamento, todo MEDIDO

**Predicado nos 5 avatares** (`evaluateGenerationReadiness` executado de
verdade, não lido):

| Avatar | Blockers | Liberado |
|---|---|---|
| **Mário** (`983c7de4`) | — | **sim** |
| **TESTE REAL 15:40 01/08** (`7557957c`) | — | **sim** |
| test um · teste 12 · teste | `avatar_not_trained` | não |

Mário: `provider_avatar_id=45528bb8bf914899b12403e6d50cb780`,
`voice_id=wAd9MJ2IK71FGs1FWjIX`, `provider_engines` NULL.
Reserva TESTE REAL: `6f60dca9f15b4ef48b6f137cfb0734ce` /
`5Qfze6o4PjDKPpAI4Ux4`. **Serve como reserva TÉCNICA** (passa os 8 blockers);
como reserva **de qualidade é desconhecida** — voz nunca escutada em registro
nenhum, e se o avatar ainda existe no fornecedor é NÃO VERIFICADO.

**Payload com YouTube — MEDIDO no montador real** (`resolveVideoFormat`):
`{"platform":"youtube","aspectRatio":"16:9","resolution":"720p"}`. Sem `engine`
(flag desligada + `provider_engines` NULL ⇒ razão `default_no_declaration`).

**Custo:** estimativa = `billedSecondsFor(pedido) × US$ 0,05`. Medido:
15 s → **US$ 0,75** · 30 s → 1,50 · 60 s → 3,00. Truncagem conferida:
`14,6 s → 14` e `15,9 s → 15`. A cobrança usa a duração **ENTREGUE**
(`unit_count` + `unit_source`, com `requested_unit_count` ao lado).

**Crédito:** debitado em [videos.ts:589](backend/src/routes/videos.ts:589),
**antes** de `generateVideo`, e **igual em live** — `isFixtureMode()` só decide
a coluna `simulated` do ledger, nunca o `delta`. Depois do disparo sobra **1**.
Reposição consistente: `npm run dev:grant-credits -- --slug dev-c77a5b --video N`
(saldo + ledger na mesma transação). `UPDATE` manual é o que desalinha, e é a
causa do ledger de vídeo em **−2** deste banco.

**Voz — o passo 6 USA o `voice_id` existente e não pode clonar** (o ramo que
PODE clonar é o do passo 1, ver o aviso no topo desta seção). Cadeia completa,
MEDIDA por leitura:

| Etapa | Onde |
|---|---|
| `voice_id` lido do banco | [videos.ts:547](backend/src/routes/videos.ts:547) (`SELECT * FROM avatars …`) |
| entregue ao provider | [videos.ts:612](backend/src/routes/videos.ts:612) — `voiceId: avatar.voice_id` |
| repassado à síntese | [avatarProvider.ts:165](backend/src/services/providers/avatarProvider.ts:165) — `synthesizeSpeech(input.elevenLabsApiKey, input.voiceId, input.script)` |
| **entra no payload do ElevenLabs** | [voiceProvider.ts:162](backend/src/services/providers/voiceProvider.ts:162) — como **segmento de URL**, `…/v1/text-to-speech/${encodeURIComponent(voiceId)}`, usada no `fetch` de [:166](backend/src/services/providers/voiceProvider.ts:166) e no fallback de [:219](backend/src/services/providers/voiceProvider.ts:219) |

Vale registrar a forma: o `voiceId` **não é campo de corpo** — o corpo é só
`{ text, model_id }` ([:169](backend/src/services/providers/voiceProvider.ts:169)
e [:225](backend/src/services/providers/voiceProvider.ts:225)). Quem for procurar
"onde a voz entra no payload" olhando o JSON não acha.

**`voice_id` nulo ou inválido: FALHA, nunca tenta clonar.** Nulo/vazio →
[avatarProvider.ts:160-163](backend/src/services/providers/avatarProvider.ts:160)
lança `AvatarProviderError` **antes de qualquer rede**. Não-nulo mas inválido →
vai ao ElevenLabs, o ramo `with-timestamps` não-ok cai no fallback
([:219](backend/src/services/providers/voiceProvider.ts:219)) e um 4xx ali lança
`VoiceProviderError` em
[voiceProvider.ts:242](backend/src/services/providers/voiceProvider.ts:242). Em
nenhum dos dois desfechos existe criação de voz.

**Chamadas ao ElevenLabs no caminho feliz: UMA** — `with-timestamps` devolvendo
200 com `audio_base64` retorna em
[voiceProvider.ts:206](backend/src/services/providers/voiceProvider.ts:206); a
2ª é fallback condicional. Depois vêm `POST /v3/assets` + `POST /v3/videos` + N
pollings no HeyGen. O tratamento de áudio (`processVoiceAudio`,
`services/audioProcessing.ts`) **não faz rede** — `grep` por `fetch(`/`https://`
naquele arquivo devolve vazio.

> **CORREÇÃO (03/08): a síntese NÃO passa "fora do teto de sessão" — ela roda
> DENTRO dele.** `synthesizeSpeech` não tem `withLiveBudget` próprio (só
> `cloneVoice` tem, [voiceProvider.ts:65](backend/src/services/providers/voiceProvider.ts:65)),
> mas o **único** caminho até ela é `requireAudio` ← `generateVideoHeygen`
> ([avatarProvider.ts:371](backend/src/services/providers/avatarProvider.ts:371))
> ← `withLiveBudget("geração de vídeo", …)`
> ([avatarProvider.ts:655](backend/src/services/providers/avatarProvider.ts:655)).
> Três consequências, e a terceira é a que morde numa passada live:
> 1. Ela **não consome unidade própria** ⇒ o disparo custa **1 gasto + 1
>    tentativa**, não duas. (Isto o registro anterior já dizia, e segue certo.)
> 2. Ela é **protegida** pelo teto: esgotado o teto, nada chega ao ElevenLabs.
> 3. **Se a síntese falhar, o GASTO volta** ([liveGuard.ts:255](backend/src/services/providers/liveGuard.ts:255))
>    **e a TENTATIVA não** — uma falha de TTS queima uma tentativa sem gerar
>    vídeo nenhum.
>
> A medição do 5D ("o teto não se moveu, gasto 0→0, tentativas 0→0, provando que
> `synthesizeSpeech` está fora do contador") foi feita chamando
> `synthesizeSpeech` **direto**, não pelo caminho de geração. As duas afirmações
> não se contradizem — dizem coisas diferentes, e a que vale para a rodada live
> é esta.

**Premissa DEDUZIDA que precisa ficar visível:** `wordsPerMinute: 140`
([scriptDuration.ts:35](backend/src/services/script/scriptDuration.ts:35)), que
o próprio código chama de "o número mais chutado dos três". As duas medições
reais de TTS do projeto divergem 27% entre si (206 car → 17,6 s = 11,7 car/s;
50 car → 3,372 s = 14,8 car/s), então 35 palavras dá uma faixa esperada de
**12,8 a 16,2 s** ⇒ US$ 0,60 a 0,80 contra estimativa de 0,75.

#### DUAS LACUNAS NOVAS, achadas na Parte A e NÃO corrigidas

1. **`voice_id` não é verificado pelo predicado, mas `requireAudio` exige.** O
   selo "Voz clonada" lê `a.voice_id`; `evaluateGenerationReadiness` **não** o
   consulta (o comentário diz que voz é opcional por desenho), e
   [avatarProvider.ts:160](backend/src/services/providers/avatarProvider.ts:160)
   **lança** sem ele. Consequência: um avatar treinado sem `voice_id` passa o
   predicado, o botão libera, e a geração falha **depois de debitar crédito** —
   o débito é em [videos.ts:589](backend/src/routes/videos.ts:589) e a falha em
   [avatarProvider.ts:160](backend/src/services/providers/avatarProvider.ts:160),
   nessa ordem. **CONFIRMADO por leitura em 03/08, e NÃO corrigido.** O estorno
   cobre o crédito ([videos.ts:657](backend/src/routes/videos.ts:657), a falha é
   antes do aceite do fornecedor) e o teto devolve o gasto — mas a **tentativa**
   não volta. Não afeta o disparo planejado (os dois avatares liberados têm voz).
2. **Três campos diferentes descrevem "voz" no MESMO card.** A linha
   `"3/3 fotos · voz pronta"` usa `a.reference_video_url`
   ([AvatarSetupStep.tsx:302](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:302)),
   o selo "Voz clonada" usa `a.voice_id`
   ([:313](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:313)), e o
   servidor não olha nenhum dos dois. O selo "Avatar treinado" (`provider_avatar_id`)
   **é** o mesmo campo do servidor e concorda.

#### Diagnóstico da tela "Criar vídeo" — 12 defeitos, ordenados por o que a PLATEIA vê

Rodada de diagnóstico anterior, **sem nenhuma correção aplicada** por decisão
do usuário. Tudo MEDIDO no navegador em fixture.

| # | Defeito | Onde | Min | Tipo |
|---|---|---|---|---|
| 1 | **4 avatares de teste na grade e o Mário em ÚLTIMO** (a lista vem do mais recente para o mais antigo) | passo 1 | ~3 | **dados** — excluir é irreversível (ver abaixo) |
| 2 | Parágrafo promete **"escolha um fundo e ajuste a intensidade"**; não existe controle nesta tela e a flag está desligada | passo 1 (2 telas) | ~2 | **texto** |
| 3 | **"Selecione um avatar acima"** — os avatares estão ABAIXO do botão (`nextButton` é renderizado na [linha 263](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:263), antes da grade) | passo 1 | ~1 | **texto** |
| 4 | **"Gerar com IA" escreve jargão sobre `PROVIDER_MODE`** no roteiro que a plateia lê ([fixtureProvider.ts:336](backend/src/services/providers/fixtureProvider.ts:336)) | passo 2, se clicado | ~5 | **texto** |
| 5 | Tela **nega que o vertical foi conferido** em vídeo real — foi, em 02/08 (`publish.notVerified`) | passo 5 | ~3 | **texto** |
| 6 | **"US$ 1.5"** em vez de "US$ 1,50" (função `usd` em `VideoCostPanel`) | passos 4 e 6 | ~5 | comportamento |
| 7 | Dois rótulos **"Enviar imagem de referência"** idênticos, cada um ANTES do campo que diz a qual coluna pertence | passo 3 | ~3 | **texto** |
| 8 | Avatar inválido percorre **5 passos** e só é barrado no 6 | 1→6 | ~20 | comportamento |
| 9 | **"Excluir" sempre visível no card**; `DELETE /avatars/:id` faz hard delete **e dá `unlink` nos arquivos** ([avatars.ts:105](backend/src/routes/avatars.ts:105)), sem `deleted_at` | passo 1 | ~15 | comportamento |
| 10 | **F5 perde o progresso** (estado em `useState`) | qualquer | ~40 | comportamento |
| 11 | Cards e chips **sem nome acessível** (`<button>` aninhado em `div role="button"`) | passos 1 e 5 | ~10 | comportamento |
| 12 | Painel de custo **desaparece sem aviso** se a rota falhar (`if (!cost) return null`) | passos 4 e 6 | ~5 | comportamento |

Os cinco defeitos de **texto** (2, 3, 4, 5, 7) somam ~14 min, são reversíveis, e
**nenhum exige `docker compose build`** — frontend pede `restart frontend` se o
HMR não pegar; o nº 4 é backend e pede `restart backend`.

**Fatos estruturais MEDIDOS da tela, que valem como referência:** as abas do
`step-indicator` **não são clicáveis** (`<div>`, `role: null`, `tabIndex: -1`,
sem `onClick`) e `goNext/goBack` são ±1 com clamp — **não há como pular para o
passo 6**. O card de avatar é selecionado pelo **card inteiro**
([:293](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:293)), sem
controle próprio, com `stopPropagation` no Excluir. Selecionado, ele ganha borda
verde `#9CEE06`, `borderLeftWidth: 8px` e halo — medido, com `borderWidth`
saindo **2,4px** onde o código pede 3px (causa não investigada).

**Em fixture, o artefato entregue com YouTube é
`backend/fixtures/simulated-video-16x9.mp4`** (640×360), escolhido **só** pela
proporção — **nenhuma relação com o roteiro digitado**. Medido com a sonda real
(`probePadding`): veredito `clean`, **0% de barra**. A fixture `padded` (57,8%)
só existe para a guarda do 5F e não entra no fluxo. O job fica 12 s em
`processing`, com polling de 2 s.

**Zero strings sem tradução:** as 142 chaves `t()` estáticas do fluxo existem em
pt-BR e en, e não há literal de texto em JSX fora de `t()`. Os defeitos 2, 3, 5
e 7 são textos **traduzidos e errados**, não faltantes.

#### NÃO VERIFICADO — em aberto

Três itens, cada um com o motivo de continuar aberto. Nenhum é bug: são coisas
que ninguém provou, e a diferença entre "não provado" e "provado que funciona"
é o que este bloco existe para preservar.

**1. O ElevenLabs recusando um `voice_id` inválido com 4xx — leitura de código,
NUNCA observado.** O ramo existe e está lido: `with-timestamps` não-ok cai no
fallback ([voiceProvider.ts:219](backend/src/services/providers/voiceProvider.ts:219))
e um 4xx ali lança `VoiceProviderError`
([:242](backend/src/services/providers/voiceProvider.ts:242)) — em nenhum
desfecho há criação de voz. O que falta é uma resposta real do fornecedor nessa
forma.

**Fechar isso hoje ficou CARO, e o encarecimento veio de outra medição desta
mesma rodada:** a síntese roda **DENTRO** do `withLiveBudget` de `generateVideo`
([avatarProvider.ts:655](backend/src/services/providers/avatarProvider.ts:655)),
então um teste deliberado exige o ambiente em **live** e **consome uma TENTATIVA
do teto** — que, medido no item 1e desta rodada, **não volta** (`attempted` é
incrementado em [liveGuard.ts:193](backend/src/services/providers/liveGuard.ts:193)
e nenhuma linha do módulo o decrementa; `releaseLiveGeneration` mexe só em `used`
e `consumedBy`, [:218-219](backend/src/services/providers/liveGuard.ts:218)).
**Não testar com o crédito de vídeo em 2** — a tentativa gasta é margem da
apresentação, e o teste não entrega vídeo nenhum.

**2. Tensão `liveGuard.ts:255` × `avatarProvider.ts:659` — FECHADO.** Não eram
duas verdades sobre pontos diferentes: a segunda é **registro obsoleto**. Hoje
[avatarProvider.ts:659](backend/src/services/providers/avatarProvider.ts:659) é
**linha vazia**, entre o fim de `generateVideo` ([:658](backend/src/services/providers/avatarProvider.ts:658))
e `pollVideoJob` ([:660](backend/src/services/providers/avatarProvider.ts:660));
o `consumeLiveGeneration` que existia ali saiu no bloco TETO-1 e hoje tem **um
único** call site em produção, dentro de `withLiveBudget`
([liveGuard.ts:248](backend/src/services/providers/liveGuard.ts:248)) — nenhuma
rota ou provider o chama direto.

Falha do fornecedor **antes do aceite**, dentro de `generateVideoHeygen`:

| O quê | Desfecho | Linha |
|---|---|---|
| Gasto do teto | **VOLTA** | [liveGuard.ts:255](backend/src/services/providers/liveGuard.ts:255) → decremento em [:219](backend/src/services/providers/liveGuard.ts:219) |
| Tentativa do teto | **NÃO VOLTA** | incrementada em [liveGuard.ts:193](backend/src/services/providers/liveGuard.ts:193); nenhum decremento existe |
| Crédito `video` | **VOLTA (estorno)** | débito [videos.ts:589](backend/src/routes/videos.ts:589), estorno [:657](backend/src/routes/videos.ts:657) |
| `provider_usage` | **linha NOVA de falha**, `unit_count = 0` | [videos.ts:688](backend/src/routes/videos.ts:688) → [usageTracking.ts:95](backend/src/services/billing/usageTracking.ts:95) |

**O que NENHUMA das duas afirmações cobre, e continua aberto:** as falhas
**depois do aceite** — polling, artefato inválido, timeout. Elas rodam em
`pollJob` (`setInterval`), **fora** do `withLiveBudget`, que já retornou: o gasto
não volta, o crédito **não** é estornado (fronteira deliberada do ESTORNO-1) e
`provider_usage` grava falha. Deliberado. **O que não é deliberado é o desfecho
E do 4A:** se o processo reiniciar entre a criação e o polling, o `setInterval`
morre e o vídeo fica preso em `queued` **para sempre, sem linha de falha**.

**E um caso de fronteira que o próprio módulo declara** ([liveGuard.ts:207-213](backend/src/services/providers/liveGuard.ts:207)):
se a síntese de voz teve SUCESSO e a criação do vídeo falhou depois, o gasto é
devolvido embora tenha havido custo parcial real — e a linha de voz já gravada em
[avatarProvider.ts:166](backend/src/services/providers/avatarProvider.ts:166)
**não** é revertida. O teto é trava de segurança, não contabilidade.

**O teto é estado em MEMÓRIA do processo** — `let used` / `let attempted`
([liveGuard.ts:103](backend/src/services/providers/liveGuard.ts:103) e
[:114](backend/src/services/providers/liveGuard.ts:114)), sem `pool.query` nem
escrita em arquivo em nenhum ponto do módulo. Portanto **SIM**:
`docker compose restart backend` **zera os dois contadores**, porque o processo é
novo e o módulo é recarregado. É por isso que reiniciar é a saída documentada
quando as tentativas acabam no meio de uma passada.

**3. Backup em máquina única — bundle gerado, e ele AINDA NÃO é backup.**
Bundle completo do repositório em 03/08, HEAD `163d17a`:

```
C:\Users\manfr\AppData\Local\Temp\eckkoai-163d17a-20260803.bundle
9.198.904 bytes · md5 bceb3b4a0912687a5a7b25e0a86b3795
```

`git bundle verify`: *is okay*, **história completa**, 2 refs
(`refs/heads/master` + `HEAD`), sha1 — e `git tag` devolve **0**, então `--all`
não deixou ref de fora. **Ele só vira backup depois de SAIR desta máquina:
copiá-lo para outro disco é ação do operador, não da sessão** — hoje o bundle
está no mesmo disco que o repositório que ele deveria proteger.

**O que o bundle NÃO contém:** `uploads/` inteiro, exceto `uploads/.gitkeep` —
é o único arquivo versionado ali. **58 MB** ignorados ficam de fora, incluindo as
duas provas que nenhum outro lugar guarda: **`uploads/_prova/5f-e1e47cc/` (14 MB,
11 arquivos)** e **`uploads/_prova/fov/` (1,8 MB, 3 arquivos)**, mais
`uploads/_5e-prova/` (13 MB, já sobrescrito e não mais reconferível) e
`uploads/c77a5b8a-…/` (29 MB, onde vivem os masters reais e o ativo repontado da
apresentação). **Bundle e prova são dois backups distintos; este item cobre só o
primeiro.**

#### Extrato apresentação 03/08/2026

Texto aprovado para a lacuna do fornecedor de áudio. Escrito em linguagem de
negócio de propósito — é para ser lido em voz alta ou colado num slide, não para
orientar código.

> **Lacuna registrada: recusa de voz inválida pelo fornecedor de áudio.**
> Não provamos, contra o fornecedor real, o que acontece quando a voz configurada
> é inválida — temos só a leitura do código, que mostra o erro sendo capturado e a
> geração interrompida, sem criar voz nova
> ([voiceProvider.ts:242](backend/src/services/providers/voiceProvider.ts:242)).
> Não provamos hoje porque outra medição desta mesma rodada encareceu o teste: a
> síntese de voz roda dentro do mesmo limite de segurança que protege a geração de
> vídeo ([avatarProvider.ts:655](backend/src/services/providers/avatarProvider.ts:655)),
> de modo que forçar a recusa exige ambiente de produção e consome uma tentativa
> desse limite — que não é devolvida e não entrega vídeo nenhum.
> A lacuna está registrada e classificada como "não verificado, em aberto", com o
> caminho de fechamento escrito. Não é um item esquecido: é um item datado.

**Legenda de uma frase:** *A recusa de voz inválida está verificada no nosso
código, mas nunca contra o fornecedor real — e provar isso passou a exigir
ambiente de produção, então a lacuna ficou registrada e classificada, não
esquecida.*

---

## 🔴 PASSADA LIVE DE 03/08 — HANDOFF DE TROCA DE CONTA · AMBIENTE ARMADO EM LIVE

**Se você acabou de assumir o projeto, LEIA ESTA SEÇÃO ANTES DE TUDO, inclusive
antes do resto de TELA-1.** A sessão anterior foi interrompida para troca de
conta **com o ambiente ligado em modo pago**, no meio de uma passada live
planejada. Nada foi gasto, e o que impede um gasto acidental agora é só esta
página.

### ⚠ O ambiente NÃO está em `fixture`. Está em LIVE, armado e conferido

*MEDIDO em 2026-08-03 18:46 UTC, no container em execução:*

```
PROVIDER_MODE                  = live
PROVIDER_LIVE_CONFIRM          = PREENCHIDA
PROVIDER_LIVE_MAX_GENERATIONS  = 2
StartedAt                      = 2026-08-03T18:43:32Z
```

Prova no log de boot, que é a fonte que não mente sobre o processo de pé:

```json
{"event":"provider_mode","mode":"live","billable":true,
 "maxGenerationsThisSession":2,
 "message":"MODO LIVE AUTORIZADO — chamadas a HeyGen/ElevenLabs vão gastar cota PAGA…"}
```

**Consequência prática, e é o único aviso que importa:** qualquer clique no
caminho de geração agora **gasta dinheiro de verdade**. Não existe rede de
proteção além do teto de 2. O botão **"Novo avatar"** do passo 1 dispara treino
(**US$ 1,00** + 1 crédito de avatar) — ver a armadilha de palco no ROTEIRO DA
DEMO. **"Gerar com IA"** no passo 2 chama o Gemini de verdade.

**Duas saídas, e a escolha é do operador — nenhuma sessão deve decidir sozinha:**
disparar a passada (Parte C abaixo, tudo pronto), ou **desarmar** devolvendo
`PROVIDER_MODE=fixture` e esvaziando `PROVIDER_LIVE_CONFIRM`, com
`docker compose up -d backend` (**`restart` não recarrega variável de
ambiente**) e conferindo `"mode":"fixture","billable":false` no log de boot.
**Deixar armado entre sessões é o estado mais perigoso do dia.**

### O ROTEIRO APROVADO — grava aqui porque só existia numa conversa

Aprovado pelo operador em 03/08. **É este texto, sem editar.** As quebras de
linha do prompt original caíam no meio de frases (era wrap de formatação): o
roteiro é **um parágrafo único**.

```
Olá, eu sou o Mário, da eckko ponto ai. Este vídeo foi gerado inteiro a partir de um roteiro escrito, com a minha voz e o meu rosto. Nenhuma câmera, nenhum estúdio, nenhuma edição.
```

*MEDIDO:* **187 caracteres, 34 palavras.** (O registro anterior falava em "35
palavras"; a contagem real do texto aprovado é 34 — a diferença não muda nada,
mas evita que alguém ache que recebeu o roteiro errado.)

Banda de duração esperada, **DEDUZIDA** das duas medições reais de TTS
(11,7 e 14,8 caracteres/s): **12,6 a 16,0 s** para estes 187 caracteres. Use
**esta** como primária, não a de 140 wpm — a de wpm é o número que o próprio
código chama de mais chutado. Estimativa que a tela mostra para 15 s pedidos:
**US$ 0,75**.

### Estado exato ao fim da sessão

| O quê | Estado |
|---|---|
| Gasto | **ZERO.** Nenhum clique no fluxo, nenhuma chamada a fornecedor |
| Crédito do tenant | **video=2**, avatar=3, script=9 (baseline reconferido) |
| PARADA 1 | **LIBERADA** — roteiro aprovado, 15 s, `live-15s-03082026` |
| PARADA 2 | **LIBERADA** — o operador armou o ambiente (medido acima) |
| Parte C (disparo) | **NÃO INICIADA** |
| Árvore git | limpa em `1826a64` antes deste commit |

### Pré-voo COMPLETO — não refaça

| # | Verificação | Resultado |
|---|---|---|
| 1 | `/api/health` via Traefik | `{"status":"ok"}` |
| 1 | Containers | 4/4 `running (healthy)` |
| 3 | `uploads/_prova/live-15s-03082026/` | **criada**, com `pre-voo-backend.log` (1.943.842 bytes, UTF-8 conferido por `file`) |
| 4 | Seletor do passo 4 | `[15, 30, 60]` — 15 s é o mínimo ([DurationStep.tsx:4](frontend/src/pages/CreateVideo/steps/DurationStep.tsx:4)) |
| 4 | YouTube | **16:9 / 720p** ([videoFormat.ts:54](backend/src/services/providers/videoFormat.ts:54) e [:72](backend/src/services/providers/videoFormat.ts:72)) |
| 4 | Mário `983c7de4` | `provider_avatar_id=45528bb8bf914899b12403e6d50cb780`, `voice_id=wAd9MJ2IK71FGs1FWjIX` |

`uploads/_prova/5f-e1e47cc/` e `uploads/_prova/fov/` **intocadas**.

### ⛔ REGRA ABSOLUTA DO POLLING — a única coisa irreversível do dia

O polling roda em `setInterval` **FORA** do `withLiveBudget`. Reinício entre a
criação e o polling **mata o `setInterval`**: o vídeo fica preso em `queued`
para sempre, **sem linha de falha e sem estorno de crédito** (desfecho E do 4A).

**Portanto: nunca sugerir, pedir ou executar `restart`, `up -d` ou qualquer
reinício enquanto houver geração em andamento.** Só depois de `ready` ou de erro
declarado. Antes do disparo, reiniciar é seguro.

### O que resta — Parte C em diante

**Item 1, sempre primeiro, e com TRÊS critérios** (a sessão anterior gastou três
falsas partidas por verificar de menos):

```bash
docker compose exec -T backend printenv PROVIDER_MODE
docker inspect --format 'StartedAt={{.State.StartedAt}}' $(docker compose ps -q backend)
docker compose config | grep PROVIDER_MODE
```

`printenv` diz o que o processo tem; `StartedAt` diz se o container é novo;
`docker compose config` diz o que o `.env` entrega **sem subir nada** — é o
teste barato que isola `.env` de container.

**Parte C:** card do **Mário** apenas (nunca "Novo avatar", nunca "Excluir") →
passo 2 com o roteiro colado (**nunca** "Gerar com IA") → plataforma **YouTube**
→ **15 s** → registrar a estimativa que o painel mostra → disparar **um único
vídeo** → relatar cada transição de status com horário. **Se falhar: PARAR, não
retentar** — retentar é decisão do operador — e relatar erro, se foi antes ou
depois do aceite, teto (gasto e tentativas) e saldo com/sem estorno.

**Parte D, nesta ordem:** copiar o mp4 para a pasta de prova e registrar md5 e
tamanho **antes de medir qualquer coisa** → `ffprobe` do arquivo **local**
(duração, resolução, DAR, áudio decodifica) → `probePadding` local (esperado
**0%** em 16:9) → linha de `provider_usage` (`unit_count`, `unit_source`,
`requested_unit_count`, resolução) com cobrado × estimado em dólar e em % e
comparação com a banda de 12,6–16,0 s → painel de custo na tela (estimativa,
real, diferença) → **registrar o preço por segundo realmente cobrado em 720p**,
dizendo que a **paridade 720p/1080p CONTINUA não verificada**, porque esta
rodada não pede 1080p.

**Parte D2:** só depois de `ready` (ou erro declarado), salvar o log do backend
em UTF-8 na pasta de prova — **ele contém a ida e volta real com o fornecedor e
é apagado no `up -d` do desarme.**

**Parte E:** o operador desarma; a sessão confere por `printenv`; depois
Biblioteca — onde o vídeo novo apareceu, se toca, e quais dos antigos ainda
tocam e quais dão 403.

### Cópia do artefato — comando MONTADO, não executado

O artefato **não** vem do CDN: desde o 5D o polling baixa e persiste no nosso
disco antes de marcar `ready`. A cópia é para ter prova imutável.

```bash
V=<VIDEO_ID>; F=$(docker compose exec -T postgres sh -c "psql -tA -U \$POSTGRES_USER -d \$POSTGRES_DB -c \"SELECT output_url FROM videos WHERE id='$V'\"" | tr -d '\r'); cp "uploads/${F#/uploads/}" uploads/_prova/live-15s-03082026/live-15s-16x9.mp4; md5sum uploads/_prova/live-15s-03082026/live-15s-16x9.mp4; ls -l uploads/_prova/live-15s-03082026/live-15s-16x9.mp4
```

### Três falsas partidas, e o que cada uma ensinou

Valem mais que o tempo que custaram, porque as duas primeiras se repetem
sozinhas em qualquer sessão futura:

1. **`&&` não vale no PowerShell do operador.** Os comandos compostos que a
   sessão sugeriu **nunca rodaram** — daí um container com 9 horas de vida
   parecendo desobediência. **Todo comando entregue ao operador tem de ser
   sintaxe PowerShell: `;` ou linhas separadas, nunca `&&`.**
2. **`.env` novo não chega ao container sem recriação, e não chega ao Compose se
   o arquivo não for legível.** Container recriado (`StartedAt` recente) ainda
   lendo `fixture` isola o problema no `.env`, não no Docker: `docker compose
   config` devolvia exatamente os defaults de `${VAR:-default}` do
   `docker-compose.yml` (linhas 61–63). Candidatos, em ordem: nome errado
   (`.env.txt` — o Notepad faz isso sozinho), linha comentada, espaço em volta
   do `=`, e **arquivo em UTF-16LE ou com BOM**, que o Compose não lê e que faz
   toda variável cair no default **em silêncio**. Conferência sem imprimir
   valor: `Get-Item -Force .env* | Select-Object Name, Length` e
   `Format-Hex -Path .env -Count 4` (`FF FE` = UTF-16LE, `EF BB BF` = BOM).
3. **`printenv` sozinho não bastava.** Ele diz que está errado, não **onde**.
   O trio `printenv` + `StartedAt` + `docker compose config` separa as três
   causas possíveis em uma passada, e é por isso que virou o item 1.

### ⚠ `npm run check` NÃO FICA VERDE com o ambiente em live — e não é defeito do commit

*MEDIDO nas duas direções, e vale saber antes de perder tempo procurando o que
não existe:*

| Como foi rodado | Saída | Violações |
|---|---|---|
| ambiente como está (live) | **1** | 2, ambas `PROVIDER_MODE não voltou para fixture depois da verificação` |
| `docker compose exec -e PROVIDER_MODE=fixture backend npm run check` | **0** | nenhuma — *"todas as invariantes passaram"* |

**A causa é uma guarda que verifica a proposição errada, e é PRÉ-EXISTENTE.**
`checkPollPolicy` e `checkVendorErrorPathPolicy` trocam o modo para `live`
localmente, restauram o **modo original** ([checkPollPolicy.ts:120](backend/src/scripts/checkPollPolicy.ts:120))
e depois cobram `if (!isFixtureMode())`
([:132](backend/src/scripts/checkPollPolicy.ts:132) e
[checkVendorErrorPathPolicy.ts:224](backend/src/scripts/checkVendorErrorPathPolicy.ts:224)).
Restaurar para `live` — que é o comportamento **correto** — reprova a asserção.
Ela confunde *"restaurou o que estava"* com *"é fixture"*, e funciona por
acidente só enquanto o ambiente de desenvolvimento está em fixture.

**Consequência para a passada:** o fechamento não consegue exibir
`npm run check` verde enquanto o ambiente estiver armado. As duas opções
honestas são rodar o gate com `-e PROVIDER_MODE=fixture` (que não toca o
container nem o `.env`) e **declarar que foi assim**, ou rodá-lo depois do
desarme. **Não** "consertar" a guarda no meio de uma passada live armada: é
mudança de guarda com dinheiro em jogo, e o arnês de mutantes teria de ser
reexecutado para valer. Registrado como achado, **NÃO corrigido**. O conserto,
quando vier, é comparar com o modo original em vez de com `fixture`.

---

### FIXTURE-1 — o que se pode saber antes de gastar (2026-08-03, custo ZERO de fornecedor)

Ambiente em `fixture` do começo ao fim. **Zero chamadas tarifadas** — as duas
únicas requisições que saíram da máquina foram leituras de cota/carteira da
HeyGen, `billable: false` no catálogo. **Um crédito de vídeo foi consumido**
por um ensaio em fixture (ver o aviso no topo).

#### O ensaio em fixture NÃO exercita o TTS — e por isso não responde a maior parte do que se quer saber

[fixtureProvider.ts:241](backend/src/services/providers/fixtureProvider.ts:241)
declara: *"em simulação a síntese não acontece — `generateVideo` devolve antes
de `requireAudio`"*. Não é só o desvio de
[voiceProvider.ts:161](backend/src/services/providers/voiceProvider.ts:161): o
caminho de voz nem é alcançado. *MEDIDO no ensaio:* **zero** ocorrências de
`elevenlabs` no log e **zero** eventos `vendor_response`; as 292 linhas do
período são requisições HTTP internas.

**Armadilha que sai daí:** o ensaio grava
`videos.audio_duration_source = tts_timestamps` **sem que medição nenhuma
tenha ocorrido**. É rótulo deliberado, carimbado em
[fixtureProvider.ts:248](backend/src/services/providers/fixtureProvider.ts:248)
com o motivo escrito; o caminho real só emite esse valor quando o ElevenLabs
devolve `elevenlabs_timestamps`
([avatarProvider.ts:202](backend/src/services/providers/avatarProvider.ts:202)).
**Em live o campo significa medição; em fixture, não.** Quem auditar linhas
antigas por esse campo vai contar simulação como medição.

#### O caminho do TTS, exercitado com `fetch` substituído (zero rede)

Mesmo padrão das guardas do projeto, `PROVIDER_MODE=live` só dentro do processo
do script. *MEDIDO:*

| Pergunta | Resposta |
|---|---|
| caracteres enviados | **180 chars / 187 bytes**, idêntico ao roteiro aprovado. **Nenhuma truncagem** |
| chamadas ao ElevenLabs | **1** no caminho feliz; **2** se cair no fallback |
| `model_id` | **`eleven_multilingual_v2`**, igual nos dois ramos |

O corpo é só `{text, model_id}`; o `voice_id` vai como **segmento de URL**.
Não há `slice`/`substring`/limite em `videos.ts`, `avatarProvider.ts` nem
`voiceProvider.ts`, e o campo do formulário tem `maxLength = -1`.

**Correção de contagem:** o roteiro aprovado tem **180 caracteres**, não 187 —
os 187 são **bytes UTF-8** (7 acentuados). São 34 palavras.

**Um `voice_id` inválido custa DUAS chamadas, não uma:** o 404 do ramo
`with-timestamps` cai no fallback, que só então lança
([voiceProvider.ts:242](backend/src/services/providers/voiceProvider.ts:242)).
Em nenhum desfecho há criação de voz. *Exercitado com resposta simulada por
nós — a forma real do 404 do fornecedor continua NÃO VERIFICADA.*

#### Semântica dos dois tetos — leitura de código

**Os dois contadores são GLOBAIS DA SESSÃO (do processo), nunca por geração:**
`let used` em [liveGuard.ts:103](backend/src/services/providers/liveGuard.ts:103)
e `let attempted` em [:114](backend/src/services/providers/liveGuard.ts:114).
Ambos incrementam juntos em [:192](backend/src/services/providers/liveGuard.ts:192).
Existe `used -= 1` em [:219](backend/src/services/providers/liveGuard.ts:219);
**não existe decremento de `attempted` em lugar nenhum do módulo.**

| Desfecho | Tentativa | Gasto | Crédito |
|---|---|---|---|
| **falha ANTES de o fornecedor aceitar** | consome, **não volta** | consome e **DEVOLVE** | debita e **ESTORNA** ([videos.ts:657](backend/src/routes/videos.ts:657)) |
| **falha DEPOIS do aceite** (polling, artefato, timeout) | consome, não volta | consome, **não volta** | debita, **não estorna** |
| **preso em `queued`** (processo reiniciou) | zerada pelo restart | zerado pelo restart | debita, **não estorna, sem linha de falha** |

A fronteira é a mesma do ESTORNO-1: `withLiveBudget` devolve quando a função
lança ([:248](backend/src/services/providers/liveGuard.ts:248)); o
`pollJob` roda em `setInterval` **fora** dele. *MEDIDO por contagem:* **zero**
`refundCredit` dentro de `pollJob` (linhas 26–140 de `videos.ts`).

**Armadilha de nomenclatura:** `pollJob` tem um `let attempts` **local**
([videos.ts:36](backend/src/routes/videos.ts:36)) que conta tentativas de
POLLING e nada tem a ver com o `attempted` do teto. Dois `attempts` com
significados diferentes.

**`restart` zera os DOIS**, porque são estado de processo — é por isso que
reiniciar é a saída documentada quando as tentativas acabam.

> **A frase, com os números de hoje** (`MAX_GENERATIONS=2`, `MAX_ATTEMPTS=2`,
> saldo 1): **depois de uma falha antes do aceite sobram 1 tentativa,
> 2 gerações e 1 crédito.** O gargalo é a TENTATIVA — sobra exatamente um
> disparo.

**Correção do registro anterior:** o plano da passada diz "com
`MAX_GENERATIONS=2` são 6 tentativas, ou seja 4 falhas de margem". Isso vale só
para o **default derivado** (2 × `LIVE_DEFAULT_ATTEMPTS_PER_GENERATION`); o
`.env` fixa `PROVIDER_LIVE_MAX_ATTEMPTS=2`, e valor explícito vence o derivado
([liveGuard.ts:82](backend/src/services/providers/liveGuard.ts:82)). Também
some a contradição "margem ZERO" de um relatório intermediário: **é 1**.

#### Linha de base de cota — MEDIDA, e a previsão bateu exata

| Endpoint | Papel | Tarifado? |
|---|---|---|
| `GET /v2/user/remaining_quota` | cota em unidades | **NÃO** ([endpointCatalog.ts:85](backend/src/services/providers/endpointCatalog.ts:85)) |
| `GET /v3/users/me` | carteira em dólar | **NÃO** — substituto do sunset de 2026-10-31 |

*MEDIDO em 03/08 19:38 UTC:* **cota 873**, **carteira US$ 14,55**. Idênticos aos
de 02/08, ou seja **nada foi gasto**. E 873 ÷ 14,55 = **60,0** — quarto ponto
confirmando 60 unidades por dólar.

**Ler cota pelo caminho do TENANT NÃO funciona em fixture:**
`checkAvatarConnection` desvia em
[avatarProvider.ts:666](backend/src/services/providers/avatarProvider.ts:666).
**Pelo painel admin também não, hoje:** o probe não desvia (a única menção a
`isFixtureMode()` em `platformKeyProbe.ts` é um comentário), mas
`platform_credentials` está **VAZIA** — *MEDIDO: 0 linhas*. Sobra ler direto,
com a credencial do tenant.

> **A medição de custo da rodada é o DELTA de cota antes/depois.** E
> **`provider_usage.unit_count` guarda SEGUNDOS, não unidades** (`unit_type` é
> `seconds`): **nunca comparar os dois números**. A conversão é 3 unidades por
> segundo inteiro truncado.

#### Proveniência envenenada em `provider_usage`

**Não existe coluna `simulated` nessa tabela** — *MEDIDO: 0 colunas com esse
nome.* E o join com `videos.simulated` não salva, porque quase nada tem
`video_id`:

| Origem | linhas |
|---|---|
| `video_id` presente, `simulated=false` (**real**) | 3 |
| `video_id` presente, `simulated=true` (fixture) | 4 |
| **sem `video_id`** (15 avatar + 58 script + 3 voice) | **76** |

**93% das 82 linhas são inclassificáveis.** Toda tela de custo agregado soma
simulação com dinheiro real. **Menor conserto:** acrescentar uma coluna
`simulated boolean NOT NULL DEFAULT false` a `provider_usage`, preenchida no
ponto de escrita a partir de `isFixtureMode()` — mesmo desenho de
`credit_ledger.simulated`, que já resolveu isto para o ledger. As 76 linhas
antigas ficam como `false` e **continuam mentindo**; corrigi-las exige decidir
caso a caso, que não é decisão de script. **PROPOSTO, NÃO IMPLEMENTADO.**

#### O padding: o par controlado JÁ EXISTE, e a Parte B do 5F está respondida

*MEDIDO — o mestre 9:16 de 02/08 é do **Mário**, e há um 16:9 do MESMO avatar:*

| Arquivo | Avatar | Proporção | Veredito |
|---|---|---|---|
| `5f77229e` (02/08) | **Mário** | 9:16 | **`padded`, 57,8%** — conteúdo 720×540 |
| `61caaab1` (31/07) | **Mário** | 16:9 | **`clean`, 0%** |
| `0a0193b8` (01/08) | TESTE REAL | 16:9 | `clean`, 0% |
| `…-5f-recortado-9x16` | Mário | 9:16 | `clean`, 0% (o ativo da Biblioteca) |

**Mesmo avatar, mesma foto de origem, duas proporções: a barra aparece só no
9:16.** Pela tabela de decisão da Parte B, isso é a linha *"com barra / limpo →
o preenchimento é do FORNECEDOR"*. **A rodada de controle de 2 gerações não é
mais necessária para essa conclusão** — o FOV-1 já tinha usado este par, e
aqui os vereditos foram reconferidos direto dos arquivos.

*Ressalva:* os dois têm roteiros e durações diferentes (33,7 s e 17,0 s), e a
generalização "a HeyGen sempre preenche em 9:16" continua **NÃO VERIFICADA** —
o medido é que **este avatar**, nestas duas proporções, se comporta assim.

#### Artefato pós-disparo: o UPDATE que o plano previa NÃO é necessário

Desde o 5D o polling **já** baixa, valida e persiste o artefato **antes** de
marcar `ready`, gravando a cópia local em `output_url` e a URL do fornecedor em
`provider_output_url` ([videos.ts:113](backend/src/routes/videos.ts:113)). O
`UPDATE` manual só faz falta no ramo de **falha da cópia**, que cai na URL
remota e deixa `artifact_persist_failed` no log.

- **Coluna `origin`: não existe em `videos`** — ela é de `video_variants`. Não
  há o que preencher aqui.
- **O proxy serve arquivo local:** resolve URL relativa contra o próprio
  servidor ([downloadProxy.ts:54](backend/src/services/downloadProxy.ts:54)).
- **A Biblioteca toca sem badge** quando `videos.simulated` é falso.

Contingência, **só se o log acusar `artifact_persist_failed`** (diretório do
projeto), conferindo o arquivo em disco **antes**:

```bash
docker compose exec -T postgres psql -U postgres -d twinai -c "UPDATE videos SET output_url='/uploads/<tenant>/<arquivo>.mp4' WHERE id='<VIDEO_ID>' AND output_url LIKE 'https://%'"
```

Espere `UPDATE 1`. A cláusula sobre `https://` existe para que rodar duas vezes
não faça nada na segunda.

#### Banda e cobrança — comprometidas ANTES do disparo

A banda por **caracteres** foi abandonada: ela ignorava o ritmo da voz. Pelo
wpm, com as 34 palavras do roteiro aprovado:

| wpm | duração prevista |
|---|---|
| **125** (medido nesta voz clonada) | **16,3 s** |
| 140 (configurado em `scriptDuration.ts`) | 14,6 s |

> **Banda comprometida: 14,6 a 16,3 s**, ou seja segundos cobrados **14, 15 ou
> 16**.

**Tabela de cobrança por segundo ENTREGUE truncado** (3 un/s · 60 un/US$):

| segundos entregues | unidades | custo |
|---|---|---|
| 12 | 36 | US$ 0,60 |
| 13 | 39 | US$ 0,65 |
| 14 | 42 | US$ 0,70 |
| 15 | 45 | US$ 0,75 |
| 16 | 48 | **US$ 0,80** |

**A estimativa da tela usa a duração PEDIDA, não a entregue** — para 15 s
pedidos ela mostra **US$ 0,75**. Divergência é ESPERADA e o sinal é previsível:
saindo no topo da banda (16 s) a estimativa terá sido **baixa** em US$ 0,05;
saindo embaixo (14 s), **alta** em US$ 0,05. *MEDIDO no ensaio em fixture, onde
a divergência é grande de propósito:* estimativa US$ 0,75 (15 s pedidos) contra
real US$ 0,25 (5 s entregues), com a tela dizendo *"a estimativa foi 3× o custo
real"*.

#### Continua NÃO VERIFICADO

- A forma real do erro do ElevenLabs para `voice_id` inválido.
- Se a HeyGen aceita `1080p` na nossa conta.
- Se o preenchimento em 9:16 é regra do fornecedor **para todo avatar**.
- A constante de custo contra FATURA (só contra saldo e quota da API).
- Cobrança abaixo de 1 segundo.

---

### RETOMADA-1 — houve disparo? Não. (2026-08-03, custo ZERO de fornecedor)

Rodada de **leitura**, aberta depois de uma troca de conta no meio de um
rearme. Nada foi disparado, nada foi gerado (nem em fixture), nada foi subido:
**zero `up -d`, zero `restart`, zero `stop`** — a regra existia porque `up -d`
apaga o stdout acumulado, e se um disparo tivesse acontecido esse log seria a
única prova das chamadas de voz. As duas únicas requisições que saíram da
máquina foram leituras de cota e carteira.

#### O estado do ambiente é o terceiro, e é o que engana

**REARMADO NO ARQUIVO, NÃO APLICADO.** Ver a tabela no aviso do topo desta
seção. O ponto que merece ficar: **nenhuma das duas leituras isoladas conta a
verdade.** `printenv` diz `fixture` e está certo sobre o processo; `docker
compose config` diz `live` e está certo sobre o arquivo. Quem consultasse só a
primeira concluiria "estamos seguros, pode mexer"; quem consultasse só a
segunda concluiria "está armado, não toque em nada". As duas conclusões levam a
ações erradas, e a diferença entre elas é um `up -d` de distância.

*MEDIDO:* `.env` alterado às **20:29:37 UTC**, container iniciado às
**18:58:17 UTC**, `RestartCount=0`, uma única linha de boot e ela diz
`fixture`. O arquivo foi armado 1h31 **depois** do boot e nunca chegou ao
processo.

**O risco que isso cria não é editar o `.env` — é subir o serviço.** Qualquer
`docker compose up -d`, qualquer recriação de container por qualquer motivo
(incluindo um `build`, ou o Docker Desktop reiniciando a máquina) aplica o modo
pago sem mais nenhuma pergunta. O `.env` já contém a frase de confirmação, que
é justamente a proteção desenhada para exigir um ato deliberado — e ela já foi
praticada. **A partir daqui, "subir o ambiente" e "armar o modo pago" são a
mesma ação.**

#### Não houve disparo — medido pelas duas pontas

Contra o **fornecedor**, lido às 20:45:14 UTC pela credencial do tenant:

| Leitura | Valor | Comparação |
|---|---|---|
| `GET /v2/user/remaining_quota` | **873** | igual a 02/08 e a 03/08 19:38 |
| `GET /v3/users/me` → `wallet.remaining_balance` | **US$ 14,55** | idem |

873 ÷ 14,55 = **60,0** — quinto ponto confirmando 60 unidades por dólar.

Contra o **banco**, recorte "criado depois de `0627af4`" (2026-08-03 19:57:22
UTC): **0 vídeos**, **0 linhas de `provider_usage`**, e **2 linhas de
`credit_ledger`** — ambas `grant +1` de `video`, `simulated=f`, sem
`related_video_id`, às 20:21:00 e 20:21:13. Isso é **reposição**, não consumo.
O último consumo do banco é de 19:30:06 UTC, `simulated=t`, e é o ensaio em
fixture que o FIXTURE-1 já registrou.

> **A frase: desde `0627af4` não gastou nada — 0 unidades de cota e US$ 0,00 —
> e o saldo de crédito de vídeo é 3.**

**Vale notar que as duas pontas eram necessárias.** O banco sozinho não
responderia: um disparo feito fora do app (curl à mão, script de sessão) não
deixaria linha em `videos`. A cota sozinha também não: ela mede o fornecedor,
não o nosso ledger. As duas juntas fecham.

#### Teto do polling — 450 s, o registro estava certo

*MEDIDO em código:* `POLL_INTERVAL_MS = 5000`
([videos.ts:23](backend/src/routes/videos.ts:23)) e `MAX_POLL_ATTEMPTS = 90`
([videos.ts:24](backend/src/routes/videos.ts:24)); o contador sobe no início do
callback ([videos.ts:38](backend/src/routes/videos.ts:38)), o corte é
`attempts >= MAX_POLL_ATTEMPTS` ([videos.ts:205](backend/src/routes/videos.ts:205))
e o timer é armado com o intervalo em
[videos.ts:232](backend/src/routes/videos.ts:232).

> **90 sondagens, uma a cada 5 s ⇒ teto de 450 s = 7 min 30 s.** A primeira
> sondagem cai em t≈5 s e a 90ª em t≈450 s. **Este é o número que define "em
> andamento"**: enquanto ele não vence, o vídeo ainda pode virar `ready` — e
> reiniciar o backend nesse intervalo mata o `setInterval` e prende o vídeo em
> `queued` para sempre, sem linha de falha e sem estorno (desfecho E do 4A).

**Precisão que o registro anterior não trazia:** 450 s é o instante do último
**disparo**, não o do desfecho. `setInterval` com callback `async` não
serializa — o timer dispara a cada 5 s independentemente de a sondagem anterior
ter voltado. Com o fornecedor lento, os ticks se sobrepõem e o desfecho
terminal chega alguns instantes depois dos 450 s. Portanto **450 s é piso de
parede, não teto exato** — quem for cronometrar uma passada deve esperar um
pouco mais que 7 min 30 s antes de concluir que o laço morreu.

#### O instrumento saiu do scratchpad — segunda vez que isto acontece

`quotaBaseline.ts` vivia no scratchpad de outra sessão, que é diretório
efêmero. **O número "873 / US$ 14,55" — que é a linha de base de todo cálculo
de custo real deste projeto — estava sustentado por código prestes a
desaparecer.** É a mesma situação que o INSTRUMENTOS-1 corrigiu com o
`scale-match.mjs`, e a segunda ocorrência em dois dias: instrumento que produz
número registrado precisa entrar no git no mesmo movimento que produz o número.

**Ficou em `backend/src/scripts/quotaBaseline.ts`, e não em `tools/`, por um
motivo mecânico:** ele precisa de `pool` e de `getCredential`, e o bind mount
que o torna executável é `backend/src → /app/src`. `tools/` também é montado,
mas em `/repo/tools`, sem acesso a `/app/src` — um script lá teria de importar
por caminho atravessado. `tools/` guarda ferramentas de **host** (`.mjs`,
`.sh`); ferramentas que falam com o banco moram junto das irmãs
(`probePadding.ts`, `controlRun.ts`, `proveDerivation.ts`).

```bash
docker compose exec -T backend npx tsx src/scripts/quotaBaseline.ts
```

**Sem segredo no fonte:** a chave é lida cifrada do banco e decifrada em memória
por `getCredential()`; a saída imprime só números e o nome do vendor. A guarda
de egress **não** o acusa porque `scripts/` sai antes de qualquer inspeção
([checkNetworkEgressPolicy.ts:145](backend/src/scripts/checkNetworkEgressPolicy.ts:145)) —
isenção deliberada e pré-existente, não algo afrouxado para este arquivo.

**Achado que fica como pendência: `GET /v3/users/me` NÃO está no
`endpointCatalog.ts`.** Só o `remaining_quota` está lá, declarado
`billable: false` ([endpointCatalog.ts:85](backend/src/services/providers/endpointCatalog.ts:85)).
Como o freio do probe **deriva** do catálogo (4A, item 5), um endpoint ausente
não é barrado **nem confirmado** — e é justamente o substituto que assume
quando o `remaining_quota` for desligado em **2026-10-31**. Hoje a segurança
dele é empírica: cota e carteira não se moveram entre 02/08 e 03/08 apesar de
ele ter sido chamado no intervalo. **Catalogá-lo é o conserto; NÃO foi feito
aqui**, porque esta rodada não mexe em código além da promoção do instrumento.

#### Correção: o "93% inclassificáveis" de `provider_usage` misturava populações

O FIXTURE-1 registrou que 93% das linhas de `provider_usage` são
inclassificáveis quanto a simulação. O número está certo como aritmética e
**errado como diagnóstico**, porque conta junto três populações que se comportam
de maneira diferente. *MEDIDO agora (83 linhas no total):*

| Recorte | Linhas | Com `video_id` | Classificável pelo join? |
|---|---|---|---|
| **geração de vídeo** (`avatar` com `video_id`) | **7** | 7 | **100% — 3 reais, 4 simuladas** |
| treino de avatar (`avatar` sem `video_id`) | 15 | 0 | não |
| roteiro (`script`) | 58 | 0 | não |
| voz (`voice`) | 3 | 0 | não |

**O recorte que importa — as linhas de geração de vídeo — é 100%
classificável.** As outras 76 não são, mas **não por defeito de preenchimento**:
treino, roteiro e voz **não têm vídeo a que se ligar**, então nenhum `video_id`
jamais existiria ali. Dizer "93% inclassificáveis" sugere dado perdido; o que
há é um join que nunca poderia funcionar para três quartos da tabela.

**O conserto proposto continua o mesmo e o argumento fica mais forte:** uma
coluna `simulated boolean NOT NULL DEFAULT false` em `provider_usage`,
preenchida na escrita a partir de `isFixtureMode()` — mesmo desenho de
`credit_ledger.simulated`. Ela é necessária **justamente** para as 76 linhas que
não têm entidade a que fazer join, e é inútil para as 7 que já se resolvem.
**PROPOSTO, NÃO IMPLEMENTADO** — as linhas antigas ficariam `false` e
continuariam mentindo, e corrigi-las caso a caso não é decisão de script.

#### Prova preservada

`uploads/_prova/retomada-03082026/` — o log do backend em UTF-8 (1.053.035
bytes, md5 `49b9211d3ef33498d08a9e18e3621757`) mais `MANIFESTO.txt`. Ele existe
por um motivo datado: é a prova de que o processo rodou em `fixture` do boot até
a coleta, apesar de o `.env` já estar armado — e **o `up -d` que aplicará o live
apaga esse log**. As três provas anteriores (`5f-e1e47cc/`, `fov/`,
`live-15s-03082026/`) foram conferidas **intocadas**. Continua valendo que
`uploads/*` é ignorado pelo git ⇒ **prova só existe neste disco**, e copiá-la
para fora é ação do operador.

#### Gate

`npm run check` **exit 0**, "todas as invariantes passaram" — rodado com
`-e PROVIDER_MODE=fixture` **só no processo do check**, sem tocar o container
nem o `.env`. Isso é obrigatório enquanto o ambiente estiver rearmado, pelo
defeito de guarda já registrado no fim de TELA-1: `checkPollPolicy` restaura o
modo **original** e depois cobra `isFixtureMode()`, então ela reprova quando o
original é `live`. **NÃO corrigido** — continua sendo mudança de guarda a se
fazer fora de uma passada armada.

#### Continua NÃO VERIFICADO (nada nesta rodada mudou isto)

- Se a HeyGen aceita `1080p` na nossa conta.
- A forma real do erro do ElevenLabs para `voice_id` inválido.
- A constante de custo contra FATURA (só contra saldo e quota da API).
- Cobrança abaixo de 1 segundo.

---

### LIVE-3 — a passada de 15 s em 16:9, medida e fechada (2026-08-03)

**Nota de nomenclatura, para quem for procurar depois:** o operador chama esta
passada de "LIVE-1" no planejamento dele. Aqui ela é **LIVE-3**, porque este
arquivo já tem um bloco LIVE-1 (2026-08-01, a primeira geração real) e um
LIVE-2. Mesma passada, nomes diferentes; o que a identifica sem ambiguidade é o
vídeo `8d28fd47-e927-4809-a462-d0d196c53c2e`.

Um vídeo real, **um clique**, do avatar Mário, plataforma YouTube (16:9/720p),
15 s pedidos, com o roteiro aprovado colado literalmente. Ambiente armado pelo
operador, disparado pela sessão, desarmado pelo operador — as três paradas
respeitadas.

#### A previsão comprometida ANTES do tiro bateu EXATA

Antes de clicar ficou escrito: 14 s → 42 un → US$ 0,70 · 15 s → 45 → 0,75 ·
16 s → 48 → 0,80. *MEDIDO:*

| | Antes | Depois | Delta |
|---|---|---|---|
| Cota | 873 | 831 | **−42 unidades** |
| Carteira | US$ 14,55 | US$ 13,85 | **−US$ 0,70** |

14,7893 s → trunca **14** → 14 × 3 = **42 unidades** → **US$ 0,70**. É a
**quarta medição exata** da regra de segundo inteiro truncado; sobre a duração
fracionária daria 44,4 unidades e não bateria em nenhuma. Razão 831 ÷ 13,85 =
**60,0** — sexto ponto confirmando 60 unidades por dólar.

**O custo é o DELTA de cota, nunca `unit_count`.** A tabela grava
`unit_count = 14,7893` com `unit_type = seconds`: são SEGUNDOS, não unidades.
Comparar os dois números é o erro mais fácil de cometer aqui.

#### O artefato

`ffprobe` no arquivo **local**: h264 High, **1280×720**, **SAR 1:1, DAR 16:9**,
25 fps, 14,807 s; áudio aac LC 48 kHz estéreo. 3.241.118 bytes, md5
`cf0b7bb4c42ada72e081dd7f185fd761`. `probePadding`: veredito **`clean`, 0,0% de
barra**, conteúdo 1280×720 — como previsto para 16:9, e o contraste com os
57,8% do 9:16 do mesmo avatar continua de pé.

O artefato **já veio persistido no nosso disco** — o `UPDATE` de contingência
previsto no plano não foi necessário, porque desde o 5D o polling baixa, valida
e grava antes de marcar `ready`.

#### `provider_usage` — duas linhas

| provider | unit_type | unit_count | requested | unit_source |
|---|---|---|---|---|
| voice/elevenlabs | characters | **180** | — | — |
| avatar/heygen | **seconds** | **14,7893** | 15 | `vendor_response` |

E em `videos`: `audio_duration_seconds = 14,81`, `audio_duration_source =
tts_timestamps`. **Aqui isso é medição de verdade** — o FIXTURE-1 registrou que
esse mesmo campo é RÓTULO em simulação, porque em fixture o caminho de voz nem
é alcançado. Em live ele é exercitado, e o valor vem do ElevenLabs.

#### (a) O ritmo de fala saiu de suposto para medido — mas n=1, e cuidado com a circularidade

34 palavras / 180 caracteres em 14,807 s ⇒ **137,8 wpm · 12,16 caracteres/s**.
Substitui os **125 wpm** que estavam registrados como suposição e os 140 wpm de
`scriptDuration.ts` (que o próprio código chama de "o número mais chutado dos
três"). As três leituras de duração disponíveis convergem — 137,7 (banco) ·
137,8 (ffprobe) · 137,9 (fornecedor) —, então o valor não depende de qual se
escolhe.

**A banda antiga (14,6–16,3 s) estava enviesada para cima:** a entrega real caiu
quase no piso dela.

> **AVISO DE CIRCULARIDADE, e ele importa mais que o número.** Os 12,16 car/s
> foram **AJUSTADOS NESTE MESMO PONTO**. Mostrar que 180 ÷ 12,16 = 14,80 s
> reproduz a medição **não é previsão validada** — é a definição da constante
> devolvendo o dado de onde saiu. Um parâmetro ajustado a uma amostra sempre
> reproduz essa amostra. **Só um SEGUNDO roteiro, de comprimento diferente, dá
> evidência preditiva.** Enquanto isso não acontecer, 12,16 car/s é uma
> observação de n=1: uma voz clonada, um roteiro, um idioma.

#### (b) A régua de cobrança é a duração do FORNECEDOR

Duas leituras de duração existem e **não** são a mesma coisa:

| Fonte | Valor | Trunca para |
|---|---|---|
| `vendor_response` (HeyGen, `data.duration`) | 14,7893 s | 14 |
| nosso `ffprobe` no arquivo | 14,807 s | 14 |

Diferença **0,0177 s**. **Aqui as duas truncam para 14 e a divergência não teve
consequência** — mas isso é sorte de amostra, não propriedade. Numa entrega a
~0,02 s de um inteiro elas separam: vendor 14,995 → 14 → US$ 0,70 contra ffprobe
15,002 → 15 → US$ 0,75. **Quem manda é o fornecedor**, porque é a leitura dele
que vira fatura; o nosso `ffprobe` serve para conferir o artefato, não para
prever a cobrança. `unit_source = vendor_response` já registra qual das duas
foi usada, e essa coluna existe exatamente para esta distinção.

#### (c) A estimativa da tela usa a duração PEDIDA — melhoria POSSÍVEL, não feita

*MEDIDO na tela do passo 6:* Estimativa (15 s pedidos) **US$ 0.75** · Custo real
(14,7893 s entregues) **US$ 0.7** · **42 unidades de cota** · Diferença
**−US$ 0,05**, "a estimativa foi 1.07× o custo real". **As 42 unidades exibidas
batem exatamente com o delta de cota medido contra o fornecedor** — a tela e a
carteira contam a mesma história.

O 1,07× não é defeito de cálculo: é a estimativa medir o **pedido** (15 s) e a
fatura medir o **entregue** (14 s cobrados). Estimar pela extensão do roteiro
(180 ÷ 12,16 = 14,80 s → 42 un → US$ 0,70) teria acertado o valor exato.
**Registrado como melhoria POSSÍVEL e NÃO implementada**, e o motivo é o aviso
de circularidade acima: trocar a régua da tela por uma constante ajustada a uma
única amostra é o tipo de mudança que parece uma melhoria e vira um erro
sistemático quando a voz, o idioma ou a pontuação mudam.

Defeito cosmético confirmado de passagem (nº 6 do TELA-1): a tela escreve
"US$ 0.7", com ponto decimal e sem o zero final. **Não corrigido.**

#### (d) A voz — a forma da resposta deixou de ser suposição

*MEDIDO no log:* **UMA** chamada ao ElevenLabs, ramo
`elevenlabs.synthesizeWithTimestamps`, HTTP 200. **O fallback NÃO disparou** —
confirma a correção registrada no 4A (o registro do PREVOO-1, que dizia "duas
chamadas por geração", já estava corrigido lá, e agora está confirmado contra o
fornecedor real). No total: 1 de voz + 13 da HeyGen (1 `uploadAsset`, 1
`createVideo`, 11 `pollVideo`).

**Esta é a PRIMEIRA resposta real de voz observada em log neste projeto**, e ela
fecha um NÃO VERIFICADO explícito do LIVE-2. A forma prevista estava certa:

```
{"event":"vendor_response","context":"elevenlabs.synthesizeWithTimestamps",
 "status":200,"bodyBytes":325005,"bodyForm":"json",
 "body":{"audio_base64":"<elidido: string de 317708 chars>",
         "alignment":"<elidido: objeto{characters, character_start_times_seconds,
                       character_end_times_seconds}>",
         "normalized_alignment":"<elidido: ...>"}}
```

**A elisão do LIVE-2 pagou por si na primeira vez que foi exercitada de
verdade:** 325.005 bytes de corpo viraram um registro de algumas centenas,
guardando forma e tamanho e nenhum byte de áudio. Sem ela, cada geração
despejaria ~325 KB no log.

**Roteiro enviado, medido no navegador antes do envio:** 180 caracteres, 187
bytes UTF-8, 34 palavras, `identico_ao_aprovado: true`. **Sem truncagem.**

#### O custo da voz: FECHADO — cobrança por CARACTERE

*MEDIDO em 03/08/2026. Fonte: painel ElevenLabs → Desenvolvedores → Análises →
Uso, janela 03/08/2026 00:00–19:03 UTC-3.*

| Campo do painel | Valor |
|---|---|
| Contagem (chamadas) | **1** |
| Caracteres | **180** |
| Créditos | **90** |
| Duração | **15 s** |
| Custo | **US$ 0,018** |

**A cobrança é por CARACTERE.** A hipótese "+187 por byte" está **REPROVADA**:
o roteiro tem 180 caracteres e 187 bytes UTF-8, e os **7 acentos não foram
cobrados**. O "+360 do fallback" já estava descartado pelo log, que registra
**uma única** chamada no ramo `synthesizeWithTimestamps`.

**Isto é medição DIRETA, não delta.** O painel discrimina a chamada, então não
foi preciso subtrair leituras. **A base 698 / 64.917 fica registrada como
OBSOLETA, não como pendência** — ela era o instrumento de um método que deixou
de ser necessário, e mantê-la na fila de pendências faria alguém ir buscar um
número que já não decide nada.

**Coerência com o LIVE-3, e ela fecha por um caminho independente:**
180 ÷ 14,807 s = **12,16 caracteres/s** — idêntico ao ritmo de fala medido no
artefato. O painel e o `ffprobe` chegam ao mesmo número sem se consultarem.

*Nota de precisão, sem consequência:* o painel reporta **15 s** onde o nosso
`ffprobe` mede 14,807 s e a HeyGen declara 14,7893 s. Os 15 s do ElevenLabs
não entram em conta nenhuma — quem paga vídeo é a HeyGen, e a régua dela é a
duração do fornecedor de vídeo (ver o item (b) acima).

**Ordem de grandeza que vale guardar:** US$ 0,018 de voz contra **US$ 0,70** de
vídeo na mesma geração — a voz é **2,5%** do custo. Otimizar caractere de
roteiro para economizar dinheiro é esforço mal empregado; o que o comprimento
do roteiro move de verdade é a **duração**, e é a duração que a HeyGen cobra.

**DEDUZIDO — a razão de créditos é evidência indireta sobre o `model_id`.**
O painel cobrou **0,5 crédito por caractere** (90 ÷ 180), e a mesma razão
aparece numa segunda linha da janela (535 ÷ 1070). Meio crédito por caractere é
a tarifa da **classe Flash/Turbo** do fornecedor, não a da família
`eleven_multilingual_v2`, que é o default declarado em
`ELEVENLABS_TTS_MODEL`. Ou seja: há indício de que o modelo efetivamente usado
**não** é o que o código pensa estar pedindo.

Três ressalvas que impedem isto de virar conclusão: a razão é uma propriedade
da **tarifa**, não uma identificação do modelo; o mapeamento razão → família
vem da tabela pública do fornecedor, não de resposta a uma chamada nossa; e o
corpo da requisição **não é registrado por desenho** (o LOG-1 registra só a
RESPOSTA), então nada no nosso log confirma ou desmente o que foi enviado.
**Continua NÃO VERIFICADO**, agora com evidência indireta apontando numa
direção — o que é diferente de não ter evidência nenhuma. Fechá-lo é barato e
não passa por gerar áudio: basta um caminho que registre o `model_id` enviado
(campo próprio no evento, não o corpo inteiro, que traz o texto do cliente).

**Por que o painel é a única fonte:** a chave em uso **não** lê
`GET /v1/user/subscription` — *MEDIDO:* HTTP **401**,
`"The API key you used is missing the permission user_read to execute this
operation."` Isso é **permissão faltando, NÃO chave inválida**, e o diagnóstico
errado aqui custa tempo. Conceder `user_read` à chave é **pendência do
operador**, e enquanto não for feito o consumo de voz só é legível a olho humano
no painel.

#### O ativo da apresentação

```
uploads/c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd/21f74956-9aab-44b4-9b85-4abda698f6c3.mp4
md5 cf0b7bb4c42ada72e081dd7f185fd761 · 3.241.118 bytes
```

*Verificado no navegador, com o ambiente já de volta em `fixture`:* está no
**topo** da Biblioteca, toca com `readyState 4`, **1280×720**, `aspect-ratio`
computado **16/9**, `seekable 0–14.807`, servido de
`dev-c77a5b.twinai.localhost:8090/uploads/…` — **`externo: false`**, do nosso
disco, não do CDN. **Zero `simulated-notice` na página** e a linha do vídeo real
não tem selo.

**E o par que ficou na Biblioteca é a melhor prova de badge que este projeto
tem:** logo abaixo do vídeo real está o ensaio em fixture **com o mesmo
roteiro**, esse **com** SIMULADO. Mesmo texto, mesmo dia, ambiente em `fixture`
— e só o simulado é carimbado. Se o selo seguisse o modo do AMBIENTE, como
seguia antes da Fase 1-bis do 5D, o vídeo pago estaria marcado como simulado
na tela da apresentação.

#### Disciplina da passada

**Um clique.** *MEDIDO:* 12 → 13 linhas em `videos`, uma só, sem duplicata —
conferido no banco segundos após o clique, que é o procedimento que substitui
"clicar de novo porque a tela não respondeu". Desfecho `ready` em ~12 s. Crédito
3 → 2, uma linha `-1 consumption` com `simulated=f`, sem estorno. **Zero
`restart`, `up -d` ou `stop` durante a geração** — a regra existe porque o
polling roda em `setInterval` FORA do `withLiveBudget`, e um reinício ali prende
o vídeo em `queued` para sempre (desfecho E do 4A).

**Prova em `uploads/_prova/live-15s-03082026/`**: o mp4, o log do backend em
UTF-8 (150.009 bytes, md5 `7636a497947fab5c8f20d382a5fcec35`), o log de pré-voo
e o `MANIFESTO.txt`. **O log foi salvo ANTES de qualquer outra medição**, e essa
ordem se provou necessária: o `up -d` do desarme zerou o stdout do container, e
ele é a única prova das chamadas de voz. As três provas anteriores
(`5f-e1e47cc/`, `fov/`, `retomada-03082026/`) foram conferidas **intocadas**.
`uploads/*` é ignorado pelo git ⇒ **prova só existe neste disco**; copiá-la para
fora é ação do operador.

#### Continua NÃO VERIFICADO

- **As outras 4 chamadas de `/v1/text-to-speech/{voice_id}/with-timestamps`** na
  janela de 7 dias do painel. A leitura que fechou o custo é da janela de
  **03/08 00:00–19:03 UTC-3**, onde há **1** chamada — a nossa. As outras 4 da
  janela larga não têm origem identificada: não se sabe de qual sessão, de qual
  roteiro nem de qual voz vieram, e nada no nosso log as alcança (o log do
  container é zerado a cada `up -d`). Fechá-las exige a janela de 7 dias
  discriminada por dia, do mesmo painel.
- **Se os 5 erros 401 do painel são todos de `/v1/user/subscription`.** É a
  hipótese natural — a chave não tem `user_read`, e esse endpoint foi
  exercitado —, mas o painel não discrimina o endpoint que falhou. Enquanto
  isso não for conferido, **não se pode afirmar que nenhum 401 veio do caminho
  de síntese**; um 401 em TTS teria outro significado inteiramente.
- **Se a HeyGen aceita `1080p` nesta conta.** Não foi pedido nesta rodada, e
  continua sendo a única forma de saber se os 2,25× de pixels úteis medidos no
  INSTRUMENTOS-1 estão disponíveis pelo mesmo preço.
- **A constante de custo contra FATURA.** Tudo até aqui é medido contra saldo e
  cota da API; nenhuma fatura do fornecedor foi lida em sessão nenhuma.
- **Cobrança abaixo de 1 segundo.** Pela regra de truncagem custaria zero, e
  nenhuma entrega nossa ficou perto disso (a menor tem 3,372 s).
- **Se o preenchimento em 9:16 vale para outros avatares.** *MEDIDO* apenas para
  o Mário, nas duas proporções (16:9 `clean` × 9:16 `padded` 57,8%). Que "a
  HeyGen sempre preenche em 9:16" continua uma generalização de uma amostra.
- **`model_id` efetivamente enviado ao ElevenLabs.** Não aparece no log **por
  desenho** — só a RESPOSTA é registrada, nunca o corpo da requisição. O default
  do código é `eleven_multilingual_v2`, já aceito pelo fornecedor no 5D.
  **Deixou de ser ausência total de evidência:** a razão de 0,5 crédito por
  caractere medida no painel aponta para a classe Flash/Turbo — ver o DEDUZIDO
  na subseção do custo da voz, acima.

---

