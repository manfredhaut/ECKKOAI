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
import type { Mutant } from "./mutants.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "estorno: rota que debita estorna",
    name: "scripts.ts debita e não estorna",
    kind: "obvio",
    file: "backend/src/routes/scripts.ts",
    find: `      await refundCredit({
        tenantId: req.tenantId,
        creditType: "script",
        relatedScriptGenerationId: generationRows[0].id,
      });
`,
    replace: "",
    expect: "chama debitCredit() mas nunca refundCredit()",
  },
  {
    guard: "estorno: motivo no CHECK do banco",
    name: "migration deixa de admitir reason = refund",
    kind: "esperto",
    file: "backend/src/db/migrations/035_credit_ledger_refund_reason.sql",
    // O arquivo continua existindo, com nome de estorno e comentários sobre
    // estorno. Só o CHECK muda. Uma guarda que verificasse a existência da
    // migration, ou procurasse "refund" no texto, passaria — e todo estorno
    // explodiria em tempo de execução, no caminho de erro.
    find: "'grant', 'refund'));",
    replace: "'grant', 'reembolso'));",
    expect: "nenhuma migration admite reason = 'refund'",
  },
  {
    guard: "reconciliação: saldo escrito sem lançamento",
    name: "módulo novo mexe no saldo sem gravar ledger",
    kind: "obvio",
    // Reproduz a causa MEDIDA da divergência do tenant de dev (bloco 5D-1):
    // saldo alterado sem linha correspondente. Aqui num módulo de produto, que
    // é onde isso deixaria de ser dado sujo de dev e viraria billing errado.
    file: "backend/src/services/billing/creditPackages.ts",
    // Âncora ÚNICA. A primeira versão usava `find: "export"`, que ocorre
    // quatro vezes neste arquivo — o arnês abortou por substituição ambígua,
    // e com razão: um mutante que casa em vários pontos muta um lugar
    // imprevisível e prova outra coisa a cada execução.
    find: "export interface CreditPackage {",
    replace:
      "export async function ajustaSaldo(c: { query: (s: string, v: unknown[]) => Promise<unknown> }) {\n" +
      '  await c.query("UPDATE tenant_credits SET balance = balance + 1 WHERE tenant_id = $1", ["x"]);\n' +
      "}\n\nexport interface CreditPackage {",
    expect: "escreve em tenant_credits sem gravar credit_ledger",
  },
];

/**
 * Quem pode escrever `tenant_credits` sem gravar `credit_ledger`, e por quê.
 *
 * `tenant_credits.balance` é um CACHE do que o ledger conta — é o próprio
 * `grantDevCredits.ts` que diz isso, e a invariante está declarada em
 * `monthlyGrant.ts` ("delta reflects the real movement so sum(delta) over
 * credit_ledger keeps matching tenant_credits.balance"). Mexer só no saldo faz
 * os dois divergirem SEM ERRO NENHUM, e a divergência só aparece muito depois,
 * numa conciliação, quando ninguém lembra por quê.
 */
const SALDO_SEM_LEDGER_PERMITIDO: { file: string; motivo: string }[] = [
  {
    file: "src/routes/auth.ts",
    motivo:
      "signup insere as três linhas com balance = 0. Zero é o valor neutro: não há movimento a " +
      "registrar, e a soma do ledger (também 0) já fecha com o saldo desde o primeiro instante.",
  },
];

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

  await checkSaldoSempreComLancamento(repoRoot, failures, notes);

  notes.push(
    `estorno: ${debiting} rota(s) debitam crédito; todas com estorno na falha do fornecedor`,
  );
  return { failures, notes };
}

/**
 * Todo módulo que escreve `tenant_credits` grava `credit_ledger` junto.
 *
 * Esta é a metade do item 4 do bloco 5D-1 que dá para verificar no gate. A
 * outra — os NÚMEROS baterem — é estado de banco, e não pertence a um gate de
 * código: os dados de dev já estão divergentes por `UPDATE` manual de blocos
 * antigos, e uma guarda que reprovasse por causa disso deixaria o build
 * vermelho para sempre. Guarda que reprova sempre é abandonada, e aí ela não
 * protege nem o caso que importa. A conferência de dados vive no
 * `preflight:live`, onde estado de ambiente é o assunto.
 */
async function checkSaldoSempreComLancamento(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  const alvos = ["backend/src/routes", "backend/src/services/billing"];
  const permitidos = new Set(SALDO_SEM_LEDGER_PERMITIDO.map((e) => e.file));
  let inspecionados = 0;
  let escrevem = 0;

  for (const base of alvos) {
    const dir = path.join(repoRoot, base);
    let nomes: string[];
    try {
      nomes = (await readdir(dir)).filter((f) => f.endsWith(".ts"));
    } catch {
      failures.push(`reconciliação: não consegui ler ${base} — verificador cego é pior que reprovar.`);
      return;
    }
    for (const nome of nomes) {
      inspecionados += 1;
      const fonte = stripComments(await readFile(path.join(dir, nome), "utf-8"));
      if (!/(UPDATE|INSERT INTO)\s+tenant_credits/i.test(fonte)) continue;
      escrevem += 1;
      const rel = `${base.replace("backend/", "")}/${nome}`;
      if (permitidos.has(rel)) continue;
      if (/credit_ledger/.test(fonte)) continue;
      failures.push(
        `reconciliação: ${rel} escreve em tenant_credits sem gravar credit_ledger. O saldo é um CACHE ` +
          "do que o ledger conta; mexer só nele faz os dois divergirem SEM ERRO NENHUM. Foi assim que o " +
          "tenant de dev ficou com saldo 2 e ledger −2 (MEDIDO no bloco 5D-1). Ou o módulo grava o " +
          "lançamento na mesma transação, ou entra em SALDO_SEM_LEDGER_PERMITIDO com o motivo escrito.",
      );
    }
  }

  if (escrevem === 0) {
    failures.push(
      "reconciliação: NENHUM módulo escrevendo tenant_credits foi encontrado — a varredura deixou de " +
        "casar com o código e passaria verde sem inspecionar nada.",
    );
  }

  notes.push(
    `reconciliação: ${escrevem} de ${inspecionados} módulo(s) escrevem saldo — todos gravam lançamento, ` +
      `com ${SALDO_SEM_LEDGER_PERMITIDO.length} exceção(ões) declarada(s)`,
  );
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
