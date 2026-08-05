Always respond in Brazilian Portuguese.

# eckko.ai (antigo TWINAI)

SaaS multi-tenant de vídeo com avatar digital. Docker Compose: `traefik` (única porta, **8090**), `postgres`, `backend` (Fastify/TS), `frontend` (React/Vite). **HEAD `84fdae3`** + o commit deste fechamento. Há uma **demo a apresentar**.

**0 · REGRA DE ESCRITA — confira o número MEDIDO contra o número AFIRMADO antes de escrever a mensagem de commit.** Três imprecisões em três commits: `84fdae3` disse "nenhuma removida" com 3 guardas reescritas, e `5de2ed6` disse "8 mutantes novos" sendo 7. Nenhuma delas mudou o código; todas fizeram a mensagem valer menos do que o diff. Contar é barato — reler a afirmação com o número na mão custa segundos.

**Amostra de voz — a duração-limite agora é 218 s (3:38)** e é DERIVADA, não escolhida: `floor(10 MiB / (24000 Hz × 2 bytes))`. A saída da conversão passou de 48 para **24 kHz** (item 4.2 do FECHAMENTO-1), o que fez a captura de 2:33 do E2E-1 voltar a caber — 7.338.318 B contra os 14.676.558 B de 48 kHz (os **dados** são metade exata, 7.338.240 B; o arquivo difere em 39 B porque o header de 78 B não se divide). As duas réguas (recusa por tamanho e `checkSampleDuration`) saem da MESMA função, e a faixa 109–120 s em que uma aceitava e a outra recusava não existe mais. O **aceite do fornecedor está MEDIDO desde 05/08 e o risco está FECHADO**: o ElevenLabs aceitou exatamente este WAV numa clonagem real — `cloneVoice` HTTP **200**, `{"voice_id":"5Yeum4QN7o9S5Lc0XVOx","requires_verification":false}`. Era o último NÃO VERIFICADO entre o projeto e a demo. Prova em `uploads/_prova/fechamento1-24khz/` e `uploads/_prova/tiro-final/`.

**ElevenLabs, item 3 do FECHAMENTO-1 — FECHADO como NÃO VERIFICADO, não procurar mais.** O `model_id` já era enviado em **03/08** (`ed207db`, ancestral de `2640342`), então a hipótese de "faltava mandar o modelo" está descartada. Por que os 90 créditos foram cobrados à tarifa de Flash/Turbo continua sem resposta possível daqui: a resposta gravada não traz o modelo e os cabeçalhos passam por allowlist. Fica assim.

**Custo do arnês — hipótese REFUTADA.** `npm run check:mutants` custa **1.290 s = 21,5 min** (cronometrado em 04/08, 122/122 verde), **não ~52**, e não são as guardas novas: as de voz somam **540 ms** (medido nesta retomada; 609 ms na anterior) de um gate de **10.898 ms** — 5%. O tempo está no PRODUTO: **122 mutantes × 10,6 s de gate**, e cada mutante paga um gate inteiro. Dentro do gate: `tsc --noEmit` ~4,0 s + `checkPolicy` ~5,9 s + ~1,0 s de `docker compose exec`/npm. Ou seja, ~40% de cada execução é um `tsc` que quase nenhuma mutação altera. Guarda nova só move o ponteiro se custar segundos, não milissegundos.

**GUARDA B — os DOIS lados estavam sem medição; só o "usado" foi corrigido (04/08).** Ela compara `usado >= teto` e os dois números eram supostos. **Usado — CORRIGIDO:** contava `data.voices.length`, e `GET /v1/voices` traz a biblioteca `premade` do fornecedor junto com as vozes da pessoa. Numa conta de **4** vozes ele devolveu **25**, e uma clonagem legítima foi recusada com "25 de 10 vozes em uso" (nada gasto — a recusa é antes da clonagem). Agora `countOwnedVoices()` conta o que **não** é `premade`. **A categoria deixou de ser deduzida em 05/08:** o inventário real traz **26 itens = 21 `premade` + 5 `cloned`**, e os 21 batem exatamente com a aritmética 25−4 de antes. A correção está provada em produção — a clonagem que antes era recusada com "25 de 10" passou avaliando **4 de 10**. **Substituir a voz de um avatar NÃO libera o slot da antiga:** o fornecedor ficou com as duas, com o mesmo nome, e a conta foi de 4 para 5. **Teto — SEGUE SUPOSTO:** `DEFAULT_VOICE_SLOT_LIMIT = 10` é declarado, e o real vive em `/v1/user/subscription`, que responde **401** sem `user_read`. Não foi tocado. Enquanto o teto for palpite, esta guarda pode barrar cedo demais de novo — só que agora pelo lado que ainda não foi medido.

**VÍDEO REAL DE 05/08 — o que ficou MEDIDO.** Um vídeo pago saiu pelo produto (`8e7941d1`, avatar `7557957c`, voz clonada `5Yeum4QN…`).
- **Ritmo: 474 caracteres ÷ 36,9876 s = 12,8151 c/s** — venceu a hipótese de 13,0 (erro 0,185). **A pontuação desacelera 8,4%**: 13,9871 c/s em 87 caracteres contra 12,8151 em 474, mesma voz e modelo. Era DEDUZIDO, agora é MEDIDO.
- **Régua, 5ª confirmação, ao centavo:** 36,9876 → 36 → 108 un → **US$ 1,80**. Saldo 831 → 723, carteira 13,85 → 12,05.
- **Primeira vez que a régua do FORNECEDOR mudou o resultado:** nosso `ffprobe` deu 37,000000 s, ele deu 36,9876 s. Truncados, **37 e 36** — cobrar pelo nosso número teria errado 3 un / US$ 0,05 para cima. Antes as duas réguas só coincidiam.
- **Sonda: `padded`** — quadro 720×900 (4:5), conteúdo 720×540 (**4:3**), **40,0% preenchido**, recorte x=0 y=180. **Primeiro caso real do caminho `padded`**; o caminho `pending` continua sem caso real.
- **Custo de voz, MEDIDO no painel:** 561 caracteres (87+474) → **280 créditos, US$ 0,056**, contagem 2. Confirma 0,5 crédito/caractere e US$ 0,0001/caractere. **O painel é legível mesmo com o 401** — o item aberto vira "leitura manual", não "impossível".
- **mp4:** `ba25ab33`, 3.441.685 B, md5 `bebc3ff22e098d2d35b43c8181f662bf`, h264 720×900, 25 fps, 37,000000 s, `simulated=f`.

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
| Avatar V | **indisponível para este avatar** — exige `digital_twin` | `avatar-v.md` + inventário |
| `supported_api_engines` por GET | **não existe nesta chave** | 11 GETs sondados, nenhum traz o campo |

**O avatar do Mário é TALKING PHOTO (avatar de foto), não digital twin.** `photo_avatar_id 45528bb8…`, grupo `21812e52…`, `business_type: "uploaded"`, `status: completed`, **1 look**. A conta tem 4 grupos privados `twinai-*`, um look cada. `/v3/avatars/{id}` espera **group id**, não look id — o 404 diz "Avatar group … not found" (isto encerra a ASSUMPTION registrada em `avatarProvider.ts`).

**O que o fornecedor aceita em `POST /v3/videos` (doc pública, lida por GET):** `background.type` ∈ **{color, image}** · `motion_prompt` texto livre · `expressiveness` ∈ {low, medium, high} (avatares de foto) · `engine.type` ∈ {avatar_iii, avatar_iv, avatar_v} · áudio por `audio_asset_id`, `audio_url` ou `script`+`voice_id`, mutuamente exclusivos.

**TRÊS COISAS QUE O DEMO-1 PEDIU E O FORNECEDOR NÃO TEM — decididas com o operador, não reabrir.**
1. **Fundo por VÍDEO não existe.** O enum tem dois valores e a composição de cena declara só cor sólida. Decisão: **cor e imagem apenas**.
2. **Avatar V não serve aqui.** Exige `digital_twin`; não documenta `audio_asset_id` (e a voz clonada do ElevenLabs é o que dirige a geração); não tem `expressiveness`. Decisão: **IV padrão, III alternativa**.
3. **Presets de expressão/gesto/olhar não existem** em nenhum motor. O que há é `motion_prompt` + `expressiveness`. Qualquer orientação de escrita na tela é recomendação NOSSA, e o texto precisa dizer isso.

**DEMO-1 — o que ESTÁ feito (2 etapas, commits `86d1b2e` e `7c64c91`):** o payload leva fundo (cor/imagem como asset), `motion_prompt`, `expressiveness`, `engine` e o look; a migration 042 guarda a cena; a simulação passou a montar o payload REAL e imprimi-lo; teto diário no banco (default 5, imune a `restart`); margem 1,10 no portão de roteiro longo; 3 guardas novas, cada uma provada reprovando. **126 mutantes declarados** (3 novos).

**DEMO-1 — o que NÃO está feito, e é tudo de TELA:** o wizard continua em 6 passos (item 7), não há UI para fundo/interpretação/look (itens 1, 3, 4), o prompt→roteiro **não usa o RAG** (`/scripts/generate` chama o LLM sem contexto — item 5), não há botão de gerar novamente (item 8), e Publicação continua dentro do fluxo de criação. **Sem a tela, os cinco controles existem no backend e ninguém consegue usá-los.**

**DÍVIDA DE GUARDA — 4 mutantes DEVIDOS, nenhum escrito (congelamento de 05/08). Identificados por NOME, nunca por posição.** O gate ficou verde e as correções foram exercitadas à mão; o que falta é o arnês reprovar sozinho quando alguém as desfizer.
- `a estimativa volta a sair da duração pedida` — troca `estimateSecondsFromScript(video.script)` por `video.duration_seconds` em `routes/videos.ts`. É o defeito 4 renascendo, e ele passou semanas invisível: espera-se a mensagem de que a estimativa deixou de vir do roteiro.
- `o ritmo vira número digitado em vez de derivado da medição` — troca `CHARS_PER_SECOND` pela constante redonda 12,8. **Esperto:** o arquivo continua tendo ritmo, a tela continua mostrando duração, e só a fronteira muda — 474 caracteres passam a dar 111 unidades onde o fornecedor debitou 108.
- `o teto de confirmação some do veredito do servidor` — fixa `requiresConfirmation: false` na rota de estimativa. O checkbox some da tela e um roteiro de 900 caracteres (US$ 3,50) gera com um clique.
- `o player volta a mostrar a duração pedida` — faz `durationLabel` devolver `video.duration_seconds`. É o defeito 5, e é o mais fácil de reintroduzir sem perceber, porque o campo continua na linha e continua sendo um número plausível.

**Item 2 da rodada — QUEM CONSOME `requestedUnitCount`: ninguém que decida nada. É RÓTULO.** Rastreado em 05/08: escrito em 6 lugares (`routes/videos.ts` e `usageTracking.ts:123` → coluna `requested_unit_count`), e do lado da leitura **`videos.ts` o SELECIONA e nunca o usa** — `linha.requested_unit_count` não aparece em nenhuma linha do handler. `adminPanel.ts` e `dashboard-summary` agregam `unit_count`, não o pedido; o frontend não o menciona. **Não reserva, não freia, não audita:** `debitCredit` cobra 1 crédito por vídeo (`amount ?? 1`), independente da duração, e o teto live conta gerações. A preocupação de "45 un reservadas para um vídeo de 108" **não se materializa** — não há reserva por unidade em lugar nenhum.

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
[00 referência](docs-internal/00-referencia-do-projeto.md) · [01 handoff e decisões](docs-internal/01-handoff-e-decisoes.md) · [02 ambiente e demo](docs-internal/02-ambiente-e-demo.md) · [03 blocos fechados](docs-internal/03-blocos-fechados.md) · [04 demos e estorno](docs-internal/04-demos-e-estorno.md) · [05 formatos e derivação](docs-internal/05-formatos-e-derivacao.md) · [06 TELA-1 e passadas live](docs-internal/06-tela1-e-passadas-live.md) · [07 voz e passo 1](docs-internal/07-voz-e-passo-1.md)

Gate: `docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check` · Arnês: `npm run check:mutants` · **mutante se identifica por NOME, nunca por posição.**

---

## 6 · Bloco de retomada — cole numa sessão nova

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
