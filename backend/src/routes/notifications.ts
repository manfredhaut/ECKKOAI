import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import type { Notification } from "../types.js";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/notifications", async (req) => {
    const { rows } = await pool.query<Notification>(
      "SELECT * FROM notifications WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20",
      [req.tenantId],
    );
    return rows;
  });

  app.get("/notifications/summary", async (req) => {
    const { rows: unreadRows } = await pool.query<{ count: string }>(
      "SELECT count(*) FROM notifications WHERE tenant_id = $1 AND read = false",
      [req.tenantId],
    );
    const { rows: videoRows } = await pool.query<{ count: string }>(
      // Inclui `awaiting_approval` pelo mesmo motivo de `/jobs/processing`: é o
      // único estado que exige uma AÇÃO da pessoa, e o que expira sozinho em
      // 24 h descartando uma composição paga.
      "SELECT count(*) FROM videos WHERE tenant_id = $1 AND status IN ('queued', 'processing', 'awaiting_approval')",
      [req.tenantId],
    );
    const { rows: documentRows } = await pool.query<{ count: string }>(
      "SELECT count(*) FROM documents WHERE tenant_id = $1 AND status = 'processing'",
      [req.tenantId],
    );

    return {
      unreadCount: Number(unreadRows[0].count),
      processingJobs: Number(videoRows[0].count) + Number(documentRows[0].count),
    };
  });

  app.post("/notifications/read-all", async (req, reply) => {
    await pool.query("UPDATE notifications SET read = true WHERE tenant_id = $1 AND read = false", [
      req.tenantId,
    ]);
    return reply.code(204).send();
  });
}
