/**
 * ENSAIO NÃO GASTA DINHEIRO — provado movendo crédito, não lendo código.
 *
 * O defeito que este arquivo congela, medido em 05/08: `debitCredit()` escolhia
 * a linha de `tenant_credits` só pelo tipo, sem olhar o modo. Ensaiar a jornada
 * em `fixture` — que não fala com fornecedor nenhum — debitava o MESMO saldo
 * que paga os vídeos reais. O tenant de desenvolvimento chegou a `video: 0`
 * assim, e saldo zero é recusa no portão: ensaiar de graça ficou impossível na
 * semana da demonstração.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A GUARDA EXERCITA EM VEZ DE LER
 *
 * Uma guarda que procurasse `contaDe(` nos arquivos certos seria inerte por
 * construção: a chamada pode estar lá e o resultado ser ignorado, e foi
 * exatamente esse o desenho que quase entrou — trocar a conta no débito e
 * deixar o portão de prontidão lendo `'video'` literal. O gate ficaria verde, o
 * saldo real pararia de sangrar, e a tela continuaria recusando com 403. Aqui
 * as funções rodam de verdade contra um duplo de banco, e o que se afirma é a
 * CONTA que cada uma tocou.
 *
 * Os quatro vetores, e por que os quatro:
 *   1. débito em fixture   → move a conta de ensaio;
 *   2. débito em live      → move a conta real (o contraponto: sem ele, uma
 *                            guarda que exigisse `_rehearsal` sempre passaria
 *                            no arnês sem distinguir modo nenhum);
 *   3. prontidão em fixture→ o portão lê a conta de ensaio (é o vetor que o
 *                            desenho original deixava de fora);
 *   4. estorno             → devolve à conta do LANÇAMENTO, não à do modo
 *                            corrente, porque entre debitar e estornar cabe um
 *                            `restart` e neste projeto isso é rotina.
 * ---------------------------------------------------------------------------
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface RehearsalCreditCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "ensaio: o modo escolhe a conta, e o ensaio não toca o saldo real",
    name: "o débito em fixture volta ao balde real",
    kind: "esperto",
    // A função continua existindo, continua sendo chamada nos três lugares e
    // continua devolvendo um nome de conta válido. Só o `fixture` deixa de
    // significar alguma coisa. É o defeito de 05/08 renascendo inteiro, e não
    // muda uma linha de quem chama — guarda ancorada na chamada não veria.
    file: "backend/src/services/billing/creditGate.ts",
    find: "  return fixture ? `${creditType}_rehearsal` : creditType;",
    replace: "  return creditType;",
    expect: "uma geração em fixture debitou o saldo REAL",
  },
  {
    guard: "ensaio: o portão de prontidão lê a mesma conta que o débito",
    name: "o portão de prontidão volta a ler o saldo real",
    kind: "esperto",
    // O vetor que motivou a parada do bloco: `contaDe` continua correta, o
    // débito continua indo para o balde de ensaio, e mesmo assim ensaiar fica
    // impossível — o portão recusa com 403 ANTES de debitar, lendo a conta que
    // ninguém mais usa. Corrigido e verde no débito, quebrado na tela.
    file: "backend/src/services/generationReadiness.ts",
    find: '  const conta = contaDe("video");',
    replace: '  const conta = "video";',
    expect: "o portão de prontidão recusou em fixture",
  },
  {
    guard: "ensaio: o estorno devolve à conta do lançamento, não à do modo",
    name: "o estorno volta a escolher a conta pelo modo atual",
    kind: "esperto",
    // A consulta ao ledger continua lá — só o resultado dela deixa de decidir.
    // O sintoma é raro e caro: um débito de ensaio estornado depois de um
    // `restart` em live vira crédito real, que é criar dinheiro.
    file: "backend/src/services/billing/creditGate.ts",
    find: "    const conta = contaRows[0]?.credit_type ?? contaDe(input.creditType);",
    replace: "    const conta = contaDe(input.creditType);",
    expect: "o estorno escolheu a conta pelo modo atual",
  },
];

/** Uma escrita observada no duplo de banco: a tabela e a conta que ela tocou. */
interface Movimento {
  tabela: string;
  conta: string;
}

/**
 * Duplo de `pool.connect()`. Devolve o que cada consulta do `creditGate`
 * espera e anota a conta de cada movimento.
 *
 * Consulta não reconhecida é anotada em voz alta, e não ignorada: um duplo
 * permissivo devolveria vazio para uma leitura nova e o vetor correspondente
 * sumiria em silêncio — que é a forma mais comum de guarda apodrecer.
 */
function duploDeBanco(
  movimentos: Movimento[],
  desconhecidas: string[],
  contaDoConsumo: string | null,
): { query: (text: unknown, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>; release: () => void } {
  return {
    query: async (text: unknown, params?: unknown[]) => {
      const sql = String(text).replace(/\s+/g, " ").trim();
      const conta = String(params?.[1] ?? "");

      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)) return { rows: [], rowCount: 0 };

      if (/SELECT credit_type FROM credit_ledger/i.test(sql)) {
        return contaDoConsumo
          ? { rows: [{ credit_type: contaDoConsumo }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (/SELECT 1 FROM credit_ledger WHERE reason = 'refund'/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT balance FROM tenant_credits/i.test(sql)) {
        movimentos.push({ tabela: "tenant_credits:leitura", conta });
        return { rows: [{ balance: 500 }], rowCount: 1 };
      }
      if (/UPDATE tenant_credits/i.test(sql)) {
        movimentos.push({ tabela: "tenant_credits:escrita", conta });
        return { rows: [{ balance: 499 }], rowCount: 1 };
      }
      if (/INSERT INTO credit_ledger/i.test(sql)) {
        movimentos.push({ tabela: "credit_ledger", conta });
        return { rows: [], rowCount: 0 };
      }

      desconhecidas.push(sql.slice(0, 90));
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };
}

export async function checkRehearsalCreditPolicy(repoRoot: string): Promise<RehearsalCreditCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const { pool } = await import("../db/pool.js");
  const connectReal = pool.connect.bind(pool);
  const queryReal = pool.query.bind(pool);
  const modoOriginal = process.env.PROVIDER_MODE;

  const { debitCredit, refundCredit } = await import("../services/billing/creditGate.js");
  const { evaluateGenerationReadiness } = await import("../services/generationReadiness.js");

  const desconhecidas: string[] = [];

  try {
    // -----------------------------------------------------------------------
    // 1. Débito em FIXTURE toca só a conta de ensaio.
    // -----------------------------------------------------------------------
    process.env.PROVIDER_MODE = "fixture";
    const emFixture: Movimento[] = [];
    (pool as unknown as { connect: unknown }).connect = async () =>
      duploDeBanco(emFixture, desconhecidas, null);
    await debitCredit({ tenantId: "t1", creditType: "video", relatedVideoId: "v1" });

    const vazouParaOReal = emFixture.filter((m) => m.conta === "video");
    if (vazouParaOReal.length > 0) {
      failures.push(
        "ensaio: uma geração em fixture debitou o saldo REAL. `debitCredit()` tocou a conta `video` em " +
          `${vazouParaOReal.map((m) => m.tabela).join(", ")} com PROVIDER_MODE=fixture. ` +
          "Em fixture nada é enviado a fornecedor e nada é cobrado, então debitar o saldo real cobra por " +
          "um ensaio — foi assim que o tenant de desenvolvimento chegou a `video: 0` e ficou sem conseguir " +
          "ensaiar a demonstração. A conta tem de ser `video_rehearsal` (migration 043).",
      );
    } else if (emFixture.length === 0) {
      failures.push(
        "ensaio: `debitCredit()` não moveu conta nenhuma em fixture — o duplo de banco não observou " +
          "leitura, escrita nem lançamento. A guarda não tem o que afirmar, e uma guarda que não observa " +
          "nada passa sempre.",
      );
    } else if (!emFixture.every((m) => m.conta === "video_rehearsal")) {
      failures.push(
        "ensaio: em fixture o débito espalhou-se por mais de uma conta — " +
          `${JSON.stringify(emFixture)}. As três escritas (leitura travada, desconto e lançamento) têm de ` +
          "cair na MESMA conta, senão o saldo deixa de bater com o ledger.",
      );
    } else {
      notes.push(`  ensaio: débito em fixture move ${emFixture.length} vez(es) a conta \`video_rehearsal\`.`);
    }

    // -----------------------------------------------------------------------
    // 2. CONTRAPONTO — em live o débito continua sendo o saldo real.
    // -----------------------------------------------------------------------
    process.env.PROVIDER_MODE = "live";
    const emLive: Movimento[] = [];
    (pool as unknown as { connect: unknown }).connect = async () =>
      duploDeBanco(emLive, desconhecidas, null);
    await debitCredit({ tenantId: "t1", creditType: "video", relatedVideoId: "v2" });

    if (!emLive.every((m) => m.conta === "video")) {
      failures.push(
        "ensaio: em live o débito NÃO caiu no saldo real — " +
          `${JSON.stringify(emLive)}. Um vídeo pago que debita o balde de ensaio é pior que o defeito ` +
          "original: o fornecedor cobra e o nosso contador não mexe, então o teto para de proteger.",
      );
    } else {
      notes.push("  ensaio: em live o débito continua na conta `video` — o contraponto separa os modos.");
    }

    // -----------------------------------------------------------------------
    // 3. O PORTÃO lê a mesma conta que o débito.
    // -----------------------------------------------------------------------
    process.env.PROVIDER_MODE = "fixture";
    const { encrypt } = await import("../services/crypto.js");
    (pool as unknown as { query: unknown }).query = async (text: unknown, params?: unknown[]) => {
      const sql = String(text);
      if (/FROM avatars/.test(sql)) {
        return {
          rows: [{ id: "a1", provider_avatar_id: "pa1", provider_status: "completed" }],
          rowCount: 1,
        };
      }
      if (/FROM api_credentials/.test(sql)) {
        return { rows: [{ encrypted_key: encrypt("chave-de-verificacao"), vendor: "heygen" }], rowCount: 1 };
      }
      if (/FROM tenant_credits/.test(sql)) {
        // O retrato exato do tenant que motivou o bloco: saldo real ZERADO e
        // balde de ensaio cheio. Se o portão ler a conta certa, não bloqueia.
        const conta = String(params?.[1] ?? "");
        return { rows: [{ balance: conta === "video_rehearsal" ? "500" : "0" }], rowCount: 1 };
      }
      desconhecidas.push(sql.replace(/\s+/g, " ").slice(0, 90));
      return { rows: [], rowCount: 0 };
    };

    const prontidao = await evaluateGenerationReadiness({
      tenantId: "t1",
      avatarId: "a1",
      script: "roteiro de verificação",
    });
    if (prontidao.blockers.some((b) => b.code === "plan_limit_reached")) {
      failures.push(
        "ensaio: o portão de prontidão recusou em fixture com o balde de ensaio CHEIO (500) e o saldo real " +
          "em 0. `evaluateGenerationReadiness()` está lendo a conta real enquanto `debitCredit()` move a de " +
          "ensaio — e como o portão recusa ANTES do débito, o resultado é 403 na tela com o crédito de " +
          "ensaio intocado. Corrigir só o débito não destrava a demonstração; a conta tem de sair de " +
          "`contaDe()` aqui também.",
      );
    } else {
      notes.push("  ensaio: com saldo real 0 e ensaio 500, o portão libera em fixture.");
    }

    // -----------------------------------------------------------------------
    // 4. O ESTORNO devolve à conta do lançamento, mesmo com o modo trocado.
    // -----------------------------------------------------------------------
    process.env.PROVIDER_MODE = "live";
    const noEstorno: Movimento[] = [];
    (pool as unknown as { connect: unknown }).connect = async () =>
      duploDeBanco(noEstorno, desconhecidas, "video_rehearsal");
    await refundCredit({ tenantId: "t1", creditType: "video", relatedVideoId: "v3" });

    const devolvidoAoReal = noEstorno.filter((m) => m.conta === "video");
    if (devolvidoAoReal.length > 0) {
      failures.push(
        "ensaio: o estorno escolheu a conta pelo modo atual. O lançamento de consumo diz `video_rehearsal` " +
          `e o estorno tocou \`video\` em ${devolvidoAoReal.map((m) => m.tabela).join(", ")}. ` +
          "Entre debitar e estornar cabe um `restart` — que neste projeto é rotina, porque código novo não " +
          "entra sem ele — e se o modo mudar no intervalo, decidir pela conta do momento transforma um " +
          "ensaio devolvido em crédito real. Isso é criar dinheiro; o inverso apaga saldo pago.",
      );
    } else if (noEstorno.length === 0) {
      failures.push(
        "ensaio: `refundCredit()` não moveu conta nenhuma — o duplo não observou devolução. Sem movimento " +
          "observado esta guarda não afirma nada.",
      );
    } else {
      notes.push("  ensaio: estorno segue o lançamento (`video_rehearsal`) mesmo com o modo em live.");
    }

    if (desconhecidas.length > 0) {
      failures.push(
        "ensaio: o duplo de banco recebeu consulta que não sabe responder — " +
          `${JSON.stringify([...new Set(desconhecidas)])}. Alguma leitura nova entrou no caminho de ` +
          "crédito e esta guarda passou a exercitá-la às cegas. Ensine o duplo antes de confiar no verde.",
      );
    }
  } finally {
    (pool as unknown as { connect: unknown }).connect = connectReal;
    (pool as unknown as { query: unknown }).query = queryReal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  // ---------------------------------------------------------------------------
  // 5. A migration existe e abre as DUAS tabelas.
  //
  // Estático de propósito, e só aqui: o código acima prova o comportamento, mas
  // o comportamento depende de as contas de ensaio serem aceitas pelo banco. Uma
  // migration que abrisse só `tenant_credits` deixaria o débito falhar no
  // lançamento — em produção, no meio de uma transação.
  // ---------------------------------------------------------------------------
  const migration = path.join(repoRoot, "backend/src/db/migrations/043_rehearsal_credits.sql");
  try {
    const sql = await readFile(migration, "utf-8");
    for (const tabela of ["tenant_credits", "credit_ledger"]) {
      const abre = new RegExp(`ALTER TABLE ${tabela} ADD CONSTRAINT[\\s\\S]{0,200}video_rehearsal`);
      if (!abre.test(sql)) {
        failures.push(
          `ensaio: a migration 043 não amplia o CHECK de \`${tabela}\` para aceitar as contas de ensaio. ` +
            "Sem os dois lados abertos o débito em fixture falha na transação — e falha no lançamento, " +
            "depois de o saldo já ter sido lido.",
        );
      }
    }
  } catch {
    failures.push(
      "ensaio: `backend/src/db/migrations/043_rehearsal_credits.sql` não existe. As contas de ensaio são " +
        "recusadas pelo CHECK e toda geração em fixture passa a estourar na transação de débito.",
    );
  }

  return { failures, notes };
}
