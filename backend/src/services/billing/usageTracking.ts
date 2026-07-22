import { pool } from "../../db/pool.js";

export type MeteredProvider = "avatar" | "voice" | "script";
export type MeteredUnitType = "seconds" | "characters" | "tokens_in" | "tokens_out";

export interface RecordUsageInput {
  tenantId: string;
  videoId?: string | null;
  provider: MeteredProvider;
  vendor: string;
  unitType: MeteredUnitType;
  unitCount: number;
}

// Writes one row to provider_usage (see migration 023) per billable
// provider call. The rate is looked up and snapshotted at call time — if
// an admin edits provider_cost_rates later, this row's estimated_cost_cents
// never changes retroactively (see CLAUDE.md / billing plan, Fase 1).
//
// IMPORTANT: estimated_cost_cents is exactly that — an ESTIMATE from a
// manually maintained rate table, not a number any vendor actually
// returned. Every reader of provider_usage (admin usage endpoint, UI) must
// treat it as unverified unless provider_cost_rates.verified is true for
// that provider/vendor/unit_type — this function does not enforce that,
// it only records.
//
// Deliberately never throws: recording usage is secondary telemetry and
// must never break the actual user-facing action (a video going ready, a
// script coming back) if it fails.
export async function recordProviderUsage(input: RecordUsageInput): Promise<void> {
  try {
    const { rows } = await pool.query<{ cost_per_unit_cents: string }>(
      "SELECT cost_per_unit_cents FROM provider_cost_rates WHERE provider = $1 AND vendor = $2 AND unit_type = $3",
      [input.provider, input.vendor, input.unitType],
    );
    if (!rows[0]) {
      console.error(
        `recordProviderUsage: no cost rate configured for ${input.provider}/${input.vendor}/${input.unitType} — recording usage with 0 estimated cost`,
      );
    }
    const rate = rows[0] ? Number(rows[0].cost_per_unit_cents) : 0;
    const estimatedCostCents = rate * input.unitCount;

    await pool.query(
      `INSERT INTO provider_usage
         (tenant_id, video_id, provider, vendor, unit_type, unit_count, rate_snapshot_cents_per_unit, estimated_cost_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.tenantId,
        input.videoId ?? null,
        input.provider,
        input.vendor,
        input.unitType,
        input.unitCount,
        rate,
        estimatedCostCents,
      ],
    );
  } catch (err) {
    console.error("recordProviderUsage failed", input, err);
  }
}
