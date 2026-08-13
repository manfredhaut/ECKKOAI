/**
 * Semeia a chave da fal em `api_credentials`, de USO ÚNICO.
 *
 *   docker compose exec -T -e FAL_API_KEY=<a-chave> backend \
 *     npx tsx src/scripts/seedFalKey.ts --tenant <uuid>
 *
 * ┌─ O que ele NÃO faz ─────────────────────────────────────────────────────┐
 * │ Não escreve no `.env`, não escreve em `platform_credentials`, não        │
 * │ imprime a chave e não a deixa no ambiente do serviço: ela chega pelo     │
 * │ `-e` de UMA invocação e morre com o processo. O `.env` fica intocado.    │
 * │                                                                          │
 * │ A cifragem é a MESMA do painel admin — `encrypt()` de `services/crypto`, │
 * │ e o mesmo `INSERT … ON CONFLICT` de                                      │
 * │ `PUT /admin/tenants/:id/credentials/:provider`. O que ele não faz é      │
 * │ passar pela ROTA: ela exige sessão de admin, que um script não tem. A    │
 * │ diferença está aqui declarada porque é real — o que se preserva é o      │
 * │ caminho de cifragem e o formato da linha, não a autenticação.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ O par é (tenant_id, provider). Um tenant tem UMA credencial de `avatar`:
 * semear `fal` num tenant que já tem `heygen` SUBSTITUI a chave da HeyGen dele.
 * Por isso o script recusa sobrescrever sem `--forcar`.
 */
import { pool } from "../db/pool.js";
import { encrypt } from "../services/crypto.js";
import { isValidVendor } from "../services/providers/vendorCatalog.js";
import { redactText } from "../services/log/safeLog.js";

const argv = process.argv.slice(2);
function arg(nome: string): string | null {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] ?? null : null;
}

async function main(): Promise<void> {
  const chave = process.env.FAL_API_KEY;
  if (!chave) {
    console.error(
      "FAL_API_KEY ausente. Passe-a só nesta invocação:\n" +
        "  docker compose exec -T -e FAL_API_KEY=<a-chave> backend \\\n" +
        "    npx tsx src/scripts/seedFalKey.ts --tenant <uuid>",
    );
    process.exit(2);
  }
  const tenantId = arg("--tenant");
  if (!tenantId) {
    console.error("Faltou --tenant <uuid>.");
    process.exit(2);
  }
  if (!isValidVendor("avatar", "fal")) {
    console.error("`fal` não é vendor válido para `avatar` — o catálogo mudou.");
    process.exit(1);
  }

  const { rows: antes } = await pool.query<{ vendor: string | null }>(
    "SELECT vendor FROM api_credentials WHERE tenant_id = $1 AND provider = 'avatar'",
    [tenantId],
  );
  const vendorAtual = antes[0]?.vendor ?? null;
  if (vendorAtual && vendorAtual !== "fal" && !argv.includes("--forcar")) {
    console.error(
      `RECUSADO: este tenant já tem credencial de avatar do vendor "${vendorAtual}", e o par é\n` +
        "(tenant, provider) — gravar `fal` aqui APAGA aquela chave. Escolha outro tenant, ou repita\n" +
        "com --forcar se a substituição for deliberada.",
    );
    process.exit(3);
  }

  await pool.query(
    `INSERT INTO api_credentials (tenant_id, provider, encrypted_key, vendor, connected, updated_at)
     VALUES ($1, 'avatar', $2, 'fal', true, now())
     ON CONFLICT (tenant_id, provider)
     DO UPDATE SET encrypted_key = $2, vendor = 'fal', connected = true, updated_at = now()`,
    [tenantId, encrypt(chave)],
  );

  // Confirmação SEM a chave: só o que permite reconhecê-la sem revelá-la.
  const { rows } = await pool.query<{ vendor: string; len: number }>(
    "SELECT vendor, length(encrypted_key) AS len FROM api_credentials WHERE tenant_id = $1 AND provider = 'avatar'",
    [tenantId],
  );
  console.log(
    JSON.stringify({
      ok: true,
      tenantId,
      vendor: rows[0]?.vendor,
      cifradoLen: rows[0]?.len,
      last4: chave.slice(-4),
      redatorCobreAChave: redactText(chave) !== chave,
    }),
  );
  await pool.end();
}

main().catch((err) => {
  console.error("seedFalKey falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
