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
 */

/**
 * As únicas durações que o `wan/v2.6/image-to-video/flash` aceita.
 *
 * MEDIDO por leitura do schema do fornecedor (BUSARELLOT-DURACAO-1, 20/08):
 * `duration` é `DurationEnum`, tipo STRING, valores `"5"`, `"10"` ou `"15"`,
 * default `"5"` — <https://fal.ai/models/wan/v2.6/image-to-video/flash/api>,
 * citação verbatim: *"Duration of the generated video in seconds. Choose
 * between 5, 10 or 15 seconds."* **Reconfirmado ao vivo em 28/08/2026**
 * (`WebFetch` na mesma URL, mesma citação exata) antes de começar o
 * fracionamento — ver `docs-internal/plano-fracoes-2026-08-28.md`.
 */
export const PIPELINE_DURATION_OPTIONS = [5, 10, 15] as const;
export type PipelineDuration = (typeof PIPELINE_DURATION_OPTIONS)[number];

/** A maior opção — o teto de UM bloco, sem emenda de clipes dentro dele. */
export const PIPELINE_DURACAO_MAXIMA: PipelineDuration =
  PIPELINE_DURATION_OPTIONS[PIPELINE_DURATION_OPTIONS.length - 1];

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
 * O teto de caracteres, POR DURAÇÃO — DERIVADO, nunca digitado.
 *
 *   5 s → floor( 5 × 10,89 ÷ 1,1436) =  47 caracteres
 *  10 s → floor(10 × 10,89 ÷ 1,1436) =  95 caracteres
 *  15 s → floor(15 × 10,89 ÷ 1,1436) = 142 caracteres
 */
export const PIPELINE_MAX_CHARS_POR_DURACAO: Record<PipelineDuration, number> = Object.fromEntries(
  PIPELINE_DURATION_OPTIONS.map((duracao) => [
    duracao,
    Math.floor((duracao * PIPELINE_CHARS_PER_SECOND) / (1 + PIPELINE_RITMO_DISPERSAO)),
  ]),
) as Record<PipelineDuration, number>;

/** O maior teto de caracteres de UM bloco — o da maior duração disponível. */
export const PIPELINE_MAX_CHARS: number = PIPELINE_MAX_CHARS_POR_DURACAO[PIPELINE_DURACAO_MAXIMA];

/**
 * A MENOR duração de `PIPELINE_DURATION_OPTIONS` que comporta `chars`
 * caracteres — pela régua pessimista de `PIPELINE_MAX_CHARS_POR_DURACAO`.
 * `null` quando nem a maior (15 s) comporta.
 */
export function escolherDuracao(chars: number): PipelineDuration | null {
  for (const duracao of PIPELINE_DURATION_OPTIONS) {
    if (chars <= PIPELINE_MAX_CHARS_POR_DURACAO[duracao]) return duracao;
  }
  return null;
}
