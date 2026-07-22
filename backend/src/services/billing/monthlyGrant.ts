import { pool } from "../../db/pool.js";
import { getPlan } from "../../plans.js";

type CreditType = "video" | "script" | "avatar";
type GrantOutcome = "granted" | "skipped" | "failed";

const CREDIT_TYPES: CreditType[] = ["video", "script", "avatar"];

export interface GrantBatchResult {
  granted: number;
  skipped: number;
  failed: number;
}

function emptyResult(): GrantBatchResult {
  return { granted: 0, skipped: 0, failed: 0 };
}

async function planLimitsForTenant(tenantId: string): Promise<Record<CreditType, number> | null> {
  const { rows } = await pool.query<{ plan_id: string }>("SELECT plan_id FROM tenants WHERE id = $1", [
    tenantId,
  ]);
  if (!rows[0]) return null;

  const plan = await getPlan(rows[0].plan_id);
  return {
    video: plan.videoLimitPerMonth,
    script: plan.scriptLimitPerMonth,
    avatar: plan.avatarLimitPerMonth,
  };
}

// Resets tenant_credits to planLimit for one tenant/credit_type — "use it
// or lose it" (confirmed business decision: unused balance does NOT carry
// over). Shared by both entry points below; the only thing that differs
// between them is `checkMonthlyIdempotency`.
//
// Idempotency (when checkMonthlyIdempotency is true) is enforced by
// locking the tenant_credits row first (FOR UPDATE), THEN checking
// credit_ledger for an existing reason='grant' row this month — in that
// order, not the reverse, so two calls racing on the same tenant/credit_type
// (e.g. the 24h sweep firing while a checkout webhook lands at the same
// moment) serialize on the row lock and the second one reliably sees the
// first's already-committed grant before deciding whether to grant again.
async function applyGrant(
  tenantId: string,
  creditType: CreditType,
  planLimit: number,
  checkMonthlyIdempotency: boolean,
): Promise<GrantOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: balanceRows } = await client.query<{ balance: number }>(
      "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = $2 FOR UPDATE",
      [tenantId, creditType],
    );

    if (checkMonthlyIdempotency) {
      const { rows: alreadyGranted } = await client.query(
        `SELECT 1 FROM credit_ledger
         WHERE tenant_id = $1 AND credit_type = $2 AND reason = 'grant'
           AND created_at >= date_trunc('month', now())`,
        [tenantId, creditType],
      );
      if (alreadyGranted[0]) {
        await client.query("ROLLBACK");
        return "skipped";
      }
    }

    const currentBalance = balanceRows[0]?.balance ?? 0;
    // Reset semantics: balance becomes exactly planLimit, not
    // balance+planLimit. delta reflects the real movement so sum(delta)
    // over credit_ledger keeps matching tenant_credits.balance (see
    // migration 024). Guarded at <= 0 so a 'grant' row is never recorded
    // with a zero/negative delta — this is also what makes a downgrade
    // safe with no extra code: a lower planLimit than the current balance
    // just skips here, never clawing anything back.
    const delta = planLimit - currentBalance;
    if (delta <= 0) {
      await client.query("COMMIT");
      return "skipped";
    }

    if (balanceRows[0]) {
      await client.query(
        "UPDATE tenant_credits SET balance = $3, updated_at = now() WHERE tenant_id = $1 AND credit_type = $2",
        [tenantId, creditType, planLimit],
      );
    } else {
      // Defensive only — every tenant should already have this row
      // (migration 028's backfill for existing tenants, the signup
      // transaction for new ones).
      await client.query(
        "INSERT INTO tenant_credits (tenant_id, credit_type, balance) VALUES ($1, $2, $3)",
        [tenantId, creditType, planLimit],
      );
    }

    await client.query(
      `INSERT INTO credit_ledger (tenant_id, credit_type, delta, reason)
       VALUES ($1, $2, $3, 'grant')`,
      [tenantId, creditType, delta],
    );

    await client.query("COMMIT");
    return "granted";
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`Grant failed for tenant ${tenantId} / ${creditType}`, err);
    return "failed";
  } finally {
    client.release();
  }
}

// Routine monthly cadence — safe to call as often as you like (boot, every
// 24h, manual admin trigger). checkMonthlyIdempotency=true means a grant
// already recorded this calendar month is always a no-op, which is what
// makes running it on every boot (not just at an exact clock time) a
// reasonable way to self-heal a missed window instead of a bug. Suspended
// tenants are granted too — they just can't spend it while
// requireActiveTenant blocks generation.
export async function runMonthlyGrantSweep(): Promise<GrantBatchResult> {
  const { rows: tenants } = await pool.query<{ id: string; plan_id: string }>(
    "SELECT id, plan_id FROM tenants",
  );

  const result = emptyResult();
  for (const tenant of tenants) {
    const plan = await getPlan(tenant.plan_id);
    const planLimitByType: Record<CreditType, number> = {
      video: plan.videoLimitPerMonth,
      script: plan.scriptLimitPerMonth,
      avatar: plan.avatarLimitPerMonth,
    };
    for (const creditType of CREDIT_TYPES) {
      const outcome = await applyGrant(tenant.id, creditType, planLimitByType[creditType], true);
      result[outcome] += 1;
    }
  }
  return result;
}

// Plan-change top-up — called right after a tenant's plan_id changes (see
// routes/stripeWebhook.ts, checkout.session.completed) so an upgrade takes
// effect immediately instead of waiting for the next monthly sweep.
// Deliberately skips the monthly-idempotency check: this is not the
// routine calendar-month cycle, it's a distinct "plan just changed" event,
// and gating it on "already granted this month" would leave a tenant who
// upgrades mid-month stuck on their old (lower) balance until next month.
// Safe against double-granting on its own merits: the delta<=0 guard in
// applyGrant() means calling this twice in a row (or right before the
// routine sweep runs) is a no-op the second time, since the balance is
// already at the new plan's limit.
export async function grantPlanChangeTopUp(tenantId: string): Promise<GrantBatchResult> {
  const planLimitByType = await planLimitsForTenant(tenantId);
  if (!planLimitByType) return emptyResult();

  const result = emptyResult();
  for (const creditType of CREDIT_TYPES) {
    const outcome = await applyGrant(tenantId, creditType, planLimitByType[creditType], false);
    result[outcome] += 1;
  }
  return result;
}
