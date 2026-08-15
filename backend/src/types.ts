/**
 * `awaiting_approval` é EXCLUSIVO do caminho da fal, e é o único estado deste
 * enum que não sai sozinho: a composição já foi paga, a imagem existe, e a
 * etapa seguinte (~US$ 1,50) espera um clique humano. Ver migration 052.
 */
export type VideoStatus = "queued" | "processing" | "awaiting_approval" | "ready" | "error";

export interface Avatar {
  id: string;
  tenant_id: string;
  name: string;
  provider: string | null;
  photo_urls: string[];
  reference_video_url: string | null;
  voice_id: string | null;
  provider_avatar_id: string | null;
  provider_status: "ready" | "processing" | "unknown" | null;
  /** `supported_api_engines` declarado na criação. NULL = não declarou. */
  provider_engines: string[] | null;
  audio_treatment_enabled: boolean;
  audio_treatment_target_lufs: number;
  created_at: string;
}

export interface Video {
  id: string;
  tenant_id: string;
  avatar_id: string | null;
  script: string;
  scenario: string | null;
  outfit: string | null;
  scenario_prompt: string | null;
  outfit_prompt: string | null;
  duration_seconds: number;
  status: VideoStatus;
  output_url: string | null;
  provider_job_id: string | null;
  provider_vendor: string | null;
  error_message: string | null;
  /** Plataforma escolhida no passo "Publicação" e o formato derivado dela. */
  publish_platform: string | null;
  aspect_ratio: string | null;
  resolution: string | null;
  /** Cena escolhida — ver migration 042. `null` = nada escolhido. */
  background_type: "color" | "image" | null;
  background_value: string | null;
  motion_prompt: string | null;
  expressiveness: string | null;
  /** Motor ESCOLHIDO na tela; difere de `provider_engine`, que é o enviado. */
  engine_choice: string | null;
  /** Look do avatar usado nesta geração. Traje é look, não parâmetro de vídeo. */
  avatar_look_id: string | null;
  /** Motor ENVIADO ao fornecedor; NULL quando nenhum foi enviado. */
  provider_engine: string | null;
  /** Por que este motor — gravado inclusive quando nenhum foi enviado. */
  provider_engine_reason: string | null;
  /** A corrida do pipeline da fal que produziu esta linha. Ver migration 052. */
  fal_run_id: string | null;
  /** A imagem-base composta, aprovada ou à espera de aprovação. Migration 052. */
  fal_composed_image_url: string | null;
  /** Quando a aprovação passou a ser esperada. Reiniciado a cada recomposição. */
  approval_requested_at: string | null;
  /** Legenda queimada foi PEDIDA nesta geração? Ver migration 049. */
  captions: boolean;
  /**
   * A Interpretação traduzida para inglês — o que de fato foi ao fornecedor.
   *
   * **VELADA.** Existe para auditoria (log de servidor e painel admin) e nunca
   * pode sair numa resposta destinada ao cliente do tenant: quem escreve vê e
   * revisa sempre o próprio texto, em `motion_prompt`. O filtro é
   * `semCamposVelados()`, aplicado em `withDeliveredSeconds`.
   */
  motion_prompt_en: string | null;
  /**
   * A versão COM legenda queimada devolvida pelo fornecedor, quando houve.
   * Guardada AO LADO de `output_url`, nunca no lugar dela.
   */
  captioned_output_url: string | null;
  /** Gerado em modo fixture? Fato da LINHA, não do ambiente (ver migration 032). */
  simulated: boolean;
  created_at: string;
}

export type CredentialProvider = "avatar" | "voice" | "script";

export interface ApiCredential {
  id: string;
  tenant_id: string;
  provider: CredentialProvider;
  connected: boolean;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  slug_locked: boolean;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  plan_id: string;
  payment_method_masked: string | null;
  storage_provider: "drive" | "platform_hosted";
  status: "active" | "suspended" | "pending";
  stripe_customer_id: string | null;
  email_verification_token: string | null;
  email_verification_expires_at: string | null;
  created_at: string;
}

// Fase 5 (billing plan) — 3 independent pools per tenant, not a unified
// balance. See migration 028_tenant_credits.sql.
export type CreditType = "video" | "script" | "avatar";

export interface TenantCredit {
  tenant_id: string;
  credit_type: CreditType;
  balance: number;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

// Identidade separada de User/Tenant — equipe interna do eckko.ai, sem
// relação com nenhum tenant. Ver middleware/requireAdmin.ts.
export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
}

export type DocumentStatus = "processing" | "indexed" | "error";

export interface KnowledgeDocument {
  id: string;
  tenant_id: string;
  filename: string;
  file_url: string;
  mime_type: string;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
}

export interface ReferenceImage {
  id: string;
  tenant_id: string;
  filename: string;
  file_url: string;
  created_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface CopilotConversation {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export type CopilotRole = "user" | "assistant";

export interface CopilotMessage {
  id: string;
  conversation_id: string;
  tenant_id: string;
  role: CopilotRole;
  content: string;
  created_at: string;
}

// Separate tables (admin_copilot_conversations/admin_copilot_messages, see
// migration 031) — not the tenant ones above with a nullable tenant_id.
// Same identity-separation reasoning as AdminUser vs. User.
export interface AdminCopilotConversation {
  id: string;
  admin_user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminCopilotMessage {
  id: string;
  conversation_id: string;
  admin_user_id: string;
  role: CopilotRole;
  content: string;
  created_at: string;
}
