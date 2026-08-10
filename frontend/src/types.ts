export type VideoStatus = "queued" | "processing" | "ready" | "error";

export interface Avatar {
  id: string;
  name: string;
  provider: string | null;
  photo_urls: string[];
  reference_video_url: string | null;
  voice_id: string | null;
  provider_avatar_id: string | null;
  // ready | processing | unknown | null. Só "processing" impede gerar vídeo;
  // null (avatar antigo) e "unknown" liberam — ver migration 036.
  provider_status: "ready" | "processing" | "unknown" | null;
  audio_treatment_enabled: boolean;
  // Postgres `numeric` columns serialize as strings over JSON — parse with
  // Number(...) before using this in arithmetic or a range input's value.
  audio_treatment_target_lufs: string;
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
  status: VideoStatus;
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
  status: "active" | "suspended";
  createdAt: string;
  connectedProviders: CredentialProviderId[];
}

export interface AdminTenantDetail {
  id: string;
  name: string;
  slug: string;
  planId: string;
  status: "active" | "suspended";
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
  slug: string;
  profileComplete: boolean;
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
  /** Custo de criar UM traje. MEDIDO no fornecedor, servido pelo backend. */
  lookCost: { units: number; usd: number };
}
