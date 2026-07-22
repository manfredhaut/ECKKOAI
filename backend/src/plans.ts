import { pool } from "./db/pool.js";

export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  videoLimitPerMonth: number;
  scriptLimitPerMonth: number;
  avatarLimitPerMonth: number;
  features: string[];
  stripePriceId: string | null;
  active: boolean;
}

interface PlanRow {
  id: string;
  name: string;
  price_cents: number;
  video_limit_per_month: number;
  script_limit_per_month: number;
  avatar_limit_per_month: number;
  features: string[];
  stripe_price_id: string | null;
  active: boolean;
}

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    videoLimitPerMonth: row.video_limit_per_month,
    scriptLimitPerMonth: row.script_limit_per_month,
    avatarLimitPerMonth: row.avatar_limit_per_month,
    features: row.features,
    stripePriceId: row.stripe_price_id,
    active: row.active,
  };
}

// The `plans` table (migration 020_plans_table.sql) is the source of truth —
// this file used to hold a hardcoded array; that array is now only the
// migration's seed data, so it and the table can't silently diverge. No
// in-memory cache on purpose: plan reads aren't a hot path (a handful of
// per-request queries), and correctness here matters more than shaving a
// round trip — see CLAUDE.md / billing plan.

// Only plans a tenant/admin should be able to newly select. A tenant
// already on a deactivated plan keeps it (see getPlan below) — this list
// is for "what can be chosen", not "what's valid to already have".
export async function getAllPlans(): Promise<Plan[]> {
  const { rows } = await pool.query<PlanRow>(
    "SELECT * FROM plans WHERE active = true ORDER BY price_cents ASC",
  );
  return rows.map(toPlan);
}

// Resolves a tenant's stored plan_id. Falls back to the cheapest plan if
// the id doesn't exist (defensive — plan_id has a DB-level FK now, so this
// should be unreachable in practice, but mirrors the old hardcoded
// behavior rather than throwing mid-request).
export async function getPlan(planId: string): Promise<Plan> {
  const found = await findPlan(planId);
  if (found) return found;
  const { rows } = await pool.query<PlanRow>("SELECT * FROM plans ORDER BY price_cents ASC LIMIT 1");
  return toPlan(rows[0]);
}

// Unlike getPlan, returns undefined instead of falling back — use this to
// validate a caller-supplied plan id (e.g. PUT /subscription/plan) where
// "not found" must be a 400, not a silent substitution.
export async function findPlan(planId: string): Promise<Plan | undefined> {
  const { rows } = await pool.query<PlanRow>("SELECT * FROM plans WHERE id = $1", [planId]);
  return rows[0] ? toPlan(rows[0]) : undefined;
}

// Admin-only: unlike getAllPlans, includes inactive plans — the admin
// panel needs to see (and reactivate) a deactivated plan, not just what a
// tenant can newly pick.
export async function getAllPlansIncludingInactive(): Promise<Plan[]> {
  const { rows } = await pool.query<PlanRow>("SELECT * FROM plans ORDER BY price_cents ASC");
  return rows.map(toPlan);
}

export interface CreatePlanInput {
  id: string;
  name: string;
  priceCents: number;
  videoLimitPerMonth: number;
  scriptLimitPerMonth: number;
  avatarLimitPerMonth: number;
  features: string[];
  stripePriceId?: string | null;
}

export async function createPlan(input: CreatePlanInput): Promise<Plan> {
  const { rows } = await pool.query<PlanRow>(
    `INSERT INTO plans (id, name, price_cents, video_limit_per_month, script_limit_per_month, avatar_limit_per_month, features, stripe_price_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      input.id,
      input.name,
      input.priceCents,
      input.videoLimitPerMonth,
      input.scriptLimitPerMonth,
      input.avatarLimitPerMonth,
      JSON.stringify(input.features),
      input.stripePriceId ?? null,
    ],
  );
  return toPlan(rows[0]);
}

export interface UpdatePlanInput {
  name?: string;
  priceCents?: number;
  videoLimitPerMonth?: number;
  scriptLimitPerMonth?: number;
  avatarLimitPerMonth?: number;
  features?: string[];
  stripePriceId?: string | null;
  active?: boolean;
}

// No hard delete on purpose — a plan a tenant is already on (tenants.plan_id
// has a FK to this table) must always resolve via getPlan. Retiring a plan
// from new signups is `active: false` (see getAllPlans, which filters on
// it); existing tenants on it are unaffected (getPlan doesn't filter).
export async function updatePlan(planId: string, input: UpdatePlanInput): Promise<Plan | undefined> {
  const { rows } = await pool.query<PlanRow>(
    `UPDATE plans SET
       name = COALESCE($2, name),
       price_cents = COALESCE($3, price_cents),
       video_limit_per_month = COALESCE($4, video_limit_per_month),
       script_limit_per_month = COALESCE($5, script_limit_per_month),
       avatar_limit_per_month = COALESCE($6, avatar_limit_per_month),
       features = COALESCE($7, features),
       stripe_price_id = COALESCE($8, stripe_price_id),
       active = COALESCE($9, active),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      planId,
      input.name ?? null,
      input.priceCents ?? null,
      input.videoLimitPerMonth ?? null,
      input.scriptLimitPerMonth ?? null,
      input.avatarLimitPerMonth ?? null,
      input.features ? JSON.stringify(input.features) : null,
      input.stripePriceId ?? null,
      input.active ?? null,
    ],
  );
  return rows[0] ? toPlan(rows[0]) : undefined;
}
