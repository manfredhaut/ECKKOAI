export type VideoStatus = "queued" | "processing" | "ready" | "error";

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
  /** Motor ENVIADO ao fornecedor; NULL quando nenhum foi enviado. */
  provider_engine: string | null;
  /** Por que este motor — gravado inclusive quando nenhum foi enviado. */
  provider_engine_reason: string | null;
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
  plan_id: string;
  payment_method_masked: string | null;
  storage_provider: "drive" | "platform_hosted";
  status: "active" | "suspended";
  stripe_customer_id: string | null;
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
