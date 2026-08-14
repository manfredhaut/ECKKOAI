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
 * ---------------------------------------------------------------------------
 * A UNIDADE DE COBRANÇA É O SEGUNDO INTEIRO, NÃO O SEGUNDO FRACIONÁRIO
 *
 * Esta é a correção do bloco 5E, e ela nasce de três medições que já estavam
 * registradas neste projeto sem que ninguém tivesse tentado a conta certa. A
 * taxa anterior — US$ 0,045/s — vinha de dividir o dólar gasto pela duração
 * FRACIONÁRIA do arquivo. Essa divisão produzia um número diferente a cada
 * medição (2,67 · 2,83 · 2,94 unidades por segundo), e o registro do 4A
 * chamava a diferença de "arredondamento por bloco, NÃO medido".
 *
 * Não era bloco: era truncagem. O fornecedor cobra 3 unidades por segundo
 * INTEIRO, descartando a fração. Com essa regra as três medições fecham
 * exatas, e é por isso que ela substitui a média:
 *
 *   duração entregue   truncada   ×3    unidades MEDIDAS
 *      3,372 s            3        9          9   ✓
 *     16,972 s           16       48         48   ✓
 *     33,696 s           33       99         99   ✓
 *
 * Sobre a duração fracionária, a mesma taxa daria 10,12 · 50,92 · 101,09 —
 * nenhuma delas bate. Três pontos exatos, com durações de ordem bem diferente,
 * e nenhum ajuste livre: a regra tem um parâmetro só (3 unidades por segundo) e
 * ele é o mesmo nos três.
 * ---------------------------------------------------------------------------
 *
 * ┌─ O QUE É MEDIDO ────────────────────────────────────────────────────────┐
 * │ · 60 unidades de quota por dólar. Dois pares carteira/quota, ambos 60,0:│
 * │     930/15,50 = 60,0   e   921/15,35 = 60,0                             │
 * │ · As três durações e as três contagens de unidades da tabela acima,     │
 * │   cada duração por `ffprobe` no arquivo baixado, cada contagem pela     │
 * │   diferença de `remaining_quota` na mesma passada.                      │
 * │ · Que 16:9 e 9:16 cobram a MESMA taxa: a passada de 02/08 saiu em 9:16  │
 * │   e fechou nos mesmos 3 un/s das duas em 16:9.                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE É DEDUZIDO ──────────────────────────────────────────────────────┐
 * │ Que a unidade de cobrança é o segundo inteiro truncado, a 3 unidades    │
 * │ cada. É a única regra de um parâmetro que fecha exata nos três pontos,  │
 * │ e ela concorda com a tabela pública do fornecedor, que anuncia          │
 * │ US$ 0,05/s para avatar de foto — exatamente 3/60. Ainda assim é         │
 * │ DEDUÇÃO: o fornecedor não declara a unidade em nenhuma resposta, e a    │
 * │ concordância com a tabela pública não é o mesmo que a fatura confirmar. │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE NÃO FOI VERIFICADO ──────────────────────────────────────────────┐
 * │ · Contra FATURA. Nenhuma fatura do fornecedor foi lida em nenhuma       │
 * │   sessão; toda a medição vem de saldo e quota lidos pela API.           │
 * │ · Vídeo com menos de 1 segundo. As três medições têm 3 s ou mais, e a   │
 * │   regra truncada prevê custo ZERO abaixo de 1 s. Isso nunca foi         │
 * │   observado, e é o único ponto onde esta conta pode devolver zero por   │
 * │   um caminho medido — se aparecer na tela, é um caso a investigar, não  │
 * │   uma cortesia do fornecedor.                                           │
 * │ · Se 1080p ou 4k custam mais. A doc pública diz que 720p e 1080p têm    │
 * │   preço idêntico (a tarifa é por segundo e por tipo de avatar, não por  │
 * │   pixel), mas nenhuma geração nossa saiu fora de 720p.                  │
 * │ · Qualquer custo de voz (ElevenLabs) ou de roteiro: nunca foram         │
 * │   medidos, e por isso este módulo devolve AUSÊNCIA para eles, nunca     │
 * │   zero.                                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

/**
 * A medição, num objeto só. Mexer aqui muda todo custo exibido no produto —
 * que é exatamente a propriedade desejada.
 *
 * Note que NÃO há um campo "dólares por segundo": ele é derivado logo abaixo.
 * Guardar os dois lado a lado permitiria que divergissem, e a divergência entre
 * duas cópias da mesma medição é o defeito original que este arquivo existe
 * para eliminar — só que desta vez dentro do próprio arquivo.
 */
export const HEYGEN_VIDEO_COST = {
  /** Unidades de `remaining_quota` por dólar. Dois pares medidos, ambos 60,0. */
  unitsPerDollar: 60,
  /**
   * Unidades cobradas por segundo INTEIRO de vídeo entregue. Fecha exato nas
   * três medições; ver a tabela no cabeçalho.
   */
  unitsPerBilledSecond: 3,
  /** Sob que condições isto foi medido. A UI mostra esta ressalva. */
  measuredUnder: { vendor: "heygen", aspectRatio: "16:9 e 9:16", resolution: "720p" },
  measuredOn: "2026-08-01 e 2026-08-02",
  /** Como foi medido, em uma linha — vai para a tela, não só para o log. */
  method:
    "três gerações reais (3,372 s → 9 unidades, 16,972 s → 48, 33,696 s → 99), " +
    "com a duração por ffprobe no arquivo baixado e as unidades pela variação de remaining_quota",
} as const;

/**
 * Dólares por segundo INTEIRO cobrado. DERIVADO, nunca digitado.
 *
 * Se este número fosse uma constante própria, alguém poderia mudar
 * `unitsPerBilledSecond` e deixar o dólar para trás — e a tela passaria a
 * mostrar um preço que não corresponde a nenhuma medição.
 */
export const USD_PER_BILLED_SECOND =
  HEYGEN_VIDEO_COST.unitsPerBilledSecond / HEYGEN_VIDEO_COST.unitsPerDollar;

/**
 * Segundos COBRADOS a partir dos segundos ENTREGUES.
 *
 * A truncagem é a regra medida, e ela precisa viver numa função própria porque
 * é o ponto exato onde o erro anterior acontecia: multiplicar a taxa pela
 * duração fracionária parece mais preciso e é justamente o que não bate com
 * nenhuma das três medições.
 *
 * Entrada inválida ou negativa devolve 0 em vez de propagar `NaN`: um `NaN`
 * atravessaria as comparações todas como falso e apareceria na tela como
 * "US$ NaN", que é pior que um zero honesto.
 */
export function billedSecondsFor(deliveredSeconds: number): number {
  if (!Number.isFinite(deliveredSeconds) || deliveredSeconds <= 0) return 0;
  return Math.floor(deliveredSeconds);
}

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
  /**
   * Segundos que o fornecedor de fato cobra, depois da truncagem. Fica ao lado
   * do dólar para a tela poder explicar por que 16,97 s custaram 16 s — sem
   * isso, a diferença parece erro de arredondamento nosso.
   */
  billedSeconds: number;
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
    const billedSeconds = billedSecondsFor(input.unitCount);
    return {
      known: true,
      usd: round(billedSeconds * USD_PER_BILLED_SECOND, 4),
      // Contagem exata, e não reconstruída a partir do dólar: as unidades são
      // o que o fornecedor de fato debita, e o dólar é que sai delas.
      vendorUnits: billedSeconds * HEYGEN_VIDEO_COST.unitsPerBilledSecond,
      billedSeconds,
    };
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

/**
 * Custo de UM look (traje) gerado por prompt. MEDIDO, não estimado.
 *
 * Medição de 06/08, conta real, um único POST /v3/avatars type=prompt sobre o
 * look do avatar do Mário:
 *
 *   remaining_quota  660 → 600   (−60 unidades)
 *   wallet         11,00 → 10,00 (−US$ 1,00)
 *
 * As duas leituras foram tiradas imediatamente antes e imediatamente depois do
 * HTTP 200, e repetidas depois de o look ficar `completed`: **não mudaram**. O
 * débito acontece no ACEITE, e não na conclusão — o que importa para o estorno:
 * uma vez que o fornecedor devolveu 200, o dinheiro saiu, mesmo que a imagem
 * fique ruim. Não há o que devolver depois disso.
 *
 * 60 unidades por dólar é a mesma razão medida para vídeo, agora confirmada
 * numa operação de natureza diferente — o que reforça que a régua é da conta, e
 * não do tipo de trabalho.
 *
 * Um look custa o mesmo que 20 segundos de vídeo cobrados (60 ÷ 3). É caro para
 * um botão: por isso o número aparece na tela ANTES da confirmação, e não
 * depois, no extrato.
 */
export const HEYGEN_LOOK_COST = {
  units: 60,
  usd: 1.0,
  measuredOn: "2026-08-06",
  method:
    "um POST /v3/avatars type=prompt na conta real: remaining_quota 660 → 600 e wallet 11,00 → 10,00, " +
    "lidos imediatamente antes e depois do 200 e reconferidos após o look ficar completed",
} as const;

export interface CostDifference {
  usd: number;
  factor: number | null;
}

/**
 * A diferença entre o que se estimou e o que se pagou — quando ela SIGNIFICA
 * alguma coisa.
 *
 * Duas condições, e a segunda é a que este bloco acrescenta:
 *
 *  1. Os dois lados existem. Calcular contra `null` produz um número que parece
 *     medida e é aritmética com ausência.
 *  2. A geração NÃO é simulada. Em `fixture` a duração entregue é constante,
 *     produzida pelo simulador — comparar a estimativa contra ela não mede o
 *     erro da estimativa, mede o simulador. Uma linha "a estimativa foi 1,3× o
 *     custo real" ao lado de um vídeo que nunca foi gerado é um número com cara
 *     de aferição e sem nada aferido, e é exatamente o tipo de número que já
 *     passou semanas nesta tela sendo lido como fato.
 *
 * A regra vive AQUI e não na tela, num lugar só: `VideoCostPanel` já esconde a
 * linha quando `difference` é `null`, e repetir a condição no componente criaria
 * duas ideias do mesmo fato — que é a família de defeito que este projeto
 * persegue. A estimativa e o custo real continuam visíveis nos dois modos.
 */
export function costDifference(input: {
  simulated: boolean;
  actualUsd: number | null;
  estimateUsd: number | null;
}): CostDifference | null {
  if (input.simulated) return null;
  if (input.actualUsd == null || input.estimateUsd == null) return null;
  return {
    usd: Number((input.actualUsd - input.estimateUsd).toFixed(4)),
    factor: input.actualUsd > 0 ? Number((input.estimateUsd / input.actualUsd).toFixed(2)) : null,
  };
}

/** Ressalva que acompanha toda estimativa na tela. */
export function costBasisNote(): string {
  const { aspectRatio, resolution } = HEYGEN_VIDEO_COST.measuredUnder;
  return (
    `Estimativa baseada em medições reais (${HEYGEN_VIDEO_COST.measuredOn}): ` +
    `${HEYGEN_VIDEO_COST.method}. A cobrança é por segundo inteiro — a fração do último segundo ` +
    `não é cobrada. As medições são em ${aspectRatio} / ${resolution}; ` +
    "resoluções maiores nunca foram medidas por nós, embora o fornecedor documente preço igual " +
    "para 720p e 1080p."
  );
}

function round(value: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round(value * f) / f;
}

/**
 * PREÇOS DE LISTA DA FAL, por etapa do pipeline.
 *
 * ⚠️ **DOCUMENTADO, não MEDIDO.** Vieram do painel da fal em 13/08 e nenhuma
 * fatura foi conferida contra eles. A distinção importa aqui mais que em
 * qualquer outro número deste arquivo: `HEYGEN_VIDEO_COST` tem quatro medições
 * exatas atrás dele, e estes três não têm nenhuma.
 *
 * Servem ao TETO, não à cobrança do cliente — a régua por camada é o BLOCO 6.
 * Aqui eles respondem uma pergunta só: "o que a PRÓXIMA etapa vai custar, no
 * pior caso?", que é o que permite recusar antes de gastar. A fal não expõe
 * endpoint de saldo, então não há como perguntar quanto ainda resta.
 *
 * Moram aqui, e não no orquestrador, porque a guarda de custo cobra que todo
 * número de dinheiro viva neste arquivo: duas cópias de uma medição divergem em
 * silêncio, e o produto passa a ter duas verdades sobre dinheiro.
 */
export const PRECOS_FAL = {
  /** por imagem, `nano-banana-2/edit` */
  comporUsd: 0.08,
  /**
   * Por segundo de vídeo gerado, `wan/v2.6/image-to-video/flash` 720p, COM
   * `generate_audio: false` — que é o que este pipeline sempre manda.
   *
   * ⚠️ **DOCUMENTADO (não MEDIDO), com URL — corrigido em 14/08 (ENDPOINTS-3),
   * o valor anterior (0,10) era o preço do tier PADRÃO (não-flash) do Wan, não
   * o do flash com áudio mudo.** Citação verbatim da doc:
   * <https://fal.ai/models/wan/v2.6/image-to-video/flash/api> — "Audio video
   * (generate_audio=True, default) is billed at half the standard I2V rate;
   * silent video (generate_audio=False) at 25%." O "standard I2V rate" é
   * US$ 0,10/s a 720p (tier não-flash, `wan/v2.6/reference-to-video`
   * <https://fal.ai/models/wan/v2.6/reference-to-video/api>) — as duas
   * porcentagens (50% e 25%) são do MESMO número-base, não uma da outra.
   * `0,10 × 0,25 = 0,025`.
   */
  animarUsdPorSegundo: 0.025,
  /** por segundo de ÁUDIO, `sync-lipsync/v2` — o áudio é que define a duração */
  sincronizarUsdPorSegundoDeAudio: 0.05,
} as const;

/**
 * TETO DURO de uma corrida do pipeline da fal, em dólares.
 *
 * Não é preço: é o freio. Vive junto dos preços porque só faz sentido lido ao
 * lado deles.
 */
export const PIPELINE_TETO_USD = 2.0;
