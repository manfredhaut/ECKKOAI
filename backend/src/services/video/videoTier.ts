/**
 * O ROTEAMENTO POR TIER — os TRÊS níveis de produto, e qual VENDOR cada um exige.
 *
 * EXTRAÍDO de `falPipeline.ts` no BLOCO HEYGEN-SIMPLES-1 (02-03/09/2026), pela
 * MESMA razão que já tirou `pipelineDuration.ts` de lá em 28/08: aquele
 * arquivo é o pipeline da fal (Normal/Premium), e `vendorRequiredByTier` —
 * a função que decide "simples é HeyGen; normal/premium são fal" — não é
 * lógica do pipeline fal, é o roteamento que decide se o pipeline fal é
 * alcançado OU NÃO. Ela precisava viver num lugar que o caminho do Simples
 * pudesse importar sem, por isso, importar o orquestrador fal inteiro (cinco
 * etapas pagas, `autorizarGasto`, `PIPELINE_TETO_USD_PREMIUM` etc.) — o tipo
 * de acoplamento que o BLOCO HEYGEN-SIMPLES-1 exige mapear e evitar antes de
 * tocar em qualquer coisa do nível Simples.
 *
 * REEXPORTADO em `falPipeline.ts`, byte a byte no NOME e no VALOR — nenhum
 * import externo (`routes/videos.ts`, `avatarProvider.ts`, as guardas)
 * precisa saber que o endereço mudou. Ver a prova B-ISO do commit que criou
 * este arquivo: a mesma geração do tier Normal, em fixture, produz o MESMO
 * payload/roteamento/custo estimado antes e depois desta extração.
 */
import type { AvatarVendor } from "../providers/vendorCatalog.js";
import { HEYGEN_MAX_SCRIPT_CHARS, estimateSecondsFromChars } from "./scriptDuration.js";
import { NORMAL_MAX_TARGET_SECONDS } from "./scriptFractioning.js";
import { PREMIUM_DURACAO_MAXIMA } from "./pipelineDuration.js";

/**
 * O NÍVEL que o pipeline da fal conhece — só os dois que ele sabe animar.
 *
 * `"simples"` (HeyGen) não aparece aqui: o pipeline da fal (`falPipeline.ts`)
 * só é alcançado por "normal"/"premium" — ver `routes/videos.ts`, onde o
 * despacho por VENDOR (heygen/did/fal) é decidido por `vendorRequiredByTier`
 * abaixo, e só dentro do vendor "fal" é que `tier_video` escolhe o MOTOR.
 *
 * Default `"normal"` em todo lugar que recebe isto opcionalmente: é o único
 * tier que já tinha motor funcionando (Wan) antes do BLOCO A, e é o
 * comportamento que toda corrida anterior a ele teve sem ter escolhido nada.
 */
export type PipelineTier = "normal" | "premium";

/**
 * O NÍVEL DE PRODUTO inteiro — os TRÊS, `"simples"` incluído.
 *
 * `PipelineTier` acima é só os dois que o pipeline da fal conhece; `VideoTier`
 * é o que a TELA oferece e o que `videos.tier_video` (migration 058) guarda.
 * `videoTierParaPipeline` faz a ponte: "simples" nunca chega ao orquestrador
 * fal (o vendor heygen não passa por ele), então ele cai no default do
 * orquestrador — o valor é irrelevante na prática, mas precisa ser alguma
 * coisa do tipo para o TypeScript aceitar a chamada.
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
