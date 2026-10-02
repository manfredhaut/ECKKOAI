/**
 * PAINEL-HIGGSFIELD-1, 01/10/2026 — configurações numéricas da plataforma,
 * editáveis pelo admin sem editar .env nem recriar container.
 *
 * Diferente de adminPlatformCredentials.ts: aqui o valor NÃO é segredo —
 * a rota de leitura devolve o número em uso agora, para a tela mostrar
 * antes de editar. Registrado no mesmo bloco protegido por requireAdmin
 * (ver app.ts).
 */
import type { FastifyInstance } from "fastify";
import {
  HIGGSFIELD_CONCURRENCY_LIMIT_ENV,
  DEFAULT_HIGGSFIELD_CONCURRENCY_LIMIT,
  HIGGSFIELD_TENANT_DAILY_LIMIT_ENV,
  DEFAULT_HIGGSFIELD_TENANT_DAILY_LIMIT,
  readIntEnv,
} from "../services/providers/higgsfieldLimits.js";
import { readPlatformSettingInt, setPlatformSettingInt } from "../services/platformSettingsStore.js";
import { recordAuditLog } from "../services/auditLog.js";

interface PlatformSettingDef {
  key: string;
  label: string;
  envVar: string;
  default: number;
}

/** Registro central — acrescente aqui quando um novo número virar editável. */
const PLATFORM_SETTINGS: PlatformSettingDef[] = [
  {
    key: HIGGSFIELD_CONCURRENCY_LIMIT_ENV,
    label: "Higgsfield — concorrência máxima (jobs simultâneos, todos os tenants)",
    envVar: HIGGSFIELD_CONCURRENCY_LIMIT_ENV,
    default: DEFAULT_HIGGSFIELD_CONCURRENCY_LIMIT,
  },
  {
    key: HIGGSFIELD_TENANT_DAILY_LIMIT_ENV,
    label: "Higgsfield — teto diário de jobs por tenant",
    envVar: HIGGSFIELD_TENANT_DAILY_LIMIT_ENV,
    default: DEFAULT_HIGGSFIELD_TENANT_DAILY_LIMIT,
  },
];

interface PlatformSettingView {
  key: string;
  label: string;
  value: number;
  source: "panel" | "env";
}

async function resolveSettingView(def: PlatformSettingDef): Promise<PlatformSettingView> {
  const fromDb = await readPlatformSettingInt(def.key);
  if (fromDb !== null) return { key: def.key, label: def.label, value: fromDb, source: "panel" };
  return { key: def.key, label: def.label, value: readIntEnv(def.envVar, def.default), source: "env" };
}

export async function adminPlatformSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/platform-settings", async () => Promise.all(PLATFORM_SETTINGS.map(resolveSettingView)));

  app.put<{ Params: { key: string }; Body: { value?: number } }>(
    "/admin/platform-settings/:key",
    async (req, reply) => {
      const { key } = req.params;
      const def = PLATFORM_SETTINGS.find((s) => s.key === key);
      if (!def) return reply.code(400).send({ error: "unknown_setting" });

      const value = req.body?.value;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        return reply.code(400).send({ error: "invalid_value", message: "Informe um inteiro >= 0." });
      }

      await setPlatformSettingInt(key, value, req.adminUserId);

      await recordAuditLog({
        tenantId: null,
        actorAdminUserId: req.adminUserId,
        action: `platform_setting.${key}.set`,
        before: null,
        after: { value },
      });

      return resolveSettingView(def);
    },
  );
}
