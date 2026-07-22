// Real integration: unlike the other stubs in this folder, the in-app
// copilot needs an actual conversational reply, so this calls the vendor's
// chat API via providerRegistry.ts (shared with scriptProvider.ts) with the
// tenant's own BYOK "script" credential. It reuses that same credential row
// as scriptProvider.ts, so it must dispatch on the same vendor field —
// otherwise switching the script vendor to Gemini would silently break the
// copilot (Gemini key sent to Anthropic, or vice versa).
import { complete, AiProviderError } from "./providerRegistry.js";
import type { ScriptVendor } from "./vendorCatalog.js";
import { recordProviderUsage } from "../billing/usageTracking.js";

export interface CopilotMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface AskCopilotInput {
  apiKey: string;
  // Only meaningful for "tenant" audience — the public copilot always uses
  // the platform's own Anthropic key, so it has no vendor to select.
  vendor?: ScriptVendor;
  // Absent for the public pre-signup copilot (no tenant exists yet) — usage
  // is only recorded when this is set, since public-copilot cost is the
  // platform's own, not billable to any tenant.
  tenantId?: string;
  docsContent: string;
  history: CopilotMessageInput[];
  audience?: "tenant" | "public" | "admin";
}

export class CopilotProviderError extends Error {}

const TENANT_SYSTEM_PROMPT = [
  "Você é o copiloto do eckko.ai, um app multi-tenant para criar vídeos de",
  "avatar digital. Responda dúvidas de 'como faço para...' sobre o próprio",
  "produto usando exclusivamente a documentação abaixo como fonte da",
  "verdade. Se a pergunta não puder ser respondida com base nela, diga que",
  "não sabe em vez de inventar uma resposta. Nunca mencione dados de outros",
  "tenants — você não tem acesso a eles. Responda no mesmo idioma da",
  "pergunta do usuário.",
].join("\n");

// Same rules as the tenant prompt, but for an anonymous visitor on the
// public marketing site, before they have an account — no tenant data
// exists to leak, but it should nudge toward signing up instead of acting
// like it already knows the visitor's account.
const PUBLIC_SYSTEM_PROMPT = [
  "Você é o copiloto de demonstração pública do eckko.ai, um app multi-tenant",
  "para criar vídeos de avatar digital. Quem está falando com você ainda não",
  "tem conta — responda dúvidas sobre como o produto funciona usando",
  "exclusivamente a documentação abaixo como fonte da verdade, e incentive a",
  "criar uma conta gratuita quando fizer sentido. Se a pergunta não puder ser",
  "respondida com base na documentação, diga que não sabe em vez de inventar",
  "uma resposta. Responda no mesmo idioma da pergunta do usuário.",
].join("\n");

// For the internal eckko.ai team, authenticated via admin_users — never a
// tenant identity, no tenant scoped to this conversation at all. Gets a
// different slice of docs (see routes/adminCopilot.ts /
// services/docs.ts loadAdminDocsContent — docs/admin/ on top of the
// regular product docs) covering the admin panel's own screens, which the
// tenant/public prompts above never receive.
const ADMIN_SYSTEM_PROMPT = [
  "Você é o copiloto interno do eckko.ai, para uso exclusivo do time da",
  "própria plataforma (autenticado como admin, nunca como um tenant).",
  "Responda dúvidas sobre como o produto e o painel administrativo",
  "funcionam (billing, planos, taxas de custo, suspensão de tenant etc.)",
  "usando exclusivamente a documentação abaixo como fonte da verdade. Se a",
  "pergunta não puder ser respondida com base nela, diga que não sabe em",
  "vez de inventar uma resposta. Você não tem acesso a dados específicos de",
  "nenhum tenant além do que estiver explicitamente na documentação — nunca",
  "invente números ou informações de um tenant real. Responda no mesmo",
  "idioma da pergunta do usuário.",
].join("\n");

function buildSystemPrompt(input: AskCopilotInput): string {
  const base =
    input.audience === "public"
      ? PUBLIC_SYSTEM_PROMPT
      : input.audience === "admin"
        ? ADMIN_SYSTEM_PROMPT
        : TENANT_SYSTEM_PROMPT;
  return [base, "", "# Documentação do produto", input.docsContent].join("\n");
}

export async function askCopilot(input: AskCopilotInput): Promise<string> {
  // No vendor means the public copilot (platform-owned Anthropic key, no
  // tenant credential involved) — every other caller passes the tenant's
  // actual chosen vendor through untouched.
  const vendor = input.vendor ?? "anthropic";
  try {
    const { text, usage } = await complete(vendor, {
      apiKey: input.apiKey,
      system: buildSystemPrompt(input),
      messages: input.history.map((m) => ({ role: m.role, content: m.content })),
    });
    if (usage && input.tenantId) {
      await recordProviderUsage({
        tenantId: input.tenantId,
        provider: "script",
        vendor,
        unitType: "tokens_in",
        unitCount: usage.inputTokens,
      });
      await recordProviderUsage({
        tenantId: input.tenantId,
        provider: "script",
        vendor,
        unitType: "tokens_out",
        unitCount: usage.outputTokens,
      });
    }
    return text;
  } catch (err) {
    if (err instanceof AiProviderError) throw new CopilotProviderError(err.message);
    throw err;
  }
}
