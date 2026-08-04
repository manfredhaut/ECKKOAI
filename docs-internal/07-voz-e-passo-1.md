<!-- MOVIDO de CLAUDE.md em 2026-08-04, linhas 5309-5499 do arquivo original.
     Nada foi apagado nem reescrito nesta movimentação. -->

# VOZ-1, o ensaio E2E e o bloco do passo 1

### VOZ-1 + E2E-1 — captura de voz pelo produto, e o ensaio que a exercitou (2026-08-04)

Dois trabalhos, registrados juntos porque o segundo é a prova do primeiro. Tudo
em `fixture` do começo ao fim, **zero chamadas a fornecedor** (medido: 0
ocorrências de `api.elevenlabs.io`, `api.heygen.com` ou `vendor_response` na
janela do ensaio). Nenhum slot de voz real consumido.

#### O que o bloco de voz fecha (commit `a047359`)

Até aqui a **única** forma de clonar voz neste produto era
`POST /avatars/:id/reference-video`, e ela **treina o avatar antes de clonar** —
US$ 1,00 de `photo_avatar` mais 1 crédito. Quem quisesse só regravar a voz
pagava um treino novo e trocava uma aparência já aprovada. Agora existe
`POST /avatars/:id/voice-sample` ([routes/voice.ts](backend/src/routes/voice.ts)),
que clona sozinha: nenhum crédito debitado, nenhum avatar retreinado.

**A premissa que organiza o desenho: o slot é IRREVERSÍVEL.** Esta aplicação
não exclui vozes — não existe chamada a `DELETE /v1/voices/{voice_id}` em
caminho nenhum, e liberar um slot exige entrar no painel do fornecedor.
Registrado como `LACUNA_SEM_EXCLUSAO` em
[voiceSample.ts](backend/src/services/voice/voiceSample.ts).

**A ordem das verificações é crescente em custo**, e inverter as duas últimas
pareceria mais simples e seria pior:

| # | Guarda | Custo |
|---|---|---|
| 1 | **D** — formato por SNIFF de bytes + teto de 10 MB | bytes na mão |
| 2 | **A** — duração >= 60 s (aviso entre 60 e 90 s) | ffprobe local |
| 3 | **C** — substituição exige flag; voz aprovada recusa mesmo COM flag | linha já lida |
| 4 | **B** — slots, com o usado LIDO do fornecedor | 1 GET não tarifado |
| 5 | clonagem | consome o slot |

Deixar o fornecedor recusar por slot cheio traria a recusa **depois** de a
tentativa ter sido gasta, como um 4xx indistinguível dos outros.

**Decisões que valem registro:**

- **GUARDA A — 60 s é PISO, não recomendação.** O motivo está medido nesta
  conta: a única voz clonada com sucesso do projeto (`wAd9MJ2IK71FGs1FWjIX`)
  saiu de uma amostra de **15,37 s** e fala rápido. **O fornecedor NÃO recusa
  amostra curta** — entrega um clone pior e cobra o slot. A faixa 60–90 avisa
  em vez de recusar porque nada nesta conta mede a diferença entre 60 e 90 s.
- **GUARDA B — o teto é declarado, o usado é medido.** `voice_limit` vive em
  `/v1/user/subscription`, que dá **401** sem `user_read`. Assimetria
  deliberada: mede-se o que dá para medir, declara-se só o resto.
- **GUARDA C vale TAMBÉM no caminho antigo.** `avatars.ts` fazia
  `UPDATE avatars SET voice_id` incondicional. Lá a regra é **pular** a
  clonagem em vez de recusar a requisição: o treino acima já aconteceu e já
  custou US$ 1,00, e derrubar a resposta jogaria fora trabalho pago.
- **GUARDA D por SNIFF, nunca pelo tipo declarado**, que vem do cliente e um
  rename produz corretamente. `webm` está na whitelist porque é o que o
  `MediaRecorder` grava por padrão.
- **SEM rótulo de idioma na clonagem.** `labels` são metadados de catálogo e
  não afetam a síntese. **Um rótulo errado é PIOR que nenhum**, porque cria
  explicação falsa e plausível para um defeito real de pronúncia e manda a
  investigação para o lugar errado. Onde idioma de fato importa é a síntese, e
  lá continua lacuna aberta (`language_code` ausente do corpo).

**Arnês: 104/104** (eram 90). Os 14 novos deste bloco eram, naquela execução,
as posições **91–104**.

> **CORREÇÃO de 2026-08-04, e a regra que sai dela.** Depois que o bloco do
> passo 1 inseriu três mutantes ANTES deles, os mesmos 14 passaram a ocupar
> **91–103 e 107** — o "91–104" desta linha envelheceu em uma rodada. **Mutante
> se identifica por NOME (`guard :: name`), nunca por posição:** qualquer
> inserção no meio da lista renumera todos os posteriores, e um registro que
> aponta para números deixa de apontar para os mesmos mutantes na execução
> seguinte. Ao ler um relatório do arnês, case pelo nome.
5 são ESPERTOS e 1 é contraponto verde. O que mais importa é o **98**: faz o
caminho ANTIGO voltar a sobrescrever a voz, e é o único que separa "o caminho
novo é seguro" de "**nenhum** caminho substitui sem flag".

#### O ensaio E2E — 8 passos, todos FUNCIONARAM

Prova em `uploads/_prova/e2e-ensaio/` (`00-antes.log` `c425436d…`,
`01-ate-3a.log` `81ab7fcc…`, **`02-fim-atual.log` `51858229…` — é o que contém
o ensaio**, `03-anterior-rotacionado.log` `69c4640c…`, `transcodificado.mp3`
`93bf6bbd…`).

Avatar usado: **`test um` (`ecc3f232`)**, reusado de propósito — o Mário tem a
voz protegida e o `TESTE REAL` é reserva técnica; usar qualquer um dos dois
danificaria um ativo por causa de um ensaio.

**As 4 guardas, exercitadas contra o arquivo REAL** (não resumidas):

| Guarda | Entrada | Veredito |
|---|---|---|
| D | sniff `webm`; 2.461.198 <= 10.485.760 | `{ok:true}` |
| A | 152,82 s >= 90 s | `{ok:true}`, **sem** `warning` |
| C sem flag | voz existente | **`{ok:false, code:"voice_exists"}`** |
| C com flag | idem | `{ok:true}` |
| B | inventário `{total:1}`, limite 10 | `{ok:true}` |

No log, em ordem: `voice_sample_rejected` → `voice_sample_normalized` →
`voice_id_replaced`. **A recusa aconteceu de verdade e está registrada** — a
tela recebeu 409 antes de o operador confirmar a substituição.

#### 🟢 FECHA um NÃO VERIFICADO: o ffmpeg do container digere webm/opus

*MEDIDO em 04/08/2026, sobre a gravação real do operador (2:33 pela tela):*

| | Entrada | Saída |
|---|---|---|
| contêiner / codec | matroska/webm, **opus** | **mp3** |
| canais / taxa | mono, 48.000 Hz | **mono, 44.100 Hz** |
| bitrate | 128.841 bps | **128.000 bps** |
| duração | **152,820125 s** | **152,880000 s** (+0,06 s, arredondamento de quadro) |
| bytes | **2.461.198** | **2.447.194** |
| md5 | **`b3d6a735eb9a7632b9b3851737a0d2f2`** | **`93bf6bbdc3ef148955b24ab88839de2f`** |
| tempo | — | **983 ms** |

`normalizeVoiceSample` é **deliberadamente sem filtro** — nada de `afftdn`,
nada de `loudnorm`. O clone deve reproduzir a voz como ela é, e um redutor de
ruído mal calibrado come exatamente as características que a clonagem precisa
capturar. O tratamento agressivo existe do outro lado do fluxo, na síntese,
onde o material já é sintético.

**Continua NÃO VERIFICADO: se o ElevenLabs real aceita este mp3.** O transcode
está provado; o aceite do fornecedor, não.

#### 🟡 FECHA PARCIALMENTE a camada de tela

Captura por microfone, cronômetro, portão de escuta e envio foram
**exercitados pelo operador em 04/08** e funcionaram — a amostra chegou ao
backend, atravessou as quatro guardas e clonou. **No sentido estrito continua
NÃO VERIFICADO:** nenhuma guarda desta camada foi vista **reprovando por
automação**, porque o microfone é inacessível a esta ferramenta. É relato do
operador corroborado por efeito no banco e no disco, não medição da sessão.

#### Restante do percurso

**Geração:** `readiness` 200 `{"ready":true,"blockers":[]}` → `POST /videos`
**201** (`bacb615b…`, 16:9/720p, `simulated:true`) → `queued` → `processing` →
**`ready` em ~15 s**, coerente com os 12 s de `processing` da fixture. Crédito
de vídeo 2 → 1.

**Biblioteca:** o vídeo novo no topo com `simulated=t`, e logo abaixo
`8d28fd47` com `simulated=f` — **o par continua sendo a melhor prova do badge
que este projeto tem**. Arquivo em disco: 201.373 bytes, md5
`dec4b88751e212d3098514730e08dbe0`, h264 640×360 + aac, 5,00 s.

**Desvio de fixture, e a evidência é contraintuitiva:** a tela exibiu
**"2 de 10"** vozes. `listVoicesFixture()` devolve `{total:1}` e a rota mostra
`total + 1`. **A conta real tem 4 vozes** — se a rede tivesse sido tocada, a
tela diria "5 de 10". **O número errado é a prova de que a rede não foi
tocada**, não um defeito.

#### Três defeitos ACHADOS e NÃO corrigidos

1. **`voice_id_replaced` nasce inútil.** Sai com
   `previousVoiceId:"***REDACTED***"` e `newVoiceId:"***REDACTED***"` — o
   sumidouro redige por FORMA (bloco opaco de 40+ caracteres) e um
   `fixture-voice-<uuid>` tem 49. **O evento existe exatamente para preservar o
   id antigo antes de ele ser sobrescrito, e a redação apaga justamente isso.**
   Conserto provável: registrar só um prefixo curto, ou uma allowlist de campo.
2. **O texto da tela diverge da política.** Diz "Grave de 1:00 a 1:30", que se
   lê como faixa fechada; a política **não tem teto** e 2:33 passou como
   `{ok:true}` sem aviso, ou seja "boa duração". Os dois números são o mínimo e
   o início da faixa recomendada, não um intervalo. Quem gravar 2:30 acha que
   errou.
3. **Lacuna de observabilidade: treino em fixture é invisível no log de
   eventos.** `trainAvatarFixture` e `cloneVoiceFixture` não emitem `logEvent`
   nenhum, e `audio_raw_saved` pertence à síntese. *MEDIDO:* o treino do ensaio
   deixou **só** a linha HTTP do Fastify. Quem auditar um treino simulado pelo
   log de eventos não encontra nada.

#### `RestartCount=3` — investigado, causa NÃO ENCONTRADA no log

O item foi investigado e **a causa direta não foi achada**. O que está medido,
e o que cada dado descarta:

| Dado | Valor | Descarta |
|---|---|---|
| `ExitCode` | **0** | parada limpa, não crash com erro |
| `OOMKilled` | **false** | estouro de memória pelo cgroup |
| `HostConfig.Memory` | **0** (sem limite) | teto de memória do container |
| `State.Error` | vazio | erro registrado pelo daemon |
| `Health.Log` | **todos `exit=0`** | healthcheck derrubando o serviço |
| busca por `uncaught`/`unhandled`/`FATAL`/`heap`/`npm ERR`/`SIGKILL` | **0** nos dois logs | exceção não tratada visível |
| **StartedAt dos 4 serviços** | traefik 09:28:18,196 · frontend 09:28:18,235 · postgres 09:28:18,251 · **backend 09:28:25,161** | falha isolada do backend |

**O ambiente inteiro subiu junto**, com ~7 s de atraso no backend (compatível
com `depends_on: service_healthy`). Só o backend tem contagem diferente de
zero, e ele é o único cujo entrypoint **morre de propósito** quando o
bootstrap falha (bloco ACESSO-FINAL).

**Hipótese coerente, DEDUZIDA e NÃO confirmada:** na retomada do ambiente o
backend tentou migrar antes de o Postgres aceitar conexões, saiu com código
diferente de zero, e a política `unless-stopped` o reergueu — três vezes, até
o Postgres responder. Explica a contagem e explica por que só ele a tem.

**Por que não foi confirmada, e isto é o ponto:** o log daquele instante é
**inalcançável**. O boot foi 09:28:25; a janela de `--tail 500` começa
09:31:57; e `--tail` maior, `--since` e `docker logs` puro caem todos no
arquivo rotacionado, que termina 09:20:34. **Não existe janela que cubra
09:28.** Fica **NÃO VERIFICADO** — e é caso exemplar do gotcha de log
registrado na seção de gotchas: a evidência não se perdeu por descuido, foi
tornada inacessível pela ferramenta.

---

### PASSO1-1 — a coluna legível de cima para baixo (2026-08-04)

Ver a mensagem do commit para o detalhe. O que precisa sobreviver aqui:

**O defeito central era de ORDEM, não de ausência.** O botão `Avançar` era
renderizado logo abaixo de "Novo avatar", antes da grade e do bloco de voz —
os quatro elementos estavam todos lá, só em ordem errada, e nenhuma contagem
de ocorrências pega isso. Por isso a guarda verifica **posição** no arquivo.
Ordem correta: texto → novo avatar → grade → voz → avançar.

**Bloco de voz recolhido quando já existe voz, aberto quando falta.** O default
é proteção: o bloco vive dentro do fluxo de criar vídeo, percorrido muitas
vezes por avatar, e uma amostra gravada por engano substitui a voz de forma
irrecuperável.

**Pendências avisam, não bloqueiam**, com os `blockers` de `POST
/videos/readiness` exibidos como vieram. O filtro por prefixo `avatar_` é
seleção de exibição, não regra nova — `empty_script` viria sempre no passo 1.

**Os dois defeitos do E2E-1 foram corrigidos:** `voice_id_replaced` passou a
logar 8 caracteres via `voiceIdForLog()` — o log recebe MENOS em vez de a
redação receber exceção —, e o texto de duração passou a derivar da política,
sem fallback numérico.

#### 🔴 NÃO VERIFICADO — as guardas por regex e a reformatação

*MEDIDO em 2026-08-04, e é a limitação mais importante deste arnês.*

As guardas que varrem o código-fonte casam **texto**, não árvore sintática.
Exercitado: reformatar `const [expanded, setExpanded] = useState(!avatar.voice_id);`
para a forma equivalente com espaços e quebra de linha fez a guarda **acusar
código correto** — falso positivo. Foi corrigido por normalização (espaço,
quebra e vírgula final), e o gate voltou a passar nas duas formas.

**O que continua NÃO VERIFICADO, e é o lado perigoso:** um falso positivo
GRITA — o gate fica vermelho e alguém investiga. Um falso NEGATIVO é mudo: se
uma reescrita equivalente (extrair para constante, inverter com ternário,
trocar por `useMemo`) fizer o padrão deixar de casar **no ponto que ele
deveria acusar**, a guarda vira inerte em silêncio e o resumo verde afirma que
está tudo certo. Nenhuma das guardas por regex deste projeto foi exercitada
contra reescrita equivalente — só contra os mutantes declarados, que são
edições textuais dirigidas. **Registrado, não corrigido.** O conserto real é
análise sintática, não regex melhor.
