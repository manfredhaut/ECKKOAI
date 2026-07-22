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
export async function getCredential(
  tenantId: string,
  provider: CredentialProvider,
): Promise<ResolvedCredential | null> {
  const { rows } = await pool.query<{ encrypted_key: string | null; vendor: string | null }>(
    "SELECT encrypted_key, vendor FROM api_credentials WHERE tenant_id = $1 AND provider = $2",
    [tenantId, provider],
  );
  const encryptedKey = rows[0]?.encrypted_key;
  if (!encryptedKey) return null;
  return { apiKey: decrypt(encryptedKey), vendor: rows[0].vendor ?? defaultVendor(provider) };
}
