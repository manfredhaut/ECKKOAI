import { pool } from "../db/pool.js";

export async function createNotification(
  tenantId: string,
  type: string,
  message: string,
): Promise<void> {
  await pool.query(
    "INSERT INTO notifications (tenant_id, type, message) VALUES ($1, $2, $3)",
    [tenantId, type, message],
  );
}
