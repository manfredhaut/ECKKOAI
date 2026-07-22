import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { getCredential } from "../services/credentialLookup.js";
import { loadDocsContent } from "../services/docs.js";
import { askCopilot, CopilotProviderError } from "../services/providers/copilotProvider.js";
import type { ScriptVendor } from "../services/providers/vendorCatalog.js";
import type { CopilotConversation, CopilotMessage } from "../types.js";

const TITLE_MAX_LENGTH = 60;

async function getOwnedConversation(
  id: string,
  tenantId: string,
  userId: string,
): Promise<CopilotConversation | undefined> {
  const { rows } = await pool.query<CopilotConversation>(
    "SELECT * FROM copilot_conversations WHERE id = $1 AND tenant_id = $2 AND user_id = $3",
    [id, tenantId, userId],
  );
  return rows[0];
}

export async function copilotRoutes(app: FastifyInstance): Promise<void> {
  app.get("/copilot/conversations", async (req) => {
    const { rows } = await pool.query<CopilotConversation>(
      "SELECT * FROM copilot_conversations WHERE tenant_id = $1 AND user_id = $2 ORDER BY updated_at DESC",
      [req.tenantId, req.userId],
    );
    return rows;
  });

  app.post("/copilot/conversations", async (req, reply) => {
    const { rows } = await pool.query<CopilotConversation>(
      "INSERT INTO copilot_conversations (tenant_id, user_id) VALUES ($1, $2) RETURNING *",
      [req.tenantId, req.userId],
    );
    return reply.code(201).send(rows[0]);
  });

  app.get<{ Params: { id: string } }>("/copilot/conversations/:id/messages", async (req, reply) => {
    const conversation = await getOwnedConversation(req.params.id, req.tenantId, req.userId);
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

    const { rows } = await pool.query<CopilotMessage>(
      "SELECT * FROM copilot_messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [conversation.id],
    );
    return rows;
  });

  app.post<{ Params: { id: string }; Body: { content: string } }>(
    "/copilot/conversations/:id/messages",
    async (req, reply) => {
      const conversation = await getOwnedConversation(req.params.id, req.tenantId, req.userId);
      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

      const { content } = req.body;
      if (!content?.trim()) return reply.code(400).send({ error: "Message content is required" });

      const credential = await getCredential(req.tenantId, "script");
      if (!credential) {
        return reply.code(400).send({
          error: "no_script_credential",
          message:
            "Connect the script-generation provider's API key in Settings to use the copilot.",
        });
      }

      await pool.query(
        "INSERT INTO copilot_messages (conversation_id, tenant_id, role, content) VALUES ($1, $2, 'user', $3)",
        [conversation.id, req.tenantId, content],
      );

      const { rows: historyRows } = await pool.query<CopilotMessage>(
        "SELECT * FROM copilot_messages WHERE conversation_id = $1 ORDER BY created_at ASC",
        [conversation.id],
      );

      const docsContent = await loadDocsContent();
      let replyText: string;
      try {
        replyText = await askCopilot({
          apiKey: credential.apiKey,
          vendor: credential.vendor as ScriptVendor,
          tenantId: req.tenantId,
          docsContent,
          history: historyRows.map((m) => ({ role: m.role, content: m.content })),
        });
      } catch (err) {
        if (err instanceof CopilotProviderError) {
          return reply.code(502).send({ error: "copilot_provider_error", message: err.message });
        }
        throw err;
      }

      const { rows: assistantRows } = await pool.query<CopilotMessage>(
        "INSERT INTO copilot_messages (conversation_id, tenant_id, role, content) VALUES ($1, $2, 'assistant', $3) RETURNING *",
        [conversation.id, req.tenantId, replyText],
      );

      const title = conversation.title ?? content.slice(0, TITLE_MAX_LENGTH);
      const { rows: updatedRows } = await pool.query<CopilotConversation>(
        "UPDATE copilot_conversations SET title = $2, updated_at = now() WHERE id = $1 RETURNING *",
        [conversation.id, title],
      );

      return reply.code(201).send({ conversation: updatedRows[0], message: assistantRows[0] });
    },
  );

  app.delete<{ Params: { id: string } }>("/copilot/conversations/:id", async (req, reply) => {
    await pool.query("DELETE FROM copilot_conversations WHERE id = $1 AND tenant_id = $2 AND user_id = $3", [
      req.params.id,
      req.tenantId,
      req.userId,
    ]);
    return reply.code(204).send();
  });
}
