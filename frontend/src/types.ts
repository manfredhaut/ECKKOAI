/**
 * `awaiting_approval` e `awaiting_approval_video` são EXCLUSIVOS do caminho
 * da fal — os dois pontos de parada do Modo B (FASE 2, migration 059):
 * `awaiting_approval` para depois de `compor` (imagem composta, paga);
 * `awaiting_approval_video` para depois de `animar` (vídeo MUDO, pago,
 * antes de narrar+sincronizar — as duas etapas mais caras). Nenhum dos
 * dois sai sozinho: os dois esperam um clique humano.
 *
 * `cancelled` — P2-3, 22/09/2026: o cliente cancelou uma das duas
 * aprovações acima. TERMINAL, e NUNCA estorna crédito (P5: a plataforma
 * não paga pelo aprendizado do cliente — a etapa paga já rodou nos dois
 * status de onde se cancela). Migration 084.
 */
export type VideoStatus =
  | "queued"
  | "processing"
  | "awaiting_approval"
  | "awaiting_approval_video"
  | "ready"
  | "error"
  | "cancelled";

export interface Avatar {
  id: string;
  name: string;
  provider: string | null;
  photo_urls: string[];
  reference_video_url: string | null;
  voice_id: string | null;
  /**
   * A voz clonada DIRETO na HeyGen — B5/B6, BLOCO HEYGEN-SIMPLES-1
   * (migration 076). Paralela a `voice_id` (sempre ElevenLabs). Presente
   * (não `null`) é o sinal que a tela usa para mostrar os sliders HeyGen
   * (speed/pitch/volume/locale) em vez dos ElevenLabs — ver AvatarSetupStep.
   */
  heygen_voice_id: string | null;
  provider_avatar_id: string | null;
  // ready | processing | unknown | null. Só "processing" impede gerar vídeo;
  // null (avatar antigo) e "unknown" liberam — ver migration 036.
  provider_status: "ready" | "processing" | "unknown" | null;
  audio_treatment_enabled: boolean;
  // Postgres `numeric` columns serialize as strings over JSON — parse with
  // Number(...) before using this in arithmetic or a range input's value.
  audio_treatment_target_lufs: string;
  // Os quatro ajustes de síntese do ElevenLabs — migration 067, 25/08. Os três
  // `numeric` chegam como STRING pelo mesmo motivo do LUFS acima: parse com
  // Number(...) antes de usar num input numérico.
  voice_stability: string;
  voice_similarity_boost: string;
  voice_style: string;
  voice_speaker_boost: boolean;
  /**
   * Os quatro ajustes de voice_settings da HeyGen — migration 077, B6. Só
   * têm efeito quando `heygen_voice_id` existe. `numeric` chega como
   * STRING pelo mesmo motivo dos ElevenLabs acima. Ranges: speed 0,5–1,5,
   * pitch -50..+50, volume 0–1 (developers.heygen.com/reference/create-video).
   */
  heygen_voice_speed: string;
  heygen_voice_pitch: string;
  heygen_voice_volume: string;
  heygen_voice_locale: string | null;
  /**
   * Cenário/traje PADRÃO do avatar — migration 068, 25/08. Persistidos ao
   * "Concluir configuração" do Passo 1 (AvatarSetupStep.tsx).
   */
  scenario: string | null;
  scenario_prompt: string | null;
  outfit: string | null;
  outfit_prompt: string | null;
  /** Treinado em PROVIDER_MODE=fixture — não passou pelo provedor real. */
  simulated: boolean;
  created_at: string;
}

export interface Video {
  id: string;
  avatar_id: string | null;
  script: string;
  scenario: string | null;
  outfit: string | null;
  scenario_prompt: string | null;
  outfit_prompt: string | null;
  /**
   * P2-5, 22/09/2026 — presente só na resposta de `/redo-video`, quando a
   * fala divergiu do alvo escolhido em mais de 8%. Nunca persistido: é
   * calculado na hora, a cada "Refazer", e não sobrevive a um reload da tela.
   */
  duration_target_warning?: string | null;
  /**
   * Duração ESTIMADA, em segundos inteiros, gravada quando o vídeo nasceu.
   *
   * Até o bloco DURAÇÃO-1 isto guardava o chip de 15/30/60 s do passo 3 — um
   * número que nunca chegou ao fornecedor e que o player exibia como se fosse o
   * vídeo entregue ("15s" num arquivo de 37 s). Hoje é a estimativa derivada do
   * roteiro, truncada. Continua sendo estimativa: para o que foi entregue,
   * `delivered_seconds`.
   */
  duration_seconds: number;
  /**
   * Duração MEDIDA, quando já existe. `null` enquanto o vídeo não ficou pronto.
   *
   * Vem de `provider_usage`, e nunca da linha com `unit_source = 'requested'`:
   * essa guarda o pedido, não uma medição.
   */
  delivered_seconds?: number | null;
  /** De onde saiu `delivered_seconds` — `vendor_response` ou `tts_timestamps`. */
  delivered_source?: string | null;
  /** Estimativa fracionária derivada do roteiro, para exibir antes da medição. */
  estimated_seconds?: number;
  /**
   * P2-7, 22/09/2026 — os 5 campos abaixo JÁ eram devolvidos por
   * `GET /videos`/`GET /videos/:id` (`SELECT v.*`); faltava só declará-los
   * aqui. Nenhuma mudança de backend — achado ao construir a janela de
   * Detalhes da Biblioteca.
   */
  tier_video?: "simples" | "normal" | "premium";
  /** "720p"/"1080p" — `null` em vídeos anteriores à coluna existir. */
  resolution?: string | null;
  /** A duração-alvo escolhida no passo Roteiro, ou `null` para "mais". */
  target_duration_seconds?: number | null;
  /**
   * SÓ o texto em português do usuário. `motion_prompt_en` é velado
   * (`CAMPOS_VELADOS`, tenantView.ts) — nunca chega ao frontend, P1.
   */
  motion_prompt?: string | null;
  expressiveness?: "low" | "medium" | "high" | null;
  status: VideoStatus;
  /** A imagem-base a aprovar, quando `status === "awaiting_approval"`. */
  fal_composed_image_url?: string | null;
  /** O vídeo MUDO a aprovar, quando `status === "awaiting_approval_video"`. */
  fal_muted_video_url?: string | null;
  /** Texto livre do último "Refazer" (imagem ou vídeo mudo). Só exibição. */
  refazer_feedback?: string | null;
  output_url: string | null;
  /**
   * A URL a EXIBIR, escolhida pelo SERVIDOR entre a versão limpa e a legendada.
   *
   * A tela não escolhe: `urlParaServir()` decide num lugar só, e o download usa
   * a mesma função. Duas escolhas independentes divergiriam, e o sintoma seria
   * o player mostrando uma versão enquanto o botão baixa a outra.
   */
  playback_url?: string | null;
  /** Legenda foi PEDIDA nesta geração? */
  captions?: boolean;
  /**
   * Legenda pedida foi de fato ENTREGUE?
   *
   * `false` com `captions: true` é o caso que a tela precisa avisar — o vídeo
   * saiu sem legenda e foi cobrado do mesmo jeito.
   */
  captions_delivered?: boolean;
  error_message: string | null;
  /** Gerado em PROVIDER_MODE=fixture — artefato de teste, não geração real. */
  simulated: boolean;
  /**
   * Proporção com que o vídeo foi pedido ao fornecedor (`16:9`, `9:16`, …).
   *
   * A coluna existe desde o bloco FORMATO-1 e `GET /videos` sempre a devolveu
   * (`SELECT *`); o que faltava era o tipo declará-la, então nenhuma tela
   * podia usá-la — e o player do passo 6 desenhava todo vídeo no mesmo quadro.
   * `null` em vídeos anteriores ao FORMATO-1.
   */
  aspect_ratio: string | null;
  created_at: string;
  /**
   * Quantas refações este vídeo já teve, e o teto — W3.1b, 24/08.
   *
   * Opcional porque nem toda resposta o traz: as rotas de leitura
   * (`GET /videos` e `GET /videos/:id`) enriquecem, e as de ação devolvem a
   * linha crua. A tela trata ausência como "não sei" e NÃO desabilita — o
   * servidor continua sendo o freio real (409 `refacoes_esgotadas`).
   */
  refacoes?: { feitas: number; limite: number };
  /**
   * P2-8, "Ajustar este vídeo" — campos que faltava declarar para popular
   * o wizard a partir de um vídeo existente (nenhuma mudança de backend:
   * `SELECT v.*` já os devolvia).
   */
  background_type?: "color" | "image" | null;
  background_value?: string | null;
  avatar_look_id?: string | null;
  publish_platform?: string | null;
  /**
   * A família de versões (migration 085). `root_video_id` aponta sempre
   * para a PRIMEIRA versão — "Ver versões" filtra por ele, sem CTE
   * recursiva nenhuma do lado do cliente.
   */
  parent_video_id?: string | null;
  root_video_id?: string | null;
  version_number?: number;
  /** Enquadramento persistido por vídeo — `null` = padrão do servidor. */
  avatar_fit?: "cover" | "contain" | null;
}

/** Resposta de `GET /dashboard-summary` — saldo de crédito e custo do mês. */
export interface DashboardSummary {
  credits: { creditType: string; balance: number }[];
  costThisMonth: {
    /** `null` quando NENHUMA linha do mês tem medição. Zero afirmaria que saiu de graça. */
    usd: number | null;
    measuredLines: number;
    unmeasuredLines: number;
    basis: string;
  };
  simulated: boolean;
}

export type CredentialProviderId = "avatar" | "voice" | "script";

export type StorageProviderId = "drive" | "platform_hosted";

export interface Credential {
  provider: CredentialProviderId;
  connected: boolean;
  updated_at: string;
  masked_key: string | null;
  vendor: string;
  /**
   * A credencial "de sempre" para este (tenant, provider) — a que
   * consumidores não-tier-aware de getCredential continuam vendo. Só
   * `avatar` pode ter mais de uma linha (migration 060); `voice`/`script`
   * seguem com uma linha só, sempre `is_default: true`.
   */
  is_default: boolean;
}

export type DocumentStatus = "processing" | "indexed" | "error";

export interface KnowledgeDocument {
  id: string;
  filename: string;
  file_url: string;
  mime_type: string;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
}

export interface ReferenceImage {
  id: string;
  filename: string;
  file_url: string;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface CopilotConversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export type CopilotRole = "user" | "assistant";

export interface CopilotMessage {
  id: string;
  conversation_id: string;
  role: CopilotRole;
  content: string;
  created_at: string;
}

export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  videoLimitPerMonth: number;
  scriptLimitPerMonth: number;
  avatarLimitPerMonth: number;
  features: string[];
  stripePriceId: string | null;
  active: boolean;
}

// Admin panel — cross-tenant views, only reachable via an admin_users session.
export interface AdminTenantSummary {
  id: string;
  name: string;
  slug: string;
  planId: string;
  status: "active" | "suspended" | "pending";
  createdAt: string;
  connectedProviders: CredentialProviderId[];
}

export interface AdminTenantDetail {
  id: string;
  name: string;
  slug: string;
  planId: string;
  status: "active" | "suspended" | "pending";
  storageProvider: StorageProviderId;
  createdAt: string;
  credentials: Credential[];
}

// Custo DERIVADO da única medição real que existe (backend
// billing/providerCost.ts), a partir das unidades consumidas. NÃO vem mais da
// tabela de taxas mantida à mão, que produzia estimativa sobre a duração
// PEDIDA a uma taxa palpite — errado nos dois fatores, 4,5x de desvio medido.
//
// `costUsd: null` significa AUSÊNCIA de medição, nunca zero. A tela precisa
// mostrar a diferença: "custou nada" e "não sabemos" não são a mesma coisa.
export interface TenantUsageBreakdownRow {
  provider: CredentialProviderId;
  vendor: string;
  unitType: "seconds" | "characters" | "tokens_in" | "tokens_out";
  totalUnits: number;
  attempts: number;
  failures: number;
  costUsd: number | null;
  costUnknownReason: string | null;
}

export interface TenantUsage {
  breakdown: TenantUsageBreakdownRow[];
  /** Soma APENAS das linhas com custo medido. */
  totalCostUsd: number;
  /** Quantas linhas ficaram de fora do total por não terem medição. */
  linesWithoutCost: number;
  costBasis: string;
}

export interface Subscription {
  companyName: string;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  slug: string;
  /** Quando o formulário de perfil foi salvo pela primeira vez. `null` = card ainda aparece. */
  profileCompletedAt: string | null;
  plan: Plan;
  availablePlans: Plan[];
  usage: { videosThisMonth: number; limit: number };
  paymentMethodMasked: string | null;
}

// Chaves DA PLATAFORMA (tabela platform_credentials) — não confundir com a
// credencial BYOK do tenant acima. NENHUM campo aqui carrega valor de chave:
// `lastFour` são os 4 últimos caracteres gravados na escrita, e o backend não
// tem rota que devolva o valor em claro (invariante cobrada por npm run check).
export interface PlatformCredentialView {
  id: string;
  envVar: string;
  label: string;
  servedBy: string;
  configured: boolean;
  source: "panel" | "env" | null;
  lastFour: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  lastValidatedAt: string | null;
  lastValidationOk: boolean | null;
  lastValidationDetail: string | null;
  readsBalance: boolean;
  balanceUnavailable: string | null;
  forcedEnv: boolean;
  hasProbe: boolean;
}

export interface PlatformCredentialValidation {
  ok: boolean;
  detail: string | null;
  balance: string | null;
  validatedAt: string;
}

/**
 * Espelho de `backend/src/services/generationReadiness.ts`.
 *
 * A mensagem vem PRONTA do servidor, em pt-BR: a tela não traduz nem
 * reescreve. Se o texto morasse aqui, a regra teria duas donas — e o defeito
 * que a Fase 1-ter fechou é exatamente esse (botão com três condições, rota
 * com sete).
 */
export interface GenerationBlocker {
  code: string;
  message: string;
  status: number;
}

export interface GenerationReadiness {
  ready: boolean;
  blockers: GenerationBlocker[];
}

/**
 * Resposta de `GET /avatars/:id/looks` — os trajes do avatar.
 *
 * Um tipo só, compartilhado pelo passo 1 (que cria) e pelo passo Cena (que
 * escolhe): duas cópias do mesmo contrato divergem na primeira mudança, e o que
 * divergiria aqui é quais trajes a tela considera escolhíveis.
 */
export interface AvatarLooksResponse {
  /** ESCOLHÍVEIS. Um traje em preparo não entra aqui. */
  looks: { id: string; name: string; previewImageUrl: string | null }[];
  /** Em preparo ou falhados — aparecem como andamento, nunca como opção. */
  pendentes: { id: string; name: string; status: "processing" | "failed" }[];
  canChoose: boolean;
  simulated: boolean;
  /**
   * Custo de criar UM traje. MEDIDO no fornecedor, servido pelo backend.
   *
   * OPCIONAL, e a ausência é um caso VÁLIDO — não um payload defeituoso. O
   * servidor omite este campo quando o avatar não pode receber traje nenhum
   * (em treino, sem `provider_avatar_id`; ou tenant sem credencial de avatar):
   * ali não há o que custar, e anunciar preço de coisa indisponível seria pior
   * que calar.
   *
   * Declarado obrigatório, este campo derrubou a tela: `lookCost.usd` num
   * payload que legitimamente não o trazia virou
   * `Cannot read properties of undefined (reading 'usd')` no clique do card, e
   * o TypeScript não tinha como avisar porque a promessa era falsa. Opcional, o
   * compilador passa a exigir o tratamento em todo consumidor novo.
   */
  lookCost?: { units: number; usd: number };
}

/**
 * "Ver avatar" — três fontes, todas de LEITURA, nenhuma gera nada novo:
 * as fotos que a própria pessoa enviou, a imagem que o fornecedor de fato
 * gerou (não as fotos cruas) e a amostra de voz ORIGINAL (não uma frase
 * nova por TTS). `heygen_preview_url` e `voice_sample_url` são `null` em
 * casos legítimos — avatar sem `provider_avatar_id`, ou voz clonada antes
 * da tabela que guarda a amostra original existir.
 */
export interface AvatarPreviewResponse {
  photos: string[];
  heygen_preview_url: string | null;
  voice_sample_url: string | null;
}
