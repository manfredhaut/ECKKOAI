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
import { MAX_SCRIPT_SECONDS } from "../video/scriptDuration.js";

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
 * TETO EM DÓLARES do caminho de custo CONHECIDO (hoje, só HeyGen — ver
 * `costFor` acima) — T2, 22/08/2026.
 *
 * IRMÃ pequena de `PIPELINE_TETO_USD`/`PIPELINE_TETO_USD_PREMIUM`, e não a
 * MESMA função: o pipeline da fal soma várias etapas pagas de UMA corrida
 * (compor → animar → sincronizar), e por isso `autorizarGasto`
 * (falPipeline.ts) recebe um ACUMULADO. O caminho HeyGen tem uma etapa paga
 * só — `POST /v3/videos`, sem passos intermediários — então não há o que
 * acumular: a pergunta é sempre "este vídeo, sozinho, custaria mais que o
 * teto?".
 *
 * Não recusa por VENDOR (nunca `if (vendor === "heygen")`): recusa quando
 * `costFor` devolve um custo CONHECIDO acima do teto, e fica muda quando não
 * há medição — a mesma decisão que `costFor` já toma para a TELA
 * (`/video-cost-estimate`: mostrar ausência, nunca inventar zero nem
 * bloquear às cegas). Hoje só HeyGen tem `known: true`; se outro vendor
 * ganhar medição própria no futuro, este teto passa a valer para ele
 * automaticamente, sem precisar ser editado.
 *
 * O pipeline fal segue com o SEU freio (`autorizarGasto`), inalterado — os
 * dois nunca se sobrepõem: `costFor` devolve `known:false` para `fal`
 * (nenhuma medição própria ainda), então este teto nunca opina sobre ele.
 */
export const HEYGEN_TETO_USD_ENV = "HEYGEN_TETO_USD";

/**
 * DEFAULT DERIVADO, nunca digitado: o PIOR CASO que a régua de duração já
 * permite hoje — `MAX_SCRIPT_SECONDS` (o teto de recusa global, 180 s) ×
 * `USD_PER_BILLED_SECOND` (US$ 0,05/s, medido). Um vídeo dentro do teto de
 * duração NUNCA deveria bater neste teto de dólar — ele existe para o dia em
 * que a régua de duração for contornada (defeito, não uso normal), não para
 * apertar geração comum.
 */
export const DEFAULT_HEYGEN_TETO_USD = round(MAX_SCRIPT_SECONDS * USD_PER_BILLED_SECOND, 2);

/** O teto em vigor. Mesma regra de sempre: ausente ou inválido cai no default. */
export function heygenSpendCapUsd(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[HEYGEN_TETO_USD_ENV];
  if (!raw) return DEFAULT_HEYGEN_TETO_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HEYGEN_TETO_USD;
}

export class HeygenSpendCapExceededError extends Error {
  constructor(
    readonly estimatedUsd: number,
    readonly capUsd: number,
  ) {
    super(
      `TETO DE GASTO: esta geração custaria aproximadamente US$ ${estimatedUsd.toFixed(2)}, acima do ` +
        `teto de US$ ${capUsd.toFixed(2)}. Nada foi pedido ao fornecedor — a recusa acontece antes do ` +
        `débito de crédito. Para seguir, defina ${HEYGEN_TETO_USD_ENV} no ambiente com um valor maior.`,
    );
    this.name = "HeygenSpendCapExceededError";
  }
}

/**
 * O PORTEIRO. Roda ANTES do débito e antes de qualquer chamada — mesmo
 * princípio de `assertDailyGenerationBudget`/`withLiveBudget`: uma recusa
 * depois de gastar é relatório, não freio.
 */
export function assertHeygenSpendBudget(
  estimatedSeconds: number,
  vendor: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const cost = estimateVideoCost(estimatedSeconds, vendor);
  if (!cost.known) return;
  const cap = heygenSpendCapUsd(env);
  if (cost.usd > cap) {
    throw new HeygenSpendCapExceededError(cost.usd, cap);
  }
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
   *
   * ⚠️ **Motor do tier "Premium" (pesquisado, NÃO ligado): Seedance 2.5.**
   * O BLOCO SEEDANCE-1 (21/08) mediu, por leitura de doc pública, que
   * `bytedance/seedance-2.5/reference-to-video` **NÃO cobra por segundo** —
   * cobra por TOKEN. Fórmula verbatim: *"tokens = (output_height ×
   * output_width × (input_video_duration + output_duration) × 24) / 1024"*,
   * tarifa *"$0.0214 per 1000 tokens"* —
   * <https://fal.ai/models/bytedance/seedance-2.5/reference-to-video>.
   * Aplicando para 720p sem vídeo de entrada, 10 s de saída: tokens =
   * (720 × 1280 × 10 × 24) ÷ 1024 = 216.000 → **US$ 4,6224 para 10 s** →
   * **~US$ 0,462/s — ~18,5× este número.** NÃO VERIFICADO por chamada real
   * nem por fusível. Revertido em 21/08 (decisão de produto: Wan é o motor
   * do tier "Normal"); a conversão fica registrada aqui para quando o tier
   * "Premium" for implementado, com teto de gasto PRÓPRIO em vez do
   * `PIPELINE_TETO_USD` global abaixo — reusar o teto global recusaria a
   * etapa `animar` do Premium antes de qualquer chamada, como aconteceu
   * durante o BLOCO SEEDANCE-1.
   */
  animarUsdPorSegundo: 0.025,
  /** por segundo de ÁUDIO, `sync-lipsync/v2` — o áudio é que define a duração */
  sincronizarUsdPorSegundoDeAudio: 0.05,
} as const;

/**
 * O CUSTO do motor Premium (Seedance 2.5), por CLIPE — não por segundo.
 *
 * ⚠️ **DOCUMENTADO (não MEDIDO), NÃO VERIFICADO por chamada real nem por
 * fusível.** Fórmula verbatim do BLOCO SEEDANCE-1 (21/08), citada em
 * `PRECOS_FAL.animarUsdPorSegundo` acima:
 * *"tokens = (output_height × output_width × (input_video_duration +
 * output_duration) × 24) / 1024"*, tarifa *"$0.0214 per 1000 tokens"* —
 * <https://fal.ai/models/bytedance/seedance-2.5/reference-to-video>.
 *
 * `input_video_duration = 0`: este pipeline anima a partir de UMA imagem
 * (`image_urls` com um elemento), nunca de um vídeo de referência — não há
 * `reference-to-video` de verdade aqui, só o nome do endpoint. Resolução
 * fixada em 720×1280 (mesma de `RESOLUCAO_VIDEO`/`720p`, para comparar
 * como o Wan compara).
 *
 * Função, e não uma tarifa por segundo em `PRECOS_FAL`, porque o preço NÃO É
 * linear na duração por essa fórmula — é (na prática, com `input=0`) — mas
 * fica como função porque a UNIDADE (tokens) é discreta e amarrada à
 * resolução, ao contrário de `animarUsdPorSegundo`, que é de fato uma
 * tarifa por segundo.
 */
export function custoSeedanceUsd(duracaoSegundosDeSaida: number): number {
  const ALTURA = 720;
  const LARGURA = 1280;
  const TARIFA_POR_1000_TOKENS = 0.0214;
  const tokens = (ALTURA * LARGURA * duracaoSegundosDeSaida * 24) / 1024;
  return (tokens / 1000) * TARIFA_POR_1000_TOKENS;
}

/**
 * TETO DURO de uma corrida do pipeline da fal, em dólares.
 *
 * Não é preço: é o freio. Vive junto dos preços porque só faz sentido lido ao
 * lado deles.
 *
 * Dimensionado para o Wan (tier "Normal"): o pior caso da corrida inteira é
 * ~US$ 0,77 (compor US$ 0,08 + animar até 15s×US$0,025 + sincronizar), bem
 * dentro dos US$ 2,00.
 *
 * ⚠️ O tier "Premium" (Seedance 2.5) usa `PIPELINE_TETO_USD_PREMIUM` abaixo,
 * não este — o preço por segundo dele é ~18,5× maior, e reusar este mesmo
 * teto recusaria a etapa `animar` do Premium antes de qualquer chamada, que
 * foi exatamente o que aconteceu no BLOCO SEEDANCE-1 (21/08), quando o
 * Seedance ainda usava este teto global.
 */
export const PIPELINE_TETO_USD = 2.0;

/**
 * TETO PRÓPRIO do tier "Premium" (Seedance 2.5) — BLOCO A, 21/08.
 *
 * Dimensionado para o PIOR CASO de `animar` + `sincronizar` — não de
 * `compor`, que continua sob `PIPELINE_TETO_USD` fixo (custa sempre
 * US$ 0,08, tier nenhum muda isso; ver o comentário de `tetoParaTier` em
 * falPipeline.ts): `animar` o clipe mais longo (15 s, `custoSeedanceUsd(15)`
 * ≈ US$ 6,93) + `sincronizar` até ~13,04 s de fala (`0,05 × 13,04` ≈
 * US$ 0,65) ≈ **US$ 7,58 no pior caso**. Fixado em US$ 10,00 para dar margem sem
 * abrir o freio de propósito — a mesma folga proporcional que
 * `PIPELINE_TETO_USD` tem sobre o pior caso do Wan (US$ 0,77 contra
 * US$ 2,00, ~2,6×; aqui US$ 7,58 contra US$ 10,00, ~1,3×: menor de
 * propósito, porque o motor Premium é caro o bastante para que uma folga
 * generosa custe caro se o teto nunca vier a barrar nada).
 *
 * ⚠️ NÃO VERIFICADO por chamada real: nem o preço-base (`custoSeedanceUsd`)
 * nem este teto foram provados contra o fornecedor. Ver o mesmo aviso em
 * `custoSeedanceUsd`.
 */
export const PIPELINE_TETO_USD_PREMIUM = 10.0;
