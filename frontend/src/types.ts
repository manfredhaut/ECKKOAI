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
  duration_seconds: number;
  status: VideoStatus;
  output_url: string | null;
  error_message: string | null;
  /** Gerado em PROVIDER_MODE=fixture — artefato de teste, não geração real. */
  simulated: boolean;
  created_at: string;
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
