/**
 * Espelho de `TARGET_DURATION_OPTIONS`
 * (`backend/src/services/video/scriptDuration.ts`).
 *
 * As duas listas têm de concordar: um valor que apareça aqui e não lá seria
 * um botão que promete um teto que `isTargetDurationSeconds()` no servidor
 * não reconhece — a escolha cairia silenciosamente em "sem alvo", e a pessoa
 * pensaria que o roteiro está sendo limitado quando não está.
 * `checkScriptLimitPolicy.ts` reprova o build se as duas divergirem.
 */
export const TARGET_DURATION_OPTIONS = [15, 30, 45, 60] as const;
