import { pool } from "../db/pool.js";

// Never pass secret plaintext/ciphertext as `before`/`after` — only
// non-sensitive metadata (vendor, connected flag, masked key, etc.). See
// routes/adminPanel.ts call sites. `actorAdminUserId: null` is reserved for
// system-driven actions with no admin behind them — by convention `action`
// must carry a prefix identifying which system triggered it whenever actor
// is null, so a null actor always reads as "system: <what>", never as a
// forgotten value. Established prefixes: "stripe." (a Stripe webhook — see
// routes/stripeWebhook.ts, Fase 4), "system." (an in-process scheduled job
// with no external trigger — see services/billing/monthlyGrant.ts).
export async function recordAuditLog(entry: {
  tenantId: string | null;
  actorAdminUserId: string | null;
  action: string;
  before: unknown;
  after: unknown;
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (tenant_id, actor_admin_user_id, action, before, after)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      entry.tenantId,
      entry.actorAdminUserId,
      entry.action,
      JSON.stringify(entry.before),
      JSON.stringify(entry.after),
    ],
  );
}
