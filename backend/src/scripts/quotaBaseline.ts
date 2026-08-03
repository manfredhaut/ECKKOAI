/**
 * LINHA DE BASE DE COTA — leitura, NÃO tarifada. Custo zero de fornecedor.
 *
 * Para que serve: medir, ANTES e DEPOIS de qualquer passada live, quanto a
 * conta da HeyGen tem de cota e de carteira. A diferença entre as duas
 * leituras é a ÚNICA medição de custo que não depende de número nosso —
 * `provider_usage` guarda o que nós achamos que gastamos, isto guarda o que
 * o fornecedor cobrou.
 *
 * Os dois endpoints:
 *   GET /v2/user/remaining_quota  -> cota em unidades.
 *        Declarado `billable: false` em endpointCatalog.ts (linha 85).
 *        SUNSET anunciado pelo próprio fornecedor para 2026-10-31.
 *   GET /v3/users/me              -> carteira em dólar; substituto do sunset.
 *        ATENÇÃO: este NÃO está no endpointCatalog.ts, então o freio derivado
 *        do catálogo não o cobre. É leitura de perfil, e a evidência empírica
 *        de que não tarifa é que cota e carteira não se moveram entre 02/08 e
 *        03/08 apesar de ele ter sido chamado nesse intervalo. Catalogá-lo é
 *        pendência registrada, não feita aqui.
 *
 * NÃO passa por checkAvatarConnection() de propósito: aquela função desvia em
 * fixture (avatarProvider.ts) e devolveria leitura simulada — que é o oposto
 * do que uma linha de base precisa ser. Aqui a chamada é sempre real, e é
 * segura justamente porque os dois endpoints são de leitura.
 *
 * SEGREDO: a chave nunca aparece no fonte nem na saída. Ela é lida cifrada do
 * banco e decifrada em memória por getCredential(). A saída imprime só números
 * e o nome do vendor.
 *
 * Uso (a partir do diretório do projeto):
 *   docker compose exec -T backend npx tsx src/scripts/quotaBaseline.ts
 *
 * Unidade: 1 unidade ≈ US$ 0,0167 (60 unidades por dólar), razão confirmada em
 * quatro pontos medidos. A cobrança de vídeo é de 3 unidades por segundo
 * INTEIRO truncado. Não confundir com `provider_usage.unit_count`, que está em
 * SEGUNDOS — os dois números não são comparáveis diretamente.
 */
import { pool } from "../db/pool.js";
import { getCredential } from "../services/credentialLookup.js";

const TENANT_SLUG = process.env.QUOTA_BASELINE_TENANT ?? "dev-c77a5b";

async function main() {
  const t = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [
    TENANT_SLUG,
  ]);
  if (t.rows.length === 0) {
    console.log(`TENANT "${TENANT_SLUG}" NÃO EXISTE — nada a ler.`);
    await pool.end();
    return;
  }

  const cred = await getCredential(t.rows[0].id, "avatar");
  if (!cred) {
    console.log("SEM CREDENCIAL DE AVATAR — nada a ler.");
    await pool.end();
    return;
  }
  console.log(`tenant: ${TENANT_SLUG}`);
  console.log(`vendor da credencial: ${cred.vendor}`);
  console.log(`lido em: ${new Date().toISOString()}`);

  const headers = { "x-api-key": cred.apiKey };

  // 1) cota, em unidades
  try {
    const r = await fetch("https://api.heygen.com/v2/user/remaining_quota", { headers });
    const txt = await r.text();
    console.log(`\n[/v2/user/remaining_quota] HTTP ${r.status}`);
    if (r.ok) {
      const j = JSON.parse(txt);
      console.log(`  ${JSON.stringify(j?.data ?? j)}`);
    } else {
      // Corpo de erro não traz chave: ela viaja no cabeçalho, que não é ecoado.
      console.log(`  corpo: ${txt.slice(0, 300)}`);
    }
  } catch (e: any) {
    console.log(`\n[/v2/user/remaining_quota] REDE FALHOU: ${e?.cause?.code ?? e?.message}`);
  }

  // 2) carteira, em dólar
  try {
    const r = await fetch("https://api.heygen.com/v3/users/me", { headers });
    const txt = await r.text();
    console.log(`\n[/v3/users/me] HTTP ${r.status}`);
    if (r.ok) {
      const j = JSON.parse(txt);
      console.log(`  ${JSON.stringify(j).slice(0, 600)}`);
    } else {
      console.log(`  corpo: ${txt.slice(0, 300)}`);
    }
  } catch (e: any) {
    console.log(`\n[/v3/users/me] REDE FALHOU: ${e?.cause?.code ?? e?.message}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error("FALHOU:", e?.message);
  process.exit(1);
});
