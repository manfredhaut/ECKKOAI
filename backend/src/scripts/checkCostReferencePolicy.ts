/**
 * Tabela orientativa de duração×custo do passo Roteiro — E3, 22/08/2026.
 *
 * `GET /video-cost-reference` e `DurationCostReference.tsx` existem para
 * responder "quanto custaria N segundos neste nível?" antes de escrever o
 * roteiro. O risco único desta peça é justamente o que ela existe para
 * evitar: alguém escrever uma tabela de preços FIXA em vez de calcular —
 * a mesma classe de defeito que `ScriptCounter.tsx` já teve de fechar
 * (`checkScriptLimitPolicy.ts`, item 4), agora num componente novo.
 *
 * FORMA, não execução: `estimateVideoCost`/`vendorRequiredByTier` já têm
 * guarda própria em outros arquivos (`checkTierVendorPolicy.ts`); testá-los
 * de novo aqui seria duplicar cobertura. O que só este arquivo pode provar é
 * que a ROTA e o COMPONENTE de fato DELEGAM a eles, em vez de guardar um
 * número escrito à mão que coincide com o de hoje.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { maxReachableSecondsForTier } from "../services/video/falPipeline.js";
import type { Mutant } from "./mutants.js";

const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";
const TABELA_FRONTEND = "frontend/src/pages/CreateVideo/DurationCostReference.tsx";
const CARTAO_NIVEL = "frontend/src/pages/CreateVideo/steps/SceneStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "tabela de custo: GET /video-cost-reference calcula cada ponto por estimateVideoCost, nunca uma lista fixa",
    name: "a rota passa a devolver os valores de HOJE escritos à mão, em vez de calcular",
    kind: "esperto",
    // ESPERTO: os números aqui são EXATAMENTE os que estimateVideoCost(vendor
    // heygen) produz hoje (US$0,05/s truncado) — nada muda na resposta para o
    // tier Simples enquanto USD_PER_BILLED_SECOND não mudar. O defeito só
    // aparece no dia em que a tarifa medida mudar e a tabela continuar
    // afirmando os preços de antes.
    file: ROTA_DE_VIDEOS,
    find:
      "      points: COST_REFERENCE_SECONDS.map((seconds) => {\n" +
      "        const cost = estimateVideoCost(seconds, vendor);\n" +
      "        return {\n" +
      "          seconds,\n" +
      "          costUsd: cost.known ? cost.usd : null,\n" +
      "          costUnknownReason: cost.known ? null : cost.explanation,\n" +
      "          unavailableForTier: seconds > maxAlcancavel,\n" +
      "        };\n" +
      "      }),",
    replace:
      "      points: [\n" +
      "        { seconds: 15, costUsd: 0.75, costUnknownReason: null, unavailableForTier: false },\n" +
      "        { seconds: 30, costUsd: 1.5, costUnknownReason: null, unavailableForTier: false },\n" +
      "        { seconds: 60, costUsd: 3, costUnknownReason: null, unavailableForTier: false },\n" +
      "        { seconds: 90, costUsd: 4.5, costUnknownReason: null, unavailableForTier: false },\n" +
      "        { seconds: 120, costUsd: 6, costUnknownReason: null, unavailableForTier: false },\n" +
      "        { seconds: 180, costUsd: 9, costUnknownReason: null, unavailableForTier: false },\n" +
      "        { seconds: 300, costUsd: 15, costUnknownReason: null, unavailableForTier: false },\n" +
      "        { seconds: 600, costUsd: 30, costUnknownReason: null, unavailableForTier: true },\n" +
      "      ],",
    expect: "/video-cost-reference não delega mais a estimateVideoCost",
  },
  {
    guard: "tabela de custo: unavailableForTier vem de maxReachableSecondsForTier(tier), não de um teto fixo",
    name: "unavailableForTier passa a comparar contra MAX_SCRIPT_SECONDS (600) para todo tier",
    kind: "esperto",
    // ESPERTO: para tier "simples" quase nada muda no efeito prático (o teto
    // real, ≈459s, já é menor que 600 — só o ponto de 600s mudaria de
    // "indisponível" para "disponível", incorretamente). O defeito GRAVE
    // aparece em normal/premium: os pontos de 30 a 600s passariam a mostrar
    // "sem medição" como se fossem apenas não-medidos, escondendo que o Wan
    // não anima mais que 15s — a MESMA confusão que este bloco existe para
    // fechar.
    file: ROTA_DE_VIDEOS,
    find: "    const maxAlcancavel = maxReachableSecondsForTier(tier);",
    replace: "    const maxAlcancavel = 600;",
    expect: "um ponto acima do que o Wan anima (15s) não foi marcado como indisponível para o tier",
  },
  {
    guard: "tabela de custo: o vendor de cada ponto vem de vendorRequiredByTier(tier), nunca de um vendor fixo",
    name: "a rota passa a mostrar sempre os preços da heygen, ignorando o tier pedido",
    kind: "esperto",
    // ESPERTO: para tier "simples" o comportamento é IDÊNTICO (o vendor já
    // seria heygen). O defeito só aparece pedindo tier "normal"/"premium" —
    // a tabela mostraria preços de heygen para um vídeo que sairia pela fal.
    file: ROTA_DE_VIDEOS,
    // ⚠️ CONTEXTO acrescentado no W4 (24/08): a rota nova
    // `/videos/tier-availability` usa a MESMA linha (ela consulta a mesma
    // cadeia de propósito), e o find de uma linha só passou a casar 2x. A
    // linha seguinte — o comentário do teto de duração — só existe nesta
    // rota, e é ela que desempata. Contexto ao find, nunca apagar a linha
    // nova do produto.
    find:
      "    const vendor = vendorRequiredByTier(tier);\n" +
      "    // F2, 22/08/2026: teto de duração REAL deste tier",
    replace:
      '    const vendor = "heygen";\n' +
      "    // F2, 22/08/2026: teto de duração REAL deste tier",
    expect: "a tabela de custo ignorou o tier pedido e sempre respondeu como heygen",
  },
  {
    guard: "cartão de nível: o preço vem de /video-cost-reference (estimateVideoCost), nunca um texto fixo",
    name: "o preço do cartão Premium volta a ser a string fixa 'US$ 14,19'",
    kind: "esperto",
    // ESPERTO: os outros dois cartões continuam corretos, a chamada a
    // /video-cost-reference continua acontecendo para os três tiers — só o
    // valor calculado deixa de ser usado no cartão Premium. É o defeito A3
    // original, palavra por palavra: uma string que não reage a nada,
    // cabendo perfeitamente ao lado de código que parece dinâmico.
    file: CARTAO_NIVEL,
    find:
      '                <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>{precoDoCartao(opt.value)}</span>',
    replace:
      '                <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>' +
      '{opt.value === "premium" ? "US$ 14,19" : precoDoCartao(opt.value)}</span>',
    expect: "parece ter um preço em dólar escrito no código, fora de",
  },
];

export interface CostReferenceCheckResult {
  failures: string[];
  notes: string[];
}

export function checkCostReferencePolicy(repoRoot: string): CostReferenceCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // A rota DELEGA — nunca guarda a tabela pronta.
  // ---------------------------------------------------------------------------
  const rota = readFileSync(path.join(repoRoot, ROTA_DE_VIDEOS), "utf8");
  const inicioRota = rota.indexOf('"/video-cost-reference"');
  const corpoRota = inicioRota >= 0 ? rota.slice(inicioRota, rota.indexOf("\n  });", inicioRota)) : "";

  if (!corpoRota) {
    failures.push(`tabela de custo: rota GET /video-cost-reference não encontrada em ${ROTA_DE_VIDEOS}.`);
  } else {
    if (!corpoRota.includes("COST_REFERENCE_SECONDS.map(")) {
      failures.push(
        "tabela de custo: /video-cost-reference não itera mais sobre COST_REFERENCE_SECONDS — os pontos " +
          "fixos de duração podem ter virado uma lista escrita à mão.",
      );
    }
    if (!corpoRota.includes("estimateVideoCost(seconds, vendor)")) {
      failures.push(
        "/video-cost-reference não delega mais a estimateVideoCost — a tabela pode estar mostrando " +
          "números que não vêm da régua de custo real, e não acompanhariam uma mudança de tarifa.",
      );
    }
    if (!corpoRota.includes("vendorRequiredByTier(tier)")) {
      failures.push(
        "a tabela de custo ignorou o tier pedido e sempre respondeu como heygen — " +
          "/video-cost-reference não resolve mais o vendor por vendorRequiredByTier(tier).",
      );
    }
    if (!corpoRota.includes("maxReachableSecondsForTier(tier)")) {
      failures.push(
        "um ponto acima do que o Wan anima (15s) não foi marcado como indisponível para o tier — " +
          "/video-cost-reference não resolve mais o teto real por maxReachableSecondsForTier(tier).",
      );
    }
    // `target` — Fase A, item 2: o ponto ÚNICO que o cartão de nível usa
    // (SceneStep.tsx) tem de sair da MESMA estimateVideoCost dos pontos
    // fixos acima, nunca de um número à parte.
    if (!corpoRota.includes("estimateVideoCost(pontoAlvo, vendor)")) {
      failures.push(
        "cartão de nível: /video-cost-reference não calcula mais `target` por estimateVideoCost(pontoAlvo, " +
          "vendor) — o preço que o cartão de nível mostra pode ter deixado de vir da régua de custo real.",
      );
    }
    if (!corpoRota.includes("const pontoAlvo = targetSecondsPedido ?? maxAlcancavel;")) {
      failures.push(
        "cartão de nível: /video-cost-reference deixou de cair no teto real do tier quando não há " +
          "targetSeconds — sem essa régua, o preço do cartão antes de haver roteiro voltaria a ser um " +
          "número inventado ou ausente.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // maxReachableSecondsForTier — por EXECUÇÃO real (import estático, topo do
  // arquivo — mesmo padrão de checkTierVendorPolicy.ts), os 3 tiers. F2,
  // 22/08. Nenhum mutante desta rodada muta falPipeline.ts, então não há
  // razão para o import dinâmico com cache-bust; um import estático de uma
  // função exportada é suficiente e evita o mount /repo (só leitura, sem
  // node_modules próprio — falPipeline.ts arrasta credentialLookup.ts →
  // db/pool.ts → `pg`, que só resolve a partir de /app, onde o processo
  // real roda).
  // ---------------------------------------------------------------------------
  const normal = maxReachableSecondsForTier("normal");
  const premium = maxReachableSecondsForTier("premium");
  const simples = maxReachableSecondsForTier("simples");

  // BLOCO FRACOES-1, 28/08: "normal" passou a fracionar (até 120s = 8 blocos
  // de 15s), "premium" continua no bloco único (fora de escopo desta rodada
  // — ver docs-internal/plano-fracoes-2026-08-28.md). Os dois deixaram de
  // ser o mesmo número de propósito.
  if (normal !== 120 || premium !== 15) {
    failures.push(
      `tabela de custo: maxReachableSecondsForTier deu normal=${normal}, premium=${premium}, esperado ` +
        "normal=120 (8 blocos de 15s, fracionado desde o BLOCO FRACOES-1) e premium=15 (bloco único, " +
        "o Wan/Seedance não anima clipe mais longo que isso por chamada e o Premium não foi fracionado).",
    );
  }
  // ~459s é o esperado (5000 caracteres, ritmo medido) — faixa, não igualdade
  // exata, porque o valor é uma estimativa fracionária, não um inteiro fixo.
  if (!(simples > 450 && simples < 470)) {
    failures.push(
      `tabela de custo: maxReachableSecondsForTier("simples") deu ${simples}, esperado entre 450 e 470 ` +
        "— o teto de caracteres da HeyGen (5.000) deveria bindar bem antes dos 600s de dinheiro.",
    );
  }

  // ---------------------------------------------------------------------------
  // O componente CONSOME a rota — nunca guarda preço nenhum por conta própria.
  // ---------------------------------------------------------------------------
  const tabelaFrontendSrc = readFileSync(path.join(repoRoot, TABELA_FRONTEND), "utf8");
  if (!tabelaFrontendSrc.includes("/video-cost-reference")) {
    failures.push(`tabela de custo: ${TABELA_FRONTEND} não chama mais /video-cost-reference.`);
  }
  // Nenhum número de dólar (padrão "0.xx"/"1.xx" etc., ponto decimal) escrito
  // no componente — só no BACKEND, que é onde a régua de preço mora.
  if (/\b\d+\.\d+\b/.test(tabelaFrontendSrc.replace(/\/\*[\s\S]*?\*\//g, ""))) {
    failures.push(
      `tabela de custo: ${TABELA_FRONTEND} parece ter um número decimal escrito no código — preço é ` +
        "responsabilidade do servidor, nunca do componente que só exibe.",
    );
  }

  // ---------------------------------------------------------------------------
  // O CARTÃO DE NÍVEL (SceneStep.tsx) também só consome — defeito A3.
  // ---------------------------------------------------------------------------
  const cartaoSrc = readFileSync(path.join(repoRoot, CARTAO_NIVEL), "utf8");
  if (!cartaoSrc.includes("/video-cost-reference")) {
    failures.push(`cartão de nível: ${CARTAO_NIVEL} não chama mais /video-cost-reference.`);
  }
  // Nenhum preço em dólar ESCRITO no componente — nem ponto decimal (padrão
  // americano) nem vírgula (padrão pt-BR, o formato do literal original do
  // defeito A3, "US$ 14,19"). Bloco de comentário `/** … */` removido antes
  // de testar: o histórico do defeito é citado em comentário no próprio
  // arquivo, e citar não é reintroduzir.
  const cartaoSemComentarios = cartaoSrc.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/US\$\s*\d/.test(cartaoSemComentarios)) {
    failures.push(
      `cartão de nível: ${CARTAO_NIVEL} parece ter um preço em dólar escrito no código, fora de ` +
        'comentário — padrão `US$` seguido de dígito. É exatamente a forma do defeito A3 original ' +
        '("US$ 14,19", uma faixa que citava "30s de referência" sem nunca recalcular). O preço é ' +
        "responsabilidade do servidor (/video-cost-reference), nunca de um literal no componente.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "tabela de custo: /video-cost-reference calcula cada ponto por estimateVideoCost, resolvido pelo " +
        "vendor do tier pedido; DurationCostReference.tsx só consome, nenhum preço escrito no componente",
    );
    notes.push(
      "    cartão de nível: SceneStep.tsx consome /video-cost-reference (target, pelo mesmo estimador), " +
        "nenhum preço fixo escrito no componente — A3 fechado",
    );
  }

  return { failures, notes };
}
