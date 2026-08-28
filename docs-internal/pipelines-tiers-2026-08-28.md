# Os 3 pipelines de geração de vídeo — Simples, Normal, Premium

Documentação por LEITURA DE CÓDIGO, 28/08/2026, HEAD `84d6c25a8a1a597a3cbeb42d1e1fee6b782660e2`.
Nenhuma chamada a vendor foi feita para produzir este documento — toda afirmação
vem de arquivo:linha, citado inline. Onde o próprio código já marca uma
afirmação como MEDIDO, DEDUZIDO ou NÃO VERIFICADO, essa marca foi preservada.

O roteamento por tier tem UMA fonte: `vendorRequiredByTier()` —
[falPipeline.ts:191-193](../backend/src/services/video/falPipeline.ts#L191):
`"simples"` exige vendor `heygen`; `"normal"` e `"premium"` exigem vendor `fal`.
Dentro de `fal`, `videoTierParaPipeline()` — [falPipeline.ts:175-177](../backend/src/services/video/falPipeline.ts#L175)
— decide só o MOTOR de animação (`"normal"`→Wan, `"premium"`→Seedance); `"simples"`
nunca chega a este arquivo.

---

## MECÂNICA COMUM AOS 3 TIERS — leia antes das seções por tier

Duas etapas do fluxo são **idênticas nos três tiers**, porque a decisão de
tier só acontece depois delas, no passo Cena. Cada seção "1" e "2" abaixo
remete a este bloco em vez de repeti-lo.

### Criação do avatar (comum aos 3 tiers)

- **Foto** — `POST /avatars/:id/photos` ([avatars.ts:370](../backend/src/routes/avatars.ts#L370)):
  só grava a URL em `photo_urls` (`UPDATE avatars SET photo_urls = photo_urls || ...`).
  **Nenhuma chamada de vendor.**
- **"Concluir configuração"** — `handleFinishSetup()` ([AvatarSetupStep.tsx:763](../frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx#L763)):
  persiste estado local/wizard. **Nenhuma chamada de vendor.**
- **Vídeo de referência (treino) — o ÚNICO ponto de custo real na criação do
  avatar, para os 3 tiers.** Duas ações na tela levam à mesma rota:
  `handleUploadRecording()` (gravar pela câmera) — [AvatarSetupStep.tsx:712-731](../frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx#L712)
  — e `handleReferenceFileChange()` (enviar arquivo) — [AvatarSetupStep.tsx:733-749](../frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx#L733).
  Ambas chamam `POST /avatars/:id/reference-video` ([avatars.ts:453-541](../backend/src/routes/avatars.ts#L453)),
  que debita 1 crédito de avatar **antes** da chamada ([avatars.ts:522](../backend/src/routes/avatars.ts#L522))
  e então chama `trainAvatar()` de verdade ([avatars.ts:541](../backend/src/routes/avatars.ts#L541)).
- **O treino é SEMPRE HeyGen ou D-ID, nunca fal — para os 3 tiers, mesmo os
  que geram vídeo pela fal.** `VENDORS_WITH_TRAINING_PATH.avatar = ["heygen", "did"]`
  ([vendorCatalog.ts:59-63](../backend/src/services/providers/vendorCatalog.ts#L59)); a rota resolve a credencial
  iterando essa lista ([avatars.ts:498-502](../backend/src/routes/avatars.ts#L498)), nunca pelo `is_default`
  genérico do tenant (correção do bug de 26/08 — commit `68b418b`,
  guarda `checkAvatarTrainingVendorPolicy.ts`). **A fal não tem rota de treino** —
  ela entra no catálogo (`VENDORS_BY_PROVIDER.avatar`, [vendorCatalog.ts:13](../backend/src/services/providers/vendorCatalog.ts#L13))
  só para guardar a chave, "nada mais" (comentário do próprio código).
- **O que fica persistido:** `provider_avatar_id`, `provider_status`,
  `provider_engines` (via `trainAvatar()` → `avatarProvider.ts`), além de
  `photo_urls` (do upload) e, desde 28/08, `scenario`/`scenario_prompt`/
  `outfit`/`outfit_prompt` como DEFAULT do avatar (semente única para a Cena
  por vídeo — ver seção 4 de cada tier).
- **Readiness exige treino concluído PARA OS 3 TIERS, mesmo quando o tier
  gerador (fal) nunca lê `provider_avatar_id`.** `evaluateGenerationReadiness()`
  bloqueia com `avatar_not_trained` sempre que `!avatar.provider_avatar_id`
  ([generationReadiness.ts:167-174](../backend/src/services/generationReadiness.ts#L167)) — SEM olhar `tier_video`. Ou
  seja: mesmo um vídeo Normal/Premium, cujo `generateVideoFal` só usa
  `photo_urls` (confirmado por leitura: zero referência a `provider_avatar_id`
  dentro de `generateVideoFal`, linhas 1224-1327 do mesmo arquivo), **exige
  o mesmo treino pago na HeyGen/D-ID** antes de poder gerar.

### Clonagem de voz (comum aos 3 tiers)

- `POST /avatars/:id/voice-sample` ([voice.ts:143-144](../backend/src/routes/voice.ts#L143)) — acontece no Passo 1,
  antes de qualquer escolha de tier.
- Guarda de slots (leitura, sem custo): `listVoices()` ([voice.ts:306](../backend/src/routes/voice.ts#L306)) conta
  vozes próprias (`owned`, excluindo a biblioteca `premade` do fornecedor) contra
  `voiceSlotLimit()` ([voice.ts:311-326](../backend/src/routes/voice.ts#L311)).
- **Ponto exato da cobrança:** `cloneVoice()` ([voice.ts:332-344](../backend/src/routes/voice.ts#L332)) —
  chamada real ao ElevenLabs, dispara depois da guarda de slots passar.
- **Reaproveitamento:** a voz é clonada UMA VEZ por avatar (`avatar.voice_id`)
  e reaproveitada por TODOS os vídeos daquele avatar, em qualquer tier — a
  mesma função `synthesizeSpeech()` é chamada tanto pelo caminho HeyGen
  quanto pelo caminho fal (`narrarSincronizar()`, [falPipeline.ts:1306-1311](../backend/src/services/video/falPipeline.ts#L1306)),
  sempre com `input.voiceId`/`avatar.voice_id`, nunca reclonando.
- **Não é opcional na prática, embora não haja bloqueio explícito na tela:**
  não existe nenhum blocker `voice_not_configured` em `generationReadiness.ts`
  (busquei por `voice_id`/`voice_not` no arquivo inteiro — zero ocorrências).
  Um avatar sem voz passa a tela de prontidão e só falha DENTRO da geração
  (`generateVideoFal` recusa com `"fal: a voz é ENTRADA..."` se faltar
  `voiceId`, mas isso ocorre DEPOIS do débito de crédito em `POST /videos`
  — [videos.ts:1590](../backend/src/routes/videos.ts#L1590) vem antes de `generateVideo()`). Isto é um GAP,
  não uma trava; documentado aqui como fato, sem propor correção.

### Roteiro (comum aos 3 tiers, com teto DIFERENTE por caminho — ver seção 3 de cada tier)

- `POST /scripts/generate` ([scripts.ts:11-67](../backend/src/routes/scripts.ts#L11)) — campo manual vs "Gerar com
  IA" são a mesma rota; o vendor é o que estiver configurado em `getCredential(tenantId, "script")`
  (Anthropic/Gemini/OpenAI, [vendorCatalog.ts:7](../backend/src/services/providers/vendorCatalog.ts#L7)). Debita 1
  crédito tipo `"script"` ANTES da chamada ([scripts.ts:29-33](../backend/src/routes/scripts.ts#L29)), estorna em
  caso de erro do fornecedor ([scripts.ts:56-60](../backend/src/routes/scripts.ts#L56)).
  **Não usa RAG** — chama o LLM sem contexto adicional (fato já registrado em
  ESTADO.md, não recontado aqui por leitura própria desta rodada, mas
  confirmado pela ausência de qualquer import de recuperação/embeddings neste
  arquivo).
- O texto retornado vira `wizard.script` no cliente e é o que `corpoDaGeracao()`
  ([GenerateStep.tsx:26-29](../frontend/src/pages/CreateVideo/steps/GenerateStep.tsx#L26)) manda em `POST /videos` como campo `script` —
  é este único campo que alimenta TANTO a síntese de voz (`synthesizeSpeech`)
  QUANTO a estimativa de duração/custo, nos 3 tiers.

---

## TIER SIMPLES (HeyGen)

### 1. Criação do avatar
Ver "Mecânica comum" acima — idêntico. `provider_avatar_id`/`provider_status`
SÃO efetivamente lidos e usados por este tier no momento de gerar (ver seção 5).

### 2. Clonagem de voz
Ver "Mecânica comum" acima — idêntico, e AQUI a voz é de fato consumida no
mesmo processo de geração (síntese ElevenLabs → upload à HeyGen, ver seção 5).

### 3. Roteiro
- Teto de tamanho: `HEYGEN_MAX_SCRIPT_CHARS` = 5.000 caracteres (teto do
  FORNECEDOR para o campo `script`), convertido em segundos por
  `estimateSecondsFromChars()` — usado em `maxScriptChars()`/`maxScriptCharsFor()`
  ([scriptDuration.ts:274-337](../backend/src/services/video/scriptDuration.ts#L274)). Isto é o teto QUE VALE de fato
  para este tier: `exceedsActiveScriptLimit()` ([scriptDuration.ts:303-310](../backend/src/services/video/scriptDuration.ts#L303)),
  chamado por `generationReadiness.ts:209`, bloqueia ANTES do débito de
  crédito com o código `script_too_long`.
- Um roteiro de 5.000 caracteres estima ≈459 s de fala — bem abaixo do teto
  teórico de 600 s (`MAX_SCRIPT_SECONDS`) porque o teto de CARACTERES do
  fornecedor binda primeiro (comentário em [scriptDuration.ts:268-272](../backend/src/services/video/scriptDuration.ts#L268)).

### 4. Cena — o que chega à geração
| Campo | Status | Prova |
|---|---|---|
| **Cenário** (imagem/prompt) | **(b) aceito na tela, mas IGNORADO/INERTE na geração** | Campo aparece sem condição de tier ([SceneStep.tsx:588](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L588)); persiste em `videos.scenario`/`scenario_prompt`; `buildHeygenVideoPayload()` ([avatarProvider.ts:704-750](../backend/src/services/providers/avatarProvider.ts#L704)) nunca lê esses campos — só monta `background` (nativo HeyGen). |
| **Traje** (imagem/prompt, campo genérico da Cena) | **(b) aceito na tela, mas IGNORADO/INERTE** | Mesmo raciocínio do Cenário — `outfit`/`outfit_prompt` ([SceneStep.tsx:643](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L643)) nunca aparecem em `buildHeygenVideoPayload`. |
| **Traje (LOOK nativo HeyGen)** | **(a) usado e honrado — SÓ para este tier** | Seletor próprio, visível só quando `tierVideo === "simples"` ([SceneStep.tsx:556-575](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L556)); vira `avatarLookId` → `providerAvatarIdParaGeracao()` ([videos.ts:1629](../backend/src/routes/videos.ts#L1629)), que SUBSTITUI o `avatar_id` enviado à HeyGen. |
| **Fundo** | **(a) usado e honrado — SÓ para este tier** | Controle visível só quando `tierVideo === "simples"` ([SceneStep.tsx:484-546](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L484)); para outros tiers um AVISO substitui o controle ([SceneStep.tsx:547-550](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L547), `backgroundTierNotice`). Consumido em `buildHeygenVideoPayload()` ([avatarProvider.ts:731-734](../backend/src/services/providers/avatarProvider.ts#L731)), com `remove_background:true` forçado ([avatarProvider.ts:750](../backend/src/services/providers/avatarProvider.ts#L750)) — sem isso o fundo escolhido seria inerte (bug já corrigido, comentário no próprio código). |
| **Interpretação** (motion_prompt) | **(a) usado e honrado** | Campo sem condição de tier ([SceneStep.tsx:692](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L692)); `if (scene.motionPrompt) body.motion_prompt = scene.motionPrompt;` ([avatarProvider.ts:756](../backend/src/services/providers/avatarProvider.ts#L756)). |
| **Expressividade** | **(a) usado e honrado, CONDICIONAL ao motor** | Campo sem condição de tier ([SceneStep.tsx:716](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L716)); só entra no corpo quando `motorEfetivo === "avatar_iv"` ([avatarProvider.ts:783-784](../backend/src/services/providers/avatarProvider.ts#L783)) — MEDIDO (06/08) que o schema NÃO impõe isso: com `avatar_iii` o campo passa a validação e é ignorado pelo fornecedor em silêncio (comentário no próprio código). |
| **Formato/aspect_ratio** | **(a) usado e honrado** | Vai em `aspect_ratio`/`resolution` no corpo da HeyGen (confirmado no log real desta sessão: `video_payload_built` listou `aspect_ratio`/`resolution`/`fit` entre os campos). |

### 5. Motor de geração final
- **Vendor único: HeyGen.** Ordem observada AO VIVO nesta sessão (log real,
  vídeo `da25828d`) e confirmada por leitura:
  1. `synthesizeSpeech()` → ElevenLabs `POST /v1/text-to-speech/{voice}/with-timestamps`
     (dentro de `generateVideoHeygen`, chamado a partir de [avatarProvider.ts:1488-1490](../backend/src/services/providers/avatarProvider.ts#L1488)).
  2. `heygenUploadAsset()` — upload do áudio sintetizado como asset HeyGen.
  3. `buildHeygenVideoPayload()` ([avatarProvider.ts:704-794](../backend/src/services/providers/avatarProvider.ts#L704)) monta o corpo:
     `type`, `avatar_id` (= `providerAvatarIdParaGeracao`, look ou avatar base),
     `audio_asset_id`, `aspect_ratio`, `resolution`, `fit` (`"cover"` fixo,
     `HEYGEN_FIT`), `expressiveness` (condicional), `background`+`remove_background`
     (condicional), `motion_prompt` (condicional).
  4. `POST /v3/videos` (HeyGen `createVideo`) — dispara a geração.
  5. Poll (`GET /v2/video_status.get`) até `completed` ou `failed`.
- **Sem etapa de aprovação humana.** Diferente do caminho fal, este tier vai
  de `queued` direto a `ready`/`failed` numa corrida só — nunca passa por
  `awaiting_approval`. Confirmado por comentário explícito: *"esta função só
  existe no caminho da fal (`awaiting_approval`/`awaiting_approval_video`
  nunca acontecem para heygen/did)"* ([videos.ts:2057-2059](../backend/src/routes/videos.ts#L2057)).
- **"Gerar novamente":** existe como conceito de CLIENTE — `corpoDaGeracao()`
  é chamada de novo com o mesmo estado do wizard, criando uma linha NOVA em
  `videos` via um novo `POST /videos` ([GenerateStep.tsx:362](../frontend/src/pages/CreateVideo/steps/GenerateStep.tsx#L362)). Aplica-se
  igualmente aos 3 tiers, porque é client-side.
- **"Refazer a imagem" (`/recompose`) NÃO SE APLICA a este tier.** A rota
  exige `status = 'awaiting_approval'` ([videos.ts:2421](../backend/src/routes/videos.ts#L2421)), estado que um vídeo
  HeyGen nunca atinge (ver acima). Não há equivalente de "refazer" para
  Simples hoje — só "gerar novamente" (nova linha, novo débito).

### 6. Cobrança
- **Débito de crédito:** 1 crédito tipo `"video"`, `debitCredit()` ([videos.ts:1590](../backend/src/routes/videos.ts#L1590)),
  **ANTES** de `generateVideo()` ser chamado — mesmo ponto para os 3 tiers.
- **Unidade de custo:** `HEYGEN_VIDEO_COST` ([providerCost.ts:99-114](../backend/src/services/billing/providerCost.ts#L99)) —
  **3 unidades por segundo INTEIRO truncado** de vídeo ENTREGUE (não pedido),
  60 unidades por dólar. MEDIDO (4 pontos exatos, ver comentário do arquivo).
  `provider_usage` grava a linha real: nesta sessão, `seconds:1 · US$0,05`
  para 1 segundo entregue, e o próprio saldo HeyGen confirmou (quota 60→57,
  carteira US$1,00→US$0,95).
- **Teto de gasto:** `assertHeygenSpendBudget()` ([providerCost.ts:328-339](../backend/src/services/billing/providerCost.ts#L328)) recusa
  ANTES do débito se a estimativa (sobre segundos PEDIDOS) ultrapassar
  `heygenSpendCapUsd()` (default `DEFAULT_HEYGEN_TETO_USD` ≈ US$22,95,
  [providerCost.ts:296-299](../backend/src/services/billing/providerCost.ts#L296)).
- **Reconciliação com saldo do fornecedor:** SIM, existe script dedicado —
  `quotaBaseline.ts` ([backend/src/scripts/quotaBaseline.ts](../backend/src/scripts/quotaBaseline.ts)), leitura
  não tarifada de `GET /v2/user/remaining_quota` + `GET /v3/users/me`. Usado
  nesta própria sessão para confirmar o gasto real.

---

## TIER NORMAL (fal — Wan)

### 1. Criação do avatar
Ver "Mecânica comum" acima — idêntico, **inclusive a exigência de treino
HeyGen/D-ID**, mesmo este tier nunca lendo `provider_avatar_id` na geração
(ver seção 5).

### 2. Clonagem de voz
Ver "Mecânica comum" acima — idêntico. Aqui a voz é ENTRADA obrigatória de
fato: `generateVideoFal` recusa explicitamente sem `voiceId`/`elevenLabsApiKey`
([avatarProvider.ts:1233-1238](../backend/src/services/providers/avatarProvider.ts#L1233)), ANTES de qualquer chamada paga —
mas essa recusa acontece DEPOIS do débito de crédito de `POST /videos`
([videos.ts:1590](../backend/src/routes/videos.ts#L1590) vem antes), então é estornável, não gratuita por
antecipação.

### 3. Roteiro — teto MUITO mais apertado que a tela deixa passar
- O teto REAL deste tier é derivado do que o Wan aceita: `PIPELINE_DURATION_OPTIONS = [5, 10, 15]`
  segundos ([falPipeline.ts:60](../backend/src/services/video/falPipeline.ts#L60), doc do fornecedor citada verbatim
  no comentário), e o teto de caracteres correspondente é
  `PIPELINE_MAX_CHARS_POR_DURACAO` — **142 caracteres** no máximo (15 s,
  pior caso do ritmo) — [falPipeline.ts:107-116](../backend/src/services/video/falPipeline.ts#L107).
- **A tela NÃO conhece esse teto.** `generationReadiness.ts:209` usa
  `exceedsActiveScriptLimit()`, que é a régua da HeyGen (até 5.000
  caracteres/≈459s) — SEM parâmetro de tier. Um roteiro de, por exemplo,
  1.000 caracteres passa pela tela/API de prontidão livremente para um
  vídeo Normal.
- **A recusa de verdade só acontece DENTRO do pipeline, DEPOIS do débito.**
  `conferirRoteiro()` ([falPipeline.ts:723-739](../backend/src/services/video/falPipeline.ts#L723)) lança `FalPipelineError`
  quando `escolherDuracao(chars)` devolve `null` — chamada no topo de
  `runFalPipeline()` ([falPipeline.ts:1001](../backend/src/services/video/falPipeline.ts#L1001)), que só é atingido depois de
  `debitCredit()` ([videos.ts:1590](../backend/src/routes/videos.ts#L1590)) e da abertura da corrida (`abrirCorrida`,
  [videos.ts:1676-1687](../backend/src/routes/videos.ts#L1676), com comentário explícito confirmando: *"a recusa...
  acontece dentro do pipeline, em `conferirRoteiro`. Quando o roteiro não
  cabe... a corrida abre e fecha `failed` logo em seguida"*). O crédito é
  estornável (padrão de `checkRefundPolicy.ts`), mas a recusa chega tarde
  em relação ao que a tela promete.

### 4. Cena — o que chega à geração
| Campo | Status | Prova |
|---|---|---|
| **Cenário** (imagem/prompt) | **(a) usado e honrado** | Imagem → `entradasExtras` com `rotulo:"cenario"` ([avatarProvider.ts:1262-1268](../backend/src/services/providers/avatarProvider.ts#L1262)) → `image_urls` da composição; texto → `promptDaComposicao()` ([avatarProvider.ts:1180-1182](../backend/src/services/providers/avatarProvider.ts#L1180)) → campo `prompt` do `nano-banana-2/edit`. Provado por execução real (guarda `checkFalSceneWiringPolicy.ts`, rodada no gate desta sessão). |
| **Traje** (imagem/prompt) | **(a) usado e honrado** | Mesmo mecanismo, `rotulo:"traje"` ([avatarProvider.ts:1269-1275](../backend/src/services/providers/avatarProvider.ts#L1269)); texto entra no mesmo `prompt` da composição. |
| **Traje (LOOK nativo HeyGen)** | **(c) nem exibido nesta tela para este tier** | Seletor só aparece com `tierVideo === "simples"` ([SceneStep.tsx:556](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L556)); para Normal/Premium um aviso substitui ([SceneStep.tsx:576-579](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L576), `lookTierNotice`), e o comentário do código confirma: `providerAvatarId` nunca é lido em `generateVideoFal`. |
| **Fundo** | **(c) nem exibido nesta tela para este tier** | Substituído por aviso `backgroundTierNotice` ([SceneStep.tsx:547-550](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L547)); confirmado por leitura que `generateVideoFal` (linhas 1224-1327) nunca referencia `background`. |
| **Interpretação** (motion_prompt) | **(a) usado e honrado** | `promptDaDirecao()` ([avatarProvider.ts:1197-1199](../backend/src/services/providers/avatarProvider.ts#L1197)) lê `input.scene.motionPrompt` (a versão traduzida `motion_prompt_en`) → campo `prompt` do Wan, via `corpoAnimarWan()` ([falPipeline.ts:1151-1181](../backend/src/services/video/falPipeline.ts#L1151)). |
| **Expressividade** | **(b) aceito na tela, mas IGNORADO/INERTE** | Campo visível sem condição de tier ([SceneStep.tsx:716](../frontend/src/pages/CreateVideo/steps/SceneStep.tsx#L716)); zero referência a `expressiveness` dentro de `generateVideoFal` (confirmado por grep no intervalo de linhas 1224-1330 do arquivo). |
| **Formato/aspect_ratio** | **(a) usado e honrado, só na composição** | `aspect_ratio: input.aspectRatio` vai ao `nano-banana-2/edit` na etapa `compor` ([falPipeline.ts:1034](../backend/src/services/video/falPipeline.ts#L1034)). O Wan (`corpoAnimarWan`) NÃO recebe `aspect_ratio` — herda da imagem já composta (o comentário de `DEFAULTS_NUNCA_HERDADOS` em [falPipeline.ts:246-252](../backend/src/services/video/falPipeline.ts#L246) explica por que este campo vai explícito só na composição). |

### 5. Motor de geração final
- **Vendors envolvidos, nesta ordem:** fal (composição) → fal (animação) →
  ElevenLabs (narração) → fal (sincronia) → armazenamento próprio.
- **Endpoints exatos** ([falPipeline.ts:366-400](../backend/src/services/video/falPipeline.ts#L366)):
  1. `fal-ai/nano-banana-2/edit` — COMPOR: rosto+cenário+traje(+lateral) → imagem.
  2. `wan/v2.6/image-to-video/flash` — ANIMAR (motor deste tier): imagem → vídeo mudo.
  3. ElevenLabs TTS com timestamps — NARRAR: roteiro → áudio com duração real.
  4. `fal-ai/sync-lipsync/v2` — SINCRONIZAR: vídeo+áudio → entregável.
- **Payload de `compor`** ([falPipeline.ts:1021-1035](../backend/src/services/video/falPipeline.ts#L1021)): `prompt` (cenário+traje
  em texto, com defaults de pele/câmera sempre anexados via
  `comDefaultsDeComposicao`), `image_urls` (rosto obrigatório + até 3
  opcionais), `num_images:1`, `resolution`, `aspect_ratio` — todos EXPLÍCITOS
  de propósito (nunca herdam default do fornecedor, ver `DEFAULTS_NUNCA_HERDADOS`,
  [falPipeline.ts:230-260](../backend/src/services/video/falPipeline.ts#L230)).
- **Payload de `animar` (Wan)** ([falPipeline.ts:1151-1181](../backend/src/services/video/falPipeline.ts#L1151)): `prompt`
  (Interpretação traduzida + defaults de câmera/gesto/mão), `image_url` (a
  imagem composta), `generate_audio:false` (evita pagar uma trilha
  descartável), `resolution`, `duration` (string "5"/"10"/"15"),
  `enable_prompt_expansion:false`, `multi_shots:false`.
- **Etapa de aprovação humana: SIM, duas.** `pararApos: "compor"` é o DEFAULT
  do produto ([falPipeline.ts:1051](../backend/src/services/video/falPipeline.ts#L1051), comentário confirma: *"é o
  comportamento NORMAL desta fase"*) — a corrida para logo após a composição,
  grava a imagem e espera `POST /videos/:id/approve` ([videos.ts:2135](../backend/src/routes/videos.ts#L2135)),
  que retoma via `runFalPipelineDaImagem()` ([falPipeline.ts:1094-1118](../backend/src/services/video/falPipeline.ts#L1094)) e
  segue direto para narrar+sincronizar (não há segunda parada em `animar`
  neste tier hoje, embora o mecanismo `pararApos:"animar"` exista no código
  para o Modo B).
- **"Refazer a imagem" (`/recompose`)** ([videos.ts:2417-2471](../backend/src/routes/videos.ts#L2417)): SÓ aceita
  `{feedback}` no corpo — **não aceita novo cenário/traje**. Reconstrói a
  composição com `entradasDaComposicao(video)` ([videos.ts:2124-2133](../backend/src/routes/videos.ts#L2124)) e
  `promptDaComposicaoDaLinha(video)` ([videos.ts:2096-2101](../backend/src/routes/videos.ts#L2096)) — os MESMOS
  valores congelados na criação do vídeo, nunca os da aba Cena reaberta. O
  `feedback` é persistido em `refazer_feedback` mas **não entra** no prompt
  reenviado. Uma composição "refeita" difere da original só pela
  não-determinismo do modelo, nunca por um cenário/traje diferente.
- **"Gerar novamente":** mesmo mecanismo client-side descrito no tier
  Simples — cria vídeo NOVO, não reaproveita nada do anterior.

### 6. Cobrança
- **Débito de crédito:** mesmo ponto que os outros tiers — `debitCredit()`
  ([videos.ts:1590](../backend/src/routes/videos.ts#L1590)), 1 crédito tipo `"video"`, ANTES de `generateVideo()`.
- **Unidade de custo — DOCUMENTADA, NÃO MEDIDA** (ao contrário da HeyGen):
  `PRECOS_FAL` ([providerCost.ts:445-483](../backend/src/services/billing/providerCost.ts#L445)) — `comporUsd:0.08`/imagem,
  `animarUsdPorSegundo:0.025`, `sincronizarUsdPorSegundoDeAudio:0.05`. O
  próprio arquivo declara: *"nenhuma fatura foi conferida contra eles"*.
  `costFor()` ([providerCost.ts:181-211](../backend/src/services/billing/providerCost.ts#L181)) devolve `known:false` para
  vendor `fal` em qualquer unidade — por isso `estimatedCostUsd: null` é
  gravado em `provider_usage` para este vendor ([videos.ts:2664-2669](../backend/src/routes/videos.ts#L2664), comentário
  explícito: *"`costFor` devolve ausência para `fal`... repetir um número
  derivado de outro lugar criaria a segunda verdade sobre dinheiro"*).
- **Teto de gasto por corrida:** `PIPELINE_TETO_USD = 2.0` ([providerCost.ts:531](../backend/src/services/billing/providerCost.ts#L531)),
  aplicado por `autorizarGasto()` a cada etapa, ACUMULADO dentro da mesma
  corrida (compor+animar+sincronizar) — dimensionado para o pior caso do Wan
  (~US$0,77).
- **`provider_usage` só é gravado ao FINAL da corrida completa** (`recordProviderUsage`,
  [videos.ts:2642-2669](../backend/src/routes/videos.ts#L2642)) — um vídeo que para em `awaiting_approval`
  (composição feita, nunca aprovado) **não gera nenhuma linha de
  `provider_usage`**. Confirmado nesta própria sessão: os 2 vídeos fal que
  pararam em "compor" (US$0,08 cada, pelo preço de lista) têm ZERO linhas em
  `provider_usage` — só existem em `fal_pipeline_runs.gasto_previsto_usd`
  (projeção interna, nunca reconciliada).
- **Reconciliação com o saldo REAL da fal: NÃO EXISTE hoje.** Comentário
  explícito no próprio código: *"a fal não expõe endpoint de saldo, então
  não há como perguntar quanto ainda resta"* ([providerCost.ts:439](../backend/src/services/billing/providerCost.ts#L439)).
  Não há script equivalente a `quotaBaseline.ts` para este vendor — busquei
  por `fal` + `saldo`/`balance`/`wallet` em `backend/src/scripts/` e não
  encontrei nenhum. **Para conferir manualmente hoje, é preciso entrar no
  painel web da fal.ai** (`fal.ai`, autenticado com a conta usada pela chave
  configurada) — não há chamada de API documentada neste repositório para
  isso, e por isso os US$0,08×2 desta sessão ficam sem confirmação
  independente, diferente do que aconteceu com o vídeo HeyGen (confirmado
  por saldo real).

---

## TIER PREMIUM (fal — Seedance)

Idêntico ao tier Normal em TUDO que não seja o motor de animação — as seções
1 a 4 e a maior parte da 5 e 6 são as MESMAS citações. Só o que diverge está
detalhado abaixo; o resto remete ao tier Normal.

### 1. Criação do avatar
Igual ao Normal — ver acima.

### 2. Clonagem de voz
Igual ao Normal — ver acima.

### 3. Roteiro
Igual ao Normal — mesmo teto de 142 caracteres/15s (`PIPELINE_DURATION_OPTIONS`
não muda por tier; é uma constante do pipeline inteiro, não do motor).

### 4. Cena
Idêntico à tabela do tier Normal — Cenário/Traje (imagem+prompt) e
Interpretação usados e honrados; Traje-LOOK e Fundo nem exibidos; Expressividade
ignorada; Formato só na composição. Nenhuma dessas citações muda por o motor
de animação ser Seedance em vez de Wan — a composição (`compor`) é a MESMA
etapa, MESMO endpoint (`nano-banana-2/edit`), para os dois.

### 5. Motor de geração final — SÓ a etapa "animar" muda
- **Endpoint:** `bytedance/seedance-2.5/reference-to-video` ([falPipeline.ts:398](../backend/src/services/video/falPipeline.ts#L398)),
  escolhido por `enderecoAnimarParaTier(tier)` ([falPipeline.ts:403-405](../backend/src/services/video/falPipeline.ts#L403)):
  `tier === "premium" ? ENDPOINT_ANIMAR_PREMIUM : ENDPOINT_ANIMAR`.
- **Payload de `animar` (Seedance)** ([falPipeline.ts:1195-1207](../backend/src/services/video/falPipeline.ts#L1195)): `prompt`
  (mesma Interpretação+defaults do Normal), **`image_urls` LISTA** (não
  `image_url` singular como o Wan), `end_user_id: input.tenantId`,
  `aspect_ratio: input.aspectRatio` (aqui SIM vai explícito, ao contrário do
  Wan), `duration` como NÚMERO (não string — o Seedance documenta faixa
  contínua 4-30s, não o enum fechado do Wan). **NÃO VERIFICADO por chamada
  real nem por fusível** — comentário do próprio código em
  [falPipeline.ts:1191-1193](../backend/src/services/video/falPipeline.ts#L1191).
- **Aprovação e "Refazer":** mesmo mecanismo do Normal — `pararApos:"compor"`
  é o default também aqui; `/recompose` funciona igual (não sabe nem precisa
  saber qual motor de animação está por trás, porque só re-executa `compor`).

### 6. Cobrança — teto e fórmula PRÓPRIOS, nenhum medido
- **Unidade de custo — NÃO é por segundo, é por TOKEN.** `custoSeedanceUsd()`
  ([providerCost.ts:507-513](../backend/src/services/billing/providerCost.ts#L507)): `tokens = (720 × 1280 × duração × 24) / 1024`,
  tarifa US$0,0214/1000 tokens. Para 15s de saída isso dá ≈US$6,93. **DOCUMENTADO
  (doc pública da fal), NÃO MEDIDO, NÃO VERIFICADO por chamada real** —
  mesmo aviso do tier Normal, mais explícito aqui porque a fórmula nunca foi
  testada de verdade (comentário em [providerCost.ts:548-550](../backend/src/services/billing/providerCost.ts#L548)).
- **Teto de gasto por corrida: `PIPELINE_TETO_USD_PREMIUM = 10.0`** ([providerCost.ts:552](../backend/src/services/billing/providerCost.ts#L552)) —
  DIFERENTE do teto do Normal (US$2,00) de propósito: o preço por segundo do
  Seedance é ~18,5× maior, e reusar o teto do Normal recusaria a etapa
  `animar` do Premium antes de qualquer chamada (foi o que aconteceu no
  BLOCO SEEDANCE-1, 21/08, segundo o comentário do código). `compor`
  continua sob o mesmo `PIPELINE_TETO_USD` fixo (custa sempre US$0,08 nos
  três tiers).
- **Reconciliação com saldo real:** mesma ausência do tier Normal — fal não
  expõe endpoint de saldo; consulta manual só pelo painel web.

---

## TABELA COMPARATIVA

| | **Simples** (HeyGen) | **Normal** (fal / Wan) | **Premium** (fal / Seedance) |
|---|---|---|---|
| **1. Avatar** | Treino HeyGen/D-ID obrigatório; `provider_avatar_id` É lido na geração | Treino HeyGen/D-ID obrigatório (gate), mas `provider_avatar_id` NUNCA é lido — só `photo_urls` | Igual ao Normal |
| **2. Voz** | ElevenLabs, 1 clone/avatar, reusado | Igual — mesma função `synthesizeSpeech()` | Igual |
| **3. Roteiro** | Teto real = teto da TELA: 5.000 car. (`HEYGEN_MAX_SCRIPT_CHARS`) | Teto real = 142 car./15s, **invisível na tela** (recusa só dentro do pipeline, pós-débito) | Igual ao Normal |
| **4. Cena** | Fundo + Traje-LOOK honrados; Cenário/Traje(prompt) inertes | Cenário/Traje(imagem+prompt) honrados; Fundo/Traje-LOOK nem aparecem | Igual ao Normal |
| **4. Expressividade** | Honrada se motor = avatar_iv | Sempre ignorada | Igual ao Normal |
| **5. Etapas pagas** | 1 chamada só (`POST /v3/videos`) | compor → animar(Wan) → narrar → sincronizar, com PARADA para aprovação após compor | compor → animar(Seedance) → narrar → sincronizar, mesma parada |
| **5. Aprovação humana** | Não existe (`awaiting_approval` nunca acontece) | Sim, obrigatória (`pararApos:"compor"` default) | Igual ao Normal |
| **5. "Refazer"** | Não existe para este tier | Recompõe com os MESMOS dados congelados; `feedback` não influencia o prompt | Igual ao Normal |
| **6. Débito de crédito** | Antes de `generateVideo()`, 1 crédito "video" | Idêntico | Idêntico |
| **6. Unidade de custo** | 3un/s entregue, 60un/US$ — **MEDIDO** (4 pontos) | compor US$0,08/img + US$0,025/s animar + US$0,05/s áudio sync — **DOCUMENTADO, não medido** | Seedance por TOKEN, ≈US$6,93/15s — **DOCUMENTADO, não medido, não verificado por chamada real** |
| **6. Teto de gasto** | ≈US$22,95 (`DEFAULT_HEYGEN_TETO_USD`) | US$2,00 por corrida | US$10,00 por corrida (compor ainda sob US$2,00) |
| **6. Reconciliação com fornecedor** | SIM — `quotaBaseline.ts`, leitura real de quota+carteira | **NÃO existe** — fal não expõe saldo; só painel web manual | Igual ao Normal |

---

*Documento gerado por leitura de código em 28/08/2026. Nenhuma chamada a
vendor foi feita nesta rodada.*
