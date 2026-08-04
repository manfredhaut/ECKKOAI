<!-- MOVIDO de CLAUDE.md em 2026-08-04, linhas 2842-3307 do arquivo original.
     Nada foi apagado nem reescrito nesta movimentação. -->

# Alternância de conta, DEMO-1 a DEMO-4, ESTORNO-1, LOG-1 e POLL-1

## 9. Notas sobre alternância de conta

Este projeto é trabalhado alternando entre duas contas do Claude Code (pessoal
e manfred@smartinovat.com) para evitar travar em limites de uso. O histórico de
conversa NÃO é compartilhado nativamente entre contas — por isso este arquivo é
a fonte de verdade sobre o estado do projeto, não a conversa em si.

---

### Bloco DEMO-1 — caminho principal do MVP, ponta a ponta (CONCLUÍDO)

Objetivo: foto → avatar → voz clonada → vídeo → download, funcionando de
verdade, **sem gastar um centavo**. Rodado inteiro em `PROVIDER_MODE=fixture`.
**Zero chamadas a HeyGen, ElevenLabs, Gemini ou Anthropic** — confirmado por
`read_network_requests` no navegador e por varredura do log do backend.

**1. Validação de artefato de vídeo**
([videoArtifact.ts](backend/src/services/videoArtifact.ts)). Dois critérios,
e os dois são necessários: piso de **100 KB** e assinatura **`ftyp` nos bytes
4..8**. Tamanho sozinho aceita uma página de erro HTML de 200 KB; assinatura
sozinha aceita um mp4 truncado nos primeiros quilobytes — o modo de falha real,
porque uma transferência interrompida produz um prefixo VÁLIDO, não lixo.

Aplicada em **dois** pontos: ao marcar o vídeo como `ready` (artefato inválido
vira `error`, **nunca** `ready`) e no download. O do download **bufferiza** o
arquivo antes de enviar — em streaming só dá para inspecionar o começo, e a
única forma de garantir "os bytes que entrego são os bytes que validei" é ter o
arquivo inteiro antes de mandar o primeiro. Custo: memória proporcional ao
arquivo (o maior vídeo real medido tem 2,6 MB). Se um dia houver vídeo de
centenas de MB, isto precisa virar validação em disco — **não** voltar a ser
streaming cego.

*Provado reprovando, no caminho HTTP real:* vídeo apontando para um arquivo
truncado em 50 KB → **HTTP 422** com frase em pt-BR, detalhe técnico só no log
(`artifact_rejected`); o mesmo vídeo íntegro → **200**, 203.567 bytes,
`ffprobe` confirma h264+aac. Também testado em tabela: 16 bytes, truncado em
50 KB, HTML de 200 KB, exatamente no piso, e um byte abaixo — todos com o
veredito correto.

**2. A fixture era menor que o próprio piso.** `simulated-video.mp4` tinha
49,4 KB — um mp4 legítimo, mas que a regra nova recusaria. Regenerada com
ffmpeg para **198,8 KB** (h264 640×360 5 s + aac). Fixture é versionada e
copiada pelo Dockerfile: trocá-la exige `docker compose build backend`.

**3. `.mp4` órfãos de 16 bytes — origem RESOLVIDA.** São 2, ambos em
`uploads/4bbed629-…/`, e contêm literalmente o texto `fake video bytes`. O
tenant dono **não existe mais**, e nenhuma linha de `avatars` ou `videos` os
referencia: são resto de teste de uma sessão antiga. **Não foram apagados** —
decisão do usuário. Isso fecha a metade "origem" da Parte 5 do PENDENCIAS-1.

**4. Achado mais sério do bloco: não havia como enviar foto de arquivo.**
Concluir o passo 1 exige **3 fotos**; o botão "Capturar" depende de
`camera.ready`; e não existia alternativa nenhuma — enquanto o vídeo de
referência, logo abaixo, sempre teve o seu "ou envie um arquivo". A assimetria
não era intencional. **Numa máquina sem câmera, criar avatar era impossível** —
e a câmera é bloqueada em toda automação registrada deste projeto.

Corrigido em [AvatarSetupStep.tsx](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx):
botão "Ou enviar foto de arquivo", múltipla seleção, envio **em sequência**
porque o backend ANEXA a `photo_urls` (não grava por índice) e paralelizar
deixaria a ordem à mercê de qual requisição chega primeiro. Fica fora dos
slots, e não dentro de cada um, para não prometer escolha de posição que o
backend não oferece.

**5. Passada completa dos 5 passos, medida no navegador.** Fotos por upload
(3/3) → vídeo de referência → treino + clonagem de voz (`fixture-avatar-…` e
`fixture-voice-…`, `simulated=t`) → avatar selecionável no passo 3 → roteiro
digitado → cenário e traje por prompt → 30 s → geração. Resultado: vídeo
`ready` com o aviso **SIMULADO** na tela, player renderizando, e download
**200 / 203.567 bytes / `ftyp` válido**.

*Ledger conferido:* `video −1 consumption simulated=t` e
`avatar −1 consumption simulated=t`. **Marcado como simulado, não como consumo
real** — que é o ponto do `credit_ledger.simulated`.

*De passagem, ficou verificado por olho o que o VIDEO-0 deixou cego:* o bloco
de fundo virtual aparece inerte **com o motivo** ("depende de teste ainda não
realizado com a HeyGen"), sem seletor.

**6. `npm run preflight:live`**
([preflightLive.ts](backend/src/scripts/preflightLive.ts)) — verifica e
imprime, **sem chamar fornecedor nenhum**. Um preflight que gasta cota é uma
contradição: a carteira comporta cerca de um vídeo, e "o preflight consumiu a
geração da demo" seria o pior desfecho. Também **não imprime valor de chave
nem os 4 últimos** — na véspera de uma apresentação, esta saída é exatamente o
tipo de coisa que acaba colada num chat ou fotografada numa tela compartilhada.

A validação de download é verificada **exercitando a função**, não lendo uma
flag: uma flag diria "ligada" mesmo com a lógica esvaziada.

*Erro que a primeira versão cometeu e vale registrar:* ela **bloqueava** por
falta das chaves de plataforma de HeyGen/ElevenLabs, logo acima de uma linha
dizendo que quem paga a geração é a credencial do TENANT. As duas não podiam
ser verdade juntas. Agora as chaves de plataforma são informativas e o que
bloqueia é a credencial do tenant existir. **Reprovar por algo que live não
precisa é pior que não verificar: ensina a ignorar o preflight.**

Saída atual: `FALTA PARA LIVE: PROVIDER_LIVE_CONFIRM` (sai 1). Tudo o mais
verde — credenciais de tenant conectadas, teto de 1 geração, validação ativa,
34 migrations, `/api/health` 200.

### O que NÃO pôde ser provado sem live (DEMO-1)

Nada disto é dúvida sobre o código; é o que fixture, por definição, não
exercita:

- **Que a HeyGen aceita nossas fotos e produz um avatar utilizável.**
  `trainAvatarFixture()` ignora `photo_urls` — em fixture, três retângulos
  coloridos "treinam" tão bem quanto um rosto. Só live diz se o formato, a
  resolução e o enquadramento servem.
- **Os contratos `// ASSUMPTION`** (Basic auth da D-ID, `avatar_item.id` da
  HeyGen) continuam sem confirmação formal.
- **Que a voz clonada sai parecida.** `cloneVoiceFixture()` devolve um id; não
  há áudio a julgar.
- **Que o artefato real passa na validação nova.** O vídeo real de 2,6 MB já
  medido passaria com folga, mas isso é dedução a partir do tamanho — nenhum
  arquivo vindo do HeyGen atravessou o validador ainda.
- **Que o `Range` do CDN do vendor funciona como esperado.** `probeArtifact()`
  tem retaguarda para 200 (baixa inteiro), então o caminho está coberto; qual
  dos dois ramos o HeyGen usa, não se sabe.
- **Captura por câmera**, em qualquer passo. Bloqueada em toda sessão
  registrada. Só o usuário consegue validar.

---

### Bloco DEMO-2 — teto de upload do vídeo de referência (CONCLUÍDO)

**Sintoma:** gravar pela câmera falhava com `413 request file too large` em
`POST /avatars/:id/reference-video`.

**Os três tetos, medidos antes de mudar qualquer coisa:**

| Onde | Valor | Observação |
|---|---|---|
| `bodyLimit` do Fastify | **1.048.576 B (1 MiB)** | padrão do Fastify 4, nunca sobrescrito |
| `fileSize` do `@fastify/multipart` | **1 MiB, herdado** | `index.js:52` faz `options.limits?.fileSize \|\| fastify.initialConfig.bodyLimit`, e `app.register(multipart)` sobe sem opções |
| Traefik | **nenhum** | não há `buffering` nem `maxRequestBodyBytes` em `traefik/` |

Era o segundo. Uma gravação de webcam passa de 1 MiB em poucos segundos.

**O teto sobe SÓ nesta rota**, via `req.file({ limits: { fileSize } })` — não
no registro do plugin. Subir globalmente valeria também para documentos e
imagens de referência, que não precisam de nada perto disso, e um teto alto
onde não é necessário é superfície de ataque de graça: qualquer rota de upload
viraria um jeito barato de encher disco e memória. Valor em
`REFERENCE_VIDEO_MAX_BYTES`, padrão 100 MB
([uploadLimits.ts](backend/src/services/uploadLimits.ts)).

**O estouro é tratado em DOIS pontos**, porque `@fastify/multipart` pode
lançar tanto em `req.file()` quanto em `toBuffer()` (`index.js:379`, quando o
stream já foi truncado). Tratar só o primeiro deixaria o caso comum — arquivo
grande que começa a chegar normalmente — cair como 500.

**Erro legível.** A frase crua não permite decidir nada: não diz quanto foi
enviado nem quanto cabe, então quem recebe não sabe se corta 5 s ou 5 min.
*Medido:* `413 {"error":"file_too_large","message":"O envio tem 105,8 MB e o
limite é 100,0 MB. Grave um trecho mais curto ou envie um arquivo menor."}`.
O `sentBytes` vem do `Content-Length` e inclui o cabeçalho multipart — é o
tamanho do ENVIO, alguns bytes acima do arquivo; inventar precisão que não
temos seria pior.

**Validação no cliente, antes de enviar.** *Medido no navegador:* arquivo de
105 MB entregue ao input → erro na tela com tamanho e limite, e **zero**
requisições a `reference-video` (só polling de notificação). Não substitui o
servidor, que continua sendo a autoridade — evita subir dezenas de MB para
receber 413 no fim.

**Cap de duração: 120 s, não 60 s.** O número foi escolhido pelo que os
fornecedores precisam para dar qualidade, não por conforto: amostra curta
piora perceptivelmente a clonagem de voz, e a qualidade melhora até cerca de
1–2 min de fala limpa, estabilizando depois. A ~2,6 Mbps isso dá ~39 MB, com
folga dentro dos 100 MB. Configurável em `MAX_RECORDING_SECONDS`.
**Estes números vêm da orientação publicada dos fornecedores, não de medição
nossa** — nenhum avatar deste projeto foi treinado com durações diferentes
para comparar.

O bitrate passou a ser declarado (2,5 Mbps vídeo / 128 kbps áudio). Não é
compressão, é previsibilidade: o padrão do navegador varia muito por
dispositivo, e com ele variando não dá para prometer que a duração máxima cabe
no teto de tamanho.

**Contador visível durante a gravação**, com parada automática no teto. Um
limite que só aparece no instante em que corta é indistinguível de um defeito.

**O que NÃO pôde ser verificado:** o contador e a parada automática **na UI
real**. O botão de gravar depende de `camera.ready`, e a câmera é bloqueada em
toda automação registrada. Verificado o que dá: as opções de bitrate são
aceitas pelo `MediaRecorder` (uma opção errada lançaria) e a mecânica de parar
por tempo produz blob — provado com `canvas.captureStream()`, que é um
`MediaStream` real sem câmera. **A fiação hook↔UI é dedução, não medição.**

**Achado colateral, NÃO corrigido:** uma falha do provedor **consome o crédito
mesmo assim**. `debitCredit()` roda antes de `trainAvatar()`, e não há
estorno — durante este bloco, um treino que falhou por falta de foto zerou o
crédito de avatar do tenant e o teste seguinte levou `403`. Em live isso
significa perder crédito pago por um erro que não chegou a gastar cota do
fornecedor.

---

### Bloco ESTORNO-1 — crédito não morre por falha do fornecedor (CONCLUÍDO)

**O defeito, achado no DEMO-2:** `debitCredit()` roda antes da chamada ao
fornecedor e não havia estorno. Um treino recusado por falta de foto zerou o
crédito de avatar do tenant, e a tentativa seguinte levou `403`. Em live é
crédito pago perdido por um erro que nem chegou a gastar cota.

**Mapa dos débitos (levantado antes de mexer):**

| Caminho | Onde debita | Defeito? |
|---|---|---|
| Avatar (`avatars.ts`) | antes de `trainAvatar()` | **sim** |
| Roteiro (`scripts.ts`) | antes de `generateScript()` | **sim** |
| Vídeo (`videos.ts`) | antes de `generateVideo()` | **sim** |
| Clone de voz (`avatars.ts`) | não tem débito próprio | n/a — viaja no crédito de avatar |

**Estava nos TRÊS**, não só no avatar. Os três seguiam o mesmo padrão: debita,
chama o fornecedor num `try`, e o `catch` só devolvia erro ao cliente.

**O débito continua onde estava.** Movê-lo para depois da chamada eliminaria o
estorno, mas abriria corrida: duas requisições simultâneas passariam as duas
pela verificação de saldo e as duas gastariam cota. Cobrar e devolver é melhor
que arriscar gastar o que não existe.

**ONDE ESTÁ A LINHA DO QUE NÃO ESTORNA** — a decisão que mais importa aqui:

- **Estorna:** a chamada ao fornecedor lançou. Nada produzido, nenhuma cota
  externa gasta.
- **NÃO estorna:** qualquer falha depois de o fornecedor aceitar o trabalho.
  No vídeo, o corte é exato: assim que `generateVideo()` devolve
  `providerJobId`, o job está enfileirado lá. Falha de polling, artefato
  inválido (bloco DEMO-1) e download quebrado **não** estornam — o fornecedor
  renderizou e a cota dele foi gasta. Devolver aí transformaria problema de
  entrega em crédito grátis.
- **Caso de fronteira que já existe:** em `avatars.ts` o treino pode ter
  SUCESSO e a clonagem de voz falhar em seguida. **Não estorna:** o crédito de
  avatar pagou o treino, e o treino aconteceu. Está comentado no código, no
  `catch` da voz.

**Linha própria no ledger** (`reason = 'refund'`, migration `035`), nunca um
`consumption` positivo. O débito é preservado: sem os dois movimentos, um
relatório de consumo mostraria zero — verdadeiro no saldo e mentiroso sobre o
que aconteceu, já que a tentativa existiu e falhou.

**Idempotência em duas camadas.** A aplicação checa depois do `FOR UPDATE`
(mesmo padrão de `grantPurchasedCredit`), e três **índices únicos parciais**
cobrem o que o lock não cobre: caminho novo que esqueça de checar, e o dia em
que houver mais de uma réplica. Crédito devolvido duas vezes é dinheiro criado
do nada — o tipo de erro de que ninguém reclama, e que só aparece na
conciliação. Chamada sem referência é **recusada** (`no_reference`) em vez de
adivinhar: sem chave de idempotência, um estorno que pode repetir é pior que
nenhum.

*Medido, no caminho HTTP real:* saldo 1 → falha do fornecedor → saldo **1**,
com `−1 consumption` e `+1 refund` na mesma tentativa. Segundo estorno da
mesma tentativa → `{"refunded":false,"reason":"already_refunded"}`, saldo
inalterado, **1** linha de estorno. `INSERT` duplicado direto no banco →
recusado pelo índice único. Caminho de sucesso → saldo 1 → **0**, com apenas
`−1 consumption` e nenhum estorno.

**Duas guardas novas em `npm run check`, ambas provadas reprovando:** rota que
chama `debitCredit()` sem `refundCredit()` (removi o estorno de `scripts.ts` e
o build reprovou), e ausência do motivo `'refund'` no CHECK das migrations —
sem ele, todo estorno explodiria em tempo de execução, no caminho de erro, que
é o menos exercitado. A guarda também reprova se **nenhuma** rota debitar,
para não passar verde por ter deixado de casar com o código.

**Recusa de upload que orienta.** A mensagem dizia tamanho e limite, o que
deixa a pessoa adivinhando qual alavanca puxar — e a mais provável de tentarem
primeiro (regravar mais curto) costuma ser a errada, porque o problema quase
sempre é a câmera em 4K. Agora manda baixar para 1080p primeiro, e encurtar só
se ainda passar. **Cliente e servidor com a frase idêntica** (medido nos dois).

**Orientação antes de gravar**, na tela de configuração: 1080p a 30fps, 2 a 5
minutos para melhor resultado, 30 segundos já funcionam. É texto, não
validação — nada bloqueia o envio. Dizer isso depois, na recusa por tamanho ou
num avatar de qualidade ruim, custa uma regravação inteira.

---

### Blocos LOG-1 e POLL-1 — ver a resposta antes de interpretá-la (CONCLUÍDOS)

**LOG-1.** Toda resposta de vendor passa por `fetchJson()`, que virou o ponto
único de captura: corpo **inteiro** no log (evento `vendor_response`) **antes**
de qualquer parsing, com um `context` que diz qual das sete chamadas foi
(4 HeyGen + 3 D-ID). O motivo é o `// ASSUMPTION` de `data.avatar_item.id`,
nunca confirmado: se o parser errar em live, a HeyGen já cobrou e o id — única
coisa que torna o avatar utilizável — se perderia com o corpo descartado.

As mensagens de erro passaram a **nomear a forma recebida**, chave por chave.
"Campo ausente" não ajuda; `{data: {avatar: {avatar_id: …}}}` diz na hora onde
o contrato mudou.

**Defeito que a própria prova pegou:** a primeira versão logava o objeto
mascarado **e** o texto cru lado a lado, e a chave aparecia legível no segundo
campo. Um segredo mascarado num campo e legível no seguinte não está mascarado.
Hoje: JSON → só o objeto mascarado (que é o corpo inteiro); não-JSON → texto com
varredura de padrões. *Medido:* 3193 → 3170 bytes, diferença só da redação.

**Cabeçalho de requisição nunca vai ao log** — é onde a chave viaja. Da
resposta, só uma allowlist. **Não suba o logger do Fastify para `trace`:** ele
registraria o `x-api-key` por um caminho que este arquivo não controla.

**POLL-1.** `status: completed` sem `video_url` **falha na hora**. Antes caía no
`return { status: "processing" }` do fim da função — uma decisão que ninguém
chegou a escrever — e o job ficava em polling até o teto de ~7,5 min,
terminando como "demorou mais que o esperado". O vídeo não demorou: ficou
pronto, foi cobrado, e nós é que não soubemos ler a resposta. Mesmo tratamento
no `did.pollTalk`.

**Este caso NÃO estorna, e isso está confirmado no código, não suposto:**
`refundCredit()` só é chamado no `catch` de `generateVideo()`
([videos.ts:254](backend/src/routes/videos.ts:254)); o laço de polling nunca
estorna, e este caminho volta por ele. É exatamente a fronteira do ESTORNO-1 —
o fornecedor entregou, nós é que não lemos.

**Guarda nova** ([checkPollPolicy.ts](backend/src/scripts/checkPollPolicy.ts)),
exercitando o caminho REAL (`pollVideoJob`, incluindo `fetchJson` e o log) com
`fetch` substituído — nenhuma chamada de rede. Quatro formas de resposta, com
os contrapontos que impedem a guarda de virar "sempre erro": `processing`
continua processando e `completed` com URL continua pronto. **Provada
reprovando duas vezes:** ao restaurar o `processing` antigo, e ao tirar a
menção a estorno da mensagem.

`PROVIDER_MODE` é trocado e restaurado em `finally`, e a guarda **verifica que
voltou** — deixar o processo do check em live seria um efeito colateral caro.

---

### Bloco DEMO-3 — o que a primeira passada live ensinou (CONCLUÍDO)

**A medição que mais importa: um avatar custa ~US$ 1,00 de verdade.** Carteira
HeyGen **16,50 → 15,50** por UM `photo_avatar`. Isso é dinheiro observado, não
estimativa.

**A tabela `provider_cost_rates` NÃO corresponde a isso.** Ela cobra vídeo por
`duration_seconds` *pedido* e voz por `script.length`, e **não tem linha nenhuma
para criação de avatar** — o custo que realmente apareceu na fatura. Ou seja: o
único custo medido até hoje é o único que a tabela não modela. Toda tela de
custo continua sendo estimativa sobre estimativa, agora com prova de que a
ordem de grandeza real existe e não passa por lá.

**O `// ASSUMPTION` de `data.avatar_item.id` está CONFIRMADO.** A resposta real:

```
data.avatar_item = { id, avatar_type: "photo_avatar", status: "processing",
                     group_id, supported_api_engines: ["avatar_iv","avatar_iii"], ... }
```

Três achados de graça, que só o LOG-1 tornou possíveis:
1. **`supported_api_engines` existe** — este avatar aceita `avatar_iv` e
   `avatar_iii`. A pergunta do bloco MOTOR-1 ("existe campo de motor?") tem
   resposta: o fornecedor DECLARA os motores por avatar. Continuamos sem
   enviar nenhum na geração.
2. **`status: "processing"`** — o avatar não fica pronto na hora. Nada no
   código espera por isso.
3. `avatar_type: "photo_avatar"` confirma o tipo criado.

**Os três defeitos medidos:**

**(A) Teto de upload por rota.** O DEMO-2 subiu o limite só na rota do vídeo de
referência; as outras quatro continuaram no padrão herdado de 1 MiB. `POST
/uploads` (cenário e traje do passo 3) recusava qualquer foto de celular.
Corrigido com um teto de **25 MB para as três rotas de imagem** — tamanho de
foto de celular moderno, e ainda bem abaixo dos 100 MB de vídeo.

O `try/catch` virou um helper único (`takeUpload` em `uploadLimits.ts`), porque
a duplicação foi exatamente o que deixou quatro rotas para trás. A orientação
da recusa agora é por tipo: vídeo manda baixar de 4K para 1080p, imagem manda
reduzir resolução — a alavanca é diferente e a errada custa uma regravação.

**`POST /documents` continua em 1 MiB, de propósito** (fora do escopo do
bloco): um PDF acima disso é comum, e essa rota vai falhar do mesmo jeito.

**(B) Gate de crédito.** O crédito de avatar zerou porque a criação live
consumiu o único que havia — comportamento correto, mensagem no lugar errado:
aparecia na coluna da câmera, do outro lado da tela do botão que falhou. Agora
fica na coluna das ações. E `GenerateStep` tinha `try/finally` **sem `catch`**:
um 403 virava promise rejeitada sem dono e a tela não dizia nada.

Recarregar crédito de dev agora tem caminho próprio:
```bash
docker compose exec backend npm run dev:grant-credits -- --slug dev-c77a5b --avatar 2
```
Ele escreve saldo **e** linha de ledger na mesma transação. `UPDATE` manual
escreve só o saldo, e os dois divergem em silêncio — **já aconteceu**: as
limpezas de teste do DEMO-1 e do ESTORNO-1 deixaram o avatar do tenant de dev
com ledger somando 1 e saldo 0. O script detecta e AVISA da divergência, sem
corrigir: decidir qual dos dois está certo não é decisão de script.

**(C) A causa não era o fornecedor.** O passo 5 falhou com "Não foi possível
concluir a operação no serviço de vídeo" — e **a HeyGen nunca foi chamada**. O
log mostra exatamente 2 requisições no dia (`uploadAsset`, `createAvatar`),
nenhuma para `/v3/videos`.

A causa é o **nosso** teto de sessão: `PROVIDER_LIVE_MAX_GENERATIONS=1`,
compartilhado entre clonagem de voz e geração de vídeo. Configurar o avatar
clonou a voz e consumiu a cota inteira; o vídeo seguinte foi recusado por nós
mesmos, e o sanitizador de erro de vendor transformou isso numa frase que
manda procurar defeito na HeyGen.

Agora é `LiveBudgetExhaustedError`, classe própria, tratada ANTES do
sanitizador: diz que o limite é local, que nada foi cobrado, que é
compartilhado com a voz, e que **um fluxo completo precisa de pelo menos 2**.
No caminho do avatar a mensagem diz também que o treino deu certo e só a voz
faltou — senão o operador refaz um treino que já custou US$ 1.

**Nada a recuperar do vídeo que falhou:** ele nunca foi gerado nem cobrado. O
avatar live (`provider_avatar_id` + `voice_id`) está no banco e é utilizável.

**Gotcha de log, medido:** `docker compose logs > arquivo.log` no PowerShell
grava em **UTF-16LE**, e `grep` não acha nada dentro. Use
`docker compose logs | Out-File -Encoding utf8`, ou converta antes de ler.

---

### Bloco DEMO-4 — os dois bloqueios do caminho live (CONCLUÍDO)

**1. O teto de sessão conta VOZ e VÍDEO juntos.** Esta é a frase que faltava.
`PROVIDER_LIVE_MAX_GENERATIONS` tem cara de "gerações de vídeo", mas
`consumeLiveGeneration()` é chamado em `cloneVoice()` **e** em
`generateVideo()`. Com o padrão de 1, configurar um avatar clona a voz, gasta a
única unidade, e o vídeo seguinte é recusado — foi exatamente isso que matou o
passo 5 na primeira passada live.

A mensagem agora diz **o que** consumiu, em ordem (`clonagem de voz → geração
de vídeo`), que o limite é DESTE aplicativo e não do fornecedor, que nada foi
cobrado, e como sair. *Provado reprovando:* removi o trecho que nomeia o
consumo e `npm run check` acusou.

**2. O avatar volta em `processing` e agora é esperado.**
`waitForAvatarReady()` roda dentro da requisição de treino: espera até 90 s,
consultando de 5 em 5. Estourar o tempo **não é erro** — grava `processing`, e
a tela passa a dizer "em treino". Quem estoura o tempo é a nossa paciência, não
o avatar.

O portão de geração está em `videos.ts` e devolve **409 `avatar_still_training`**.
*Provado nos dois sentidos:* `processing` → 409 com crédito intacto (video=2
antes e depois); `ready` → 201 `queued`. E provado reprovando: trocando a
condição por `if (false)`, o avatar em treino passou — e a guarda textual nova
acusou a remoção.

**A regra de quem passa importa mais que a de quem barra:** só `processing`
bloqueia. `NULL` (avatares criados antes da migration 036 — inclusive o avatar
live que a demo usa) e `unknown` (perguntamos e não entendemos a resposta)
**liberam**. Travar um avatar já pago por causa de uma suposição nossa seria
pior que deixar a tentativa seguir e o fornecedor recusar.

**`GET /v3/avatars/{id}` é ASSUMPTION**, não confirmado. Por isso qualquer
falha de leitura vira `unknown`, que libera: se a suposição estiver errada, o
comportamento degrada para o de antes deste bloco, e não para um avatar preso.
O corpo bruto vai ao log e confirma ou corrige na primeira vez em live.

**3. `supported_api_engines` existe na resposta de criação** —
`["avatar_iv", "avatar_iii"]` para o avatar criado hoje. O fornecedor DECLARA
os motores aceitos por avatar. **Registrado, não implementado:** continuamos
sem enviar motor nenhum em `POST /v3/videos`, então o vídeo sai no padrão da
conta. Isto é o insumo que faltava para a "derivação de formatos".

**Correção de registro do DEMO-3:** aquele bloco afirmou que `GenerateStep`
tinha ganhado o `catch` que faltava. **Não tinha.** O script de edição relatou
sucesso sem casar o texto, e o `tsc` passou porque as duas metades faltaram
juntas — o estado do erro e o bloco que o exibe. Aplicado de verdade agora.
Lição já registrada em outros blocos e repetida aqui: substituição por script
que não confirma o resultado é indistinguível de sucesso.

