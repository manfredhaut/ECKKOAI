/**
 * `awaiting_approval` e `awaiting_approval_video` são EXCLUSIVOS do caminho
 * da fal, e são os dois estados deste enum que não saem sozinhos:
 *
 * - `awaiting_approval`: a composição já foi paga, a IMAGEM existe, e a
 *   etapa seguinte (Wan/Seedance, o `animar`) espera um clique humano. Ver
 *   migration 052.
 * - `awaiting_approval_video`: `animar` também já foi pago, o VÍDEO MUDO
 *   existe, e as duas etapas mais caras (narrar + sincronizar) esperam um
 *   segundo clique. FASE 2 (Modo B), 21/08, migration 059.
 */
export type VideoStatus =
  | "queued"
  | "processing"
  | "awaiting_approval"
  | "awaiting_approval_video"
  | "ready"
  | "error";

export interface Avatar {
  id: string;
  tenant_id: string;
  name: string;
  provider: string | null;
  photo_urls: string[];
  reference_video_url: string | null;
  voice_id: string | null;
  /**
   * A voz clonada DIRETO na HeyGen — B5/B6, BLOCO HEYGEN-SIMPLES-1
   * (migration 076). Paralela a `voice_id` (sempre ElevenLabs), nunca uma
   * substituição: o mesmo avatar pode gerar tanto no tier Simples (lê esta
   * coluna) quanto no Normal/Premium (lê `voice_id`). `null` até a
   * primeira clonagem HeyGen bem-sucedida.
   */
  heygen_voice_id: string | null;
  provider_avatar_id: string | null;
  provider_status: "ready" | "processing" | "unknown" | null;
  /** `supported_api_engines` declarado na criação. NULL = não declarou. */
  provider_engines: string[] | null;
  audio_treatment_enabled: boolean;
  audio_treatment_target_lufs: number;
  /**
   * Os quatro ajustes de síntese do ElevenLabs — migration 067, 25/08.
   *
   * Os três primeiros são `numeric` e chegam do `pg` como STRING, apesar do
   * tipo declarado aqui (mesma dívida já existente em
   * `audio_treatment_target_lufs`). Quem os usa em aritmética ou no corpo da
   * síntese passa por `voiceTuningDoAvatar()`, que aplica `Number()`.
   */
  voice_stability: number;
  voice_similarity_boost: number;
  voice_style: number;
  voice_speaker_boost: boolean;
  /**
   * Cenário/traje PADRÃO do avatar — migration 068, Fase A item 5 (25/08).
   * Persistidos ao "Concluir configuração" do Passo 1; usados por
   * `POST /videos` como PADRÃO quando o próprio vídeo não manda um valor
   * seu (o vídeo que manda o seu sempre vence — ver routes/videos.ts).
   */
  scenario: string | null;
  scenario_prompt: string | null;
  outfit: string | null;
  outfit_prompt: string | null;
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
  /**
   * A duração-alvo escolhida no passo Roteiro (15/30/45/60 s, ou um valor
   * livre de "Mais") — V34, item 1, migration 074. `null` quando "Mais" foi
   * deixado sem número ou a linha é anterior a esta migration. Distinta de
   * `duration_seconds` acima: aquela é a duração REAL truncada, derivada do
   * fornecedor; esta é o que a PESSOA pediu, antes de qualquer geração.
   */
  target_duration_seconds: number | null;
  /**
   * Recusas CONSECUTIVAS da guarda de folga de sincronização (o vídeo
   * animado saiu mais curto que a fala real) — migration 075. Escalona a
   * margem do próximo "Refazer vídeo"; reseta para 0 quando a etapa passa.
   * Ver `FolgaDeSincronizacaoInsuficienteError`, falPipeline.ts.
   */
  sync_folga_recusas: number;
  status: VideoStatus;
  output_url: string | null;
  provider_job_id: string | null;
  provider_vendor: string | null;
  error_message: string | null;
  /**
   * Por que a linha está no estado que está — `vendor_rejected`,
   * `poll_timeout`, `approval_expired`, `recovery_orphan`, `recovery_stale`
   * (ver `VideoFailureReason`, videoFailure.ts). `null` enquanto a linha
   * não passou por nenhum caminho de falha/recuperação.
   */
  failure_reason: string | null;
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
  /**
   * O vídeo animado, MUDO — aprovado ou à espera de aprovação. FASE 2 (Modo
   * B), migration 059. `null` até a corrida alcançar `animar` pela primeira
   * vez; sobrevive ao "Refazer" (sobrescrito, nunca acumulado — mesmo padrão
   * de `fal_composed_image_url` na recomposição).
   */
  fal_muted_video_url: string | null;
  /**
   * O ÁUDIO já sintetizado pelo ElevenLabs, quando a corrida narrou ANTES
   * de animar — V33, item 2, migration 073. Só preenchido pelo caminho de
   * tomada única do tier Normal (roteiros ≤30s estimados); `/approve-video`
   * o lê para NÃO ressintetizar. `null` em todo outro caminho.
   */
  fal_audio_url: string | null;
  /**
   * Texto livre do "Refazer" — o que precisa mudar, capturado no clique,
   * tanto na tela de imagem quanto na de vídeo mudo (migration 061). Só
   * CAPTURADO e PERSISTIDO: nenhum caminho de geração o lê ainda.
   */
  refazer_feedback: string | null;
  /**
   * Quando a aprovação (de QUALQUER uma das duas etapas) passou a ser
   * esperada. Reiniciado a cada recomposição/refazer — é este campo, e não
   * `created_at`, que a expiração de 24 h mede, para os dois estados de
   * espera.
   */
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
  /**
   * O NÍVEL escolhido pelo tenant — BLOCO A, migration 058. `"simples"`
   * (HeyGen) | `"normal"` (fal/Wan) | `"premium"` (fal/Seedance 2.5). Um
   * tenant no vendor HeyGen ignora este campo na prática: o despacho por
   * VENDOR continua vindo de `api_credentials`, não daqui — só dentro do
   * vendor "fal" é que este campo escolhe o motor.
   */
  tier_video: "simples" | "normal" | "premium";
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
  profile_completed_at: string | null;
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
