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
import { falPoll, falResult, falSubmit, falUpload } from "../providers/falClient.js";
import { synthesizeSpeech } from "../providers/voiceProvider.js";
import { logEvent } from "../log/safeLog.js";
import { PIPELINE_TETO_USD, PIPELINE_TETO_USD_PREMIUM, PRECOS_FAL, custoSeedanceUsd } from "../billing/providerCost.js";
import type { AspectRatio } from "../providers/videoFormat.js";
import type { AvatarVendor } from "../providers/vendorCatalog.js";

// ---------------------------------------------------------------------------
// A RÉGUA DESTE PIPELINE — separada da do caminho HeyGen, DE PROPÓSITO
// ---------------------------------------------------------------------------

/**
 * As únicas durações que o `wan/v2.6/image-to-video/flash` aceita.
 *
 * MEDIDO por leitura do schema do fornecedor (BUSARELLOT-DURACAO-1, 20/08):
 * `duration` é `DurationEnum`, tipo STRING, valores `"5"`, `"10"` ou `"15"`,
 * default `"5"` — <https://fal.ai/models/wan/v2.6/image-to-video/flash/api>,
 * citação verbatim: *"Duration of the generated video in seconds. Choose
 * between 5, 10 or 15 seconds."* Não há emenda de clipes: um roteiro que
 * exija mais de 15 s é RECUSADO, não esticado. Ver `escolherDuracao`.
 *
 * ⚠️ O Seedance 2.5 (pesquisado no BLOCO SEEDANCE-1, 21/08, tier "Premium")
 * documenta `duration` como FAIXA contínua `4-30`, não um enum fechado — se
 * o motor do Premium um dia usar isso, `PIPELINE_DURATION_OPTIONS` deixa de
 * ser o teto do fornecedor e passa a ser puramente nosso. Não é o caso hoje.
 */
export const PIPELINE_DURATION_OPTIONS = [5, 10, 15] as const;
export type PipelineDuration = (typeof PIPELINE_DURATION_OPTIONS)[number];

/** A maior opção — o teto absoluto desta fase, sem emenda de clipes. */
export const PIPELINE_DURACAO_MAXIMA: PipelineDuration =
  PIPELINE_DURATION_OPTIONS[PIPELINE_DURATION_OPTIONS.length - 1];

/**
 * 10,89 caracteres por segundo.
 *
 * ⚠️ **NÃO É a `CHARS_PER_SECOND` de `scriptDuration.ts` (12,8151) e NÃO se
 * mistura com `VOICE_SPEED` (0,85).** Aquela régua tem DOIS fatores e foi
 * derivada de uma geração da HeyGen a velocidade 1.0; esta é o número desta
 * fase, de um fator só. Multiplicar uma pela outra, ou "recalibrar" uma com o
 * fator da outra, produz um terceiro número que não descreve caminho nenhum —
 * é o erro que a anotação de `VOICE_SPEED` já teve de impedir uma vez.
 *
 * Não arredondar: 10,89 é o valor, não uma aproximação de 11.
 */
export const PIPELINE_CHARS_PER_SECOND = 10.89;

/**
 * A DISPERSÃO do ritmo, 14,36%.
 *
 * ⚠️ **NÃO VERIFICADO NESTE REPOSITÓRIO.** O número foi FIXADO no desenho do
 * B0+B1 e é o que o teto abaixo consome; a medição que o produziu não está
 * registrada aqui, e nenhuma tabela deste projeto a reproduz — as seis
 * gerações do caminho HeyGen (CLAUDE.md) dispersam ~12%, sobre outra régua.
 * Fica declarado e nomeado justamente para que a origem possa ser cobrada
 * depois: um `95` solto não teria onde pendurar a dúvida.
 */
export const PIPELINE_RITMO_DISPERSAO = 0.1436;

/**
 * O teto de caracteres, POR DURAÇÃO — DERIVADO, nunca digitado.
 *
 * `floor(duração × 10,89 car/s ÷ 1,1436)`. O divisor é a dispersão acima: o
 * teto é o que cabe no clipe **no pior caso do ritmo**, não no ritmo médio.
 * Dividir (e não multiplicar por 0,8564) é o que descreve o caso ruim: se a
 * voz sair 14,36% mais LENTA, o texto ainda cabe na duração escolhida.
 *
 * A derivação é a razão de ser desta linha. Um literal continuaria parecendo
 * certo depois de `PIPELINE_DURATION_OPTIONS` ou `PIPELINE_CHARS_PER_SECOND`
 * mudarem — e o defeito só apareceria na etapa 4, com a imagem e o vídeo já
 * pagos. É o mesmo motivo pelo qual `maxScriptChars()` do caminho HeyGen é uma
 * função e não o número 1960.
 *
 *   5 s → floor( 5 × 10,89 ÷ 1,1436) =  47 caracteres (fala até ~4,32 s)
 *  10 s → floor(10 × 10,89 ÷ 1,1436) =  95 caracteres (fala até ~8,72 s)
 *  15 s → floor(15 × 10,89 ÷ 1,1436) = 142 caracteres (fala até ~13,04 s)
 */
export const PIPELINE_MAX_CHARS_POR_DURACAO: Record<PipelineDuration, number> = Object.fromEntries(
  PIPELINE_DURATION_OPTIONS.map((duracao) => [
    duracao,
    Math.floor((duracao * PIPELINE_CHARS_PER_SECOND) / (1 + PIPELINE_RITMO_DISPERSAO)),
  ]),
) as Record<PipelineDuration, number>;

/** O maior teto de caracteres desta fase — o da maior duração disponível. */
export const PIPELINE_MAX_CHARS: number = PIPELINE_MAX_CHARS_POR_DURACAO[PIPELINE_DURACAO_MAXIMA];

/**
 * A MENOR duração de `PIPELINE_DURATION_OPTIONS` que comporta o roteiro —
 * pela mesma régua pessimista de `PIPELINE_MAX_CHARS_POR_DURACAO`. `null`
 * quando nem a maior (15 s) comporta: este pipeline não emenda clipes, então
 * um roteiro longo demais é RECUSADO, não esticado. Ver `conferirRoteiro`.
 */
export function escolherDuracao(chars: number): PipelineDuration | null {
  for (const duracao of PIPELINE_DURATION_OPTIONS) {
    if (chars <= PIPELINE_MAX_CHARS_POR_DURACAO[duracao]) return duracao;
  }
  return null;
}

// Os preços e o teto vivem em `billing/providerCost.ts`: a guarda de custo
// cobra que todo número de dinheiro more lá, e duas cópias de uma medição
// divergem em silêncio.
export { PRECOS_FAL, PIPELINE_TETO_USD, PIPELINE_TETO_USD_PREMIUM, custoSeedanceUsd } from "../billing/providerCost.js";

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

/** Teto do laço de polling. Ver `aguardarConclusao`. */
export const PIPELINE_POLL_TIMEOUT_MS = 300_000;

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
  "wan/v2.6/image-to-video/flash": [
    "generate_audio",
    "resolution",
    "duration",
    "enable_prompt_expansion",
    "multi_shots",
  ],
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
 * cruza o rosto. Em INGLÊS, porque `promptDeDirecao` chega aqui já traduzido
 * (`directionTranslation.ts`, na rota) — concatenar em português produziria
 * um prompt bilíngue que o Seedance nunca viu.
 */
export const DIRECAO_CAMERA_FIXA =
  "camera locked and fixed, no zoom, no pan, no camera movement of any kind — only the character moves";
export const DIRECAO_GESTOS_CONTIDOS = "short, contained gestures kept at chest height";
export const DIRECAO_MAO_NAO_CRUZA_ROSTO =
  "the hand never crosses in front of the face at any point in the clip";

/**
 * A quarta correção, de pele — mesma POC. Em PORTUGUÊS: `promptDeComposicao`
 * nunca passa por `directionTranslation.ts` (só a direção é traduzida; ver o
 * cabeçalho daquele arquivo), então concatenar em inglês misturaria os dois
 * idiomas no mesmo campo, na ordem inversa do problema acima.
 */
export const COMPOSICAO_PELE_ATENUACAO_LEVE =
  "pele com atenuação leve de textura, suavização sutil e realista, preservando a identidade — sem retoque agressivo";

/**
 * Aplicadas AQUI, no orquestrador, e não em quem monta `promptDeComposicao` /
 * `promptDeDirecao` (`avatarProvider.ts`, `routes/videos.ts`) — porque este é
 * o ÚNICO lugar por onde todo pedido converge antes de custar dinheiro:
 * criação (`runFalPipeline`), retomada pós-aprovação (`runFalPipelineDaImagem`)
 * e a sonda (`probeFalPipeline.ts`) chamam todas `etapaNaFal` por baixo. Uma
 * regra concatenada no CALL SITE, em vez de aqui, teria de ser copiada em cada
 * um dos três — e é copiar-em-cada-lugar que já produziu drift antes neste
 * mesmo arquivo (ver `promptDaComposicaoDaLinha` em `routes/videos.ts`).
 *
 * SEMPRE concatenam, mesmo com o texto da pessoa vazio: a regra de câmera e a
 * de pele não dependem de a pessoa ter escrito nada — são default do sistema,
 * não complemento de uma instrução.
 */
export function comDefaultsDeComposicao(promptDaPessoa: string): string {
  return [promptDaPessoa.trim(), COMPOSICAO_PELE_ATENUACAO_LEVE].filter(Boolean).join(". ");
}

export function comDefaultsDeDirecao(promptDaPessoa: string): string {
  return [promptDaPessoa.trim(), DIRECAO_CAMERA_FIXA, DIRECAO_GESTOS_CONTIDOS, DIRECAO_MAO_NAO_CRUZA_ROSTO]
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
 */
export const ENDPOINT_ANIMAR = "wan/v2.6/image-to-video/flash";

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

/** A do clipe. `720p` NÃO VERIFICADO no Wan — só o vocabulário do nano foi medido. */
export const RESOLUCAO_VIDEO = "720p";

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
  /** Abre a etapa. Devolve um id opaco usado nas gravações seguintes. */
  abrirEtapa(etapa: EtapaDoPipeline, ordem: number, vendor: string, endpointId: string | null): Promise<string>;
  /** O PONTEIRO para o trabalho pago. Chamado antes de qualquer interpretação. */
  gravarRequestId(stepId: string, requestId: string): Promise<void>;
  /** O corpo BRUTO, antes de qualquer parsing. */
  gravarRespostaCrua(stepId: string, raw: string): Promise<void>;
  fecharEtapa(stepId: string, status: "completed" | "failed", motivo?: string): Promise<void>;
}

export class FalPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FalPipelineError";
  }
}

/** Uma imagem de entrada da composição, já em bytes. Ver `entradasExtras`. */
export interface EntradaDeComposicao {
  /** Aparece no diário e no log. Não vai ao fornecedor. */
  rotulo: "rosto" | "traje" | "cenario";
  bytes: Buffer;
  mimeType: string;
}

export interface FalPipelineInput {
  apiKeyFal: string;
  apiKeyElevenLabs: string;
  /** Reusado, nunca clonado: clonar consome slot irreversível. */
  voiceId: string;
  script: string;
  /** A foto do rosto, já em bytes. */
  fotoBase: Buffer;
  fotoMimeType: string;
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
   * Teto de gasto PREVISTO. Default: `PIPELINE_TETO_USD` para o tier
   * "normal", `PIPELINE_TETO_USD_PREMIUM` para o "premium" — ver `tier`
   * acima. Passar isto explícito SOBRESCREVE a escolha por tier; hoje só a
   * guarda faz isso.
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
  requestIds: { compor: string; animar: string; sincronizar: string };
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * O TETO desta corrida, pelo `tier` — BLOCO A.
 *
 * `input.tetoDeGastoUsd` explícito sempre vence (hoje só a guarda o usa). Sem
 * ele, o tier decide: `PIPELINE_TETO_USD_PREMIUM` para "premium",
 * `PIPELINE_TETO_USD` (o default de sempre) para "normal" — inclusive
 * quando `tier` não foi passado, que é o comportamento de toda corrida
 * anterior ao BLOCO A.
 *
 * Aplicado a partir de `animar` (via `contexto.teto`, dentro de
 * `animarNarrarSincronizar`) — NÃO na etapa `compor` de `runFalPipeline`,
 * que continua sob `PIPELINE_TETO_USD` fixo. Isso é seguro porque `compor`
 * custa sempre US$ 0,08 (mesmo preço em qualquer tier): o teto ali nunca
 * precisou saber de tier, e só a partir de `animar` os preços divergem o
 * bastante (Wan × Seedance, ~18,5×) para o teto importar. Manter `compor`
 * no teto fixo também preserva as guardas que já ancoravam aquela linha
 * antes do BLOCO A — ver `checkFalGenerationPathPolicy.ts`.
 */
function tetoParaTier(input: Pick<FalPipelineInput, "tetoDeGastoUsd" | "tier">): number {
  if (input.tetoDeGastoUsd !== undefined) return input.tetoDeGastoUsd;
  return input.tier === "premium" ? PIPELINE_TETO_USD_PREMIUM : PIPELINE_TETO_USD;
}

/**
 * O roteiro cabe em alguma das três durações — e em qual delas?
 *
 * Escolhe a MENOR de `PIPELINE_DURATION_OPTIONS` que comporta o texto
 * (`escolherDuracao`) e recusa ANTES de qualquer chamada quando nem a maior
 * (15 s) comporta: um roteiro grande demais só se descobriria na etapa 4, com
 * a imagem e o vídeo já pagos. Este pipeline não emenda clipes — a recusa é a
 * fronteira, não uma etapa a mais.
 */
export function conferirRoteiro(
  script: string,
): { chars: number; segundosEstimados: number; duracaoEscolhida: PipelineDuration } {
  const chars = script.length;
  const duracaoEscolhida = escolherDuracao(chars);
  if (duracaoEscolhida === null) {
    const segundosNecessarios = (chars / PIPELINE_CHARS_PER_SECOND) * (1 + PIPELINE_RITMO_DISPERSAO);
    throw new FalPipelineError(
      `O roteiro exige ${segundosNecessarios.toFixed(1)} s no pior caso do ritmo (${chars} caracteres a ` +
        `${PIPELINE_CHARS_PER_SECOND} car/s, margem de dispersão ${(PIPELINE_RITMO_DISPERSAO * 100).toFixed(2)}%), ` +
        `acima do teto atual de ${PIPELINE_DURACAO_MAXIMA} s por vídeo desta fase. Nada foi pedido a ` +
        "fornecedor nenhum: a recusa acontece antes da primeira chamada paga. Emendar clipes para roteiros " +
        "maiores não existe aqui — é outro bloco, ainda não desenhado.",
    );
  }
  return { chars, segundosEstimados: chars / PIPELINE_CHARS_PER_SECOND, duracaoEscolhida };
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
      throw new FalPipelineError(
        `fal: o teto de ${opcoes.timeoutMs} ms de espera se esgotou em ${statusUrl} depois de ` +
          `${tentativas} leitura(s) de status. O trabalho NÃO foi perdido e NÃO deve ser refeito: ` +
          `ele já foi aceito e já custa, e o request_id ${requestId} está gravado — a recuperação é ` +
          "por ele. Repetir a etapa paga duas vezes pelo mesmo resultado.",
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

async function etapaNaFal(
  input: FalPipelineInput,
  etapa: EtapaDoPipeline,
  ordem: number,
  endpointId: string,
  corpo: Record<string, unknown>,
): Promise<{ requestId: string; saida: any }> {
  const stepId = await input.diario.abrirEtapa(etapa, ordem, "fal", endpointId);

  const { requestId, statusUrl, responseUrl } = await falSubmit(input.apiKeyFal, endpointId, corpo, async (id) => {
    // O PONTEIRO primeiro. `falSubmit` chama isto antes do próprio
    // processamento local dele, e o diário o persiste antes do nosso.
    await input.diario.gravarRequestId(stepId, id);
  });

  await aguardarConclusao(input.apiKeyFal, statusUrl, requestId, {
    timeoutMs: input.pollTimeoutMs ?? PIPELINE_POLL_TIMEOUT_MS,
    intervalMs: input.pollIntervalMs ?? PIPELINE_POLL_INTERVAL_MS,
    esperar: input.esperar ?? dormir,
  });

  const saida = await falResult(input.apiKeyFal, responseUrl);

  // CRU ANTES DE INTERPRETADO. Nenhum campo de `saida` foi lido até aqui.
  await input.diario.gravarRespostaCrua(stepId, JSON.stringify(saida));

  await input.diario.fecharEtapa(stepId, "completed");
  return { requestId, saida };
}

export async function runFalPipeline(input: FalPipelineInput): Promise<FalPipelineResult> {
  const { chars, segundosEstimados, duracaoEscolhida } = conferirRoteiro(input.script);
  logEvent("info", "fal_pipeline_iniciado", {
    chars,
    segundosEstimados,
    duracaoEscolhida,
    charsPerSecond: PIPELINE_CHARS_PER_SECOND,
  });

  // --- 0. PUBLICAR ---------------------------------------------------------
  // Antes do teto, sempre: publicar não custa, e uma falha aqui precisa custar
  // zero em vez de acontecer com a corrida já autorizada. Ver `publicarEntradas`.
  const urlsDasEntradas = await publicarEntradas(input);

  // --- 1. COMPOR -----------------------------------------------------------
  const teto = input.tetoDeGastoUsd ?? PIPELINE_TETO_USD;
  let gastoPrevistoUsd = 0;

  gastoPrevistoUsd = autorizarGasto(gastoPrevistoUsd, PRECOS_FAL.comporUsd, teto, "compor");
  const composicao = await etapaNaFal(input, "compor", 1, ENDPOINT_COMPOR, {
    // FASE 0 — a atenuação de pele vai SEMPRE, mesmo sem traje/cenário por
    // texto. Ver `comDefaultsDeComposicao`.
    prompt: comDefaultsDeComposicao(input.promptDeComposicao),
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

  // O TETO de `animar` em diante é o do TIER, não o de `compor` acima — ver
  // `tetoParaTier`. `compor` custa sempre US$ 0,08, tier nenhum muda isso, e
  // é por isso que o teto ACIMA (fixo, `PIPELINE_TETO_USD`) nunca precisou
  // saber de tier — só a partir daqui o preço diverge o bastante para importar.
  return animarNarrarSincronizar(input, {
    imagemUrl: String(imagemUrl),
    gastoAcumuladoUsd: gastoPrevistoUsd,
    teto: tetoParaTier(input),
    tier: input.tier ?? "normal",
    segundosEstimados,
    duracaoEscolhida,
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
  const { chars, segundosEstimados, duracaoEscolhida } = conferirRoteiro(input.script);
  logEvent("info", "fal_pipeline_retomado", {
    chars,
    segundosEstimados,
    duracaoEscolhida,
    imagemCompostaUrl,
    composicaoRequestId: composicaoRequestId || null,
  });

  return animarNarrarSincronizar(input, {
    imagemUrl: imagemCompostaUrl,
    gastoAcumuladoUsd: 0,
    teto: tetoParaTier(input),
    tier: input.tier ?? "normal",
    segundosEstimados,
    duracaoEscolhida,
    composicaoRequestId,
  });
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
function corpoAnimarWan(
  input: FalPipelineInput,
  imagemUrl: string,
  duracaoEscolhida: PipelineDuration,
): Record<string, unknown> {
  return {
    // A DIREÇÃO, e não a composição. O Wan recebe a imagem pronta em
    // `image_url` — repetir ali a descrição do traje e do cenário seria pedir a
    // ele que redesenhasse o que já está no quadro. O que falta ao Wan é a única
    // coisa que uma imagem parada não carrega: o que a pessoa FAZ. Ver
    // `promptDeDirecao`.
    // FASE 0 — câmera fixa, gesto contido, mão longe do rosto: SEMPRE, mesmo
    // sem Interpretação nenhuma escrita. Ver `comDefaultsDeDirecao`.
    prompt: comDefaultsDeDirecao(input.promptDeDirecao),
    image_url: imagemUrl,
    // `generate_audio: false` é o mais caro de omitir: o default sintetiza uma
    // trilha paga que a etapa 4 descartaria.
    generate_audio: false,
    resolution: RESOLUCAO_VIDEO,
    // STRING, não número — MEDIDO por leitura do schema (`DurationEnum`, ver
    // `PIPELINE_DURATION_OPTIONS`): o fornecedor espera "5"/"10"/"15", não os
    // números. `duracaoEscolhida` é a saída de `escolherDuracao`, sempre um
    // dos três.
    duration: String(duracaoEscolhida),
    // Ver DEFAULTS_NUNCA_HERDADOS: sem eles, o fornecedor reescreve a direção
    // e pode segmentar o clipe em tomadas — os dois aceitos sem erro de schema
    // (MEDIDO em 14/08), então `false` explícito não corre risco de 422.
    enable_prompt_expansion: false,
    multi_shots: false,
  };
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

async function animarNarrarSincronizar(
  input: FalPipelineInput,
  contexto: ContextoDaAnimacao,
): Promise<FalPipelineResult> {
  const { imagemUrl, teto, tier, segundosEstimados, duracaoEscolhida, composicaoRequestId } = contexto;
  let gastoPrevistoUsd = contexto.gastoAcumuladoUsd;

  // O CUSTO e o ENDPOINT dependem do tier — ver `enderecoAnimarParaTier` e
  // `custoSeedanceUsd`. "normal" (Wan) é tarifado por segundo; "premium"
  // (Seedance) é tarifado por CLIPE, pela fórmula de tokens.
  const custoAnimarUsd =
    tier === "premium" ? custoSeedanceUsd(duracaoEscolhida) : PRECOS_FAL.animarUsdPorSegundo * duracaoEscolhida;
  gastoPrevistoUsd = autorizarGasto(gastoPrevistoUsd, custoAnimarUsd, teto, "animar");

  const corpoDeAnimar =
    tier === "premium"
      ? corpoAnimarSeedance(input, imagemUrl, duracaoEscolhida)
      : corpoAnimarWan(input, imagemUrl, duracaoEscolhida);

  const animacao = await etapaNaFal(input, "animar", 2, enderecoAnimarParaTier(tier), corpoDeAnimar);
  const videoMudoUrl = animacao.saida?.video?.url;
  if (!videoMudoUrl) {
    throw new FalPipelineError(
      "fal: a animação concluiu sem devolver vídeo. O corpo bruto está gravado na etapa.",
    );
  }

  // --- PARADA DO MODO B — FASE 2, 21/08 -------------------------------------
  //
  // `pararApos: "animar"` encerra a corrida logo aqui, com o vídeo MUDO
  // gravado e nada de narrar/sincronizar disparado ainda. É o mesmo mecanismo
  // que `pararApos: "compor"` já usa para a aprovação da imagem — ver o
  // comentário equivalente mais acima nesta função — só que um passo adiante:
  // agora é o vídeo animado, sem voz, que espera o clique humano antes das
  // duas etapas mais caras da corrida (narrar + sincronizar).
  if (input.pararApos === "animar") {
    return pararAqui("animar", gastoPrevistoUsd, duracaoEscolhida, {
      imagemCompostaUrl: imagemUrl,
      videoMudoUrl: String(videoMudoUrl),
      requestIds: { compor: composicaoRequestId, animar: animacao.requestId, sincronizar: "" },
    });
  }

  return narrarSincronizar(input, {
    videoMudoUrl: String(videoMudoUrl),
    imagemCompostaUrl: imagemUrl,
    gastoAcumuladoUsd: gastoPrevistoUsd,
    teto,
    segundosEstimados,
    duracaoEscolhida,
    composicaoRequestId,
    animarRequestId: animacao.requestId,
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

/**
 * As etapas 3 a 5 — narrar, sincronizar, guardar. Extraída de
 * `animarNarrarSincronizar` para ter DOIS chamadores, mesma razão pela qual
 * aquela função já tinha sido extraída de `runFalPipeline`: a corrida
 * inteira (que passa por `animar` na mesma chamada) e a retomada pós-
 * aprovação do vídeo MUDO (`runFalPipelineDoVideoMudo`, FASE 2/Modo B), que
 * nunca chama `animar` de novo — ele já rodou e já foi pago numa corrida
 * anterior.
 */
async function narrarSincronizar(
  input: FalPipelineInput,
  contexto: ContextoDaNarracao,
): Promise<FalPipelineResult> {
  const { videoMudoUrl, imagemCompostaUrl, teto, segundosEstimados, duracaoEscolhida, composicaoRequestId, animarRequestId } =
    contexto;
  let gastoPrevistoUsd = contexto.gastoAcumuladoUsd;

  // --- 3. NARRAR -----------------------------------------------------------
  //
  // A voz é REUSADA (`input.voiceId`), nunca clonada: clonar consome um slot
  // irreversível, e a conta já está em 10/10 pela nossa régua.
  const narracaoStep = await input.diario.abrirEtapa("narrar", 3, "elevenlabs", null);
  const fala = await synthesizeSpeech(input.apiKeyElevenLabs, input.voiceId, input.script);
  await input.diario.gravarRespostaCrua(
    narracaoStep,
    JSON.stringify({ bytes: fala.audio.length, durationSeconds: fala.durationSeconds, source: fala.source }),
  );
  await input.diario.fecharEtapa(narracaoStep, "completed");
  const audioUrl = await falUpload(input.apiKeyFal, fala.audio, "audio/mpeg");

  // --- 4. SINCRONIZAR ------------------------------------------------------
  if (input.pararApos === "narrar") {
    return pararAqui("narrar", gastoPrevistoUsd, duracaoEscolhida, {
      imagemCompostaUrl,
      videoMudoUrl,
      requestIds: { compor: composicaoRequestId, animar: animarRequestId, sincronizar: "" },
    });
  }

  // O custo depende da duração REAL do áudio, que agora é conhecida. Quando a
  // medição falha, a estimativa pela régua entra no lugar — e para o TETO ela
  // tem de ser a MAIOR das duas, senão o freio afrouxa justamente no caso em
  // que se sabe menos.
  gastoPrevistoUsd = autorizarGasto(
    gastoPrevistoUsd,
    PRECOS_FAL.sincronizarUsdPorSegundoDeAudio * Math.max(fala.durationSeconds ?? 0, segundosEstimados),
    teto,
    "sincronizar",
  );
  const sincronia = await etapaNaFal(input, "sincronizar", 4, ENDPOINT_SINCRONIZAR, {
    video_url: String(videoMudoUrl),
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

  // --- 5. BIBLIOTECA -------------------------------------------------------
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
    requestIds: {
      compor: composicaoRequestId,
      animar: animarRequestId,
      sincronizar: sincronia.requestId,
    },
  };
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
 */
export async function runFalPipelineDoVideoMudo(
  input: FalPipelineInput,
  videoMudoUrl: string,
  imagemCompostaUrl: string | null,
  /** O `request_id` da composição, quando conhecido. */
  composicaoRequestId = "",
  /** O `request_id` da animação que produziu este vídeo mudo. */
  animarRequestId = "",
): Promise<FalPipelineResult> {
  const { segundosEstimados, duracaoEscolhida } = conferirRoteiro(input.script);
  logEvent("info", "fal_pipeline_retomado_do_video_mudo", {
    segundosEstimados,
    duracaoEscolhida,
    videoMudoUrl,
    composicaoRequestId: composicaoRequestId || null,
    animarRequestId: animarRequestId || null,
  });

  return narrarSincronizar(input, {
    videoMudoUrl,
    imagemCompostaUrl,
    gastoAcumuladoUsd: 0,
    teto: tetoParaTier(input),
    segundosEstimados,
    duracaoEscolhida,
    composicaoRequestId,
    animarRequestId,
  });
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
    audioDurationSeconds: null,
    duracaoSegundos: duracaoEscolhida,
    requestIds: produzido.requestIds ?? { compor: "", animar: "", sincronizar: "" },
  };
}

/** Id de corrida, para o diário de produção. */
export function novoRunId(): string {
  return randomUUID();
}
