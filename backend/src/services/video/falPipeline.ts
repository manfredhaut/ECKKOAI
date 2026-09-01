/**
 * ORQUESTRADOR do pipeline da fal — as cinco etapas, em série.
 *
 * ┌─ O que este arquivo é, e o que ele NÃO é ───────────────────────────────┐
 * │ É o BLOCO 4 PARTE 1. Não há rota, não há ramo em `generateVideo`, e     │
 * │ nenhum caminho de usuário chega aqui — `avatarProvider.ts:1007` continua │
 * │ despachando só heygen/did. Ligar isto é a parte 2.                      │
 * │                                                                          │
 * │ Exercitado apenas com `globalThis.fetch` substituído. Das cinco etapas,  │
 * │ nenhuma resposta REAL da fal foi observada — só o contrato de upload é   │
 * │ candidato a medição, e ele depende de uma chave que ainda não está no    │
 * │ banco (ver ESTADO.md §6).                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * AS CINCO ETAPAS, e por que nesta ordem:
 *
 *   1. COMPOR    `nano-banana-2/edit`  — rosto + traje + cenário → imagem-base.
 *   2. ANIMAR    `wan/v2.6/image-to-video/flash` — imagem → vídeo MUDO.
 *      (motor do tier "Normal"; Seedance 2.5 pesquisado no BLOCO SEEDANCE-1,
 *      21/08, e revertido — reservado pro tier "Premium", ver `ENDPOINT_ANIMAR`)
 *   3. NARRAR    ElevenLabs TTS — o roteiro → áudio, com duração REAL medida.
 *   4. SINCRONIZAR `sync-lipsync/v2` — vídeo + áudio → o entregável.
 *   5. BIBLIOTECA — persistir o resultado.
 *
 * A VOZ É ENTRADA, não subproduto: ela entra pronta na etapa 4 e é preservada
 * por construção. É isso que torna a duração do entregável conhecida ANTES da
 * etapa mais cara, e é a razão de a etapa 3 não ser a primeira — o áudio só
 * precisa existir quando houver vídeo para casá-lo, e sintetizar antes de saber
 * se a composição deu certo gasta uma síntese à toa.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { falPoll, falResult, falSubmit, falUpload } from "../providers/falClient.js";
import { synthesizeSpeech, type VoiceTuning } from "../providers/voiceProvider.js";
import { isFixtureMode } from "../providers/providerMode.js";
import { logEvent, redactDeep } from "../log/safeLog.js";
import { readUpload } from "../storage.js";
import { PIPELINE_TETO_USD_PREMIUM, PRECOS_FAL, custoSeedanceUsd, tetoNormalUsd } from "../billing/providerCost.js";
import { custoDe } from "../billing/providerPrices.js";
import { HEYGEN_MAX_SCRIPT_CHARS, estimateSecondsFromChars } from "./scriptDuration.js";
import { concatVideos, assertAspectRatio } from "./ffmpeg.js";
import {
  fracionarRoteiro,
  segundosTotaisDosBlocos,
  ScriptFractioningError,
  NORMAL_MAX_BLOCOS,
  NORMAL_MAX_TARGET_SECONDS,
  type BlocoDeAnimacao,
} from "./scriptFractioning.js";
import { montarPlanoDosBlocosWan } from "./wanOrchestration.js";
import { direcaoComExpressividade, type Expressiveness } from "../providers/videoScene.js";
import type { AspectRatio } from "../providers/videoFormat.js";
import type { AvatarVendor } from "../providers/vendorCatalog.js";

// ---------------------------------------------------------------------------
// A RÉGUA DESTE PIPELINE — separada da do caminho HeyGen, DE PROPÓSITO
//
// EXTRAÍDA para `pipelineDuration.ts` no BLOCO FRACOES-1 (28/08), para que
// `scriptFractioning.ts` (que este arquivo importa, logo acima) pudesse usar
// estas constantes sem criar um ciclo de import com este arquivo. REEXPORTADA
// aqui, byte a byte no NOME e no VALOR — nenhum import externo (`videos.ts`,
// `ensaioSimulado.ts`, as guardas) precisa saber que o endereço mudou.
// ---------------------------------------------------------------------------
export {
  PIPELINE_DURATION_OPTIONS,
  PIPELINE_DURACAO_MAXIMA,
  PREMIUM_DURATION_OPTIONS,
  PREMIUM_DURACAO_MAXIMA,
  PIPELINE_CHARS_PER_SECOND,
  PIPELINE_RITMO_DISPERSAO,
  PIPELINE_MAX_CHARS_POR_DURACAO,
  PREMIUM_MAX_CHARS_POR_DURACAO,
  PIPELINE_MAX_CHARS,
  PREMIUM_MAX_CHARS,
  escolherDuracao,
  escolherDuracaoPremium,
  type PipelineDuration,
} from "./pipelineDuration.js";
import {
  PIPELINE_DURATION_OPTIONS,
  PIPELINE_DURACAO_MAXIMA,
  PREMIUM_DURACAO_MAXIMA,
  PIPELINE_CHARS_PER_SECOND,
  PIPELINE_RITMO_DISPERSAO,
  escolherDuracao,
  escolherDuracaoPremium,
  type PipelineDuration,
} from "./pipelineDuration.js";

// Os preços e o teto vivem em `billing/providerCost.ts`: a guarda de custo
// cobra que todo número de dinheiro more lá, e duas cópias de uma medição
// divergem em silêncio.
export { PRECOS_FAL, PIPELINE_TETO_USD_PREMIUM, custoSeedanceUsd, tetoNormalUsd } from "../billing/providerCost.js";

/**
 * O NÍVEL escolhido pelo tenant, dentro do caminho da fal — BLOCO A, 21/08.
 *
 * `"simples"` (HeyGen) não aparece aqui: este arquivo é só o pipeline da fal,
 * e o tier simples nunca o alcança — ver `routes/videos.ts`, onde o
 * despacho por VENDOR (heygen/did/fal) continua decidido pela credencial do
 * tenant, e só dentro do vendor "fal" é que `tier_video` escolhe o MOTOR.
 *
 * Default `"normal"` em todo lugar que recebe isto opcionalmente: é o único
 * tier que já tinha motor funcionando (Wan) antes do BLOCO A, e é o
 * comportamento que toda corrida anterior a ele teve sem ter escolhido nada.
 */
export type PipelineTier = "normal" | "premium";

/**
 * O NÍVEL DE PRODUTO inteiro — os TRÊS, `"simples"` incluído.
 *
 * `PipelineTier` acima é só os dois que este arquivo conhece; `VideoTier` é o
 * que a TELA oferece e o que `videos.tier_video` (migration 058) guarda.
 * `videoTierParaPipeline` faz a ponte: "simples" nunca chega a este arquivo
 * (o vendor heygen não passa pelo pipeline da fal), então ele cai no default
 * do orquestrador — o valor é irrelevante na prática, mas precisa ser
 * alguma coisa do tipo para o TypeScript aceitar a chamada.
 */
export type VideoTier = "simples" | PipelineTier;

export const VIDEO_TIERS: readonly VideoTier[] = ["simples", "normal", "premium"];

/** O tier de toda linha criada antes do BLOCO A, e de todo corpo que não escolhe um. */
export const DEFAULT_VIDEO_TIER: VideoTier = "normal";

export function isVideoTier(value: unknown): value is VideoTier {
  return typeof value === "string" && (VIDEO_TIERS as readonly string[]).includes(value);
}

/** `"simples"` vira `"normal"` aqui — ver o comentário de `VideoTier`. */
export function videoTierParaPipeline(tier: VideoTier): PipelineTier {
  return tier === "premium" ? "premium" : "normal";
}

/**
 * O VENDOR que este tier EXIGE — Fase C (multi-vendor de avatar), 22/08.
 *
 * Antes da Fase C, o vendor (heygen/did/fal) era decidido inteiramente pela
 * credencial default do tenant, e `tier_video` só escolhia o MOTOR dentro do
 * pipeline da fal — daí um tenant fal-only ver "Simples" produzir o mesmo
 * vídeo do "Normal" (o defeito que abriu esta linha de trabalho, ver
 * `checkTierAvailabilityPolicy.ts`). A partir daqui, `tier_video` decide os
 * DOIS: "simples" é HeyGen puro; "normal"/"premium" passam pela fal. Os 3
 * call sites de `routes/videos.ts` usam isto para buscar a credencial do
 * vendor EXIGIDO (`getCredentialForVendor`), nunca mais a default do tenant.
 */
export function vendorRequiredByTier(tier: VideoTier): AvatarVendor {
  return tier === "simples" ? "heygen" : "fal";
}

/**
 * A maior duração que este tier consegue ALCANÇAR DE VERDADE hoje — F2,
 * 22/08/2026. Não é `MAX_SCRIPT_SECONDS` nem `PIPELINE_DURACAO_MAXIMA`
 * sozinhos: é o que sobra depois do teto mais apertado de cada caminho.
 *
 * "simples" (HeyGen): o roteiro para de crescer em `HEYGEN_MAX_SCRIPT_CHARS`
 * (5.000 caracteres, teto do FORNECEDOR — ver `scriptDuration.ts`), que
 * hoje binda ANTES do teto de segundos (`MAX_SCRIPT_SECONDS`, 600 s) —
 * 5.000 caracteres estimam ≈459 s, não 600. Um vídeo de 600 s não existe
 * neste tier hoje, mesmo o número aparecendo como teto "de dinheiro".
 *
 * "premium" (fal/Seedance): `PREMIUM_DURACAO_MAXIMA` (15 s) — o enum que o
 * motor aceita POR CHAMADA, "não emenda clipes" (ver
 * `PREMIUM_DURATION_OPTIONS`). Fracionamento não foi estendido a este tier
 * nesta rodada (BLOCO FRACOES-1, 28/08 — ver `docs-internal/plano-fracoes-2026-08-28.md`,
 * escopo explícito "só Normal por enquanto"). PRÓPRIO desde a migração do
 * Normal para `reference-to-video/flash` (item 2, 29/08) — o teto do Wan
 * apertou para 10s; o do Premium (Seedance, endpoint diferente) não muda.
 *
 * "normal" (fal/Wan): `NORMAL_MAX_TARGET_SECONDS` (120 s = 8 blocos de 15 s)
 * desde o BLOCO FRACOES-1 — ANTES disso era o mesmo teto de UM bloco do
 * Premium. `fracionarRoteiro()` é quem de fato decide, roteiro a roteiro, se
 * o pedido cabe; este número é só o TETO SUPERIOR que a tela pode prometer
 * antes de qualquer roteiro existir.
 *
 * Existe para a tabela de referência de custo (`/video-cost-reference`)
 * distinguir "não sabemos o preço" (`sem medição`, fal em qualquer
 * duração ALCANÇÁVEL) de "essa duração não existe neste nível"
 * (qualquer ponto acima deste teto, nos dois vendors).
 */
export function maxReachableSecondsForTier(tier: VideoTier): number {
  if (tier === "simples") return estimateSecondsFromChars(HEYGEN_MAX_SCRIPT_CHARS);
  if (tier === "premium") return PREMIUM_DURACAO_MAXIMA;
  return NORMAL_MAX_TARGET_SECONDS;
}

/**
 * Teto do laço de polling. Ver `aguardarConclusao`.
 *
 * 600.000 ms (10 min) — V28, item 4, MEDIDO, não chutado: `SELECT
 * EXTRACT(EPOCH FROM (raw_response_at - request_at))` sobre toda etapa
 * `animar`/`compor`/`sincronizar` já completada no banco (31/08) deu o pior
 * caso real em **248,6 s** (dois blocos `animar` consecutivos da mesma
 * corrida, 29/08 17:3x — fila congestionada, não o `inference_time` do
 * fornecedor, que é bem menor). Isso já é 83% do teto ANTIGO de 300 s — e o
 * vídeo `c8f9ff46` (31/08) mediu o caso em que o teto antigo estourou DE
 * VERDADE enquanto o trabalho continuava vivo na fila (`status: "COMPLETED"`
 * minutos depois, confirmado por GET gratuito). 600 s dá ~2,4× de folga sobre
 * o pior caso já observado, e reusa a MESMA ordem de grandeza que
 * `DEFAULT_VENDOR_DOWNLOAD_TIMEOUT_MS` (vendorTimeout.ts) já usa para
 * "operações que legitimamente demoram minutos" — dois números diferentes
 * para o mesmo fenômeno seria a pergunta sem resposta que aquele arquivo já
 * evita.
 */
export const PIPELINE_POLL_TIMEOUT_MS = 600_000;

/** Intervalo entre leituras de status. */
export const PIPELINE_POLL_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// OS DEFAULTS QUE NUNCA SE HERDA
// ---------------------------------------------------------------------------

/**
 * Todo campo abaixo é enviado EXPLICITAMENTE, mesmo quando o valor coincide com
 * o default do fornecedor.
 *
 * A razão não é desconfiança do default de hoje: é que ele é do FORNECEDOR, não
 * nosso, e muda sem aviso e sem release note. Um payload que omite o campo
 * aceita a mudança em silêncio — e este projeto já mediu o pior caso desse
 * padrão duas vezes (o `background` inerte sem `remove_background`; o
 * `expressiveness` aceito e ignorado pelo `avatar_iii`).
 *
 * Cada um, e o que a omissão custaria:
 *
 *  · `num_images` (nano-banana) — o default pode devolver MAIS de uma imagem, e
 *    todas são cobradas. Uma imagem é o que a etapa seguinte consome.
 *  · `resolution` (nano-banana) — a imagem-base define a resolução de tudo que
 *    vem depois; herdá-la é deixar o fornecedor escolher o custo das etapas 2 e 4.
 *  · `aspect_ratio` (nano-banana) — o default é `auto`, que deixa o fornecedor
 *    decidir a partir das imagens de entrada. É o único campo desta lista que
 *    varia por vídeo (vem de `PUBLISH_PLATFORMS`, não é uma constante), e por
 *    isso mesmo é o que mais precisa ir explícito: herdar `auto` aqui é
 *    reproduzir exatamente o defeito que este campo existe para fechar — a
 *    proporção escolhida na tela sendo ignorada. Ver `aspectRatio` em
 *    `FalPipelineInput`.
 *  · `generate_audio` (Wan) — **o mais caro de todos.** Com o default ligado, o
 *    Wan sintetiza uma trilha PRÓPRIA, que é paga, e que a etapa 4 vai
 *    substituir pela nossa voz. Paga-se por áudio que nasce para ser descartado,
 *    e a etapa 4 recebe um vídeo que já tem som.
 *  · `resolution` (Wan) — o default de 1080p custa mais que 720p por segundo
 *    gerado, e nada nesta fase pede 1080p.
 *  · `enable_prompt_expansion` (Wan) — MEDIDO em 14/08 (ENDPOINTS-3) que o
 *    fornecedor aceita o campo e o valor `false` sem erro de schema. O default
 *    é `true`: um LLM do fornecedor REESCREVE `promptDeDirecao` antes de
 *    animar. Para um avatar falando de frente para a câmera, uma reescrita
 *    fora do nosso controle é risco de qualidade, não de dinheiro — mas é o
 *    mesmo padrão dos outros: aceitar o default é aceitar uma mudança do
 *    fornecedor em silêncio, aqui na DIREÇÃO da cena em vez do preço dela.
 *  · `multi_shots` (Wan) — MEDIDO junto com o de cima, mesmo aceite sem erro.
 *    O default é `true` e segmenta o clipe em várias tomadas; um clipe curto
 *    de uma pessoa falando não tem cena para cortar, e a segmentação automática
 *    é o mesmo risco de qualidade do campo acima.
 *  · `negative_prompt` (Wan) — RODADA 2, 29/08. O default do fornecedor é
 *    string vazia (LIDO no schema, não suposto); sem o nosso valor fixo
 *    (`NEGATIVE_PROMPT_ANIMAR_WAN`), o Wan fica livre para produzir os
 *    artefatos comuns de vídeo por IA (traço de desenho, pele plástica,
 *    legenda/marca d'água queimada no quadro) que o campo existe para conter.
 *  · `sync_mode` (lipsync) — ele decide o que acontece quando vídeo e áudio têm
 *    durações diferentes, que nesta fase é SEMPRE o caso. Enviá-lo explícito é o
 *    que impede o fornecedor de mudar esse comportamento sem aviso num pipeline
 *    cujo entregável inteiro depende dele. Qual valor, e por quê, está em
 *    `SYNC_MODE`.
 *  · `model` (lipsync) — **é o único default desta lista que troca de PREÇO em
 *    silêncio.** Os outros mudam o resultado; este muda a fatura: a variante
 *    `pro` custa cerca de 67% mais (DOCUMENTADO pelo operador em 13/08, não
 *    medido aqui), e qual delas o fornecedor entrega quando o campo não vai é
 *    escolha dele, revogável sem aviso. Omitir é assinar um cheque em branco
 *    numa etapa que já é a segunda mais cara da corrida.
 */
export const DEFAULTS_NUNCA_HERDADOS = {
  "fal-ai/nano-banana-2/edit": ["num_images", "resolution", "aspect_ratio"],
  // MIGRADO em 01/09/2026 (V33, item 1) de `wan/v2.6/reference-to-video/
  // flash` para `alibaba/wan-3.0/reference-to-video`. `multi_shots` e
  // `negative_prompt` SAÍRAM da lista — o schema novo não tem esses campos
  // (confirmado por WebFetch, V32); o que eles evitavam agora é texto dentro
  // do próprio prompt, sem default de fornecedor para fechar. `generate_audio`
  // virou `audio` (mesmo papel, nome novo).
  "alibaba/wan-3.0/reference-to-video": ["audio", "resolution", "duration", "enable_prompt_expansion"],
  "fal-ai/sync-lipsync/v2": ["sync_mode", "model"],
} as const;

/**
 * O EQUIVALENTE do mapa acima, para o motor Premium (Seedance 2.5) — num mapa
 * SEPARADO, de propósito.
 *
 * `checkFalPipelinePolicy.ts` itera `DEFAULTS_NUNCA_HERDADOS` inteiro contra
 * o CAMINHO FELIZ que ele exercita — que é só o tier "Normal" (Wan). Somar a
 * chave do Seedance àquele mapa faria aquela guarda procurar, na corrida do
 * Wan, uma submissão ao Seedance que nunca acontece — falso failure numa
 * guarda que hoje passa. `checkFalTierPolicy.ts` confere este mapa contra a
 * corrida do tier "Premium", separadamente.
 *
 * ⚠️ Lista MENOR que a do Wan, e por honestidade: os únicos campos do corpo
 * do Seedance que este projeto sabe nomear vêm do BLOCO SEEDANCE-1 (21/08,
 * nunca commitado antes do revert) — `duration` e `aspect_ratio`. Não há
 * schema lido para confirmar se existem outros defaults caros a fechar aqui,
 * ao contrário do Wan (`enable_prompt_expansion`/`multi_shots`, MEDIDOS por
 * fusível em 14/08). NÃO VERIFICADO.
 */
export const DEFAULTS_NUNCA_HERDADOS_PREMIUM = {
  "bytedance/seedance-2.5/reference-to-video": ["duration", "aspect_ratio"],
} as const;

// ---------------------------------------------------------------------------
// FASE 0 — regras de sistema, SEMPRE concatenadas, nunca editáveis pela pessoa
// ---------------------------------------------------------------------------

/**
 * As três correções de vídeo medidas na POC de composição por frações
 * (fora deste repositório, 21/08): câmera fixa, gesto contido, mão que nunca
 * cruza o rosto — mais uma quarta, medida em produção na RODADA 6 (30/08,
 * `DIRECAO_PLANO_UNICO` logo abaixo). Em INGLÊS, porque `promptDeDirecao`
 * chega aqui já traduzido (`directionTranslation.ts`, na rota) — concatenar
 * em português produziria um prompt bilíngue que o Seedance nunca viu.
 */
export const DIRECAO_CAMERA_FIXA =
  "camera locked and fixed, no zoom, no pan, no camera movement of any kind — only the character moves";
export const DIRECAO_GESTOS_CONTIDOS = "short, contained gestures kept at chest height";
export const DIRECAO_MAO_NAO_CRUZA_ROSTO =
  "the hand never crosses in front of the face at any point in the clip";
/**
 * A QUARTA regra — RODADA 6, item 5 (30/08/2026), DEFEITO MEDIDO. O quadro
 * bruto do bloco 2 de uma corrida real de 3 blocos
 * (`effe03c6-b896-4469-8880-c8286306d87b`) saiu como um TRÍPTICO — três
 * painéis verticais da mesma pessoa — direto do Wan, antes de qualquer
 * concat local. Cláusula explícita de plano único, na MESMA categoria das
 * três acima (regra de sistema, não complemento de instrução do usuário).
 * `negative_prompt` (`NEGATIVE_PROMPT_ANIMAR_WAN`) já ganhou os termos
 * correspondentes no item 4 desta rodada — as duas mudanças cobrem o MESMO
 * defeito medido por dois canais diferentes do payload. EFEITO NÃO
 * VERIFICADO — nenhuma geração nova confirmou que a cláusula reduz a
 * recorrência.
 */
export const DIRECAO_PLANO_UNICO = "single continuous shot, one person, full frame, no split screen";

/**
 * TRÊS regras NOVAS, só do Wan 3.0 (V33, item 6, 01/09/2026) — por isso NÃO
 * entram em `comDefaultsDeDirecao` (compartilhada com o Seedance/Premium,
 * fora de escopo desta rodada): são concatenadas só dentro de
 * `corpoAnimarWan`. As três existem por exigência DOCUMENTADA do
 * `sync-lipsync` (etapa 4, sempre depois de `animar`), não por preferência
 * estética — a doc do fornecedor mede detecção de rosto pior em perfil
 * extremo e em rosto pequeno no quadro, e o pipeline inteiro depende dessa
 * detecção para o lábio sincronizar depois.
 */
export const DIRECAO_ROSTO_FRONTAL_WAN3 =
  "the face stays frontal or near-frontal to the camera at all times, never in extreme profile";
export const DIRECAO_ENQUADRAMENTO_ROSTO_WAN3 =
  "the face occupies roughly 20 to 40 percent of the frame height, close enough for clear lip detail";
export const DIRECAO_FALANDO_NATURALMENTE_WAN3 =
  "the person is speaking naturally, mouth already moving as if mid-sentence from the first frame";

/**
 * O EQUIVALENTE, em texto positivo, do `negative_prompt` do Wan 2.6
 * (`NEGATIVE_PROMPT_ANIMAR_WAN` logo abaixo) — V33, item 4, 01/09/2026.
 * `alibaba/wan-3.0/reference-to-video` NÃO documenta `negative_prompt`
 * (MEDIDO por WebFetch, V32, Parte A) — o único canal que sobra para os
 * mesmos artefatos que aquele campo evitava é o próprio `prompt`, escrito
 * como instrução do que EVITAR em vez de uma lista de termos a excluir.
 * MESMO conteúdo, forma diferente: nenhum termo foi acrescentado nem
 * removido nesta conversão. `lintarPromptDoBlocoWan` verifica que este texto
 * (ou uma frase-âncora dele) chegou ao prompt final, no lugar de exigir o
 * campo `negative_prompt` que este endpoint não tem mais.
 */
export const ANTI_ARTEFATO_WAN3 =
  "Avoid: cartoon style, 3D render look, plastic or waxy skin, any subtitles, captions, text overlay or " +
  "watermark burned into the frame, garbled text, distorted face, flickering or unstable lighting, sudden " +
  "brightness or color changes, strobing, split screen, grid, collage, multiple panels, triptych, duplicate " +
  "person, angry or scowling expression, furrowed brow.";

/**
 * O `negative_prompt` do Wan — RODADA 2, 29/08/2026.
 *
 * ┌─ Por que só aqui, e não nas outras duas etapas pagas ────────────────────┐
 * │ Schema de cada endpoint LIDO por GET antes de tocar código (mesma regra  │
 * │ de `RESOLUCAO_IMAGEM`/`ENDPOINT_ANIMAR`, nunca supor campo): o Wan       │
 * │ documenta `negative_prompt` (string, até 500 caracteres, default vazio) │
 * │ nos DOIS endpoints já usados nesta linha do tempo —                     │
 * │ `wan/v2.6/image-to-video/flash` (RECONFIRMADO por `WebFetch` em 29/08   │
 * │ ao investigar o Item 3 abaixo). `fal-ai/nano-banana-2/edit` (`compor`)  │
 * │ e `fal-ai/sync-lipsync/v2` (`sincronizar`) NÃO têm este campo no schema │
 * │ publicado — mandar um campo que o fornecedor não documenta é o mesmo    │
 * │ risco já registrado em `checkFalUploadGuardPolicy`/                     │
 * │ `additionalProperties`: nem sempre 4xx, às vezes aceito e ignorado em    │
 * │ silêncio. `bytedance/seedance-2.5/reference-to-video` (`animar`, tier    │
 * │ Premium) também não documenta o campo — por isso `corpoAnimarSeedance`   │
 * │ fica de fora.                                                            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Valor inicial fixo, sem UI para editá-lo: mesma categoria de
 * `DIRECAO_CAMERA_FIXA` acima — regra de sistema contra artefato visual
 * comum de vídeo por IA, não uma escolha da pessoa.
 *
 * **Termos de instabilidade de luz acrescentados em 29/08 — Item 3 da rodada
 * de correções pós-vídeo-mudo.** MEDIDO: cintilação de luz DENTRO do bloco 1
 * (7,0-8,3s, sem corte nem transição, mesma pose sentada o tempo todo — pico
 * Bhattacharyya 0,21). Investigado por ELIMINAÇÃO, não por chamada nova: o
 * `concatVideos` (`ffmpeg.ts`) só aplica `scale`/`setsar`/`xfade` nos limites
 * ENTRE blocos (~9,85s e ~19,2s neste vídeo) — nenhuma operação do pipeline
 * local atua no meio de um bloco único, então o artefato não pode ter sido
 * introduzido pelo pós-processamento local. ⚠️ **NÃO É POSSÍVEL confirmar se
 * é o Wan variando a luz durante a própria geração** (hipótese mais provável,
 * dado que nenhuma outra causa sobra) **sem inspecionar o vídeo BRUTO do
 * bloco 1 antes do ffmpeg — e essa URL bruta não foi salva nesta sessão** (só
 * o vídeo final concatenado; o log da chamada mascara a URL do fornecedor por
 * segurança). Confirmar exigiria uma nova geração paga, NÃO autorizada nesta
 * rodada. Os termos abaixo são a única correção possível SEM gastar: mesma
 * categoria de risco baixo dos termos de pele/cartoon já existentes, mas o
 * EFEITO NÃO FOI VERIFICADO — cobre geometria (Bug F) já é insuficiente por
 * si, e nada garante que o Wan trate "flickering"/"unstable lighting" como
 * describe visual a evitar da mesma forma que trata "cartoon"/"plastic skin".
 *
 * **Termos de tela dividida e expressão agressiva acrescentados em
 * 30/08/2026 — RODADA 6, item 4, DEFEITO MEDIDO (não hipótese).** Baixado o
 * arquivo BRUTO do bloco 2 de uma corrida real de 3 blocos
 * (`effe03c6-b896-4469-8880-c8286306d87b`, direto da fal, antes de
 * qualquer concat local) e extraído um quadro: o Wan devolveu um TRÍPTICO
 * — três painéis verticais da mesma pessoa lado a lado — com expressão
 * próxima de raivosa/carrancuda nos três. Os blocos 0 e 1 da MESMA
 * corrida saíram como painel único e limpo — o defeito não é sistemático
 * nem nasce do nosso pipeline de concat local (que só atua DEPOIS, na
 * emenda entre blocos já prontos). `split screen`/`grid`/`collage`/
 * `multiple panels`/`triptych`/`duplicate person` cobrem a FORMA medida do
 * defeito; `angry`/`scowling`/`furrowed brow` cobrem a EXPRESSÃO medida no
 * mesmo quadro. Lista curta de propósito: nenhum termo genérico sem
 * defeito observado por trás. EFEITO NÃO VERIFICADO — nenhuma geração nova
 * confirmou que estes termos reduzem a recorrência.
 */
export const NEGATIVE_PROMPT_ANIMAR_WAN =
  "cartoon, 3D render, plastic skin, waxy skin, subtitles, captions, text overlay, watermark, garbled text, " +
  "distorted face, flickering lighting, unstable lighting, sudden brightness or color changes, strobing, " +
  "split screen, grid, collage, multiple panels, triptych, duplicate person, angry, scowling, furrowed brow";

/**
 * Camada 1 — LINTER DETERMINÍSTICO do prompt do Wan, item 4 da rodada de
 * 29/08 seguinte. Existe porque o Item 4 dessa rodada, ao ser AVALIADO (não
 * suposto), achou um bug real que nenhum mutante de fixture pegava: a
 * cláusula de pose do compor citava os marcadores de TODOS os blocos, não
 * só do primeiro (ver `direcaoDoPrimeiroBloco`, scriptFractioning.ts, e os
 * dois call sites corrigidos — `promptDaComposicao` em avatarProvider.ts e
 * `promptDaComposicaoDaLinha` em routes/videos.ts). Este linter é a segunda
 * metade da correção: pega a MESMA classe de bug (texto errado chegou ao
 * campo certo) se ela voltar por outro caminho, ANTES de gastar dinheiro
 * descobrindo num vídeo pago — síncrono, sem chamada de rede, custo zero.
 */
export class WanPromptLintError extends Error {
  constructor(readonly motivos: string[]) {
    super(
      `linter determinístico do prompt do Wan reprovou ANTES da chamada paga: ${motivos.join("; ")}. ` +
        "Nada foi cobrado — a corrida é recusada aqui, não depois de um vídeo pago mostrar o mesmo defeito.",
    );
    this.name = "WanPromptLintError";
  }
}

const MARCADOR_DE_JANELA_LINT = /\[\d{1,2}:\d{2}-\d{1,2}:\d{2}\]/;
// Palavras funcionais do português, escolhidas por serem comuns em direção
// de cena e por NÃO colidirem com palavras inglesas parecidas — "não"/
// "está"/"você" têm diacrítico (nunca aparecem em inglês por acidente);
// "com"/"para"/"ela"/"ele"/"ção" são checadas com fronteira de palavra
// (`\b`) para não casar dentro de "come", "comfort" etc. Heurística, não
// detecção de idioma real — ver `resolveInterfaceLocale` (directionTranslation.ts)
// para por que detecção de idioma foi descartada como método neste projeto.
// Falso positivo aceitável (recusa e não cobra); falso negativo é o que
// este item existe para reduzir.
//
// RODADA 8 (30/08/2026) — `/\bnão\b/i` MEDIDO reprovando um caso real: a
// direção traduzida cita a fala do roteiro entre aspas retas (ex.: `"Inovar
// não é criar o futuro..."`, ver directionTranslation.ts), e a fala citada é
// texto em português DE PROPÓSITO, não esquecimento de tradução. Naquela
// rodada só `/\bnão\b/i` foi corrigido — os outros 7 termos ficaram como
// estavam, por instrução explícita de corrigir só o que bloqueou de fato.
//
// RODADA 8b (30/08/2026) — os outros 7 têm o MESMO problema em tese (uma
// fala citada pode conter "com"/"para"/"ela"/etc. tão facilmente quanto
// "não"), e a mesma técnica se generaliza: TODOS os 8 termos agora são
// testados contra o prompt COM as aspas removidas
// (`removerFalaEntreAspas` — só remove pares `"..."` fechados; aspa aberta
// sem fechar não é removida, e continua visível de propósito, mais seguro
// recusar demais do que deixar passar um trecho não fechado por engano). A
// heurística continua vigiando o resto do prompt (a direção em inglês) por
// português esquecido FORA das aspas, que é o caso real que ela existe para
// pegar. Nesta rodada foi ACHADO (não corrigido ainda) que `/\bvocê\b/i` e
// `/\bestá\b/i` nunca casavam nada — ver RODADA 9 abaixo.
//
// RODADA 9 (30/08/2026) — `/\bvocê\b/i` e `/\bestá\b/i` NUNCA reprovavam
// nada, com ou sem aspas: o `\b` do JavaScript exige fronteira `\w`
// (`[A-Za-z0-9_]`, só ASCII), e as duas regexes terminam exatamente no
// caractere acentuado ("ê", "á") — que não é `\w` — então a fronteira final
// nunca fechava. Trocadas por lookaround com `\p{L}` (qualquer letra
// Unicode, flag `u`), que não depende de `\w`: `(?<!\p{L})termo(?!\p{L})`
// reprova "você"/"está" cercados por espaço, pontuação ou fim de string,
// e continua sem casar dentro de outra palavra (ex.: "devocê"). Os outros 6
// termos, que já funcionavam, não foram tocados.
const TERMOS_PT_HEURISTICA = [
  /\bnão\b/i,
  /(?<!\p{L})você(?!\p{L})/iu,
  /(?<!\p{L})está(?!\p{L})/iu,
  /\bcom\b/i,
  /\bela\b/i,
  /\bele\b/i,
  /ção\b/i,
  /\bpara\b/i,
];

function removerFalaEntreAspas(texto: string): string {
  return texto.replace(/"[^"]*"/g, "");
}

/**
 * As quatro checagens pedidas: prompt vazio, marcador de janela vazado,
 * português não traduzido, `negative_prompt` ausente. Roda sobre o corpo JÁ
 * MONTADO de `animar()` — pega o bug de FIAÇÃO (conteúdo real de uma
 * corrida real), que um mutante de fixture não alcança porque testa a
 * função isolada com um valor de exemplo, nunca o texto que uma corrida de
 * verdade produziu.
 */
/**
 * ÂNCORA curta do texto de `ANTI_ARTEFATO_WAN3` — usada só para o linter
 * confirmar que o bloco anti-artefato chegou ao prompt final, sem comparar a
 * frase inteira (uma reformulação futura do texto não quebraria este
 * linter à toa). V33, item 4: substitui a checagem antiga de campo
 * `negative_prompt`, que não existe mais no corpo do Wan 3.0.
 */
const ANCORA_ANTI_ARTEFATO_LINT = "cartoon style";

export function lintarPromptDoBlocoWan(corpo: Record<string, unknown>): void {
  const motivos: string[] = [];
  const prompt = typeof corpo.prompt === "string" ? corpo.prompt : "";
  if (!prompt.trim()) motivos.push("prompt vazio");
  if (MARCADOR_DE_JANELA_LINT.test(prompt)) {
    motivos.push("prompt contém marcador [mm:ss-mm:ss] não removido pelo fatiamento por bloco");
  }
  const promptSemFala = removerFalaEntreAspas(prompt);
  if (TERMOS_PT_HEURISTICA.some((re) => re.test(promptSemFala))) {
    motivos.push("prompt parece conter português não traduzido");
  }
  // V33, item 4 — o Wan 3.0 não tem campo `negative_prompt` (schema LIDO por
  // WebFetch, V32): o que antes era um campo separado agora é texto DENTRO
  // do próprio prompt (`ANTI_ARTEFATO_WAN3`). Checa a âncora em vez do
  // campo — mesma garantia (o bloco anti-artefato não pode faltar), canal
  // diferente.
  if (!prompt.includes(ANCORA_ANTI_ARTEFATO_LINT)) {
    motivos.push("prompt sem o bloco anti-artefato (ANTI_ARTEFATO_WAN3 não chegou ao texto final)");
  }
  if (motivos.length > 0) throw new WanPromptLintError(motivos);
}

/**
 * Aplicada AQUI, no orquestrador, e não em quem monta `promptDeDirecao`
 * (`avatarProvider.ts`, `routes/videos.ts`) — porque este é o ÚNICO lugar
 * por onde todo pedido converge antes de custar dinheiro: criação
 * (`runFalPipeline`), retomada pós-aprovação (`runFalPipelineDaImagem`) e
 * a sonda (`probeFalPipeline.ts`) chamam todas `etapaNaFal` por baixo. Uma
 * regra concatenada no CALL SITE, em vez de aqui, teria de ser copiada em
 * cada um dos três — e é copiar-em-cada-lugar que já produziu drift antes
 * neste mesmo arquivo (ver `promptDaComposicaoDaLinha` em `routes/videos.ts`).
 *
 * SEMPRE concatena, mesmo com o texto da pessoa vazio: as três regras não
 * dependem de a pessoa ter escrito nada — são default do sistema, não
 * complemento de uma instrução.
 *
 * ITEM 3, RODADA 6 (30/08/2026) — a composição (`comDefaultsDeComposicao`)
 * foi REMOVIDA: a única regra que ela concatenava
 * (`COMPOSICAO_PELE_ATENUACAO_LEVE`, "atenuação leve de textura,
 * suavização sutil") CONTRADIZIA `NEGATIVE_PROMPT_ANIMAR_WAN` ("plastic
 * skin, waxy skin") — um pedia suavização, o outro proibia pele
 * artificial/encerada, no mesmo vídeo. Nenhuma imagem foi gerada para medir
 * o efeito da contradição; a remoção é preventiva, não uma correção medida.
 * `input.promptDeComposicao` volta a ir cru ao `compor()`, sem default de
 * sistema nenhum — nada substituiu a regra.
 */
export function comDefaultsDeDirecao(promptDaPessoa: string): string {
  return [
    promptDaPessoa.trim(),
    DIRECAO_CAMERA_FIXA,
    DIRECAO_GESTOS_CONTIDOS,
    DIRECAO_MAO_NAO_CRUZA_ROSTO,
    DIRECAO_PLANO_UNICO,
  ]
    .filter(Boolean)
    .join(". ");
}

export const ENDPOINT_COMPOR = "fal-ai/nano-banana-2/edit";
/**
 * SEM prefixo `fal-ai/` — MEDIDO por fusível em 14/08 (ENDPOINTS-3), e é a
 * causa raiz dos dois 404 anteriores (COMPOR-1 e ENDPOINTS-2). O Wan 2.6 é
 * modelo Partner e mora direto no namespace `wan/`; `fal-ai/wan` EXISTE como
 * app (é onde vive a família Wan 2.2) e por isso o fornecedor devolvia 404 no
 * SUB-PATH, nunca no app — a submissão sempre aceitava (200/IN_QUEUE) e o
 * erro só aparecia no resultado, o mesmo padrão enganoso medido duas vezes
 * antes. `fal-ai/nano-banana-2/edit` (owned, prefixo `fal-ai/`) serviu de
 * gabarito e por isso o prefixo errado não chamou atenção.
 *
 * Revertido pra Wan em 21/08 — motor do tier "Normal" do sistema de
 * níveis de vídeo. A troca pro Seedance 2.5 (image_urls, end_user_id,
 * aspect_ratio) fica reservada pro tier "Premium", com teto de gasto
 * próprio (ainda não implementado) em vez do PIPELINE_TETO_USD global.
 *
 * ┌─ MIGRADO em 29/08 de `image-to-video/flash` para `reference-to-video/    ┐
 * │ flash` — item 2 desta rodada. Schema LIDO por `WebFetch` antes de tocar   │
 * │ código (mesma regra de sempre): o endpoint velho recebia `image_url`     │
 * │ SINGULAR como quadro de PARTIDA — o vídeo era, literalmente, a           │
 * │ animação daquela imagem. O novo recebe `image_urls` (lista, até 5) como  │
 * │ REFERÊNCIA DE IDENTIDADE ("extracts appearance... generates new scenes  │
 * │ maintaining... consistency", doc do fornecedor) — não fixa quadro de     │
 * │ partida nenhum; cada bloco é uma cena NOVA, ancorada na mesma imagem.    │
 * │                                                                          │
 * │ Por isso o encadeamento por ÚLTIMO QUADRO (`imagemDeEntradaDoProximoBloco`,│
 * │ Bug G) SAIU: com referência-de-identidade em vez de quadro-de-partida,   │
 * │ encadear o último quadro degradado não faz mais sentido — TODO bloco     │
 * │ agora referencia a MESMA imagem composta original, nunca um quadro       │
 * │ anterior. Preço por segundo IDÊNTICO ao do endpoint antigo — `$0,10/s` a  │
 * │ 720p é o "standard R2V", e o flash mudo (`generate_audio: false`) é 25%   │
 * │ disso, os MESMOS `$0,025/s` de antes (LIDO: <https://fal.ai/models/wan/  │
 * │ v2.6/reference-to-video/flash/api> + <https://fal.ai/models/wan/v2.6/    │
 * │ reference-to-video> para o preço "standard").                            │
 * │                                                                          │
 * │ ⚠️ **NÃO VERIFICADO por chamada real ainda que a continuidade entre       │
 * │ blocos (pose/posição do corpo de um bloco para o outro) se sustente sem  │
 * │ quadro de partida fixo** — é exatamente o que o teste real desta rodada   │
 * │ (o vídeo mudo) existe para responder.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * MIGRADO em 01/09/2026 de `wan/v2.6/reference-to-video/flash` para
 * `alibaba/wan-3.0/reference-to-video` — V33, item 1. Schema LIDO por
 * WebFetch (V32, Parte A): o campo de imagens de referência foi RENOMEADO
 * `image_urls` → `reference_image_urls` (mesmo papel, até 10 imagens);
 * `duration` virou INTEIRO sem enum fechado (o Wan 2.6 só aceitava "5" ou
 * "10" string — ver `PIPELINE_DURATION_OPTIONS`); NÃO existe
 * `negative_prompt` nem `multi_shots` neste endpoint — os dois viram texto
 * dentro do próprio prompt (ver `ANTI_ARTEFATO_WAN3` e as cláusulas de
 * direção novas em `corpoAnimarWan`); o campo de áudio nativo chama-se
 * `audio` (boolean, default `true`), não `generate_audio`. Preço LIDO por
 * resolução (migration 073): US$ 0,05/s a 480p — ver `RESOLUCAO_VIDEO`.
 *
 * Áudio nativo do Wan 3.0 foi TESTADO e DESCARTADO (sonda V32,
 * `probeWan3ReferenceToVideo.ts`, ~US$ 1,02 reais): `reference_audio_urls`
 * tem teto de 15s totais e o modelo RE-SINTETIZA a fala a partir do texto do
 * prompt — não reproduz o mp3 enviado — então não garante o roteiro literal
 * do tenant. A voz continua sendo SEMPRE o clone do ElevenLabs, e o lábio
 * continua sendo SEMPRE `sync-lipsync` — `audio: false` vai explícito em
 * toda chamada (`corpoAnimarWan`), e `reference_audio_urls` nunca é
 * populado.
 */
export const ENDPOINT_ANIMAR = "alibaba/wan-3.0/reference-to-video";

/**
 * O motor do tier "Premium" — BLOCO A, 21/08.
 *
 * ⚠️ **NÃO VERIFICADO se o id leva o prefixo `fal-ai/`.** O Wan (`ENDPOINT_ANIMAR`
 * acima) precisou ter o prefixo REMOVIDO — MEDIDO por fusível em 14/08
 * (ENDPOINTS-3) — porque é modelo Partner e mora direto no namespace `wan/`.
 * O Seedance 2.5 é da Bytedance, e se a mesma convenção de Partner valer para
 * ele, este id também está sem prefixo — mas isso NUNCA foi testado por
 * fusível nem por chamada real: o BLOCO SEEDANCE-1 (21/08) foi revertido no
 * mesmo dia, antes de qualquer submissão de verdade sair. Um id errado aqui
 * vira 404 no fornecedor (custo zero, MEDIDO duas vezes com o Wan errado),
 * não cobrança — mas é exatamente o tipo de suposição que já custou dois 404
 * neste arquivo antes de ser corrigida.
 */
export const ENDPOINT_ANIMAR_PREMIUM = "bytedance/seedance-2.5/reference-to-video";

export const ENDPOINT_SINCRONIZAR = "fal-ai/sync-lipsync/v2";

/** Qual `animar()` usar, pelo tier. `"normal"` é o default em todo call site. */
export function enderecoAnimarParaTier(tier: PipelineTier): string {
  return tier === "premium" ? ENDPOINT_ANIMAR_PREMIUM : ENDPOINT_ANIMAR;
}

/**
 * `lipsync-2`, EXPLÍCITO — e esta constante existe por causa do preço.
 *
 * A variante `pro` custa ~67% mais (DOCUMENTADO pelo operador em 13/08; nenhuma
 * fatura foi conferida aqui). O campo nunca foi enviado, então qual das duas
 * rodava era decisão do fornecedor — e o custo desta etapa entrava na conta
 * como um número que ninguém deste lado tinha escolhido.
 *
 * Não é o mesmo caso de `SYNC_MODE`: ali o default mudava o RESULTADO e dava
 * para descobrir olhando o vídeo. Aqui ele muda a FATURA, e a única evidência
 * chega no fim do mês, quando já não há o que decidir.
 *
 * ⚠️ **NÃO VERIFICADO que `lipsync-2` seja o nome aceito**, e o modo de falha é
 * benigno: campo desconhecido volta 4xx da fila, ANTES de renderizar — a etapa
 * não sai e não custa. É o oposto do risco de omitir, que sai, funciona e cobra
 * o preço da variante que o fornecedor escolher.
 */
export const LIPSYNC_MODEL = "lipsync-2";

/**
 * `cut_off` — mudado de `loop` no BLOCO B5, e a razão é dupla.
 *
 * ┌─ 1. `loop` nunca foi documentado NEM observado ──────────────────────────┐
 * │ Ele tinha sido escolhido por ELIMINAÇÃO: sabia-se o que `cut_off` faria  │
 * │ no caso inverso (cortar a fala), e `loop` sobrou. Mas o que `loop` faz   │
 * │ quando o vídeo é mais longo que o áudio não está na documentação e nunca │
 * │ foi visto — e este pipeline não pode ter, na etapa mais cara, o único    │
 * │ parâmetro que ninguém sabe ler. `cut_off` é o comportamento DOCUMENTADO. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 2. Em CADA duração escolhida, o que sobra é VÍDEO, não fala ────────────┐
 * │ A duração é escolhida (`escolherDuracao`) para que a fala caiba com a    │
 * │ MESMA folga em qualquer das três opções — o roteiro de 95 caracteres     │
 * │ que dispararia 10 s tem fala de `95 ÷ 10,89` = ~8,72 s num clipe de      │
 * │ 10 s, e a mesma proporção vale para 5 s (47 → ~4,32 s) e 15 s            │
 * │ (142 → ~13,04 s). Cortar o excedente corta o vídeo mudo do fim — a fala  │
 * │ sai inteira, porque ela é a mais CURTA das duas. A objeção original a    │
 * │ `cut_off` descrevia o caso oposto (áudio maior que vídeo), que o teto de │
 * │ caracteres por duração existe para não deixar acontecer.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ **A segurança disto REPOUSA no teto, e o teto repousa num número NÃO
 * VERIFICADO.** Se a fala exceder o clipe, `cut_off` corta a FALA — e o que
 * impede a fala de exceder é `PIPELINE_MAX_CHARS_POR_DURACAO`, derivado de
 * `PIPELINE_RITMO_DISPERSAO` (14,36%), que não tem medição registrada neste
 * repositório. Um ritmo pior que a dispersão fixada devolve exatamente o
 * defeito que `loop` fora escolhido para evitar. A dependência mudou de lugar:
 * antes estava num parâmetro que ninguém conhecia, agora está num teto que está
 * escrito, nomeado e cobrável.
 */
export const SYNC_MODE = "cut_off";

/**
 * DOIS vocabulários de resolução, e eles NÃO são intercambiáveis.
 *
 * ⚠️ MEDIDO em 13/08, e custou uma composição: `nano-banana-2/edit` recusa
 * `"720p"` com 422 — `Input should be '0.5K', '1K', '2K' or '4K'`. O Wan usa a
 * escala em `p`. Uma constante só para os dois parecia economia e era um erro
 * esperando o momento mais caro para aparecer.
 *
 * Pior: a fila ACEITOU a submissão (200, IN_QUEUE) e o erro só apareceu no
 * RESULTADO, com `status: COMPLETED` e `inference_time: 0.058` — ou seja, o
 * status diz concluído mesmo quando o worker recusou o payload.
 */
export const RESOLUCAO_IMAGEM = "1K";

/**
 * A do clipe. `480p` — V33, item 7 (01/09/2026), MEDIDO por WebFetch: o
 * schema de `alibaba/wan-3.0/reference-to-video` documenta o enum
 * `480p|720p|1080p`, e 480p é o piso pedido nesta rodada (rosto pequeno em
 * baixa resolução degrada a detecção do `sync-lipsync` — ver a exigência de
 * enquadramento em `DIRECAO_ENQUADRAMENTO_ROSTO_WAN3`). 720p/1080p custam
 * 2×/4× por segundo (US$ 0,10/US$ 0,20 — migration 073) e NÃO foram
 * escolhidos nesta rodada; a diferença de custo/qualidade fica reportada ao
 * operador para decisão, não decidida aqui.
 *
 * Antes de 01/09/2026 era `"720p"`, NÃO VERIFICADO no Wan 2.6 (só o
 * vocabulário do `nano-banana` tinha sido medido) — texto histórico,
 * superado por esta migração.
 */
export const RESOLUCAO_VIDEO = "480p";

// ---------------------------------------------------------------------------
// O DIÁRIO — a persistência, injetada
// ---------------------------------------------------------------------------

/**
 * `publicar` é a ORDEM 0: as entradas subindo para o storage da fal.
 *
 * Não é etapa paga — o upload não é tarifado (MEDIDO em 13/08) — e é por isso
 * que ela existe separada em vez de virar um detalhe dentro de `compor`: o que
 * o diário registra é o que pode ser cobrado ou recuperado depois, e um
 * `file_url` publicado é recuperável (dá para recompor sem subir de novo) sem
 * nunca ter sido cobrado. Misturá-la com `compor` faria a primeira etapa paga
 * parecer ter começado antes de o teto ter sido consultado.
 */
export type EtapaDoPipeline = "publicar" | "compor" | "animar" | "narrar" | "sincronizar" | "biblioteca";

/**
 * Onde a corrida é registrada.
 *
 * Injetado, e não importado: o orquestrador precisa ser exercitável sem banco.
 * A implementação de produção é `falPipelineJournal.ts`; a guarda passa um
 * gravador em memória e observa a ORDEM em que os métodos são chamados.
 */
export interface DiarioDoPipeline {
  /**
   * Abre a etapa. Devolve um id opaco usado nas gravações seguintes.
   *
   * `blocoIndice` — V30, item 2. O índice (0-based) do bloco de animação
   * que ESTA etapa representa, para um vídeo Normal fracionado em N blocos.
   * `undefined`/`null` para toda etapa que não seja um bloco de animação
   * fracionada — inclusive o `animar` de um vídeo que coube num bloco só.
   * OPCIONAL na interface: guardas com diário em memória não precisam
   * implementá-lo, e `etapaNaFal` só o passa adiante quando existe.
   */
  abrirEtapa(
    etapa: EtapaDoPipeline,
    ordem: number,
    vendor: string,
    endpointId: string | null,
    blocoIndice?: number | null,
  ): Promise<string>;
  /**
   * O seed Wan desta corrida — V30, item 1. Lê o valor gravado por
   * `abrirCorrida` na abertura (migration 072); se a corrida for de ANTES
   * desta migration (`seed_wan` NULL), gera um novo e o grava agora, para
   * que a corrida passe a ter um seed estável dali em diante. OPCIONAL:
   * guardas com diário em memória não precisam implementá-lo —
   * `animarNarrarSincronizar` cai para `gerarSeedWan()` fresco quando
   * ausente, o comportamento de antes desta rodada.
   */
  lerSeed?(): Promise<number>;
  /** O PONTEIRO para o trabalho pago. Chamado antes de qualquer interpretação. */
  gravarRequestId(stepId: string, requestId: string): Promise<void>;
  /**
   * As URLs REAIS da fila (status/resultado) que a fal devolve no submit —
   * V28, item 3, migration 071. OPCIONAL (`?`): guardas/sondas com diário em
   * memória não precisam implementá-la, e `etapaNaFal` só a chama quando
   * existe (`input.diario.gravarUrlsDaFila?.(...)`). Sem ela, um timeout de
   * poll preserva o request_id mas não como a recuperação consultaria a fila
   * depois sem reconstruir a URL por fórmula — arriscado, ver a migration.
   */
  gravarUrlsDaFila?(stepId: string, statusUrl: string, responseUrl: string): Promise<void>;
  /** O corpo BRUTO, antes de qualquer parsing. */
  gravarRespostaCrua(stepId: string, raw: string): Promise<void>;
  fecharEtapa(stepId: string, status: "completed" | "failed", motivo?: string): Promise<void>;
  /**
   * O ACUMULADO autorizado desta corrida, gravado a cada `autorizarGasto` —
   * migration 062.
   *
   * Na CORRIDA, não na etapa: `autorizarGasto` roda ANTES de `abrirEtapa` (o
   * porteiro do dinheiro é o primeiro a falar, e uma etapa recusada por teto
   * nunca chega a existir), então não há stepId para pendurar o número. E é a
   * corrida que soma por `video_id` — ver `gastoAcumuladoDoVideoUsd`.
   *
   * SOBRESCREVE, não incrementa: quem chama já passa o acumulado inteiro. Uma
   * gravação perdida por falha de rede não desalinha o total — a próxima
   * etapa regrava o acumulado correto.
   */
  registrarGastoPrevisto(acumuladoUsd: number): Promise<void>;
}

export class FalPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FalPipelineError";
  }
}

/**
 * O poll ESTOUROU — mas o trabalho foi ACEITO pela fal. V28, item 3.
 *
 * ┌─ Por que é uma classe própria, e não FalPipelineError genérica ─────────┐
 * │ MEDIDO em 31/08 (V27): um vídeo real (`c8f9ff46`) estourou este mesmo   │
 * │ teto, foi marcado `status='error'`/`vendor_rejected` (rótulo ERRADO —   │
 * │ não foi o fornecedor que rejeitou, foi o NOSSO poll que desistiu), e o  │
 * │ bloco em questão tinha COMPLETADO na fal minutos depois — MEDIDO por    │
 * │ GET de status/resultado, gratuito, contra o `request_id` gravado:       │
 * │ `status: "COMPLETED"`, vídeo de 4,97s pronto, nunca buscado. `error`     │
 * │ terminal escondia isso: `routes/videos.ts` tratava qualquer exceção     │
 * │ deste laço do mesmo jeito que uma recusa de schema (nada a recuperar).  │
 * │                                                                          │
 * │ Com uma classe própria, quem chama pode distinguir "a fal recusou o     │
 * │ trabalho" (terminal, sem o que buscar depois) de "a fal aceitou e eu    │
 * │ desisti de esperar" (recuperável — `requestId` é a chave de tudo que    │
 * │ falta) SEM ter de fazer parsing de mensagem.                            │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export class FalPollTimeoutError extends FalPipelineError {
  constructor(
    message: string,
    public readonly requestId: string,
    public readonly statusUrl: string,
    public readonly etapa: EtapaDoPipeline,
  ) {
    super(message);
    this.name = "FalPollTimeoutError";
  }
}

/**
 * O ROTEIRO (ou a divisão em blocos que ele exige) não cabe no que este
 * tier suporta — BUG 2, 29/08/2026.
 *
 * Subclasse PRÓPRIA, e não `FalPipelineError` genérica, porque
 * `classifyVendorFailure` (vendorError.ts) precisa distinguir ESTAS duas
 * recusas (`conferirRoteiro`/`conferirRoteiroENormal`, ambas por
 * `instanceof` aqui) das outras ~8 razões que `FalPipelineError` cobre —
 * timeout de poll, resposta sem URL, teto de gasto, upload falhou, preço
 * ausente. Todas essas OUTRAS são sobre o FORNECEDOR ou sobre DINHEIRO;
 * só estas duas são sobre o TEXTO que a pessoa escreveu, nunca chegam a
 * cogitar uma chamada paga, e por isso são as únicas que fazem sentido
 * sair como "mude o roteiro", não "tente de novo" nem "falha no serviço".
 */
export class RoteiroInvalidoError extends FalPipelineError {
  constructor(message: string) {
    super(message);
    this.name = "RoteiroInvalidoError";
  }
}

/** Uma imagem de entrada da composição, já em bytes. Ver `entradasExtras`. */
export interface EntradaDeComposicao {
  /** Aparece no diário e no log. Não vai ao fornecedor. */
  rotulo: "rosto" | "traje" | "cenario" | "lado_direito" | "lado_esquerdo";
  bytes: Buffer;
  mimeType: string;
}

export interface FalPipelineInput {
  apiKeyFal: string;
  apiKeyElevenLabs: string;
  /** Reusado, nunca clonado: clonar consome slot irreversível. */
  voiceId: string;
  /**
   * Os quatro ajustes de síntese do avatar — migration 067, 25/08. Opcional
   * porque as sondas e o ensaio montam este input sem banco; nos call sites de
   * produto ele vem sempre, por `voiceTuningDoAvatar(avatar)`.
   */
  voiceTuning?: VoiceTuning;
  script: string;
  /** A foto do rosto, já em bytes. */
  fotoBase: Buffer;
  fotoMimeType: string;
  /**
   * A FOTO REAL do rosto, como SEGUNDA referência de identidade em
   * `animar()` — V24, 31/08/2026. Até esta rodada o Wan só recebia a
   * imagem COMPOSTA (`imagemUrl`/`imagemDeReferencia`). Decisão do
   * operador, sem medição registrada NESTE repositório: o pedido original
   * citava "sondas V20/V22" como precedente de que duas referências
   * seguram identidade melhor — `git log -S "V20"` e `-S "V22"` não acham
   * nada aqui (V27, 31/08), e a única sonda de Wan 3.0 já encontrada
   * (RODADA 20, `probeWan3Prime.ts`) não é sobre isto. A referência dupla
   * está implementada porque o schema do fornecedor permite (até 5 imagens
   * em `image_urls`, LIDO por WebFetch) e o pedido foi explícito — não
   * porque um teste MEDIDO comprovou a melhora.
   *
   * DISTINTA de `fotoBase`: aquele campo é lido só por `compor()` (a
   * composição pode não ser refeita numa retomada/aprovação, e nesse caso
   * `fotoBase` chega como `Buffer.alloc(0)`, de propósito — ver os call
   * sites em `routes/videos.ts`). Este campo tem de continuar preenchido
   * mesmo quando `compor()` não roda de novo, porque `animar()` PRECISA da
   * foto real em toda corrida, não só na criação — por isso é um campo
   * PRÓPRIO, nunca um atalho para `fotoBase`.
   *
   * `null`/ausente (ou bytes vazios): nenhuma segunda referência é enviada
   * — byte a byte o comportamento de antes desta rodada. Consumido só pelo
   * ramo Wan (`corpoAnimarWan`); o Seedance (`corpoAnimarSeedance`,
   * `image_urls` de outro schema) não lê este campo, fora de escopo desta
   * correção.
   */
  fotoDeIdentidade?: { bytes: Buffer; mimeType: string } | null;
  /**
   * As outras imagens da composição — traje e cenário, quando vieram por
   * ARQUIVO. Já em bytes, pelo mesmo motivo de `fotoBase`: este módulo não lê
   * disco, e é essa ausência de I/O que permite exercitá-lo inteiro com
   * `globalThis.fetch` substituído e mais nada. Quem resolve `/uploads/...`
   * para bytes é a ponte, em `avatarProvider.generateVideoFal`.
   *
   * A ORDEM é a da composição e é significativa: `[rosto, traje?, cenário?]`.
   * Opcional e ausente por padrão — traje e cenário podem vir só por texto, e
   * nesse caso eles entram no `promptDeComposicao`, não aqui.
   */
  entradasExtras?: EntradaDeComposicao[];
  /** Texto livre: traje e cenário. */
  promptDeComposicao: string;
  /**
   * A proporção escolhida em "Onde este vídeo vai ser publicado"
   * (`PUBLISH_PLATFORMS`, `videoFormat.ts`) — vai só a `compor()`.
   *
   * O Wan (`animar()`, motor do tier "Normal") não tem campo de proporção no
   * schema: preserva o formato da imagem composta que já chega pronta —
   * MEDIDO em 19/08 (`aspect_ratio: "9:16"` enviado só à composição produziu
   * vídeo final 716×1284, ffprobe). Opcional no tipo porque a sonda de
   * contrato (`compor` isolado, `pararApos: "compor"`) segue sem precisar
   * dele.
   *
   * ⚠️ O Seedance 2.5 (pesquisado no BLOCO SEEDANCE-1, 21/08 — reservado pro
   * tier "Premium") TEM `aspect_ratio` no schema de `animar()`, e precisaria
   * dele explícito ali também. NÃO implementado agora que o motor voltou a
   * ser o Wan.
   */
  aspectRatio?: AspectRatio;
  /**
   * Identifica o TENANT perante a fal — reservado para `end_user_id`, campo
   * do Seedance 2.5 (BLOCO SEEDANCE-1, 21/08, tier "Premium"; obrigatório de
   * conta B2B nesse motor). Mantido na interface porque todos os call sites
   * já o passam; SEM USO dentro deste arquivo enquanto `animar()` for o Wan
   * — `compor()`, `narrar()` e `sincronizar()` não pedem identificação de
   * usuário final no schema deles.
   */
  tenantId: string;
  /**
   * A DIREÇÃO DE CENA, e ela vai SÓ ao Wan.
   *
   * ┌─ Campo separado, e não concatenado no `promptDeComposicao` ─────────────┐
   * │ Os dois textos descrevem coisas diferentes e vão a modelos diferentes.  │
   * │ `promptDeComposicao` descreve o que a imagem TEM — traje, cenário — e   │
   * │ alimenta o `nano-banana`, que produz um quadro PARADO. A direção        │
   * │ descreve o que a pessoa FAZ — gesto, postura, olhar, ritmo — e só faz   │
   * │ sentido para o Wan, que é quem tem tempo para executá-la.               │
   * │                                                                         │
   * │ Concatenar os dois num campo só era o caminho barato, e ele custaria a  │
   * │ imagem: "gesto calmo, olhar direto para a câmera" entregue ao gerador   │
   * │ de imagem vira instrução sobre uma pose ESTÁTICA, e a composição — que  │
   * │ é a entrada de tudo o que vem depois — passa a ser negociada por um     │
   * │ texto escrito para outro modelo. O defeito apareceria na imagem, que é  │
   * │ o artefato que um humano aprova antes de liberar os ~US$ 1,44 seguintes.│
   * └─────────────────────────────────────────────────────────────────────────┘
   *
   * Chega em INGLÊS: quem traduz é `directionTranslation.ts`, na rota, e a
   * tradução acontece antes de qualquer coisa custar. String vazia é o estado
   * normal de quem não escreveu direção nenhuma.
   *
   * OBRIGATÓRIO, e não opcional com default: um campo opcional deixaria cada
   * call site novo herdar "sem direção" em silêncio, que é precisamente o
   * defeito que esta rodada veio consertar — a direção existia, era traduzida,
   * era gravada, e morria porque ninguém a passava adiante.
   */
  promptDeDirecao: string;
  /**
   * A EXPRESSIVIDADE escolhida — ITEM 2, RODADA 6 (30/08/2026). Separada de
   * `promptDeDirecao` de propósito: o Wan não tem campo estruturado para
   * isto (só HeyGen tem), então o único canal é dobrar a cláusula no texto
   * de direção — mas SÓ depois de `promptDeDirecao` já ter sido fatiado por
   * bloco (`wanOrchestration.ts`). Se `promptDeDirecao` já chegasse com a
   * cláusula embutida, ela cairia inteira na ÚLTIMA fatia (depois do último
   * marcador `[mm:ss-mm:ss]`) — o defeito medido no vídeo `effe03c6`
   * (30/08): só o bloco 2 de 3 recebeu a frase de expressividade.
   * `null`/ausente: nenhuma cláusula é acrescentada, byte a byte o
   * comportamento de antes desta correção.
   */
  expressiveness?: Expressiveness | null;
  diario: DiarioDoPipeline;
  /**
   * O NÍVEL escolhido pelo tenant — BLOCO A. Default `"normal"` (Wan): é o
   * único tier que já tinha motor funcionando antes deste bloco, e é o
   * comportamento de toda corrida anterior a ele. Decide o ENDPOINT, o
   * PREÇO e o TETO da etapa `animar` — ver `enderecoAnimarParaTier` e o
   * teto escolhido em `runFalPipeline`/`runFalPipelineDaImagem`.
   */
  tier?: PipelineTier;
  /** Sobrescrito só pela guarda; o produto usa o default. */
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  /**
   * Teto de gasto PREVISTO. Default: `tetoNormalUsd(segundosTotais)` para o
   * tier "normal" (fórmula sobre a duração real da corrida, desde o BLOCO
   * FRACOES-1), `PIPELINE_TETO_USD_PREMIUM` para o "premium" — ver `tier`
   * acima e `tetoParaTier`. Passar isto explícito SOBRESCREVE a escolha por
   * tier; hoje só a guarda faz isso.
   */
  tetoDeGastoUsd?: number;
  /**
   * Encerra a corrida DEPOIS desta etapa, sem disparar as seguintes.
   *
   * Existe para a sonda de contrato: cada etapa paga custa dinheiro real, e
   * medir o contrato de uma delas não deve obrigar a pagar as outras duas.
   */
  pararApos?: EtapaDoPipeline;
  /** Injetável para a guarda não esperar de verdade. */
  esperar?: (ms: number) => Promise<void>;
  /**
   * A checagem de formato (item 8, 29/08) roda `ffprobe` de VERDADE sobre a
   * URL do vídeo mudo — mesmo com `fetch` substituído, o binário `ffmpeg`
   * não é, e tentaria alcançar a URL fake de uma guarda pela rede real.
   * `false` só para a guarda; o produto nunca desliga isto (default `true`
   * quando ausente) — mesmo padrão de `pollTimeoutMs`/`esperar` acima.
   */
  verificarAspectRatio?: boolean;
}

export interface FalPipelineResult {
  /** O que a corrida PREVIU gastar. Não é o cobrado — ver BLOCO 6. */
  gastoPrevistoUsd: number;
  /** Vazio quando a corrida parou antes da sincronia (`pararApos`). */
  videoUrl: string;
  /**
   * A imagem-base, quando a composição chegou a acontecer.
   *
   * Existe porque `pararApos: "compor"` é o modo NORMAL desta fase, e não um
   * caso de erro: sem este campo o único produto de uma corrida que parou seria
   * um `videoUrl` vazio, e quem chamasse não teria como distinguir "parou onde
   * eu pedi" de "não fez nada". A URL também vai para o diário — ver
   * `pararAqui`.
   */
  imagemCompostaUrl: string | null;
  /**
   * O vídeo ANIMADO, MUDO — o produto de `animar()`, antes de narrar e
   * sincronizar. Ver `pararApos: "animar"` — FASE 2 (Modo B), 21/08.
   *
   * `null` quando a corrida ainda não chegou a `animar` (parou em `compor`)
   * ou já passou de lá sem parar (o vídeo final é que importa nesse caso).
   * Presente sempre que a corrida ALCANÇA `animar`, pare ali ou não — mesma
   * razão de `imagemCompostaUrl` valer mesmo com `pararApos: "narrar"`.
   */
  videoMudoUrl: string | null;
  audioDurationSeconds: number | null;
  /**
   * A duração ESCOLHIDA para este vídeo (`escolherDuracao`, a partir do
   * roteiro) — não a estimada, não a pedida. É a que foi mandada ao Wan em
   * `duration`, e o fallback correto para cobrança quando a medição real do
   * áudio (`audioDurationSeconds`) falhar. Decidida no início da corrida
   * (`conferirRoteiro`), então está presente mesmo quando a corrida parou
   * antes de a usar (`pararApos: "compor"`).
   */
  duracaoSegundos: PipelineDuration;
  /**
   * A URL (fal-hosted) do áudio JÁ SINTETIZADO — V33, item 2 (01/09/2026).
   * Só preenchida quando a corrida NARROU antes de parar em `animar`
   * (caminho de tomada única, roteiros ≤30s estimados — ver
   * `animarTomadaUnicaComAudioReal`) e `pararApos === "animar"`. `/approve`
   * persiste este valor em `videos.fal_audio_url` (migration 073) para que
   * `/approve-video` reutilize o MESMO áudio em vez de ressintetizar (ver o
   * comentário de `sincronizarComAudio`). `null` em todo outro caso —
   * inclusive quando a corrida JÁ sincronizou (o áudio virou parte do vídeo
   * final, não sobra o que persistir à parte).
   */
  audioUrl: string | null;
  requestIds: { compor: string; animar: string; sincronizar: string };
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * O TETO desta corrida, pelo `tier` — BLOCO A, com FÓRMULA em vez de
 * constante fixa para "normal" desde o BLOCO FRACOES-1 (28/08).
 *
 * `input.tetoDeGastoUsd` explícito sempre vence (hoje só a guarda o usa). Sem
 * ele: `PIPELINE_TETO_USD_PREMIUM` para "premium" (inalterado); para
 * "normal" (inclusive quando `tier` não foi passado — comportamento de toda
 * corrida anterior ao BLOCO A), `tetoNormalUsd(segundosTotais)` —
 * `providerCost.ts`, fórmula sobre a duração REAL que esta corrida vai
 * gerar (a soma dos blocos, não um número fixo).
 *
 * `segundosTotais` é OBRIGATÓRIO para "normal" a partir desta rodada: quem
 * chama (`runFalPipeline`/`runFalPipelineDaImagem`/`runFalPipelineDoVideoMudo`)
 * já fracionou o roteiro antes de chegar aqui, então o número sempre existe.
 * Sem ele, cai no pior caso de UM bloco (`PIPELINE_DURACAO_MAXIMA`) — o
 * mesmo teto que existia antes desta rodada, para nenhuma chamada antiga
 * (guardas, sondas) quebrar por omitir o campo novo.
 */
function tetoParaTier(
  input: Pick<FalPipelineInput, "tetoDeGastoUsd" | "tier">,
  segundosTotais?: number,
): number {
  if (input.tetoDeGastoUsd !== undefined) return input.tetoDeGastoUsd;
  if (input.tier === "premium") return PIPELINE_TETO_USD_PREMIUM;
  return tetoNormalUsd(segundosTotais ?? PIPELINE_DURACAO_MAXIMA);
}

/**
 * O roteiro cabe em UM bloco — e em qual duração?
 *
 * Escolhe a MENOR de `PREMIUM_DURATION_OPTIONS` que comporta o texto
 * (`escolherDuracaoPremium`) e recusa ANTES de qualquer chamada quando nem a
 * maior (15 s) comporta. **Só para tier "premium"** desde o BLOCO FRACOES-1
 * (28/08) — para "normal", quem decide é `conferirRoteiroENormal()` logo
 * abaixo, que sabe fracionar. Mantida com este comportamento (e este nome)
 * porque é o que `probeFalPipeline.ts` e várias guardas do Premium/sonda já
 * chamam esperando exatamente isto: um roteiro, uma duração, ou uma recusa.
 *
 * Usa o vocabulário PRÓPRIO do Premium (`PREMIUM_*`) desde a migração do
 * Normal para `reference-to-video/flash` (item 2, 29/08): o Wan apertou para
 * 10s por bloco, mas o Seedance (endpoint diferente) continua aceitando até
 * 15s por chamada — usar o vocabulário do Normal aqui encolheria o teto do
 * Premium sem nenhum motivo do lado do Seedance.
 */
export function conferirRoteiro(
  script: string,
): { chars: number; segundosEstimados: number; duracaoEscolhida: PipelineDuration } {
  const chars = script.length;
  const duracaoEscolhida = escolherDuracaoPremium(chars);
  if (duracaoEscolhida === null) {
    const segundosNecessarios = (chars / PIPELINE_CHARS_PER_SECOND) * (1 + PIPELINE_RITMO_DISPERSAO);
    throw new RoteiroInvalidoError(
      `O roteiro exige ${segundosNecessarios.toFixed(1)} s no pior caso do ritmo (${chars} caracteres a ` +
        `${PIPELINE_CHARS_PER_SECOND} car/s, margem de dispersão ${(PIPELINE_RITMO_DISPERSAO * 100).toFixed(2)}%), ` +
        `acima do teto atual de ${PREMIUM_DURACAO_MAXIMA} s por vídeo desta fase. Nada foi pedido a ` +
        "fornecedor nenhum: a recusa acontece antes da primeira chamada paga. Emendar clipes para roteiros " +
        "maiores não existe aqui — é outro bloco, ainda não desenhado.",
    );
  }
  return { chars, segundosEstimados: chars / PIPELINE_CHARS_PER_SECOND, duracaoEscolhida };
}

export interface RoteiroConferidoENormal {
  chars: number;
  segundosEstimados: number;
  /** Do PRIMEIRO bloco — só para os call sites que ainda esperam um valor único (diário, logs). */
  duracaoEscolhida: PipelineDuration;
  blocos: BlocoDeAnimacao[];
  /** Soma das durações escolhidas — o vídeo mudo total que os blocos produzem. */
  segundosTotais: number;
}

/**
 * O roteiro cabe em QUANTOS blocos, de que duração cada — tier "normal",
 * BLOCO FRACOES-1 (28/08). Item 1 do plano
 * (`docs-internal/plano-fracoes-2026-08-28.md`): empacota por fronteira de
 * frase (`fracionarRoteiro`) e recusa ANTES de qualquer chamada quando uma
 * frase é grande demais para UM bloco ou o total excede
 * `NORMAL_MAX_BLOCOS`/`NORMAL_MAX_TARGET_SECONDS` — a mesma garantia de
 * `conferirRoteiro`, só que sobre o roteiro FRACIONADO em vez de um bloco só.
 *
 * `ScriptFractioningError` é envolvido em `FalPipelineError` para que os
 * chamadores (rotas, sonda) continuem tratando um tipo de erro só para
 * "recusa antes de pagar" — `scriptFractioning.ts` não pode importar
 * `FalPipelineError` daqui sem recriar o ciclo que a extração de
 * `pipelineDuration.ts` evitou.
 */
export function conferirRoteiroENormal(script: string): RoteiroConferidoENormal {
  const chars = script.length;
  let blocos: BlocoDeAnimacao[];
  try {
    blocos = fracionarRoteiro(script);
  } catch (err) {
    if (err instanceof ScriptFractioningError) {
      throw new RoteiroInvalidoError(err.message);
    }
    throw err;
  }
  const segundosTotais = segundosTotaisDosBlocos(blocos);
  return {
    chars,
    segundosEstimados: chars / PIPELINE_CHARS_PER_SECOND,
    duracaoEscolhida: blocos[0].duracaoEscolhida,
    blocos,
    segundosTotais,
  };
}

/**
 * O laço de polling. Vive AQUI, e não no `falClient`.
 *
 * O cliente faz UMA leitura; o laço é de quem paga por ele, e por isso o teto
 * de tempo é explícito, é parâmetro, e entra no log com o número de tentativas.
 * Um laço escondido dentro do cliente esconderia de quem chama tanto o custo em
 * tempo quanto o fato de que ele pode desistir.
 *
 * Desistir NÃO é falha do trabalho: o `request_id` já está gravado, e o
 * resultado continua recuperável por ele. A mensagem diz isso, porque a
 * alternativa é alguém reprocessar — e pagar de novo — algo que está pronto.
 */
export async function aguardarConclusao(
  apiKey: string,
  statusUrl: string,
  requestId: string,
  opcoes: { timeoutMs: number; intervalMs: number; esperar: (ms: number) => Promise<void> },
  /**
   * V28, item 3 — QUAL etapa está sendo aguardada, só para o
   * `FalPollTimeoutError` carregar a informação sem quem lê o erro precisar
   * adivinhar pela URL. Opcional e por último: as guardas que já chamam esta
   * função sem o parâmetro continuam compilando — o timeout delas cai no
   * `"animar"` default, que é o único caminho medido a estourar até hoje.
   */
  etapa: EtapaDoPipeline = "animar",
): Promise<void> {
  const limite = Date.now() + opcoes.timeoutMs;
  let tentativas = 0;

  for (;;) {
    const { status } = await falPoll(apiKey, statusUrl);
    tentativas += 1;

    if (status === "completed") {
      logEvent("info", "fal_pipeline_poll_concluido", { statusUrl, requestId, tentativas });
      return;
    }
    if (status === "failed") {
      throw new FalPipelineError(
        `fal: ${statusUrl} reportou FALHA no request ${requestId} após ${tentativas} leitura(s).`,
      );
    }

    if (Date.now() >= limite) {
      logEvent("warn", "fal_pipeline_poll_esgotado", {
        statusUrl,
        requestId,
        tentativas,
        timeoutMs: opcoes.timeoutMs,
      });
      throw new FalPollTimeoutError(
        `fal: o teto de ${opcoes.timeoutMs} ms de espera se esgotou em ${statusUrl} depois de ` +
          `${tentativas} leitura(s) de status. O trabalho NÃO foi perdido e NÃO deve ser refeito: ` +
          `ele já foi aceito e já custa, e o request_id ${requestId} está gravado — a recuperação é ` +
          "por ele. Repetir a etapa paga duas vezes pelo mesmo resultado.",
        requestId,
        statusUrl,
        etapa,
      );
    }
    await opcoes.esperar(opcoes.intervalMs);
  }
}

/**
 * Submete, guarda o ponteiro, espera, e devolve a saída CRUA já registrada.
 *
 * A ordem aqui é a propriedade que a guarda G-4 mede: `gravarRespostaCrua`
 * acontece ANTES de qualquer leitura de campo do corpo. Interpretar primeiro e
 * gravar depois deixaria toda resposta de forma inesperada sem registro — que é
 * exatamente a resposta que se precisa ler para descobrir o que mudou.
 */
/**
 * O CUSTO DESTA ETAPA, com a TABELA vencendo a régua do código — W2, 24/08.
 *
 * ┌─ Desconhecido é CARO: a inversão que o W2 instala ───────────────────────┐
 * │ Antes, ausência de preço era tratada como se fosse barato: `costFor`     │
 * │ devolvia `known:false` para a fal e o teto autorizava com a régua        │
 * │ interna. Foi assim que uma chamada de sync-lipsync de US$ 3,20 passou    │
 * │ por um teto de US$ 2,00 calculando US$ 0,45.                             │
 * │                                                                          │
 * │ Agora há três casos, e nenhum devolve zero:                              │
 * │                                                                          │
 * │  1. PREÇO UNITÁRIO na tabela → é ele que vale. Editável sem deploy, que  │
 * │     é o ponto inteiro do W2.                                             │
 * │  2. PREÇO AGREGADO (total de período) → vale o MAIOR entre ele e a       │
 * │     régua. Conservador de propósito: um total não diz o preço de UMA     │
 * │     chamada, e escolher o menor reintroduziria o defeito com outro       │
 * │     número. Nesta rodada os três preços semeados são agregados, então é  │
 * │     este o caminho que o produto percorre hoje.                          │
 * │  3. FORA DA TABELA → lança. Endpoint sem preço não é autorizado sozinho, │
 * │     e no pipeline não há a quem perguntar: a recusa acontece ANTES da    │
 * │     submissão e custa zero.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function custoDaEtapa(
  endpointId: string,
  quantidade: number,
  peloCodigo: number,
  etapa: EtapaDoPipeline,
): Promise<number> {
  const v = await custoDe(endpointId, quantidade);

  if (v.usd === null) {
    throw new FalPipelineError(
      `CUSTO DESCONHECIDO: a etapa "${etapa}" usaria \`${endpointId}\`, que não tem preço em ` +
        "`provider_prices`. Endpoint sem preço NÃO é autorizado sozinho — foi tratar ausência de preço " +
        "como \"barato\" que deixou uma chamada de US$ 3,20 passar por um teto de US$ 2,00. Nada foi " +
        "pedido ao fornecedor. Cadastre o preço no painel e repita.",
    );
  }

  if (v.autorizavel) return v.usd;

  // AGREGADO: alerta e NÃO entra na conta. Ver o caso 2 acima.
  logEvent("warn", "preco_agregado_nao_autoriza", {
    etapa,
    endpointId,
    usadoNoCalculo: Number(peloCodigo.toFixed(4)),
    totalDoPeriodoNaTabela: Number(v.preco?.usd.toFixed(4) ?? 0),
    medidoEm: v.preco?.medidoEm ?? null,
    consequence:
      "o cálculo seguiu pela régua do código; o total do período fica ao lado para comparação. " +
      "Cadastre o custo POR CHAMADA para que o teto passe a usar o número do fornecedor.",
  });
  return peloCodigo;
}

/**
 * O PORTEIRO do teto. Roda ANTES de cada submissão paga, nunca depois.
 *
 * Depois da submissão o dinheiro já saiu: um teto conferido no fim é um
 * relatório, não um freio. A conta é sempre do ACUMULADO — a etapa 4 pode
 * caber sozinha e ainda assim estourar o orçamento somada às anteriores.
 */
function autorizarGasto(
  gastoAcumuladoUsd: number,
  custoDestaEtapaUsd: number,
  tetoUsd: number,
  etapa: EtapaDoPipeline,
): number {
  const previsto = gastoAcumuladoUsd + custoDestaEtapaUsd;
  if (previsto > tetoUsd) {
    throw new FalPipelineError(
      `TETO DE GASTO: a etapa "${etapa}" custaria US$ ${custoDestaEtapaUsd.toFixed(2)} e levaria o ` +
        `previsto desta corrida a US$ ${previsto.toFixed(2)}, acima do teto de US$ ${tetoUsd.toFixed(2)}. ` +
        "Nada foi pedido ao fornecedor nesta etapa. As etapas anteriores JA foram pagas e os request_id " +
        "delas estao gravados: o resultado parcial e recuperavel e nao deve ser refeito.",
    );
  }
  logEvent("info", "fal_pipeline_gasto_autorizado", {
    etapa,
    custoDestaEtapaUsd,
    previstoAcumuladoUsd: Number(previsto.toFixed(4)),
    tetoUsd,
  });
  return previsto;
}

/**
 * PUBLICA as entradas da composição e devolve as `file_url` **na ordem**.
 *
 * ┌─ Roda ANTES do primeiro `autorizarGasto`, e a ordem é a propriedade ─────┐
 * │ Publicar não custa: o upload da fal não é tarifado (MEDIDO em 13/08 —    │
 * │ `initiate` 200 + `PUT` 200, cota e carteira idênticas antes e depois).   │
 * │ Autorizar gasto, sim, é o freio da primeira etapa PAGA. Inverter as duas │
 * │ faz o teto ser consultado sobre uma composição cujas entradas ainda      │
 * │ podem falhar ao subir — e o caso ruim não é gastar à toa, é o oposto: a  │
 * │ corrida é autorizada, um upload falha no meio, e o que sobra é uma       │
 * │ corrida `failed` que já passou pelo porteiro do dinheiro. O que se quer  │
 * │ é que uma falha de upload custe ZERO e nem chegue ao teto.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * EM SÉRIE, e não em paralelo: são no máximo três arquivos, o ganho de tempo é
 * irrelevante, e o serial dá ao diário uma ordem que é a mesma da lista que vai
 * ao fornecedor. Em paralelo, a ordem de conclusão decidiria a ordem das
 * `image_urls` — que é significativa para o `nano-banana` — e ela passaria a
 * variar de corrida para corrida sem nada no código dizendo isso.
 *
 * Falha de upload fecha a etapa como `failed` com motivo `upload_failed` e
 * interrompe: sem a entrada, a composição não é a que foi pedida.
 */
export async function publicarEntradas(input: FalPipelineInput): Promise<string[]> {
  const entradas: EntradaDeComposicao[] = [
    { rotulo: "rosto", bytes: input.fotoBase, mimeType: input.fotoMimeType },
    ...(input.entradasExtras ?? []),
  ];

  const urls: string[] = [];
  for (const entrada of entradas) {
    // ORDEM 0 — ver `EtapaDoPipeline`. O endpoint fica `null`: o upload não
    // passa pelo catálogo de endpoints tarifados, e escrever um id ali seria
    // sugerir que passou.
    const stepId = await input.diario.abrirEtapa("publicar", 0, "fal", null);
    let url: string;
    try {
      // ⚠️ LOG TEMPORÁRIO — evidência de runtime para o teste de precedência
      // de credencial (platform vs BYOK). REMOVER depois do teste; não deve
      // virar log permanente em produção. Só os últimos 4 caracteres, nunca
      // a chave inteira.
      logEvent("info", "TEMP_fal_apikey_suffix", {
        onde: "falUpload (publicarEntradas)",
        rotulo: entrada.rotulo,
        sufixo: input.apiKeyFal.slice(-4),
      });
      url = await falUpload(input.apiKeyFal, entrada.bytes, entrada.mimeType);
    } catch (err) {
      await input.diario.fecharEtapa(stepId, "failed", "upload_failed");
      throw new FalPipelineError(
        `fal: a entrada "${entrada.rotulo}" não subiu para o storage — ${String(err)}. Nenhuma etapa ` +
          "paga foi autorizada: a publicação acontece antes do teto de gasto, e por isso uma falha " +
          "aqui custa zero. Nada precisa ser estornado nem recuperado.",
      );
    }
    // O `file_url` é o que sobrevive à corrida: recompor depois não exige subir
    // os mesmos bytes de novo.
    await input.diario.gravarRespostaCrua(stepId, JSON.stringify({ rotulo: entrada.rotulo, fileUrl: url }));
    await input.diario.fecharEtapa(stepId, "completed");
    urls.push(url);
  }

  logEvent("info", "fal_pipeline_entradas_publicadas", {
    quantidade: urls.length,
    rotulos: entradas.map((e) => e.rotulo),
  });
  return urls;
}

/**
 * NENHUM campo `*_url`/`*_urls` do corpo pode ser um caminho LOCAL — RODADA
 * 1, 29/08/2026.
 *
 * ┌─ O defeito que esta guarda fecha ─────────────────────────────────────────┐
 * │ `video_url: String(videoMudoUrl)` mandava `/uploads/tenant/arquivo.mp4`   │
 * │ direto para `fal-ai/sync-lipsync/v2` — a fal não alcança o nosso disco, e │
 * │ devolvia 422 `file_download_error` DEPOIS de já ter aceito e cobrado o    │
 * │ job (o `provider_job_id` prova aceite). Esta função corta ANTES do        │
 * │ `falSubmit`, então uma reintrodução do mesmo defeito — nesta etapa ou em  │
 * │ qualquer outra que ainda vier a usar caminho local por engano — nunca     │
 * │ chega a gastar um centavo: é a mesma checagem para as três etapas,        │
 * │ porque `etapaNaFal` é o único lugar por onde todas passam.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
function garantirUrlsPublicas(etapa: EtapaDoPipeline, endpointId: string, corpo: Record<string, unknown>): void {
  for (const [chave, valor] of Object.entries(corpo)) {
    if (!chave.endsWith("_url") && !chave.endsWith("_urls")) continue;
    const valores = Array.isArray(valor) ? valor : [valor];
    for (const v of valores) {
      if (typeof v === "string" && v.startsWith("/")) {
        throw new FalPipelineError(
          `fal: o campo "${chave}" da etapa "${etapa}" (${endpointId}) é um caminho LOCAL ("${v}"), não ` +
            "uma URL pública. O fornecedor não alcança o nosso disco — nada foi pedido a ele: a recusa " +
            "acontece antes do submit, e nenhuma cota foi consumida. Publique o arquivo (fal.upload) " +
            "antes de montar o corpo.",
        );
      }
    }
  }
}

async function etapaNaFal(
  input: FalPipelineInput,
  etapa: EtapaDoPipeline,
  ordem: number,
  endpointId: string,
  corpo: Record<string, unknown>,
  /** V30, item 2 — ver o comentário de `DiarioDoPipeline.abrirEtapa`. */
  blocoIndice?: number | null,
): Promise<{ requestId: string; saida: any }> {
  // RODADA 1 — corta ANTES de abrir a etapa no diário e antes de qualquer
  // chamada de rede. Ver `garantirUrlsPublicas`.
  garantirUrlsPublicas(etapa, endpointId, corpo);

  // RODADA 1 — o evento de auditoria que faltava: sem ele não havia como
  // saber o que de fato foi enviado a um fornecedor, em etapa nenhuma
  // (`fal_pipeline_entradas_publicadas`, o mais próximo que existia, só
  // registra rótulo e quantidade das imagens de `compor`, nunca o corpo).
  // `redactDeep` é o MESMO sumidouro de todo log estruturado deste projeto.
  logEvent("info", "fal_payload_enviado", {
    etapa,
    endpointId,
    corpo: redactDeep(corpo),
  });

  const stepId = await input.diario.abrirEtapa(etapa, ordem, "fal", endpointId, blocoIndice);

  // ⚠️ LOG TEMPORÁRIO — evidência de runtime para o teste de precedência de
  // credencial (platform vs BYOK). REMOVER depois do teste; não deve virar
  // log permanente em produção. Só os últimos 4 caracteres, nunca a chave
  // inteira. Um log só para as três chamadas desta etapa, porque é a MESMA
  // chave nas três — não há necessidade de repetir por chamada.
  logEvent("info", "TEMP_fal_apikey_suffix", {
    onde: "etapaNaFal (falSubmit/aguardarConclusao/falResult)",
    etapa,
    endpointId,
    sufixo: input.apiKeyFal.slice(-4),
  });

  const { requestId, statusUrl, responseUrl } = await falSubmit(input.apiKeyFal, endpointId, corpo, async (id) => {
    // O PONTEIRO primeiro. `falSubmit` chama isto antes do próprio
    // processamento local dele, e o diário o persiste antes do nosso.
    await input.diario.gravarRequestId(stepId, id);
  });

  // V28, item 3 — as URLs REAIS da fila, gravadas ANTES do poll (que é
  // exatamente o que pode estourar). Sem isto, um timeout preservava o
  // request_id mas não como recuperar o resultado depois sem reconstruir a
  // URL por fórmula — ver a migration 071. Opcional na interface: guardas com
  // diário em memória simplesmente não gravam nada aqui.
  await input.diario.gravarUrlsDaFila?.(stepId, statusUrl, responseUrl);

  await aguardarConclusao(
    input.apiKeyFal,
    statusUrl,
    requestId,
    {
      timeoutMs: input.pollTimeoutMs ?? PIPELINE_POLL_TIMEOUT_MS,
      intervalMs: input.pollIntervalMs ?? PIPELINE_POLL_INTERVAL_MS,
      esperar: input.esperar ?? dormir,
    },
    etapa,
  );

  const saida = await falResult(input.apiKeyFal, responseUrl);

  // CRU ANTES DE INTERPRETADO. Nenhum campo de `saida` foi lido até aqui.
  await input.diario.gravarRespostaCrua(stepId, JSON.stringify(saida));

  await input.diario.fecharEtapa(stepId, "completed");
  return { requestId, saida };
}

export async function runFalPipeline(input: FalPipelineInput): Promise<FalPipelineResult> {
  // BLOCO FRACOES-1, 28/08 — "premium" continua no caminho de UM bloco só
  // (fracionamento fora de escopo para este tier, ver `NORMAL_MAX_TARGET_SECONDS`);
  // "normal" (inclusive `tier` ausente — comportamento de toda corrida
  // anterior a este bloco) passa pelo fracionador. A RECUSA por roteiro
  // grande demais acontece AQUI, antes de `publicarEntradas` — nenhuma
  // chamada de rede acontece antes desta linha.
  const ehPremium = input.tier === "premium";
  const roteiroConferido = ehPremium ? conferirRoteiro(input.script) : conferirRoteiroENormal(input.script);
  const { chars, segundosEstimados, duracaoEscolhida } = roteiroConferido;
  const blocosDeAnimacao: BlocoDeAnimacao[] = ehPremium
    ? [{ texto: input.script, duracaoEscolhida }]
    : (roteiroConferido as RoteiroConferidoENormal).blocos;
  const segundosTotaisDoRoteiro = ehPremium ? duracaoEscolhida : (roteiroConferido as RoteiroConferidoENormal).segundosTotais;
  logEvent("info", "fal_pipeline_iniciado", {
    chars,
    segundosEstimados,
    duracaoEscolhida,
    charsPerSecond: PIPELINE_CHARS_PER_SECOND,
    blocos: blocosDeAnimacao.length,
    segundosTotais: segundosTotaisDoRoteiro,
  });

  // --- 0. PUBLICAR ---------------------------------------------------------
  // Antes do teto, sempre: publicar não custa, e uma falha aqui precisa custar
  // zero em vez de acontecer com a corrida já autorizada. Ver `publicarEntradas`.
  const urlsDasEntradas = await publicarEntradas(input);

  // --- 1. COMPOR -----------------------------------------------------------
  //
  // O teto AQUI é o mesmo de `animar` em diante (`tetoParaTier`, sobre o
  // TOTAL da corrida) — desde o BLOCO FRACOES-1. Antes deste bloco `compor`
  // vivia sob `PIPELINE_TETO_USD` fixo porque custa sempre US$ 0,08 e nenhum
  // teto plausível o recusaria; isso continua verdade, então trocar de
  // constante para fórmula aqui não muda nenhum veredito — só unifica a
  // fonte do número.
  const teto = tetoParaTier(input, segundosTotaisDoRoteiro);
  let gastoPrevistoUsd = 0;

  const custoComporUsd = await custoDaEtapa(ENDPOINT_COMPOR, 1, PRECOS_FAL.comporUsd, "compor");
  gastoPrevistoUsd = autorizarGasto(gastoPrevistoUsd, custoComporUsd, teto, "compor");
  await input.diario.registrarGastoPrevisto(gastoPrevistoUsd);
  const composicao = await etapaNaFal(input, "compor", 1, ENDPOINT_COMPOR, {
    // SEM default de sistema — ITEM 3, RODADA 6 (30/08/2026): a atenuação de
    // pele que ia aqui contradizia `NEGATIVE_PROMPT_ANIMAR_WAN` ("plastic
    // skin, waxy skin"). Removida, nada substituiu.
    prompt: input.promptDeComposicao,
    // `[rosto, traje?, cenário?]`, na ordem em que subiram. O que veio por
    // TEXTO não aparece aqui: está no `prompt` acima, que é o mesmo campo.
    image_urls: urlsDasEntradas,
    // Explícitos, sempre. Ver DEFAULTS_NUNCA_HERDADOS.
    num_images: 1,
    resolution: RESOLUCAO_IMAGEM,
    // A proporção escolhida na tela de publicação. Só aqui: o Wan não tem
    // onde receber isto — ver o comentário de `aspectRatio` em
    // `FalPipelineInput`.
    aspect_ratio: input.aspectRatio,
  });
  const imagemUrl = composicao.saida?.images?.[0]?.url;
  if (!imagemUrl) {
    throw new FalPipelineError(
      "fal: a composição concluiu sem devolver imagem. O corpo bruto está gravado na etapa — o " +
        "trabalho foi feito e provavelmente cobrado, então isto é contrato quebrado, não erro de geração.",
    );
  }

  // --- 2. ANIMAR -----------------------------------------------------------
  //
  // O FREIO desta fase, e ele continua sendo o default do produto:
  // `pararApos: "compor"` faz a corrida terminar com a imagem gravada em
  // `fal_pipeline_steps` e nada disparando o Wan na mesma invocação. Quem parte
  // dali é `runFalPipelineDaImagem`, chamada pela rota de aprovação — depois de
  // um humano clicar.
  if (input.pararApos === "compor") {
    const guardado = await input.diario.abrirEtapa("biblioteca", 0, "eckko", null);
    await input.diario.gravarRespostaCrua(guardado, JSON.stringify({ imagemCompostaUrl: String(imagemUrl) }));
    await input.diario.fecharEtapa(guardado, "completed");
    return pararAqui("compor", gastoPrevistoUsd, duracaoEscolhida, {
      imagemCompostaUrl: String(imagemUrl),
      requestIds: { compor: composicao.requestId, animar: "", sincronizar: "" },
    });
  }

  // O TETO de `animar` em diante é o MESMO desta corrida (sobre o total) —
  // ver `tetoParaTier`. Repetir a chamada com o mesmo `segundosTotaisDoRoteiro`
  // é intencional: o teto não muda entre `compor` e `animar`, só o
  // ACUMULADO conferido contra ele cresce.
  return animarNarrarSincronizar(input, {
    imagemUrl: String(imagemUrl),
    gastoAcumuladoUsd: gastoPrevistoUsd,
    teto: tetoParaTier(input, segundosTotaisDoRoteiro),
    tier: input.tier ?? "normal",
    segundosEstimados,
    duracaoEscolhida,
    blocos: blocosDeAnimacao,
    composicaoRequestId: composicao.requestId,
  });
}

/**
 * RETOMA de uma imagem JÁ COMPOSTA — as etapas 2 a 5, e nenhuma antes dela.
 *
 * ┌─ Por que existe, e por que ela não republica nada ───────────────────────┐
 * │ A composição e a animação são separadas por um clique humano, e entre os │
 * │ dois momentos há uma requisição HTTP inteira: quem aprova não é quem     │
 * │ compôs. Repetir `publicarEntradas` aqui subiria de novo bytes que já     │
 * │ estão no storage da fal (o `file_url` sobrevive à corrida), e repetir    │
 * │ `compor` pagaria US$ 0,08 pela MESMA imagem que a pessoa acabou de olhar │
 * │ e aprovar — e devolveria outra, porque o fornecedor não promete          │
 * │ determinismo.                                                            │
 * │                                                                          │
 * │ `gastoAcumuladoUsd` começa em ZERO, e isso é decisão declarada: o teto   │
 * │ desta corrida é o teto do que AINDA vai ser gasto. Carregar o gasto da   │
 * │ composição para cá faria a segunda metade ser recusada por dinheiro que  │
 * │ já saiu, numa corrida em que não há mais nada a impedir.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function runFalPipelineDaImagem(
  input: FalPipelineInput,
  imagemCompostaUrl: string,
  /** O `request_id` da composição que produziu esta imagem, quando conhecido. */
  composicaoRequestId = "",
): Promise<FalPipelineResult> {
  // Este É o call site real de produto (`/videos/:id/approve` → aqui) — é
  // aqui, e não em `runFalPipeline`, que o fracionamento em blocos entra em
  // jogo de verdade hoje, porque a criação SEMPRE para em `compor`
  // (`pararApos: "compor"`, o default do produto).
  const ehPremium = input.tier === "premium";

  // V33, item 3 (01/09/2026) — TOMADA ÚNICA para tier Normal com roteiro
  // curto: sem blocos, sem `xfade`, sem `corrigirCor` — e narrando ANTES de
  // animar, para que `duration` venha do ÁUDIO REAL (item 2), não de uma
  // estimativa de caracteres. A decisão de qual caminho tomar usa só uma
  // ESTIMATIVA barata (chars/ritmo, sem margem de dispersão — é só para
  // ESCOLHER o branch, não para cobrar nada) de propósito: narrar aqui só
  // para decidir gastaria ElevenLabs duas vezes em roteiros longos, que
  // vão cair no caminho fracionado de qualquer forma (item 3: acima de
  // 30s, o fracionamento e o resumer do V30 continuam funcionando, sem
  // mudar). `LIMITE_TAKE_UNICO_SEGUNDOS` é o mesmo teto usado só para
  // ESCOLHER — nunca para autorizar gasto, que continua vindo de
  // `tetoNormalUsd` sobre a duração real, dentro da função abaixo.
  if (!ehPremium && input.script.length / PIPELINE_CHARS_PER_SECOND <= LIMITE_TAKE_UNICO_SEGUNDOS) {
    return animarTomadaUnicaComAudioReal(input, imagemCompostaUrl, composicaoRequestId);
  }

  const roteiroConferido = ehPremium ? conferirRoteiro(input.script) : conferirRoteiroENormal(input.script);
  const { chars, segundosEstimados, duracaoEscolhida } = roteiroConferido;
  const blocosDeAnimacao: BlocoDeAnimacao[] = ehPremium
    ? [{ texto: input.script, duracaoEscolhida }]
    : (roteiroConferido as RoteiroConferidoENormal).blocos;
  const segundosTotaisDoRoteiro = ehPremium ? duracaoEscolhida : (roteiroConferido as RoteiroConferidoENormal).segundosTotais;
  logEvent("info", "fal_pipeline_retomado", {
    chars,
    segundosEstimados,
    duracaoEscolhida,
    imagemCompostaUrl,
    composicaoRequestId: composicaoRequestId || null,
    blocos: blocosDeAnimacao.length,
    segundosTotais: segundosTotaisDoRoteiro,
  });

  return animarNarrarSincronizar(input, {
    imagemUrl: imagemCompostaUrl,
    gastoAcumuladoUsd: 0,
    teto: tetoParaTier(input, segundosTotaisDoRoteiro),
    tier: input.tier ?? "normal",
    segundosEstimados,
    duracaoEscolhida,
    blocos: blocosDeAnimacao,
    composicaoRequestId,
  });
}

/**
 * O teto de decisão do caminho de TOMADA ÚNICA — V33, item 3 (01/09/2026).
 *
 * 30s de fala ESTIMADA (chars/ritmo, sem margem de dispersão — ver o
 * comentário no call site em `runFalPipelineDaImagem`). Abaixo dele: uma
 * chamada ao Wan 3.0, sem blocos. Acima: o fracionamento do V30 continua
 * exatamente como estava, sem mudar de comportamento — só o `ENDPOINT_ANIMAR`
 * embaixo dele trocou (item 1). NÃO é o teto de CARACTERES por bloco
 * (`PIPELINE_MAX_CHARS_POR_DURACAO`) — este é sobre o roteiro INTEIRO,
 * antes de qualquer fatiamento.
 */
export const LIMITE_TAKE_UNICO_SEGUNDOS = 30;

/**
 * A folga somada à duração REAL do áudio antes de pedir `duration` ao Wan
 * 3.0 — V33, item 2. Pequena e fixa, de propósito: a sonda V32 mediu o
 * defeito de pedir SEGUNDOS DEMAIS (20s pedidos contra ~12s de referência
 * real de áudio, silêncio digital absoluto depois disso) — a margem existe
 * só para o `cut_off` do `sync-lipsync` (etapa seguinte) ter alguns quadros
 * de vídeo mudo sobrando para cortar, nunca para pedir um clipe
 * sensivelmente mais longo que a fala. 1s é o valor inicial, sem UI para
 * editá-lo; NÃO VERIFICADO por vídeo real desta migração ainda.
 */
export const MARGEM_DURACAO_WAN3_SEGUNDOS = 1;

/**
 * TOMADA ÚNICA do tier Normal — V33, itens 2 e 3 (01/09/2026).
 *
 * Narra PRIMEIRO (`narrar`, extraída de `narrarSincronizar` nesta mesma
 * rodada) — inverte a ordem de sempre (animar→narrar) só neste caminho —
 * para que `duration` venha do ÁUDIO REAL medido
 * (`Math.ceil(fala.durationSeconds) + MARGEM_DURACAO_WAN3_SEGUNDOS`), nunca
 * da estimativa por caracteres: foi pedir segundos pela estimativa, sem
 * saber quanto a fala de fato ocupa, que abriu o buraco de silêncio de ~8s
 * medido na sonda V32 (20s pedidos, ~12s de fala real). Depois anima UMA
 * vez (`animarUmBloco`, `blocoIndice: null`) — sem laço, sem concat, sem
 * `corrigirCor` (não há segundo bloco para corrigir contra).
 *
 * `pararApos === "animar"` — o caminho de produto, ver `/approve` em
 * `routes/videos.ts` — devolve o áudio JÁ SINTETIZADO
 * (`FalPipelineResult.audioUrl`), para que `/approve-video` reutilize o
 * MESMO áudio via `runFalPipelineDoVideoMudo(..., audioPreSintetizado)` em
 * vez de ressintetizar (ressintetizar o MESMO texto mede uma duração
 * DIFERENTE — variância de até 9,1% já registrada neste projeto — o que
 * reabriria o descompasso que esta função existe para fechar).
 */
async function animarTomadaUnicaComAudioReal(
  input: FalPipelineInput,
  imagemUrl: string,
  composicaoRequestId: string,
): Promise<FalPipelineResult> {
  // O TETO usa a estimativa COM a margem de dispersão (ao contrário da
  // decisão de branch em `runFalPipelineDaImagem`, que é sem margem, só para
  // escolher o caminho) — é uma AUTORIZAÇÃO prévia, e precisa de folga para
  // não recusar uma fala real que a estimativa central subestimou.
  const segundosEstimadosComMargem =
    (input.script.length / PIPELINE_CHARS_PER_SECOND) * (1 + PIPELINE_RITMO_DISPERSAO);
  const teto = tetoParaTier(input, segundosEstimadosComMargem);

  // Mesmo padrão de `animarNarrarSincronizar`: um seed e uma foto de
  // identidade por corrida, nunca por bloco (aqui só há um bloco, mas o
  // padrão é o mesmo por uniformidade com o caminho fracionado).
  const seedDoVideo = (await input.diario.lerSeed?.()) ?? gerarSeedWan();
  const fotoDeIdentidadeUrl =
    input.fotoDeIdentidade && input.fotoDeIdentidade.bytes.length > 0
      ? await falUpload(input.apiKeyFal, input.fotoDeIdentidade.bytes, input.fotoDeIdentidade.mimeType)
      : null;

  // --- NARRAR PRIMEIRO — item 2: é daqui que vem a duração REAL. -----------
  const { audioUrl, fala } = await narrar(input);
  const duracaoWan3 = Math.max(1, Math.ceil(fala.durationSeconds ?? 0) + MARGEM_DURACAO_WAN3_SEGUNDOS);

  // --- ANIMAR, UMA VEZ — item 3: nunca mais segundos que a fala pede. ------
  const bloco = await animarUmBloco(
    input,
    "normal",
    imagemUrl,
    duracaoWan3,
    0,
    teto,
    direcaoComExpressividade(input.promptDeDirecao, input.expressiveness),
    seedDoVideo,
    fotoDeIdentidadeUrl,
    // Tomada única: não é fracionamento, não tem índice de bloco.
    null,
  );

  if (input.aspectRatio && input.verificarAspectRatio !== false) {
    await assertAspectRatio(bloco.videoUrl, input.aspectRatio);
  }

  if (input.pararApos === "animar") {
    return pararAqui("animar", bloco.gastoPrevistoUsd, duracaoWan3, {
      imagemCompostaUrl: imagemUrl,
      videoMudoUrl: bloco.videoUrl,
      requestIds: { compor: composicaoRequestId, animar: bloco.requestId, sincronizar: "" },
      // O ÁUDIO já existe — ver o comentário da função acima.
      audioUrl,
      audioDurationSeconds: fala.durationSeconds,
    });
  }

  return sincronizarComAudio(
    input,
    {
      videoMudoUrl: bloco.videoUrl,
      imagemCompostaUrl: imagemUrl,
      gastoAcumuladoUsd: bloco.gastoPrevistoUsd,
      teto,
      segundosEstimados: fala.durationSeconds ?? 0,
      duracaoEscolhida: duracaoWan3,
      composicaoRequestId,
      animarRequestId: bloco.requestId,
    },
    audioUrl,
    fala,
  );
}

/**
 * Erro ao pedir uma retomada que não tem o que retomar — V30, item 3.
 *
 * Classe PRÓPRIA (não `FalPipelineError` genérica) para o call site de
 * produto (`routes/videos.ts`) poder devolver um 409 claro em vez de um
 * 502 de "falha no fornecedor" — nada foi enviado à fal quando isto é
 * lançado, então não é o vocabulário de erro de fornecedor que se aplica.
 */
export class RetomadaSemBlocoPendenteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetomadaSemBlocoPendenteError";
  }
}

/**
 * RETOMA um vídeo Normal fracionado do bloco de animação onde parou —
 * V30, item 3. Par de `runFalPipelineDaImagem` (corrida do zero) e de
 * `runFalPipelineDoVideoMudo` (retoma um passo mais adiante, depois de
 * `animar` inteiro) — o MESMO laço/concatenação de `animarNarrarSincronizar`
 * é reusado, nunca duplicado; o que muda é só o ponto de partida do laço.
 *
 * `blocosJaConcluidos` — os blocos ALREADY-PAGOS, na ordem 0..k-1, com a
 * URL e o `request_id` de cada um (ver `blocosConcluidosDaCorrida`,
 * falPipelineJournal.ts). Reenviar qualquer um deles seria pagar duas
 * vezes pelo mesmo segundo de vídeo — `animarNarrarSincronizar` recusa
 * isso por construção (o laço começa em `blocosJaConcluidos.length`).
 *
 * Recusa ANTES de qualquer chamada paga (`RetomadaSemBlocoPendenteError`)
 * quando o roteiro recomputado não tem bloco pendente nenhum — script
 * mudou, ou a corrida já tinha terminado a animação por outro caminho.
 */
export async function runFalPipelineRetomandoBlocos(
  input: FalPipelineInput,
  imagemCompostaUrl: string,
  blocosJaConcluidos: { videoUrl: string; requestId: string }[],
  /** O `request_id` da composição que produziu esta imagem, quando conhecido. */
  composicaoRequestId = "",
): Promise<FalPipelineResult> {
  // ESCOPO desta rodada: só Normal fraciona (ver `NORMAL_MAX_TARGET_SECONDS`
  // — Premium sempre cabe num bloco só). `conferirRoteiroENormal` recomputa
  // o MESMO plano de blocos que a corrida original produziu — pura e
  // determinística a partir do `script`, então recalcular aqui, numa
  // invocação nova do processo, devolve os mesmos N blocos de antes.
  const roteiroConferido = conferirRoteiroENormal(input.script);
  const { chars, segundosEstimados, duracaoEscolhida, blocos, segundosTotais } = roteiroConferido;

  if (blocosJaConcluidos.length >= blocos.length) {
    throw new RetomadaSemBlocoPendenteError(
      `fal: a retomada não achou bloco pendente — ${blocosJaConcluidos.length} bloco(s) já concluído(s) ` +
        `contra ${blocos.length} no roteiro recomputado. Ou o roteiro mudou desde a corrida original, ou ` +
        "a animação já terminou por outro caminho. Nada foi enviado à fal.",
    );
  }

  logEvent("info", "fal_pipeline_retomando_blocos", {
    chars,
    segundosEstimados,
    duracaoEscolhida,
    imagemCompostaUrl,
    composicaoRequestId: composicaoRequestId || null,
    blocosTotais: blocos.length,
    blocosJaConcluidos: blocosJaConcluidos.length,
    segundosTotais,
  });

  return animarNarrarSincronizar(input, {
    imagemUrl: imagemCompostaUrl,
    gastoAcumuladoUsd: 0,
    teto: tetoParaTier(input, segundosTotais),
    tier: "normal",
    segundosEstimados,
    duracaoEscolhida,
    blocos,
    composicaoRequestId,
    blocosJaConcluidos,
  });
}

/**
 * O custo estimado só dos blocos AINDA NÃO submetidos — V30, item 4. Read-
 * only: não abre etapa, não grava nada, não fala com a fal. Existe para a
 * tela mostrar "falta pagar US$ X" ANTES do clique que retoma de verdade,
 * pela MESMA fonte de preço (`custoDaEtapa`/`provider_prices`) que a
 * submissão real usa — nunca uma fórmula paralela que possa divergir dela.
 */
export async function custoEstimadoBlocosRestantesUsd(
  blocosRestantes: BlocoDeAnimacao[],
): Promise<number> {
  let total = 0;
  for (const bloco of blocosRestantes) {
    const custoPeloCodigo = PRECOS_FAL.animarUsdPorSegundo * bloco.duracaoEscolhida;
    total += await custoDaEtapa(ENDPOINT_ANIMAR, bloco.duracaoEscolhida, custoPeloCodigo, "animar");
  }
  return total;
}

interface ContextoDaAnimacao {
  imagemUrl: string;
  gastoAcumuladoUsd: number;
  teto: number;
  /** Qual motor de animação usar — ver `enderecoAnimarParaTier`. */
  tier: PipelineTier;
  segundosEstimados: number;
  /** A duração escolhida por `conferirRoteiro` — vai ao motor em `duration`. */
  duracaoEscolhida: PipelineDuration;
  composicaoRequestId: string;
  /**
   * Os blocos de animação — BLOCO FRACOES-1, 28/08. Um elemento só para o
   * caminho de sempre (Premium, ou Normal que cabe num bloco); mais de um
   * para Normal fracionado. `animarNarrarSincronizar` decide o caminho pelo
   * TAMANHO desta lista, não pelo tier sozinho — Premium sempre chega com
   * um elemento porque `runFalPipeline`/`runFalPipelineDaImagem` nunca o
   * fracionam (fora de escopo, ver `NORMAL_MAX_TARGET_SECONDS`).
   */
  blocos: BlocoDeAnimacao[];
  /**
   * Blocos JÁ animados e PAGOS numa corrida anterior — RETOMADA, V30, item
   * 3. `undefined`/vazio: corrida do zero, comportamento de antes desta
   * rodada. Quando presente, o laço de blocos (abaixo) começa em
   * `blocosJaConcluidos.length`, nunca em 0 — reenviar um bloco que já
   * consta aqui seria pagar duas vezes pelo mesmo segundo de vídeo. A ORDEM
   * importa: o elemento `i` tem de ser o resultado do bloco `i`.
   */
  blocosJaConcluidos?: { videoUrl: string; requestId: string }[];
}

/**
 * As etapas 2 a 5 — animar, narrar, sincronizar, guardar.
 *
 * Extraída de `runFalPipeline` para ter DOIS chamadores: a corrida inteira (que
 * ainda existe, e é o que a sonda exercita) e a retomada pós-aprovação. A
 * alternativa era um `if` no começo de `runFalPipeline` pulando as etapas 0 e 1
 * — e isso reescreveria o bloco publicar→teto→autorizar que o mutante G-b
 * transcreve, fazendo uma guarda do B2 virar ERRO por causa de uma mudança que
 * não tem nada a ver com ela.
 */
/**
 * O corpo de `animar()` para o Wan (tier "normal").
 *
 * EXTRAÍDA de dentro de `animarNarrarSincronizar` pelo BLOCO A, byte a byte
 * (mesmos campos, mesmos comentários, mesma indentação) — vários mutantes já
 * ancoravam este texto de quando ele vivia inline como o 5º argumento de
 * `etapaNaFal`, e mover o texto para uma função dedicada, preservando-o
 * exatamente, é o que permite ramificar por tier sem os quebrar.
 */
/**
 * `direcaoDoBloco` — RODADA 3, BUG D/E. Antes daquela rodada este parâmetro
 * não existia e a função lia `input.promptDeDirecao` (a Interpretação
 * INTEIRA) direto, igual para todo bloco. Quem chama resolve a fatia certa
 * por `wanOrchestration.ts`/`direcaoPorJanela` ANTES de chamar — esta função
 * não sabe fatiar, só recebe o texto já pronto. Para um vídeo de bloco
 * único, o chamador passa `input.promptDeDirecao` sem fatiar.
 *
 * `imagemDeReferencia` — RODADA 4, MIGRAÇÃO PARA reference-to-video/flash
 * (item 2, 29/08). Renomeado de `imagemUrl`: no endpoint antigo essa imagem
 * era o QUADRO DE PARTIDA; no novo é a REFERÊNCIA DE IDENTIDADE ("Character1"
 * no prompt) — sempre a MESMA imagem composta original, em TODO bloco, nunca
 * o último quadro do bloco anterior (ver `ENDPOINT_ANIMAR` para a razão e o
 * que isto muda no Bug G).
 *
 * `seed` — item 1 da rodada de 29/08 seguinte (achado do linter/investigação,
 * confirmado por LEITURA, não suposto): `seed` NUNCA era enviado, então cada
 * bloco sorteava o seu por conta do fornecedor — candidato plausível para a
 * deriva de cor/luz entre blocos já registrada como achado colateral em
 * rodada anterior. `seedDoVideo` (ver `animarNarrarSincronizar`) é gerado UMA
 * VEZ por corrida e passado a TODO bloco Wan da mesma corrida — mesma
 * referência de identidade, mesmo seed, em toda chamada. NÃO VERIFICADO por
 * vídeo real ainda que isto reduza a deriva — é candidato a teste isolado
 * (Item 1 da lista de testes baratos), não correção comprovada.
 *
 * `fotoDeIdentidadeUrl` — V24, 31/08/2026. SEGUNDA referência de
 * identidade, além da composta: a URL já subida à fal do rosto REAL (foto
 * original, não a composição). `null` quando a corrida não tem a foto real
 * disponível (ver `FalPipelineInput.fotoDeIdentidade`) — nesse caso
 * `image_urls` leva só a composta, byte a byte o comportamento de antes
 * desta rodada. Gerada UMA VEZ por corrida em `animarNarrarSincronizar`
 * (mesmo padrão de `seedDoVideo`), nunca reenviada/reuplodada por bloco.
 */
function corpoAnimarWan(
  input: FalPipelineInput,
  imagemDeReferencia: string,
  duracaoEscolhida: PipelineDuration,
  direcaoDoBloco: string,
  seed: number,
  fotoDeIdentidadeUrl: string | null,
): Record<string, unknown> {
  // V33, item 5 (01/09/2026) — os PAPÉIS de cada referência, ditos no texto:
  // a imagem COMPOSTA é quem carrega cenário e traje; a foto REAL, quando
  // existe, é quem carrega a identidade. Antes desta rodada só a composta
  // era citada, sempre como "Character1" — sem a foto real na lista, ou com
  // as duas sem papel dito, o modelo não tem como saber qual referência
  // prevalece quando elas divergem (ex.: a foto real do rosto contra o
  // rosto redesenhado pela composição). A ORDEM da lista NÃO mudou (a
  // composta continua Reference1, PRIMEIRA — invariante de V24/G-2b,
  // `checkFalSceneWiringPolicy.ts`: "a composta continua sendo a referência
  // PRINCIPAL; a foto real é um reforço, nunca uma substituta") — só o
  // TEXTO ganhou a declaração de papel que faltava.
  const referencias = fotoDeIdentidadeUrl ? [imagemDeReferencia, fotoDeIdentidadeUrl] : [imagemDeReferencia];
  const clausulaDeReferencia = fotoDeIdentidadeUrl
    ? "Reference1 is the composed scene — it defines the outfit and the background, and must be kept " +
      "exactly as shown. Reference2 is the real photo of the person — it defines the exact identity: face, " +
      "skin tone and hair, and must be kept exactly as shown. "
    : "Reference1 shows the person, the outfit and the background — keep the exact identity, outfit and " +
      "background exactly as shown. ";
  // V33, item 4 — cláusula de IDENTIDADE no COMEÇO do prompt, não no fim
  // (invertido em relação ao Wan 2.6): MEDIDO na sonda V32
  // (`probeWan3ReferenceToVideo.ts`) que o pedido do operador era testar
  // exatamente esta ordem: por que ficar no fim arriscava o modelo já ter
  // "decidido" a cena antes de ler a restrição de identidade.
  const prompt = [
    clausulaDeReferencia,
    comDefaultsDeDirecao(direcaoDoBloco),
    // As três regras NOVAS do Wan 3.0 — ver o comentário de cada uma.
    DIRECAO_ROSTO_FRONTAL_WAN3,
    DIRECAO_ENQUADRAMENTO_ROSTO_WAN3,
    DIRECAO_FALANDO_NATURALMENTE_WAN3,
    // O equivalente positivo do `negative_prompt` do Wan 2.6 — este
    // endpoint não tem o campo (ver `ANTI_ARTEFATO_WAN3`).
    ANTI_ARTEFATO_WAN3,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  return {
    prompt,
    // RENOMEADO `image_urls` → `reference_image_urls` — MEDIDO por WebFetch
    // (V32, Parte A): mesmo papel (referência de identidade/cenário), até
    // 10 imagens no schema novo (contra 5 do antigo). ORDEM: a composta
    // sempre PRIMEIRO (Reference1 na fala do prompt acima), a foto real
    // depois quando existe — a fala e a lista precisam concordar, ou
    // "Reference1"/"Reference2" no texto apontariam para a imagem errada.
    reference_image_urls: referencias,
    // `audio: false` — RENOMEADO de `generate_audio` (MEDIDO por WebFetch,
    // V32). É o mais caro de omitir: o default (`true`) sintetiza uma
    // trilha PRÓPRIA, paga, que a etapa de sincronizar substituiria de
    // qualquer forma — e o áudio nativo foi DESCARTADO nesta migração (ver
    // o comentário de `ENDPOINT_ANIMAR`): a voz é sempre o clone do
    // ElevenLabs, nunca a do Wan.
    audio: false,
    resolution: RESOLUCAO_VIDEO,
    // A proporção escolhida na tela de publicação. Comportamento IDÊNTICO
    // ao do Wan 2.6 — o campo mudou de endpoint, não de nome nem de regra
    // (ver o comentário de `aspectRatio` em `FalPipelineInput`).
    ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
    // INTEIRO, não string — MUDOU nesta migração: o Wan 2.6 tinha um enum
    // fechado ("5"|"10", string) e o Wan 3.0 documenta `duration` como
    // inteiro sem enum (MEDIDO por WebFetch, V32; 20 aceito e confirmado
    // pela sonda paga). `duracaoEscolhida` chega já pronta — ou um dos
    // valores de `PIPELINE_DURATION_OPTIONS` (caminho fracionado, >30s) ou
    // a duração derivada do áudio real (caminho de tomada única, ≤30s; ver
    // `LIMITE_TAKE_UNICO_SEGUNDOS`).
    duration: duracaoEscolhida,
    // Ver DEFAULTS_NUNCA_HERDADOS: sem ele, o fornecedor reescreve a
    // direção por conta própria. `multi_shots` SAIU — não existe no schema
    // do Wan 3.0 (MEDIDO por WebFetch, V32); a segmentação em tomadas que
    // ele evitava não tem mais um campo próprio para desligar, e
    // `DIRECAO_PLANO_UNICO` (dentro de `comDefaultsDeDirecao`, acima) é
    // quem carrega essa restrição agora, como texto.
    enable_prompt_expansion: false,
    // Item 1, rodada de 29/08 anterior — ver o comentário de `seed` acima.
    seed,
  };
}

/**
 * O `seed` de UMA corrida — item 1 da rodada de 29/08 seguinte. Gerado uma
 * vez, na ABERTURA da corrida (`abrirCorrida`, falPipelineJournal.ts —
 * V30, item 1), e reutilizado em todo bloco Wan daquela corrida, inclusive
 * numa RETOMADA (Seedance nunca o recebe — `corpoAnimarSeedance` não tem
 * este parâmetro). Faixa do schema: inteiro 0-2147483647.
 *
 * EXPORTADA (V30): `abrirCorrida` (falPipelineJournal.ts) precisa gerar o
 * seed no INSERT — antes desta rodada ele só existia em memória, dentro de
 * `animarNarrarSincronizar`, e uma retomada em processo/invocação nova
 * sortearia um seed DIFERENTE dos blocos já pagos da mesma corrida.
 */
export function gerarSeedWan(): number {
  return Math.floor(Math.random() * 2147483648);
}

/**
 * O corpo de `animar()` para o Seedance 2.5 (tier "premium") — BLOCO A.
 *
 * MEDIDO por leitura do BLOCO SEEDANCE-1 (21/08, revertido antes de ser
 * commitado): `image_urls` LISTA (não `image_url` singular), `end_user_id`
 * (identificação de conta B2B), `aspect_ratio`, SEM `enable_prompt_expansion`/
 * `multi_shots` (campos do Wan). Ver `DEFAULTS_NUNCA_HERDADOS_PREMIUM`.
 *
 * ⚠️ `duration` NÚMERO, não string — o Seedance documenta uma faixa contínua
 * (4-30), não o enum fechado do Wan. NÃO VERIFICADO por fusível nem por
 * chamada real — ver `ENDPOINT_ANIMAR_PREMIUM`.
 */
function corpoAnimarSeedance(
  input: FalPipelineInput,
  imagemUrl: string,
  duracaoEscolhida: PipelineDuration,
): Record<string, unknown> {
  return {
    prompt: comDefaultsDeDirecao(input.promptDeDirecao),
    image_urls: [imagemUrl],
    end_user_id: input.tenantId,
    aspect_ratio: input.aspectRatio,
    duration: duracaoEscolhida,
  };
}

/**
 * UM bloco de animação — extraída do laço para os dois caminhos (um bloco só
 * e vários blocos) chamarem o MESMO código. `imagemDeEntrada` é a imagem
 * composta no bloco 0 e o ÚLTIMO QUADRO do bloco anterior em todo bloco
 * seguinte — ver `imagemDeEntradaDoBloco` logo abaixo.
 */
async function animarUmBloco(
  input: FalPipelineInput,
  tier: PipelineTier,
  imagemDeEntrada: string,
  duracaoEscolhida: PipelineDuration,
  gastoAcumuladoUsd: number,
  teto: number,
  /**
   * RODADA 3 — a direção DESTE bloco, só usada pelo ramo Wan
   * (`corpoAnimarWan`). O ramo Seedance (`corpoAnimarSeedance`) NUNCA lê
   * este parâmetro — continua lendo `input.promptDeDirecao` direto, porque
   * Premium nunca fraciona (sempre um bloco só) e está fora do escopo desta
   * rodada. Para o caminho Wan de bloco único, quem chama passa
   * `input.promptDeDirecao` sem fatiar — idêntico a antes.
   */
  direcaoDoBloco: string,
  /**
   * Item 1, rodada de 29/08 seguinte — o MESMO `seed` em todo bloco Wan da
   * MESMA corrida (ver `gerarSeedWan`, gerado uma vez em
   * `animarNarrarSincronizar`). O ramo Seedance (`corpoAnimarSeedance`) NUNCA
   * lê este parâmetro — mesma razão de escopo de `direcaoDoBloco` acima.
   */
  seed: number,
  /**
   * V24 — a URL (já subida à fal) da foto REAL do rosto, ou `null`. Só o
   * ramo Wan a lê (`corpoAnimarWan`); ver o comentário de
   * `fotoDeIdentidadeUrl` lá.
   */
  fotoDeIdentidadeUrl: string | null,
  /**
   * V30, item 2 — o índice (0-based) deste bloco na corrida, quando ela é
   * um vídeo Normal fracionado; `null` para o caminho de bloco único
   * (Premium, ou Normal que já cabia em 1). Só rotula a etapa no diário —
   * não muda nada do que é enviado à fal.
   */
  blocoIndice: number | null,
): Promise<{ videoUrl: string; requestId: string; gastoPrevistoUsd: number }> {
  // O CUSTO e o ENDPOINT dependem do tier — ver `enderecoAnimarParaTier` e
  // `custoSeedanceUsd`. "normal" (Wan) é tarifado por segundo; "premium"
  // (Seedance) é tarifado por CLIPE, pela fórmula de tokens.
  const custoAnimarPeloCodigo =
    tier === "premium" ? custoSeedanceUsd(duracaoEscolhida) : PRECOS_FAL.animarUsdPorSegundo * duracaoEscolhida;
  const custoAnimarUsd = await custoDaEtapa(
    enderecoAnimarParaTier(tier),
    duracaoEscolhida,
    custoAnimarPeloCodigo,
    "animar",
  );
  const gastoPrevistoUsd = autorizarGasto(gastoAcumuladoUsd, custoAnimarUsd, teto, "animar");
  await input.diario.registrarGastoPrevisto(gastoPrevistoUsd);

  const corpoDeAnimar =
    tier === "premium"
      ? corpoAnimarSeedance(input, imagemDeEntrada, duracaoEscolhida)
      : corpoAnimarWan(input, imagemDeEntrada, duracaoEscolhida, direcaoDoBloco, seed, fotoDeIdentidadeUrl);

  // Camada 1 — item 4 da rodada de 29/08 seguinte. Só o ramo Wan: Seedance
  // não documenta `negative_prompt` (ver o comentário de `NEGATIVE_PROMPT_ANIMAR_WAN`)
  // e nunca fraciona (sem marcador de janela para vazar), então as quatro
  // checagens não se aplicam a ele.
  if (tier !== "premium") lintarPromptDoBlocoWan(corpoDeAnimar);

  const animacao = await etapaNaFal(input, "animar", 2, enderecoAnimarParaTier(tier), corpoDeAnimar, blocoIndice);
  const videoUrl = animacao.saida?.video?.url;
  if (!videoUrl) {
    throw new FalPipelineError(
      "fal: a animação concluiu sem devolver vídeo. O corpo bruto está gravado na etapa.",
    );
  }
  return { videoUrl: String(videoUrl), requestId: animacao.requestId, gastoPrevistoUsd };
}

/**
 * CONCATENA os N vídeos mudos dos blocos e devolve uma URL da fal — item 3
 * do plano. Sobe de volta para a fal (em vez de servir localmente) porque é
 * assim que o contrato de retorno desta função já funciona há muito tempo
 * (`videoMudoUrl` é sempre uma URL fetchable, nunca bytes) — `/approve`
 * (routes/videos.ts) já sabe baixar e persistir qualquer URL que chegue
 * aqui, fal ou local, via `persistRemoteArtifact`.
 *
 * ⚠️ FIXTURE, ANTES do ffmpeg — mesmo princípio de toda função exportada de
 * `falClient.ts`: os N `videoUrls` em fixture são todos o MESMO
 * `FIXTURE_VIDEO_URL` (host que não existe de propósito), e
 * `ffmpeg -filter_complex` sobre eles falharia sempre, por um motivo alheio
 * ao que se quer testar aqui.
 *
 * `corrigirCor: tier === "normal"` — RODADA 7, item 1 (30/08/2026). MEDIDO
 * na rodada anterior (item 6, mesmos 3 blocos pagos, reconcatenados de
 * graça): sem correção, o bloco 2 de uma corrida real destoava ~28 pontos
 * de RGB do bloco 0; com `corrigirCor: true`, a diferença caiu para ~1-2
 * pontos. Só para Normal — é o ÚNICO tier que chega aqui com N>1 blocos
 * (Premium nunca fraciona, `blocos.length` é sempre 1 para ele e a
 * concatenação de verdade, com `xfade`, nunca roda — ver
 * `ContextoDaAnimacao.tier`); a condição existe mesmo assim, explícita,
 * para não depender dessa invariante silenciosa se ela mudar um dia.
 */
async function concatenarBlocosEPublicar(
  apiKeyFal: string,
  videoUrls: string[],
  tier: PipelineTier,
): Promise<string> {
  if (isFixtureMode()) {
    return await falUpload(apiKeyFal, Buffer.from(`fixture-concat-${videoUrls.length}-blocos`), "video/mp4");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "fal-concat-"));
  const outputPath = path.join(dir, "concatenado.mp4");
  try {
    await concatVideos(videoUrls, outputPath, { corrigirCor: tier === "normal" });
    const bytes = await readFile(outputPath);
    return await falUpload(apiKeyFal, bytes, "video/mp4");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function animarNarrarSincronizar(
  input: FalPipelineInput,
  contexto: ContextoDaAnimacao,
): Promise<FalPipelineResult> {
  const { imagemUrl, teto, tier, segundosEstimados, duracaoEscolhida, composicaoRequestId, blocos } = contexto;
  const blocosJaConcluidos = contexto.blocosJaConcluidos ?? [];
  let gastoPrevistoUsd = contexto.gastoAcumuladoUsd;
  // Item 1, rodada de 29/08 seguinte — UM seed por corrida, o MESMO em todo
  // bloco Wan dela (`corpoAnimarSeedance` nunca o lê). Ver `gerarSeedWan`.
  //
  // V30, item 1 — lido do DIÁRIO (persistido por `abrirCorrida` na
  // abertura), não mais gerado aqui: numa RETOMADA, esta função roda de
  // novo, numa invocação nova do processo, e `gerarSeedWan()` direto
  // sortearia um seed DIFERENTE do já usado pelos blocos pagos da mesma
  // corrida. `lerSeed` é opcional na interface — sem ele (guardas com
  // diário em memória), cai para `gerarSeedWan()` fresco, o comportamento
  // de antes desta rodada.
  const seedDoVideo = (await input.diario.lerSeed?.()) ?? gerarSeedWan();
  // V24 — a foto REAL do rosto sobe UMA VEZ por corrida (mesmo padrão do
  // seed acima), nunca por bloco: os N blocos de um vídeo Normal fracionado
  // reusam a MESMA URL, do mesmo jeito que já reusam a MESMA imagem
  // composta. `null` quando a corrida não trouxe a foto real (ver
  // `FalPipelineInput.fotoDeIdentidade`) — nesse caso nenhum bloco ganha a
  // segunda referência, byte a byte o comportamento de antes desta rodada.
  const fotoDeIdentidadeUrl =
    input.fotoDeIdentidade && input.fotoDeIdentidade.bytes.length > 0
      ? await falUpload(input.apiKeyFal, input.fotoDeIdentidade.bytes, input.fotoDeIdentidade.mimeType)
      : null;

  // --- ANIMAR — UM bloco (Premium, ou Normal que já cabia em 1) ------------
  //
  // Caminho IDÊNTICO, byte a byte, ao que existia antes do BLOCO FRACOES-1:
  // uma chamada a `animar()`, sem concat nem upload extra. É o que garante
  // que nenhum vídeo de 15 s ou menos (Normal ou Premium) muda de
  // comportamento com este bloco.
  if (blocos.length <= 1) {
    // BLOCO ÚNICO: nada para fatiar — a direção INTEIRA vai para o único
    // bloco que existe, exatamente como antes desta rodada. Cobre Premium
    // (sempre um bloco só) e Normal quando o roteiro cabe num bloco só.
    const bloco = await animarUmBloco(
      input,
      tier,
      imagemUrl,
      duracaoEscolhida,
      gastoPrevistoUsd,
      teto,
      direcaoComExpressividade(input.promptDeDirecao, input.expressiveness),
      seedDoVideo,
      fotoDeIdentidadeUrl,
      // Bloco único: não é fracionamento, não tem índice — ver o comentário
      // de `blocoIndice` em `animarUmBloco`.
      null,
    );
    gastoPrevistoUsd = bloco.gastoPrevistoUsd;
    if (input.aspectRatio && input.verificarAspectRatio !== false) {
      await assertAspectRatio(bloco.videoUrl, input.aspectRatio);
    }

    if (input.pararApos === "animar") {
      // --- PARADA DO MODO B — FASE 2, 21/08 -----------------------------
      //
      // `pararApos: "animar"` encerra a corrida logo aqui, com o vídeo MUDO
      // gravado e nada de narrar/sincronizar disparado ainda. Mesmo
      // mecanismo que `pararApos: "compor"` já usa para a imagem, um passo
      // adiante.
      return pararAqui("animar", gastoPrevistoUsd, duracaoEscolhida, {
        imagemCompostaUrl: imagemUrl,
        videoMudoUrl: bloco.videoUrl,
        requestIds: { compor: composicaoRequestId, animar: bloco.requestId, sincronizar: "" },
      });
    }

    return narrarSincronizar(input, {
      videoMudoUrl: bloco.videoUrl,
      imagemCompostaUrl: imagemUrl,
      gastoAcumuladoUsd: gastoPrevistoUsd,
      teto,
      segundosEstimados,
      duracaoEscolhida,
      composicaoRequestId,
      animarRequestId: bloco.requestId,
    });
  }

  // --- ANIMAR — VÁRIOS blocos (Normal fracionado) --------------------------
  //
  // Item 2 do plano: `compor` já rodou UMA VEZ (a imagem aprovada, `imagemUrl`
  // — nunca refeita aqui). TODO bloco anima a partir DELA — MUDOU na
  // migração para `reference-to-video/flash` (item 2, RODADA 4, 29/08):
  // antes, cada bloco 2+ animava a partir do ÚLTIMO QUADRO do bloco
  // anterior (`imagemDeEntradaDoProximoBloco`, removida nesta rodada — ver
  // `wanOrchestration.ts` para a razão: o endpoint novo usa a imagem como
  // REFERÊNCIA DE IDENTIDADE, não como quadro de partida, e encadear um
  // quadro degradado deixou de fazer sentido nesse modelo). Isto é a
  // tentativa de FECHAR o Bug G, não mais só documentá-lo — NÃO VERIFICADO
  // por vídeo real ainda.
  //
  // BUG D/E, RODADA 3 — a TABELA decide a direção de cada bloco de uma vez
  // só, ANTES do laço: `direcaoPorJanela` fatia `input.promptDeDirecao`
  // pelos marcadores `[mm:ss-mm:ss]` que a tradução produz só para vídeos
  // Normal fracionados (`directionTranslation.ts`). Sem marcadores, o
  // FALLBACK dentro da própria função repete o texto inteiro — o
  // comportamento de antes desta rodada.
  const planoDosBlocos = montarPlanoDosBlocosWan({
    blocos,
    direcaoTraduzida: input.promptDeDirecao,
    promptDeComposicaoUsado: input.promptDeComposicao,
    expressiveness: input.expressiveness,
  });
  logEvent("info", "fal_pipeline_plano_dos_blocos", {
    blocos: planoDosBlocos.map((p) => ({
      indice: p.indice,
      janela: p.janela,
      duracaoEscolhida: p.duracaoEscolhida,
      direcaoChars: p.direcaoDoBloco.length,
    })),
  });

  // V30, item 3 — RETOMADA: os blocos já pagos numa corrida anterior nunca
  // são reenviados. `blocosJaConcluidos` pré-preenche as duas listas na
  // MESMA ordem em que o laço as construiria do zero, e o laço começa no
  // primeiro índice AINDA NÃO feito — nunca em 0 quando há retomada.
  if (blocosJaConcluidos.length > blocos.length) {
    throw new FalPipelineError(
      `fal: a retomada trouxe ${blocosJaConcluidos.length} bloco(s) já concluído(s), mas o roteiro só ` +
        `tem ${blocos.length} — o roteiro pode ter mudado desde a corrida original. Recusa em vez de ` +
        "adivinhar qual bloco reenviar.",
    );
  }
  const videoUrls: string[] = blocosJaConcluidos.map((b) => b.videoUrl);
  const requestIds: string[] = blocosJaConcluidos.map((b) => b.requestId);
  for (let i = blocosJaConcluidos.length; i < blocos.length; i++) {
    // SEMPRE `imagemUrl` (a composta original) — nunca o último quadro do
    // bloco anterior. Ver o comentário acima desta seção.
    const bloco = await animarUmBloco(
      input,
      tier,
      imagemUrl,
      blocos[i].duracaoEscolhida,
      gastoPrevistoUsd,
      teto,
      planoDosBlocos[i].direcaoDoBloco,
      seedDoVideo,
      fotoDeIdentidadeUrl,
      i,
    );
    gastoPrevistoUsd = bloco.gastoPrevistoUsd;
    videoUrls.push(bloco.videoUrl);
    requestIds.push(bloco.requestId);
  }

  // Item 3 do plano: concatena os N mudos numa saída só. É ESTA url que
  // segue como "o vídeo mudo" para o resto do pipeline — narrar+sincronizar
  // (Ponto 2 de aprovação) não sabem, e não precisam saber, que ela veio de
  // vários blocos.
  const videoMudoUrl = await concatenarBlocosEPublicar(input.apiKeyFal, videoUrls, tier);
  logEvent("info", "fal_pipeline_blocos_concatenados", {
    blocos: blocos.length,
    segundosTotais: blocos.reduce((soma, b) => soma + b.duracaoEscolhida, 0),
  });
  // ITEM 8, 29/08 — o formato REAL do concatenado bate com o PEDIDO?
  // Depois da concatenação (não de cada bloco isolado): é o arquivo final
  // que a pessoa vê, e o `xfade`/`scale` do item 4 já normalizou geometria
  // entre blocos — esta é a checagem sobre o resultado, não sobre insumos.
  if (input.aspectRatio && input.verificarAspectRatio !== false) {
    await assertAspectRatio(videoMudoUrl, input.aspectRatio);
  }

  if (input.pararApos === "animar") {
    return pararAqui("animar", gastoPrevistoUsd, duracaoEscolhida, {
      imagemCompostaUrl: imagemUrl,
      videoMudoUrl,
      requestIds: { compor: composicaoRequestId, animar: requestIds.join(","), sincronizar: "" },
    });
  }

  return narrarSincronizar(input, {
    videoMudoUrl,
    imagemCompostaUrl: imagemUrl,
    gastoAcumuladoUsd: gastoPrevistoUsd,
    teto,
    segundosEstimados,
    duracaoEscolhida,
    composicaoRequestId,
    animarRequestId: requestIds.join(","),
  });
}

interface ContextoDaNarracao {
  /** O vídeo animado, mudo — o que `narrar`+`sincronizar` recebem de entrada. */
  videoMudoUrl: string;
  /** Só para o RESULTADO — nenhuma das duas etapas daqui lê a imagem. */
  imagemCompostaUrl: string | null;
  gastoAcumuladoUsd: number;
  teto: number;
  segundosEstimados: number;
  duracaoEscolhida: PipelineDuration;
  composicaoRequestId: string;
  animarRequestId: string;
}

interface FalaNarrada {
  audio: Buffer;
  durationSeconds: number | null;
  source: string | null;
}

/**
 * SÓ a etapa 3 — narrar. Extraída de `narrarSincronizar` — V33, item 2
 * (01/09/2026): o caminho novo de tomada única (roteiros ≤30s estimados)
 * precisa da duração REAL do áudio ANTES de montar o corpo de `animar()`
 * (ver `animarTomadaUnicaComAudioReal`), então narrar deixou de ser algo
 * que só acontece DEPOIS de animar. `narrarSincronizar` (o caminho de
 * sempre, narrar-depois-de-animar) chama esta função e depois
 * `sincronizarComAudio` — MESMO código nos dois casos, nunca duplicado.
 *
 * A voz é REUSADA (`input.voiceId`), nunca clonada: clonar consome um slot
 * irreversível, e a conta já está em 10/10 pela nossa régua.
 */
async function narrar(input: FalPipelineInput): Promise<{ audioUrl: string; fala: FalaNarrada }> {
  const narracaoStep = await input.diario.abrirEtapa("narrar", 3, "elevenlabs", null);
  const fala = await synthesizeSpeech(input.apiKeyElevenLabs, input.voiceId, input.script, input.voiceTuning);
  await input.diario.gravarRespostaCrua(
    narracaoStep,
    JSON.stringify({ bytes: fala.audio.length, durationSeconds: fala.durationSeconds, source: fala.source }),
  );
  await input.diario.fecharEtapa(narracaoStep, "completed");
  const audioUrl = await falUpload(input.apiKeyFal, fala.audio, "audio/mpeg");
  return { audioUrl, fala };
}

/**
 * As etapas 4 e 5 — sincronizar, guardar. Recebe o áudio (`audioUrl`/`fala`)
 * já pronto — de `narrar()` (caminho de sempre) OU já persistido de uma
 * corrida ANTERIOR (`videos.fal_audio_url` — V33, item 2, caminho de
 * tomada única retomado em `/approve-video`; ver `runFalPipelineDoVideoMudo`).
 * Nunca ressintetiza: ressintetizar o MESMO texto mede uma duração
 * DIFERENTE (variância de até 9,1% já registrada neste projeto), o que
 * reabriria o descompasso áudio/vídeo que a derivação por áudio real existe
 * para fechar.
 */
async function sincronizarComAudio(
  input: FalPipelineInput,
  contexto: ContextoDaNarracao,
  audioUrl: string,
  fala: Pick<FalaNarrada, "durationSeconds">,
): Promise<FalPipelineResult> {
  const { videoMudoUrl, imagemCompostaUrl, teto, segundosEstimados, duracaoEscolhida, composicaoRequestId, animarRequestId } =
    contexto;
  let gastoPrevistoUsd = contexto.gastoAcumuladoUsd;

  // RODADA 1, 29/08/2026 — `videoMudoUrl` pode ser um caminho LOCAL
  // (`/uploads/tenant/arquivo.mp4`): `/approve` baixa a URL da fal e persiste
  // uma cópia local para a Aprovação Nº2 poder tocar do NOSSO domínio (ver o
  // comentário de `concatenarBlocosEPublicar`, mais acima) — mas a partir
  // desse ponto a fal não alcança mais o arquivo pelo ponteiro que ficou
  // gravado em `videos.fal_muted_video_url`. MEDIDO em 29/08: mandar o
  // caminho local cru para `fal-ai/sync-lipsync/v2` custava um 422
  // `file_download_error` DEPOIS de o job já ter sido aceito e cobrado.
  // Publica de volta antes do custo — mesmo helper do áudio, dois passos
  // acima — porque publicar não é etapa paga (mesma razão de
  // `publicarEntradas`/`concatenarBlocosEPublicar`).
  const videoUrlParaSincronizar = videoMudoUrl.startsWith("/")
    ? await falUpload(input.apiKeyFal, await readUpload(videoMudoUrl), "video/mp4")
    : videoMudoUrl;

  // O custo depende da duração REAL do áudio, que agora é conhecida. Quando a
  // medição falha, a estimativa pela régua entra no lugar — e para o TETO ela
  // tem de ser a MAIOR das duas, senão o freio afrouxa justamente no caso em
  // que se sabe menos.
  const segundosDeAudio = Math.max(fala.durationSeconds ?? 0, segundosEstimados);
  const custoSincronizarUsd = await custoDaEtapa(
    ENDPOINT_SINCRONIZAR,
    segundosDeAudio,
    PRECOS_FAL.sincronizarUsdPorSegundoDeAudio * segundosDeAudio,
    "sincronizar",
  );
  gastoPrevistoUsd = autorizarGasto(gastoPrevistoUsd, custoSincronizarUsd, teto, "sincronizar");
  await input.diario.registrarGastoPrevisto(gastoPrevistoUsd);
  const sincronia = await etapaNaFal(input, "sincronizar", 4, ENDPOINT_SINCRONIZAR, {
    video_url: videoUrlParaSincronizar,
    audio_url: audioUrl,
    // O que se corta aqui é o VÍDEO mudo do fim, não a fala: a duração
    // escolhida sempre tem folga sobre a fala. Ver `SYNC_MODE` — inclusive o
    // que isso passa a depender do teto de caracteres POR DURAÇÃO.
    sync_mode: SYNC_MODE,
    // A VARIANTE, explícita. Sem ela o fornecedor escolhe, e a `pro` custa ~67%
    // mais. Ver `LIPSYNC_MODEL`.
    model: LIPSYNC_MODEL,
  });
  const videoFinalUrl = sincronia.saida?.video?.url;
  if (!videoFinalUrl) {
    throw new FalPipelineError(
      "fal: a sincronia concluiu sem devolver vídeo. O corpo bruto está gravado na etapa — as três " +
        "etapas pagas aconteceram, então este é o pior momento para perder o corpo da resposta.",
    );
  }

  // --- BIBLIOTECA -----------------------------------------------------------
  const biblioteca = await input.diario.abrirEtapa("biblioteca", 5, "eckko", null);
  await input.diario.gravarRespostaCrua(biblioteca, JSON.stringify({ videoUrl: videoFinalUrl }));
  await input.diario.fecharEtapa(biblioteca, "completed");

  return {
    gastoPrevistoUsd,
    videoUrl: String(videoFinalUrl),
    imagemCompostaUrl,
    videoMudoUrl,
    audioDurationSeconds: fala.durationSeconds,
    duracaoSegundos: duracaoEscolhida,
    audioUrl: null,
    requestIds: {
      compor: composicaoRequestId,
      animar: animarRequestId,
      sincronizar: sincronia.requestId,
    },
  };
}

/**
 * As etapas 3 a 5 — narrar, sincronizar, guardar. Extraída de
 * `animarNarrarSincronizar` para ter DOIS chamadores, mesma razão pela qual
 * aquela função já tinha sido extraída de `runFalPipeline`: a corrida
 * inteira (que passa por `animar` na mesma chamada) e a retomada pós-
 * aprovação do vídeo MUDO (`runFalPipelineDoVideoMudo`, FASE 2/Modo B), que
 * nunca chama `animar` de novo — ele já rodou e já foi pago numa corrida
 * anterior.
 *
 * V33 — passou a ser `narrar()` + `sincronizarComAudio()` em sequência, as
 * duas extraídas abaixo. Comportamento IDÊNTICO ao de antes desta rodada
 * para todo chamador que não passa pelo caminho de tomada única.
 */
async function narrarSincronizar(
  input: FalPipelineInput,
  contexto: ContextoDaNarracao,
): Promise<FalPipelineResult> {
  const { videoMudoUrl, imagemCompostaUrl, duracaoEscolhida, composicaoRequestId, animarRequestId, gastoAcumuladoUsd } =
    contexto;

  const { audioUrl, fala } = await narrar(input);

  if (input.pararApos === "narrar") {
    return pararAqui("narrar", gastoAcumuladoUsd, duracaoEscolhida, {
      imagemCompostaUrl,
      videoMudoUrl,
      requestIds: { compor: composicaoRequestId, animar: animarRequestId, sincronizar: "" },
    });
  }

  return sincronizarComAudio(input, contexto, audioUrl, fala);
}

/**
 * RETOMA de um VÍDEO MUDO JÁ ANIMADO — as etapas 3 a 5, e nenhuma antes dela.
 * FASE 2 (Modo B), 21/08 — o par de `runFalPipelineDaImagem` um passo adiante.
 *
 * `gastoAcumuladoUsd` começa em ZERO, pela MESMA razão documentada em
 * `runFalPipelineDaImagem`: o teto desta corrida é o teto do que AINDA vai
 * ser gasto (narrar + sincronizar), e `animar` já foi pago numa corrida
 * anterior — carregar o gasto dela para cá recusaria a segunda metade por
 * dinheiro que já saiu.
 *
 * `audioPreSintetizado` — V33, item 2 (01/09/2026). Quando presente
 * (`videos.fal_audio_url`, persistido pelo `/approve` do caminho de tomada
 * única — ver `animarTomadaUnicaComAudioReal`), esta função PULA `narrar()`
 * e vai direto para `sincronizarComAudio` com o áudio já existente. Nunca
 * ressintetiza: ressintetizar o MESMO texto mede uma duração DIFERENTE
 * (variância de até 9,1% já registrada neste projeto), o que reabriria o
 * descompasso áudio/vídeo que a tomada única existe para fechar.
 * `undefined`/ausente: comportamento de antes desta rodada, narra de novo
 * (todo caminho Premium, e todo Normal fracionado acima de
 * `LIMITE_TAKE_UNICO_SEGUNDOS`).
 */
export async function runFalPipelineDoVideoMudo(
  input: FalPipelineInput,
  videoMudoUrl: string,
  imagemCompostaUrl: string | null,
  /** O `request_id` da composição, quando conhecido. */
  composicaoRequestId = "",
  /** O `request_id` da animação que produziu este vídeo mudo. */
  animarRequestId = "",
  audioPreSintetizado?: { audioUrl: string; durationSeconds: number | null } | null,
): Promise<FalPipelineResult> {
  // BLOCO FRACOES-1 — `conferirRoteiro` (única duração) lançaria para
  // qualquer roteiro Normal fracionado (>142 caracteres), mesmo aqui, que
  // só narra+sincroniza e não anima nada. Este passo já recebeu o vídeo
  // mudo PRONTO (possivelmente concatenado de vários blocos) — o que falta
  // saber do roteiro é só a duração TOTAL, para o teto, não uma duração de
  // bloco único.
  const ehPremium = input.tier === "premium";
  const roteiroConferido = ehPremium ? conferirRoteiro(input.script) : conferirRoteiroENormal(input.script);
  const { segundosEstimados, duracaoEscolhida } = roteiroConferido;
  const segundosTotaisDoRoteiro = ehPremium ? duracaoEscolhida : (roteiroConferido as RoteiroConferidoENormal).segundosTotais;
  logEvent("info", "fal_pipeline_retomado_do_video_mudo", {
    segundosEstimados,
    duracaoEscolhida,
    segundosTotais: segundosTotaisDoRoteiro,
    videoMudoUrl,
    composicaoRequestId: composicaoRequestId || null,
    animarRequestId: animarRequestId || null,
    audioReaproveitado: Boolean(audioPreSintetizado),
  });

  const contexto: ContextoDaNarracao = {
    videoMudoUrl,
    imagemCompostaUrl,
    gastoAcumuladoUsd: 0,
    teto: tetoParaTier(input, segundosTotaisDoRoteiro),
    segundosEstimados,
    duracaoEscolhida,
    composicaoRequestId,
    animarRequestId,
  };

  if (audioPreSintetizado) {
    return sincronizarComAudio(input, contexto, audioPreSintetizado.audioUrl, {
      durationSeconds: audioPreSintetizado.durationSeconds,
    });
  }

  return narrarSincronizar(input, contexto);
}

/**
 * Encerra a corrida numa etapa intermediária, a pedido da sonda.
 *
 * `videoUrl` vazio: quem chamou PEDIU para parar, então "sem vídeo" é o
 * resultado esperado e não uma falha — lançar aqui faria a sonda de contrato
 * parecer erro.
 */
function pararAqui(
  etapa: EtapaDoPipeline,
  gastoPrevistoUsd: number,
  // A duração já estava DECIDIDA (`conferirRoteiro`, no início da corrida)
  // mesmo quando a corrida para antes de usá-la — por isso é sempre
  // conhecida aqui, nunca opcional.
  duracaoEscolhida: PipelineDuration,
  // O que a corrida CHEGOU a produzir antes de parar. Sem isto, parar em
  // `compor` devolveria o mesmo objeto vazio de não ter feito nada — e o
  // ponteiro para o trabalho já pago (`request_id`) morreria no retorno.
  produzido: {
    imagemCompostaUrl?: string | null;
    /** O vídeo mudo, quando a parada é em `animar` ou depois dele. */
    videoMudoUrl?: string | null;
    requestIds?: FalPipelineResult["requestIds"];
    /**
     * V33, item 2 — a URL do áudio JÁ SINTETIZADO, quando a corrida narrou
     * antes de parar em `animar` (caminho de tomada única). `undefined`/
     * ausente em todo outro caso — comportamento de antes desta rodada.
     */
    audioUrl?: string | null;
    /** A duração REAL medida do mesmo áudio — acompanha `audioUrl` sempre junto. */
    audioDurationSeconds?: number | null;
  } = {},
): FalPipelineResult {
  logEvent("info", "fal_pipeline_parou_a_pedido", {
    etapa,
    gastoPrevistoUsd,
    imagemCompostaUrl: produzido.imagemCompostaUrl ?? null,
    videoMudoUrl: produzido.videoMudoUrl ?? null,
  });
  return {
    gastoPrevistoUsd,
    videoUrl: "",
    imagemCompostaUrl: produzido.imagemCompostaUrl ?? null,
    videoMudoUrl: produzido.videoMudoUrl ?? null,
    audioDurationSeconds: produzido.audioDurationSeconds ?? null,
    duracaoSegundos: duracaoEscolhida,
    audioUrl: produzido.audioUrl ?? null,
    requestIds: produzido.requestIds ?? { compor: "", animar: "", sincronizar: "" },
  };
}

/** Id de corrida, para o diário de produção. */
export function novoRunId(): string {
  return randomUUID();
}
