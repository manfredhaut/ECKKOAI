/**
 * Chaves da plataforma — leitura de METADADO, escrita, e validação.
 *
 * Registrado dentro do bloco protegido por requireAdmin (ver app.ts). Não
 * existe equivalente em nível de tenant nem público, e não deve existir: estas
 * chaves são da casa.
 *
 * INVARIANTE DESTE ARQUIVO: ele nunca vê uma chave em claro. Não menciona
 * `decrypt(`, não chama `resolvePlatformKey`, e a validação acontece atrás de
 * `validatePlatformCredential`, que devolve só o resultado. `npm run check`
 * cobra isso textualmente — a escrita é possível, a leitura de volta não.
 */
import type { FastifyInstance } from "fastify";
import { isPlatformCredentialId } from "../services/platformCredentials.js";
import { listPlatformCredentials, setPlatformKey } from "../services/platformCredentialStore.js";
import { validatePlatformCredential } from "../services/platformCredentialValidation.js";
import { recordAuditLog } from "../services/auditLog.js";

export async function adminPlatformCredentialRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/platform-credentials", async () => listPlatformCredentials());

  app.put<{ Params: { id: string }; Body: { apiKey?: string } }>(
    "/admin/platform-credentials/:id",
    async (req, reply) => {
      const { id } = req.params;
      if (!isPlatformCredentialId(id)) {
        return reply.code(400).send({ error: "unknown_credential" });
      }

      // `trim()` porque colar de um gerenciador de senhas costuma trazer um
      // \n junto, e uma chave com espaço em branco no fim é recusada pelo
      // fornecedor com um erro que não menciona espaço nenhum.
      const apiKey = req.body?.apiKey?.trim();
      if (!apiKey) {
        return reply.code(400).send({ error: "api_key_required" });
      }

      return setPlatformKey(id, apiKey, req.adminUserId);
    },
  );

  // Só roda a partir do clique. Uma chamada por clique, sempre de leitura —
  // ver services/providers/platformKeyProbe.ts.
  app.post<{ Params: { id: string } }>("/admin/platform-credentials/:id/validate", async (req, reply) => {
    const { id } = req.params;
    if (!isPlatformCredentialId(id)) {
      return reply.code(400).send({ error: "unknown_credential" });
    }

    const outcome = await validatePlatformCredential(id);
    if ("notConfigured" in outcome) {
      return reply.code(400).send({ error: "not_configured" });
    }

    await recordAuditLog({
      tenantId: null,
      actorAdminUserId: req.adminUserId,
      action: `platform_credential.${id}.validate`,
      before: null,
      after: { ok: outcome.ok },
    });

    return outcome;
  });
}
