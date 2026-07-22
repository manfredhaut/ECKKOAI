import { pool } from "../../db/pool.js";

export type CreditType = "video" | "script" | "avatar";

export interface DebitCreditInput {
  tenantId: string;
  creditType: CreditType;
  amount?: number; // defaults to 1 — one debit per video/script/avatar attempt
  relatedVideoId?: string | null;
  relatedScriptGenerationId?: string | null;
  relatedAvatarTrainingId?: string | null;
}

export type DebitCreditResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "insufficient_credits"; balance: number };

// Debits `amount` (default 1) credits of `creditType` from the tenant's
// balance. A missing tenant_credits row — new signups don't seed the 3
// rows yet (migration 028, flagged there for a later step) — is treated as
// balance 0, not a bug: the gate must fail closed (insufficient_credits),
// never throw just because the row hasn't been provisioned.
//
// The balance read, the UPDATE...RETURNING, and the credit_ledger INSERT
// all run in one transaction (FOR UPDATE locks the row for the duration)
// so the cached balance and the immutable ledger can never diverge if one
// write fails after the other.
export async function debitCredit(input: DebitCreditInput): Promise<DebitCreditResult> {
  const amount = input.amount ?? 1;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: balanceRows } = await client.query<{ balance: number }>(
      "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = $2 FOR UPDATE",
      [input.tenantId, input.creditType],
    );
    const currentBalance = balanceRows[0]?.balance ?? 0;

    if (currentBalance < amount) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "insufficient_credits", balance: currentBalance };
    }

    const { rows: updatedRows } = await client.query<{ balance: number }>(
      `UPDATE tenant_credits SET balance = balance - $3, updated_at = now()
       WHERE tenant_id = $1 AND credit_type = $2
       RETURNING balance`,
      [input.tenantId, input.creditType, amount],
    );

    await client.query(
      `INSERT INTO credit_ledger
         (tenant_id, credit_type, delta, reason, related_video_id, related_script_generation_id, related_avatar_training_id)
       VALUES ($1, $2, $3, 'consumption', $4, $5, $6)`,
      [
        input.tenantId,
        input.creditType,
        -amount,
        input.relatedVideoId ?? null,
        input.relatedScriptGenerationId ?? null,
        input.relatedAvatarTrainingId ?? null,
      ],
    );

    await client.query("COMMIT");
    return { ok: true, balance: updatedRows[0].balance };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface GrantPurchasedCreditInput {
  tenantId: string;
  creditType: CreditType;
  quantity: number;
  stripePaymentIntentId: string;
}

export interface GrantPurchasedCreditResult {
  balance: number;
  alreadyGranted: boolean;
}

// Credits a one-off Stripe purchase (routes/stripeWebhook.ts,
// checkout.session.completed with metadata.type === 'credit_purchase').
// Stripe can and does redeliver the same webhook event, so this must be
// idempotent per payment_intent — not just "safe to call twice", but a
// guaranteed no-op the second time. Same lock-then-check ordering as
// monthlyGrant.ts's applyGrant(): lock the tenant_credits row first, THEN
// check credit_ledger for this payment_intent, so two deliveries racing
// each other serialize on the row lock instead of both passing the check.
export async function grantPurchasedCredit(
  input: GrantPurchasedCreditInput,
): Promise<GrantPurchasedCreditResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: balanceRows } = await client.query<{ balance: number }>(
      "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = $2 FOR UPDATE",
      [input.tenantId, input.creditType],
    );

    const { rows: existing } = await client.query(
      "SELECT 1 FROM credit_ledger WHERE stripe_payment_intent_id = $1 AND credit_type = $2",
      [input.stripePaymentIntentId, input.creditType],
    );
    if (existing[0]) {
      await client.query("ROLLBACK");
      return { balance: balanceRows[0]?.balance ?? 0, alreadyGranted: true };
    }

    let balance: number;
    if (balanceRows[0]) {
      const { rows: updated } = await client.query<{ balance: number }>(
        `UPDATE tenant_credits SET balance = balance + $3, updated_at = now()
         WHERE tenant_id = $1 AND credit_type = $2
         RETURNING balance`,
        [input.tenantId, input.creditType, input.quantity],
      );
      balance = updated[0].balance;
    } else {
      // Defensive only — every tenant should already have this row
      // (migration 028's backfill, and the signup transaction for new ones).
      const { rows: inserted } = await client.query<{ balance: number }>(
        "INSERT INTO tenant_credits (tenant_id, credit_type, balance) VALUES ($1, $2, $3) RETURNING balance",
        [input.tenantId, input.creditType, input.quantity],
      );
      balance = inserted[0].balance;
    }

    await client.query(
      `INSERT INTO credit_ledger (tenant_id, credit_type, delta, reason, stripe_payment_intent_id)
       VALUES ($1, $2, $3, 'purchase', $4)`,
      [input.tenantId, input.creditType, input.quantity, input.stripePaymentIntentId],
    );

    await client.query("COMMIT");
    return { balance, alreadyGranted: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
