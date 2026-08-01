/**
 * Recarrega o crédito interno de um tenant de desenvolvimento.
 *
 *   docker compose exec backend npm run dev:grant-credits -- --slug dev-c77a5b
 *   docker compose exec backend npm run dev:grant-credits -- --slug dev-c77a5b --avatar 2 --video 3
 *
 * POR QUE ISTO EXISTE, e não um UPDATE à mão: `tenant_credits.balance` é um
 * cache do que o `credit_ledger` conta. Mexer só no saldo faz os dois
 * divergirem em silêncio — e isso JÁ aconteceu neste projeto: as limpezas de
 * teste dos blocos DEMO-1 e ESTORNO-1 rodaram `UPDATE tenant_credits SET
 * balance=1` sem linha correspondente, e o crédito de avatar do tenant de dev
 * ficou com ledger somando 1 e saldo 0. Divergência de billing não dá erro;
 * só aparece muito depois, numa conciliação, quando ninguém lembra por quê.
 *
 * Aqui as duas escritas acontecem na MESMA transação, com o mesmo motivo
 * (`grant`) que a concessão mensal usa. O resultado é indistinguível de um
 * grant legítimo, que é exatamente o que se quer: o histórico continua
 * somando certo.
 *
 * NÃO é estorno retroativo. Não tenta adivinhar o que se perdeu no passado —
 * apenas concede crédito novo, agora, e registra isso como concessão.
 */
import { pool } from "../src/db/pool.js";
import type { CreditType } from "../src/services/billing/creditGate.js";

const CREDIT_TYPES: CreditType[] = ["avatar", "video", "script"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const slug = arg("slug");
  if (!slug) {
    console.error(
      "uso: npm run dev:grant-credits -- --slug <slug-do-tenant> [--avatar N] [--video N] [--script N]\n" +
        "Sem N explícito, cada tipo recebe 1.",
    );
    process.exit(2);
  }

  const { rows: tenants } = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM tenants WHERE slug = $1",
    [slug],
  );
  const tenant = tenants[0];
  if (!tenant) {
    console.error(`Nenhum tenant com slug "${slug}".`);
    process.exit(1);
  }

  const pedidos = CREDIT_TYPES.map((tipo) => ({ tipo, quantidade: Number(arg(tipo) ?? 1) })).filter(
    (p) => Number.isFinite(p.quantidade) && p.quantidade > 0,
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { tipo, quantidade } of pedidos) {
      // Trava a linha antes de somar, mesmo aqui: o script pode rodar com o
      // servidor no ar, e uma geração simultânea leria o saldo velho.
      await client.query(
        "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = $2 FOR UPDATE",
        [tenant.id, tipo],
      );
      const { rows } = await client.query<{ balance: number }>(
        `INSERT INTO tenant_credits (tenant_id, credit_type, balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, credit_type)
           DO UPDATE SET balance = tenant_credits.balance + EXCLUDED.balance, updated_at = now()
         RETURNING balance`,
        [tenant.id, tipo, quantidade],
      );
      // A linha de ledger é o que impede a divergência. Sem ela, isto seria o
      // mesmo UPDATE manual que causou o problema.
      await client.query(
        `INSERT INTO credit_ledger (tenant_id, credit_type, delta, reason)
         VALUES ($1, $2, $3, 'grant')`,
        [tenant.id, tipo, quantidade],
      );
      console.log(`  ${tipo.padEnd(7)} +${quantidade}  -> saldo ${rows[0].balance}`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Conferência final: saldo e ledger têm de bater. Se não baterem, foi
  // divergência PRÉ-EXISTENTE — o script avisa em vez de mascarar.
  const { rows: conf } = await pool.query<{ credit_type: string; soma: string; saldo: number }>(
    `SELECT tc.credit_type,
            COALESCE((SELECT sum(delta) FROM credit_ledger cl
                       WHERE cl.tenant_id = tc.tenant_id AND cl.credit_type = tc.credit_type), 0)::text AS soma,
            tc.balance AS saldo
       FROM tenant_credits tc WHERE tc.tenant_id = $1 ORDER BY tc.credit_type`,
    [tenant.id],
  );
  const divergentes = conf.filter((c) => Number(c.soma) !== Number(c.saldo));
  console.log(`\nTenant "${tenant.name}" (${slug}):`);
  for (const c of conf) {
    const marca = Number(c.soma) === Number(c.saldo) ? "ok " : "DIVERGE";
    console.log(`  [${marca}] ${c.credit_type.padEnd(7)} saldo=${c.saldo} ledger=${c.soma}`);
  }
  if (divergentes.length > 0) {
    console.log(
      "\nAVISO: saldo e ledger não batem em " +
        divergentes.map((d) => d.credit_type).join(", ") +
        ". Isso é anterior a esta execução (ver o cabeçalho deste script) e NÃO foi corrigido aqui: " +
        "ajustar o histórico exigiria decidir qual dos dois está certo.",
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error("dev:grant-credits falhou:", err);
  process.exit(1);
});
