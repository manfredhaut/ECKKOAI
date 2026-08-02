// Centralizes, per text-generation vendor, the default model + base URL
// (both overridable via env — see config.ts) and the actual HTTP call
// ("client"). Consumed by scriptProvider.ts and copilotProvider.ts so a
// model change or a new vendor only needs editing here. Scope is
// intentionally just the vendors in vendorCatalog.ts's "script" category
// (anthropic, gemini, openai); avatar (HeyGen/D-ID) and voice (ElevenLabs)
// have a completely different call shape (multipart upload, polling) and
// don't belong in this registry.
import { config } from "../../config.js";
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import { completeFixture } from "./fixtureProvider.js";
import { isFixtureMode } from "./providerMode.js";
import type { ScriptVendor } from "./vendorCatalog.js";

export class AiProviderError extends Error {}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteInput {
  apiKey: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

// The vendor accepted the request — HTTP 2xx, so the API key is valid — but
// the response carried no text. With reasoning models this is a normal
// outcome of a tiny output budget: the model spends it thinking and stops.
//
// It is a failure for generation and a SUCCESS for authentication, which is
// why it gets its own type. Callers that need text (script generation, the
// copilots) treat it like any other AiProviderError; the credential probe in
// routes/adminPanel.ts catches it specifically and reports the key as good.
export class AiEmptyResponseError extends AiProviderError {}

// Token usage as reported by the vendor's own response — used to record
// real (not estimated) cost for script/copilot calls (see
// services/billing/usageTracking.ts). null only if a vendor response is
// somehow missing the usage block entirely.
export interface CompleteUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompleteResult {
  text: string;
  usage: CompleteUsage | null;
}

interface ProviderEntry {
  defaultModel: string;
  modelEnvOverride: string | null;
  defaultBaseUrl: string | null;
  baseUrlEnvOverride: string | null;
  complete(model: string, baseUrl: string | null, input: CompleteInput): Promise<CompleteResult>;
}

const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

async function completeAnthropic(model: string, _baseUrl: string | null, input: CompleteInput): Promise<CompleteResult> {
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(input.system ? { system: input.system } : {}),
        messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
  } catch (err) {
    logProviderNetworkError("providerRegistry.completeAnthropic", err);
    throw new AiProviderError(`Could not reach Anthropic API: ${describeNetworkError(err)}`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new AiProviderError(`Anthropic API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage?: { input_tokens: number; output_tokens: number };
  };
  const text = data.content.find((block) => block.type === "text")?.text;
  if (!text) throw new AiEmptyResponseError("Anthropic API returned no text content");
  const usage = data.usage ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens } : null;
  return { text, usage };
}

async function completeGemini(model: string, _baseUrl: string | null, input: CompleteInput): Promise<CompleteResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let res: Response;
  try {
    res = await fetch(`${url}?key=${encodeURIComponent(input.apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(input.system ? { system_instruction: { parts: [{ text: input.system }] } } : {}),
        contents: input.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        // Não adicionar `thinkingConfig` aqui: testado contra a chave real,
        // `generationConfig.thinkingConfig.thinkingBudget` é rejeitado com
        // 400 INVALID_ARGUMENT pelo modelo em uso (a família Gemini 3 trocou
        // `thinkingBudget` por `thinkingLevel`, e nem todo modelo aceita
        // desligar o raciocínio). Desligar o thinking, portanto, não é um
        // caminho disponível — a resposta sem texto é tratada como
        // AiEmptyResponseError logo abaixo.
        generationConfig: { maxOutputTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS },
      }),
    });
  } catch (err) {
    logProviderNetworkError("providerRegistry.completeGemini", err);
    throw new AiProviderError(`Could not reach Gemini API: ${describeNetworkError(err)}`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new AiProviderError(`Gemini API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) throw new AiEmptyResponseError("Gemini API returned no text content");
  const usage = data.usageMetadata
    ? {
        inputTokens: data.usageMetadata.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
      }
    : null;
  return { text, usage };
}

// Generic client for the OpenAI Chat Completions request/response shape —
// not just OpenAI itself, but any endpoint that speaks the same format
// (self-hosted, proxy, other vendors that mirror it). baseUrl is always
// taken from the parameter, never hardcoded here — REGISTRY below is the
// only place a default/override URL is set, which is what lets a new
// vendor reuse this same adapter with nothing but a different baseUrl.
async function completeOpenAiChatCompletions(
  model: string,
  baseUrl: string | null,
  input: CompleteInput,
): Promise<CompleteResult> {
  if (!baseUrl) throw new AiProviderError("No base URL configured for this vendor.");
  const messages = [
    ...(input.system ? [{ role: "system" as const, content: input.system }] : []),
    ...input.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages,
      }),
    });
  } catch (err) {
    logProviderNetworkError("providerRegistry.completeOpenAiChatCompletions", err);
    throw new AiProviderError(`Could not reach ${baseUrl}: ${describeNetworkError(err)}`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new AiProviderError(`OpenAI-compatible API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new AiEmptyResponseError("OpenAI-compatible API returned no text content");
  const usage = data.usage
    ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
    : null;
  return { text, usage };
}

const REGISTRY: Record<ScriptVendor, ProviderEntry> = {
  anthropic: {
    defaultModel: "claude-sonnet-5",
    modelEnvOverride: config.aiModelOverrides.anthropic,
    defaultBaseUrl: null,
    baseUrlEnvOverride: null,
    complete: completeAnthropic,
  },
  gemini: {
    defaultModel: "gemini-flash-latest",
    modelEnvOverride: config.aiModelOverrides.gemini,
    defaultBaseUrl: null,
    baseUrlEnvOverride: null,
    complete: completeGemini,
  },
  openai: {
    defaultModel: "gpt-5.6-terra",
    modelEnvOverride: config.aiModelOverrides.openai,
    defaultBaseUrl: DEFAULT_OPENAI_BASE_URL,
    baseUrlEnvOverride: config.aiBaseUrlOverrides.openai,
    complete: completeOpenAiChatCompletions,
  },
};

export function resolveModel(vendor: ScriptVendor): string {
  const entry = REGISTRY[vendor];
  return entry.modelEnvOverride ?? entry.defaultModel;
}

export function resolveBaseUrl(vendor: ScriptVendor): string | null {
  const entry = REGISTRY[vendor];
  return entry.baseUrlEnvOverride ?? entry.defaultBaseUrl;
}

export async function complete(vendor: ScriptVendor, input: CompleteInput): Promise<CompleteResult> {
  // Ponto ÚNICO de saída para os três provedores de texto, e por isso o único
  // lugar onde a checagem de modo precisa existir: `complete()` atende geração
  // de roteiro, copiloto do tenant e copiloto do admin. Antes do bloco 5D-1
  // não havia checagem nenhuma aqui, e os três chamavam o fornecedor de
  // verdade mesmo em fixture.
  if (isFixtureMode()) {
    const promptChars = input.messages.reduce((n, m) => n + m.content.length, 0);
    return completeFixture(vendor, promptChars);
  }
  const entry = REGISTRY[vendor];
  return entry.complete(resolveModel(vendor), resolveBaseUrl(vendor), input);
}
