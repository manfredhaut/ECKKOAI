import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { costBasisNote, costFor } from "../services/billing/providerCost.js";
import { decrypt, encrypt, maskKey } from "../services/crypto.js";
import { recordAuditLog } from "../services/auditLog.js";
import { defaultVendor, hasConnectionProbe, isValidVendor } from "../services/providers/vendorCatalog.js";
import type { AvatarVendor, ScriptVendor } from "../services/providers/vendorCatalog.js";
import { checkAvatarConnection } from "../services/providers/avatarProvider.js";
import { checkElevenLabsConnection } from "../services/providers/voiceProvider.js";
import { AiEmptyResponseError, complete } from "../services/providers/providerRegistry.js";
import { STORAGE_PROVIDER_IDS, type StorageProviderId } from "../services/providers/storageProvider.js";
import { getAllPlansIncludingInactive, createPlan, updatePlan } from "../plans.js";
import { runMonthlyGrantSweep } from "../services/billing/monthlyGrant.js";
import { getFeatureFlags, setFeatureFlag } from "../services/featureFlagStore.js";
import { config } from "../config.js";
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

  // Tests the credential ALREADY STORED for this tenant — the key never
  // travels over the wire again, and the caller can't smuggle in a
  // different one. Strictly on demand (a click in the admin "APIs" tab);
  // nothing calls this on page load, because a test is a real billable
  // call against the vendor for script vendors. Avatar/voice hit a plain
  // listing endpoint (free); script spends a handful of tokens.
  //
  // Deliberately does NOT write `connected` (or any other column): that
  // flag means "a key is stored", and a failing test doesn't unstore it.
  // The result is reported to the caller and audit-logged, not persisted
  // as state — no schema change (see CLAUDE.md / admin panel plan).
  app.post<{ Params: { tenantId: string; provider: string } }>(
    "/admin/tenants/:tenantId/credentials/:provider/test",
    async (req, reply) => {
      const { tenantId, provider } = req.params;
      if (!isProvider(provider)) return reply.code(400).send({ error: "Unknown provider" });

      const tenant = await getTenantOr404(tenantId);
      if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

      const { rows } = await pool.query<CredentialRow>(
        "SELECT * FROM api_credentials WHERE tenant_id = $1 AND provider = $2",
        [tenantId, provider],
      );
      const credential = rows[0];
      if (!credential?.encrypted_key) {
        return reply.code(400).send({ error: "no_credential", message: "No API key stored for this provider." });
      }

      const vendor = credential.vendor ?? defaultVendor(provider);

      // TRAVA DE VAZAMENTO, e ela vem ANTES do `decrypt` de propósito: a chave
      // em claro não chega sequer a existir nesta função para um vendor sem
      // sonda.
      //
      // `checkAvatarConnection` decide por ternário — `vendor === "did" ? did :
      // heygen` —, e um ternário não tem ramo "nenhum dos dois". Sem esta
      // recusa, testar a credencial de um vendor novo (fal, hoje) mandaria a
      // chave DELE para `api.heygen.com` num `x-api-key`: não um teste que
      // falha, mas uma credencial entregue ao fornecedor errado, em claro, por
      // um clique num botão chamado "Testar".
      //
      // O `disabled` da tela cobre o mesmo caso e não substitui isto: ele é
      // sugestão de interface, e esta rota é alcançável sem passar por ela.
      if (!hasConnectionProbe(provider, vendor)) {
        return reply.code(400).send({
          error: "probe_unavailable",
          message:
            `No connection probe exists for vendor "${vendor}". The key was NOT sent anywhere — ` +
            "testing it would have to guess a provider, and guessing means handing the key to the " +
            "wrong one.",
        });
      }

      let apiKey: string;
      try {
        apiKey = decrypt(credential.encrypted_key);
      } catch {
        // A key encrypted under a different ENCRYPTION_KEY can't be read
        // back — surface it as a failed test instead of a 500.
        return { ok: false, message: "Stored key could not be decrypted (ENCRYPTION_KEY mismatch?)." };
      }

      let result: { ok: boolean; message: string | null };
      try {
        if (provider === "avatar") {
          await checkAvatarConnection(apiKey, vendor as AvatarVendor);
        } else if (provider === "voice") {
          await checkElevenLabsConnection(apiKey);
        } else {
          // Smallest useful real call — enough to prove the key is accepted
          // by the vendor without generating anything useful.
          //
          // Este ping responde "a chave é válida?", não "o modelo produz
          // texto?". A causa do falso negativo era confundir as duas: o
          // parser de geração exige uma parte de texto, e um modelo que
          // raciocina antes de responder pode gastar o orçamento inteiro
          // pensando e devolver 2xx sem texto nenhum. Subir o teto de tokens
          // (5 -> 64 -> 256) só tornava o acidente mais raro; não era
          // conserto. Desligar o raciocínio também não é caminho: o
          // `thinkingConfig` é rejeitado com 400 por este modelo (ver nota em
          // providerRegistry.ts).
          //
          // O conserto é responder a pergunta certa. Uma chave inválida,
          // revogada ou sem cota nunca produz 2xx — produz 400/401/403/429,
          // que continuam falhando aqui. Uma resposta 2xx sem texto prova
          // que o vendor aceitou a chave, e é isso que AiEmptyResponseError
          // representa. Por isso um teto baixo volta a bastar.
          try {
            await complete(vendor as ScriptVendor, {
              apiKey,
              messages: [{ role: "user", content: "ping" }],
              maxTokens: 16,
            });
          } catch (err) {
            if (!(err instanceof AiEmptyResponseError)) throw err;
          }
        }
        result = { ok: true, message: null };
      } catch (err) {
        result = { ok: false, message: err instanceof Error ? err.message : "Unknown error" };
      }

      await recordAuditLog({
        tenantId,
        actorAdminUserId: req.adminUserId,
        action: `credential.${provider}.test`,
        before: null,
        // Never the key or the vendor's raw error body beyond its message.
        after: { vendor, ok: result.ok },
      });

      return result;
    },
  );

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
  //
  // Ativar por aqui (status=active) é a válvula de EXCEÇÃO desde a
  // confirmação por e-mail (15/08/2026): o caminho principal para sair de
  // 'pending' é o link (GET /verify-email); este botão cobre o e-mail que
  // falhou ou não chegou. Por isso também limpa o token de verificação —
  // sem isso, um tenant aprovado na mão continuaria com um link de e-mail
  // válido perdido por aí, que reativaria (sem dano, mas sem propósito) a
  // mesma conta que o admin já liberou.
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
      if (status === "active") {
        await pool.query(
          "UPDATE tenants SET status = $1, email_verification_token = NULL, email_verification_expires_at = NULL WHERE id = $2",
          [status, tenantId],
        );
      } else {
        await pool.query("UPDATE tenants SET status = $1 WHERE id = $2", [status, tenantId]);
      }
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

  // Custo por tenant, agregado de provider_usage.
  //
  // O custo é DERIVADO da única medição real que existe
  // (billing/providerCost.ts) — esta consulta NÃO lê `estimated_cost_cents`
  // nem faz join com `provider_cost_rates`. Aquele caminho produzia a
  // estimativa que errou 4,5×, por dois motivos ao mesmo tempo: taxa palpite
  // e multiplicação sobre a duração pedida. Ver o comentário de
  // recordProviderUsage.
  //
  // Consumo sem medição de custo aparece com `cost: null` e um motivo legível,
  // NUNCA com zero: "custou nada" e "não sabemos" são afirmações diferentes, e
  // só uma delas é verdadeira aqui.
  app.get<{ Params: { tenantId: string } }>("/admin/tenants/:tenantId/usage", async (req, reply) => {
    const tenant = await getTenantOr404(req.params.tenantId);
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    const { rows } = await pool.query<{
      provider: string;
      vendor: string;
      unit_type: string;
      total_units: string;
      attempts: string;
      failures: string;
    }>(
      `SELECT u.provider, u.vendor, u.unit_type,
              sum(u.unit_count) AS total_units,
              count(*) AS attempts,
              count(*) FILTER (WHERE u.outcome = 'failed') AS failures
       FROM provider_usage u
       WHERE u.tenant_id = $1
       GROUP BY u.provider, u.vendor, u.unit_type
       ORDER BY u.provider, u.vendor, u.unit_type`,
      [tenant.id],
    );

    const breakdown = rows.map((r) => {
      const totalUnits = Number(r.total_units);
      const cost = costFor({
        provider: r.provider,
        vendor: r.vendor,
        unitType: r.unit_type,
        unitCount: totalUnits,
      });
      return {
        provider: r.provider,
        vendor: r.vendor,
        unitType: r.unit_type,
        totalUnits,
        attempts: Number(r.attempts),
        failures: Number(r.failures),
        costUsd: cost.known ? cost.usd : null,
        costUnknownReason: cost.known ? null : cost.explanation,
      };
    });

    const medidos = breakdown.filter((b) => b.costUsd !== null);
    return {
      breakdown,
      // Soma só o que tem custo medido, e diz quantas linhas ficaram de fora.
      // Somar ausências como zero produziria um total que parece completo e
      // não é — exatamente o defeito que este bloco fechou.
      totalCostUsd: medidos.reduce((sum, b) => sum + (b.costUsd ?? 0), 0),
      linesWithoutCost: breakdown.length - medidos.length,
      costBasis: costBasisNote(),
    };
  });

  // Consumo de crédito separado em REAL e SIMULADO.
  //
  // Os dois nunca são somados num número só: um total que mistura geração
  // que custou dinheiro com geração de fixture é pior que não ter total
  // nenhum, porque parece uma medida e não é. Quem quiser a soma que a
  // faça sabendo o que está somando.
  app.get<{ Params: { tenantId: string } }>("/admin/tenants/:tenantId/credit-usage", async (req, reply) => {
    const tenant = await getTenantOr404(req.params.tenantId);
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    const { rows } = await pool.query<{
      credit_type: string;
      simulated: boolean;
      consumed: string;
      entries: string;
    }>(
      `SELECT credit_type, simulated,
              sum(-delta) AS consumed,
              count(*)    AS entries
       FROM credit_ledger
       WHERE tenant_id = $1 AND reason = 'consumption'
       GROUP BY credit_type, simulated
       ORDER BY credit_type, simulated`,
      [tenant.id],
    );

    const pick = (simulated: boolean) =>
      rows
        .filter((r) => r.simulated === simulated)
        .map((r) => ({
          creditType: r.credit_type,
          consumed: Number(r.consumed),
          entries: Number(r.entries),
        }));

    return {
      real: pick(false),
      simulated: pick(true),
      providerMode: config.providerMode,
    };
  });

  // Feature flags: alternáveis daqui, sem rebuild e sem deploy.
  app.get("/admin/feature-flags", async () => ({
    flags: await getFeatureFlags(),
    providerMode: config.providerMode,
  }));

  app.put<{ Params: { key: string }; Body: { enabled: boolean } }>(
    "/admin/feature-flags/:key",
    async (req, reply) => {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return reply.code(400).send({ error: "invalid_state", message: "enabled deve ser booleano." });
      }

      const before = (await getFeatureFlags()).find((f) => f.key === req.params.key) ?? null;
      const updated = await setFeatureFlag(req.params.key, enabled, req.adminUserId!);
      if (!updated) {
        // Chave fora do registro do código — recusa em vez de gravar, para
        // o banco nunca divergir do catálogo.
        return reply.code(404).send({ error: "unknown_flag", message: "Flag não existe no registro." });
      }

      await recordAuditLog({
        tenantId: null,
        actorAdminUserId: req.adminUserId!,
        action: "feature_flag.updated",
        before,
        after: updated,
      });
      return updated;
    },
  );

  // A tela de taxas manuais foi REMOVIDA no bloco 4A junto com a tabela que
  // ela editava. O custo passou a derivar da única medição real que existe
  // (billing/providerCost.ts); um editor de taxas ao lado disso seria uma
  // segunda verdade sobre dinheiro, e foi a primeira que errou 4,5x.

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
