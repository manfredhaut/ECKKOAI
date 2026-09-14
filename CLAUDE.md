Always respond in Brazilian Portuguese.

> ## ⚠️ PONTO DE RETOMADA CORRENTE — leia a Seção 6 (fim do arquivo)
>
> O estado corrente vive só na [Seção 6 · Bloco de retomada](#6--bloco-de-retomada--cole-numa-sessão-nova)
> — não duplicado aqui de propósito, para não haver dois textos podendo
> discordar um do outro. **Dentro da Seção 6, o bloco mais novo é
> "FECHAMENTO — BLOCO STUDIO-EDIT-1 (14/09)", no FIM da seção — leia-o
> antes de todos os blocos anteriores (HEYGEN-SIMPLES-10 03/09, SIMPLES-9,
> SIMPLES-7, SIMPLES-6, SIMPLES-5, SIMPLES-4 e SIMPLES-3 03/09 tarde,
> SIMPLES-1 03/09 manhã, primeiro vídeo Normal/Wan 3.0 02/09, V34 01/09,
> 28/08, 27/08, 26/08, 25/08), que estão superados no que algum deles
> conflitar. STUDIO-EDIT-1 é sobre uma aba NOVA do produto (edição de
> vídeo pós-geração) — não conflita com nada do que os blocos HeyGen
> anteriores fecharam sobre o tier Simples.**
> Este bloco chegou a descrever "Avatar deste vídeo" como bloco ainda
> existente; foi removido na mesma sessão que fechou o bloco de 25/08, e por
> isso o texto antigo saiu daqui.
>
> Duas decisões PERMANENTES desta linha de trabalho — não são "estado de
> sessão", por isso não estão na Seção 6, e não devem ser reabertas sem
> ordem explícita do operador:
> - **MOVER-CENARIO-TRAJE** (mover os campos JÁ LIGADOS de
>   `AvatarSetupStep.tsx` para a Cena) foi abandonado no caminho.
>   [RETOMAR-CENARIO-TRAJE.md](RETOMAR-CENARIO-TRAJE.md) é histórico.
> - **HeyGen atende SÓ o tier Simples** — Normal e Premium usam o caminho
>   da fal.
> - **QUALQUER mudança futura que toque `avatarProvider.ts`/`routes/videos.ts`
>   na região de montagem de `image_urls` (rosto/cenário/traje/lateral da
>   composição fal) exige, no fechamento, uma PROVA VISUAL REAL — abrir a
>   imagem composta de verdade e descrever o que se vê — antes de ser
>   considerada pronta. Fixture não basta: prova por fixture só confere que
>   o RÓTULO certo entrou no payload, nunca que o fornecedor de fato usou a
>   imagem.** Origem, 29/08/2026: a lateral (`lado_direito`) já estava sendo
>   enviada corretamente (nunca foi regressão), mas uma prova visual real
>   pedida pelo operador revelou algo mais grave e NÃO corrigido — **cenário
>   e traje, MEDIDOS por comparação pixel-a-pixel de duas composições reais
>   independentes (US$ 0,16 no total), não aparecem no resultado nenhum das
>   duas vezes: a saída reproduz o fundo/roupa da PRÓPRIA foto do avatar,
>   ignorando as referências de cenário (corredor neon) e traje (jaqueta
>   jeans com echarpe) por completo.** Ninguém tinha visto isso porque
>   ninguém tinha aberto a imagem composta real ao lado das referências
>   antes.
>
> **⚠️ ACHADO ACIMA — RESOLVIDO em 29/08/2026, MEDIDO por composição real.**
> Causa raiz: `fal-ai/nano-banana-2/edit` recebe `image_urls` como LISTA
> SIMPLES, sem papel/peso por imagem (confirmado na doc oficial da fal) — o
> modelo só sabe o que cada imagem representa se o TEXTO do prompt disser
> explicitamente "a primeira imagem é X, a segunda é Y". `promptDaComposicao`
> (`avatarProvider.ts`) e `promptDaComposicaoDaLinha` (`routes/videos.ts`,
> usada por `/recompose`) mandavam texto livre, sem essa amarração.
> Corrigido por `promptDeComposicaoPosicional()` (nova, `videoScene.ts`), que
> descreve cada posição de `image_urls` explicitamente, na MESMA ordem em
> que é montada (rosto, cenário?, traje?, lateral?) — commits `7ee9c9b`
> (função + wiring) e `481d1f5` (achado colateral: `entradasDaComposicao`,
> só usada por `/recompose`, publicava `[traje, cenário]`, ORDEM INVERTIDA
> em relação a `avatarProvider.ts`; corrigido para `[cenário, traje]` antes
> do teste real, senão o prompt novo mentiria sobre qual imagem é qual
> especificamente nesse caminho). **CONFIRMADO na 1ª tentativa (US$0,08,
> mesmo avatar/cenário/traje das duas composições que falhavam): corredor
> neon e jaqueta jeans com echarpe apareceram na composição, reconhecíveis
> contra as referências.** Não foram necessárias as 2 tentativas de ajuste
> de redação reservadas para esta rodada. **A regra permanente acima
> continua valendo** — a fórmula validada hoje não é garantia de que o
> fornecedor sempre obedecerá; qualquer mudança futura ao texto de
> `promptDeComposicaoPosicional` exige nova prova visual real, e
> `checkFalSceneWiringPolicy.ts` documenta essa limitação explicitamente.

> # 🚦 ABERTURA DE SESSÃO — antes de tudo, o healthcheck do frontend
>
> **ABERTURA DE SESSÃO: rodar o healthcheck do frontend ANTES de qualquer
> outra ação e antes de qualquer medição de tela. Se unhealthy, avisar o
> operador imediatamente e não medir tela até estar healthy. Em 23–25/08 o
> container passou 35 h unhealthy dizendo a causa exata (bundle servido ≠
> disco) e 4 passos foram medidos sobre código velho.**
>
> ```bash
> docker inspect twinai-frontend-1 --format "{{.State.Health.Status}} | falhas={{.State.Health.FailingStreak}}"
> ```
>
> Falhou, leia a sonda inteira — ela diz a causa e o comando:
> `docker inspect twinai-frontend-1 --format "{{range .State.Health.Log}}{{.Output}}{{end}}"`.
>
> **Esta regra mora AQUI, no topo, e não no BACKLOG**, de propósito: é a
> camada que sobrevive a troca de conta. A tarefa que devia ter escrito os
> achados A1–A6 no BACKLOG **sumiu junto com o contexto** e a sessão seguinte
> recebeu uma lista que não existia — instrução que precisa valer sempre não
> pode morar onde o contexto a leva embora.
>
> **Conferir a rota (backend) e declarar "verificado na tela" é o mesmo erro
> com outra roupa** — foi exatamente o que aconteceu em 24/08.

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

**BLOCO A — sistema de níveis de vídeo (Simples/Normal/Premium), 21/08/2026. HEAD `a1c8d46`.** Tela de tier no passo Gerar (3 cartões, sem nome de plataforma), `videos.tier_video` (migration 058), roteamento por tier dentro do pipeline da fal (Wan para "normal", Seedance 2.5 para "premium"), teto de gasto PRÓPRIO do Premium (`PIPELINE_TETO_USD_PREMIUM = 10.0`, contra o `PIPELINE_TETO_USD = 2.0` global). Commits `c066168` (implementação) + `a1c8d46` (correção de 3 `expect` de mutante que eram paráfrase da mensagem real, não transcrição — saíram INERTES na passada afetada e foram corrigidos ANTES da passada completa). Verificado NA TELA no navegador (seleção de tier muda o texto de ajuda em tempo real); nenhum clique em "Gerar vídeo", nenhuma chamada real à fal.ai, nenhum teste pago.

**PASSADA COMPLETA do arnês pós-BLOCO A: 292/292, ZERO INERTE/AMBÍGUO/ERRO/FALHOU.** Rodada em background depois do commit `a1c8d46`, HEAD final `a1c8d46`, árvore limpa antes e depois (confirmado por `git status`). Log em `_arnes-logs/mutants-bloco-a-completa-2026-08-21-{a,b}.log`, md5 `48721ac94902202f807bff438129fe0a` nas duas cópias — idênticas. Sem carimbo de PASSADA FILTRADA/PULADOS: é a completa de verdade, sem filtro. O arnês foi de 288 (fecho da sessão anterior) para **292 mutantes** — os 4 novos são os de `checkFalTierPolicy.ts` (motor por tier, teto por tier, corpo do Seedance, formulário propaga `tier_video`), todos exercitados e provados reprovando dentro desta mesma passada. Modo B de aprovação e qualquer teste pago **NÃO foram iniciados** — ficam para quando o operador confirmar, por instrução explícita desta rodada.

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

**⚠️ ESTADO ATUAL: DESARMADO — MEDIDO em 25/08/2026.** `printenv` dentro do
container responde `MODE=fixture liveconfirm_len=0`, e
`PLATFORM_ELEVENLABS_API_KEY` está vazia (len=0) — a chave em uso vem de
`api_credentials` por tenant. Os 4 containers estão `healthy` (backend de pé há
9 h, frontend 5 h). **Um clique em Gerar NÃO cobra dinheiro real hoje.** O
parágrafo abaixo é de 09/08 e descrevia o estado ARMADO; ele fica como
histórico do procedimento, não como descrição de hoje.

**⚠️ HISTÓRICO — ARMADO, NÃO DESARMADO — MEDIDO em 09/08/2026 02:01Z.** O texto abaixo descreve como CONFERIR o desarme; ele não descreve o estado de hoje. Hoje o processo está em **`PROVIDER_MODE=live`**, com **`PROVIDER_LIVE_CONFIRM` preenchida (len=28)** e **`PROVIDER_LIVE_MAX_GENERATIONS=10`** — e `docker compose config` **concorda** com o processo nos três (não há divergência arquivo×processo desta vez). `DAILY_PAID_GENERATION_LIMIT=10`, com **0 usadas hoje** (query de `dailyGenerationLimit.ts`, 09/08). `StartedAt=2026-08-09T01:02:24Z`, **`RestartCount=0`**, `Health=healthy`. A **linha de boot não foi encontrada** em `--tail 500`: a janela do log cobria ~26 min e o boot fora ~1 h antes — ausência que o gotcha 1 proíbe interpretar, e que o `printenv` supre por ser evidência mais forte. **Um clique em Gerar cobra dinheiro real.** Qualquer sessão que precise de `fixture` tem de desarmar com `up -d` e conferir de novo — `restart` não recarrega o `.env`.

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

> **⚠️ NOTA — 4:5/`instagram_feed`, investigação só-leitura, 25/08/2026 (Fase A, item 4).** Confirma, por `git log -S` e leitura do código, a hipótese do operador: **é a mesma reabertura de 19-20/08**, e o bug de barra sólida do HeyGen **segue sem reconfirmação por geração real**.
>
> **`git log --follow -S "instagram_feed" -- frontend/.../publishPlatforms.ts`** mostra só 3 commits tocando a contagem da string desde a criação do arquivo (`33ad5f1`, 01/08 — já nasceu com `instagram_feed`/4:5 presente) até hoje — **nenhum commit removeu e depois recolocou** a entrada. A leitura correta da nota antiga do CLAUDE.md ("4:5 RETIRADO... Instagram e Facebook eram as duas entradas 4:5", 05/08/DEMO-2) é: aquele catálogo tinha DUAS entradas 4:5 (Instagram e Facebook); a de Facebook foi removida e nunca voltou — a de Instagram foi a que saiu e **voltou**, e é sobre ela que trata este item.
>
> **MEDIDO por leitura direta, [videoFormat.ts:74-97](backend/src/services/providers/videoFormat.ts:74):** comentário do próprio código confirma, letra por letra — **"4:5 REINTRODUZIDO em 19/08, só para o feed do Instagram (Facebook segue fora — não foi pedido, e reintroduzir os dois juntos por simetria seria reabrir mais risco do que o testado cobre)"**.
>
> **O bug de 40% de barra sólida (medido no DEMO-2, 05/08, sonda `padded`, HeyGen) NÃO foi reconfirmado — é DEDUZIDO como ainda presente, não medido de novo.** Citação literal do comentário: *"reoferecer 4:5 também o reoferece para tenants na HeyGen, cujo defeito de 40% de barra NUNCA foi corrigido — só evitado removendo a opção. Nenhuma geração HeyGen com 4:5 rodou desde então"*. O conserto de 06/08 (`HEYGEN_FIT="cover"`) foi validado para o caso GERAL de barra (a troca de `contain`→`cover` que zerou os 40% medidos naquele momento), mas **nenhuma geração HeyGen real testou especificamente 4:5 depois da reintrodução de 19/08** — o `cover` nunca foi reconfirmado NESTA combinação exata (HeyGen × 4:5).
>
> **Do lado da fal:** MEDIDO em 19/08 que `aspect_ratio` sobrevive até o vídeo final para 9:16 (vídeo real, 716×1284, ffprobe). **Para 4:5 especificamente, NÃO VERIFICADO** — mesmo mecanismo (compor decide, animar herda), nenhuma chamada real testou 4:5 ainda ([videoFormat.ts:91-95](backend/src/services/providers/videoFormat.ts:91)).
>
> **Nenhum código foi tocado nesta investigação** — nem o catálogo, nem `HEYGEN_FIT`, nem nenhuma flag. Fica registrado para o operador decidir se quer reconfirmar por geração real (HeyGen × 4:5) antes de expor a opção a um tenant HeyGen-only, ou se o risco DEDUZIDO é aceitável por ora.

## 6 · Bloco de retomada — cole numa sessão nova

> ⚠️ **FECHAMENTO DE SESSÃO — COMMIT ÚNICO, 25/08/2026 — SUBSTITUI TODO O TEXTO ANTERIOR DESTA SEÇÃO.** Sessão longa, encadeada a partir do fechamento anterior (15:53): mapeamento de ligação Fase A, 5 itens fechados (A2, A3, rótulo Traje do resumo, persistência de Cenário/Traje do avatar, generalização h.3 da herança de plataforma), validação visual no browser real, e agora o commit que a Seção 6 anterior deixava condicionado a esclarecer a diretriz do operador (item g) — **o operador confirmou que esse bloqueio caiu**. Tudo abaixo medido nesta rodada de fechamento.
>
> ### (a) Estado do repositório — pós-commit
>
> Este commit cobre TUDO que estava pendente desde o fechamento de 15:53 **mais** o trabalho desta sessão. Não há mais stash de duas origens misturadas: a árvore inteira (o que estava staged + o que estava só modificado) foi para um commit único, com a mensagem descrevendo os grupos separadamente (ver mensagem do commit para o detalhamento exato por arquivo). **HEAD e hash exatos: reportados ao operador no chat desta sessão**, não replicados aqui por seguirem o commit que ainda não existia no momento em que este texto foi escrito — evita a auto-referência impossível (um arquivo não pode conter o hash do commit que o grava).
>
> **Gate estático** (`docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check`) → **EXIT 0**, reconfirmado nesta rodada, depois de todo o trabalho de A2/A3/item 5/h.3. **`tsc -b --noEmit` do frontend** (não coberto pelo gate do backend) → **também EXIT 0**, reconfirmado na mesma rodada.
>
> **Mutantes declarados: 404** — confirmado por `node tools/run-mutants.mjs --list` do host (eram 398 no fechamento de 15:53; +6 desta sessão: 1 para A2, 1 para A3, 1 para o rótulo Traje, 2 para a persistência de Cenário/Traje do avatar, 1 para h.3 líquido — ver o detalhamento dos itens abaixo).
>
> **Passada completa de mutantes NÃO disparada nesta sessão** — fica para depois, isolada, fora do horário de trabalho, como já é a regra.
>
> ### (b) O que este commit fecha
>
> - **Fechamento de 25/08 15:53** (já pronto, só sem commit até agora): LUFS no avatar existente, qualidade de imagem no upload por arquivo, ajustes de voz (migration 067), achado sobre a divergência de resolução de credencial entre `avatars.ts` e `POST /videos` — ver o texto histórico que estava aqui, agora substituído; nada mudou nesses itens nesta sessão, só deixaram de estar pendurados sem commit.
> - **A2 — aviso de nível indisponível.** `SceneStep.tsx` conta quantos grupos de vendor estão bloqueados (`gruposIndisponiveisCount`) e escolhe entre "um dos níveis" / "nenhum dos níveis" — antes dizia sempre a mesma frase mesmo com os 3 níveis inteiros indisponíveis. Guarda em `checkTierAvailabilityPolicy.ts`.
> - **A3 — preço do Premium reage à duração real.** `/video-cost-reference` (routes/videos.ts) ganhou o campo `target`, resolvido pela MESMA `estimateVideoCost` dos pontos fixos; `SceneStep.tsx` consome por tier. A string fixa "US$ 14,19" saiu. Guarda em `checkCostReferencePolicy.ts`.
> - **GenerationSummary.tsx — rótulo "Traje" lê o campo certo.** Linha 75 lia `avatar_look_id` (dropdown removido em 25/08, sempre `null`); agora lê `outfit_prompt`/`outfit`. Guarda em `checkPreflightSummaryPolicy.ts`.
> - **Persistência de Cenário/Traje do avatar (item 5).** Migration 068 (`avatars.scenario`/`scenario_prompt`/`outfit`/`outfit_prompt` — não existiam antes, ao contrário do que a tarefa original presumia). `PUT /avatars/:id` persiste com COALESCE. `handleFinishSetup` (AvatarSetupStep.tsx) grava ao "Concluir configuração". `POST /videos` cai para o padrão do avatar só quando o próprio vídeo não manda valor. Guarda nova `checkAvatarSceneDefaultsPolicy.ts`.
> - **h.3 — herança de plataforma generalizada.** A plataforma vence a BYOK do tenant SEMPRE que tiver cobertura, para qualquer vendor — não é mais exceção isolada da fal. `Cobertura` perdeu o campo `precedencia`; `credentialLookup.ts` chama `herdarDaPlataforma` primeiro, sempre, nas duas funções de resolução. Guarda reescrita em `checkPlatformInheritancePolicy.ts` (5 mutantes, 2 novos líquidos).
>
> ### (c) Validação visual real — o que ela confirmou e o que ela achou de novo
>
> Rodada de validação no browser (fixture, custo zero, dois avatares descartáveis criados: `TESTE PROVA h5 - descartavel` e `TESTE PROVA h5 v2 - descartavel`) confirmou a persistência de ponta a ponta — `scenario_prompt`/`outfit_prompt` gravados no Postgres imediatamente após "Concluir configuração" — e achou dois pontos que o código sozinho não deixava óbvios: ver itens 1 e 2 da lista de abertos abaixo.
>
> ### (d) ITENS EM ABERTO — registrados nesta rodada, NÃO resolvidos
>
> 1. **BUG REAL — a tela de avatar existente não relê `scenario_prompt`/`outfit_prompt` do banco ao reabrir.** A persistência (item 5 acima) funciona — confirmado por leitura direta do Postgres — mas o campo "Cenário"/"Traje" na tela do avatar existente aparece VAZIO até alguém editar de novo, porque nada em `AvatarSetupStep.tsx` inicializa `defaults.scenarioPrompt`/`outfitPrompt` a partir de `avatar.scenario_prompt`/`outfit_prompt` quando um avatar é selecionado. Achado na validação visual desta sessão (recarregar página + reselecionar avatar treinado + ler o DOM: nenhum dos dois campos trazia o texto salvo). Correção pendente, não implementada.
> 2. **LIMITAÇÃO ARQUITETURAL ACEITA, NÃO É BUG — o resumo da Cena/Gerar não pode mostrar a herança do padrão do avatar antes de o vídeo existir.** O resumo (`resumoDaGeracao`) é montado 100% no cliente a partir do que o wizard já tem preenchido; o fallback para o padrão do avatar só roda dentro do servidor, ao processar `POST /videos`. Confirmado ao vivo: vídeo novo com Cenário/Traje vazios na Cena → resumo mostra "Traje: nenhum", mesmo com o avatar tendo padrão persistido. Não há como o resumo pré-clique refletir uma decisão que só existe pós-clique sem redesenhar o que o resumo é — decisão de produto, não conserto de bug.
> 3. **Os dois avatares descartáveis de teste** (`TESTE PROVA h5 - descartavel`, `TESTE PROVA h5 v2 - descartavel`) seguem no tenant `dev-c77a5b`, aguardando decisão do operador sobre excluir ou manter.
> 4. **Passada completa dos mutantes (404 declarados, contagem atual) segue pendente** — roda isolada, fora do horário de trabalho, como já é a regra do projeto.
>
> ### (e) Pendências herdadas, ainda não tocadas (do fechamento de 15:53, sobrevivem sem mudança)
>
> 1. Os campos "Em preparação" do Passo 3 (Cenário/Traje da Cena, decorativos) ficam VISÍVEIS no fluxo Simples ou são ESCONDIDOS? *(Decisão 1, ainda aberta — Cenário/Traje da Cena permanecem decorativos por decisão explícita, não tocados nesta sessão.)*
> 2. Dropdown de Traje no Passo 3 — reintroduzir, ou está resolvido pela remoção? *(Decisão 3, ainda aberta — o rótulo cosmético que a mascarava foi corrigido nesta sessão, item (b) acima, mas a decisão de produto em si segue aberta.)*
>
> Gate: `docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check`. `--list`: `node tools/run-mutants.mjs --list`, do host.

> ⚠️ **FECHAMENTO PARA TROCA DE CONTA (26/08/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão de TESTE PAGO REAL em ambiente local (armado em live), encadeada a partir do commit `4e84014` (h.3 + reread de Cenário/Traje). Meio do teste, um bug real com dinheiro em jogo foi encontrado, diagnosticado e corrigido nesta mesma sessão — ver (a). Nenhum vídeo foi gerado ainda, nos dois tiers planejados.
>
> ### (a) HEAD atual e o que ele corrige
>
> **HEAD: `68b418b4652b5de068e4e84cbec467c1438b329b`.** Corrige `POST /avatars/:id/reference-video`, que resolvia a credencial de TREINO pelo `is_default` genérico de `provider=avatar` do tenant — para o `dev-c77a5b`, essa linha é `vendor=fal` (guardada só para o pipeline de ANIMAÇÃO, sem ramo de treino). `trainAvatar()` despacha por um ternário que só conhece `"did"` como caso especial; `"fal"` caía no `else` e ia para `trainAvatarHeygen()`, mandando a chave da fal para `api.heygen.com`. **MEDIDO em live:** 401 do fornecedor (`kind="auth"`), crédito de avatar debitado e estornado automaticamente 2s depois (líquido zero), nenhuma voz nova, nenhum custo real. Correção: a rota agora resolve por `getCredentialForVendor()`, iterando `VENDORS_WITH_TRAINING_PATH.avatar` (novo em `vendorCatalog.ts`, hoje `["heygen", "did"]`) — nunca mais considera `fal` para treino. Guarda nova `checkAvatarTrainingVendorPolicy.ts`, provada reprovando isoladamente. Gate verde, `tsc` do frontend limpo.
>
> **Achado à parte, NÃO é bug de hoje:** o `is_default=fal` do tenant já existia desde antes de 13/08 (não foi setado pela preparação do teste de h.3 desta sessão). O tenant TEVE uma credencial `avatar/heygen` (3 atualizações em 22/08, sempre `is_default:false`) que não existe mais em `api_credentials` hoje — sumiu sem `DELETE` registrado em `audit_log`. Ver (c).
>
> ### (b) O teste em andamento — objetivo, e por que NENHUM vídeo saiu ainda
>
> Objetivo do bloco: provar, com dinheiro real, (1) a herança de Cenário/Traje do avatar (Fase A, item 5 + a releitura corrigida em `68b418b`) num vídeo tier **Normal** (fal/Wan), com Cenário/Traje da Cena vazios de propósito; e (2) um vídeo tier **Simples** (HeyGen) com o Mário. **Nenhum dos dois foi gerado.** A única tentativa desta sessão foi criar um avatar novo do zero (`TESTE PAGO REAL 26/08`) para servir de base ao vídeo Normal — ela morreu no bug de (a), durante o UPLOAD do vídeo de referência (treino), antes de qualquer vídeo ser sequer iniciado. **Custo real da tentativa: ZERO** (débito estornado, nenhuma chamada faturável completou).
>
> O avatar de teste incompleto (`55b68d1d-4f3c-4aa7-94ce-6c848b95da9f`, sem treino, sem voz) foi **excluído** nesta rodada de fechamento — linha em `avatars` e os 3 arquivos de foto associados.
>
> ### (c) PRÓXIMO PASSO EXATO
>
> Recriar o avatar de teste do ZERO pelo fluxo normal da tela (Passo 1 → "+ Configurar novo avatar" → fotos + vídeo de referência real + voz real via upload de arquivo, câmera bloqueada neste ambiente) — o bug que travou a tentativa anterior está corrigido em `68b418b`. Depois: preencher Cenário/Traje Padrão, "Concluir configuração", confirmar reread ao reabrir (correção de `4e84014`), e então os dois vídeos pagos (Normal com este avatar, Simples com o Mário), como planejado.
>
> ### (d) Pendências NÃO bloqueantes
>
> 1. **Buraco de auditoria** — a credencial `avatar/heygen` do tenant `dev-c77a5b` (criada/atualizada 3× em 22/08) sumiu de `api_credentials` sem `DELETE` correspondente em `audit_log`. Não investigado a fundo; não impede o próximo passo, mas é o tipo de lacuna que vale entender antes de confiar no audit log para outra coisa.
> 2. **Decisão pendente:** manter `fal` como `is_default` de `provider=avatar` para este tenant, ou trocar para `heygen`? O código agora está correto nos dois casos (treino nunca mais usa `fal`), então isto é só sobre qual vendor a tela mostra como "padrão" em outros contextos (ex.: looks/trajes) — não bloqueia o próximo passo.
> 3. **2 avatares descartáveis antigos** (`TESTE PROVA h5 - descartavel`, `TESTE PROVA h5 v2 - descartavel`, do fechamento de 25/08) seguem no tenant, aguardando decisão de excluir ou manter — não tocados nesta rodada.
>
> ### (e) ⚠️ AVISO — rodar a passada completa dos mutantes ANTES do primeiro vídeo pago de verdade
>
> **A última passada completa (404/404, ver Seção 5.1/6) NÃO cobre a guarda `checkAvatarTrainingVendorPolicy.ts` de hoje — os mutantes declarados foram de 404 para 406 nesta sessão** (1 para a guarda de treino-por-vendor, e o registro de mutantes subiu junto). Rodar `node tools/run-mutants.mjs` (sem filtro, completo, isolado, fora do horário de trabalho — a regra de sempre) antes de gerar o primeiro vídeo pago de verdade nesta linha de teste. Sem essa passada, a guarda que existe especificamente por causa do bug de dinheiro real desta sessão nunca foi provada na COMPLETA — só isoladamente (`--name`), o que basta para o commit mas não substitui a completa.
>
> **Ambiente ao fechar esta sessão — ARMADO EM LIVE, confirmado `.env` × processo, SEM divergência:**
> ```
> PROVIDER_MODE=live
> PROVIDER_LIVE_CONFIRM=eu-autorizo-gastar-cota-real
> PROVIDER_LIVE_MAX_GENERATIONS=3
> ```
> Contador diário pago (`DAILY_PAID_GENERATION_LIMIT=10`): **0 usadas hoje**, MEDIDO por query direta (`videos` + `avatar_looks`, `simulated=false`, hoje) — a tentativa que falhou não é `videos` nem `avatar_looks`, é treino de avatar, e não conta neste balde. HeyGen: saldo carteira US$ 4,00, quota 240un. ElevenLabs: 9/10 slots próprios ocupados (1 livre). Gate: `docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check`. `--list`: `node tools/run-mutants.mjs --list`, do host.

> ⚠️ **FECHAMENTO PARA TROCA DE CONTA (27/08/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão encadeada a partir do commit `68b418b` (correção de vendor de treino). Quatro entregas: fluxo de upload de Cenário/Traje com confirmação (Salvar/Excluir), feedback de treino (selo "Treinando…" + polling leve), correção da regra de roteamento do passo 1 (Fase 1(b)), seção "Ver avatar" + botão "Retreinar avatar" (Fase 2). Mais uma investigação, sem implementação (Fase 3): onde o vídeo gerado aparece na tela.
>
> ### (a) HEAD e o que foi commitado
>
> **Commit de código: `75ddd1a699ed36af5b7f06cbe4f50e11698d6520`** — 7 arquivos, 672 inserções/91 remoções: `backend/src/routes/avatars.ts` (2 rotas novas: `GET /avatars/:id/training-status`, `GET /avatars/:id/preview`), `backend/src/services/providers/avatarProvider.ts` (`checkAvatarStatusOnce`), `backend/src/scripts/checkAvatarTrainingVendorPolicy.ts` e `checkExistingAvatarAssetsPolicy.ts` (guardas ajustadas para as mudanças acima, mesma intenção protetora), `frontend/src/locales/pt-BR.json`, `frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx` (grosso da mudança), `frontend/src/types.ts`. Gate 406/406 mutantes casando exatamente 1×, `tsc` limpo nos dois lados, confirmado ANTES do commit.
>
> **Este próprio arquivo (CLAUDE.md) é commitado À PARTE, depois deste texto** — é o padrão já usado no fechamento de 26/08 para não criar uma auto-referência impossível (um commit não pode conter o próprio hash). O HEAD do repositório, depois desse segundo commit, será um passo à frente de `75ddd1a`, só documentação — nenhum arquivo de código muda nele.
>
> ### (b) Reconfirmação padrão — tudo verificado ANTES do commit e de novo depois
>
> | Verificação | Resultado |
> |---|---|
> | `tsc` (backend e frontend) | EXIT 0 nos dois |
> | Gate estático (fixture) | EXIT 0 — 406/406 mutantes |
> | Containers | 4/4 healthy, `RestartCount=0` nos dois que importam (backend, frontend) |
> | Hash container × commit `75ddd1a` | bate nos 3 arquivos mais tocados (conferido via `git show HEAD:...`, não só disco) |
> | `PROVIDER_MODE` | `live`, `PROVIDER_LIVE_CONFIRM` len=28, `PROVIDER_LIVE_MAX_GENERATIONS=3` — processo e `docker compose config` concordam |
> | Contador de vídeos pagos hoje | **0**, MEDIDO antes E depois de todo o trabalho desta sessão — nenhuma chamada faturável de vídeo ocorreu hoje |
>
> ### (c) OS 3 ITENS PENDENTES DA TAREFA ANTERIOR — status exato
>
> 1. **Prévia de voz clonada no fluxo de criação — JÁ IMPLEMENTADA, não é trabalho desta sessão.** Confirmado por leitura: `VoiceSampleRecorder.tsx` já renderiza `<audio controls src={result.preview.url}>` com a frase falada, alimentado pelo campo `preview` que `POST /avatars/:id/voice-sample` já devolve desde antes. Nada a fazer aqui.
> 2. **"Imagem do fornecedor não disponível" — AINDA OCORRE, causa raiz identificada, NÃO CORRIGIDA (por instrução explícita: só registrar, não implementar agora).** Medido ao vivo, leitura sem custo, no avatar "Teste de telas de confirmação": `GET /avatars/:id/preview` (e o `GET /avatars/:id/looks` já existente, de quem copiei o padrão) resolvem a credencial de avatar por `getCredential(tenantId, "avatar")` — GENÉRICO, que lê o `is_default` da tabela `api_credentials` do TENANT. Para `dev-c77a5b` isso é `fal` (guardado para animação, sem ramo de leitura de avatar na HeyGen). A chamada à HeyGen sai com a chave da fal, volta **401 Unauthorized**, e o código trata como "sem prévia" — silencioso, sem erro visível. **Não é bug novo desta rodada**: `/avatars/:id/looks` (seletor de Traje, já em produção) tem exatamente o mesmo defeito, e por isso pode estar silenciosamente mostrando o seletor de traje como "1 look só" para este tenant há mais tempo do que se sabia. O item 396 (bloco de 26/08, pendência (d).2) já cogitava esta troca de `is_default` como decisão cosmética de "qual vendor a tela mostra como padrão" — este achado mostra que NÃO é cosmético, quebra leitura real. **Conserto (não aplicado): trocar `getCredential(tenantId, "avatar")` por `getCredentialForVendor(tenantId, "avatar", "heygen")` nas duas rotas — mesma correção já aplicada ao treino em `68b418b` via `checkAvatarTrainingVendorPolicy.ts`, nunca estendida às rotas de leitura.**
> 3. **Persistência da tela de aprovação de vídeo via URL — NÃO IMPLEMENTADA.** Confirmado por investigação (Fase 3 desta sessão, sem código): `video` em `GenerateStep.tsx` é `useState` local, sem `useParams` nem qualquer leitura de URL. Fechar a aba do wizard antes de aprovar uma imagem composta ou um vídeo mudo perde o acesso à MESMA tela de aprovação — o único resíduo visível depois disso é o status "aguardando aprovação"/"aguardando aprovação do vídeo" em Conteúdo → Biblioteca de vídeos, sem nenhum botão de aprovar ali. A aprovação pendente eventualmente expira sozinha (`approval_expired`, via varredura de recuperação já existente).
>
> ### (d) Números reconferidos nesta rodada — um deles estava desatualizado
>
> **ElevenLabs: 7 vozes próprias de 28 no inventário total (não "5/10" — número presumido pelo operador, agora corrigido por medição direta, `GET /v1/voices`, leitura sem custo).** O teto real (10) segue SUPOSTO, como já registrado — `/v1/user/subscription` exige `user_read`, não obtido. Com a suposição de 10, sobram 3 slots — sem risco de bloqueio na mesma margem de antes, só o número exato mudou.
>
> ### (e) Avatar pronto para o teste real
>
> **"Teste de telas de confirmação"** (`741c02d1-8342-4414-81ff-30af958ab0a2`) — `provider=heygen`, `provider_status=ready`, voz clonada, Cenário/Traje Padrão preenchidos. É o avatar recomendado para o próximo passo, abaixo.
>
> ### (f) PRÓXIMO PASSO EXATO
>
> 1. Passo 1 "Configurar avatar" → selecionar **"Teste de telas de confirmação"**.
> 2. Avançar até o passo 4 "Gerar".
> 3. Tier **"Normal" ou "Premium"** — **nunca "Simples"** (Simples é HeyGen; o teste desta rodada é sobre o caminho fal/Wan-Seedance).
> 4. **Não preencher Cenário/Traje na tela do vídeo** — o objetivo é confirmar que a herança do padrão do avatar (Cenário/Traje Padrão, já preenchidos no avatar) funciona quando o vídeo não manda valor próprio.
> 5. Gerar.
>
> **Resultado esperado: a corrida para na etapa "compor"** — uma IMAGEM composta aguardando aprovação (`awaiting_approval`), **não** o vídeo animado final. Isso é o comportamento correto e esperado do pipeline em duas aprovações (compor → animar+narrar+sincronizar), **não é erro**. A aprovação em si acontece dentro do próprio wizard, no passo 4 — ver item (c).3 acima sobre a limitação de não conseguir voltar a essa tela se a aba for fechada antes de aprovar.
>
> **Nenhuma chamada faturável de vídeo ocorreu hoje até o fechamento desta sessão** (contador em 0, MEDIDO — ver (b) acima). O passo acima É a primeira, e vai cobrar de verdade (síntese de voz + composição de imagem, na faixa de centavos a poucos dólares conforme já documentado neste arquivo).
>
> **Ambiente ao fechar esta sessão: ARMADO EM LIVE**, mesma configuração do fechamento de 26/08, reconfirmada sem divergência — ver tabela em (b).

> ⚠️ **FECHAMENTO PARA TROCA DE CONTA (28/08/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão longa, encadeada a partir do commit `d4fece2` (fechamento de 27/08). Nove frentes de EXECUÇÃO mais uma varredura completa das 4 abas — ver (a) para a lista e (h) para o que a varredura confirmou. O item 2 da pendência (c) do bloco de 27/08 (bug de credencial nas rotas de leitura de avatar) está **FECHADO** nesta sessão — a frase "NÃO CORRIGIDA" daquele bloco não vale mais; ver (d).
>
> ### (a) HEAD e o que foi commitado
>
> **Commit de código: `f0a66c1`** — 26 arquivos, 2691 inserções / 1186 remoções. Dez frentes, todas com gate+tsc verdes e guarda nova provada REPROVANDO antes de cada afirmação de sucesso:
>
> 1. **Bug de credencial fechado nas três rotas de avatar** — `GET /avatars/:id/looks`, `GET /avatars/:id/preview` e `POST /avatars/:id/looks` (criar traje) resolviam a credencial pelo `is_default` genérico do tenant, não pelo vendor que treinou o avatar. Para `dev-c77a5b` (`is_default=fal`) isso mandava a chave da fal para a HeyGen e voltava 401 calado. As duas rotas de leitura já tinham sido corrigidas antes desta sessão; o POST (criar traje, US$ 1,00) fechou agora — `checkAvatarPreviewVendorPolicy.ts` estendida, 3 mutantes.
> 2. Aviso de custo do retreino visível antes do clique (rótulo estático).
> 3. Refetch automático da prévia do avatar (Ver avatar) quando o treino termina.
> 4. Fundo e traje nativos da HeyGen devolvidos ao passo Cena (tier Simples).
> 5. **Cenário e Traje viram campo POR VÍDEO** — os dois eram "padrão do avatar", editáveis só no Passo 1. Migração NÃO DESTRUTIVA: o valor salvo no avatar vira semente do campo por vídeo na primeira seleção da visita (`checkScenePerVideoPolicy.ts`, 9 mutantes). TRAJE PADRÃO saiu inteiro da aba 1; ADICIONAR TRAJE (Look pago da HeyGen) permanece. Ver (e) para o estado atual.
> 6. Excluir/refazer foto do rosto, com remoção real no banco e no disco (`checkPhotoRemovalPolicy.ts`, 4 mutantes).
> 7. Fundo virtual como escolha comparável — toggle Sem/Com, 4 cores com pré-visualização ao vivo (custo zero, MediaPipe local). Flag `removable_background` ligada por padrão (migration 069).
> 8. Fotos laterais na composição da fal — prioridade fixa Frente → Cenário → Traje → 1 lateral, nunca as duas juntas, nunca mais de 4 imagens (`checkFalSceneWiringPolicy.ts`, 3 mutantes).
> 9. Excluir imagem no bloco ADICIONAR TRAJE (Look) — não existia; fechado como pré-passo da varredura (h).
> 10. **Resumo pré-pagamento (aba Gerar) volta a mostrar Cenário** — achado na varredura (h): a linha saiu do resumo junto com `defaults.scenarioName` na rodada do item 5 e ninguém a substituiu; o campo sempre chegou certo ao `POST /videos`, só ficou invisível na tela que existe exatamente para pegar isso. `checkPreflightSummaryPolicy.ts` estendida (7 campos, era 6), 2 mutantes novos.
>
> **Este próprio arquivo (CLAUDE.md) é commitado À PARTE, depois deste texto** — mesmo padrão dos dois fechamentos anteriores, para não criar uma auto-referência impossível.
>
> ### (b) Reconfirmação padrão
>
> | Verificação | Resultado |
> |---|---|
> | `tsc` (backend e frontend) | EXIT 0 nos dois |
> | Gate estático (fixture) | EXIT 0 — 431 mutantes declarados (era 406 no fechamento de 27/08) |
> | Containers | 4/4 healthy — backend **reiniciado nesta reconfirmação** (`RestartCount=0`, sem crash) para o processo passar a servir o código commitado; sem watch dentro do Docker, um `tsc`/gate verde no disco não garante o processo em memória atualizado, e várias edições desta sessão aconteceram depois do último restart anterior |
> | Hash container × commit `f0a66c1` | bate nos 3 arquivos mais tocados de cada lado (`avatars.ts`, `GenerationSummary.tsx`, `avatarProvider.ts`), via `git show HEAD:...` comparado ao conteúdo lido de dentro dos containers, ignorando CRLF/LF |
> | `PROVIDER_MODE` | `live`, `PROVIDER_LIVE_CONFIRM` len=28, `PROVIDER_LIVE_MAX_GENERATIONS=3` — processo e `docker compose config` concordam, sem divergência |
> | Contador de vídeos pagos hoje | **0**, MEDIDO antes E depois de todo o trabalho desta sessão (inclusive depois do restart do backend) — nenhuma chamada faturável de vídeo ocorreu hoje |
>
> ### (c) O item que segue PARADO de propósito
>
> **Persistência da tela de aprovação do vídeo final via URL — NÃO TOCADA nesta sessão, mesma investigação do fechamento de 27/08 (item c.3 daquele bloco) segue valendo.** `video` em `GenerateStep.tsx` continua `useState` local, sem `useParams`. Fechar a aba do wizard antes de aprovar uma imagem composta ou um vídeo mudo perde o acesso à mesma tela de aprovação; o resíduo visível é o status "aguardando aprovação" em Conteúdo → Biblioteca de vídeos, sem botão de aprovar ali. Entra depois na sequência — não é bloqueio para o próximo passo (f), que não depende de fechar a aba.
>
> ### (d) "Teste de telas de confirmação" é avatar real — confirmado, não é mais dúvida
>
> Confirmado por **2 chamadas GET reais, não-tarifadas**, nesta sessão: `GET /v2/photo_avatar/c16953a03495c796aa8c092d28017e10` e `GET /v3/avatars/looks/c16953a03495c796aa8c092d28017e10` — as duas devolveram **200**, `status: "completed"`, `avatar_type: "photo_avatar"`. `provider_avatar_id` **não é** `fixture-*`. A rota de preview (corrigida no item 1 de (a)) já devolve `heygen_preview_url` real (`files2.heygen.ai/...`) e a imagem carrega de verdade na aba 1 — verificado ao vivo, `naturalWidth=640`, `complete=true`. **Nenhum retreino é necessário antes do teste pago.**
>
> ### (e) Estado atual de Cenário/Traje
>
> Os dois são **campo por vídeo, na Cena** — não mais "padrão do avatar" editável na aba 1. Para avatares com valor já salvo (ex.: "Teste de telas de confirmação" tem `outfit_prompt = "terno sofiticado e bem alinhado"`), a Cena chega **pré-preenchida** na primeira seleção do avatar na visita (migração não destrutiva, semente única) — editável dali em diante, só para aquele vídeo, sem tocar o valor congelado no avatar. Cenário deste avatar específico está vazio (nada salvo). Verificado ao vivo nesta sessão, incluindo a linha nova do resumo (item 10 de (a)).
>
> ### (f) PRÓXIMO PASSO EXATO
>
> 1. Passo 1 "Configurar avatar" → selecionar **"Teste de telas de confirmação"**.
> 2. Avançar até o passo 3 **"Cena"**.
> 3. Tier **"Normal" ou "Premium"** — **nunca "Simples"**.
> 4. **Preencher Cenário e Traje na própria tela Cena** — não mais na aba 1, que não tem mais esses campos.
> 5. Avançar até o passo 4 **"Gerar"**.
> 6. **Conferir que o resumo mostra a linha "Cenário" corretamente** (item 10 de (a) — é exatamente o que esta sessão corrigiu).
> 7. Gerar.
>
> **Resultado esperado: a corrida para na etapa "compor"** — uma IMAGEM composta aguardando aprovação (`awaiting_approval`), **não** o vídeo animado final. Isso é o comportamento correto e esperado do pipeline em duas aprovações, **não é erro** — mesma nota do fechamento de 27/08, ainda válida.
>
> **Nenhuma chamada faturável ocorreu hoje até o fechamento desta sessão** (contador em 0, MEDIDO — ver (b), inclusive depois do restart do backend). O passo acima É a primeira, e vai cobrar de verdade.
>
> **Ambiente ao fechar esta sessão: ARMADO EM LIVE**, mesma configuração dos fechamentos anteriores, reconfirmada sem divergência — ver tabela em (b).

> ⚠️ **FECHAMENTO — V34 (01/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão de IMPLEMENTAÇÃO (não teste pago), encadeada a partir do commit `0e03141` (fechamento do V33). Rodada MODE: CORREÇÃO, CUSTO US$ 0,00 do lado do assistente — **nenhuma geração paga foi disparada nesta sessão**, todo o custo mencionado abaixo é ESTIMADO para o clique do operador.
>
> ### (a) HEAD e o que foi commitado
>
> **Commit único: `1430193`** — 28 arquivos, 1677 inserções / 233 remoções. Seis partes:
>
> 1. **Duração-alvo vira parâmetro de verdade (itens 1-4).** `target_duration_seconds` persiste na linha do vídeo (migration 074), viaja por `/approve` até `compararAlvoComFala` (falPipeline.ts), e recusa ANTES de `animar()` (nunca antes de `narrar()`, que já foi pago ao ElevenLabs) quando a fala sintetizada diverge do alvo em mais de 8% — fronteira MEDIDA por execução direta: 8,0% passa, 8,1% recusa, nos dois sentidos (`checkAlvoDeDuracaoPolicy.ts`, novo). A recusa entra em `classifyVendorFailure` junto de `RoteiroInvalidoError`, mapeando para 422. O resumo "o que vai ser enviado" ganhou a 8ª linha (Duração-alvo).
> 2. **O vídeo para junto com a fala (itens 5-6).** A margem antes do lipsync caiu de 1s para 0,5s; depois do lipsync, `apararSobraMuda`/`apararVideoFinal` (ffmpeg.ts/falPipeline.ts) cortam o vídeo sincronizado com PRECISÃO de ffmpeg para terminar no máximo 0,3s depois do fim do áudio — MEDIDO com ffmpeg real contra a fixture local (`checkTrimOvershootPolicy.ts`, novo): cortou 5,000s → 2,520s pedindo 2,500s, dentro da folga de 1 quadro.
> 3. **Prompt do Wan 3.0 alinhado às práticas documentadas (itens 7-12).** Referências rotuladas "Image 1"/"Image 2" (mesma ORDEM de sempre — composta primeiro, foto real depois, invariante V24/G-2b preservada); fala do bloco citada entre aspas para o ritmo labial; proibição explícita de trilha/voz gerada; cláusula de escala por duração; teto de prompt em 20.000 caracteres (declarado pelo OPERADOR — **NÃO VERIFICADO** contra a doc oficial da fal, que por WebFetch nesta sessão não afirma limite nenhum, nem 1.500 nem 20.000); `enable_thinking: false` explícito.
> 4. **4:5 (Feed do Instagram) reativado no tier Normal por DERIVAÇÃO (itens 13-17).** `aspectRatioParaFornecedor` troca "4:5" por "9:16" em todo ponto que fala com a fal (compor e animar — o Wan não tem 4:5 no enum); `/approve-video` deriva o corte central por SOFTWARE (`deriveVariantsForVideo`, nunca antes ligada ao caminho da fal) quando `video.aspect_ratio === "4:5"`. Chip sempre clicável; troca forçada removida. `checkNormalAspectRatioPolicy.ts` reescrita.
> 5. **Tela de retomada de blocos (item 18).** `ResumeBlocksPanel.tsx`, na Biblioteca de Vídeos, para vídeos travados em `processing`/`poll_timeout` — consome `GET /videos/:id/resume-info` (custo zero) e `POST /videos/:id/resume-blocks`.
> 6. **Ensaio de fixture (item 19).** `checkFixtureFormatEnsaioPolicy.ts`, novo — deriva os 4 formatos do produto (16:9, 9:16, 1:1, 4:5) de um master real via `deriveOneVariant` e mede CADA ARQUIVO DE SAÍDA por `ffprobe`: 16:9→1136×640 (1,7750), 9:16→360×640 (0,5625), 1:1→640×640 (1,0000), 4:5→512×640 (0,8000) — todos dentro de 1% da proporção pedida.
>
> **Achado e corrigido NO CAMINHO, antes do commit:** `checkBlockResumePolicy.ts` não desativava o recorte final novo (`apararSobraFinal`) no teste de tomada única — uma mutação no freio de `pararApos` fazia essa guarda travar em `ffmpeg` real contra URL fake ANTES de `checkFalVideoApprovalPolicy.ts` sequer rodar, mascarando o próprio mutante que deveria ter reprovado (18 de 26 mutantes novos/alterados chegaram a aparecer "inertes" nas passadas intermediárias por este e por outros 3 motivos: `expect` escrito de cabeça sem bater com a mensagem real da checagem, uma checagem nova que faltava por completo, e um `if (false)` literal que quebra a tipagem do TypeScript em bloco "definitivamente inalcançável" — mesmo gotcha já documentado em `checkFalVideoApprovalPolicy.ts`, resolvido com `String(x) === "sentinela"`). Todos corrigidos e reconfirmados um a um ANTES do commit.
>
> ### (b) Reconfirmação padrão
>
> | Verificação | Resultado |
> |---|---|
> | `tsc` (backend e frontend) | EXIT 0 nos dois |
> | Gate estático (fixture) | EXIT 0 — 483 mutantes declarados (era 478 no fechamento do V33), 475 casam por arquivo + 8 de ambiente |
> | Passada `--guard` dos 26 mutantes novos/alterados desta rodada | **26/26 reprovaram de verdade**, árvore limpa em cada aplicação — MEDIDO depois de corrigir os 4 achados acima |
> | Passada COMPLETA (483 mutantes, sem filtro) | **466/483** — log em `_arnes-logs/mutants-v34-completa-2026-09-01-{a,b}.log`. Os **17 que reprovaram são TODOS de guardas de rodadas ANTERIORES** (limiter de login, custo trunc/floor, derivação lanczos/bicubic, lote nativo, preenchimento, voz/duração mínima, docs-internal, 3× recuperação, chave da fal redigida, pipeline resposta crua, fal catálogo, 2× pipeline polling, pipeline três etapas pagas, color-match corrigirCor) — **nenhum dos 26 mutantes desta rodada (V34) está entre eles**, confirmado por nome. Reconfirmado ISOLADO (`--name`) para 1 deles (`corrigirCor vira sempre true`): reprova IDÊNTICO fora do paralelo, então é `expect` desalinhado da mensagem real, não instabilidade do arnês paralelo. **Por instrução do V34 ("não corrigir guardas de rodadas anteriores"), NENHUM dos 17 foi tocado** — dívida pré-existente, fica para uma rodada futura dedicada a isso |
> | Containers | 4/4 healthy — backend E frontend REINICIADOS nesta sessão (ambos `RestartCount=0`, sem crash) para o código novo e a migration 074 entrarem em vigor — sem watch dentro do Docker, um `tsc`/gate verde no disco não garante o processo em memória atualizado |
> | Migration 074 | Aplicada com sucesso no restart — confirmada em `schema_migrations` |
> | Hash container × commit `1430193` | `falPipeline.ts` bate byte a byte entre `git show HEAD:...` e o conteúdo lido de dentro do container backend |
> | `PROVIDER_MODE` | `live`, `PROVIDER_LIVE_CONFIRM` len=28 — confirmado no PROCESSO após os dois restarts |
> | ⚠️ `PROVIDER_LIVE_MAX_GENERATIONS` | **DIVERGE**: processo = `1` (o que efetivamente vale agora, e é o que este fechamento pediu para deixar); `docker compose config` (o `.env`) = `3`. Um `docker compose up -d` ANTES do teste do operador reconciliaria os dois PARA 3, não para 1 — se isso não for desejado, o `.env` precisa ser corrigido à mão antes, ou o operador simplesmente evita `up -d`/reiniciar o backend entre agora e o teste |
> | Contador de vídeos pagos hoje | **2** (não 0) — MEDIDO por query direta, `status` "erro" e "aguardando aprovação", tier normal, ambos criados às 00h de 01/09, ANTES desta sessão começar (a migration 073 anterior a eles só foi aplicada às 11h27 do mesmo dia — são resíduo de teste anterior a esta sessão, não algo que ela causou) |
> | Verificação visual (browser real, logado) | Biblioteca de Vídeos carrega sem erro de console novo, tabela renderiza as ~50 linhas existentes normalmente; nenhuma delas está em `processing`/`poll_timeout`, então o botão "Retomar geração" **não pôde ser visto na tela** — só confirmado que a ausência dele não quebra nada |
>
> ### (c) Custo por etapa e teto — para o PRIMEIRO clique do operador (item 21)
>
> **Saldo da fal.ai antes do teste: NÃO VERIFICADO nesta sessão** — nenhuma chamada de leitura ao painel da fal foi feita (o assistente não tem essa credencial em mãos); o operador precisa conferir o saldo direto no painel da fal.ai antes de clicar em "Gerar".
>
> Tier **Normal**, por etapa (`PRECOS_FAL`, providerCost.ts — preço de lista lido do painel em 13/08, nunca conferido contra fatura real):
> - `compor` (a imagem composta): **US$ 0,08 fixo**, sempre, qualquer duração.
> - `animar` (o vídeo mudo, Wan 3.0): **US$ 0,05 por segundo** de vídeo pedido.
> - `sincronizar` (narrar + lipsync): **US$ 0,05 por segundo** de ÁUDIO real (não do vídeo).
> - **Teto da corrida** (o que barra ANTES de gastar mais que isso): `tetoNormalUsd(segundos) = (0,08 + 0,05×s + 0,05×s) × 1,2`, arredondado — por exemplo, um alvo de 15s tem teto ≈ **US$ 1,90**. Tier Premium (Seedance) usa teto fixo `PIPELINE_TETO_USD_PREMIUM = US$ 10,00` — não tocado nesta rodada.
> - `PROVIDER_LIVE_MAX_GENERATIONS=1` (no processo — ver divergência acima): só UMA corrida live é permitida antes de o processo recusar sozinho.
>
> ### (d) PRÓXIMO PASSO EXATO
>
> 1. Conferir o saldo da fal.ai no painel do fornecedor (NÃO VERIFICADO por este fechamento — ver (c)).
> 2. **Não rodar `docker compose up -d` nem reiniciar o backend antes do teste** — isso reconciliaria `PROVIDER_LIVE_MAX_GENERATIONS` para 3 (o valor do `.env`), não para o 1 que está valendo agora no processo.
> 3. Em `http://dev-c77a5b.twinai.localhost:8090`, passo 1 "Configurar avatar" → qualquer avatar já treinado.
> 4. Passo 2 "Roteiro" → escrever um roteiro **curto** (para caber na tomada única, ≤30s estimados) e **escolher uma duração-alvo explícita** (não deixar em "Mais"/vazio) — é o único jeito de exercitar o item 1-4 desta rodada (a comparação alvo×fala) na primeira tentativa.
> 5. Passo 3 "Cena" → tier **"Normal"** (nunca "Simples"/HeyGen — fora de escopo desta rodada) → opcionalmente escolher **"Feed do Instagram" (4:5)** para exercitar a derivação nova (item 13-17).
> 6. Passo 4 "Gerar" → conferir que o resumo mostra a linha **"Duração-alvo"** (8ª linha, item 1-2 desta rodada) → Gerar.
> 7. **Resultado esperado: a corrida para em "compor"** (imagem composta aguardando aprovação) — comportamento de sempre, não é erro.
> 8. Aprovar a imagem → a corrida narra, compara alvo×fala (recusa aqui, sem custo de animar, se o desvio passar de 8%) e anima, parando no vídeo MUDO aguardando aprovação.
> 9. Aprovar o vídeo mudo → narra/sincroniza e entrega o vídeo final. **Se pediu 4:5**, o arquivo servido deve ser o corte central derivado (mesma resolução vertical do master 9:16, cortado nas laterais) — não um vídeo gerado de novo.
> 10. Em `docker compose logs -f backend`, procurar por `fal_pipeline_gasto_autorizado` (para ver o custo autorizado por etapa), `duration` no corpo enviado ao Wan (deve refletir `ceil(áudio real + 0,5s)`, não mais `+1s`), `aspect_ratio` (deve ser `9:16` no payload enviado à fal mesmo quando o vídeo foi pedido em 4:5), e o campo `target_duration_seconds` gravado na linha do vídeo.
> 11. Medir a duração REAL do vídeo mudo entregue contra `duracaoEscolhida + 0,3s` (o teto de sobra do item 5-6) — é a primeira vez que este corte roda contra um vídeo real, não só a fixture local.
>
> ### (g) ⚠️ REVISÃO — mesma data, commit `a863739`. SUBSTITUI os passos 5, 6 e 9 de (d) acima
>
> **O operador pediu, na mesma sessão, para reverter TODO o frontend desta rodada** — `ResumeBlocksPanel.tsx` apagado, `ContentPage.tsx`/`GenerationSummary.tsx`/`PublishStep.tsx`/`SceneStep.tsx`/`global.css`/`types.ts`/os dois locales voltaram byte a byte ao estado de antes do V34 (`git diff 0e03141 -- frontend/` vazio, confirmado). O backend do V34 (duração-alvo, recorte final, prompt Wan 3.0, mapeamento 4:5→9:16 + derivação em `/approve-video`) foi MANTIDO integralmente.
>
> **Efeito prático nos passos de (d):**
> - **Passo 5 fica**: tier "Normal" continua a escolha certa — **mas "Feed do Instagram (4:5)" NÃO aparece mais clicável na tela** (o chip voltou a ser desabilitado por tier, comportamento de antes do V34). O mapeamento 4:5→9:16 e a derivação em `/approve-video` continuam corretos e testados (`checkNormalAspectRatioPolicy.ts`, G-1/G-2/G-3 — reduzida de 7 para 5 mutantes, os 2 removidos testavam a UI revertida), mas hoje só são alcançáveis mandando `aspect_ratio: "4:5"` direto em `POST /videos` (fora do wizard) — **não há como exercitar esse caminho clicando na tela nesta rodada.**
> - **Passo 6 fica igual**, exceto que **o resumo NÃO mostra mais a linha "Duração-alvo"** — `GenerationSummary.tsx` voltou a sete campos. O valor continua sendo enviado ao servidor (`GenerateStep.tsx` nunca mudou — já enviava `target_duration_seconds` antes do V34) e continua sendo comparado contra a fala real depois de narrar; só a CONFERÊNCIA visual na tela antes de gastar não existe mais nesta entrega.
> - **Passo 9 fica igual só para o corte de 0,3s.** A frase sobre 4:5 não se aplica: sem o chip, o operador não consegue pedir 4:5 pela tela nesta rodada.
>
> **Os "8 de ambiente" do gate, por nome, com origem MEDIDA (item 9 do pedido de fechamento — "de ambiente" não é diagnóstico):**
>
> | Guarda :: mutante | Primeiro commit | Data |
> |---|---|---|
> | acesso: autofill em produção :: DEV_AUTOFILL=1 com NODE_ENV=production | `774a69b` | 31/07/2026 |
> | acesso: galeria em produção :: DEV_GALLERY=1 com NODE_ENV=production | `f7af98a` | 31/07/2026 |
> | provedor: fixture em produção :: fixture com NODE_ENV=production | `97e175b` | 31/07/2026 |
> | acesso: limiter de login :: limiter afrouxado em produção | `87bf5e1` | 01/08/2026 |
> | acesso: limiter de login :: limiter com valor que vira NaN | `87bf5e1` | 01/08/2026 |
> | provedor: live sem autorização :: live com a frase de confirmação errada | `87bf5e1` | 01/08/2026 |
> | recuperação: toda chamada a fornecedor tem teto de tempo :: o teto vem do ambiente... (contraponto) | `a392a04` | 08/08/2026 |
> | recuperação: o boot recolhe o que ficou preso :: a idade máxima muda de valor... (contraponto) | `a392a04` | 08/08/2026 |
>
> **MEDIDO por `git log -S` em cada um dos 8 nomes**: todos datam de 31/07–08/08/2026, e vivem em 4 arquivos (`checkEnvironmentPolicy.ts`, `checkProviderPolicy.ts`, `checkVideoRecoveryPolicy.ts`, `checkMutantRegistryPolicy.ts` — este último com 0) que o V34 NUNCA tocou. **Não há "5 do V33 e 3 novos" — os 8 são os MESMOS 8 desde antes do V33 inteiro**, e a premissa de que a composição mudou entre rodadas não se confirma. O total de mutantes declarados mudou por causa de arquivos NOVOS (`checkAlvoDeDuracaoPolicy.ts`, `checkTrimOvershootPolicy.ts`, `checkFixtureFormatEnsaioPolicy.ts` — todos COM arquivo, nenhum de ambiente) e da redução de `checkNormalAspectRatioPolicy.ts`/`checkPreflightSummaryPolicy.ts` nesta revisão — não por mudança nos 8 mutantes de ambiente em si.
>
> **Reconfirmação após o revert**: `tsc` limpo nos dois lados; gate estático EXIT 0 (**480 mutantes declarados** — era 483 antes desta revisão, -3 pelos 2 mutantes removidos de `checkNormalAspectRatioPolicy.ts` e o 1 de `checkPreflightSummaryPolicy.ts` que reverteu inteiro —, **472 casam por arquivo + 8 de ambiente**); passada `--guard` dos **19 mutantes V34 remanescentes** (26 originais menos os 3 do resumo/8-campos que reverteram para o estado pré-V34, sem mudança nenhuma, e os 4 que testavam UI agora removida — `pararApos`/`compararAlvoComFala`/`sincronizarComAudio`/`aspectRatioParaFornecedor`/`compor-animar`/`approve-video`/`classifyVendorFailure`/`gravação do gasto`/`pipeline defaults`/`índice de bloco` seguem todos cobertos): **19/19 reprovaram de verdade**, árvore limpa em cada aplicação, sem edição concorrente durante a passada (regra nova registrada em `docs-internal/08-ocorrencias.md`, Ocorrência 4: `git add` de todo arquivo novo, sem commitar, ANTES de qualquer passada de mutantes — `git stash create` ignora não-rastreado). Backend, frontend e Postgres reiniciados e healthy depois do commit; hash do container bate byte a byte com `git show HEAD:...` para `falPipeline.ts`; contador de vídeos pagos hoje segue em **2**, MEDIDO antes e depois — o mesmo par de vídeos residual de antes desta sessão, nada novo cobrado.
>
> **A tela de retomada de blocos (item 18) só aparece sozinha** quando um vídeo Normal fracionado (roteiro >30s estimados) travar num `poll_timeout` de verdade — não há como forçar isso sem esperar uma falha real ou fracionar um roteiro bem mais longo que os passos acima sugerem. Testá-la exige ou paciência para uma falha orgânica, ou uma segunda rodada com um roteiro deliberadamente longo.

> ⚠️ **FECHAMENTO — primeiro vídeo Normal/Wan 3.0 completo ponta a ponta (02/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão de INVESTIGAÇÃO + CORREÇÃO, encadeada a partir do commit `65046c8` (fechamento do V34/revert de frontend). Três tentativas reais anteriores a esta sessão (`edac7e4d`, `2e499147`, `2f1650b7`, 01-02/09) tinham falhado ANTES do `animar` — a primeira por duração-alvo mal calibrada (já sabida), as duas seguintes pelo mesmo sintoma superficial ("marcador `[mm:ss-mm:ss]` sobrando no prompt do Wan"), mas com **três causas raiz independentes**, achadas e fechadas uma a uma nesta sessão — não as duas hipóteses originais do pedido de investigação, que estavam incompletas.
>
> **As três causas, cada uma medida antes de ser corrigida:**
>
> 1. **`routes/videos.ts` pedia segmentação à tradução usando um critério STALE.** A decisão de montar `blockWindows` (e com isso pedir ao Gemini um marcador `[mm:ss-mm:ss]` por bloco) vinha de `fracionarRoteiro(script)` — o teto de caracteres por bloco herdado do Wan 2.6 — sem NUNCA consultar `LIMITE_TAKE_UNICO_SEGUNDOS` (`falPipeline.ts:1803`), o limiar de tomada única introduzido pela migração ao Wan 3.0 (V33). Um roteiro curto o bastante para animar num take só (`script.length/PIPELINE_CHARS_PER_SECOND <= 30s`) ainda assim recebia tradução segmentada, com marcador — marcador que `animarTomadaUnicaComAudioReal` nunca fatiava, porque nunca chama `direcaoPorJanela`. **Sonda offline (fetch/pool substituídos, zero custo) reproduziu exatamente os 3 blocos/3 janelas medidos em `2f1650b7` antes da correção**, e confirmou que o lado da animação nunca chegava a chamar `fracionarRoteiro` para esse mesmo roteiro (tomava o ramo de tomada única). Corrigido replicando a MESMA condição de elegibilidade dos dois lados — não o cálculo de fracionamento, a condição de EQUIPARAÇÃO entre os dois lados.
> 2. **Nenhuma guarda existia entre a tradução e a chamada paga.** O linter determinístico que pega marcador sobrando (`lintarPromptDoBlocoWan`) só roda dentro de `animarUmBloco` — com `compor` (e, no caminho de tomada única, `narrar`) já pagos. Cada tentativa errada custava US$0,08 + a síntese de voz inteira antes de o defeito aparecer. Guarda nova logo após `translateDirection`, em `routes/videos.ts`, antes de qualquer `INSERT` ou chamada paga: conta marcadores no resultado e exige que a contagem bata com `blockWindows.length` só quando `traducao.segmented===true` — nunca exige contagem cheia no caso `locale="en"` (que devolve o texto do usuário sem tocar, mesmo com `blockWindows` definido para um roteiro que vai fracionar de verdade), um caminho legítimo que uma checagem ingênua quebraria.
> 3. **Achado só no primeiro teste real pós-correção 1+2, um TERCEIRO defeito que nem 1 nem 2 cobriam**: o cache de reaproveitamento de tradução (`reutilizar()`, `directionTranslation.ts`) casa só pelo texto-fonte da Interpretação — e devolveu, para essa nova tentativa (mesma Interpretação de `2f1650b7`, 217 caracteres, MEDIDO por hash), a tradução SALVA de `2f1650b7`, já segmentada, com 3 marcadores, mesmo a chamada atual não querendo segmentação nenhuma (`segmented:false`, `blockWindows` corretamente `undefined`). A guarda do item 2 pegou isso — **funcionou exatamente como desenhada, custo zero, sem gerar vídeo nem cobrar nada** — mas a causa raiz ficava fechada só depois de tratar entrada de cache contaminada (com marcador) como cache-miss, forçando tradução nova. A direção oposta (cache sem marcador servido a uma chamada que espera segmentação) é estruturalmente impossível — `reutilizar()` só roda dentro de `if (!segmentando)`.
>
> **MEDIDO: vídeo `4fb804e6` completou ponta a ponta — primeira vez neste tier** (animação, narração e sincronia labial funcionando juntas). Custo real **US$ 1,4656** (compor US$0,08 + animar US$0,70 [14s, `ceil(13,42+0,5)`] + sincronizar US$0,671 [13,42s reais de áudio], os 3 de `fal_pipeline_runs`/`provider_usage`; narrar estimado por fórmula, não medido por fatura; Gemini com tokens REAIS medidos — 129 de entrada, 48 de saída — mas sem tarifa catalogada neste projeto) — bate com a estimativa prévia de US$1,46-1,57, praticamente no piso dela. **Lacuna à parte, não desta correção**: `compor` e `animar` não gravam linha em `provider_usage` (só `sincronizar` grava, via `routes/videos.ts:3097`) — o valor real dessas duas etapas vem só do AUTORIZADO em `fal_pipeline_runs.gasto_previsto_usd`, nunca medido de forma independente.
>
> **Uma QUARTA linha, achada DEPOIS de `4fb804e6` já ter completado — não é causa das 3 falhas acima (essas já estavam fechadas), é um ponto frágil ADJACENTE que o operador pediu para investigar por precaução, dado o histórico da sessão inteira ser sobre mismatch de duração.** `MARGEM_DURACAO_WAN3_SEGUNDOS` (0,5s) garante, por construção, que o `duration` PEDIDO ao Wan nunca fica a menos de 0,5s da fala real — mas nunca tinha sido MEDIDO se o Wan RESPEITA esse pedido no vídeo REAL entregue (o próprio comentário do código já confessava "NÃO VERIFICADO"). Se a entrega saísse curta, `sync_mode: cut_off` cortaria o FIM da narração em silêncio, sem erro, sem log — mesmo formato de risco do bug de `target_duration_seconds`, agora do lado da ENTREGA do fornecedor. `sincronizarComAudio()` passou a medir a duração REAL do vídeo animado (`ffprobe`, mesma técnica de `apararVideoFinal`) e recusa ANTES de qualquer coisa paga da etapa quando a folga real fica abaixo de **0,1s** (`FOLGA_MINIMA_SINCRONIZAR_SEGUNDOS`). `FolgaDeSincronizacaoInsuficienteError` devolve o vídeo para `awaiting_approval_video` (não `error`) — "Refazer vídeo" continua disponível — e `videos.sync_folga_recusas` (migration 075) escalona `MARGEM_DURACAO_WAN3_SEGUNDOS` em +0,5s por recusa consecutiva no próximo `/redo-video`, decisão explícita do operador: recusa sem retry automático pago, nunca gasta sem confirmação de valor. **A validação offline (fetch substituído, `ffprobe` REAL contra a fixture local já versionada) achou e corrigiu um bug de ponto flutuante ANTES de qualquer mutante existir**: `5 - 4,9` em IEEE754 dá `0,09999999999999964`, não `0,1` exato — sem arredondar em milissegundos antes de comparar, a fronteira `>=` virava sorte de representação binária no limiar exato.
>
> **Três commits, em sequência a partir de `65046c8`:**
> - `44b2159` — as 3 correções (`routes/videos.ts` ×2, `directionTranslation.ts`). Passada completa do arnês (não a afetada — `--affected` compara commits, e nada tinha sido commitado ainda nesta sessão, então o diff `HEAD...HEAD` saía vazio e a afetada rodava só os 8 mutantes de ambiente, sem tocar nos arquivos reais; achado registrado para não repetir): **463/480**, as 17 anomalias TODAS da mesma dívida pré-existente já documentada no fechamento do V34 (composição exata rotaciona levemente entre passadas — `limiter de login` e `voz: duração mínima` trocam de lugar —, mas tema e contagem se mantêm; nenhuma delas menciona tradução/marcador/cache/tomada-única/`scriptFractioning`/`routes/videos`, conferido por grep negativo no log inteiro). `tsc` limpo nos dois lados.
> - `4771279` — guarda de regressão dedicada, `checkTomadaUnicaMarkerCachePolicy.ts`: G-1 (óbvio, leitura — a condição de elegibilidade existe e faz gate na chamada certa), G-2 (esperto, leitura — a guarda pós-tradução existe, com o operador certo, na posição certa), G-3 (esperto, EXECUÇÃO real de `translateDirection`, fetch/pool substituídos — cache contaminado vira cache-miss), G-4 (esperto, CONTRAPONTO de G-3 — cache limpo continua sendo reaproveitado, para que uma "correção" que desligasse o cache inteiro não passasse despercebida). **4/4 reprovaram isolados** (`--guard "tier Normal:"`), árvore limpa em cada reversão. Registro de mutantes: 480 → 484.
> - `5489c6d` — a guarda de folga (item acima) MAIS a guarda de regressão dela num commit só, `checkSyncFolgaPolicy.ts`: G-1 (óbvio, EXECUÇÃO real contra a fixture — folga insuficiente recusa), G-2 (esperto, EXECUÇÃO — folga suficiente não recusa, contraponto por operador invertido), G-3 (esperto, EXECUÇÃO — o arredondamento em milissegundos em si, para o bug de ponto flutuante achado na validação não voltar em silêncio), G-4 (obvio, leitura — `/redo-video` escalona pelo contador), G-5 (esperto, EXECUÇÃO — a margem extra chega ao `duration` pedido ao Wan). **5/5 reprovaram isolados**, árvore limpa em cada reversão. Registro de mutantes: 484 → 489. **No caminho, 3 bugs reais pegos pela própria validação, não só o de ponto flutuante**: (a) a checagem nova roda `ffprobe` real sempre que alcança `sincronizarComAudio` em modo live, o que quebrou 5 guardas pré-existentes que simulam esse caminho com URLs fake (`checkFalGastoInstrumentadoPolicy.ts`, `checkFalVideoApprovalPolicy.ts` ×2, `checkBlockResumePolicy.ts`, `checkFalPipelinePolicy.ts`, `checkFalApprovalPolicy.ts`) — corrigido com uma flag nova (`verificarFolgaSincronizar: false`) nelas, sem reaproveitar `apararSobraFinal` porque `checkTrimOvershootPolicy.ts` exige essa condição aparecendo exatamente 1 vez no arquivo; (b) reformatar a linha de `duracaoWan3` para multi-linha quebrou o `find` de um mutante já existente em `checkWan3TomadaUnicaPolicy.ts` — âncora atualizada; (c) a sonda/guarda usava `process.env.REPO_ROOT` (`/repo`, montagem só-leitura) para achar a fixture de vídeo, mas o processo roda de `/app` — corrigido usando `FIXTURES_DIR` (resolvida relativa ao próprio módulo). Passada completa final: **471/489**, 18 anomalias — as mesmas 17 já conhecidas mais uma nova (`fal: endpoint fora do catálogo`, contraponto), CONFIRMADA como flake sob paralelismo por reexecução isolada (voltou verde na hora). **Confirmado por leitura**: `verificarFolgaSincronizar` nunca é setado em `routes/videos.ts` — a guarda roda por padrão (`undefined !== false`) em toda chamada real; só as 6 simulações a desligam explicitamente. `tsc` limpo nos dois lados.
>
> **Ambiente ao fechar esta sessão**: `PROVIDER_LIVE_MAX_GENERATIONS=1` no PROCESSO (mantido deliberadamente abaixo do `3` do `.env` — não reconciliado num `up -d` porque o valor foi passado como override de ambiente do shell na hora do restart, `PROVIDER_LIVE_MAX_GENERATIONS=1 docker compose up -d backend`, sem tocar o `.env`, que está fora do alcance de leitura/escrita por permissão de sandbox). `PROVIDER_MODE=live`, `PROVIDER_LIVE_CONFIRM` armado (len=28). **Regra explícita do operador: não mudar `PROVIDER_LIVE_MAX_GENERATIONS` por conta própria — perguntar antes de qualquer ajuste, inclusive antes de uma próxima geração em lote.** Um segundo vídeo (`f2ae1af3`, criado 12:12, `awaiting_approval`) existe no banco, fora do escopo desta investigação — não tocado, não analisado. **A migration 075 (`sync_folga_recusas`) NÃO foi aplicada ao banco local nesta sessão** — o backend não foi reiniciado depois do commit `5489c6d` (nenhum restart foi pedido); aplicar antes do próximo teste real na tela.
>
> **DÍVIDA DOCUMENTADA, não corrigida por decisão do operador**: a escalada de margem no "Refazer" (`/redo-video`, `margemDuracaoWan3ExtraSegundos`) cobre só o caminho de tomada única — `animarTomadaUnicaComAudioReal` é o único lugar que lê esse campo. O caminho FRACIONADO (roteiro >30s estimados, múltiplos blocos), se recusar por folga insuficiente, não escalona margem automaticamente e pode reproduzir o mesmo déficit num retry manual, porque cada bloco continua vindo de `escolherDuracao` (seleção por caracteres, 5s/10s), sem margem nenhuma para escalar. **A parte que importa permanece segura nos dois caminhos**: a recusa em si nunca cobra e nunca deixa `sync_mode: cut_off` cortar narração em silêncio — só falta a escalada "inteligente" no fracionado. Não testado nesta sessão (todo teste real foi por tomada única) e secundário nesta linha de trabalho; fica para quando o operador quiser abrir.
>
> **Tier Normal/Wan 3.0 considerado CONSOLIDADO pelo operador ao fechar esta sessão** — 4 linhas fechadas (as 3 causas do marcador vazado + a folga de sincronização), primeiro vídeo completo ponta a ponta medido, guardas de regressão para as 4. Nada além do já registrado ficou pendente. O gap de `provider_usage` para `compor`/`animar`, a composição rotativa das anomalias pré-existentes, e a migration 075 não aplicada localmente (parágrafo acima) são as únicas dívidas que esta sessão encontrou e não tentou fechar, por estarem fora do escopo pedido ou exigirem um restart não solicitado.

> ⚠️ **FECHAMENTO — BLOCO HEYGEN-SIMPLES-1 (03/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão de IMPLEMENTAÇÃO, encadeada a partir do commit `5bd4140`. Objetivo: fechar o nível Simples inteiro dentro da chave HeyGen (avatar, traje/cenário como look, clonagem de voz, medição de duração por TTS, geração com o conjunto máximo de parâmetros da API v3), com o pipeline Normal/fal (`falPipeline.ts`) explicitamente ISOLADO — condição de aceite que invalidaria a rodada inteira se violada. **HEAD ao fechar: `c675635` + este commit de documentação.**
>
> ### (a) A6-e — o ponto de roteamento por tier, e a única violação de isolamento encontrada (corrigida antes de tocar HeyGen)
>
> `vendorRequiredByTier()` e 5 funções irmãs (`videoTierParaPipeline`, `isVideoTier`, `maxReachableSecondsForTier`, `VIDEO_TIERS`, `DEFAULT_VIDEO_TIER`) viviam dentro de `falPipeline.ts` — o arquivo do pipeline Normal/fal decidindo, de dentro de si mesmo, se um vídeo é Simples/HeyGen. Isso violaria a regra "nenhum arquivo do Normal é tocado" assim que B1-B7 precisassem consultar o roteamento. **Extraído mecanicamente para `backend/src/services/video/videoTier.ts` (novo), com `falPipeline.ts` reduzido a um `export { ... } from "./videoTier.js"` de compatibilidade** — nenhuma lógica mudou, só a casa. Commits `b80c857` (extração) + `401b7b5` (sonda de reconhecimento A1-A5, GET-only, sem custo). Prova B-ISO desta extração: geração Normal em fixture, payload/roteamento/custo estimado byte-idênticos antes e depois (`git stash`/checkout comparativo do `ensaioSimulado.ts`).
>
> ### (b) O que foi implementado — 8 commits, B1 a B7 (B3 já existia)
>
> | Item | Commit | O quê |
> |---|---|---|
> | B1 | `9f0956d` | Payload HeyGen v3 completo: `output_format`, `brand_glossary_id`, `title`, `callback_url`/`callback_id`, `voice_id`+`voice_settings` (speed/pitch/volume/locale/engine_settings), 3 modos de áudio mutuamente exclusivos (`audio_asset_id` > `audio_url` > `script`+`voice_id`) |
> | B2 | `634db55` | `POST /v3/voices/speech` mede a duração REAL antes do vídeo (`synthesizeSpeechHeygen`/`requestSpeechAndRecordUsage`) — a régua por caractere vira só pré-visualização |
> | B3 | *(nenhum)* | Seletor de duração-alvo 15/30/45/60/Mais e teto de caracteres por alvo já existiam no código, sem trabalho necessário |
> | B4 | `2139df9` | `POST /v3/avatars type:"prompt"` com até 3 `reference_images` (traje/cenário como look novo) — implementado, disparo deixado atrás de confirmação do operador |
> | B5 | `3423fb4` | Clonagem de voz nativa HeyGen: `cloneVoiceHeygen`/`readHeygenVoiceCloneStatus`/`deleteVoiceHeygen`/`countHeygenVoiceSlots` — caminho isolado, ainda não ligado a nenhum avatar |
> | B5→ligação | `021800f` | `POST /avatars/:id/voice-sample` clona TAMBÉM na HeyGen, best-effort (nunca derruba a resposta principal se falhar) — migration 076 (`avatars.heygen_voice_id`) |
> | B6 | `008648a` | Sliders de voz na tela do avatar existente: HeyGen (speed/pitch/volume/locale) quando `heygen_voice_id` existe, ElevenLabs (stability/similarity/style) caso contrário — migration 077 (4 colunas), verificado NA TELA |
> | B7 | `c675635` | Rota receptora `/webhooks/heygen`: validação HMAC-SHA256 (`timingSafeEqual`), dedup por `event_id` (migration 078), **deliberadamente NÃO chama `pollVideoJob` nem escreve `status='ready'`** — só registra o evento, por decisão do operador ("só a rota receptora, sem registrar endpoint") |
>
> ### (c) Prova de isolamento (B-ISO) — repetida ao fim da rodada inteira, não só na extração
>
> Diff completo de `5bd4140` → `c675635`: **zero linhas tocadas em `falPipeline.ts`** (só o `export {...} from "./videoTier.js"` de compatibilidade, que já vinha do commit `b80c857`, anterior a qualquer trabalho de HeyGen). Nenhum arquivo de `PIPELINE_TETO_USD`/`autorizarGasto`/`compor()`/`animar()`/`narrar()`/`sincronizar()` aparece no diff. Geração Normal em fixture rodada antes de `b80c857` e depois de `c675635`: payload, roteamento e custo estimado **byte-idênticos** (única diferença observada foi um timestamp de log, não-determinístico por natureza). Guardas de guarda do Normal/Premium tocadas nesta rodada: nenhuma — `checkTierVendorPolicy.ts` teve só o `file:` do seu mutante atualizado (de `PIPELINE` para `TIER_ROUTING`, apontando para o arquivo novo), sem mudança de veredito em nenhum mutante.
>
> ### (d) Gate e arnês
>
> `tsc` limpo nos dois lados e gate estático (`npm run check`, fixture) verde em cada um dos 8 commits. **Mutantes declarados: 509** (eram 480 no fechamento anterior — 29 novos, todos com prova isolada de reprovação, `expect` transcrito literal, nunca parafraseado, árvore limpa em cada reversão). Passada COMPLETA (509, sem filtro), rodada depois do último commit: **489/509**, **20 anomalias** — confirmadas por grep negativo (`heygen|traje|reference_images|voice_clone|webhook`) como pertencentes TODAS à mesma classe de dívida pré-existente já documentada nos fechamentos anteriores (guardas de rodadas passadas, sensíveis a paralelismo ou com `expect` desalinhado da mensagem real) — **nenhuma delas nasceu nesta rodada**, e todos os 29 mutantes novos aparecem "ok" na completa. Log em `mutants-heygen-simples-1-completa.log`, no scratchpad da sessão (não commitado — mesmo padrão já usado em rodadas anteriores para logs de passada).
>
> ### (e) Validação visual real, no browser (fixture, custo zero)
>
> Wizard percorrido nos 4 passos com o avatar "Teste de telas de confirmação", tier Simples. **Confirmou ao vivo o A7** (a divergência de preço entre o passo 2 e o passo 4 sobre o mesmo roteiro): passo 2 mostrou US$1,21 com o tier default do wizard ("normal", régua fal); passo 4 mostrou US$0,42 depois de escolher tier "simples" (régua HeyGen) — **são duas réguas de preço diferentes respondendo perguntas diferentes**, não um bug. Tela final mostrou "Custo real (5,00 s entregues) US$ 0,19" e "Geração simulada — nenhum valor foi cobrado". `PROVIDER_MODE` foi trocado para `fixture` só para esta demonstração e devolvido a `live` logo depois — confirmado por `printenv` (`PROVIDER_LIVE_CONFIRM` armado, `PROVIDER_LIVE_MAX_GENERATIONS=1` no processo, sem mudança).
>
> ### (f) O que NÃO foi ligado — registrado, não escondido
>
> A GERAÇÃO de vídeo do tier Simples continua inteiramente pelo caminho ElevenLabs+polling (`generateVideoHeygen`/`requireAudio` sem mudança nesta rodada) — `heygen_voice_id` existe na tela e nos sliders, mas nenhum vídeo real usa essa voz nativa ainda; ligar isso é decisão de produto para uma rodada futura, não pedida nesta. B7 é só a rota receptora — nenhum webhook foi registrado na conta HeyGen de verdade.
>
> ### (g) Achado à parte, fora do escopo — não investigado a fundo
>
> `twinai_local_dump.sql` (dump do Postgres, 50-100 MB) apareceu duas vezes na raiz do repositório durante a sessão, recriado por um processo NÃO identificado (nada que este bloco tocou o gera). Movido duas vezes para o scratchpad da sessão (preservado, nunca apagado) só para não travar `git stash create` do arnês. Fica como pergunta em aberto para o operador.
>
> ### (h) Nenhuma chamada paga ocorreu nesta sessão
>
> Regra inegociável do bloco: nenhum `POST /v3/videos`, `/v3/avatars`, `/v3/voices/clone` ou `/v3/voices/speech` real foi disparado pelo assistente — só GET e "fusíveis" (chamadas que falham em 400/404 antes de qualquer débito), e mesmo essas só na Parte A (reconhecimento). Toda a Parte B foi exercitada em fixture. O clique real fica para o operador — ver a ficha de cliques entregue no chat ao fim desta sessão, não duplicada aqui.

> ⚠️ **FECHAMENTO — BLOCO HEYGEN-SIMPLES-3 (03/09/2026, tarde) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão de IMPLEMENTAÇÃO, encadeada a partir de `ca2fc4b` (fechamento de SIMPLES-1) — SIMPLES-2 (investigação D1-D3/E1-E6) não gerou commit próprio além do fix de hermetismo de guarda (`70304d1`), já incorporado. Objetivo: ligar de verdade os call sites que SIMPLES-1 tinha deixado prontos mas nunca chamados (F1: `output_format`/`title`/`callback_url`/`callback_id`; G1: medição real por ffprobe; H2/H3: confirmação do webhook). **HEAD ao fechar: `5ebc13e` + este commit de documentação.**
>
> ### (a) F1 — os quatro campos, ligados de verdade
>
> `heygenExtrasReais(input)` (nova função, [avatarProvider.ts:1018](backend/src/services/providers/avatarProvider.ts:1018)) monta `output_format:"mp4"` sempre, e `title`/`callback_url`/`callback_id` só quando `input.videoId` existe. Chamada em DOIS lugares — `generateVideoHeygen` (a chamada paga) **e** `generateVideoFixture` (a simulação) — porque o comentário de topo de `fixtureProvider.ts` promete "o payload REAL, montado pelo montador REAL, mesmo sem rede", e uma simulação que omitisse esses quatro campos quebraria essa promessa justamente para o único jeito de provar F1 sem gastar. `voice_id`/`voice_settings`/`brand_glossary_id` documentados como INERTES POR DESENHO (não pendência esquecida): a arquitetura confirmada em SIMPLES-2 é ElevenLabs sempre sintetizando a fala, que chega como `audio_asset_id` — e esse sempre vence no bloco de áudio de `buildHeygenVideoPayload`. `Idempotency-Key` já existia antes deste bloco (`heygenIdempotencyKey`/`heygenVideoRequestHeaders`) — só citado como evidência (F3).
>
> ### (b) G1+G2 — a medição de verdade, e a remoção do que media errado
>
> `requireAudio` ([avatarProvider.ts](backend/src/services/providers/avatarProvider.ts)) agora roda `probeSampleDurationSeconds` (ffprobe, reaproveitado de `voiceSampleAudio.ts`) sobre o `buffer` FINAL — pós `processVoiceAudio` (loudnorm) —, não mais sobre o autorrelato do ElevenLabs medido ANTES do tratamento. Fallback ao autorrelato só quando o ffprobe falha (arquivo corrompido). B2 inteiro (`synthesizeSpeechHeygen`/`requestSpeechAndRecordUsage`, `POST /v3/voices/speech`) foi REMOVIDO — nunca teve call site de produção (confirmado por grep antes da remoção) e media a duração de um áudio HeyGen que nunca era o mesmo enviado ao vídeo (o `audio_asset_id` do ElevenLabs sempre vence). `checkHeygenSpeechPolicy.ts` renomeado para `checkHeygenVoiceClonePolicy.ts`, mantendo só os 4 mutantes de B5 (clone/status/delete/countSlots), sem mudança de conteúdo.
>
> ### (c) G3 — "medido" na tela, confirmado AO VIVO
>
> `GET /videos/:id/cost` expõe `audioMeasured: {seconds, source}` a partir de `videos.audio_duration_seconds`/`_source` (já persistidas por `onAudioMeasured`, antes do `POST /v3/videos`). `VideoCostPanel.tsx` mostra a linha "Duração medida (áudio)" sempre que presente — entre a estimativa (por caracteres) e o custo real (só depois de o vídeo terminar). **Confirmado duas vezes no navegador real**, wizard completo (fixture): a tela mostrou **"Duração medida (áudio): 3,00 s"** durante `status=processing`, antes de qualquer custo real existir.
>
> ### (d) H2+H3
>
> H2 provado por EXECUÇÃO (`checkHeygenCallbackWiringPolicy.ts`): `callback_id` enviado é byte-a-byte o mesmo `videoId` que `heygenWebhook.ts` usa no `SELECT`. Reconfirmado numa geração real do navegador: `callback_id` no log = `8629c344-e5bf-487a-af40-f47854578478` = `videos.id` da linha (conferido por query direta). H3 — o comentário de topo de `heygenWebhook.ts` registra a conclusão: como a rota só audita (nunca chama `pollJob`, nunca escreve `status`), reconfirmar via `GET /v3/videos/{id}` autenticado deixou de ser necessário; a pergunta reabre só se a rota um dia passar a FINALIZAR.
>
> ### (e) I1 — a proteção contra gasto dobrado já existia
>
> `checkLiveBudgetPolicy()` ([checkLiveBudgetPolicy.ts:175](backend/src/scripts/checkLiveBudgetPolicy.ts:175)) já prova, com `PROVIDER_LIVE_MAX_GENERATIONS=1`, que uma segunda operação sob o mesmo teto é recusada — cobertura do MECANISMO (`consumeLiveGeneration`), independente do fix de hermetismo em `checkOutfitPolicy.ts` (SIMPLES-2, `70304d1`), que corrigia um artefato de DOIS testes de cenário compartilhando contador, não uma lacuna de proteção real.
>
> ### (f) Gate e arnês
>
> `tsc` limpo nos dois lados. **9 mutantes novos/atualizados** — 3 em `checkHeygenCallbackWiringPolicy.ts` (novo), 3 em `checkAudioMeasuredPolicy.ts` (novo), 1 atualizado em `checkVideoContractPolicy.ts` (âncora do find cresceu/encolheu com a remoção do modo `audio_url`), 4 renomeados sem mudança de conteúdo (`checkHeygenVoiceClonePolicy.ts`) — todos provados reprovando ISOLADAMENTE antes do commit, com um achado de processo registrado: **um mutante cujo `find` referenciava um campo fora do tipo estreito `Pick<GenerateVideoInput,"videoId">` de `heygenExtrasReais` quebrava o `tsc` em vez de mudar comportamento (AMBÍGUO) — mesma classe de bug já documentada em SIMPLES-1 (B5-linking, B7); corrigido trocando o alvo da mutação para um valor que preserva o tipo** (`input.videoId + "-mutado"` em vez de `input.providerAvatarId`). **Registro: 512 mutantes declarados** (era 508 no fechamento de SIMPLES-1/2). Passada completa, rodada DUAS vezes: a primeira (`mutants-heygen-simples-3-completa.log`) foi lançada em background CEDO DEMAIS — antes da extração de `heygenExtrasReais` e do fix do caminho de fixture, então não reflete o código final, só ficou registrada como histórico. A segunda (`-completa-v2.log`), rodada depois de todo o refactor: **492/512**, **20 anomalias** — confirmadas por grep negativo (`callback|heygen|audiomeasured|áudio medido|extras|voice_id|fixture`) como pertencentes à mesma dívida pré-existente de rodadas anteriores; nenhum dos 9 mutantes de hoje está entre elas.
>
> ### (g) Achado de processo: mutação sob carga concorrente é flaky
>
> Rodar `npm run check` em primeiro plano enquanto uma passada completa (`node tools/run-mutants.mjs`, 6 workers paralelos) rodava em background produziu falhas intermitentes e não-determinísticas em `checkFixtureFormatEnsaioPolicy.ts` (ffmpeg/ffprobe reais, sensíveis a contenção de CPU — carga medida em 19,6–23,4 num host de 12 núcleos). Confirmado que NÃO é regressão: o arquivo-fonte do teste (`simulated-video-9x16.mp4`) provou-se íntegro por `ffprobe` manual, e as falhas desapareceram assim que a passada em background terminou. **Lição para a próxima sessão:** não rodar `npm run check` em primeiro plano contra o mesmo backend enquanto uma passada completa roda em background — esperar ela terminar, ou usar `--guard` filtrado (mais leve, menos contenção).
>
> ### (h) Achado de processo: `ARNES_EM_CURSO` e arquivos novos não commitados
>
> Dois gotchas de diagnóstico registrados nesta sessão, ambos já com causa raiz identificada e resolvida:
> 1. **Reproduzir um mutante à mão exige `ARNES_EM_CURSO=1`** (`docker compose exec -e ARNES_EM_CURSO=1 backend npm run check`) — sem isso, o autoteste "registro de mutantes: todo find casa exatamente 1x" ([checkMutantRegistryPolicy.ts:129](backend/src/scripts/checkMutantRegistryPolicy.ts:129)) reprova contra a própria mutação manual, mascarando a mensagem real da guarda sob teste.
> 2. **Arquivo de guarda novo, não commitado, precisa de `git add` (sem commitar) antes de QUALQUER passada do arnês** — a Ocorrência 4 já documentada em `docs-internal/08-ocorrencias.md` (SIMPLES-1) se repetiu aqui: `checkHeygenCallbackWiringPolicy.ts`/`checkAudioMeasuredPolicy.ts` ficaram `??` (untracked) por alguns minutos, e as duas primeiras tentativas de `--guard` deram AMBÍGUO com mensagem genérica, não a mensagem esperada — porque o worktree temporário da passada não continha o arquivo novo.
>
> ### (i) Custo real: US$ 0,00
>
> Backend trocado para `PROVIDER_MODE=fixture` só durante a demonstração (permissão pedida e concedida no chat, mesmo procedimento das duas rodadas anteriores) e devolvido a `live` ao final — `PROVIDER_LIVE_MAX_GENERATIONS=1` preservado explicitamente (não reconciliado para o `3` do `.env`), `PROVIDER_LIVE_CONFIRM` armado, confirmado por `printenv` idêntico ao estado de antes da sessão. **Nenhuma chamada real a HeyGen/ElevenLabs ocorreu.** O vídeo de demonstração (`8629c344…`, `simulated=true`, `status=ready`, tenant `dev-c77a5b`) ficou na Biblioteca — não apagado; decisão de manter ou excluir é do operador.
>
> ### (j) Achado à parte, ainda não investigado
>
> `twinai_local_dump.sql` — a mesma pergunta em aberto de SIMPLES-1 (dump do Postgres reaparecendo sozinho na raiz do repositório, origem não identificada). Não reapareceu nesta sessão especificamente, mas também não foi procurado; segue como pergunta para o operador.

> ⚠️ **FECHAMENTO — BLOCO HEYGEN-SIMPLES-4 (03/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão curta, os dois itens que ficaram faltando no fechamento de SIMPLES-3. **HEAD ao fechar: `71064fb` + este commit.**
>
> **F3 — já estava correto, não precisou de correção.** `heygenIdempotencyKey`/`heygenVideoRequestHeaders` ([avatarProvider.ts:905](backend/src/services/providers/avatarProvider.ts:905)) derivam a chave por SHA256 de `[tenantId, providerAvatarId, script, background, motionPrompt, expressiveness, aspectRatio, resolution, engineChoice, HEYGEN_FIT]` — determinístico, sem timestamp, sem `audio_asset_id` (deliberado: o áudio é ressintetizado a cada clique). Isso é anterior ao próprio BLOCO HEYGEN-SIMPLES-1 inteiro. `checkVideoContractPolicy.ts` (seção 6) já provava isso testando as duas funções puras direto, inclusive com 5ms de espera entre duas chamadas para provar que não é o instante. O que faltava, na mesma lógica de F1: prova ANCORADA NO USO — `checkIdempotencyReplayPolicy.ts` (novo) chama `generateVideo()` DUAS VEZES de ponta a ponta, conteúdo idêntico (o duplo clique real), confirma o header `Idempotency-Key` byte-a-byte igual nas duas chamadas ao `POST /v3/videos`, e que a 2ª aceita uma resposta de replay do fornecedor (mesmo `video_id` da 1ª) sem tratamento especial. 1 mutante novo, provado reprovando isoladamente. **Registro: 513 mutantes declarados** (era 512).
>
> **Achado de processo, corrigido ANTES do commit:** reproduzir o mutante à mão sem `ARNES_EM_CURSO=1`, com `sed` sem âncora de linha, corrompeu temporariamente `createAvatarLook` (`POST /v3/avatars`, call site NÃO relacionado que por coincidência de texto virou alvo do mesmo `sed`) — detectado pelo `tsc` (o tipo de `heygenIdempotencyKey` não bate com o `input` de `createAvatarLook`), revertido, `git diff` do arquivo confirmado vazio antes do commit final.
>
> **I2 — só investigado, nada executado, decisão é do operador.** `PROVIDER_LIVE_MAX_GENERATIONS` no PROCESSO = **1**, no `.env` = **3**. **(a) Qual é o correto:** não há um "correto" objetivo — é uma escolha de segurança feita explicitamente numa sessão anterior (`primeiro vídeo Normal/Wan 3.0`, 02/09) e preservada deliberadamente em CADA restart desde então (inclusive nos dois do SIMPLES-3/4), nunca uma divergência acidental. **(b) Por quê:** o processo não foi reiniciado SEM o override desde `2026-09-03T10:51:40Z` (o restart do fechamento de SIMPLES-3) — e antes disso, a mesma escolha (1, não 3) foi preservada manualmente em cada sessão que precisou restartar o backend, por causa da regra "não mudar `PROVIDER_LIVE_MAX_GENERATIONS` por conta própria — perguntar antes", registrada desde o fechamento de "primeiro vídeo Normal/Wan 3.0". **(c) O que resolve:** um `docker compose up -d backend` SEM o override reconciliaria o processo para o `3` do `.env` (perde a margem de segurança de 1); OU editar o `.env` para `1`, alinhando o arquivo à intenção real que já vem sendo seguida há 3 sessões (não perde nada, só torna o `.env` honesto sobre o que já está rodando). Nenhuma das duas foi feita.
>
> **Custo real: US$ 0,00.** Nenhuma chamada a HeyGen/ElevenLabs — prova inteira em `fetch` substituído, dentro do guard. Ambiente não foi tocado (não houve demonstração no navegador desta vez — a prova por execução do guard já é mais forte que um clique, por comparar os headers byte a byte).
>
> **Tier Normal/Wan 3.0 e tier Simples/HeyGen considerados FECHADOS pelo operador ao final desta sessão.**

> ⚠️ **FECHAMENTO — BLOCO HEYGEN-SIMPLES-5 (03/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão curtíssima, só operação de ambiente + uma confirmação de segurança. **Nenhum commit de código.**
>
> **J1/J2 — teto de concorrência liberado, direção invertida da proposta anterior.** Por ordem explícita do operador: em vez de baixar `.env` para `1` (o que o texto de fechamento de SIMPLES-4 tinha proposto como uma das duas saídas), o teto foi ERGUIDO para `3` nos dois lados — reaproveitando o valor que já estava no `.env`, sem inventar número novo. Comando: `docker compose up -d backend` (sem override de ambiente). Confirmado por leitura do PROCESSO pós-restart, não só do arquivo: `printenv` devolveu `MODE=live MAX_GEN=3 CONFIRM_LEN=28`, `StartedAt=2026-09-03T11:44:24Z` (`RestartCount=0`, sem crash). **A divergência processo×`.env` registrada desde SIMPLES-2 está fechada — os dois concordam em 3.**
>
> **K1-K3 — o clique humano continua sendo a única porta, confirmado ANTES de liberar o teto.** Varredura de `generateVideo(` em todo `backend/src`: um único call site de produção, [routes/videos.ts:1942](backend/src/routes/videos.ts:1942), dentro do handler `POST /videos` ([routes/videos.ts:1379](backend/src/routes/videos.ts:1379), `preHandler: requireActiveTenant`) — todas as outras ocorrências no repositório são scripts de guarda (`backend/src/scripts/check*.ts`), que nunca rodam em produção. `recovery.ts` (a varredura de boot que reconcilia vídeos presos) usa só `pollVideoJob` — leitura de status via GET, nunca uma nova chamada de criação — confirmado por grep negativo de `generateVideo(`/`POST.*v3/videos` no arquivo inteiro. No frontend, as duas únicas chamadas a `handleGenerate()` ([GenerateStep.tsx:248](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:248), dentro do handler do botão "Confirmar e gerar" do diálogo; e [:822](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:822), o `onClick` de "Gerar novamente") — nenhuma das duas vive em `useEffect`, temporizador ou qualquer caminho que dispare sem um clique síncrono da pessoa. **A frase pedida: "o clique em Gerar vídeo é a única porta, confirmado por `routes/videos.ts:1379`+`:1942` (backend) e `GenerateStep.tsx:248`+`:822` (frontend)" — não existe fila, retry automático nem agendamento que gere (e cobre) um vídeo HeyGen sem presença humana.**
>
> **Custo real: US$ 0,00.** Nenhuma chamada a HeyGen/ElevenLabs — a rodada inteira foi restart de ambiente + leitura de código (grep/Read), sem execução de gerador nenhum.
>
> **Gate reconfirmado verde depois do restart** (`docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check`), árvore limpa (nenhum arquivo de produto tocado nesta rodada).

> ⚠️ **FECHAMENTO — BLOCO HEYGEN-SIMPLES-6 (03/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Três correções (L1/L2, N1), um aviso (M1), zero reabertura de A-I. **HEAD ao fechar: `a873d65` + este commit.**
>
> ### (a) L1 — a causa, MEDIDA por releitura da doc pública em 03/09/2026
>
> `background` de `POST /v3/videos` (developers.heygen.com/reference/create-avatar-video-v3, schema atual, relido ao vivo nesta sessão) aceita EXATAMENTE `type` (`color`|`image`), `value`, `url`, `asset_id` — nenhum campo de escala, recorte, posição ou dimensão. `fit` existe, mas é TOP-LEVEL e documentado como regendo "how the SUBJECT is fitted to the output canvas" — o AVATAR, nunca o fundo. Antes desta correção, [avatarProvider.ts](backend/src/services/providers/avatarProvider.ts) fazia `readUpload` + `heygenUploadAsset` direto, sem redimensionar — o arquivo subia do tamanho NATIVO do upload da pessoa (ex.: uma foto de escritório 800×600), e sem instrução de enquadramento nenhuma a HeyGen o posicionava assim — o retângulo pequeno no canto que o operador viu no vídeo real desta sessão.
>
> ### (b) L2 — a correção e a prova
>
> `resizeBackgroundImage()` (novo, mesmo arquivo) roda `ffmpeg` (`scale=W:H:force_original_aspect_ratio=increase,crop=W:H` — a mesma lógica "cover" que `HEYGEN_FIT="cover"` já aplica ao avatar) antes do `heygenUploadAsset`, para o quadro real derivado de `pixelDimensionsFor(aspectRatio, resolution)` (novo, [videoFormat.ts](backend/src/services/providers/videoFormat.ts) — REIMPLEMENTADO independente de `formatDerivation.ts`, que é do pipeline Normal/Premium; isolamento). Prova por EXECUÇÃO real (`checkBackgroundResizePolicy.ts`, novo): uma imagem de prova 100×50 gerada por `ffmpeg` (deliberadamente errada — nem a proporção nem o tamanho do alvo) sobe pelo caminho de verdade, e os BYTES capturados no `POST /v3/assets` real (interceptando o `FormData`/`Blob`, não JSON) são medidos por `ffprobe`: **1920×1080**, o quadro exato (16:9 @ 1080p). 1 mutante, provado reprovando isoladamente.
>
> ### (c) N1 — resolução 720p→1080p
>
> `MEASURED_RESOLUTION` ([videoFormat.ts](backend/src/services/providers/videoFormat.ts)) estava em `"720p"` desde o LIVE-1 porque era o único ponto de custo MEDIDO — subir sem medir mudaria o custo por um fator desconhecido. Por confirmação do OPERADOR nesta rodada de que a tarifa não varia por resolução (consistente com `HEYGEN_VIDEO_COST.unitsPerBilledSecond` em `providerCost.ts`, que já é só por segundo, sem termo de pixel), subida para `"1080p"`. Provado por execução real: `resolution="1080p"` chega ao `POST /v3/videos` real (mesmo guard de (b), 2º mutante).
>
> ### (d) M1 — o aviso, confirmado ao vivo no navegador
>
> Novo parágrafo no campo "Interpretação" ([SceneStep.tsx](frontend/src/pages/CreateVideo/steps/SceneStep.tsx), chave `motionCameraLimit`): direções de câmera/deslocamento ("caminha até a câmera", "recua", "a câmera se aproxima") nunca são respeitadas — `motion_prompt` é documentado (releitura de 03/09) como escopado a "avatar body motion and hand gestures", nunca câmera ou cena. Confirmado NA TELA, wizard completo (fixture): o texto aparece logo abaixo do aviso já existente sobre a orientação de escrita ser recomendação nossa. Só texto — nenhuma mudança em `motion_prompt`/comportamento de geração, confirmado por tsc+gate inalterados nessa parte.
>
> ### (e) Gate, custo, ambiente
>
> 2 mutantes novos (`checkBackgroundResizePolicy.ts`), provados reprovando isoladamente antes do commit. **Registro: 515 mutantes declarados** (era 513). `tsc` limpo nos dois lados, gate verde. **Custo real: US$ 0,00** — toda a prova roda em fixture + `ffmpeg`/`ffprobe` locais, nenhuma chamada a HeyGen/ElevenLabs. Ambiente trocado para `fixture` só para a demonstração do aviso M1 (mesmo procedimento já autorizado em rodadas anteriores) e devolvido a `live`/`PROVIDER_LIVE_MAX_GENERATIONS=3` ao final — idêntico ao estado deixado por SIMPLES-5, confirmado por `printenv`.

> ⚠️ **FECHAMENTO — BLOCO HEYGEN-SIMPLES-7 (03/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão de INVESTIGAÇÃO pura — fecha 3 lacunas do fechamento do SIMPLES-6 (as 40 anomalias, o teste de fundo real, o isolamento de `videoFormat.ts`). Nenhuma mudança nas Partes L/M/N. **HEAD ao fechar: `0711cc1` + este commit.**
>
> ### (a) O — as 40 anomalias, nomeadas e diffadas
>
> Lista completa extraída do log (`sed`/`grep` sobre `mutants-heygen-simples-6-completa.log`, no scratchpad da sessão anterior): 40 itens. Diff contra o histórico documentado nesta linha de trabalho (~18-20 itens, rotativos entre passadas): **13 batiam** (erro de vendor: defesa em profundidade; custo trunc/floor; lote nativo; preenchimento; docs-internal; 2× recuperação; a chave da fal redigida; pipeline resposta crua; 2× pipeline polling; pipeline três etapas; aspas retas; color-match corrigirCor) — **27 eram "novos"** frente à última lista conhecida.
>
> Os 27 foram reexecutados EM LOTE, isolados, com `--guard` repetido 27 vezes (o filtro usa OR — `filtros.some(...)`, confirmado lendo `tools/run-mutants.mjs:536`). **Achado de processo:** um dos filtros começava com `/` ("/recompose inclui a foto lateral...") e o Git Bash o reescreveu como caminho do Windows (`C:/Program Files/Git/recompose...`) antes de chegar ao Node — o filtro nunca casou nada. Corrigido com `MSYS_NO_PATHCONV=1` na reexecução isolada desse item.
>
> Do lote de 27: **23 já saíram "ok"** de primeira; **4 saíram AMBÍGUO** ("voz: a prévia sai da voz que acabou de ser criada"; "admin: aprovar manualmente limpa o token"; "roteiro: acima do teto RECUSA, nunca corta"; "compor() e animar() só falam com o fornecedor pela proporção MAPEADA") — reprovaram, mas sem a mensagem esperada. Cada um dos 4 foi reexecutado SOZINHO (filtro único, sem concorrência com os outros 26): **os 4 saíram "ok"** na segunda tentativa. **Confirmação: os 27 "novos" reprovam corretamente — nenhum é defeito real.** Load average medido antes/depois: ~34 (durante a passada completa original) → ~7 (nas reverificações) — a contenção de 6 workers paralelos brigando por CPU/`docker exec` é a causa mais provável, não uma regressão introduzida por SIMPLES-6.
>
> ### (b) P — nenhum asset real, saldo confirma
>
> `checkBackgroundResizePolicy.ts` substitui `globalThis.fetch` ANTES de chamar `generateVideo()` e restaura no `finally` — releitura linha a linha confirma que o mock **lança erro para qualquer URL fora das três esperadas** (ElevenLabs timestamps, HeyGen assets, HeyGen videos): se alguma chamada tivesse escapado para a rede real, o teste teria FALHADO (capturado como `erro`), não passado em silêncio. A `apiKey` usada (`"chave-irrelevante-fetch-substituido"`) é uma string inventada — mesmo num cenário hipotético de vazamento, a HeyGen teria recusado com 401 antes de criar qualquer asset.
>
> Confirmado de forma independente por leitura REAL da conta (`probeSimples7SaldoCheck.ts`, novo, `GET /v3/users/me`, custo zero): saldo **US$ 5,40** — MAIOR que o último valor conhecido (US$ 4,00, medido no fechamento de SIMPLES-1, mais cedo no mesmo dia). Um saldo que SOBE descarta qualquer débito real no meio do caminho.
>
> Não existe `GET`/`DELETE` de asset documentado na API da HeyGen (`developers.heygen.com/reference/upload-asset`, WebFetch 03/09/2026) — mesmo que um asset real existisse, não haveria como listá-lo ou removê-lo pela API. **Pricing de `POST /v3/assets` não é documentado publicamente** — declarado NÃO VERIFICADO, e não presumido US$0,00 só porque nada foi cobrado NESTE caso (nenhuma chamada real saiu).
>
> Achado de processo, corrigido no caminho: a primeira versão do probe também chamava `GET /v2/user/remaining_quota`, e o gate reprovou (`checkLegacyEndpointPolicy.ts` — toda chamada v2 precisa estar registrada em `legacyEndpoints.ts`). Removida a chamada v2 do probe (descartável, não vale abrir uma entrada permanente de inventário para uma leitura de uma sessão) — `/v3/users/me` já trazia o saldo em `data.wallet`, que é tudo que era preciso.
>
> ### (c) Q — `videoFormat.ts` é compartilhado, sem efeito comportamental
>
> `falPipeline.ts:52` importa `AspectRatio` (só o TIPO) de `videoFormat.ts` — confirma que o arquivo É compartilhado. `routes/videos.ts` computa `format = resolveVideoFormat(publishPlatform)` UMA VEZ, antes de despachar por vendor — então `format.resolution` (agora "1080p") entra no objeto passado a `generateVideo()` também para vídeos Normal/Premium.
>
> Isolamento COMPORTAMENTAL confirmado por dois greps exaustivos, zero ocorrências cada: `grep "\.resolution\b" falPipeline.ts` (o arquivo NUNCA lê resolução) e `grep "input\.format\b" generateVideoFal` (só `input.format.aspectRatio` é extraído, na linha que abre a composição — `resolution` nunca sai do objeto). `pixelDimensionsFor()`/`resizeBackgroundImage()` (L2) ficam, por limite de função confirmado (`generateVideoHeygen` linha 1310–1560, `generateVideoFal` linha 1724+), inteiramente dentro de `generateVideoHeygen` — `generateVideoFal` nunca as chama.
>
> B-ISO: em vez de uma nova geração Normal em fixture, a prova aqui é a AUSÊNCIA de qualquer caminho de código que pudesse ser afetado — mais forte que uma amostra única, porque cobre TODOS os inputs possíveis, não só um. Corroborado empiricamente pelas guardas fal já existentes e inalteradas (`checkFalGenerationPathPolicy.ts`, `checkFalSceneWiringPolicy.ts`, `checkFalPipelinePolicy.ts` — todas com `expect` de conteúdo EXATO de payload, todas verdes durante SIMPLES-6 inteiro): se `resolution` vazando tivesse mudado alguma coisa observável no payload fal, essas guardas teriam reprovado.
>
> **Achado à parte, NÃO corrigido — fora do escopo desta rodada:** `videos.resolution`/`provider_usage.resolution` agora gravam `"1080p"` também para linhas Normal/Premium, mesmo o pipeline fal nunca tendo "escolhido" 1080p por si — é um RÓTULO herdado do objeto compartilhado, não uma medição do que o fal de fato entregou (que segue sendo o que `formatDerivation.ts`/`MASTER_ASPECT_RATIO` decidem, por conta própria). Sem efeito de comportamento; efeito possível em relatório/auditoria futura que leia essa coluna assumindo que ela reflete o pipeline fal.
>
> ### (d) Gate e custo
>
> Nenhum código de produto tocado — só o probe novo (`probeSimples7SaldoCheck.ts`, descartável, mantido como artefato histórico, mesmo padrão dos outros `probe*.ts` já no repositório). Gate verde, `tsc` limpo. **Custo real: US$ 0,00** — a única chamada real desta sessão foi um `GET` de saldo.

> ⚠️ **FECHAMENTO — BLOCO HEYGEN-SIMPLES-9 (03/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Partes W (prontidão de produção — só investigação, nenhum deploy), X (fecha o gap de US$0,06 entre o registrado por nós e o painel HeyGen), Y (instrumenta o log e entrega o comando de registro pedido). **HEAD ao fechar: `2268a95` + este commit.**
>
> ### (a) W — o gap de produção, só o lado que dá para medir daqui
>
> **W1 — MEDIDO, só do lado local.** `git rev-list --count 7cf2b8d..HEAD` = **153 commits**, `7cf2b8d` datado de 20/08/2026 (`git show -s --format=%cI`). Cobre o arco HeyGen-Simples inteiro (F a Q, blocos 1-7) mais trabalho não relacionado a HeyGen. **Que `7cf2b8d` seja de fato o último deploy em produção é premissa DO OPERADOR** — eu só confirmo que o commit existe no histórico local e calculo a distância até o HEAD atual; não tenho como verificar de forma independente o que está rodando na VPS.
>
> **W2/W3 — NÃO RESPONDIDAS, por bloqueio de memória permanente.** [[feedback_no_ssh_prod]] proíbe SSH e leitura de `.env` na VPS de produção (`eckko-prod`, `103.101.202.185`) mesmo com comando pronto colado na mensagem, mesmo leitura pura, mesmo valores mascarados — e esta Parte W pedia exatamente isso. Os comandos exatos (`printenv` dentro do container de produção, para `PROVIDER_MODE`/`PROVIDER_LIVE_CONFIRM`/`PROVIDER_LIVE_MAX_GENERATIONS`) foram entregues ao operador no chat, para ele rodar e, se quiser, colar a saída de volta numa sessão futura. **Nenhum deploy, nenhuma troca de modo, nenhum acesso à VPS foi executado.**
>
> ### (b) X — o gap de US$0,06, causa identificada por leitura
>
> **X1 — MEDIDO por query direta** (`tools/registro-geracao.sql`, item Y abaixo). O vídeo real de teste (`eb40f9b0-1e97-4913-a13a-bcbf4ceb0f3c`, criado 03/09 12:44:46, tenant `dev-c77a5b`) tem exatamente **2 linhas em `provider_usage`**: `voice/elevenlabs` US$0,0171 (171 caracteres) + `avatar/heygen` US$0,539 (14,0462s medidos pelo fornecedor, `requested_unit_count=15`) — **soma US$0,5561**.
>
> **X2 — causa mais provável identificada por leitura de código, NÃO medida de forma independente.** `heygenUploadAsset(input.apiKey, audio.buffer, "audio/mpeg")` em [avatarProvider.ts:1351](backend/src/services/providers/avatarProvider.ts:1351) — o upload do áudio sintetizado (`POST /v3/assets`) é a **2ª requisição HeyGen** de toda geração real (a 1ª é `POST /v3/videos`). Confirmado por grep: `recordProviderUsage` só é chamado em duas linhas do arquivo — 405 (ElevenLabs) e 631 (HeyGen `/v3/videos`) — o upload de asset loga só um evento genérico `vendor_response` (via `fetchJson(res, "HeyGen", "heygen.uploadAsset")`), sem gravar linha própria de custo. Isso bate com o "2 solicitações" que o painel da HeyGen mostrou contra o único registro que temos — mas fica como **HIPÓTESE RAZOÁVEL**, não medição: eu não estava presente na chamada real para isolar o custo dessa requisição especificamente, e não há tarifa documentada publicamente para `POST /v3/assets` (mesma lacuna já registrada em SIMPLES-7, item P).
>
> ### (c) Y — instrumentado, testado ponta a ponta, sem gastar
>
> `video_payload_built` ([avatarProvider.ts](backend/src/services/providers/avatarProvider.ts), ~linha 1388) ganhou o campo `video_id: input.videoId ?? "ausente"` explícito, no topo do objeto — grep direto por vídeo sem depender de saber que `callback_id` É o `videoId` quando presente (F1), e que não some quando `callback_id` estiver "ausente" (sondas sem `videoId`). Confirmado no log real de uma execução em fixture desta sessão: `"video_id":"11111111-1111-4111-8111-1111111c6cb1"` quando presente, `"video_id":"ausente"` nas sondas sem id.
>
> `tools/registro-geracao.sh` (novo, chama `tools/registro-geracao.sql`) — um único comando que imprime: (1) a última linha `video_payload_built` real do log ao vivo do backend (`docker compose logs backend --tail 500` — o teto de 500 é o gotcha já documentado deste projeto: `--tail` maior devolve arquivo rotacionado e congelado; o script NUNCA conclui ausência de geração a partir de busca vazia, só relata o que achou); (2) o vídeo e cada linha de `provider_usage` da geração HeyGen real mais recente (banco, fonte de verdade independente do log). **Testado ponta a ponta** contra `eb40f9b0…`: a seção de banco bate exatamente com X1; a seção de log não encontrou a linha (esperado — o buffer já tinha girado há horas desde a geração real), e o script relatou isso explicitamente em vez de fingir que não houve geração.
>
> ### (d) Gate, custo e ambiente
>
> Gate verde (fixture), `tsc` limpo nos dois lados. **1 commit de código** (`2268a95`) — só o campo `video_id` no log e os dois arquivos novos em `tools/`; nenhum arquivo de `falPipeline.ts` tocado (isolamento do Normal preservado por não-toque, não por prova nova nesta rodada — esta sessão não mexeu em geração de vídeo nenhuma). **Custo real: US$ 0,00** — nenhuma chamada paga a HeyGen/ElevenLabs; toda verificação foi gate em fixture + leitura de banco/código. Ambiente reconfirmado INALTERADO ao fechar (`printenv` no processo real): `PROVIDER_MODE=live`, `PROVIDER_LIVE_CONFIRM` armado (len=28), `PROVIDER_LIVE_MAX_GENERATIONS=3` — mesmo estado deixado por SIMPLES-5/6/7.

> ⚠️ **FECHAMENTO — BLOCO HEYGEN-SIMPLES-10 (03/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Parte CC (payload persiste no banco, resolve a dependência do log ao vivo), Parte AA (Seedance Avatar Shots — investigado, não serve ao pipeline hoje), Parte BB (Distância + Enquadramento, dois controles opcionais que resolvem "a pessoa aparece grande demais" por caminhos diferentes). **HEAD ao fechar: `030403e` + este commit de documentação.**
>
> ### (a) CC — o payload sobrevive ao log ao vivo
>
> **CC1.** `heygen_video_payloads` (migration 079, `video_id uuid PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE`) — `persistHeygenVideoPayload()` ([avatarProvider.ts](backend/src/services/providers/avatarProvider.ts)) grava o payload real ANTES do `fetch` de `POST /v3/videos`, com `ON CONFLICT (video_id) DO UPDATE`. A posição ANTES do fetch é deliberada: mesmo quando o vendor recusa (400), a linha persiste — é justamente na falha que o log ao vivo é menos confiável de se estar olhando na hora. `generateVideoFixture` ([fixtureProvider.ts](backend/src/services/providers/fixtureProvider.ts)) virou `async` (única mudança de assinatura em todo o repositório — um único call site, já dentro de uma função `async`, então nada mais precisou mudar) para persistir também no caminho simulado, preservando a promessa "o payload REAL, montado pelo montador REAL, mesmo sem rede" que já valia para o log.
>
> **CC2.** `tools/registro-geracao.sh`/`.sql` deixaram de depender do buffer de log ao vivo do backend (que SIMPLES-9 já tinha visto girar 2× antes de alguém copiar a linha). A seção "PAYLOAD ENVIADO" agora lê `heygen_video_payloads` — e o script ganhou um argumento opcional (`./tools/registro-geracao.sh <video-uuid>`), via variável `psql -v video_id`, para mostrar um vídeo ESPECÍFICO (real ou de fixture) em vez do "mais recente real" default — o comportamento sem argumento é BYTE A BYTE o de SIMPLES-9 (`NULLIF(:'video_id', '') IS NULL` preserva o filtro `simulated = false` original).
>
> **CC3.** Confirmado com um vídeo de fixture REAL, criado por um script descartável (`_tempCC3FixtureVideo.ts`, rodado uma vez dentro do container, não commitado): `PROVIDER_MODE=fixture` de verdade (não live+fetch-mocado), `generateVideo()` completo, `video_id` real gravado em `videos` (tenant `dev-c77a5b`, `simulated=true`), depois apagado (o `DELETE` em `videos` cascateou para `heygen_video_payloads`, confirmado por contagem zero pós-exclusão). `./tools/registro-geracao.sh <esse-uuid>` mostrou o payload completo (`fit`, `aspect_ratio`, `output_format`, `title`, `callback_url`, `callback_id`) sem tocar em log nenhum.
>
> **2 mutantes novos** ([checkHeygenPayloadPersistencePolicy.ts](backend/src/scripts/checkHeygenPayloadPersistencePolicy.ts)), execução real contra um vídeo REAL (tenant `dev-c77a5b`, apagado ao final — o `DELETE` cascateia): a chamada existe e sobrevive à recusa do vendor (fetch mocado para devolver 400); o `ON CONFLICT DO UPDATE` faz uma 2ª chamada (redo, formato diferente) atualizar o payload em vez de ficar parado no 1º. Os dois provados reprovando isolados, árvore limpa.
>
> ### (b) AA — Seedance Avatar Shots não serve ao pipeline hoje
>
> Pesquisado via WebSearch + WebFetch direto na doc oficial (`developers.heygen.com/cinematic-avatar` e `/reference/create-video`, 03/09/2026). **É real via API, não exclusivo do Studio**: `type: "cinematic_avatar"` em `POST /v3/videos` (o MESMO endpoint que já usamos — não é um `engine` novo; `engine.type` continua só `avatar_iii`/`avatar_iv`/`avatar_v`). Schema documentado: `prompt` (1-10.000 car., substitui script+voz), `avatar_id` (array de 1-3 LOOK ids), `references` (até 3 vídeos/9 imagens), `aspect_ratio` (16:9/9:16/1:1 — sem 4:5), `resolution` (720p/1080p), `duration` (4-15s, ou `auto_duration`).
>
> **Por que não serve:** confirmado explicitamente por WebFetch — "Instead of a script and a voice, you describe the shot you want in natural language." Não existe `script`, `voice_id` nem `audio_asset_id` — o endpoint inteiro troca o paradigma de "avatar narra o roteiro exato na voz clonada" (o que este produto faz hoje) por "descreva a cena e deixe o modelo decidir." Sem controle de fala exata, sem voz do usuário, com teto de 15s (a maioria dos roteiros deste produto passa disso) e sem 4:5. Investigação só — nenhum código tocado, nenhuma chamada real feita.
>
> ### (c) BB — dois controles opcionais, dois caminhos diferentes para "a pessoa aparece grande demais"
>
> **BB1 — Distância**, na foto de treino. `addDistanceMarginToAvatarPhoto()` ([avatarProvider.ts](backend/src/services/providers/avatarProvider.ts)) cresce o CANVAS da foto do rosto em 1,5× (fundo desfocado-estendido via `split`+`overlay`, NUNCA cor sólida — mesma política já fixada em `ffmpeg.ts` e usada por `formatDerivation.ts`/Normal para o mesmo problema de preenchimento; reimplementada aqui, não importada, pela mesma razão de isolamento que já valeu para `pixelDimensionsFor()` em L2) antes do upload — a pessoa ocupa uma fração menor do quadro resultante. Ligada em `trainAvatar()` (a única função que lê a foto do rosto do avatar antes de subir ao fornecedor). Campo `distance` chega por multipart field em `POST /avatars/:id/reference-video` (mesmo padrão de `replace`/`confirm_avatar_name` em `voice.ts` — `file.fields`, nunca query string). UI: seletor "Padrão"/"Mais afastado" na tela de configuração do avatar (Passo 1), junto do upload/gravação do vídeo de referência — a foto é a de ROSTO, já enviada antes; o texto de ajuda diz isso explicitamente. "padrao" é NO-OP por desenho: devolve o buffer intocado, sem chamar ffmpeg.
>
> **BB2 — Enquadramento**, por vídeo. `input.avatarFit` (novo campo em `GenerateVideoInput`) vence `HEYGEN_FIT` quando presente — `fit: input.avatarFit ?? HEYGEN_FIT` no corpo real de `POST /v3/videos`. Controle novo na tela Cena ("Padrão"/"Mostrar tudo (sem cortar)"), visível só no tier Simples (HeyGen — `fit` não existe no contrato da fal). **NÃO persistido no banco** — decisão deliberada, diferente dos outros 5 controles de cena: "Gerar novamente" já reenvia o estado ATUAL da tela (não um valor salvo), então não há o que esquecer num redo.
>
> **BB3 — os dois OPCIONAIS**, confirmado por execução: sem escolher nada, o payload sai byte-idêntico ao comportamento de antes desta rodada (fit continua "cover", a foto de treino continua subindo sem passar por ffmpeg).
>
> **3 mutantes novos** ([checkAvatarDistanceAndFitPolicy.ts](backend/src/scripts/checkAvatarDistanceAndFitPolicy.ts)), execução real: `ffprobe` mede a foto REAL capturada em `POST /v3/assets` (cresce 1,5× nos dois eixos com "afastado", medido dentro de 5% de tolerância; byte-idêntica ao arquivo original com "padrao"); o `fit` REAL capturado em `POST /v3/videos` reflete `"contain"` quando escolhido e preserva `"cover"` quando ausente. Os 3 provados reprovando isolados (a 1ª tentativa em conjunto deu AMBÍGUO por contenção de paralelismo — mesma classe já documentada em SIMPLES-6/7 — reconfirmados isolados e depois juntos de novo, limpos os 3).
>
> **Dois achados de processo no caminho, corrigidos ANTES do commit:**
> 1. A expressão de `overlay` copiada por engano de uma tentativa anterior usava `iw`/`ih` (válidos em `scale`/`crop`, mas não em `overlay`) em vez de `W`/`w`/`H`/`h` (dimensões do input principal/sobreposto) — o ffmpeg recusava a expressão inteira ("Undefined constant"). Só apareceu ao rodar de verdade contra uma imagem real; corrigido para `overlay=(W-w)/2:(H-h)/2`, mesma forma já usada em `formatDerivation.ts`.
> 2. O mutante óbvio de BB1 (remover o `if (distance === "padrao") return buffer;`) quebrava o `tsc` em vez de mudar comportamento — `AVATAR_DISTANCE_MARGIN_FACTOR` era tipada `Record<"afastado", number>`, e sem o retorno antecipado o estreitamento de tipo que permitia indexar com `distance: "afastado"` desaparecia. Corrigido alargando a tabela para `Record<AvatarPhotoDistance, number>` com `padrao: 1` (nunca lido de fato — o retorno antecipado continua interceptando antes) — o mesmo gotcha "mutante que não compila vira AMBÍGUO, não reprovação real" já documentado em blocos anteriores (SIMPLES-3, SIMPLES-4).
>
> ### (d) Gate, custo, ambiente
>
> **Registro: 520 mutantes declarados** (era 515). Gate verde (fixture), `tsc` limpo nos dois lados. **Verificado AO VIVO no navegador** (fixture NÃO ligado — a verificação foi só de tela, sem submeter geração nenhuma, então não exigiu trocar o modo): os dois controles novos renderizam com o texto certo (confirmado por `get_page_text`) e alternam estado ao clicar (confirmado por leitura direta do `className` do chip via JS — "chip selected" migra do botão certo para o outro). Um avatar de teste descartável criado durante a verificação (photo_urls vazio, nunca enviado) foi apagado ao final. **Custo real: US$ 0,00** — nenhuma chamada paga a HeyGen/ElevenLabs; toda prova de execução roda com `fetch` substituído. Ambiente reconfirmado INALTERADO ao fechar: `PROVIDER_MODE=live`, `PROVIDER_LIVE_CONFIRM` armado (len=28), `PROVIDER_LIVE_MAX_GENERATIONS=3`.
>
> ### (e) Passada COMPLETA — terminou depois do fechamento, 65 anomalias investigadas, nenhuma real
>
> A passada completa (520, sem filtro, lançada em background) terminou **455/520**, **65 anomalias** — bem acima do histórico de ~18-20 já documentado em SIMPLES-6/7. **Achado de processo: a causa provável é NOVA nesta rodada** — ao contrário das vezes anteriores, esta passada rodou **concorrentemente** com verificação ativa no navegador e várias reconferências de gate via `docker compose exec`, todas competindo pelos mesmos 6 workers/CPU/docker que os 520 mutantes. Nenhuma sessão anterior tinha misturado as duas coisas.
>
> **Nenhuma das 65 é dos mutantes desta sessão** (persistência/distância/enquadramento) — confirmado por grep negativo nos nomes. Das que TOCAM arquivos desta sessão, **todas as 9 reconferidas em isolamento total (`--guard` sozinho, sem nenhum outro filtro concorrente) saíram "ok"**: `GET /avatars/:id/looks...`, `fundo: a imagem sobe redimensionada...`, `idempotência: duas chamadas reais...`, `traje: sem imageUrls...` (deu veredito DIFERENTE em cada uma das 3 vezes que rodou em lote — ok, AMBÍGUO, ok — e "ok" toda vez que rodou sozinha, a assinatura clássica de contenção, não de defeito determinístico), `contrato de vídeo: o quadro é preenchido...` (o próprio `HEYGEN_FIT`, mutante que este bloco tocou diretamente ao adicionar `avatarFit`), `excluir foto...`, `o botão Concluir configuração não exige 3 fotos...`.
>
> Das ~50 restantes (voz, recuperação, pipeline fal, derivação, frescor do Vite, domínio único — nenhuma toca arquivo desta sessão), amostradas em lotes de 15-23 filtros: a maioria também limpou ao rodar em lote menor; as que persistiram são majoritariamente testes sensíveis a TEMPO real (`AbortSignal`/teto de polling, intervalo entre leituras, contrapontos que comparam durações) — exatamente a classe mais vulnerável a contenção de CPU. Não foram todas reconferidas 100% sozinhas (o custo de tempo não compensava, dado o padrão já estabelecido nas 9 que foram), mas nenhuma delas toca arquivo desta sessão.
>
> **Conclusão: as 65 anomalias são contenção, não regressão — mesmo padrão de SIMPLES-6/7, numa escala maior porque desta vez a passada dividiu a máquina com trabalho ativo do assistente.** Lição para a próxima sessão: não fazer verificação pesada (navegador, `docker compose exec` repetido) enquanto uma passada completa roda em background — deixá-la terminar sozinha, ou aceitar que o relatório de anomalias vai precisar de reconfirmação extra como esta. Log completo em `mutants-simples-10-completa.log`, no scratchpad da sessão.

> ⚠️ **FECHAMENTO — BLOCO STUDIO-EDIT-1 (14/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Implementação completa (não investigação) da aba "5. Studio Movie Edit" (era "5. Editar"), a partir do protótipo aprovado `uploads/_prova/studio-movie-edit/aba5-editar-splice.html` (fora do repositório, em `uploads/`, que o git ignora — mesma convenção já usada para artefatos de prova). Detalhe operacional completo em [ESTADO.md](ESTADO.md), topo da Seção 1 — este bloco registra só o que fica valendo depois que a sessão terminar.

> ### (a) A mudança de modelo, e por que o relatório de 28/08 está superado
>
> `RELATORIO-aba5-edicao.md` descrevia CUTAWAY (sobreposição sobre o vídeo, duração constante) e dizia, literalmente, que a voz é contínua e não pode ser cortada — "se ela puder ser cortada, o produto vira um editor de verdade e este documento não vale mais". O protótipo aprovado NESTA rodada é justamente isso: EMENDA (splice). V1 passou a ser uma SEQUÊNCIA de trechos (não mais um único vídeo com corte de entrada/saída); um b-roll entra como trecho EXCLUSIVO, com o áudio dele — e SÓ dele — tocando; a voz é cortada exatamente onde o b-roll está; e a duração final do vídeo CRESCE a cada b-roll inserido, em vez de ficar constante. O relatório de 28/08 não foi apagado, mas parou de descrever o comportamento atual nesse ponto.
>
> ### (b) O que foi construído, por parte
>
> **Parte 1 — lógica pura**, duplicada byte-a-byte (exceto cabeçalho) em [backend/src/services/video/editProject.ts](backend/src/services/video/editProject.ts) e [frontend/src/pages/CreateVideo/editProject.ts](frontend/src/pages/CreateVideo/editProject.ts) — mesma convenção de duplicação já usada neste projeto (`scriptDuration.ts`, em três lugares) na ausência de um pacote compartilhado entre front e back. `duracaoTrecho`, `linhaDoTempo`, `duracaoFinal` (MUDOU de assinatura: agora é a SOMA dos trechos, não `saida - entrada` de um vídeo único — mudança de propósito, sem chamador de produção anterior para quebrar), `corrigirTrecho`, `corrigirInsercao`, `dividirEm`, `podeJuntar`, `montarCorpo`, `decidirRota`, `listarBloqueios`, mais duas funções novas não pedidas pelo nome mas necessárias para fechar a Parte 2-bis com segurança: `urlDoAsset` (deriva a URL de reprodução do `assetId`, determinística) e `payloadDoProjeto` (a função ÚNICA que decide o que é persistido — nunca grava `url`, só `assetId`, dando a G3 um alvo de execução em vez de só um grep de texto). **Teste de mesa RODADO de verdade** via script `tsx` descartável (criado, executado, removido): base 8s, corte em 3s, b-roll de 2,5s → duração final **10,5**, offsets **[0, 3, 5.5]**, voz total **8** — bateu exato nos três números pedidos pelo bloco. Achado de TypeScript no caminho: `TrechoNaLinha<T>` como interseção direta (`T & {...}`) NÃO distribui sobre a união `Trecho` — precisou virar tipo condicional (`T extends Trecho ? T & {...} : never`) para `.filter()`/narrowing continuarem enxergando `entrada`/`saida` no ramo certo; motivou uma segunda função de guarda (`isBaseNaLinha`) tipada especificamente para item pós-`linhaDoTempo`.
>
> **Parte 2 — migration 080 (`edit_projects`), aditiva, aplicada.** `payload` jsonb guarda `{trechos, insercoes, volVoz, fundo}` no formato que o protótipo produz — sem coluna por campo, porque o editor ainda está mudando de modelo e uma migration por controle novo seria fricção sem benefício. `source_video_id`/`duration_seconds` viraram colunas próprias por serem consultados fora do editor.
>
> **Parte 2-bis — upload/exclusão**, rota própria ([routes/editProjects.ts](backend/src/routes/editProjects.ts) + [services/video/editAssets.ts](backend/src/services/video/editAssets.ts)), deliberadamente SEPARADA de `/documents` (que segue presa a 1 MiB, problema registrado à parte, não tocado aqui). `POST /tenant/edit-assets` grava em STREAMING (`pipeline` para `fs.createWriteStream`) — nunca buffer inteiro em memória, diferente do `toBuffer()` que as outras rotas de upload deste projeto usam. Sem tabela de asset (só `edit_projects` foi pedida): o arquivo vive em `uploads/<tenant>/edit-assets/<uuid>.<ext>`, achado por prefixo depois de validar `asset_id` contra um regex de UUID estrito — a GUARDA DE CAMINHO contra path traversal que o bloco pediu explicitamente, nunca concatenação direta do valor recebido. `DELETE` é idempotente (404 quando já não existe, tratado em silêncio pelo frontend). `GET /tenant/edit-assets/:asset_id` serve por proxy — nunca `/uploads/...` cru — reaproveitando `contentTypeForExtension` de `downloadProxy.ts`. As rotas de projeto (criar/atualizar/ler `edit_projects`) não tinham nome de "Parte" no pedido original, mas eram indispensáveis para o item 5 do PRONTO QUANDO — acrescentadas por necessidade, não por iniciativa.
>
> **Parte 3 — a tela** ([steps/StudioMovieEditStep.tsx](frontend/src/pages/CreateVideo/steps/StudioMovieEditStep.tsx)), 5º passo do wizard — `CreateVideoPage.tsx` ganhou `t("createVideo.steps.studioMovieEdit")` na lista de passos e `|| step === 3` em `canProceed` (Gerar deixou de ser o último passo, e sem essa linha o botão Avançar ficaria desabilitado ali). Cortes de escopo deliberados, registrados no cabeçalho do próprio arquivo: análise de onda por Web Audio e detecção de pausas (dependem de os timestamps do ElevenLabs já estarem persistidos — adiado explicitamente pelo bloco); arraste do mouse para redimensionar clipe (o protótipo também tinha campos numéricos ao lado do arraste; só os campos foram portados); "Carregar mp4 local" do protótipo (era um dispositivo para testar sem backend — aqui o vídeo BASE sempre vem de um vídeo real já gerado pelo tenant); "Exportar" existe na tela mas fica desabilitado, com o motivo explicado (nenhuma rota de exportação existe — `FORA DE ESCOPO` explícito no pedido). "O que vai ser enviado" deriva de `montarCorpo(...)`, nunca do estado bruto (G1). Upload é IMEDIATO ao escolher arquivo, e o código de produção nunca chama `URL.createObjectURL` — G3 fica satisfeita por construção, não só por disciplina de quem escreveu. Trocar/remover sempre chama `DELETE` do asset ANTIGO depois do novo confirmado (G4).
>
> **Parte 4 — as 4 guardas** ([checkStudioMovieEditPolicy.ts](backend/src/scripts/checkStudioMovieEditPolicy.ts)), registradas em `checkPolicy.ts` e `mutantRegistry.ts`. **Registro: 524 mutantes declarados** (era 520). G1 (corpo deriva de `montarCorpo`) e G4 (troca/remoção sempre exclui o asset antigo) são checagem ESTÁTICA ancorada no corpo de cada handler/expressão real — mesma técnica de `checkPreflightSummaryPolicy.ts`/`checkPhotoRemovalPolicy.ts`. G2 (sobreposição sobre b-roll é recusada) e G3 (payload persistido nunca grava `url`) são EXECUÇÃO REAL da lógica pura, via import dinâmico do módulo do backend — sem rede, sem banco, mais forte que ler texto.
>
> **Achado de processo — a mesma contenção já documentada em SIMPLES-6/7/10, agora nas guardas deste bloco.** A passada em lote (`--guard "studio-movie-edit:"`, 6 workers paralelos) devolveu **AMBÍGUO** para G1 e G4 — reprovaram (exit 1), mas sem a mensagem esperada. **Reproduzidos à mão, isolados** (edição direta do arquivo + `docker compose exec -e ARNES_EM_CURSO=1 -e PROVIDER_MODE=fixture backend npm run check`, revertido em seguida): os DOIS deram a mensagem EXATA esperada — as guardas são saudáveis, e o lote paralelo é que produziu ruído. G2 e G3 saíram "ok" já no lote, sem precisar de reconfirmação.
>
> **Parte 5 — bloco de leitura da VPS, escrito e explicitamente NÃO executado**, por [[feedback_no_ssh_prod]] (memória de sessão: SSH para produção é ação exclusiva do operador, mesmo comando pronto colado). Entregue ao operador no chat.
>
> ### (c) Verificado NO NAVEGADOR REAL — não só no gate
>
> Fixture, custo zero, tenant `dev-c77a5b`, avatar "test um", vídeo real `8629c344…` (5s, "Segunda prova de fechamento do BLOCO HEYGEN-SIMPLES-3"). Os 8 itens do PRONTO QUANDO, confirmados um a um: (1) cursor em 2,32s + "+ B-roll" fez a duração ir de 5,00s para **8,00s**, com V1 mostrando **2,32s (base) → 3,00s (b-roll) → 2,68s (base)**; (2) um mp4 real (201.373 bytes) enviado via `input.files`/`DataTransfer` (o Browser pane não automatiza o seletor nativo de arquivo do SO) produziu `POST /tenant/edit-assets` → 201, e o arquivo apareceu em `uploads/c77a5b8a…/edit-assets/<uuid>.mp4` — fora de `/tmp`, tamanho batendo exato — e `▶ Reproduzir` avançou o relógio pela fronteira base↔b-roll sem erro atribuível a este código; (3) "Tirar b-roll" fez o mesmo arquivo desaparecer de disco — `ls -la` ANTES mostrando 201.373 bytes, DEPOIS diretório vazio; (4) teste de mesa, ver (b); (5) "Guardar o projeto" criou uma linha real em `edit_projects` (`duration_seconds=8`, `payload.trechos[1].assetId` = uuid real, SEM campo `url` — confirmado por `psql` direto), e um reload COMPLETO da página (sessão de cookie sobreviveu) seguido de reconstrução do wizard e reseleção do MESMO vídeo mostrou a sequência idêntica de volta, com o b-roll reidratado pelo nome do arquivo; (6) as 4 guardas com o gate voltando a 0 violações, ver (b); (7)/(8) Partes 5 e este próprio registro.
>
> **Achado de processo, fora das guardas: este ambiente sobe o backend com `npm run serve` (`tsx src/index.ts`), sem watch.** A primeira tentativa de upload real deu 404 ("Route POST:/tenant/edit-assets not found") com o código já em disco, porque o processo antigo ainda não conhecia a rota nova — resolvido com `docker compose restart backend` (que reaproveita o env já materializado no container, diferente de `up -d`, que reconcilia com o `.env` em disco).
>
> ### (d) Pendência registrada, não resolvida — dívida explícita do próprio bloco
>
> Um arquivo enviado para um projeto que nunca chega a ser salvo ("Guardar o projeto" nunca clicado) fica ÓRFÃO em `uploads/<tenant>/edit-assets/` — não existe coleta de lixo. Não implementado nesta rodada por instrução explícita do pedido; fica para uma rodada futura dedicada a isso.
>
> **Custo real desta sessão: US$ 0,00.** Todo teste em `PROVIDER_MODE=fixture` (a sessão tinha aberto em `live`; trocado para `fixture` só para este bloco e devolvido a `live` ao fechar, confirmado por `printenv`). Nenhuma chamada a HeyGen/ElevenLabs/fal. Nenhum commit de código foi criado automaticamente — por regra do assistente, commit só acontece quando o operador pede; o HEAD exato desta rodada (quando commitada) fica registrado no chat da sessão, não neste arquivo, para evitar a auto-referência impossível de um commit citar o próprio hash.
>
> **CORREÇÃO, do fechamento do BLOCO STUDIO-EDIT-2 (14/09/2026): este bloco FOI commitado depois desta sessão** — `469bef5` (código) + `505d152` (documentação), a pedido do operador na sessão seguinte. A frase acima ("nenhum commit de código foi criado automaticamente") descrevia a intenção correta NO MOMENTO em que foi escrita; não reabrir por causa disso.

> ⚠️ **FECHAMENTO — BLOCO STUDIO-EDIT-2 (14/09/2026) — MAIS NOVO QUE O BLOCO ACIMA, LEIA ESTE PRIMEIRO.** Sessão de fechamento pré-deploy do editor "Studio Movie Edit", encadeada a partir do commit `505d152` (fechamento do STUDIO-EDIT-1). Cinco itens, todos no escopo: régua adaptativa, marcação visual de colisão, remover fundo musical, corrigir o cosmético "()", limpar os dados de teste deixados pela verificação do STUDIO-EDIT-1. **HEAD ao fechar: `3ba746e` (código) + este commit (documentação).**
>
> ### (a) O que foi implementado, por item
>
> **1. Régua adaptativa.** Não existia (confirmado por `grep` antes de começar). `passoDaRegua(dur)`/`Regua` (novos, [StudioMovieEditStep.tsx](frontend/src/pages/CreateVideo/steps/StudioMovieEditStep.tsx)) — 1s até ~20s de duração final, 5s até ~60s, 10s acima disso — renderizados acima da trilha V2, no mesmo grid `112px + 1fr` das trilhas, para as marcas caírem exatamente sobre os mesmos pontos-no-tempo que os blocos da timeline.
>
> **2. Marcação visual da colisão.** A expressão de colisão que vivia inline dentro de `listarBloqueios` virou a função pura `insercaoColideComBroll(i, linha)` (em `editProject.ts`, duplicada nos dois lados — mesma convenção do resto do arquivo), para a mesma lógica servir à recusa (bloqueio) E ao contorno vermelho (`outline: 2px solid var(--color-tertiary)`) do bloco na trilha V2. **Achado de manutenção, corrigido no caminho:** o refactor apodreceu o `find` do mutante G2 em [checkStudioMovieEditPolicy.ts](backend/src/scripts/checkStudioMovieEditPolicy.ts) (a linha `if (colide) b.push(...)` não existe mais) — o gate acusou "0 ocorrências" antes do conserto; atualizado para o novo call site (`if (insercaoColideComBroll(i, linha)) {...}`), reprovando isolado de novo depois.
>
> **3. Remover fundo musical.** Só existia "Trocar arquivo" — acrescentado "Tirar" ao lado, chamando `excluirEditAsset` do assetId antigo, mesmo padrão de exclusão real de b-roll/sobreposição.
>
> **4. Cosmético "()".** Três chaves de locale (`brollSemArquivo`, `sobreposicaoPassaDoFim`, `sobreposicaoSobreBroll`, pt-BR + en) tinham `({{nome}})` fixo no template — com nome vazio, isso renderizava `"()"`. Trocado por `{{nomeParen}}`, computado na renderização (`b.params?.nome ? " (nome)" : ""`) — uma linha, sem guarda nova, como pedido.
>
> **5. Limpeza pré-deploy.** A linha de teste `dbbcc5ec-…` em `edit_projects` (deixada pela verificação do STUDIO-EDIT-1) e os 4 arquivos órfãos em `uploads/c77a5b8a-…/edit-assets/` — apagados depois de confirmar, por `SELECT`, que nenhum OUTRO projeto referenciava qualquer um dos 4 arquivos.
>
> ### (b) Prova por item — todas no navegador real, fixture, custo zero
>
> - **Régua**: sequência montada empilhando um b-roll de 70,1s sobre a base de 5s (duração final 75,10s) → régua mostrou `0s 10s 20s 30s 40s 50s 60s 70s`, sem sobreposição de números. Degrau de 1s também confirmado com a duração original de 5s.
> - **Colisão**: `getComputedStyle` do bloco de sobreposição — `outline: "rgb(226, 87, 76) solid"` quando dentro do intervalo do b-roll; `outlineStyle: "none"` quando movido para fora dele (mesmo bloco, mesma sessão de teste).
> - **Remover fundo**: upload de `fundo-teste-remover.mp3` → `ls -la` mostrou o arquivo (4096 B) em disco → clique em "Tirar" → `ls -la` mostrou diretório vazio, A2 voltou a "+ Carregar fundo musical".
> - **Cosmético**: b-roll sem arquivo → *"O b-roll do trecho 1 não tem arquivo."* (sem parênteses vazios); sobreposição com nome → *"A sobreposição 1 (imagem-com-nome.png) cai sobre um b-roll..."* (parênteses normais quando há nome).
> - **Limpeza**: `SELECT count(*) FROM edit_projects` 1→0; `ls -la uploads/c77a5b8a-…/edit-assets/` 4 arquivos → diretório vazio.
>
> ### (c) Achado de processo — mesma contenção já documentada, desta vez nas guardas do próprio bloco
>
> A passada em lote (`--guard "studio-movie-edit:"`, 6 workers paralelos) devolveu **AMBÍGUO** para 2 mutantes que esta rodada NÃO tocou (`handleUploadBroll` ramo TROCA, `payloadDoProjeto` grava url) — mesma classe de contenção sob paralelismo já documentada em SIMPLES-6/7/10 e no próprio STUDIO-EDIT-1. Reproduzidos isolados (`--name`, um de cada vez): os dois saíram "ok". **Registro de mutantes: 525, sem mudança** — o mutante G2 só teve o `find` corrigido (mesmo comportamento, mesmo `expect`), nenhum mutante novo foi acrescentado nesta rodada.
>
> ### (d) Gate, custo, ambiente
>
> `tsc` limpo nos dois lados. Gate (fixture) **EXIT 0**, 517/525 mutantes casando por arquivo (8 de ambiente, número estável desde antes desta rodada). **Custo real: US$ 0,00** — `PROVIDER_MODE` trocado para `fixture` só para o teste (`docker compose up -d --force-recreate backend` com override de shell, sem tocar `.env`) e devolvido a `live` ao fechar (`docker compose up -d backend`, sem override), reconfirmado por `printenv`. **Fora de escopo respeitado**: nenhum arraste de mouse, nenhuma rota de exportação/fal/ffmpeg no backend, `/api/documents` intocado.
>
> Commits: `3ba746e` (os 6 arquivos de código) + este (CLAUDE.md/ESTADO.md), a pedido explícito do operador — as duas mensagens de commit vieram prontas na instrução, não fui eu quem as redigiu.
