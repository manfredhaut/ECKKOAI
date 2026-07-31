import { readLoginRateLimit } from "./services/loginRateLimitPolicy.js";
import { readProviderMode } from "./services/providers/providerMode.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// docker-compose passes unset vars through as an empty string (`${VAR:-}`),
// not undefined — plain `process.env.X ?? null` doesn't catch that, so
// anything chaining more fallbacks on top (e.g. `envOverride ?? default`)
// would silently "win" with an empty string instead of falling through.
function optional(name: string): string | null {
  const value = process.env[name];
  return value ? value : null;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // Ambiente declarado. Usado por guardas que precisam distinguir
  // "conveniência de desenvolvimento" de "configuração de produção" —
  // ver loginRateLimitPolicy.ts e scripts/checkPolicy.ts.
  nodeEnv: process.env.NODE_ENV ?? "development",
  // Configurável para não travar o desenvolvimento, com o default igual ao
  // valor de produção. `npm run check` reprova o build se um valor folgado
  // estiver ativo com NODE_ENV=production.
  loginRateLimit: readLoginRateLimit(),
  databaseUrl: required("DATABASE_URL"),
  encryptionKey: required("ENCRYPTION_KEY"),
  uploadsDir: process.env.UPLOADS_DIR ?? "/app/uploads",
  docsDir: process.env.DOCS_DIR ?? "/app/docs",
  sessionSecret: required("SESSION_SECRET"),
  // Platform-owned key for the public pre-signup copilot demo — not a
  // tenant's BYOK credential (no tenant exists yet at that point). Optional:
  // the public copilot endpoint degrades to a "not configured" error when unset.
  platformCopilotApiKey: optional("PLATFORM_COPILOT_API_KEY"),
  // Três chaves de plataforma DISTINTAS, de propósito. Confundi-las já
  // produziu 401: askCopilot() usa vendor "anthropic" por padrão, então uma
  // chave Google colada em PLATFORM_COPILOT_API_KEY vai para
  // api.anthropic.com e falha.
  //
  //  - platformCopilotApiKey  → Anthropic. Copiloto PÚBLICO e do ADMIN.
  //  - platformGoogleApiKey   → Google. Roteiro e copiloto do TENANT.
  //  - platformEmbeddingApiKey→ Google. Só embeddings (gemini-embedding-001).
  //
  // A de embedding é separada da de roteiro mesmo sendo do mesmo vendor:
  // indexação é um consumo em lote, com limite diário próprio, e dividir a
  // cota com o suporte faria uma reindexação derrubar o copiloto.
  platformGoogleApiKey: optional("PLATFORM_GOOGLE_API_KEY"),
  platformEmbeddingApiKey: optional("PLATFORM_EMBEDDING_API_KEY"),
  // fixture | live — ver services/providers/providerMode.ts.
  providerMode: readProviderMode(),
  // Optional overrides for the default AI model used by the script/copilot
  // providers — see services/providers/providerRegistry.ts for the fallback.
  aiModelOverrides: {
    anthropic: optional("ANTHROPIC_MODEL"),
    gemini: optional("GEMINI_MODEL"),
    openai: optional("OPENAI_MODEL"),
  },
  // Optional base URL override for the generic openai-chat-completions
  // adapter — lets an OpenAI-compatible endpoint (self-hosted, proxy, etc.)
  // be swapped in without touching the adapter itself.
  aiBaseUrlOverrides: {
    openai: optional("OPENAI_BASE_URL"),
  },
  // Fase 4 (billing plan) — platform's own Stripe account, not a tenant BYOK
  // credential. Optional (not required()) so the app still boots without
  // them; routes that need Stripe check for a value and degrade to a clear
  // "not configured" error instead, same pattern as platformCopilotApiKey.
  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripePublishableKey: optional("STRIPE_PUBLISHABLE_KEY"),
  // Printed by `stripe listen` in dev (different from any dashboard-configured
  // secret) — see docs/setup.md for the local verification flow.
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
};
