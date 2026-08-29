Always respond in Brazilian Portuguese.

> ## ⚠️ PONTO DE RETOMADA CORRENTE — leia a Seção 6 (fim do arquivo)
>
> O estado corrente vive só na [Seção 6 · Bloco de retomada](#6--bloco-de-retomada--cole-numa-sessão-nova)
> — não duplicado aqui de propósito, para não haver dois textos podendo
> discordar um do outro. **Dentro da Seção 6, o bloco mais novo é "FECHAMENTO
> PARA TROCA DE CONTA (27/08)", no FIM da seção — leia-o antes dos blocos de
> 26/08 e 25/08 que vêm antes dele, que estão superados no que os três
> conflitarem.**
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
