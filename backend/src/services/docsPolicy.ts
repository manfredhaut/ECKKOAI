// The invariants that the documentation fed to the copilots must satisfy,
// all in one file so there is a single place to read and to edit.
//
// docsManifest.ts decides WHO sees each file. This decides WHAT is allowed to
// be in what they see. Enforced by scripts/checkPolicy.ts, which exits
// non-zero — these are assertions, not warnings.

import type { DocAudience } from "./docsManifest.js";

// Terms that must never appear in a prompt below admin level. Matched
// case-insensitively as plain substrings against the assembled prompt, so
// they should be distinctive enough not to collide with ordinary prose —
// "sessions" alone would; "Domain=." would not.
//
// Adding an entry is cheap and safe. Removing one means deciding that a
// customer, or an anonymous visitor, may read it.
export const DENY_TERMS: readonly string[] = [
  // --- secrets and the names of the variables that hold them ------------
  "ENCRYPTION_KEY",
  "SESSION_SECRET",
  "POSTGRES_PASSWORD",
  "POSTGRES_USER",
  "DATABASE_URL",
  // As cinco chaves da plataforma. Nomear a variável já é meio caminho: diz
  // ao leitor o que procurar e onde, e um doc que cita o nome ao lado do
  // valor ("basta pôr AIza… em X") vaza os dois de uma vez.
  "PLATFORM_COPILOT_API_KEY",
  "PLATFORM_GOOGLE_API_KEY",
  "PLATFORM_EMBEDDING_API_KEY",
  "PLATFORM_HEYGEN_API_KEY",
  "PLATFORM_ELEVENLABS_API_KEY",
  "PLATFORM_KEYS_FORCE_ENV",
  "platform_credentials",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "X-Admin-Token",
  "ADMIN_TOKEN",

  // --- internal table names ---------------------------------------------
  // Knowing the schema is a head start for anyone probing the API.
  "admin_users",
  "api_credentials",
  "tenant_credits",
  "credit_ledger",
  "provider_cost_rates",
  "provider_usage",
  "audit_log",
  "document_chunks",
  "copilot_messages",
  "copilot_conversations",
  "admin_copilot",
  "avatar_trainings",
  "script_generations",
  "schema_migrations",

  // --- internal hosts, ports and infrastructure -------------------------
  "postgres:5432",
  ":4000",
  ":5173",
  "docker compose",
  "traefik",
  "TRAEFIK_HTTP_PORT",
  "BACKEND_PORT",
  "FRONTEND_PORT",

  // --- session cookie scoping -------------------------------------------
  // How the cookie is scoped tells an attacker exactly which host to get
  // onto for the cookie to travel there.
  "Domain=.",
  "httpOnly",
  "resolveTenantFromHost",
];

// Audiences the deny-list applies to. The admin copilot is internal staff and
// setup.md legitimately contains most of the list.
export const DENY_ENFORCED_FOR: readonly DocAudience[] = ["public", "tenant"];

// Ceiling on the assembled prompt, in characters, per audience.
//
// This is not a technical limit — it is a budget. Prompt size is cost on
// every single message and it only ever drifts upward, one "small addition"
// at a time. Failing the build when it grows forces the growth to be a
// decision: raise the number in the same commit that adds the content, and
// the diff shows both.
//
// Baseline when introduced (2026-07-30): public 2.661, tenant 14.427,
// admin 24.608. Headroom is deliberately modest.
export const SIZE_LIMITS: Record<DocAudience, number> = {
  public: 4_000,
  tenant: 20_000,
  admin: 32_000,
};

// Canonical way to state a plan limit in documentation. checkPolicy.ts finds
// every match and asserts the number against the plans table — the single
// source of truth — so a doc can never promise more than the product gives.
//
// Only these forms are checked. Writing a limit any other way ("dois vídeos
// mensais") escapes the check silently, so documentation should stick to
// these shapes. Deliberately narrow: a looser pattern would match prose like
// "os 5 vídeos mais recentes", which is not a limit at all.
export const PLAN_LIMIT_PATTERNS: readonly {
  regex: RegExp;
  field: "videoLimitPerMonth" | "scriptLimitPerMonth" | "avatarLimitPerMonth";
}[] = [
  { regex: /(\d+)\s+v[íi]deos?\s*(?:por|\/)\s*m[êe]s/gi, field: "videoLimitPerMonth" },
  { regex: /(\d+)\s+videos?\s*(?:per|\/)\s*month/gi, field: "videoLimitPerMonth" },
  { regex: /(\d+)\s+roteiros?\s*(?:por|\/)\s*m[êe]s/gi, field: "scriptLimitPerMonth" },
  { regex: /(\d+)\s+scripts?\s*(?:per|\/)\s*month/gi, field: "scriptLimitPerMonth" },
  { regex: /(\d+)\s+avatar(?:es|s)?\s*(?:por|\/)\s*m[êe]s/gi, field: "avatarLimitPerMonth" },
  { regex: /(\d+)\s+avatars?\s*(?:per|\/)\s*month/gi, field: "avatarLimitPerMonth" },
];

// No plan is unlimited in anything. Claiming otherwise in docs repeats the
// bug already fixed once in the plan features themselves, where Pro and
// Business advertised "Avatares ilimitados" against real limits of 5 and 20.
export const UNLIMITED_CLAIM_PATTERN =
  /\b(ilimitad[oa]s?|unlimited)\b/gi;

// Claims the product does not deliver. Separate from DENY_TERMS above, which
// protects secrets: nothing here is confidential, it is simply false — and a
// confident false statement about billing or about what the product does with
// a customer's documents is worse than a leak of a table name.
//
// The reason this is enforced and not merely fixed once: the copilot told a
// paying customer, verbatim, that the product is BYOK and that "cobrança real
// ainda não foi implementada" — a false commercial statement to someone
// billed through Stripe. Removing the sentences takes minutes; keeping them
// from coming back on the next documentation pass is what this list is for.
//
// Each entry names the ground truth that contradicts it, so a future author
// who believes a term became true again knows exactly what to re-check.
export const FALSE_CLAIM_TERMS: readonly { term: string; why: string }[] = [
  // --- the tenant does not, and cannot, bring its own key ---------------
  // routes/credentials.ts: PUT and POST both return 403 managed_by_platform.
  // The only write path is PUT /admin/tenants/:id/credentials/:provider.
  { term: "byok", why: "o tenant não conecta chave: rotas de escrita respondem 403 managed_by_platform" },
  { term: "bring your own key", why: "idem — modelo BYOK foi revertido para chave gerenciada pela plataforma" },
  { term: "sua própria chave", why: "a chave é gravada pela equipe interna, não pelo cliente" },
  { term: "suas próprias chaves", why: "idem" },
  { term: "conecte sua chave", why: "não existe tela onde o cliente conecte chave" },
  { term: "conectar chaves de api", why: "idem" },

  // --- there is no retrieval over uploaded documents --------------------
  // embeddingProvider.ts returns Math.random(); no query in the backend uses
  // the <=> operator and document_chunks is only ever written, never read.
  { term: "vetoriz", why: "embeddingProvider.ts devolve vetor aleatório — não há vetorização real" },
  { term: "busca semântica", why: "nenhuma query do backend usa o operador <=>; document_chunks nunca é lido" },
  { term: "semantic search", why: "idem" },
  { term: "como contexto (rag)", why: "nada é recuperado dos documentos para o roteiro" },
  { term: "usados como contexto para a geração", why: "idem" },

  // --- billing exists ---------------------------------------------------
  // routes/stripeWebhook.ts, POST /subscription/checkout and
  // /subscription/credits/checkout are live; tenant_credits carries real
  // balances. Note the phrases are specific: "cobrança real" on its own is
  // legitimate wording in docs/admin/, which warns the operator NOT to treat
  // an estimate as a real charge. Only the denial of billing is banned.
  { term: "não envolve cobrança real", why: "Stripe está integrado: checkout de plano e de créditos, com webhook" },
  { term: "nenhuma cobrança real", why: "idem" },
  { term: "cobrança real ainda não", why: "idem" },
  { term: "billing real ainda não", why: "idem" },
  { term: "sem processamento de pagamento", why: "idem" },
  { term: "provedor de cobrança estiver conectado", why: "tenant_credits já carrega saldo real por tipo de crédito" },
];

// Enforced at every level, unlike DENY_TERMS. A false statement does not
// become acceptable because the reader is internal staff — an operator acting
// on "billing isn't implemented" makes the same wrong decision a customer
// would.
export const FALSE_CLAIM_ENFORCED_FOR: readonly DocAudience[] = ["public", "tenant", "admin"];
