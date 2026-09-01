/**
 * A RÉGUA DE DURAÇÃO DO PIPELINE DA FAL — extraída de `falPipeline.ts` nesta
 * rodada (BLOCO FRACOES-1, 28/08) para que `scriptFractioning.ts` possa
 * importar estas constantes sem criar um ciclo de import com `falPipeline.ts`
 * (que por sua vez importa `fracionarRoteiro` de `scriptFractioning.ts`).
 *
 * `falPipeline.ts` REEXPORTA tudo daqui — nenhum import externo existente
 * precisa mudar de caminho. Este arquivo é folha: não importa nada de
 * `falPipeline.ts` nem de `scriptFractioning.ts`.
 *
 * Nada do CONTEÚDO mudou nesta extração — só o endereço. Os comentários
 * originais (com a medição do Wan e a derivação do teto de caracteres) vêm
 * junto, porque são a justificativa dos números, não decoração.
 *
 * ┌─ DOIS TETOS, SEPARADOS DESDE 29/08 (migração para reference-to-video) ──┐
 * │ Até aqui havia UM SÓ vocabulário de duração, usado por Normal (Wan) e   │
 * │ Premium (Seedance) ao mesmo tempo — `conferirRoteiro` (bloco único,      │
 * │ Premium) e `fracionarRoteiro`/`conferirRoteiroENormal` (Normal)          │
 * │ liam a MESMA `PIPELINE_DURATION_OPTIONS`. A migração do motor Normal     │
 * │ para `wan/v2.6/reference-to-video/flash` (item 2) apertou o teto DELE    │
 * │ de 15s para 10s (MEDIDO por schema) — encolher o vocabulário            │
 * │ COMPARTILHADO encolheria também o teto do Premium, que usa um endpoint   │
 * │ TOTALMENTE diferente (Seedance, faixa contínua "4-30s" documentada,     │
 * │ nunca teve essa restrição). Por isso agora são DOIS conjuntos: o de      │
 * │ NORMAL (`PIPELINE_*`, apertado para 5/10s) e o de PREMIUM               │
 * │ (`PREMIUM_*`, preservado em 5/10/15s — o comportamento de ANTES desta    │
 * │ rodada, intocado).                                                       │
 * └────────────────────────────────────────────────────────────────────────┘
 */

/** `duracao × PIPELINE_CHARS_PER_SECOND ÷ (1 + PIPELINE_RITMO_DISPERSAO)`, sem arredondar para cima. */
function charsParaDuracao(segundos: number): number {
  return Math.floor((segundos * PIPELINE_CHARS_PER_SECOND) / (1 + PIPELINE_RITMO_DISPERSAO));
}

/**
 * As únicas durações que `wan/v2.6/reference-to-video/flash` aceita — tier
 * NORMAL.
 *
 * MUDOU nesta rodada (migração de `image-to-video/flash` para
 * `reference-to-video/flash`, item 2). O endpoint ANTERIOR aceitava 5/10/15
 * (MEDIDO em 20/08, ver histórico do git) — o NOVO aceita só **5 ou 10**,
 * LIDO por `WebFetch` em 29/08: *"R2V Flash supports only 5 or 10 seconds."*
 * <https://fal.ai/models/wan/v2.6/reference-to-video/flash/api>. `"15"`
 * enviado a este endpoint é erro de schema (fora do enum).
 *
 * `NORMAL_MAX_BLOCOS` (scriptFractioning.ts) compensou o bloco menor: 12
 * blocos de até 10s, não mais 8 de até 15s — o mesmo teto de 120s do tier
 * Normal, preservado.
 */
export const PIPELINE_DURATION_OPTIONS = [5, 10] as const;

/**
 * As durações que o teto de UM BLOCO do tier PREMIUM (Seedance) aceita.
 *
 * PRESERVADO EXATAMENTE como o vocabulário único era antes desta rodada —
 * Seedance nunca teve teto de 10s; `corpoAnimarSeedance` manda `duration`
 * NÚMERO (não string) para uma faixa contínua "4-30s" documentada (ver
 * `ENDPOINT_ANIMAR_PREMIUM`, falPipeline.ts). 15 aqui é o mesmo valor
 * histórico do Wan antigo, mantido como teto conservador do Premium — não é
 * o teto REAL do Seedance (que aceita mais), só o que este produto já
 * autorizava antes de a migração do Normal apertar o do Wan.
 */
export const PREMIUM_DURATION_OPTIONS = [5, 10, 15] as const;

/**
 * ALARGADO para `number` puro em 01/09/2026 (V33, migração do tier Normal
 * para Wan 3.0) — até aqui era a união estreita `5|10|10|15` dos dois
 * vocabulários abaixo. O caminho novo de tomada única (roteiros com até 30s
 * estimados, ver `LIMITE_TAKE_UNICO_SEGUNDOS` em `falPipeline.ts`) deriva a
 * duração do ÁUDIO REAL medido (`Math.ceil(fala.durationSeconds) + margem`),
 * um inteiro qualquer que a união antiga não comportava. Os dois
 * vocabulários (`PIPELINE_DURATION_OPTIONS`/`PREMIUM_DURATION_OPTIONS`) e
 * `escolherDuracao`/`escolherDuracaoPremium` continuam emitindo só os
 * valores de sempre — nada no caminho fracionado (>30s) muda de
 * comportamento por este alargamento, só passa a aceitar um vizinho novo.
 */
export type PipelineDuration = number;

/**
 * A maior opção do tier Normal — o teto de UM bloco Wan, sem emenda de
 * clipes dentro dele.
 *
 * TIPADA pelo array de ORIGEM (`(typeof PIPELINE_DURATION_OPTIONS)[number]`),
 * não pelo `PipelineDuration` amplo (que inclui o 15 do Premium) — é essa
 * tipagem estreita que permite indexar `PIPELINE_MAX_CHARS_POR_DURACAO`
 * (`Record<5|10, number>`) sem `as` nem `!`: o `tsc` só aceita a chave que o
 * valor pode de fato assumir.
 */
export const PIPELINE_DURACAO_MAXIMA: (typeof PIPELINE_DURATION_OPTIONS)[number] =
  PIPELINE_DURATION_OPTIONS[PIPELINE_DURATION_OPTIONS.length - 1];

/** A maior opção do tier Premium — o teto de UM bloco Seedance (Premium nunca fraciona). */
export const PREMIUM_DURACAO_MAXIMA: (typeof PREMIUM_DURATION_OPTIONS)[number] =
  PREMIUM_DURATION_OPTIONS[PREMIUM_DURATION_OPTIONS.length - 1];

/**
 * 10,89 caracteres por segundo.
 *
 * NÃO é a `CHARS_PER_SECOND` de `scriptDuration.ts` (12,8151) e NÃO se
 * mistura com `VOICE_SPEED` (0,85). Não arredondar: 10,89 é o valor.
 */
export const PIPELINE_CHARS_PER_SECOND = 10.89;

/**
 * A DISPERSÃO do ritmo, 14,36%.
 *
 * NÃO VERIFICADO NESTE REPOSITÓRIO — ver o comentário original em
 * `falPipeline.ts` (histórico do git) para a proveniência completa.
 */
export const PIPELINE_RITMO_DISPERSAO = 0.1436;

/**
 * O teto de caracteres, POR DURAÇÃO do tier NORMAL — DERIVADO, nunca digitado.
 *
 *   5 s → floor( 5 × 10,89 ÷ 1,1436) =  47 caracteres
 *  10 s → floor(10 × 10,89 ÷ 1,1436) =  95 caracteres
 */
export const PIPELINE_MAX_CHARS_POR_DURACAO: Record<(typeof PIPELINE_DURATION_OPTIONS)[number], number> =
  Object.fromEntries(PIPELINE_DURATION_OPTIONS.map((duracao) => [duracao, charsParaDuracao(duracao)])) as Record<
    (typeof PIPELINE_DURATION_OPTIONS)[number],
    number
  >;

/**
 * O teto de caracteres, POR DURAÇÃO do tier PREMIUM — mesma fórmula,
 * vocabulário de duração PRÓPRIO (`PREMIUM_DURATION_OPTIONS`).
 *
 *  15 s → floor(15 × 10,89 ÷ 1,1436) = 142 caracteres
 */
export const PREMIUM_MAX_CHARS_POR_DURACAO: Record<(typeof PREMIUM_DURATION_OPTIONS)[number], number> =
  Object.fromEntries(PREMIUM_DURATION_OPTIONS.map((duracao) => [duracao, charsParaDuracao(duracao)])) as Record<
    (typeof PREMIUM_DURATION_OPTIONS)[number],
    number
  >;

/** O maior teto de caracteres de UM bloco Normal — o da maior duração Wan disponível (10s). */
export const PIPELINE_MAX_CHARS: number = PIPELINE_MAX_CHARS_POR_DURACAO[PIPELINE_DURACAO_MAXIMA];

/** O maior teto de caracteres de UM bloco Premium — o da maior duração Seedance autorizada (15s). */
export const PREMIUM_MAX_CHARS: number = PREMIUM_MAX_CHARS_POR_DURACAO[PREMIUM_DURACAO_MAXIMA];

/**
 * A MENOR duração de `PIPELINE_DURATION_OPTIONS` (tier NORMAL/Wan) que
 * comporta `chars` caracteres — pela régua pessimista de
 * `PIPELINE_MAX_CHARS_POR_DURACAO`. `null` quando nem a maior (10 s) comporta.
 */
export function escolherDuracao(chars: number): PipelineDuration | null {
  for (const duracao of PIPELINE_DURATION_OPTIONS) {
    if (chars <= PIPELINE_MAX_CHARS_POR_DURACAO[duracao]) return duracao;
  }
  return null;
}

/**
 * O EQUIVALENTE de `escolherDuracao`, para o teto de UM bloco do tier
 * PREMIUM (Seedance) — usado só por `conferirRoteiro` (bloco único, nunca
 * fraciona). `null` quando nem a maior (15 s) comporta.
 */
export function escolherDuracaoPremium(chars: number): PipelineDuration | null {
  for (const duracao of PREMIUM_DURATION_OPTIONS) {
    if (chars <= PREMIUM_MAX_CHARS_POR_DURACAO[duracao]) return duracao;
  }
  return null;
}
