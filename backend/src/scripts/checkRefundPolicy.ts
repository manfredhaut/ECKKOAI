/**
 * Invariantes do estorno de crédito.
 *
 * O defeito que este arquivo congela: `debitCredit()` roda ANTES da chamada ao
 * fornecedor (de propósito — debitar depois abriria corrida), e por três blocos
 * seguidos nenhum dos três caminhos devolvia o crédito quando o fornecedor
 * recusava. O sintoma é silencioso do lado errado: o cliente perde saldo pago
 * por um erro que não produziu nada, e ninguém percebe até faltar crédito.
 *
 * Uma rota nova que debite e esqueça o estorno reintroduz exatamente isso, e
 * não há teste de fluxo que pegue — a falha do fornecedor é rara em
 * desenvolvimento. Por isso a checagem é estrutural.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface RefundCheckResult {
  failures: string[];
  notes: string[];
}

const ROUTES_DIR = "backend/src/routes";

/**
 * Rotas que debitam e, por decisão registrada, NÃO estornam em algum caminho.
 * Vazia hoje: os três caminhos que debitam estornam. Existe para que uma
 * exceção futura seja uma decisão escrita, e não um esquecimento silencioso.
 */
const DEBIT_WITHOUT_REFUND_ALLOWED: readonly string[] = [];

export async function checkRefundPolicy(repoRoot: string): Promise<RefundCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const dir = path.join(repoRoot, ROUTES_DIR);
  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith(".ts"));
  } catch {
    failures.push(
      `estorno: não consegui ler ${ROUTES_DIR} — verificador cego é pior que verificador que reprova.`,
    );
    return { failures, notes };
  }

  let debiting = 0;
  for (const name of entries) {
    const rel = `${ROUTES_DIR}/${name}`;
    const source = stripComments(await readFile(path.join(dir, name), "utf-8"));

    // Comentários fora antes de procurar: a guarda de chave de plataforma já
    // reprovou o próprio comentário que a explicava, duas vezes neste projeto.
    if (!source.includes("debitCredit(")) continue;
    debiting += 1;

    if (DEBIT_WITHOUT_REFUND_ALLOWED.includes(rel)) continue;

    if (!source.includes("refundCredit(")) {
      failures.push(
        `estorno: ${rel} chama debitCredit() mas nunca refundCredit(). O débito acontece ` +
          "ANTES da chamada ao fornecedor; sem estorno, uma recusa do fornecedor consome " +
          "crédito pago sem entregar nada.",
      );
    }
  }

  if (debiting === 0) {
    failures.push(
      "estorno: nenhuma rota chamando debitCredit() foi encontrada — o verificador " +
        "deixou de casar com o código e passaria verde sem inspecionar nada.",
    );
  }

  // O motivo precisa existir no CHECK do banco, senão todo estorno explode em
  // tempo de execução — e só no caminho de falha, que é o menos exercitado.
  await checkRefundReasonMigrated(repoRoot, failures);

  notes.push(
    `estorno: ${debiting} rota(s) debitam crédito; todas com estorno na falha do fornecedor`,
  );
  return { failures, notes };
}

async function checkRefundReasonMigrated(repoRoot: string, failures: string[]): Promise<void> {
  const migrationsDir = path.join(repoRoot, "backend/src/db/migrations");
  try {
    const files = await readdir(migrationsDir);
    const sql = (
      await Promise.all(files.filter((f) => f.endsWith(".sql")).map((f) => readFile(path.join(migrationsDir, f), "utf-8")))
    ).join("\n");
    if (!/reason IN \([^)]*'refund'/.test(sql)) {
      failures.push(
        "estorno: nenhuma migration admite reason = 'refund' no CHECK de credit_ledger. " +
          "Todo estorno falharia em tempo de execução, no caminho de erro — o menos testado.",
      );
    }
  } catch {
    failures.push("estorno: não consegui ler as migrations para conferir o motivo 'refund'.");
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
