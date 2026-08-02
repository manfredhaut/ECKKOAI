/**
 * O ÚNICO lugar do sistema com número de custo de fornecedor.
 *
 * Antes disto havia dois: a tabela `provider_cost_rates`, mantida à mão e
 * nunca reconciliada com fatura nenhuma, e a coluna `estimated_cost_cents`,
 * que congelava aquela taxa por linha. O resultado é conhecido e foi medido:
 * uma geração que custou US$ 0,15 apareceu como estimativa calculada sobre a
 * duração PEDIDA (15 s) a uma taxa palpite (US$ 0,03/s) — errado nos dois
 * fatores ao mesmo tempo, e errado de um jeito plausível, que é o pior.
 *
 * Aqui há um número, ele é MEDIDO, e a procedência anda junto dele. Todo o
 * resto do código deriva; `npm run check` reprova quem embutir custo em outro
 * lugar.
 *
 * ┌─ O QUE É MEDIDO ────────────────────────────────────────────────────────┐
 * │ Passada live de 2026-08-01, HeyGen, avatar de foto, 16:9, 720p:         │
 * │                                                                         │
 * │  · carteira 15,50 → 15,35 USD  ⇒  US$ 0,15 por aquela geração           │
 * │  · remaining_quota 930 → 921   ⇒  9 unidades por aquela geração         │
 * │  · ffprobe do arquivo baixado  ⇒  3,372 s de vídeo entregue             │
 * │                                                                         │
 * │  ⇒ 60 unidades por dólar (930/15,50 = 60,0 e 921/15,35 = 60,0)          │
 * │  ⇒ ~US$ 0,045 por segundo de vídeo entregue                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE É DEDUZIDO ──────────────────────────────────────────────────────┐
 * │ Que a razão de 60 unidades/dólar vale fora dos dois pontos medidos. Os  │
 * │ dois fecharam exatos, o que é forte, mas são DOIS pontos — e o          │
 * │ fornecedor não declara a unidade em lugar nenhum da resposta.           │
 * │                                                                         │
 * │ Que o custo por segundo é linear. A medição antiga (33,7 s → 99         │
 * │ unidades = 2,94 un/s) contra a nova (3,372 s → 9 = 2,67 un/s) sugere    │
 * │ arredondamento por bloco, NÃO medido.                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE NÃO FOI VERIFICADO ──────────────────────────────────────────────┐
 * │ Se 9:16, 1:1 ou 4:5 custam o mesmo que 16:9 — nenhuma geração saiu      │
 * │ noutra proporção. Se 1080p ou 4k custam mais. Qualquer custo de voz     │
 * │ (ElevenLabs) ou de roteiro: nunca foram medidos, e por isso este módulo │
 * │ devolve AUSÊNCIA para eles, nunca zero.                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

/**
 * A medição, num objeto só. Mexer aqui muda todo custo exibido no produto —
 * que é exatamente a propriedade desejada.
 */
export const HEYGEN_VIDEO_COST = {
  /** Unidades de `remaining_quota` por dólar. Dois pontos medidos, ambos 60,0. */
  unitsPerDollar: 60,
  /** Dólares por segundo de vídeo ENTREGUE (não pedido). */
  usdPerSecond: 0.045,
  /** Sob que condições isto foi medido. A UI mostra esta ressalva. */
  measuredUnder: { vendor: "heygen", aspectRatio: "16:9", resolution: "720p" },
  measuredOn: "2026-08-01",
  /** Como foi medido, em uma linha — vai para a tela, não só para o log. */
  method: "carteira 15,50→15,35 USD e quota 930→921 numa geração de 3,372 s (ffprobe)",
} as const;

/** Por que não há custo para este consumo. Nunca é zero — zero seria mentira. */
export type CostAbsenceReason =
  /** O provedor/vendor nunca teve custo medido. */
  | "never_measured"
  /** Há medição para o vendor, mas não para esta unidade. */
  | "unit_not_measured";

export interface CostKnown {
  known: true;
  usd: number;
  /** Unidades de cota do fornecedor, quando a razão é conhecida. */
  vendorUnits: number | null;
}

export interface CostUnknown {
  known: false;
  reason: CostAbsenceReason;
  /** Frase pronta para a tela. Ausência tem de ser legível, não um traço mudo. */
  explanation: string;
}

export type Cost = CostKnown | CostUnknown;

const NEVER_MEASURED =
  "Não há custo medido para este provedor. Mostrar zero seria afirmar que foi de graça; " +
  "mostrar uma estimativa seria inventar um número. O custo só aparece depois de uma medição real.";

/**
 * Custo de um consumo. **Devolve ausência, e nunca zero, quando não há
 * medição** — a diferença entre "custou nada" e "não sabemos" é a diferença
 * entre uma tela honesta e uma que mente por omissão.
 */
export function costFor(input: {
  provider: string;
  vendor: string;
  unitType: string;
  unitCount: number;
}): Cost {
  const medido = HEYGEN_VIDEO_COST.measuredUnder;

  if (input.provider === "avatar" && input.vendor === medido.vendor) {
    if (input.unitType !== "seconds") {
      return {
        known: false,
        reason: "unit_not_measured",
        explanation:
          `A medição do ${medido.vendor} é por segundo de vídeo entregue; ` +
          `este consumo está em "${input.unitType}", que nunca foi medido.`,
      };
    }
    const usd = round(input.unitCount * HEYGEN_VIDEO_COST.usdPerSecond, 4);
    return { known: true, usd, vendorUnits: Math.round(usd * HEYGEN_VIDEO_COST.unitsPerDollar) };
  }

  return { known: false, reason: "never_measured", explanation: NEVER_MEASURED };
}

/**
 * Estimativa ANTES de gerar, a partir da duração PEDIDA.
 *
 * Fica separada de `costFor` de propósito, mesmo usando o mesmo número: quem
 * lê o código precisa ver que uma parte é projeção sobre o que o cliente
 * escolheu na tela, e a outra é conta sobre o que o fornecedor entregou. Foi
 * confundir as duas que produziu o erro de 4,5×.
 */
export function estimateVideoCost(requestedSeconds: number, vendor: string): Cost {
  return costFor({ provider: "avatar", vendor, unitType: "seconds", unitCount: requestedSeconds });
}

/** Ressalva que acompanha toda estimativa na tela. */
export function costBasisNote(): string {
  const { aspectRatio, resolution } = HEYGEN_VIDEO_COST.measuredUnder;
  return (
    `Estimativa baseada em uma única medição real (${HEYGEN_VIDEO_COST.measuredOn}): ` +
    `${HEYGEN_VIDEO_COST.method}. A medição é em ${aspectRatio} / ${resolution}; ` +
    "outras proporções e resoluções nunca foram medidas e podem custar diferente."
  );
}

function round(value: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round(value * f) / f;
}
