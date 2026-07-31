/**
 * Quem paga cada caminho de IA, num arquivo só.
 *
 * O projeto tem três chaves de plataforma distintas e uma credencial BYOK
 * por tenant, e confundi-las já custou tempo (uma chave Google em
 * PLATFORM_COPILOT_API_KEY vira 401 em api.anthropic.com, porque
 * `askCopilot()` usa vendor "anthropic" por padrão). Este módulo existe
 * para que a resposta a "de quem é a chave desta chamada?" esteja escrita
 * num lugar, e não deduzida em cada rota.
 *
 * Decisão de 2026-07-31, agora FECHADA: o copiloto do TENANT passa a usar a
 * chave Google DA PLATAFORMA. Suporte deixou de depender de o cliente
 * conectar chave própria — cobrar do cliente a configuração de um provedor
 * para poder pedir ajuda sobre o produto era exatamente o contrário do que
 * suporte deve ser.
 */
import { config } from "../../config.js";
import type { ScriptVendor } from "./vendorCatalog.js";

export interface ResolvedAiKey {
  apiKey: string;
  vendor: ScriptVendor;
  /** De onde veio a chave — usado em log e em decisão de cota. */
  source: "platform" | "tenant_byok";
}

/**
 * Chave para o copiloto do TENANT e para geração de roteiro.
 *
 * Precedência: plataforma primeiro, BYOK do tenant como retaguarda.
 *
 * A retaguarda existe por uma razão específica e temporária: enquanto
 * PLATFORM_GOOGLE_API_KEY não estiver preenchida, remover o BYOK deixaria
 * o copiloto do tenant — hoje o único caminho de IA que comprovadamente
 * responde — sem funcionar nenhum. Quando a chave da plataforma existir,
 * ela ganha sem que nada mais precise mudar, e o BYOK vira o que já é: um
 * resquício a remover junto com a migração completa.
 */
export function resolveTenantAiKey(byok: { apiKey: string; vendor: string } | null): ResolvedAiKey | null {
  if (config.platformGoogleApiKey) {
    return { apiKey: config.platformGoogleApiKey, vendor: "gemini", source: "platform" };
  }
  if (byok) {
    return { apiKey: byok.apiKey, vendor: byok.vendor as ScriptVendor, source: "tenant_byok" };
  }
  return null;
}

/**
 * Chave do copiloto PÚBLICO e do copiloto do ADMIN — Anthropic, sempre.
 *
 * Não aceita vendor: `askCopilot()` faz `vendor = input.vendor ??
 * "anthropic"`, e nem public.ts nem adminCopilot.ts passam vendor. Deixar
 * este caminho configurável reabriria a confusão que a decisão nº 1 do
 * CLAUDE.md fechou.
 */
export function resolvePlatformCopilotKey(): string | null {
  return config.platformCopilotApiKey;
}

/** Chave de embedding — Google, separada da de roteiro. Ainda não usada. */
export function resolveEmbeddingKey(): string | null {
  return config.platformEmbeddingApiKey;
}
