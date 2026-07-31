import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { getCredential } from "../services/credentialLookup.js";
import { generateScript, ScriptProviderError } from "../services/providers/scriptProvider.js";
import type { ScriptVendor } from "../services/providers/vendorCatalog.js";
import { requireActiveTenant } from "../middleware/requireActiveTenant.js";
import { debitCredit } from "../services/billing/creditGate.js";

export async function scriptRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { prompt: string; targetSeconds?: number } }>("/scripts/generate", { preHandler: requireActiveTenant }, async (req, reply) => {
    const credential = await getCredential(req.tenantId, "script");
    if (!credential) {
      return reply.code(400).send({
        error: "no_script_credential",
        message: "Connect the script-generation provider's API key in Settings to generate a script.",
      });
    }

    // script_generations keeps recording one row per attempt — now pure
    // history/telemetry (see migration 027), no longer the enforcement
    // mechanism. debitCredit() below is what actually gates/consumes; it
    // links back to this row via related_script_generation_id.
    const { rows: generationRows } = await pool.query<{ id: string }>(
      "INSERT INTO script_generations (tenant_id) VALUES ($1) RETURNING id",
      [req.tenantId],
    );

    const debit = await debitCredit({
      tenantId: req.tenantId,
      creditType: "script",
      relatedScriptGenerationId: generationRows[0].id,
    });
    if (!debit.ok) {
      return reply.code(403).send({
        error: "plan_limit_reached",
        message: "Créditos esgotados — adicione créditos ou aguarde a renovação mensal do seu plano.",
      });
    }

    try {
      // targetSeconds vem do cliente quando informado, mas o default é a
      // configuração do servidor (services/script/scriptDuration.ts) — a
      // duração-alvo é decisão de produto, não do navegador.
      return await generateScript({
        apiKey: credential.apiKey,
        vendor: credential.vendor as ScriptVendor,
        prompt: req.body.prompt,
        tenantId: req.tenantId,
        targetSeconds: req.body.targetSeconds,
      });
    } catch (err) {
      if (err instanceof ScriptProviderError) {
        return reply.code(502).send({ error: "script_provider_error", message: err.message });
      }
      throw err;
    }
  });
}
