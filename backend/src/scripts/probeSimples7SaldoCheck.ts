/**
 * SONDA DE LEITURA — BLOCO HEYGEN-SIMPLES-7, Parte P.
 *
 * SÓ GET. Custo de fornecedor: ZERO. Confere saldo/quota da conta AGORA,
 * para comparar contra o último valor conhecido (US$ 4,00 / 240un,
 * registrado no fechamento de SIMPLES-1) — se o teste do fundo 100×50 do
 * SIMPLES-6 tivesse alcançado a rede real, o saldo teria caído.
 *
 * Não existe GET/DELETE de asset na API da HeyGen (confirmado por doc
 * pública, 03/09/2026) — não há como "listar" o asset de teste
 * especificamente. Este script confirma pela via que existe: o saldo.
 */
import { pool } from "../db/pool.js";
import { getCredentialForVendor } from "../services/credentialLookup.js";

const TENANT_SLUG = process.env.QUOTA_BASELINE_TENANT ?? "dev-c77a5b";
const BASE = "https://api.heygen.com";

async function main() {
  const t = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [TENANT_SLUG]);
  if (t.rows.length === 0) throw new Error(`tenant ${TENANT_SLUG} não existe`);
  const cred = await getCredentialForVendor(t.rows[0].id, "avatar", "heygen");
  if (!cred) throw new Error("sem credencial heygen para este tenant");
  const headers = { "x-api-key": cred.apiKey };

  console.log(`lido em: ${new Date().toISOString()} (SÓ GET — custo zero)`);

  // SÓ v3 de propósito — o v2 (`/v2/user/remaining_quota`) exige registro em
  // `legacyEndpoints.ts` (checkLegacyEndpointPolicy.ts), e esta sonda é
  // descartável: não vale abrir uma entrada permanente de inventário para
  // uma leitura de saldo de uma sessão. `/v3/users/me` já traz o saldo em
  // `data.wallet`, que é o que este script precisa.
  const meRes = await fetch(`${BASE}/v3/users/me`, { headers });
  const me = await meRes.json();
  console.log(`GET /v3/users/me -> HTTP ${meRes.status}`);
  console.log(`  billing_type: ${me?.data?.billing_type ?? "?"}`);
  console.log(`  wallet balance (raw): ${JSON.stringify(me?.data?.wallet ?? me?.data?.balance ?? "campo não encontrado — corpo completo abaixo")}`);

  console.log("\n--- corpo completo de /v3/users/me (para achar o campo de saldo certo) ---");
  console.log(JSON.stringify(me, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
