/**
 * Espelho de `TARGET_DURATION_OPTIONS`
 * (`backend/src/services/video/scriptDuration.ts`) — os 4 CHIPS da tela.
 *
 * As duas listas têm de concordar: um chip que apareça aqui e não lá seria
 * um botão que promete um teto que o servidor não reconhece da mesma forma.
 * `checkScriptLimitPolicy.ts` reprova o build se as duas divergirem.
 *
 * A 5ª opção da tela, "Mais", NÃO está nesta lista — ela revela um campo
 * numérico livre, e QUALQUER inteiro de 1 a `TARGET_DURATION_MAX_SECONDS`
 * é aceito por `isTargetDurationSeconds()` no servidor, não só os 4 chips.
 */
export const TARGET_DURATION_OPTIONS = [15, 30, 45, 60] as const;

/**
 * Espelho de `MAX_SCRIPT_SECONDS` (`scriptDuration.ts`) — o teto de dinheiro
 * global, e por isso também o teto do campo customizado de "Mais": um alvo
 * maior que o teto global seria um alvo que nunca teto nada, porque o teto
 * de dinheiro recusaria antes dele valer.
 *
 * 600 — E1, 22/08/2026, elevado junto com `MAX_SCRIPT_SECONDS` (era 180).
 * Achado ao mexer nisto: o comentário acima ("as duas listas têm de
 * concordar... checkScriptLimitPolicy.ts reprova o build se divergirem")
 * afirmava uma guarda que não existia — o arquivo nunca era lido pelo
 * check. Corrigido junto: agora existe de verdade.
 */
export const TARGET_DURATION_MAX_SECONDS = 600;

/**
 * Espelho de `NORMAL_MAX_TARGET_SECONDS`
 * (`backend/src/services/video/scriptFractioning.ts`) — ITEM 1 do
 * fechamento do tier Normal, 28/08/2026.
 *
 * O tier Normal fraciona o roteiro em blocos de até 15s
 * (`wan/v2.6/image-to-video/flash`), até 8 blocos — 120s é o teto REAL
 * deste tier, bem menor que os 600s "de dinheiro" que valem para Simples.
 * `checkTargetDurationCapPolicy.ts` reprova o build se as duas constantes
 * divergirem.
 */
export const NORMAL_TARGET_DURATION_MAX_SECONDS = 120;

/** O teto do campo de duração-alvo, PELO TIER. */
export function targetDurationMaxSecondsForTier(tierVideo: "simples" | "normal" | "premium"): number {
  return tierVideo === "normal" ? NORMAL_TARGET_DURATION_MAX_SECONDS : TARGET_DURATION_MAX_SECONDS;
}
