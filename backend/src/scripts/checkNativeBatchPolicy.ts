/**
 * Invariantes do LOTE NATIVO — Fase 4 do bloco 5E.
 *
 * O caminho nativo é o único deste bloco que gasta dinheiro, e gasta N vezes.
 * Três números têm de andar sempre juntos — gerações, débitos e unidades do
 * teto —, e cada forma de eles se separarem tem uma consequência própria:
 *
 *   debitar menos que gerar    → o cliente recebe de graça o que custa
 *   consumir menos teto        → a proteção contra laço desliga no caminho caro
 *   nativo virar reaproveitado → o cliente paga por uma composição que não recebe
 *
 * As três estão cobertas por mutante, porque nenhuma delas muda a aparência do
 * código: um `debits: 1` no lugar de `debits: generations` continua sendo um
 * campo com um número plausível.
 */
import type { Mutant } from "./mutants.js";
import {
  batchSummaryMessage,
  planNativeBatch,
  runNativeBatch,
  type BatchPlan,
} from "../services/video/nativeBatch.js";
import { buildHeygenVideoPayload } from "../services/providers/avatarProvider.js";
import { HEYGEN_ASPECT_RATIOS } from "../services/providers/videoFormat.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "lote nativo: nativo é gerado, nunca reaproveitado",
    name: "formato pedido como nativo passa a reaproveitar o master",
    kind: "esperto",
    file: "backend/src/services/video/nativeBatch.ts",
    // A função continua distinguindo caminhos, o campo continua existindo e o
    // valor continua sendo um dos válidos. O que muda é a promessa: o cliente
    // pediu uma composição feita para o formato e recebe o master de outro.
    // Como o lote passa a ter zero gerações, ele também fica de graça — o
    // defeito é ao mesmo tempo uma mentira e um prejuízo.
    find: '    variants.push({ aspectRatio, path: nativeSet.has(aspectRatio) ? "native" : "derived" });',
    replace: '    variants.push({ aspectRatio, path: nativeSet.has(aspectRatio) ? "master" : "derived" });',
    expect: "pedido(s) como nativo(s) não produziram geração",
  },
  {
    guard: "lote nativo: N gerações = N débitos = N unidades de teto",
    name: "o lote debita menos do que gera",
    kind: "obvio",
    file: "backend/src/services/video/nativeBatch.ts",
    find: "    debits: generations,",
    replace: "    debits: 1,",
    expect: "débito(s) para",
  },
  {
    guard: "lote nativo: N gerações = N débitos = N unidades de teto",
    name: "o lote consome uma unidade de teto para várias gerações",
    kind: "esperto",
    file: "backend/src/services/video/nativeBatch.ts",
    // O mais perigoso dos três, e o menos visível: o crédito continua batendo,
    // a fatura continua batendo, e só a proteção contra laço morre. Em live
    // isso libera N-1 chamadas tarifadas que o teto existe para barrar.
    find: "    budgetUnits: generations,",
    replace: "    budgetUnits: 1,",
    expect: "unidade(s) de teto para",
  },
  {
    guard: "lote nativo: N gerações = N débitos = N unidades de teto",
    name: "filter → reduce: mesma contagem, deve seguir verde",
    kind: "esperto",
    // Contraponto: a guarda verifica a IGUALDADE dos três números, não a
    // forma de contá-los. Reprovar aqui seria casar implementação.
    file: "backend/src/services/video/nativeBatch.ts",
    find: '  const generations = variants.filter((v) => v.path === "native").length;',
    replace: '  const generations = variants.reduce((n, v) => (v.path === "native" ? n + 1 : n), 0);',
    expect: "gerações, débitos e unidades de teto andam juntos",
    expectGreen: true,
  },
];

export interface BatchCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkNativeBatchPolicy(): Promise<BatchCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  checkPayloadPerFormat(failures, notes);
  checkAccountingStaysAligned(failures, notes);
  checkMasterIsNotRebilled(failures, notes);
  await checkPartialFailure(failures, notes);
  await checkBudgetStopIsVisible(failures, notes);

  return { failures, notes };
}

// ------------------------------------------------------------------ 4.1 ---

/** Cada formato produz o payload daquele formato. Quatro JSON, quatro proporções. */
function checkPayloadPerFormat(failures: string[], notes: string[]): void {
  const vistos: string[] = [];

  for (const aspectRatio of HEYGEN_ASPECT_RATIOS) {
    const { body } = buildHeygenVideoPayload(
      {
        providerAvatarId: "avatar-teste",
        format: { platform: "youtube", aspectRatio, resolution: "1080p" },
        supportedEngines: ["avatar_iv"],
        engineEnabled: false,
      } as never,
      "asset-teste",
    );

    if (body.aspect_ratio !== aspectRatio) {
      failures.push(
        `lote nativo: o payload de ${aspectRatio} saiu com aspect_ratio=${JSON.stringify(body.aspect_ratio)}. ` +
          "Numa geração nativa a proporção é a ÚNICA coisa que distingue um pedido do outro — errá-la " +
          "produz N cópias do mesmo vídeo, cobradas como N formatos.",
      );
    }
    if (!body.resolution) {
      failures.push(
        `lote nativo: o payload de ${aspectRatio} não leva resolution. Sem ele o fornecedor decide, e a ` +
          "escolha volta a ser tomada por omissão — o defeito que o FORMATO-1 corrigiu.",
      );
    }
    vistos.push(`${aspectRatio}→${JSON.stringify(body.aspect_ratio)}/${String(body.resolution)}`);
  }

  // Contraponto: dois formatos diferentes não podem produzir o mesmo payload.
  const distintos = new Set(vistos);
  if (distintos.size !== vistos.length) {
    failures.push(
      "lote nativo: dois formatos produziram o MESMO payload. Um lote assim gera o mesmo vídeo várias " +
        "vezes e cobra por cada uma.",
    );
  }

  notes.push(`lote nativo: ${vistos.length} payload(s) distintos, um por proporção (${vistos.join(", ")})`);
}

// ------------------------------------------------------------------ 4.2 ---

/** Os três números andam juntos, em vários tamanhos de lote. */
function checkAccountingStaysAligned(failures: string[], notes: string[]): void {
  const casos = [
    { requested: ["16:9", "9:16", "4:5", "1:1"], native: ["16:9", "4:5", "1:1"], master: "9:16", esperado: 3 },
    { requested: ["16:9", "9:16"], native: ["16:9"], master: "9:16", esperado: 1 },
    { requested: ["16:9", "9:16", "4:5", "1:1"], native: [], master: "9:16", esperado: 0 },
  ];

  for (const caso of casos) {
    const plan = planNativeBatch({
      requested: caso.requested,
      native: caso.native,
      masterAspectRatio: caso.master,
    });

    if (plan.generations !== caso.esperado) {
      failures.push(
        `lote nativo: ${caso.native.length} formato(s) pedido(s) como nativo(s) produziram ` +
          `${plan.generations} geração(ões), esperado ${caso.esperado}.`,
      );
    }
    if (plan.debits !== plan.generations) {
      failures.push(
        `lote nativo: ${plan.debits} débito(s) para ${plan.generations} geração(ões). Debitar menos que ` +
          "gerar entrega de graça o que custa dinheiro, e a diferença só aparece na fatura do fornecedor.",
      );
    }
    if (plan.budgetUnits !== plan.generations) {
      failures.push(
        `lote nativo: ${plan.budgetUnits} unidade(s) de teto para ${plan.generations} geração(ões). O teto ` +
          "é a proteção contra laço no caminho mais caro do produto; consumir menos do que se gasta " +
          "desliga essa proteção sem mudar nada visível.",
      );
    }
  }

  notes.push(
    `lote nativo: ${casos.length} tamanho(s) de lote conferidos — gerações, débitos e unidades de teto ` +
      "andam juntos em todos",
  );
}

/** Pedir nativo para a proporção do master não gera nem cobra nada. */
function checkMasterIsNotRebilled(failures: string[], notes: string[]): void {
  const plan = planNativeBatch({
    requested: ["9:16"],
    native: ["9:16"],
    masterAspectRatio: "9:16",
  });

  if (plan.generations !== 0) {
    failures.push(
      "lote nativo: pedir nativo na proporção do master produziu geração. O master JÁ é nativo daquele " +
        "formato — gerá-lo de novo vende duas vezes a mesma renderização.",
    );
  }
  if (plan.variants[0]?.path !== "master") {
    failures.push(
      `lote nativo: a proporção do master saiu como "${plan.variants[0]?.path}", esperado "master".`,
    );
  }

  // Contraponto, e é ele que separa esta asserção da anterior: uma proporção
  // DIFERENTE pedida como nativa tem de gerar. Sem isto, marcar tudo como
  // "master" passaria nas duas.
  const outra = planNativeBatch({ requested: ["16:9"], native: ["16:9"], masterAspectRatio: "9:16" });
  if (outra.generations !== 1 || outra.variants[0]?.path !== "native") {
    failures.push(
      "lote nativo: um formato diferente do master pedido como nativo NÃO produziu geração — os " +
        `formato(s) pedido(s) como nativo(s) não produziram geração. O cliente pagaria por uma ` +
        "composição feita para aquele formato e receberia o master adaptado.",
    );
  }

  notes.push("lote nativo: a proporção do master não é recobrada; qualquer outra pedida como nativa gera");
}

// ------------------------------------------------------------------ 4.2b ---

/** Falha no terceiro de quatro: os dois já aceitos continuam cobrados. */
async function checkPartialFailure(failures: string[], notes: string[]): Promise<void> {
  const plan: BatchPlan = planNativeBatch({
    requested: ["16:9", "4:5", "1:1", "5:4"],
    native: ["16:9", "4:5", "1:1", "5:4"],
    masterAspectRatio: "9:16",
  });

  let chamadas = 0;
  const result = await runNativeBatch(plan, async (aspect) => {
    chamadas += 1;
    if (aspect === "1:1") throw new Error("fornecedor recusou");
  });

  if (result.chargedGenerations !== 2) {
    failures.push(
      `lote nativo: depois de falhar no terceiro, o lote reportou ${result.chargedGenerations} geração(ões) ` +
        "cobrada(s), esperado 2. O que o fornecedor aceitou continua cobrado — não há estorno depois do " +
        "aceite, e informar menos faria a fatura parecer errada.",
    );
  }
  if (result.skipped !== 1) {
    failures.push(
      `lote nativo: ${result.skipped} formato(s) pulado(s) após a falha, esperado 1. O lote para na ` +
        "primeira falha: insistir gastaria mais crédito para colher o mesmo erro.",
    );
  }
  if (chamadas !== 3) {
    failures.push(
      `lote nativo: o fornecedor foi chamado ${chamadas} vez(es) num lote que devia parar na terceira. ` +
        "Continuar depois da falha é o comportamento que transforma erro de configuração em conta alta.",
    );
  }
  const msg = batchSummaryMessage(result);
  if (!msg || !msg.includes("2") || !msg.includes("continuam cobrados")) {
    failures.push(
      "lote nativo: a falha parcial não produziu mensagem dizendo quantos formatos ficaram pagos. Um lote " +
        "que para no meio e não diz nada é indistinguível de um que terminou.",
    );
  }

  // Contraponto: lote inteiro bem-sucedido não inventa aviso de falha.
  const okResult = await runNativeBatch(plan, async () => {});
  if (okResult.partial || batchSummaryMessage(okResult) !== null) {
    failures.push(
      "lote nativo: um lote sem falha nenhuma produziu aviso de falha parcial. Aviso que aparece sempre " +
        "treina o cliente a ignorá-lo.",
    );
  }

  notes.push(
    `lote nativo: falha no 3º de 4 → 2 cobrada(s), 1 pulado(s), fornecedor chamado 3x, e a mensagem diz ` +
      "o que ficou pago",
  );
}

// ------------------------------------------------------------------ 4.3 ---

/** O teto barra o lote, e o motivo chega à tela. */
async function checkBudgetStopIsVisible(failures: string[], notes: string[]): Promise<void> {
  const plan = planNativeBatch({
    requested: ["16:9", "4:5", "1:1", "5:4"],
    native: ["16:9", "4:5", "1:1", "5:4"],
    masterAspectRatio: "9:16",
  });

  // Teto de 2: a terceira chamada é recusada pela nossa trava, não pelo
  // fornecedor. É o cenário do DEMO-3, em que a recusa local foi apresentada
  // como falha da HeyGen e mandou procurar defeito no lugar errado.
  let restante = 2;
  const result = await runNativeBatch(plan, async () => {
    if (restante <= 0) {
      throw new Error(
        "Teto de gerações desta sessão atingido (2). O limite é DESTE aplicativo, não do fornecedor, " +
          "e nada foi cobrado por esta tentativa.",
      );
    }
    restante -= 1;
  });

  if (result.chargedGenerations !== 2) {
    failures.push(
      `lote nativo: com teto de 2, o lote cobrou ${result.chargedGenerations} geração(ões). O teto tem de ` +
        "parar o lote exatamente onde acaba, sem gerar a mais nem descartar o que já saiu.",
    );
  }
  const msg = batchSummaryMessage(result);
  if (!msg) {
    failures.push(
      "lote nativo: o lote parou no teto e não produziu mensagem nenhuma. Parar em silêncio é o pior " +
        "desfecho: o cliente vê dois arquivos onde pediu quatro e não tem como saber por quê.",
    );
  }

  notes.push(
    "lote nativo: com teto de 2, um lote de 4 para no segundo, mantém as 2 cobradas e explica o que houve",
  );
}
