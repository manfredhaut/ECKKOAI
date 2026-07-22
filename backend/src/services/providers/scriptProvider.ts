// Real integrations for script-generation, selected per tenant via the
// "script" BYOK credential's vendor (see vendorCatalog.ts). Model + HTTP
// call live in providerRegistry.ts, shared with copilotProvider.ts.
import { complete, AiProviderError } from "./providerRegistry.js";
import type { ScriptVendor } from "./vendorCatalog.js";
import { recordProviderUsage } from "../billing/usageTracking.js";

export interface GenerateScriptInput {
  apiKey: string;
  vendor: ScriptVendor;
  prompt: string;
  tenantId: string;
}

export interface GenerateScriptResult {
  script: string;
}

export class ScriptProviderError extends Error {}

export async function generateScript(input: GenerateScriptInput): Promise<GenerateScriptResult> {
  try {
    const { text, usage } = await complete(input.vendor, {
      apiKey: input.apiKey,
      messages: [{ role: "user", content: input.prompt }],
    });
    if (usage) {
      await recordProviderUsage({
        tenantId: input.tenantId,
        provider: "script",
        vendor: input.vendor,
        unitType: "tokens_in",
        unitCount: usage.inputTokens,
      });
      await recordProviderUsage({
        tenantId: input.tenantId,
        provider: "script",
        vendor: input.vendor,
        unitType: "tokens_out",
        unitCount: usage.outputTokens,
      });
    }
    return { script: text };
  } catch (err) {
    if (err instanceof AiProviderError) throw new ScriptProviderError(err.message);
    throw err;
  }
}
