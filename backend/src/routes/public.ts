import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { getAllPlans } from "../plans.js";
import { loadPublicDocsContent } from "../services/docs.js";
import { askCopilot, CopilotProviderError } from "../services/providers/copilotProvider.js";
import { toClientVendorError, vendorErrorStatus } from "../services/providers/vendorError.js";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Single-instance, in-memory limiter — good enough to stop the public demo
// from becoming an open spigot of Anthropic cost; not meant to survive a
// restart or work across multiple backend instances.
const requestLog = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestLog.get(ip);
  if (!entry || now >= entry.resetAt) {
    requestLog.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/plans", async () => getAllPlans());

  app.post<{ Body: { history: { role: "user" | "assistant"; content: string }[] } }>(
    "/public/copilot/messages",
    async (req, reply) => {
      if (isRateLimited(req.ip)) {
        return reply.code(429).send({ error: "rate_limited", message: "Too many messages, try again later." });
      }

      if (!config.platformCopilotApiKey) {
        return reply.code(400).send({
          error: "no_script_credential",
          message: "The public copilot demo isn't configured yet.",
        });
      }

      const history = req.body?.history ?? [];
      if (history.length === 0) {
        return reply.code(400).send({ error: "History is required" });
      }

      const docsContent = await loadPublicDocsContent();
      try {
        const replyText = await askCopilot({
          apiKey: config.platformCopilotApiKey,
          docsContent,
          history,
          audience: "public",
        });
        return { content: replyText };
      } catch (err) {
        if (err instanceof CopilotProviderError) {
          // Visitante anônimo: é o caminho mais exposto do produto. Nunca
          // devolver o corpo de erro do fornecedor aqui.
          const { failure, message } = toClientVendorError("script", "public.copilot", err);
          return reply.code(vendorErrorStatus(failure)).send({ error: "copilot_provider_error", message });
        }
        throw err;
      }
    },
  );
}
