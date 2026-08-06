/**
 * SONDA DE LEITURA — v2 contra v3 para LOOK e para LISTAGEM DE LOOKS.
 *
 * SÓ GET. Custo de fornecedor: ZERO. Nenhum POST, nenhuma geração, nenhum
 * traje. As duas leituras de saldo (`quotaBaseline.ts`) antes e depois desta
 * sonda são a prova, e não a promessa.
 *
 * POR QUE EXISTE: o traje nasce em `POST /v3/avatars`, e o produto perguntava
 * o estado dele em `GET /v2/photo_avatar/{id}` — um endpoint de outra família.
 * O sintoma medido é um traje PAGO que fica "em preparo" para sempre. Esta
 * sonda mede, id a id, o que cada família responde, para que a migração seja
 * feita contra número lido e não contra a forma REST que parece natural.
 *
 * Também mede o segundo salto: a listagem de looks é por GRUPO, e o v2 tem
 * SUNSET declarado pelo fornecedor para 2026-10-31.
 *
 * SEGREDO: a chave é lida cifrada do banco e nunca aparece na saída.
 */
import { pool } from "../db/pool.js";
import { getCredential } from "../services/credentialLookup.js";

const TENANT_SLUG = process.env.QUOTA_BASELINE_TENANT ?? "dev-c77a5b";
const BASE = "https://api.heygen.com";

/** Recorte curto: o objetivo é comparar contratos, não despejar o corpo. */
function resumo(j: any): string {
  const d = j?.data ?? j;
  if (!d || typeof d !== "object") return JSON.stringify(j).slice(0, 200);
  const campos = [
    "id",
    "status",
    "group_id",
    "avatar_type",
    "name",
    "is_motion",
    "supported_api_engines",
  ];
  const out: Record<string, unknown> = {};
  for (const c of campos) if (d[c] !== undefined) out[c] = d[c];
  const listaChaves = Object.keys(d).filter((k) => Array.isArray((d as any)[k]));
  for (const k of listaChaves) out[`${k}[]`] = (d as any)[k].length;
  return JSON.stringify(out);
}

async function get(headers: Record<string, string>, path: string) {
  try {
    const r = await fetch(`${BASE}${path}`, { headers });
    const txt = await r.text();
    let j: any = null;
    try {
      j = JSON.parse(txt);
    } catch {
      /* corpo não-JSON: mostra cru, recortado */
    }
    const erro = j?.error?.code ?? j?.code ?? j?.message ?? "";
    console.log(
      `  ${r.status.toString().padEnd(3)} ${path}` +
        (r.ok ? `\n        ${resumo(j)}` : `\n        ${String(erro || txt).slice(0, 160)}`),
    );
    return { status: r.status, json: j };
  } catch (e: any) {
    console.log(`  REDE ${path}: ${e?.cause?.code ?? e?.message}`);
    return { status: 0, json: null };
  }
}

async function main() {
  const t = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [TENANT_SLUG]);
  if (t.rows.length === 0) throw new Error(`tenant ${TENANT_SLUG} não existe`);
  const cred = await getCredential(t.rows[0].id, "avatar");
  if (!cred) throw new Error("sem credencial de avatar");
  const headers = { "x-api-key": cred.apiKey };

  console.log(`lido em: ${new Date().toISOString()}  (SÓ GET — custo zero)\n`);

  const looks = await pool.query<{ provider_look_id: string; name: string; status: string }>(
    "SELECT provider_look_id, name, status FROM avatar_looks ORDER BY created_at",
  );
  const avatares = await pool.query<{ provider_avatar_id: string; name: string }>(
    "SELECT provider_avatar_id, name FROM avatars WHERE provider_avatar_id LIKE '%' AND provider_avatar_id <> '' AND provider_avatar_id NOT LIKE 'fixture-%' ORDER BY created_at",
  );

  const alvos = [
    ...avatares.rows.map((a) => ({ id: a.provider_avatar_id, rotulo: `avatar base "${a.name}"` })),
    ...looks.rows.map((l) => ({
      id: l.provider_look_id,
      rotulo: `look "${l.name}" (banco diz ${l.status})`,
    })),
  ];

  const grupos = new Set<string>();

  for (const alvo of alvos) {
    console.log(`\n=== ${alvo.rotulo} — ${alvo.id}`);
    const v2 = await get(headers, `/v2/photo_avatar/${encodeURIComponent(alvo.id)}`);
    const v3 = await get(headers, `/v3/avatars/looks/${encodeURIComponent(alvo.id)}`);
    for (const g of [v2.json?.data?.group_id, v3.json?.data?.group_id]) {
      if (typeof g === "string" && g) grupos.add(g);
    }
  }

  for (const g of grupos) {
    console.log(`\n=== GRUPO ${g}`);
    await get(headers, `/v2/avatar_group/${encodeURIComponent(g)}/avatars`);
    await get(headers, `/v3/avatars/${encodeURIComponent(g)}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error("FALHOU:", e?.message);
  process.exit(1);
});
