import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { loadAdminDocsContent } from "../services/docs.js";
import { resolvePlatformCopilotKey } from "../services/providers/platformKeys.js";
import { askCopilot, CopilotProviderError } from "../services/providers/copilotProvider.js";
import { createRateLimiter } from "../services/rateLimit.js";
import type { AdminCopilotConversation, AdminCopilotMessage } from "../types.js";
import { toClientVendorError, vendorErrorStatus } from "../services/providers/vendorError.js";

const TITLE_MAX_LENGTH = 60;

// Generous compared to the public demo's 10/10min (routes/public.ts) — this
// is an authenticated internal user, not an anonymous visitor. The limit
// exists to catch a runaway loop/bug burning platform-key cost, not to
// police abuse, so it's keyed by admin_user_id (not IP) and sized well
// above any real manual chat session.
const isSendRateLimited = createRateLimiter(60, 10 * 60 * 1000);

async function getOwnedConversation(
  id: string,
  adminUserId: string,
): Promise<AdminCopilotConversation | undefined> {
  const { rows } = await pool.query<AdminCopilotConversation>(
    "SELECT * FROM admin_copilot_conversations WHERE id = $1 AND admin_user_id = $2",
    [id, adminUserId],
  );
  return rows[0];
}

// Registered inside app.ts's requireAdmin-gated plugin block, alongside
// adminPanelRoutes — req.adminUserId is always set by the time these
// handlers run (see middleware/requireAdmin.ts).
export async function adminCopilotRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/copilot/conversations", async (req) => {
    const { rows } = await pool.query<AdminCopilotConversation>(
      "SELECT * FROM admin_copilot_conversations WHERE admin_user_id = $1 ORDER BY updated_at DESC",
      [req.adminUserId],
    );
    return rows;
  });

  app.post("/admin/copilot/conversations", async (req, reply) => {
    const { rows } = await pool.query<AdminCopilotConversation>(
      "INSERT INTO admin_copilot_conversations (admin_user_id) VALUES ($1) RETURNING *",
      [req.adminUserId],
    );
    return reply.code(201).send(rows[0]);
  });

  app.get<{ Params: { id: string } }>("/admin/copilot/conversations/:id/messages", async (req, reply) => {
    const conversation = await getOwnedConversation(req.params.id, req.adminUserId);
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

    const { rows } = await pool.query<AdminCopilotMessage>(
      "SELECT * FROM admin_copilot_messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [conversation.id],
    );
    return rows;
  });

  app.post<{ Params: { id: string }; Body: { content: string } }>(
    "/admin/copilot/conversations/:id/messages",
    async (req, reply) => {
      if (isSendRateLimited(req.adminUserId)) {
        return reply
          .code(429)
          .send({ error: "rate_limited", message: "Too many messages, try again later." });
      }

      const conversation = await getOwnedConversation(req.params.id, req.adminUserId);
      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

      const { content } = req.body;
      if (!content?.trim()) return reply.code(400).send({ error: "Message content is required" });

      // Platform key, same as the public demo (routes/public.ts) — an admin
      // has no BYOK credential of their own, there's no tenant to own one.
      //
      // Resolvida a cada requisição (painel > .env, ver
      // services/platformCredentialStore.ts): gravar a chave pelo painel tem
      // de valer na mensagem seguinte, não no próximo boot.
      const copilotApiKey = await resolvePlatformCopilotKey();
      if (!copilotApiKey) {
        return reply.code(400).send({
          error: "no_script_credential",
          message: "The admin copilot isn't configured yet (no platform Anthropic key stored).",
        });
      }

      await pool.query(
        "INSERT INTO admin_copilot_messages (conversation_id, admin_user_id, role, content) VALUES ($1, $2, 'user', $3)",
        [conversation.id, req.adminUserId, content],
      );

      const { rows: historyRows } = await pool.query<AdminCopilotMessage>(
        "SELECT * FROM admin_copilot_messages WHERE conversation_id = $1 ORDER BY created_at ASC",
        [conversation.id],
      );

      const docsContent = await loadAdminDocsContent();
      let replyText: string;
      try {
        replyText = await askCopilot({
          apiKey: copilotApiKey,
          docsContent,
          history: historyRows.map((m) => ({ role: m.role, content: m.content })),
          audience: "admin",
        });
      } catch (err) {
        if (err instanceof CopilotProviderError) {
          const { failure, message } = toClientVendorError("script", "admin.copilot", err);
          return reply.code(vendorErrorStatus(failure)).send({ error: "copilot_provider_error", message });
        }
        throw err;
      }

      const { rows: assistantRows } = await pool.query<AdminCopilotMessage>(
        "INSERT INTO admin_copilot_messages (conversation_id, admin_user_id, role, content) VALUES ($1, $2, 'assistant', $3) RETURNING *",
        [conversation.id, req.adminUserId, replyText],
      );

      const title = conversation.title ?? content.slice(0, TITLE_MAX_LENGTH);
      const { rows: updatedRows } = await pool.query<AdminCopilotConversation>(
        "UPDATE admin_copilot_conversations SET title = $2, updated_at = now() WHERE id = $1 RETURNING *",
        [conversation.id, title],
      );

      return reply.code(201).send({ conversation: updatedRows[0], message: assistantRows[0] });
    },
  );
}
