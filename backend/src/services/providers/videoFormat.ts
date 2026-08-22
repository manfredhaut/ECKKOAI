/**
 * Formato do vídeo gerado: proporção e resolução, derivadas da PLATAFORMA de
 * publicação escolhida pelo cliente.
 *
 * Por que isto existe: até este bloco, `POST /v3/videos` levava três campos —
 * `type`, `avatar_id`, `audio_asset_id` — e mais nada. O vídeo saía 1280×720
 * 16:9 porque esse é o padrão da conta na HeyGen, não porque alguém tivesse
 * escolhido. "Padrão do fornecedor" é uma decisão de produto tomada por
 * omissão, e ela vinha sendo tomada por um terceiro que não sabe onde o vídeo
 * vai ser publicado.
 *
 * A escolha do cliente é a PLATAFORMA, não a proporção. Ninguém abre a
 * ferramenta querendo "9:16" — quer publicar no Reels. A proporção é
 * consequência, e mantê-la como consequência é o que impede a tela de virar um
 * formulário de especificação técnica.
 *
 * FONTE ÚNICA. O frontend espelha este catálogo em `publishPlatforms.ts` (mesmo
 * padrão de `vendorCatalog.ts`), e `npm run check` reprova o build se os dois
 * divergirem — duas listas de plataformas que discordam produziriam uma tela
 * oferecendo um destino que o servidor recusa.
 */

/**
 * Proporções que a HeyGen documenta para `POST /v3/videos`.
 *
 * DOCUMENTADO pelo fornecedor (doc pública, duas fontes concordantes), NUNCA
 * exercitado por nós: nenhuma geração enviou `aspect_ratio` até hoje. O
 * fornecedor também documenta `5:4` e `auto`; ficaram de fora porque nenhuma
 * plataforma do catálogo pede — oferecer um valor que ninguém escolhe só
 * aumenta a superfície do que teria de ser verificado em live.
 */
export const HEYGEN_ASPECT_RATIOS = ["16:9", "9:16", "4:5", "1:1"] as const;
export type AspectRatio = (typeof HEYGEN_ASPECT_RATIOS)[number];

/**
 * Resoluções que a HeyGen documenta. Também DOCUMENTADO e não exercitado.
 */
export const HEYGEN_RESOLUTIONS = ["720p", "1080p", "4k"] as const;
export type VideoResolution = (typeof HEYGEN_RESOLUTIONS)[number];

/**
 * Resolução usada em todas as plataformas, por ora: 720p.
 *
 * Não é preguiça, é o único ponto de custo MEDIDO. A passada live do LIVE-1
 * saiu em 1280×720 (o servidor escolheu, já que não mandamos nada) e custou
 * ~US$ 0,045 por segundo. Subir para 1080p mudaria o custo por um fator que
 * ninguém mediu, num saldo que comporta poucas gerações. Explicitar o que já
 * era o comportamento observado mantém o custo no ponto conhecido e ainda
 * assim tira a decisão das mãos do fornecedor.
 *
 * Quando houver medição de 1080p, isto vira campo por plataforma — a estrutura
 * já comporta, cada entrada declara a sua.
 */
const MEASURED_RESOLUTION: VideoResolution = "720p";

export interface PublishPlatform {
  id: string;
  /** Rótulo em pt-BR; a UI traduz pelo id, este é a retaguarda. */
  label: string;
  aspectRatio: AspectRatio;
  resolution: VideoResolution;
}

/**
 * Plataformas de publicação oferecidas ao cliente.
 *
 * A lista é curta de propósito: cada entrada é uma proporção que teria de ser
 * conferida em live, e prometer seis destinos verificando um seria pior que
 * oferecer quatro.
 */
export const PUBLISH_PLATFORMS = [
  { id: "youtube", label: "YouTube (horizontal)", aspectRatio: "16:9", resolution: MEASURED_RESOLUTION },
  { id: "reels_tiktok", label: "Reels, TikTok, Shorts e Facebook Reels (vertical)", aspectRatio: "9:16", resolution: MEASURED_RESOLUTION },
  // ---------------------------------------------------------------------
  // 4:5 REINTRODUZIDO em 19/08, só para o feed do Instagram (Facebook segue
  // fora — não foi pedido, e reintroduzir os dois juntos por simetria seria
  // reabrir mais risco do que o testado cobre).
  //
  // O 40% de barra sólida medido no DEMO-2 (vídeo de 05/08, sonda `padded`,
  // conteúdo 720×540 num quadro 720×900) era da HeyGen — o único vendor que
  // gerava vídeo naquela época. Este catálogo é POR PLATAFORMA, não por
  // vendor: a mesma lista aparece para qualquer provedor conectado, e nada
  // aqui restringe uma proporção a um vendor específico (quem filtra
  // tudo-ou-nada é `vendorFormatSupport`, em `PublishStep.tsx`).
  //
  // ⚠️ CONSEQUÊNCIA NÃO RESOLVIDA: reoferecer 4:5 também o reoferece para
  // tenants na HeyGen, cujo defeito de 40% de barra NUNCA foi corrigido —
  // só evitado removendo a opção. Nenhuma geração HeyGen com 4:5 rodou desde
  // então; o defeito é DEDUZIDO como ainda presente, não medido de novo.
  //
  // Do lado da fal: MEDIDO em 19/08 que `aspect_ratio` enviado a `compor()`
  // sobrevive até o vídeo final para 9:16 (vídeo real, 716×1284, ffprobe).
  // Para 4:5 especificamente isto é NÃO VERIFICADO — o mecanismo (compor
  // decide a proporção, animar herda) é o mesmo, mas nenhuma chamada real
  // testou 4:5 ainda.
  // ---------------------------------------------------------------------
  { id: "instagram_feed", label: "Feed do Instagram (retrato)", aspectRatio: "4:5", resolution: MEASURED_RESOLUTION },
  { id: "linkedin", label: "LinkedIn e feed quadrado", aspectRatio: "1:1", resolution: MEASURED_RESOLUTION },
] as const satisfies readonly PublishPlatform[];

export type PublishPlatformId = (typeof PUBLISH_PLATFORMS)[number]["id"];

/**
 * Padrão quando o cliente não escolheu.
 *
 * É o YouTube (16:9) porque é exatamente o que a conta já entregava por
 * omissão — o padrão novo reproduz o comportamento antigo, e assim a mudança
 * de formato só acontece quando alguém decide, nunca por atualizar o código.
 */
export const DEFAULT_PUBLISH_PLATFORM: PublishPlatformId = "youtube";

export interface VideoFormat {
  platform: PublishPlatformId;
  aspectRatio: AspectRatio;
  resolution: VideoResolution;
}

export function isPublishPlatform(value: unknown): value is PublishPlatformId {
  return PUBLISH_PLATFORMS.some((p) => p.id === value);
}

/**
 * Plataforma → formato. NUNCA devolve indefinido.
 *
 * Entrada desconhecida cai no padrão em vez de propagar `undefined`: um formato
 * ausente lá na frente vira omissão no payload, que é exatamente o defeito que
 * este arquivo existe para eliminar. Uma plataforma que sumiu do catálogo tem
 * de degradar para uma escolha declarada, não para "o fornecedor decide".
 */
export function resolveVideoFormat(platform: unknown): VideoFormat {
  const id = isPublishPlatform(platform) ? platform : DEFAULT_PUBLISH_PLATFORM;
  const entry = PUBLISH_PLATFORMS.find((p) => p.id === id)!;
  return { platform: entry.id, aspectRatio: entry.aspectRatio, resolution: entry.resolution };
}

/**
 * Um vendor de avatar aceita formato explícito?
 *
 * Registro obrigatório, no mesmo espírito do de feature flags: quem acrescentar
 * um vendor tem de DECIDIR sobre formato, e a decisão fica escrita com o
 * motivo. Sem isso, um vendor novo herdaria em silêncio o defeito que este
 * bloco corrige — o fornecedor escolhendo a proporção sozinho.
 *
 * `npm run check` reprova o build se um vendor do catálogo não estiver aqui.
 */
/**
 * O que SUSTENTA a declaração de suporte, em ordem crescente de força.
 *
 * O campo existe porque "supported: true" sozinho é indistinguível de um
 * palpite bem escrito. Separar a afirmação da evidência é o que permite a
 * guarda cobrar a diferença — e é o que impede a UI de prometer entrega quando
 * a base é só documentação.
 *
 * `vendor_response` é o único nível que autoriza afirmar que FUNCIONA, e
 * **nenhum vendor está nele hoje**: nenhuma geração nossa enviou formato.
 */
export type FormatEvidence =
  /** Uma resposta real do fornecedor confirmou. Ninguém está aqui ainda. */
  | "vendor_response"
  /** A documentação pública descreve o campo. Não é o mesmo que ter funcionado. */
  | "documentation"
  /** Nada sustenta. Declarar suporte com isto é proibido pelo gate. */
  | "none";

export const VENDOR_FORMAT_SUPPORT = {
  heygen: {
    supported: true,
    evidence: "documentation" as FormatEvidence,
    reason:
      "POST /v3/videos documenta `aspect_ratio` e `resolution`; os dois vão em toda geração. " +
      "DOCUMENTADO pelo fornecedor, ainda NÃO confirmado por resposta real — nenhuma geração live enviou formato.",
  },
  did: {
    supported: false,
    evidence: "none" as FormatEvidence,
    reason:
      "Não há campo de proporção documentado em POST /talks: a geometria da D-ID sai da imagem de origem. " +
      "Nenhuma resposta real da D-ID foi observada em nenhuma sessão, então inventar um campo seria pior " +
      "que declarar a limitação — a proporção pedida pelo cliente é gravada mesmo assim, e fica visível " +
      "que o vendor não a honrou.",
  },
  fal: {
    supported: true,
    evidence: "vendor_response" as FormatEvidence,
    reason:
      "MEDIDO em 19/08/2026 por chamada real (compor request_id 01a01af0-74b7-7730-b636-79a460f84362, " +
      "animar request_id 01a01af0-9e38-7050-8249-e8a0cd28032b): `aspect_ratio: \"9:16\"` enviado só à " +
      "composição (`fal-ai/nano-banana-2/edit`) produziu vídeo final 716×1284 (ffprobe, medição " +
      "independente do que o fornecedor autodeclarou) — a foto de entrada era 640×480 (4:3, paisagem), " +
      "então a proporção do vídeo não veio dela, veio do `aspect_ratio` pedido. O Wan " +
      "(`wan/v2.6/image-to-video/flash`, motor do tier \"Normal\") não recebe o campo e não precisa: " +
      "preserva o formato da imagem composta que já chega pronta. UMA medição, uma proporção (9:16) — " +
      "16:9, 1:1 e 4:5 seguem NÃO VERIFICADOS por chamada real, mas o mecanismo (compor decide, animar " +
      "herda) já estava confirmado — PARA O WAN. O Seedance 2.5 (pesquisado no BLOCO SEEDANCE-1, 21/08, " +
      "reservado pro tier \"Premium\" — não ligado) TEM `aspect_ratio` no schema de `animar()`, diferente " +
      "do Wan; o tier Premium vai precisar mandar o campo explícito também nessa etapa quando for " +
      "implementado.",
  },
} as const;

export type VendorFormatSupportId = keyof typeof VENDOR_FORMAT_SUPPORT;

export function vendorAcceptsFormat(vendor: string): boolean {
  return VENDOR_FORMAT_SUPPORT[vendor as VendorFormatSupportId]?.supported === true;
}

/**
 * O que a TELA precisa saber para não prometer o que o vendor não entrega.
 *
 * Vendor desconhecido devolve `supported: false` com motivo próprio: um vendor
 * que não está no registro é justamente o caso em que não se sabe nada, e o
 * padrão silencioso ali seria prometer.
 */
export function vendorFormatSupport(vendor: string | null | undefined): {
  vendor: string | null;
  supported: boolean;
  evidence: FormatEvidence;
  reason: string;
} {
  const entry = VENDOR_FORMAT_SUPPORT[vendor as VendorFormatSupportId];
  if (!entry) {
    return {
      vendor: vendor ?? null,
      supported: false,
      evidence: "none",
      reason:
        "O provedor de vídeo conectado não está no registro de suporte a formato, então não há como " +
        "afirmar que ele respeita a proporção escolhida. A escolha continua sendo gravada.",
    };
  }
  return { vendor: vendor ?? null, supported: entry.supported, evidence: entry.evidence, reason: entry.reason };
}

/**
 * O nível de confiança REAL de cada proporção, POR TIER — não por vendor
 * sozinho. `VENDOR_FORMAT_SUPPORT.fal` é grosso demais para isto: ele diz
 * "vendor_response" para o vendor fal inteiro, mas a única chamada real
 * mediu 9:16 no MOTOR DO TIER NORMAL (Wan/nano-banana) — 16:9, 4:5 e 1:1
 * seguem sem nenhuma chamada real, e o tier Premium (Seedance) não tem
 * NENHUMA proporção medida.
 *
 * Fonte de cada linha, verificada por leitura de código nesta mesma sessão:
 *  · simples (HeyGen) — `HEYGEN_ASPECT_RATIOS` bate com as 4 proporções do
 *    catálogo; DOCUMENTADO (doc pública), nenhuma geração enviou o campo
 *    ainda (`VENDOR_FORMAT_SUPPORT.heygen`, acima).
 *  · normal (Wan) — a proporção só é enviada a `compor()`
 *    (`fal-ai/nano-banana-2/edit`); o Wan não tem campo de proporção no
 *    schema e herda o que a composição produziu
 *    (`falPipeline.ts`, comentário de `aspectRatio` em `FalPipelineInput`).
 *    Medido por chamada real SÓ para 9:16 (`VENDOR_FORMAT_SUPPORT.fal`,
 *    acima); as outras três nunca foram tentadas, e não há doc pública do
 *    nano-banana citada neste repositório — "unverified", não "documented".
 *  · premium (Seedance) — `corpoAnimarSeedance` ENVIA `aspect_ratio`
 *    diretamente (diferente do Wan), mas o comentário do próprio código
 *    (`falPipeline.ts`, `ENDPOINT_ANIMAR_PREMIUM`) registra que isso nunca
 *    foi testado por fusível nem por chamada real, para proporção nenhuma.
 */
export type FormatConfidenceLevel = "vendor_response" | "documentation" | "unverified";

const CONFIANCA_SIMPLES: Record<AspectRatio, FormatConfidenceLevel> = {
  "16:9": "documentation",
  "9:16": "documentation",
  "4:5": "documentation",
  "1:1": "documentation",
};

const CONFIANCA_NORMAL: Record<AspectRatio, FormatConfidenceLevel> = {
  "16:9": "unverified",
  "9:16": "vendor_response",
  "4:5": "unverified",
  "1:1": "unverified",
};

const CONFIANCA_PREMIUM: Record<AspectRatio, FormatConfidenceLevel> = {
  "16:9": "unverified",
  "9:16": "unverified",
  "4:5": "unverified",
  "1:1": "unverified",
};

/**
 * `"simples" | "normal" | "premium"` sem importar de `falPipeline.ts`: esse
 * arquivo já importa `AspectRatio` DAQUI (type-only), e fechar o ciclo pelo
 * lado de `VideoTier` não ganha nada — é um literal de três strings.
 */
export type FormatConfidenceTier = "simples" | "normal" | "premium";

const FORMAT_CONFIDENCE_BY_TIER: Record<FormatConfidenceTier, Record<AspectRatio, FormatConfidenceLevel>> = {
  simples: CONFIANCA_SIMPLES,
  normal: CONFIANCA_NORMAL,
  premium: CONFIANCA_PREMIUM,
};

/**
 * O nível de confiança da proporção `aspectRatio` NO TIER `tier` — nunca
 * bloqueia, só informa. Ver a tabela acima para a origem de cada valor.
 */
export function formatConfidenceForTier(
  tier: FormatConfidenceTier,
  aspectRatio: AspectRatio,
): FormatConfidenceLevel {
  return FORMAT_CONFIDENCE_BY_TIER[tier][aspectRatio];
}

export function isFormatConfidenceTier(value: unknown): value is FormatConfidenceTier {
  return value === "simples" || value === "normal" || value === "premium";
}
