import { pool } from "../db/pool.js";
import { decrypt } from "./crypto.js";
import { defaultVendor } from "./providers/vendorCatalog.js";
import type { CredentialProvider } from "../types.js";

export interface ResolvedCredential {
  apiKey: string;
  vendor: string;
}

// Shared by every route that needs a tenant's BYOK credential + chosen
// vendor (scripts, copilot, avatars, videos) — returns null when the
// tenant hasn't connected a key for that provider category yet.
//
// DETERMINÍSTICA desde a Fase C (migration 060) — `ORDER BY is_default DESC
// LIMIT 1`. Avatar pode ter mais de uma linha por tenant desde a Fase B (uma
// por vendor), e sem ORDER BY o Postgres não promete nenhuma ordem
// específica: dois tenants com heygen+fal configurados podiam receber a
// linha errada por pura sorte de qual voltasse primeiro. `is_default` é a
// credencial "de sempre" — a única com `is_default=true` garantida pelo
// índice `api_credentials_tenant_avatar_default_key` — e é ela que os call
// sites NÃO-tier-aware (11 deles) continuam vendo. Os 3 call sites
// tier-aware de `routes/videos.ts` usam `getCredentialForVendor` abaixo, não
// esta.
export async function getCredential(
  tenantId: string,
  provider: CredentialProvider,
): Promise<ResolvedCredential | null> {
  const { rows } = await pool.query<{ encrypted_key: string | null; vendor: string | null }>(
    "SELECT encrypted_key, vendor FROM api_credentials WHERE tenant_id = $1 AND provider = $2 ORDER BY is_default DESC LIMIT 1",
    [tenantId, provider],
  );
  const encryptedKey = rows[0]?.encrypted_key;
  if (!encryptedKey) return null;
  return { apiKey: decrypt(encryptedKey), vendor: rows[0].vendor ?? defaultVendor(provider) };
}

// A busca por VENDOR EXPLÍCITO — Fase C. Os 3 call sites tier-aware de
// `routes/videos.ts` não querem "a credencial default do tenant": querem "a
// credencial DESTE vendor", porque é o `tier_video` escolhido no vídeo (ou o
// `provider_vendor` já gravado na linha) que decide o vendor — não o que o
// tenant marcou como padrão no admin. `vendor` nunca vem da linha lida: é o
// parâmetro, porque a query já filtrou por ele — devolvê-lo de volta evita
// uma segunda leitura do mesmo valor que o chamador já tem.
export async function getCredentialForVendor(
  tenantId: string,
  provider: CredentialProvider,
  vendor: string,
): Promise<ResolvedCredential | null> {
  const { rows } = await pool.query<{ encrypted_key: string | null }>(
    "SELECT encrypted_key FROM api_credentials WHERE tenant_id = $1 AND provider = $2 AND vendor = $3",
    [tenantId, provider, vendor],
  );
  const encryptedKey = rows[0]?.encrypted_key;
  if (!encryptedKey) return null;
  return { apiKey: decrypt(encryptedKey), vendor };
}
