Always respond in Brazilian Portuguese.

> **⚠️ NOTA — VITE-PROD-3, 14/08/2026.** HEAD antes desta nota: `7f46725`.
> Quatro commits nesta rodada, em sequência: `10166df` (Dockerfile 3 estágios
> base/build/serve + nginx.conf novo + docker-compose.prod.yml), `7ca81b1`
> (BASE_DOMAIN obrigatória em build de produção — vite.config.ts +
> checkFrontendBuildEnvPolicy.ts novo), `fd525c3` (fiação em checkPolicy.ts +
> mutantRegistry.ts), `7f46725` (404 do carimbo do frontend vira FALHA, não
> NOTA — checkImageFreshnessPolicy.ts + frontendStampFetch.ts novo, extraído
> para evitar auto-colisão no registro de mutantes).
>
> **Gate simples** (`npm run check`): 1 violação —
> `frescor: a imagem do frontend NÃO corresponde ao repositório` —
> ESPERADA: `frontend/Dockerfile` e `frontend/vite.config.ts` foram editados
> sem rebuildar a imagem (proibido nesta rodada). Some sozinha quando a
> imagem for reconstruída.
>
> **Arnês** (`node tools/run-mutants.mjs --affected --base 498486e --guard
> "frescor:" --guard "frontend: BASE_DOMAIN"`): **5/5 mutantes reprovaram de
> verdade**, árvore limpa em cada aplicação — os dois de `frescor` já
> existentes, o novo do 404→NOTA, e os dois de `BASE_DOMAIN` (default sem
> guarda; typo em NODE_ENV). Um terceiro mutante de BASE_DOMAIN (execução
> real de `vite build`) NÃO foi registrado — o gate roda inteiro dentro do
> container do backend, sem o projeto do frontend instalado. Lacuna
> registrada, não fingida como coberta.
>
> Nenhuma imagem foi buildada, nenhum container subiu, nada tocou a VPS
> nesta rodada.
>
> **PRÓXIMO PASSO: levar os 5 arquivos de runtime (Dockerfile, nginx.conf,
> docker-compose.prod.yml, vite.config.ts, checkFrontendBuildEnvPolicy.ts)
> para a VPS por SSH — sequência em VITE-PROD-2 item 6, com o passo 1
> corrigido: não é git pull, é colar os arquivos direto (deploy real é
> tar.gz, não git).**

> **⚠️ NOTA DE TROCA DE CONTA — 21/08/2026.** Sessão de POC standalone (fora
> deste repositório) em `POC-MOTORES\05-fracoes\`, testando composição de
> vídeo por frações encadeadas (cada fração parte do último frame da
> anterior) em dois motores — Seedance e Wan — mais lipsync com voz clonada,
> e um teste local de atenuação de rugas por `smartblur`. Trabalho pausado
> para trocar de conta; para retomar do ponto exato onde parou, **digite
> RETOMAR-FRACOES no Claude Code** — instruções completas em
> `POC-MOTORES\05-fracoes\RETOMAR.md`, que por sua vez manda ler
> `POC-MOTORES\05-fracoes\README-CONTINUIDADE.md`.

# eckko.ai (antigo TWINAI)

> ## ⚠️ LEIA [ESTADO.md](ESTADO.md) PRIMEIRO — é o ponto de entrada de toda sessão.
>
> Ele diz onde o repositório está HOJE: HEAD, bloco atual e próximo da ordem de
> execução, invocação exata do gate e das passadas, os gotchas do arnês, o que
> está NÃO VERIFICADO e as dívidas abertas. **Este CLAUDE.md é o acumulado
> histórico** — o que foi medido, o que custou dinheiro e por quê. Quando os
> dois discordarem sobre o estado ATUAL, o ESTADO.md vence; quando discordarem
> sobre uma medição do passado, este arquivo vence.
>
> **REGRA — o ESTADO.md é atualizado no ÚLTIMO commit de TODA sessão.** Não é
> opcional e não é "quando houver mudança relevante": uma sessão que fecha sem
> atualizá-lo entrega à seguinte um arquivo que MENTE sobre o HEAD, e um
> ponto de entrada desatualizado é pior que nenhum — ele é lido com confiança.
> Se ao abrir a sessão a data dele for mais velha que o último commit, conserte
> isso antes de qualquer outra coisa.

SaaS multi-tenant de vídeo com avatar digital. Docker Compose: `traefik` (única porta, **8090**), `postgres`, `backend` (Fastify/TS), `frontend` (React/Vite). **HEAD `84fdae3`** + o commit deste fechamento. Há uma **demo a apresentar**.

**0 · REGRA DE ESCRITA — confira o número MEDIDO contra o número AFIRMADO antes de escrever a mensagem de commit.** Três imprecisões em três commits: `84fdae3` disse "nenhuma removida" com 3 guardas reescritas, e `5de2ed6` disse "8 mutantes novos" sendo 7. Nenhuma delas mudou o código; todas fizeram a mensagem valer menos do que o diff. Contar é barato — reler a afirmação com o número na mão custa segundos.

**INTEGRIDADE DO POSTGRES local, MEDIDA em 21/08/2026, depois de um `docker compose up -d backend` ter recriado o CONTAINER do postgres.** `docker inspect twinai-postgres-1` confirma que o volume `twinai_pgdata` é NOMEADO e persistente (`RestartCount: 0`, container novo, volume o mesmo) — recriar o container não apaga o volume. Prova de continuidade não é só a contagem, é registro específico e antigo sobrevivendo: tenant `c77a5b8a…` (`dev-c77a5b`, criado 16/07), avatar "Mário" (`983c7de4…`, 16/07) e avatar "TESTE REAL 15:40 01/08" (`7557957c…`, criado exatamente 01/08) — todos batendo com datas e ids já documentados neste arquivo meses atrás. Controle negativo: o vídeo `9704eb5f…` (citado alhures como existente só em produção) **não aparece** neste banco local, confirmando que a consulta distingue ambiente. **Números de HOJE, para servir de "antes" na próxima comparação:** `tenants` **34**, `videos` **31**, `api_credentials` **102**, `avatars` **20**.

**Amostra de voz — a duração-limite agora é 218 s (3:38)** e é DERIVADA, não escolhida: `floor(10 MiB / (24000 Hz × 2 bytes))`. A saída da conversão passou de 48 para **24 kHz** (item 4.2 do FECHAMENTO-1), o que fez a captura de 2:33 do E2E-1 voltar a caber — 7.338.318 B contra os 14.676.558 B de 48 kHz (os **dados** são metade exata, 7.338.240 B; o arquivo difere em 39 B porque o header de 78 B não se divide). As duas réguas (recusa por tamanho e `checkSampleDuration`) saem da MESMA função, e a faixa 109–120 s em que uma aceitava e a outra recusava não existe mais. O **aceite do fornecedor está MEDIDO desde 05/08 e o risco está FECHADO**: o ElevenLabs aceitou exatamente este WAV numa clonagem real — `cloneVoice` HTTP **200**, `{"voice_id":"5Yeum4QN7o9S5Lc0XVOx","requires_verification":false}`. Era o último NÃO VERIFICADO entre o projeto e a demo. Prova em `uploads/_prova/fechamento1-24khz/` e `uploads/_prova/tiro-final/`.

**ElevenLabs, item 3 do FECHAMENTO-1 — FECHADO como NÃO VERIFICADO, não procurar mais.** O `model_id` já era enviado em **03/08** (`ed207db`, ancestral de `2640342`), então a hipótese de "faltava mandar o modelo" está descartada. Por que os 90 créditos foram cobrados à tarifa de Flash/Turbo continua sem resposta possível daqui: a resposta gravada não traz o modelo e os cabeçalhos passam por allowlist. Fica assim.

**Custo do arnês — hipótese REFUTADA.** `npm run check:mutants` custa **1.290 s = 21,5 min** (cronometrado em 04/08, 122/122 verde), **não ~52**, e não são as guardas novas: as de voz somam **540 ms** (medido nesta retomada; 609 ms na anterior) de um gate de **10.898 ms** — 5%. O tempo está no PRODUTO: **122 mutantes × 10,6 s de gate**, e cada mutante paga um gate inteiro. Dentro do gate: `tsc --noEmit` ~4,0 s + `checkPolicy` ~5,9 s + ~1,0 s de `docker compose exec`/npm. Ou seja, ~40% de cada execução é um `tsc` que quase nenhuma mutação altera. Guarda nova só move o ponteiro se custar segundos, não milissegundos.

**GUARDA B — os DOIS lados estavam sem medição; só o "usado" foi corrigido (04/08).** Ela compara `usado >= teto` e os dois números eram supostos. **Usado — CORRIGIDO:** contava `data.voices.length`, e `GET /v1/voices` traz a biblioteca `premade` do fornecedor junto com as vozes da pessoa. Numa conta de **4** vozes ele devolveu **25**, e uma clonagem legítima foi recusada com "25 de 10 vozes em uso" (nada gasto — a recusa é antes da clonagem). Agora `countOwnedVoices()` conta o que **não** é `premade`. **A categoria deixou de ser deduzida em 05/08:** o inventário real traz **26 itens = 21 `premade` + 5 `cloned`**, e os 21 batem exatamente com a aritmética 25−4 de antes. A correção está provada em produção — a clonagem que antes era recusada com "25 de 10" passou avaliando **4 de 10**. **Substituir a voz de um avatar NÃO libera o slot da antiga:** o fornecedor ficou com as duas, com o mesmo nome, e a conta foi de 4 para 5. **Teto — SEGUE SUPOSTO:** `DEFAULT_VOICE_SLOT_LIMIT = 10` é declarado, e o real vive em `/v1/user/subscription`, que responde **401** sem `user_read`. Não foi tocado. Enquanto o teto for palpite, esta guarda pode barrar cedo demais de novo — só que agora pelo lado que ainda não foi medido.

**VÍDEO REAL DE 05/08 — o que ficou MEDIDO.** Um vídeo pago saiu pelo produto (`8e7941d1`, avatar `7557957c`, voz clonada `5Yeum4QN…` — **substituída desde então; ver o bloco VOZ DO AVATAR logo abaixo**).
- **Ritmo: 474 caracteres ÷ 36,9876 s = 12,8151 c/s** — venceu a hipótese de 13,0 (erro 0,185). **A pontuação desacelera 8,4%**: 13,9871 c/s em 87 caracteres contra 12,8151 em 474, mesma voz e modelo. Era DEDUZIDO, agora é MEDIDO.
- **Régua, 5ª confirmação, ao centavo:** 36,9876 → 36 → 108 un → **US$ 1,80**. Saldo 831 → 723, carteira 13,85 → 12,05.
- **Primeira vez que a régua do FORNECEDOR mudou o resultado:** nosso `ffprobe` deu 37,000000 s, ele deu 36,9876 s. Truncados, **37 e 36** — cobrar pelo nosso número teria errado 3 un / US$ 0,05 para cima. Antes as duas réguas só coincidiam.
- **Sonda: `padded`** — quadro 720×900 (4:5), conteúdo 720×540 (**4:3**), **40,0% preenchido**, recorte x=0 y=180. **Primeiro caso real do caminho `padded`**; o caminho `pending` continua sem caso real.
- **Custo de voz, MEDIDO no painel:** 561 caracteres (87+474) → **280 créditos, US$ 0,056**, contagem 2. Confirma 0,5 crédito/caractere e US$ 0,0001/caractere. **O painel é legível mesmo com o 401** — o item aberto vira "leitura manual", não "impossível".
- **mp4:** `ba25ab33`, 3.441.685 B, md5 `bebc3ff22e098d2d35b43c8181f662bf`, h264 720×900, 25 fps, 37,000000 s, `simulated=f`.

**VOZ DO AVATAR `7557957c` — o `5Yeum4QN…` citado acima é HISTÓRICO, não o de hoje. MEDIDO em 11/08/2026 15:02Z**, por `SELECT voice_id FROM avatars WHERE provider_avatar_id='6f60dca9…'` mais `GET /v1/voices` e `GET /v1/voices/{id}/settings` no ElevenLabs.
- **Hoje o avatar aponta para `0hQuq0q2JEk1SY4lZaM9`.** O `5Yeum4QN7o9S5Lc0XVOx` é o mesmo AVATAR, em 05/08 — não é "de outro avatar": a voz foi **substituída** depois, e é exatamente o comportamento que a GUARDA B já registrava (substituir não libera o slot da antiga).
- **CINCO vozes com o nome "TESTE REAL 15:40 01/08" convivem na conta** — `0hQuq0q2`, `OL7KwfVf`, `5Yeum4QN`, `5Qfze6o4`, `WcfjPG5w`. O nome não identifica voz nenhuma; só o `voice_id` identifica.
- **⚠️ A conta está em 10 vozes próprias (`category != premade`) contra o `DEFAULT_VOICE_SLOT_LIMIT = 10` declarado.** Pela régua da GUARDA B isso é **10 de 10**: a próxima clonagem é recusada por nós. O teto REAL segue SUPOSTO (vive em `/v1/user/subscription`, que responde 401 sem `user_read`), então não se sabe se a recusa seria correta.
- **`speed` medido nas duas:** `5Yeum4QN` = **1.0** (confirma a base de `CHARS_PER_SECOND`); `0hQuq0q2` = **0.9**. O comentário em [voiceProvider.ts:233](backend/src/services/providers/voiceProvider.ts:233) afirma que o GET mostra 0.85 — **desatualizado**, e sem efeito: o corpo da síntese manda `voice_settings.speed = VOICE_SPEED` (0.85) e **sobrescreve** o salvo a cada chamada ([voiceProvider.ts:296](backend/src/services/providers/voiceProvider.ts:296)). A estimativa divide por essa mesma constante, então tela e fornecedor continuam falando do mesmo número.
- **GAP SEM GUARDA:** `voiceId: avatar.voice_id` ([videos.ts:1179](backend/src/routes/videos.ts:1179)) **não tem guarda ancorada no uso**. Trocá-lo por um id fixo passa o gate inteiro. As guardas de voz que existem olham a TELA do passo 1 e a PRÉVIA pós-clonagem, nunca o id que entra em `synthesizeSpeech`.

**OS 5 DEFEITOS DA PASSADA — 3, 4 e 5 CORRIGIDOS em 05/08; 1 e 2 seguem abertos, e são os visíveis a olho nu numa demo.**
1. **ABERTO — cenário e traje são coletados, persistidos e NUNCA enviados.** [videos.ts](backend/src/routes/videos.ts) chama `generateVideo({...})` sem eles, e `grep scenario|outfit` em `backend/src/services/providers/` dá **zero**. Perde-se no NOSSO código, no call site. **Ligar não é opção hoje:** nenhum contrato deste repositório declara campo de cenário ou traje para `POST /v3/videos` — o payload que sai é `{type:"avatar", avatar_id, audio_asset_id, aspect_ratio, resolution}` e o `endpointCatalog` só guarda path/método/tarifação, não schema. Inventar campo é pior que não mandar. **Proposta registrada: REMOVER o passo 3** (ele também tem o seletor de avatar, redundante com o passo 1). Decisão do usuário, não executada.
2. **ABERTO — 40% do quadro é barra sólida** no 4:5 entregue. **A infraestrutura de derivação está pronta e NUNCA foi ligada:** `deriveVariantsForVideo` ([deriveVariants.ts](backend/src/services/video/deriveVariants.ts)), `formatDerivation.ts`, a sonda de preenchimento e a tabela `video_variants` (migration 041) existem, têm guardas verdes — e **zero chamadores fora dos scripts**. Ligar exige: pedir o MASTER ao fornecedor em vez da proporção escolhida, derivar depois de persistir (dentro do `pollJob`), servir a variante e a tela consumi-la — **5 arquivos de produto** (`routes/videos.ts`, `types.ts` dos dois lados, `VideoPlayer.tsx`, `ContentPage.tsx`) mais o que as guardas de formato afirmam hoje sobre o payload. E só se prova com **um tiro pago**. **Atenção à divergência de política:** `MASTER_ASPECT_RATIO` está em **`"9:16"`** ([formatDerivation.ts:338](backend/src/services/providers/formatDerivation.ts:338)), não em 16:9 — trocar isso é decisão de produto já discutida em `docs-internal/05` e **não aplicada**. **Recomendação para a demo: RETIRAR o 4:5 das opções** (2 arquivos: `videoFormat.ts` e `publishPlatforms.ts`, 2 entradas cada — Instagram e Facebook) e apresentar em 16:9, que está MEDIDO limpo (0% de barra no master do LIVE-1), enquanto o 9:16 medido tem 57,8%.
3. **CORRIGIDO — o passo Duração deixou de fingir escolha.** Os chips 15/30/60 saíram; a duração é DERIVADA do roteiro, somente leitura, com o custo ao lado. O roteiro do cliente **não é truncado** — acima de **60 s estimados** o passo 6 exige confirmação explícita (checkbox; o botão fica desabilitado até marcar, medido na tela). O servidor deriva e ignora `duration_seconds` do corpo. `buildHeygenVideoPayload` continua sem campo de duração — isso é do fornecedor, não nosso.
4. **CORRIGIDO — a estimativa sai do ROTEIRO.** `estimateSecondsFromScript(video.script)` no lugar de `video.duration_seconds`. **Ritmo MEDIDO e DERIVADO, não digitado:** `474 ÷ 36,9876 = 12,815105… c/s` ([scriptDuration.ts](backend/src/services/video/scriptDuration.ts)). Reprodução exata do caso pago: 474 car → 36,9876 s → 36 s → **108 un → US$ 1,80**. Arredondar para 12,8 daria 37 s e **111 un** — por isso a constante é a divisão, não o número redondo. A tela passou a escrever **US$ 1,80** (vírgula, 2 casas) onde escrevia "US$ 1.5".
5. **CORRIGIDO — o player mostra a duração ENTREGUE.** `GET /videos` e `/videos/:id` trazem `delivered_seconds` de `provider_usage` (a linha `unit_source='requested'` é descartada: ela guarda o pedido). Sem medição, mostra a estimada **rotulada como estimada**. Medido na galeria: "36,99 s entregues · 9:16".

**FILA DE TEXTO DE TELA — fechada em 05/08, e o levantamento estava desatualizado.** `ficheiro` **não existe em lugar nenhum do código** (o `grep` no repositório inteiro só acha a linha que reclamava dele); a chave é `orUploadFile: "ou enviar um arquivo de áudio"`. "Grave de 1:00 a 1:30" também não existe mais — a guarda de política de voz proíbe horário fixo no `hint`. **O que estava errado era outra frase:** "pode gravar mais, **não há limite**", num fluxo cujo teto real é 218 s. Agora `/voice/sample-policy` devolve `max_seconds` (derivado por `maxSampleSecondsFor`, a MESMA função da recusa) e o texto diz o teto.

**DEMO-1, item 0 — CAPACIDADES DA CONTA, MEDIDAS POR GET EM 05/08. Nenhum POST, nada gasto.**

| O quê | Medido | Como |
|---|---|---|
| v3 alcançável | **SIM** | `/v3/users/me` 200 · `/v3/avatars` 200 · `/v3/avatars/{group}` 200 |
| Plano | `billing_type: "wallet"`, saldo **US$ 12,05** | `/v3/users/me` |
| Cota | **723 un** (`details.api: 723`) | `/v2/user/remaining_quota` |
| Avatar IV | **disponível** — é o default do `engine`; a conta tem `avatar_iv_free_credit: 3` | doc + cota |
| ~~Avatar V indisponível~~ | **REFUTADO em 06/08** — ver abaixo | `GET /v3/avatars/looks/{id}` |
| ~~`supported_api_engines` por GET não existe~~ | **REFUTADO em 06/08** — ver abaixo | idem |

**`supported_api_engines` É LEGÍVEL POR GET — o endpoint existe e as duas linhas riscadas acima estavam erradas.** `GET /v3/avatars/looks/{id}` responde **200** e traz o campo. Medido em 06/08 nos três ids: look Jaleco branco, avatar do Mário e avatar "TESTE REAL". **Os três devolvem `["avatar_v","avatar_iv","avatar_iii"]`** — ou seja, **avatar_v ESTÁ listado**, e a conclusão anterior de que ele exigiria `digital_twin` não se sustenta contra esta leitura. O mesmo GET traz `avatar_type: "photo_avatar"`, `status`, `group_id`, `preferred_orientation` e as dimensões da imagem (o Jaleco tem **2400×1792**, contra 640×480 do avatar base). **Que avatar_v FUNCIONE segue NÃO VERIFICADO** — estar listado é o fornecedor dizendo que aceita, não uma geração provando; e o item 2 das "três coisas que o fornecedor não tem" registrava outra objeção (avatar_v não documenta `audio_asset_id`, e é a voz clonada que dirige a geração aqui) que este GET **não** responde.

**O avatar do Mário é TALKING PHOTO (avatar de foto), não digital twin.** `photo_avatar_id 45528bb8…`, grupo **`21812e52d8bb48659b49405140e998bb`** (o id registrado aqui antes, `21812e52d4e2…`, **estava errado** — os 8 primeiros dígitos coincidem e o resto não; medido por `GET /v2/photo_avatar/{avatar}`, que devolve o `group_id`), `business_type: "uploaded"`, `status: completed`, **3 looks em 06/08** (era 1). A conta tem 4 grupos privados `twinai-*`, um look cada. `/v3/avatars/{id}` espera **group id**, não look id — o 404 diz "Avatar group … not found" (isto encerra a ASSUMPTION registrada em `avatarProvider.ts`).

**O que o fornecedor aceita em `POST /v3/videos` (doc pública, lida por GET):** `background.type` ∈ **{color, image}** · `motion_prompt` texto livre · `expressiveness` ∈ {low, medium, high} (avatares de foto) · `engine.type` ∈ {avatar_iii, avatar_iv, avatar_v} · áudio por `audio_asset_id`, `audio_url` ou `script`+`voice_id`, mutuamente exclusivos.

**TRÊS COISAS QUE O DEMO-1 PEDIU E O FORNECEDOR NÃO TEM — decididas com o operador, não reabrir.**
1. **Fundo por VÍDEO não existe.** O enum tem dois valores e a composição de cena declara só cor sólida. Decisão: **cor e imagem apenas**.
2. **Avatar V não serve aqui.** Exige `digital_twin`; não documenta `audio_asset_id` (e a voz clonada do ElevenLabs é o que dirige a geração); não tem `expressiveness`. Decisão: **IV padrão, III alternativa**.
3. **Presets de expressão/gesto/olhar não existem** em nenhum motor. O que há é `motion_prompt` + `expressiveness`. Qualquer orientação de escrita na tela é recomendação NOSSA, e o texto precisa dizer isso.

**DEMO-1 — o que ESTÁ feito (2 etapas, commits `86d1b2e` e `7c64c91`):** o payload leva fundo (cor/imagem como asset), `motion_prompt`, `expressiveness`, `engine` e o look; a migration 042 guarda a cena; a simulação passou a montar o payload REAL e imprimi-lo; teto diário no banco (default 5, imune a `restart`); margem 1,10 no portão de roteiro longo; 3 guardas novas, cada uma provada reprovando. **126 mutantes declarados** (3 novos).

**DEMO-2 (05/08) — A TELA. Wizard em 4 passos: Avatar · Roteiro · Cena · Gerar.** O passo Cena reúne fundo (cor hex ou imagem, com prévia e validação local), interpretação (`motion_prompt` com contador + expressividade em 3 níveis), traje (seletor de look, desabilitado com 1 look) e formato. **4:5 RETIRADO** do catálogo — Instagram e Facebook eram as duas entradas 4:5. Publicação saiu do fluxo. `GET /avatars/:id/looks` devolve `{looks, canChoose}`; em fixture são **3 looks**, para exercitar o seletor habilitado que a conta real (1 look) não produz. "Gerar novamente" repete o corpo por uma função de montagem única. Guarda nova: `os cinco controles chegam do formulário ao payload`, mutante `o formulário deixa de propagar a interpretação`, provado reprovando. Commits `44a5e5e`, `1ba8f39`, `3653f6b`.

**TRAJE-2 e TRAJE-3 (06/08) — O CONTRATO DO TRAJE, FECHADO POR LEITURA E MEDIÇÃO. Nenhuma geração nesta rodada; o custo foi zero.**

**O traje NÃO tem campo — ele SUBSTITUI o avatar.** A doc do fornecedor diz na letra: *"The look id is the `avatar_id` to pass when creating a video"* (`/reference/list-avatar-looks.md`). Então `providerAvatarId: look ?? avatar` não é gambiarra, é o contrato. A decisão saiu do handler para [lookSelection.ts](backend/src/services/avatar/lookSelection.ts) — dentro da rota ela só era exercitável subindo a aplicação, e o arnês provou isso ao devolver AMBÍGUO no primeiro mutante. **A extração achou um defeito de brinde:** `"" ?? x` devolve `""`, e um seletor sem escolha mandaria `avatar_id: ""` — 4xx **depois** do débito, no caminho mais comum de todos.

**A geração de 06/08 saiu sem traje porque o traje nunca foi escolhido — não porque se perdeu.** MEDIDO no log: `avatar_look: "6f60dca9…"`, que é o avatar base **"TESTE REAL 15:40 01/08"**, não o Mário (`45528bb8…`) e não o Jaleco (`800e04f0…`); `avatar_look_id` **NULL** na linha; **HTTP 200**, sem 400 e sem retry. O avatar usado nem possui aquele look — o Jaleco é do Mário.

**DOIS CAMPOS FALTAVAM, e os dois foram medidos sem gastar.** A sonda usa `avatar_id` inexistente como **fusível**: sem avatar não há render, então o levantamento é grátis e a resposta chega antes de qualquer cobrança.
- **`additionalProperties: false` CONFIRMADO — mas SÓ NO TOPO, e isso foi medido em 06/08.** Campo desconhecido na raiz volta **400 "Extra inputs are not permitted"**, com o nome do campo em `param`. Como o débito é **antes** da chamada, campo inventado custa o estorno. A guarda mantém a lista fechada nos **21 campos** transcritos da doc. **Dentro de `background` NÃO há fechamento:** `scale`, `fit`, `crop`, `position`, `opacity`, `quality` e `blur` passaram a validação (chegaram ao 404 do fusível, não ao 400), ou seja, o fornecedor **aceita e ignora em silêncio** — o mesmo pior-caso do `expressiveness` com `avatar_iii`. A guarda dos 21 campos **não olha sub-objetos**, então um sub-campo inventado passa por ela E pelo fornecedor, e não faz nada.
- **`remove_background`** — passa o schema. **Sem ele o `background` é INERTE**, e foi isso que aconteceu: `{type:"color", value:"#1B2A4A"}` foi enviado, o fornecedor respondeu 200, e o vídeo veio com o fundo da FOTO. O avatar é talking photo e a foto tem fundo próprio. **Que ele CONSERTE é DEDUZIDO; que ele saia agora é MEDIDO.**
- **`fit`** — aceita **exatamente** `contain` ou `cover`; o próprio 400 diz *"Input should be 'contain' or 'cover'"*. **Nunca enviamos**, e `contain` é o que produz barra — são os **40% medidos no 4:5** e os **57,8% no 9:16**. Agora vai `cover`, que preenche **cortando**: a troca é real e é decisão de produto, não otimização.
- **`expressiveness` é "Avatar IV only" e o schema NÃO impõe isso** — medido: com `avatar_iii` ele **passa** a validação. O fornecedor aceita e ignora em silêncio, que é o pior caso, então a regra ficou do nosso lado.

**CENÁRIO POR IMAGEM — DIAGNÓSTICO FECHADO EM 06/08, SEM GASTAR (13 POSTs de fusível, cota 342 e carteira US$ 5,70 antes e depois). NÃO há o que ligar.** O sintoma medido numa geração real foi fundo pequeno e estático, halo entre pessoa e cenário, enquadramento cortando a mão.
- **`background` tem QUATRO campos e mais nenhum:** `type` ∈ {color, image}, `value` (hex, quando `color`), `url` e `asset_id` (mutuamente exclusivos, quando `image`). **Não existe escala, recorte, posição, opacidade nem qualidade** — nem na doc nem no schema.
- **E não dá para descobrir um sondando:** como o objeto não é fechado (ver acima), `background.scale` e companhia passam a validação. Inventar sub-campo produz payload aceito que não faz nada — pior que não mandar, porque parece resolvido.
- **Alternativa ao `remove_background`: não existe campo.** `matting`, `background_removal` e `segmentation` voltam **400 "Extra inputs are not permitted"**. O único caminho documentado é **`output_format: "webm"`** (passa o schema — chegou ao 404 do fusível), que devolve **fundo transparente** e joga a composição para o NOSSO lado. Isso não é ajuste de parâmetro: é passar a compor vídeo aqui, e a decisão é do operador.
- **O enquadramento que corta a mão é o `fit: "cover"`**, que é nossa escolha atual e por construção corta — foi ela que eliminou as barras. `contain` traz as barras de volta. O fornecedor só tem esses dois valores; não há meio-termo.

**`Idempotency-Key` DE PÉ.** O fornecedor replica a resposta por **24 h** na mesma chave (padrão `[A-Za-z0-9_\-:.]{1,255}`). A chave é derivada da **TENTATIVA** — tenant, look, roteiro, cena, formato, motor, `fit`. **Nem do instante** (nunca colide, é o mesmo que não ter chave) **nem do id da linha de `videos`** (cada clique INSERE uma linha nova, então dois cliques dão dois ids). **`audio_asset_id` fica de fora de propósito:** o áudio é ressintetizado a cada clique, e incluí-lo faria a chave variar exatamente no caso que ela cobre.

**A espera do traje na tela ia até 60 s e desistia calada.** As conclusões medidas foram 15 s e 50 s — a janela estava dimensionada pela maior amostra observada. Agora são **240 s** e, ao esgotar, a tela diz que o traje continua vindo, **já foi cobrado**, aparece sozinho no seletor e **não deve ser recriado** (cada um custa US$ 1,00). Não é erro: a reconciliação vive na listagem do servidor.

**Um SEGUNDO traje pago existe no fornecedor SEM linha no nosso banco:** "Navy Suit, Open Collar" (`aef28fd5…`). Ele aparece no seletor com o nome **do fornecedor**, não com um nosso — que é como se reconhece um look sem linha local. A aritmética fecha ao dígito: **723 − 540 = 183 = 60 + 60 + 33 + 30**. A atribuição dos 60 ao Terno é **DEDUZIDA**; o total é medido.

**RITMO DA VOZ — a constante 12,8151 c/s NÃO é constante, e erra mais quanto mais curto o texto.** Seis gerações reais, `tts_timestamps`:

| caracteres | segundos | c/s |
|---|---|---|
| 119 | 7,173 | **16,53** |
| 145 | 10,192 | 14,19 |
| 145 | 11,121 | 13,00 |
| 474 | 36,988 | 12,81 |
| 180 | 14,789 | 12,15 |
| 206 | 16,972 | 12,12 |

**Dois 145 deram durações diferentes (10,19 e 11,12 s, 9,1% de diferença)** — mesmo comprimento, mesma voz, mesmo modelo. Logo o ritmo não é função do comprimento. Para 119 caracteres a estimativa dá 9,29 s contra 7,17 s reais: **erro de +29,5%, sempre para cima**. **A HeyGen não sintetiza nada aqui** — a duração vem do `audio_asset_id`, então o encurtamento é do ElevenLabs. **CONFIRMADO por leitura:** o corpo da síntese é `{ text, model_id }` nos **dois** caminhos ([voiceProvider.ts:235](backend/src/services/providers/voiceProvider.ts:235) e [:291](backend/src/services/providers/voiceProvider.ts:291)), **sem `voice_settings`** — a voz herda o estado salvo no painel, que é global, editável fora do produto e não registrado em lugar nenhum. **Conserto (NÃO implementado nesta passada): enviar `voice_settings` explícito no corpo, com `speed` fixado, para tirar a duração das mãos do painel.**

**⚠️ O ARNÊS NÃO RODA ENQUANTO `CLAUDE - md.txt` EXISTIR SOLTO.** `npm run check:mutants` aborta antes do primeiro mutante: ele exige árvore limpa e conta o untracked. O arquivo é INTOCÁVEL por ordem do operador (não mover, não apagar, não commitar). **DESBLOQUEADO em 06/08: ele não está mais solto** — `git status --untracked-files=all` não acusa nada, e o arnês voltou a rodar. **175 mutantes declarados e 30 arquivos de guarda** (`--list` e `ls check*.ts`, MEDIDOS em 09/08; eram 159 e 29 em 06/08, e 145 antes do bloco CORREÇÕES-1). **A passada de 159/159 é de 06/08 e está superada.** A passada COMPLETA de **08/08 com o código novo deu 173/175**, com 1 INERTE e 1 ERRO — as duas corrigidas no commit `d07db86`, e **nenhuma delas era guarda podre**: o INERTE 169/175 (G4) exercitava `recoverInFlightVideos` com o banco substituído e **nunca lia `index.ts`**, então um mutante que apagava a chamada no boot passava verde; o ERRO 144/175 ("endpoints legados") foi dano colateral do `signal: vendorSignal()`, que quebrou a chamada em quatro linhas e fez o `find` casar 0×. **NÃO VERIFICADO: não houve passada de confirmação DEPOIS de `d07db86`** — que os 175 fechem hoje é esperado, não medido, e não existe relatório com a tabela guarda × mutante.

**⚠️ O ARNÊS RODAVA O GATE SEM `PROVIDER_MODE=fixture`, e em LIVE isso o fazia nascer vermelho — CORRIGIDO em 06/08.** Ele herdava o modo do container. `checkPollPolicy` e `checkVendorErrorPathPolicy` trocam `PROVIDER_MODE` por fixture, restauram o valor ORIGINAL no `finally` e depois exigem `isFixtureMode()`; em live a restauração devolve "live" e as duas reprovam — **com a árvore limpa e sem mutante nenhum** (medido: `docker compose exec -T backend npm run check` dá 2 violações, e com `-e PROVIDER_MODE=fixture` dá verde). O efeito era **assimétrico**, e é por isso que passou despercebido: mutante comum continuava `ok`, porque a mensagem esperada estava lá junto das duas extras; quem quebrava eram os **contrapontos `expectGreen`** — **9 deles caíram juntos**, em nove arquivos sem relação nenhuma. A leitura fácil seria "nove guardas apodreceram"; era uma condição só, e nenhuma delas. `runGate` passou a mandar o default documentado, exceto quando o mutante declara `PROVIDER_MODE`. Decidir o destino do arquivo é do operador; enquanto isso, o gate (`npm run check`) continua verde e as guardas novas foram provadas reprovando à mão, uma a uma.

**DEMO-1 — o que NÃO está feito, e é tudo de TELA:** o wizard continua em 6 passos (item 7), não há UI para fundo/interpretação/look (itens 1, 3, 4), o prompt→roteiro **não usa o RAG** (`/scripts/generate` chama o LLM sem contexto — item 5), não há botão de gerar novamente (item 8), e Publicação continua dentro do fluxo de criação. **Sem a tela, os cinco controles existem no backend e ninguém consegue usá-los.**

**DÍVIDA DE GUARDA — 4 mutantes DEVIDOS, nenhum escrito (congelamento de 05/08). Identificados por NOME, nunca por posição.** O gate ficou verde e as correções foram exercitadas à mão; o que falta é o arnês reprovar sozinho quando alguém as desfizer.
- `a estimativa volta a sair da duração pedida` — troca `estimateSecondsFromScript(video.script)` por `video.duration_seconds` em `routes/videos.ts`. É o defeito 4 renascendo, e ele passou semanas invisível: espera-se a mensagem de que a estimativa deixou de vir do roteiro.
- `o ritmo vira número digitado em vez de derivado da medição` — troca `CHARS_PER_SECOND` pela constante redonda 12,8. **Esperto:** o arquivo continua tendo ritmo, a tela continua mostrando duração, e só a fronteira muda — 474 caracteres passam a dar 111 unidades onde o fornecedor debitou 108.
- `o teto de confirmação some do veredito do servidor` — fixa `requiresConfirmation: false` na rota de estimativa. O checkbox some da tela e um roteiro de 900 caracteres (US$ 3,50) gera com um clique.
- `o player volta a mostrar a duração pedida` — faz `durationLabel` devolver `video.duration_seconds`. É o defeito 5, e é o mais fácil de reintroduzir sem perceber, porque o campo continua na linha e continua sendo um número plausível.

**Item 2 da rodada — QUEM CONSOME `requestedUnitCount`: ninguém que decida nada. É RÓTULO.** Rastreado em 05/08: escrito em 6 lugares (`routes/videos.ts` e `usageTracking.ts:123` → coluna `requested_unit_count`), e do lado da leitura **`videos.ts` o SELECIONA e nunca o usa** — `linha.requested_unit_count` não aparece em nenhuma linha do handler. `adminPanel.ts` e `dashboard-summary` agregam `unit_count`, não o pedido; o frontend não o menciona. **Não reserva, não freia, não audita:** `debitCredit` cobra 1 crédito por vídeo (`amount ?? 1`), independente da duração, e o teto live conta gerações. A preocupação de "45 un reservadas para um vídeo de 108" **não se materializa** — não há reserva por unidade em lugar nenhum.

**⚠️ ESTADO ATUAL: ARMADO, NÃO DESARMADO — MEDIDO em 09/08/2026 02:01Z.** O texto abaixo descreve como CONFERIR o desarme; ele não descreve o estado de hoje. Hoje o processo está em **`PROVIDER_MODE=live`**, com **`PROVIDER_LIVE_CONFIRM` preenchida (len=28)** e **`PROVIDER_LIVE_MAX_GENERATIONS=10`** — e `docker compose config` **concorda** com o processo nos três (não há divergência arquivo×processo desta vez). `DAILY_PAID_GENERATION_LIMIT=10`, com **0 usadas hoje** (query de `dailyGenerationLimit.ts`, 09/08). `StartedAt=2026-08-09T01:02:24Z`, **`RestartCount=0`**, `Health=healthy`. A **linha de boot não foi encontrada** em `--tail 500`: a janela do log cobria ~26 min e o boot fora ~1 h antes — ausência que o gotcha 1 proíbe interpretar, e que o `printenv` supre por ser evidência mais forte. **Um clique em Gerar cobra dinheiro real.** Qualquer sessão que precise de `fixture` tem de desarmar com `up -d` e conferir de novo — `restart` não recarrega o `.env`.

**1 · DESARME — confirme antes de tudo. Modo `live` gasta dinheiro real.** Exigido `fixture` + `len=0`, nos 5 critérios: `printenv` (o processo) · `docker compose config` (o arquivo — pode divergir, e um `up -d` transforma um no outro) · `StartedAt` · `RestartCount` · linha de boot `"billable":false`.

```bash
docker compose exec -T backend sh -c 'printf "%s len=%s\n" "$PROVIDER_MODE" "${#PROVIDER_LIVE_CONFIRM}"'
```

**Como ler os dois últimos critérios — corrigido em 04/08, os dois davam falso alarme.**
- **`RestartCount` não se compara com 0.** A linha de base é o valor **logo após o boot**, e ele pode ser >0 legitimamente: ligar a máquina sobe os 4 serviços juntos e o backend reinicia enquanto espera o Postgres. O sintoma é **incremento SEM boot** — anote o número no começo da sessão e compare com ele, não com zero. O `RestartCount=3` de 09:28 tinha **causa confirmada pelo operador** (ligou o Docker/o PC); a confirmação é do operador, não do log — o log daquele instante segue inalcançável, então a causa é **DEDUZIDA**, não medida.
- **A linha de boot sai do alcance do log.** Ela é emitida uma vez, no start (`assertLiveModeAuthorized`), e o log é dominado por healthcheck a cada 10 s: em `--tail 500` cabem ~36 minutos, então num backend de pé há horas ela **não está lá** — e o gotcha 1 proíbe concluir ausência. Nesse caso o `printenv` é evidência **mais forte**, não substituto pior: em `live` o processo **não sobe** sem `PROVIDER_LIVE_CONFIRM`, então um processo vivo dizendo `fixture` já prova o que a linha diria.

**2 · OS 3 GOTCHAS QUE CUSTARAM CONCLUSÕES ERRADAS**
1. **`docker compose logs` mente sobre o fim do log — use `--tail 500`.** Sem isso (ou com `--tail`>~1000, ou `--since`) devolve arquivo rotacionado e congelado, internamente coerente. Já fez uma requisição bem-sucedida parecer inexistente. **Nunca conclua ausência de evidência com ele.**
2. **Código novo não entra sozinho:** backend roda sem watch (`restart backend`), Vite serve bundle velho (`restart frontend`), e `vite.config.ts`/`package.json`/`Dockerfile`/entrypoint estão fora do bind mount (`build`).
3. **`restart` não recarrega `.env`** (só `up -d`); **`ps` esconde parado** (use `-a`). `running` não é saúde — `/api/health` é.
4. **Ligar ou desligar a MÁQUINA reinicia o backend** — e um reinício com geração live em andamento perde o vídeo. O polling vive em `setInterval` na memória do processo (`routes/videos.ts:37`), **fora do `withLiveBudget`**, e nada o retoma no boot: `pollJob` só é chamado pela rota de criação. Morto o processo, o vídeo fica em `queued`/`processing` **para sempre, sem estorno** — o débito já aconteceu e o estorno só vale antes do aceite. Não é só "não reinicie o container": é não desligar o PC.

**3 · DINHEIRO — não reabrir**
- Vídeo: **3 unidades por segundo INTEIRO TRUNCADO**, 60 un/dólar ⇒ **US$ 0,05/s**. 4 medições exatas. A régua é a duração do **fornecedor**, não o nosso `ffprobe`.
- Voz: **por CARACTERE**, US$ 0,018 por roteiro de 180 — **2,5%** do custo. Encurtar roteiro para economizar é esforço mal empregado. *(A TARIFA está fechada; qual MODELO a produziu, não — ver item 4.)*
- **Avatar novo custa US$ 1,00**, ~6× um vídeo de 15 s — é o botão "Novo avatar" do passo 1. **Na demo, clicar só no card.**
- Débito vem **antes** da chamada e estorna **só antes do aceite**. **Nunca reinicie com geração em andamento** — o polling roda fora do orçamento e o vídeo trava em `queued` para sempre.

**4 · ABERTO, COM DONO**

| O quê | Dono |
|---|---|
| Chaves de plataforma (Anthropic, Google, embedding) pelo painel | **usuário** |
| Rotacionar chave Google de dev e senhas de demo — passaram por chat | **usuário** |
| `user_read` no ElevenLabs; saldo HeyGen (US$ 13,85 ⇒ ~19 vídeos de 15 s) | **usuário** |
| Backup de `uploads/_prova/` — `uploads/*` é ignorado pelo git | **usuário** |
| Autostart do Docker Desktop | **usuário** |
| ~~Qual modelo o ElevenLabs faturou de fato~~ — **ENCERRADO como NÃO VERIFICADO em 04/08, não reabrir.** Mandamos `eleven_multilingual_v2` e o `model_id` **já era enviado em 03/08** (`ed207db`), então não há o que instrumentar: o painel cobrou 0,5 crédito/caractere (tarifa de Flash/Turbo), a resposta gravada não traz o modelo e os cabeçalhos passam por allowlist. Responder isto exige o fornecedor, não o nosso log | **ninguém — fechado** |
| Bloco 2B (documentação nova) · RAG bloqueado por chave de embedding | próxima sessão |

**5 · O RESTO ESTÁ EM `docs-internal/`** (na RAIZ — saiu de `docs/` em 04/08, porque `docs/` é a árvore que alimenta o copiloto e isto aqui é memória de engenharia). Nada foi apagado; cada arquivo diz de que linhas do original veio.
[00 referência](docs-internal/00-referencia-do-projeto.md) · [01 handoff e decisões](docs-internal/01-handoff-e-decisoes.md) · [02 ambiente e demo](docs-internal/02-ambiente-e-demo.md) · [03 blocos fechados](docs-internal/03-blocos-fechados.md) · [04 demos e estorno](docs-internal/04-demos-e-estorno.md) · [05 formatos e derivação](docs-internal/05-formatos-e-derivacao.md) · [06 TELA-1 e passadas live](docs-internal/06-tela1-e-passadas-live.md) · [07 voz e passo 1](docs-internal/07-voz-e-passo-1.md) · [08 ocorrências recorrentes](docs-internal/08-ocorrencias.md)

**As invocações e os gotchas do arnês MUDARAM DE CASA em 12/08: vivem em [ESTADO.md](ESTADO.md) §3 e §4.** Eles são operacionais — mudam quando o arnês muda — e duplicá-los aqui garantia que uma das cópias envelhecesse em silêncio. O que fica NESTE arquivo é o histórico do que foi medido e do que custou dinheiro.

**REGRA DO FILTRO — o filtro serve para iterar DENTRO de uma rodada, NUNCA para fechá-la.** `--guard`/`--name` existem para que a validação das guardas tocadas custe ~5 min em vez de 79. Fechar rodada com passada filtrada é declarar verde o que não foi exercitado: **toda rodada termina com a passada COMPLETA em background**, sem filtro, e o ponteiro do log vai para o ESTADO.md §5. **`mutante se identifica por NOME, nunca por posição.`**

---

## 5.1 · ESTADO DE 11/08/2026 — ESTA É A SEÇÃO MAIS NOVA. Leia antes do bloco 6, que é de 05/08 e está superado no que conflitar.

**HEAD `828142a` (Gap 1b), árvore limpa fora do próprio CLAUDE.md. Arnês: 211/211, zero INERTE/ERRO/AMBÍGUO — passada completa DEPOIS do commit, com a linha final lida do log.** O `--list` dá **211 mutantes** (eram 210 antes desta rodada).

**Gap 1b — fechado.** `onClick={() => onExpressivenessChange(nivel)}` ([SceneStep.tsx:238](frontend/src/pages/CreateVideo/steps/SceneStep.tsx:238)): sem ramo, não há onde o `null` caiba. **VERIFICADO NA TELA** (não só no arnês): o chip nasce `chip selected` em "Média" e reclicar mantém. A guarda ganhou duas pernas em `checkExpressivenessDefaultPolicy.ts` — o laço dos chips não produz `null`, e os níveis que a TELA oferece chegam ao corpo por `buildHeygenVideoPayload`.
**A âncora do recorte nasceu ERRADA e foi corrigida antes do commit** — vale como lição geral: com `</Field>` como fim, trocar o wrapper fazia o recorte **vazar** para o bloco seguinte e a guarda acusava o chip de um `null` que era do seletor de traje. Âncora de guarda de tela tem de ser **intrínseca ao que se mede** (aqui: `EXPRESSIVENESS.map(` … `))}`), nunca o wrapper de layout. Há rede explícita anti-vazamento: se o recorte engolir `onBackgroundChange`/`onAvatarLookChange`/`PublishStep`/`onMotionPromptChange`, é reprovação nomeada.

**~~O ARNÊS FICOU 5× MAIS LENTO~~ — CORRIGIDO em 12/08 por MEDIÇÃO DIRETA. Os ~65 s por mutante NUNCA foram medidos: eram uma DIVISÃO** (3 h 50 ÷ 211) de uma passada cujo tempo de parede incluía tudo o que mais rodava na máquina. **O número medido é 20,84 s por mutante**, e ele fecha por dois caminhos independentes: a decomposição (gate 20,77 s + `git status` 0,069 s + 0,0009 s de disco) e o relógio de uma passada real (**37 mutantes em 13,3 min = 21,6 s/mutante**, 12/08). **227 mutantes = 79 min**, não 3 h 50.
**Dentro do gate, MEDIDO isolado:** `tsc --noEmit` **8,06 s** + `checkPolicy` **14,94 s**; `docker compose exec` sem trabalho nenhum custa **0,53 s** e o container já está de pé, então **não há startup a frio a otimizar**. `collectMutants` custa 3,05 s, uma vez por passada.
**Nada disso é eliminável sem enfraquecer guardrail:** o `tsc` é o que impede um mutante que não compila de passar por reprovação de guarda, e o `git status` é 0,3% do ciclo. **O que se elimina é o NÚMERO DE MUTANTES por rodada — é para isso que existe o filtro.**
**SEGUE NÃO VERIFICADO por que a passada de 11/08 levou 3 h 50.** A divisão está descartada como método, mas o tempo de parede foi real; nenhuma medição daquele dia sobreviveu para explicá-lo. Não reabrir sem um cronômetro.

**⚠️ NÃO GRAVE LOG DE PASSADA EM `/tmp`.** Em 11/08 o log de uma passada em andamento **foi apagado por fora** com o processo ainda escrevendo nele (`/tmp` = `%TEMP%` do Windows); o watcher ficou cego e teria reportado morte sem linha final — falso negativo. A passada teve de ser morta e refeita do zero. Grave no diretório de scratchpad da sessão **e** deixe a saída ir para o arquivo de task do harness (duas cópias), e faça o watcher tratar "as duas sumiram" como desfecho próprio.

**INVENTÁRIO DO FORNECEDOR — MEDIDO por GET em 11/08, e ele contradiz o banco local.**
- **O digital twin `407315ec6a7940e6a59bcf54cd20cb69` EXISTE** — `avatar_type: "digital_twin"`, **1280×720**, `status completed`, `supported_api_engines: ["avatar_v","avatar_iv","avatar_iii"]`, `default_voice_id` próprio. **Não tem linha no banco local**, e é só por isso que ele não aparece no produto.
- **O grupo "Manfred Haut" `b22dda85f5f44b6995622aff9b12f4ec` EXISTE**, `consent accepted`, **14 itens = 13 looks `completed` + o twin base**. Cinco são de neon: `f1e6e221` (leather jacket in neon hallway), `5e28387c` (person in neon futuristic hallway), `4aed7953` e `6c871c1f` (Manfred Haut in neon hallway), `10f97a3d` (leather jacket man in neon). Os demais: 4× leather jacket, 2× brown blazer, 1× brown suit, 1× "Photo Avatar".
- **Conta: 20 grupos, 523 looks — 504 premade do fornecedor e 19 próprios.** Destes 19, o banco conhece **1** (`800e04f0…`, que o fornecedor chama "White Lab Coat, Blue Shirt"). **18 órfãos.** A linha local `1fa904f6…` ("TRAJE CASUAL", `failed`) **não existe no fornecedor** — o inverso.
- **O avatar `6f60dca9…` é `photo_avatar` 640×480**, grupo `e1071cee…` com **1 item — ele mesmo**. Não tem traje escolhível, e a tela diz a verdade quando afirma isso.

**RECONCILIAR OS 18 ÓRFÃOS É UMA LINHA, NÃO CATORZE — PROVADO POR EXECUÇÃO.** `listarLooks` já mescla a lista **do fornecedor** com as linhas locais; `listAvatarLooks("407315ec…")` devolveu **14 looks** e `canChoose` seria **true**, sem nenhuma linha em `avatar_looks`. Basta **um INSERT em `avatars`** com `provider_avatar_id = '407315ec…'`, `provider_engines = ARRAY['avatar_v','avatar_iv','avatar_iii']`. Os 13 aparecem no seletor com o **nome do fornecedor**. **Não é migration** — é dado, e migration de dado amarra o inventário de uma conta ao schema. **A voz foi DECIDIDA pelo operador: reusar `0hQuq0q2JEk1SY4lZaM9`** — o twin e o "TESTE REAL" são a MESMA pessoa. Com `voice_id NULL` a geração falha **fechada e de graça** em [avatarProvider.ts:237](backend/src/services/providers/avatarProvider.ts:237).

**⚠️ GAP CENTRAL, MEDIDO POR LEITURA DO CAMINHO INTEIRO — NADA INTERROMPE ENTRE O ÁUDIO E O VÍDEO.** Em `generateVideoHeygen`: linha **672** `requireAudio` devolve a duração REAL; **673** sobe o áudio; **698** monta o payload; **~722** dispara o `POST /v3/videos` que custa dólares. **Não há um único `if` sobre `audio.durationSeconds` no meio.** O número exato está numa variável, na mão, e ninguém o consulta. Agravantes: o débito de crédito acontece **antes** de `generateVideo`, e a duração só é persistida no `UPDATE` de [videos.ts:1205](backend/src/routes/videos.ts:1205), **depois** do POST. Os controles que existem (`CONFIRM_ABOVE_SECONDS = 60`, teto de 180 s) julgam a **estimativa do texto**, que erra +29,5% em textos curtos — ou seja, **o número exato e o portão estão em lados opostos da chamada paga**. Não há guarda cobrindo isso. **Ligar exige partir `generateVideo` em duas etapas** (sintetizar → decidir → animar); a rota hoje não tem onde intervir porque síntese, upload e POST são atômicos. **É custo zero e é a peça que sustenta preço de pacote.**

**A DURAÇÃO REAL JÁ É MEDIDA E JÁ É PERSISTIDA** — [voiceProvider.ts:410](backend/src/services/providers/voiceProvider.ts:410) pelos timestamps do ElevenLabs, com fallback por bitrate em :470, gravada em `videos.audio_duration_seconds`. **O produto JÁ é áudio-driven:** sintetiza → trata com ffmpeg (`loudnorm=I=${targetLufs}`, [audioProcessing.ts:67](backend/src/services/audioProcessing.ts:67)) → `heygenUploadAsset(..., "audio/mpeg")` → `audio_asset_id` no corpo. Não se manda texto para animar; manda-se arquivo. **Trocar a fonte do áudio mexe em 2 arquivos**, e o tratamento ffmpeg recebe buffer e devolve buffer — **sobrevive à troca inteiro**.

**QUÃO PRESO À HEYGEN — menos do que parece.** 37 arquivos de produto citam "heygen" (64 com guardas), mas só **5 têm o nome em posição de decisão ou URL**: `avatarProvider.ts`, `videoFormat.ts`, `platformKeyProbe.ts`, `platformCredentials.ts`, `routes/videos.ts`. `VENDORS_BY_PROVIDER` já declara `avatar: ["heygen","did"]`, e `generateVideo` ([avatarProvider.ts:1007](backend/src/services/providers/avatarProvider.ts:1007)) já é ponto de despacho por vendor. **O schema já suporta multi-provedor:** `videos` tem `provider_vendor`, `provider_job_id`, `provider_engine`, `provider_engine_reason`, `provider_output_url`; `provider_usage` é por camada (`provider`, `vendor`, `unit_type`, `unit_count`). **Faltam só `provider_model` e `avatar_type`.**

**A RÉGUA ÚNICA ERRA ATÉ 10×, NÃO 33%.** Preços de lista auditados pelo operador em 11/08, por segundo gerado: HeyGen Avatar III **0,0167** · Hedra Character-3 **0,033** · HeyGen Avatar IV **0,050** · Kling AI Avatar v2 Std **0,056** · InfiniteTalk/WaveSpeed **0,060** (o MESMO modelo na fal: **0,20**) · OmniHuman 1.5 **0,14–0,16** · imagem-base 0,03–0,24 por imagem (reutilizável) · Cinematic/Seedance **US$ 7,00 fixo** (4–15 s). Contra isso, `HEYGEN_VIDEO_COST` ([providerCost.ts:81](backend/src/services/billing/providerCost.ts:81)) é `unitsPerBilledSecond: 3` para tudo. **As três medições que a sustentam são TODAS de photo avatar 720p na HeyGen** — qualquer outra linha entra como DECLARADA, e o arquivo precisa passar a marcar MEDIDO vs DECLARADO **por linha**, senão a tela afirma com a mesma voz um número medido e um copiado. Desenho pedido: chave `(provider, model, resolution)` + `billing: per_second | per_video` (Cinematic precisa de `minSeconds`/`maxSeconds`), custo por CAMADA (TTS + imagem amortizada + animação) e, com áudio de duração conhecida, `custo = billedSecondsFor(audioDurationSeconds) × tarifa` — **exato, não estimado**. Call sites a mudar: 6 de produto + `checkCostPolicy`.

**ARQUITETURA ALVO (decisão do operador, 11/08): quatro camadas separadas** — 1. VOZ (clone + texto → arquivo com duração EXATA) · 2. APARÊNCIA (rosto + traje + cenário → imagem-base, uma vez por look) · 3. DIREÇÃO (prompt de comportamento, não de conteúdo) · 4. ANIMAÇÃO (imagem + áudio + prompt → vídeo). A voz é **ENTRADA**, então é preservada por construção e a duração do vídeo É a do áudio — daí o custo exato antes de gerar.

**⚠️ OS VÍDEOS QUE O OPERADOR APROVOU FORAM FEITOS NA fal.ai (`v3b.fal.media`), NÃO NA HEYGEN — e NÃO HÁ REGISTRO NENHUM DISSO NO REPOSITÓRIO.** Quatro varreduras deram zero: código/docs/migrations, `docker compose logs --tail 500`, `uploads/` e `docs-internal/`, e o histórico do git. **Qual modelo e qual prompt produziram aqueles vídeos é informação que só o operador tem** — recuperá-la do histórico da fal.ai antes do piloto economiza metade do orçamento. Zero menção também a Kling, OmniHuman, Hedra, InfiniteTalk, Seedream/Seedance e Nano Banana; nenhuma chave desses provedores no ambiente.

**HEYGEN VIDEO AGENT — contrato lido, teste CANCELADO pelo operador.** `POST /v3/video-agents`: só `prompt` é obrigatório (1–10.000 chars); opcionais `mode` (`generate`|`chat`), `avatar_id`, `voice_id`, `style_id`, `brand_kit_id`, `orientation` (`landscape`|`portrait`), `files` (máx 20), `callback_*`, `incognito_mode`. **Não existe `script`, nem `duration`, nem `aspect_ratio`** — duração é sugestão em texto, logo **não há teto de custo por contrato**. US$ 0,0333/s. Se cobra os componentes internos à parte: **NÃO VERIFICADO** — a doc de pricing é silenciosa. Motivo do cancelamento: sem parâmetro de duração, custo real não verificado, e rodaria **fora do produto** (sem contador diário, sem idempotência, sem estorno).

**SALDO HEYGEN em 11/08 15:02Z: US$ 4,00 · 240 unidades · diário 0/10.** Muito menor que os US$ 12,05 do bloco 6. **A conta ElevenLabs está em 10/10 slots de voz**, com **cinco duplicatas** chamadas "TESTE REAL 15:40 01/08" ocupando espaço — a próxima clonagem é recusada pela nossa régua.

**A ESTIMATIVA DA TELA divide por `VOICE_SPEED`**, e isso é coerente: 155 caracteres → 155 ÷ 12,8151 = 12,095 s a 1.0 → ÷ 0,85 = **14,23 s** → 14 s cobrados → 42 un → **US$ 0,70**. A `CONFIRM_MARGIN` de 1,1 existe mas, por decisão registrada, **não entra no custo mostrado**.

**PENDÊNCIAS CONHECIDAS E NÃO ABORDADAS:** guarda de voz inexistente (`voiceId: avatar.voice_id`, [videos.ts:1179](backend/src/routes/videos.ts:1179) — trocar por id fixo passa o gate inteiro); CENÁRIO PADRÃO da estação 1 é **ÓRFÃO e morre no frontend** (`corpoDaGeracao` não monta `scenario`; e `grep scenario|outfit` nos providers dá 0), com a ironia de que a única guarda que o cita exige que a tela diga "Imagem salva" sobre um arquivo que nunca chega ao fornecedor; assimetria do tratamento de imagem (o upload por ARQUIVO não passa pelo canvas, então os sliders não valem nada nesse caminho — [AvatarSetupStep.tsx:241](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:241)); LUFS e qualidade de imagem sem guarda nenhuma; lentidão do gate.

## 6 · Bloco de retomada — cole numa sessão nova

> ⚠️ **ESTE BLOCO É DE 05/08 E ESTÁ SUPERADO ONDE CONFLITAR COM A SEÇÃO 5.1 (11/08).** Hoje: HEAD **`828142a`**, arnês **211/211**, backend **ARMADO** (`live`, len=28), saldo **US$ 4,00 / 240 un**. O texto abaixo diz `8f6572b`, `fixture` e US$ 12,05 — nada disso vale mais. O que continua valendo aqui são os gotchas, a régua de dinheiro e o procedimento de desarme.
>
> **eckko.ai, diretório `TWINAI`. HEAD `8f6572b` + o commit da rodada de correções (05/08), árvore limpa, `fixture` com `PROVIDER_LIVE_CONFIRM` vazia — DESARMADO e conferido nos 5 critérios às 08:02 e de novo depois de dois `restart`.** Confirme os 5 critérios do desarme antes de tocar em nada: `printenv` e `docker compose config` podem divergir, e um `up -d` arma o modo pago sem nova pergunta. **`RestartCount` compara-se com o valor pós-boot, não com 0**, e a linha de boot pode estar fora da janela de `--tail 500` — nesse caso o `printenv` é a evidência mais forte, porque em `live` o processo nem sobe sem a confirmação.
>
> ## ✅ O CAMINHO INTEIRO ESTÁ PROVADO EM PRODUÇÃO (05/08). O que falta é conserto, não descoberta.
>
> Clonagem real, síntese e **um vídeo pago** saíram pelo produto, no avatar `7557957c` ("TESTE REAL 15:40 01/08"). **O Mário não foi tocado e `wAd9MJ2IK71FGs1FWjIX` está intacta.** Não há mais NÃO VERIFICADO bloqueando a demo — o ElevenLabs aceita nosso WAV, a GUARDA B liberou com a contagem corrigida, e a régua de custo fechou ao centavo pela 5ª vez.
>
> **Saldo hoje: 723 un / US$ 12,05** (~6 vídeos de 37 s, ou ~19 de 15 s). Gasto da passada: **US$ 1,80** de vídeo + **US$ 0,056** de voz + **1 slot irreversível** (4 → 5; substituir a voz não apaga a antiga, e liberar exige o painel).
>
> **Restam 2 dos 5 defeitos, e são justamente os visíveis a olho nu.** Os defeitos 3 (duração que não limita), 4 (estimativa 0,42×) e 5 (rótulo com a duração pedida) foram corrigidos em 05/08 e conferidos na tela em `fixture`. Sobram: o passo 3 do assistente não fazer absolutamente nada — os arquivos de cenário e traje sobem, são salvos e nunca chegam ao fornecedor, e **não há campo no contrato para mandá-los**, então a saída é remover o passo, não ligá-lo — e os **40% de barra no 4:5**, cuja correção completa toca 5 arquivos e só se prova pagando. Para a demo, a recomendação registrada é retirar o 4:5 e apresentar em 16:9.
>
> **Nada foi gasto na rodada de correções: zero rede a fornecedor, zero geração, saldo intacto.**
>
> **Rearmar (o `.env` não é editado; as variáveis vão na invocação):**
> ```
> PROVIDER_MODE=live PROVIDER_LIVE_CONFIRM=eu-autorizo-gastar-cota-real PROVIDER_LIVE_MAX_GENERATIONS=2 docker compose up -d backend
> ```
> **2 é obrigatório:** `consumeLiveGeneration()` roda em `cloneVoice()` **e** em `generateVideo()` — com o default de 1 a clonagem come a única unidade e o vídeo é recusado por nós mesmos (bloco DEMO-4). **Observado e NÃO VERIFICADO:** `maxgen=2` sobrevive ao desarme; `docker compose config` também o resolve como 2, então vem do `.env` — dedução, porque o `grep` no `.env` foi negado duas vezes pela camada de permissão.
>
> **O upload é do OPERADOR, não do assistente:** `POST /avatars/:id/voice-sample` exige sessão autenticada e o assistente não faz login com a senha dele. A tela tem `<input type="file">` ([VoiceSampleRecorder.tsx:306](frontend/src/pages/CreateVideo/VoiceSampleRecorder.tsx:306)) — foi assim que esta clonagem entrou. **Confirme a substituição já na primeira vez**, senão a primeira tentativa morre em `voice_exists` (aconteceu nas duas passadas).
>
> **Três coisas que o roteiro do tiro pedia e o código NÃO faz — decididas, não reabrir:** (1) a rota clona com `name: avatar.name`, então não existe nomear a voz sem renomear um avatar — foi por isso que a voz nova nasceu chamada "TESTE REAL 15:40 01/08", igual à antiga; (2) a rota clona e grava o `voice_id` no MESMO request, então não cabe portão de aprovação entre clonar e prender; (3) os créditos do ElevenLabs **não são legíveis** (401 por falta de `user_read`), então o custo da voz só tem o lado de dentro — a régua é nossa, sem confirmação do fornecedor.
>
> **Gotchas:** (1) `docker compose logs` sem `--tail 500` devolve log rotacionado e congelado — nunca conclua ausência de evidência com ele; (2) código novo exige `restart backend`/`restart frontend`, e `vite.config.ts`/`package.json`/`Dockerfile` exigem `build`; (3) `restart` não recarrega `.env`; (4) **ligar/desligar o PC reinicia o backend**, e o polling em `setInterval` não é retomado no boot.
>
> **Dinheiro:** vídeo US$ 0,05 por segundo inteiro truncado; voz por caractere (2,5% do total); avatar novo US$ 1,00. Nunca reinicie **nem desligue a máquina** com geração em andamento — o vídeo trava em `queued` para sempre, sem estorno.
>
> **Aberto (dono: usuário):** chaves de plataforma pelo painel, rotação da chave Google e das senhas de demo, `user_read` no ElevenLabs, saldo HeyGen, backup de `uploads/_prova/`, autostart do Docker.
>
> **O NÃO VERIFICADO que bloqueia um tiro real da voz: se o ElevenLabs aceita a amostra que sai daqui.** O formato é **WAV PCM 16 bit mono a 24 kHz** — sem perda desde o HIGIENE-1, taxa fixada no FECHAMENTO-1. A conversão está provada sobre a captura real de 2:33 (webm/opus 48 kHz → wav pcm_s16le 24 kHz, 7.338.318 B, md5 `e579a890…`, 318 ms); o **aceite do fornecedor, não** — nenhuma clonagem real passou por nenhum dos três formatos já usados. Trocar de formato **não reduziu** esse risco, só o mudou de lugar. Fechá-lo consome um slot **irreversível**: este produto não exclui vozes, e liberar slot exige o painel do fornecedor.
>
> **Resolvido no FECHAMENTO-1 (era o efeito colateral do HIGIENE-1):** a 48 kHz o WAV ocupava ~5,5 MB/min, os 10 MiB cabiam ~109 s, e a captura de 2:33 do E2E-1 **deixara de passar** — enquanto `checkSampleDuration` aceitava 120 s "limpa", divergindo entre 109 e 120 s. A 24 kHz são ~2,8 MB/min, o teto é **218 s**, aquela captura passa de novo, e as duas réguas saem da mesma função — a faixa divergente não pode reabrir sem mudar a fórmula.
>
> Detalhe em `docs-internal/`. Gate: `docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check`.
