/**
 * SONDA DE LEITURA — BLOCO HEYGEN-SIMPLES-1, Parte A (A1-A5).
 *
 * SÓ GET. Custo de fornecedor: ZERO. Nenhum POST, nenhuma geração, nenhuma
 * clonagem. Existe só para o levantamento sem custo pedido antes de qualquer
 * implementação do nível Simples.
 *
 * SEGREDO: a chave é lida cifrada do banco e nunca aparece na saída.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { pool } from "../db/pool.js";
import { getCredentialForVendor } from "../services/credentialLookup.js";

const TENANT_SLUG = process.env.QUOTA_BASELINE_TENANT ?? "dev-c77a5b";
const BASE = "https://api.heygen.com";
const OUT_DIR = "/tmp/probe-heygen-simples";

async function get(headers: Record<string, string>, path: string, arquivo: string) {
  try {
    const r = await fetch(`${BASE}${path}`, { headers });
    const txt = await r.text();
    let j: any = null;
    try {
      j = JSON.parse(txt);
    } catch {
      /* corpo não-JSON: mostra cru, recortado */
    }
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}/${arquivo}`, j ? JSON.stringify(j, null, 2) : txt);
    console.log(`\n=== GET ${path}\n  HTTP ${r.status}  ->  ${OUT_DIR}/${arquivo}`);
    return { status: r.status, json: j };
  } catch (e: any) {
    console.log(`\n=== GET ${path}\n  REDE FALHOU: ${e?.cause?.code ?? e?.message}`);
    return { status: 0, json: null };
  }
}

async function main() {
  const t = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [TENANT_SLUG]);
  if (t.rows.length === 0) throw new Error(`tenant ${TENANT_SLUG} não existe`);
  const cred = await getCredentialForVendor(t.rows[0].id, "avatar", "heygen");
  if (!cred) throw new Error("sem credencial heygen para este tenant");
  const headers = { "x-api-key": cred.apiKey };

  console.log(`lido em: ${new Date().toISOString()}  (SÓ GET — custo zero)`);

  // A1
  await get(headers, "/v3/users/me", "a1-users-me.json");
  // A2
  await get(headers, "/v3/voices?type=private&limit=100", "a2-voices-private.json");
  // A3
  await get(headers, "/v3/voices?engine=starfish&limit=100", "a3-voices-starfish.json");
  await get(headers, "/v3/voices?type=private&engine=starfish&limit=100", "a3b-voices-private-starfish.json");
  // A4
  await get(headers, "/v3/avatars/looks?limit=50", "a4-avatars-looks.json");
  // A5
  await get(headers, "/v3/avatars?limit=50", "a5-avatars.json");

  // A4/A5 complemento — looks dos 4 grupos PRÓPRIOS do tenant (twinai-*),
  // por group_id explícito (a listagem sem group_id só devolve catálogo
  // público, MEDIDO acima).
  const gruposProprios = [
    "c16953a03495c796aa8c092d28017e10",
    "80753373415b61272cd5d2a6bdb01a1f",
    "9d80b3ce55d2dbb0c9c6c181623ce1ad",
    "e1071cee0b5a41fdb2d13cc26aad094f",
  ];
  for (const g of gruposProprios) {
    await get(headers, `/v3/avatars/looks?group_id=${g}`, `a4b-looks-grupo-${g}.json`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error("FALHOU:", e?.message);
  process.exit(1);
});
