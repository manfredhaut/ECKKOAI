import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { encrypt, maskKey } from "../services/crypto.js";
import { recordAuditLog } from "../services/auditLog.js";
import { defaultVendor, isValidVendor } from "../services/providers/vendorCatalog.js";
import { STORAGE_PROVIDER_IDS, type StorageProviderId } from "../services/providers/storageProvider.js";
import { getAllPlansIncludingInactive, createPlan, updatePlan } from "../plans.js";
import { runMonthlyGrantSweep } from "../services/billing/monthlyGrant.js";
import type { CredentialProvider, Tenant } from "../types.js";

const PLAN_ID_PATTERN = /^[a-z0-9-]+$/;

const PROVIDERS: CredentialProvider[] = ["avatar", "voice", "script"];

interface CredentialRow {
  provider: CredentialProvider;
  encrypted_key: string | null;
  vendor: string | null;
  connected: boolean;
  updated_at: string;
}

function isProvider(value: string): value is CredentialProvider {
  return (PROVIDERS as string[]).includes(value);
}

function isStorageProviderId(value: string): value is StorageProviderId {
  return (STORAGE_PROVIDER_IDS as string[]).includes(value);
}

// Never send encrypted_key (or its decrypted value) anywhere past this
// boundary — same rule as routes/credentials.ts.
function credentialToPublic(row: CredentialRow) {
  return {
    provider: row.provider,
    connected: row.connected,
    updated_at: row.updated_at,
    masked_key: row.encrypted_key ? maskKey(row.encrypted_key).slice(-8) : null,
    vendor: row.vendor ?? defaultVendor(row.provider),
  };
}

async function getTenantOr404(tenantId: string) {
  const { rows } = await pool.query<Tenant>("SELECT * FROM tenants WHERE id = $1", [tenantId]);
  return rows[0] ?? null;
}

// All routes here run behind requireAdmin (see app.ts) — every one of them
// is cross-tenant by nature, so every query below takes tenantId explicitly
// from the URL param, never from a session's own tenant (there is no such
// thing for an admin session). See CLAUDE.md / admin panel plan, Section 8.
export async function adminPanelRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/tenants", async () => {
    // Never select users.password_hash — this joins only non-sensitive columns.
    const { rows } = await pool.query<{
      id: string;
      name: string;
      slug: string;
      plan_id: string;
      status: string;
      created_at: string;
      connected_providers: string;
    }>(
      `SELECT t.id, t.name, t.slug, t.plan_id, t.status, t.created_at,
              coalesce(string_agg(c.provider, ',') FILTER (WHERE c.connected), '') AS connected_providers
       FROM tenants t
       LEFT JOIN api_credentials c ON c.tenant_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      planId: r.plan_id,
      status: r.status,
      createdAt: r.created_at,
      connectedProviders: r.connected_providers ? r.connected_providers.split(",") : [],
    }));
  });

  app.get<{ Params: { tenantId: string } }>("/admin/tenants/:tenantId", async (req, reply) => {
    const tenant = await getTenantOr404(req.params.tenantId);
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    const { rows: credentialRows } = await pool.query<CredentialRow>(
      "SELECT * FROM api_credentials WHERE tenant_id = $1 ORDER BY provider",
      [tenant.id],
    );

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      planId: tenant.plan_id,
      status: tenant.status,
      storageProvider: tenant.storage_provider,
      createdAt: tenant.created_at,
      credentials: credentialRows.map(credentialToPublic),
    };
  });

  app.put<{
    Params: { tenantId: string; provider: string };
    Body: { apiKey: string; vendor?: string };
  }>("/admin/tenants/:tenantId/credentials/:provider", async (req, reply) => {
    const { tenantId, provider } = req.params;
    if (!isProvider(provider)) return reply.code(400).send({ error: "Unknown provider" });

    const tenant = await getTenantOr404(tenantId);
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    const vendor = req.body.vendor ?? defaultVendor(provider);
    if (!isValidVendor(provider, vendor)) {
      return reply.code(400).send({ error: "Unknown vendor for this provider" });
    }

    const { rows: beforeRows } = await pool.query<CredentialRow>(
      "SELECT * FROM api_credentials WHERE tenant_id = $1 AND provider = $2",
      [tenantId, provider],
    );
    const before = beforeRows[0] ? credentialToPublic(beforeRows[0]) : null;

    const encrypted = encrypt(req.body.apiKey);
    const { rows } = await pool.query<CredentialRow>(
      `INSERT INTO api_credentials (tenant_id, provider, encrypted_key, vendor, connected, updated_at)
       VALUES ($1, $2, $3, $4, true, now())
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET encrypted_key = $3, vendor = $4, connected = true, updated_at = now()
       RETURNING *`,
      [tenantId, provider, encrypted, vendor],
    );
    const after = credentialToPublic(rows[0]);

    await recordAuditLog({
      tenantId,
      actorAdminUserId: req.adminUserId,
      action: `credential.${provider}.update`,
      before,
      after,
    });

    return after;
  });

  app.put<{ Params: { tenantId: string }; Body: { provider: string } }>(
    "/admin/tenants/:tenantId/storage-provider",
    async (req, reply) => {
      const { tenantId } = req.params;
      const { provider } = req.body;
      if (!isStorageProviderId(provider)) {
        return reply.code(400).send({ error: "Unknown storage provider" });
      }

      const tenant = await getTenantOr404(tenantId);
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

      const before = { storage_provider: tenant.storage_provider };
      await pool.query("UPDATE tenants SET storage_provider = $1 WHERE id = $2", [provider, tenantId]);
      const after = { storage_provider: provider };

      await recordAuditLog({
        tenantId,
        actorAdminUserId: req.adminUserId,
        action: "storage_provider.update",
        before,
        after,
      });

      return after;
    },
  );

  // Suspend/reactivate — blocks only generation/consumption routes (see
  // middleware/requireActiveTenant.ts), not login or read access. See
  // CLAUDE.md / billing plan, Fase 3.
  app.put<{ Params: { tenantId: string }; Body: { status: string } }>(
    "/admin/tenants/:tenantId/status",
    async (req, reply) => {
      const { tenantId } = req.params;
      const { status } = req.body;
      if (status !== "active" && status !== "suspended") {
        return reply.code(400).send({ error: "Status must be 'active' or 'suspended'" });
      }

      const tenant = await getTenantOr404(tenantId);
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

      const before = { status: tenant.status };
      await pool.query("UPDATE tenants SET status = $1 WHERE id = $2", [status, tenantId]);
      const after = { status };

      await recordAuditLog({
        tenantId,
        actorAdminUserId: req.adminUserId,
        action: "tenant.status.update",
        before,
        after,
      });

      return after;
    },
  );

  // Cost per tenant, aggregated from provider_usage (see
  // services/billing/usageTracking.ts). `verified` is false for a
  // provider/vendor/unit_type row whenever provider_cost_rates.verified is
  // false (or the rate has since been deleted) — the frontend must label
  // the whole total as an ESTIMATE, not "real cost", unless every row
  // rolled into it is verified. See CLAUDE.md / billing plan, Fase 1.
  app.get<{ Params: { tenantId: string } }>("/admin/tenants/:tenantId/usage", async (req, reply) => {
    const tenant = await getTenantOr404(req.params.tenantId);
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    const { rows } = await pool.query<{
      provider: string;
      vendor: string;
      unit_type: string;
      total_units: string;
      total_estimated_cost_cents: string;
      verified: boolean;
    }>(
      `SELECT u.provider, u.vendor, u.unit_type,
              sum(u.unit_count) AS total_units,
              sum(u.estimated_cost_cents) AS total_estimated_cost_cents,
              bool_and(coalesce(r.verified, false)) AS verified
       FROM provider_usage u
       LEFT JOIN provider_cost_rates r
         ON r.provider = u.provider AND r.vendor = u.vendor AND r.unit_type = u.unit_type
       WHERE u.tenant_id = $1
       GROUP BY u.provider, u.vendor, u.unit_type
       ORDER BY u.provider, u.vendor, u.unit_type`,
      [tenant.id],
    );

    const breakdown = rows.map((r) => ({
      provider: r.provider,
      vendor: r.vendor,
      unitType: r.unit_type,
      totalUnits: Number(r.total_units),
      totalEstimatedCostCents: Number(r.total_estimated_cost_cents),
      verified: r.verified,
    }));

    return {
      breakdown,
      totalEstimatedCostCents: breakdown.reduce((sum, b) => sum + b.totalEstimatedCostCents, 0),
      // true only if there's usage AND every rate behind it is verified —
      // an empty tenant (no usage yet) reports false on purpose, not true,
      // so the UI never shows a bare "R$0,00 real" that could be mistaken
      // for "nothing to verify" instead of "nothing recorded yet".
      allRatesVerified: breakdown.length > 0 && breakdown.every((b) => b.verified),
    };
  });

  // Admin-editable rate card (see migration 022/026). Not tenant-scoped —
  // one global table shared by every tenant's cost estimate.
  app.get("/admin/cost-rates", async () => {
    const { rows } = await pool.query(
      "SELECT * FROM provider_cost_rates ORDER BY provider, vendor, unit_type",
    );
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      vendor: r.vendor,
      unitType: r.unit_type,
      costPerUnitCents: Number(r.cost_per_unit_cents),
      verified: r.verified,
      updatedAt: r.updated_at,
    }));
  });

  app.put<{ Params: { id: string }; Body: { costPerUnitCents: number; verified: boolean } }>(
    "/admin/cost-rates/:id",
    async (req, reply) => {
      const { rows: beforeRows } = await pool.query("SELECT * FROM provider_cost_rates WHERE id = $1", [
        req.params.id,
      ]);
      const beforeRow = beforeRows[0];
      if (!beforeRow) return reply.code(404).send({ error: "Cost rate not found" });

      const { rows } = await pool.query(
        `UPDATE provider_cost_rates
         SET cost_per_unit_cents = $2, verified = $3, updated_at = now(), updated_by_admin_user_id = $4
         WHERE id = $1
         RETURNING *`,
        [req.params.id, req.body.costPerUnitCents, req.body.verified, req.adminUserId],
      );
      const after = rows[0];

      await recordAuditLog({
        tenantId: null,
        actorAdminUserId: req.adminUserId,
        action: `cost_rate.${after.provider}.${after.vendor}.${after.unit_type}.update`,
        before: { cost_per_unit_cents: beforeRow.cost_per_unit_cents, verified: beforeRow.verified },
        after: { cost_per_unit_cents: after.cost_per_unit_cents, verified: after.verified },
      });

      return {
        id: after.id,
        provider: after.provider,
        vendor: after.vendor,
        unitType: after.unit_type,
        costPerUnitCents: Number(after.cost_per_unit_cents),
        verified: after.verified,
        updatedAt: after.updated_at,
      };
    },
  );

  // Plan management — the `plans` table (migration 020) is the source of
  // truth (see plans.ts); no hard delete, only `active: false` (see
  // updatePlan's comment). Includes inactive plans, unlike the tenant-facing
  // GET /subscription's availablePlans.
  app.get("/admin/plans", async () => getAllPlansIncludingInactive());

  app.post<{
    Body: {
      id: string;
      name: string;
      priceCents: number;
      videoLimitPerMonth: number;
      scriptLimitPerMonth: number;
      avatarLimitPerMonth: number;
      features: string[];
      stripePriceId?: string | null;
    };
  }>("/admin/plans", async (req, reply) => {
    const { id, name, priceCents, videoLimitPerMonth, scriptLimitPerMonth, avatarLimitPerMonth, features, stripePriceId } =
      req.body;
    if (!id || !PLAN_ID_PATTERN.test(id)) {
      return reply.code(400).send({ error: "Plan id must be lowercase letters, numbers, and hyphens only" });
    }
    if (!name?.trim()) return reply.code(400).send({ error: "Name is required" });
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      return reply.code(400).send({ error: "priceCents must be a non-negative integer" });
    }
    if (!Number.isInteger(videoLimitPerMonth) || videoLimitPerMonth <= 0) {
      return reply.code(400).send({ error: "videoLimitPerMonth must be a positive integer" });
    }
    if (!Number.isInteger(scriptLimitPerMonth) || scriptLimitPerMonth <= 0) {
      return reply.code(400).send({ error: "scriptLimitPerMonth must be a positive integer" });
    }
    if (!Number.isInteger(avatarLimitPerMonth) || avatarLimitPerMonth <= 0) {
      return reply.code(400).send({ error: "avatarLimitPerMonth must be a positive integer" });
    }

    const existing = await getAllPlansIncludingInactive();
    if (existing.some((p) => p.id === id)) {
      return reply.code(409).send({ error: "A plan with this id already exists" });
    }

    const after = await createPlan({
      id,
      name: name.trim(),
      priceCents,
      videoLimitPerMonth,
      scriptLimitPerMonth,
      avatarLimitPerMonth,
      features: features ?? [],
      stripePriceId: stripePriceId ?? null,
    });

    await recordAuditLog({
      tenantId: null,
      actorAdminUserId: req.adminUserId,
      action: `plan.${id}.create`,
      before: null,
      after,
    });

    return reply.code(201).send(after);
  });

  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      priceCents?: number;
      videoLimitPerMonth?: number;
      scriptLimitPerMonth?: number;
      avatarLimitPerMonth?: number;
      features?: string[];
      stripePriceId?: string | null;
      active?: boolean;
    };
  }>("/admin/plans/:id", async (req, reply) => {
    const existing = await getAllPlansIncludingInactive();
    const before = existing.find((p) => p.id === req.params.id);
    if (!before) return reply.code(404).send({ error: "Plan not found" });

    if (req.body.priceCents !== undefined && (!Number.isInteger(req.body.priceCents) || req.body.priceCents < 0)) {
      return reply.code(400).send({ error: "priceCents must be a non-negative integer" });
    }
    if (
      req.body.videoLimitPerMonth !== undefined &&
      (!Number.isInteger(req.body.videoLimitPerMonth) || req.body.videoLimitPerMonth <= 0)
    ) {
      return reply.code(400).send({ error: "videoLimitPerMonth must be a positive integer" });
    }
    if (
      req.body.scriptLimitPerMonth !== undefined &&
      (!Number.isInteger(req.body.scriptLimitPerMonth) || req.body.scriptLimitPerMonth <= 0)
    ) {
      return reply.code(400).send({ error: "scriptLimitPerMonth must be a positive integer" });
    }
    if (
      req.body.avatarLimitPerMonth !== undefined &&
      (!Number.isInteger(req.body.avatarLimitPerMonth) || req.body.avatarLimitPerMonth <= 0)
    ) {
      return reply.code(400).send({ error: "avatarLimitPerMonth must be a positive integer" });
    }

    const after = await updatePlan(req.params.id, req.body);

    await recordAuditLog({
      tenantId: null,
      actorAdminUserId: req.adminUserId,
      action: `plan.${req.params.id}.update`,
      before,
      after,
    });

    return after;
  });

  // Manual trigger for the same sweep that runs automatically at boot and
  // every 24h (see services/billing/monthlyGrant.ts) — idempotent per
  // tenant/credit_type/month, so calling this doesn't risk double-granting.
  // Useful to backfill existing tenants right after deploying this feature
  // without waiting for the next boot/interval, and as a manual recovery
  // lever if the scheduled sweep didn't run for some reason.
  app.post("/admin/credits/run-monthly-grant", async (req) => {
    const result = await runMonthlyGrantSweep();

    await recordAuditLog({
      tenantId: null,
      actorAdminUserId: req.adminUserId,
      action: "credits.monthly_grant_sweep.manual_trigger",
      before: null,
      after: result,
    });

    return result;
  });
}
