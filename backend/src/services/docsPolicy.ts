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
  "PLATFORM_COPILOT_API_KEY",
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
