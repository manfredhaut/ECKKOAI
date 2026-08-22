/**
 * Teto EM DÓLARES do caminho HeyGen — T2, 22/08/2026.
 *
 * `PIPELINE_TETO_USD`/`PIPELINE_TETO_USD_PREMIUM` (fal) já tinham freio de
 * gasto antes de qualquer chamada; o caminho HeyGen (tier Simples) não
 * tinha nenhum — só tetos de CONTAGEM (`PROVIDER_LIVE_MAX_GENERATIONS`,
 * `DAILY_PAID_GENERATION_LIMIT`), nenhum em dólar (S1.4, 22/08/2026).
 *
 * Duas coisas são provadas aqui, por dois métodos diferentes:
 *  1. `assertHeygenSpendBudget` (providerCost.ts) RECUSA de verdade quando o
 *     custo estimado excede o teto — por EXECUÇÃO, chamando a função de
 *     produção com um `env` fabricado, nunca por grep.
 *  2. A chamada existe no LUGAR CERTO do handler de criação (`POST
 *     /videos`): depois de a credencial/vendor do tier já estar resolvida,
 *     ANTES de `debitCredit` — por POSIÇÃO de texto, mesmo padrão de
 *     `checkFalGenerationPathPolicy.ts` (o porteiro de vendor vs. o débito).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertHeygenSpendBudget, HeygenSpendCapExceededError } from "../services/billing/providerCost.js";
import type { Mutant } from "./mutants.js";

export interface HeygenSpendCapCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "teto em dólares (HeyGen): custo acima do teto é recusado",
    name: "assertHeygenSpendBudget para de lançar quando o custo excede o teto",
    kind: "obvio",
    // ESPERTO NA FORMA, ÓBVIO NO EFEITO: a condição fica intacta de
    // propósito (mutar `if (false)` quebra o narrowing do TypeScript de
    // `cost` — cost.usd deixa de existir no tipo dentro do bloco morto, e o
    // `tsc` reprova com TS2339 ANTES de a guarda opinar; mesma família do
    // gotcha "`if (false && …)`" já registrado no CLAUDE.md/ESTADO.md). Só o
    // corpo muda: o lançamento vira no-op, a condição segue sendo avaliada.
    file: "backend/src/services/billing/providerCost.ts",
    find: "    throw new HeygenSpendCapExceededError(cost.usd, cap);",
    replace: "    void 0; // mutante: lançamento removido",
    expect: "assertHeygenSpendBudget(acima do teto) não lançou, esperado HeygenSpendCapExceededError",
  },
  {
    guard: "teto em dólares (HeyGen): custo acima do teto é recusado",
    name: "o teto vira alto demais para valer contra qualquer roteiro real",
    kind: "esperto",
    // ESPERTO: a comparação continua lá, o lançamento continua lá — só o
    // limiar deixa de ser alcançável por qualquer valor que este produto
    // já produz (roteiro no máximo 180 s × US$0,05/s = US$9,00). Um teste
    // que só checasse "a função ainda lança em ALGUM caso" não pegaria
    // isto; é preciso um valor real do produto para revelar o defeito.
    file: "backend/src/services/billing/providerCost.ts",
    find: "  if (cost.usd > cap) {",
    replace: "  if (cost.usd > cap * 1000) {",
    expect: "assertHeygenSpendBudget(acima do teto) não lançou, esperado HeygenSpendCapExceededError",
  },
  {
    guard: "teto em dólares (HeyGen): a checagem roda ANTES de debitCredit no handler de criação",
    name: "a chamada de assertHeygenSpendBudget some do handler de criação",
    kind: "obvio",
    file: "backend/src/routes/videos.ts",
    find:
      "    try {\n" +
      "      assertHeygenSpendBudget(estimatedSeconds, avatarCredential.vendor);\n" +
      "    } catch (err) {\n" +
      "      if (err instanceof HeygenSpendCapExceededError) {\n" +
      "        logEvent(\"warn\", \"video_heygen_spend_cap_exceeded\", {\n" +
      "          context: \"videos.create\",\n" +
      "          tenantId: req.tenantId,\n" +
      "          estimatedUsd: err.estimatedUsd,\n" +
      "          capUsd: err.capUsd,\n" +
      "          consequence: \"recusado antes do débito; nenhuma linha criada e nenhum crédito tocado\",\n" +
      "        });\n" +
      "        return reply.code(402).send({ error: \"heygen_spend_cap_exceeded\", message: err.message });\n" +
      "      }\n" +
      "      throw err;\n" +
      "    }\n\n" +
      "    const voiceCredential = await getCredential(req.tenantId, \"voice\");",
    replace: '    const voiceCredential = await getCredential(req.tenantId, "voice");',
    expect: "teto em dólares (HeyGen): a checagem não roda antes do débito no handler de criação",
  },
];

const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";

export async function checkHeygenSpendCapPolicy(repoRoot: string): Promise<HeygenSpendCapCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------
  // 1. EXECUÇÃO REAL de assertHeygenSpendBudget — a função de produção,
  // importada estaticamente no topo deste arquivo (mesmo padrão de
  // checkCostPolicy.ts), não reimplementada aqui.
  // ---------------------------------------------------------------------

  // Teto FIXO por env fabricado — não depende do default real, para o
  // caso de mutação, para não confundir "mutou o default" com "mutou o
  // freio". US$ 2,00 de teto; 100 s de HeyGen custam US$ 5,00 — acima.
  const envFake = { HEYGEN_TETO_USD: "2" } as NodeJS.ProcessEnv;

  let lancouAcima = false;
  try {
    assertHeygenSpendBudget(100, "heygen", envFake);
  } catch (err) {
    lancouAcima = err instanceof HeygenSpendCapExceededError;
  }
  if (!lancouAcima) {
    failures.push(
      "teto em dólares (HeyGen): assertHeygenSpendBudget(acima do teto) não lançou, esperado " +
        "HeygenSpendCapExceededError — uma geração cujo custo estimado passa do teto sairia sem freio " +
        "nenhum, e o gasto em dólar do caminho HeyGen continuaria sem limite algum.",
    );
  }

  let lancouDentro = false;
  try {
    assertHeygenSpendBudget(10, "heygen", envFake); // 10 s × US$0,05 = US$0,50, dentro do teto de US$2
  } catch {
    lancouDentro = true;
  }
  if (lancouDentro) {
    failures.push(
      "teto em dólares (HeyGen): assertHeygenSpendBudget(dentro do teto) lançou — o freio bloquearia " +
        "geração normal, dentro do orçamento configurado. Um teto que barra o uso comum é pior que " +
        "nenhum teto: ninguém confia nele e todo mundo aumenta o valor até ele nunca opinar.",
    );
  }

  // fal não tem custo MEDIDO ainda (costFor devolve known:false) — este
  // teto não pode ter opinião sobre um vendor sem medição própria; ele
  // teria que INVENTAR um número para recusar, que é a mesma mentira que
  // `costFor` já se recusa a contar na TELA.
  let lancouParaFal = false;
  try {
    assertHeygenSpendBudget(1000, "fal", envFake);
  } catch {
    lancouParaFal = true;
  }
  if (lancouParaFal) {
    failures.push(
      "teto em dólares (HeyGen): assertHeygenSpendBudget lançou para vendor `fal`, que não tem custo " +
        "medido — este teto se sobrepôs ao freio próprio do pipeline fal (`autorizarGasto`), que é o " +
        "que de fato protege aquele caminho.",
    );
  }

  // ---------------------------------------------------------------------
  // 2. POSIÇÃO no handler de criação — a checagem existe e roda antes do
  // débito, mesmo padrão de checkFalGenerationPathPolicy.ts.
  // ---------------------------------------------------------------------
  let rota: string;
  try {
    rota = await readFile(path.join(repoRoot, ROTA_DE_VIDEOS), "utf-8");
  } catch {
    failures.push(`teto em dólares (HeyGen): não consegui ler ${ROTA_DE_VIDEOS}.`);
    return { failures, notes };
  }

  const inicio = rota.indexOf('}>("/videos", { preHandler: requireActiveTenant }');
  const fim = rota.indexOf("await generateVideo({", inicio);
  if (inicio < 0 || fim < 0) {
    failures.push(
      "teto em dólares (HeyGen): não foi possível recortar o handler de criação em " +
        `${ROTA_DE_VIDEOS} pelas âncoras \`"/videos", { preHandler\` e \`await generateVideo({\`.`,
    );
  } else {
    const trecho = rota.slice(inicio, fim);
    for (const vizinha of ['app.get<{ Params', 'app.post<{ Params', "/videos/:id"]) {
      if (trecho.includes(vizinha)) {
        failures.push(
          `teto em dólares (HeyGen): o recorte do handler de criação engoliu \`${vizinha}\` — a ordem ` +
            "conferida abaixo seria a do handler errado.",
        );
      }
    }

    const posTeto = trecho.indexOf("assertHeygenSpendBudget(");
    const posDebito = trecho.indexOf("await debitCredit({");

    if (posTeto < 0 || posDebito < 0 || posTeto > posDebito) {
      failures.push(
        "teto em dólares (HeyGen): a checagem não roda antes do débito no handler de criação — sem " +
          "essa ordem, o crédito é consumido por uma geração cujo custo estimado já era conhecido como " +
          "acima do teto, e a recusa vira relatório em vez de freio.",
      );
    } else {
      notes.push(
        `    teto em dólares (HeyGen): a checagem roda antes do débito no handler de criação ` +
          `(teto em ${posTeto}, débito em ${posDebito} do recorte)`,
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "teto em dólares (HeyGen): custo acima do teto configurado é recusado antes do débito de " +
        "crédito, custo dentro do teto segue normalmente, e vendor sem custo medido (fal) nunca é " +
        "opinado por este teto — provado por EXECUÇÃO de assertHeygenSpendBudget mais posição de " +
        "texto no handler de criação.",
    );
  }

  return { failures, notes };
}
