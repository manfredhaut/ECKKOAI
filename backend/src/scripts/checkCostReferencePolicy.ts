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
import type { Mutant } from "./mutants.js";

const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";
const TABELA_FRONTEND = "frontend/src/pages/CreateVideo/DurationCostReference.tsx";

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
      "        };\n" +
      "      }),",
    replace:
      "      points: [\n" +
      "        { seconds: 15, costUsd: 0.75, costUnknownReason: null },\n" +
      "        { seconds: 30, costUsd: 1.5, costUnknownReason: null },\n" +
      "        { seconds: 60, costUsd: 3, costUnknownReason: null },\n" +
      "        { seconds: 90, costUsd: 4.5, costUnknownReason: null },\n" +
      "        { seconds: 120, costUsd: 6, costUnknownReason: null },\n" +
      "        { seconds: 180, costUsd: 9, costUnknownReason: null },\n" +
      "        { seconds: 300, costUsd: 15, costUnknownReason: null },\n" +
      "        { seconds: 600, costUsd: 30, costUnknownReason: null },\n" +
      "      ],",
    expect: "/video-cost-reference não delega mais a estimateVideoCost",
  },
  {
    guard: "tabela de custo: o vendor de cada ponto vem de vendorRequiredByTier(tier), nunca de um vendor fixo",
    name: "a rota passa a mostrar sempre os preços da heygen, ignorando o tier pedido",
    kind: "esperto",
    // ESPERTO: para tier "simples" o comportamento é IDÊNTICO (o vendor já
    // seria heygen). O defeito só aparece pedindo tier "normal"/"premium" —
    // a tabela mostraria preços de heygen para um vídeo que sairia pela fal.
    file: ROTA_DE_VIDEOS,
    find: "    const vendor = vendorRequiredByTier(tier);",
    replace: '    const vendor = "heygen";',
    expect: "a tabela de custo ignorou o tier pedido e sempre respondeu como heygen",
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

  if (failures.length === 0) {
    notes.push(
      "tabela de custo: /video-cost-reference calcula cada ponto por estimateVideoCost, resolvido pelo " +
        "vendor do tier pedido; DurationCostReference.tsx só consome, nenhum preço escrito no componente",
    );
  }

  return { failures, notes };
}
