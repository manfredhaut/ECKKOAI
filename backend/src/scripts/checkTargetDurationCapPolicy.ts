/**
 * O TETO DO CAMPO DE DURAÇÃO, POR TIER — ITEM 1 do fechamento do tier
 * Normal, 28/08/2026.
 *
 * ┌─ O defeito que isto fecha ────────────────────────────────────────────────┐
 * │ Antes desta rodada, o campo "Mais" (`targetDuration.ts`) aceitava até     │
 * │ 600s (o teto de DINHEIRO da HeyGen) mesmo com "Normal" escolhido — só o   │
 * │ SERVIDOR recusava depois, na hora de gerar. O tier Normal fraciona em     │
 * │ blocos de até 15s, no máximo 8 (120s) — um teto bem mais apertado, que a  │
 * │ TELA nunca soube.                                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  `targetDurationMaxSecondsForTier("normal")` — POR EXECUÇÃO real do
 *       módulo frontend (mesmo padrão de `checkScriptLimitPolicy.ts`: TS
 *       puro, sem JSX, importável direto) — devolve EXATAMENTE
 *       `NORMAL_MAX_TARGET_SECONDS` (120, servidor), nunca `TARGET_DURATION_MAX_SECONDS`
 *       (600). "simples"/"premium" continuam em 600, sem mudança.
 *  G-2  `ScriptStep.tsx` de fato CHAMA `targetDurationMaxSecondsForTier(tierVideo)`
 *       — por FORMA: a função pode estar certa e nunca ser usada pela tela,
 *       que é exatamente o defeito que motivou este item.
 *
 * Custo: ZERO. Leitura de arquivo + import de módulo TS puro.
 */
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { NORMAL_MAX_TARGET_SECONDS } from "../services/video/scriptFractioning.js";

const TARGET_DURATION_TS = "frontend/src/pages/CreateVideo/targetDuration.ts";
const SCRIPT_STEP_TSX = "frontend/src/pages/CreateVideo/steps/ScriptStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "targetDurationMaxSecondsForTier(\"normal\") devolve 120, nunca o teto de 600 da HeyGen",
    name: "o teto do campo volta a ser 600 também para o tier Normal",
    kind: "esperto",
    // ESPERTO: a função continua existindo, o `tsc` continua verde (os dois
    // ramos devolvem `number`), e o campo "Mais" volta a aceitar até 600s
    // com "Normal" selecionado — exatamente o defeito de origem deste item,
    // silencioso até alguém digitar uma duração que o servidor recusa.
    file: TARGET_DURATION_TS,
    find:
      'export function targetDurationMaxSecondsForTier(tierVideo: "simples" | "normal" | "premium"): number {\n' +
      '  return tierVideo === "normal" ? NORMAL_TARGET_DURATION_MAX_SECONDS : TARGET_DURATION_MAX_SECONDS;\n' +
      "}",
    replace:
      'export function targetDurationMaxSecondsForTier(tierVideo: "simples" | "normal" | "premium"): number {\n' +
      "  void tierVideo;\n" +
      "  return TARGET_DURATION_MAX_SECONDS;\n" +
      "}",
    expect: "duração: targetDurationMaxSecondsForTier",
  },
  {
    guard: "ScriptStep.tsx chama targetDurationMaxSecondsForTier(tierVideo) — a tela usa o teto certo",
    name: "a tela para de consultar o teto por tier",
    kind: "obvio",
    // ÓBVIO: sem a chamada, o campo volta a usar um número fixo (o antigo
    // `TARGET_DURATION_MAX_SECONDS`) para todo tier — a função existe e
    // acerta o valor, mas ninguém pergunta a ela.
    file: SCRIPT_STEP_TSX,
    find: "  const maxParaTier = targetDurationMaxSecondsForTier(tierVideo);",
    replace: "  const maxParaTier = 600;",
    expect: "duração: ScriptStep.tsx não chama targetDurationMaxSecondsForTier",
  },
];

export interface TargetDurationCapCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkTargetDurationCapPolicy(repoRoot: string): Promise<TargetDurationCapCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1: por EXECUÇÃO real do módulo frontend --------------------------
  const targetDurationFull = path.join(repoRoot, TARGET_DURATION_TS);
  let mod: {
    NORMAL_TARGET_DURATION_MAX_SECONDS: number;
    TARGET_DURATION_MAX_SECONDS: number;
    targetDurationMaxSecondsForTier: (tier: "simples" | "normal" | "premium") => number;
  };
  try {
    mod = (await import(`file://${targetDurationFull.replace(/\\/g, "/")}?bust=${Date.now()}-${Math.random()}`)) as typeof mod;
  } catch (err) {
    failures.push(
      `duração: não foi possível importar ${TARGET_DURATION_TS} — ${err instanceof Error ? err.message : String(err)}`,
    );
    return { failures, notes };
  }

  if (mod.NORMAL_TARGET_DURATION_MAX_SECONDS !== NORMAL_MAX_TARGET_SECONDS) {
    failures.push(
      `duração: ${TARGET_DURATION_TS} declara NORMAL_TARGET_DURATION_MAX_SECONDS=` +
        `${mod.NORMAL_TARGET_DURATION_MAX_SECONDS}, divergente de NORMAL_MAX_TARGET_SECONDS=` +
        `${NORMAL_MAX_TARGET_SECONDS} do servidor (scriptFractioning.ts) — o campo "Mais" travaria num ` +
        "número que não é o teto real do fracionamento.",
    );
  }

  const paraNormal = mod.targetDurationMaxSecondsForTier("normal");
  const paraSimples = mod.targetDurationMaxSecondsForTier("simples");
  const paraPremium = mod.targetDurationMaxSecondsForTier("premium");

  if (paraNormal !== NORMAL_MAX_TARGET_SECONDS) {
    failures.push(
      `duração: targetDurationMaxSecondsForTier("normal") devolveu ${paraNormal}, esperado ` +
        `${NORMAL_MAX_TARGET_SECONDS} — um roteiro Normal poderia pedir uma duração-alvo maior que o ` +
        "fracionamento realmente aceita, sem nenhum aviso na tela antes do clique.",
    );
  }
  if (paraSimples !== mod.TARGET_DURATION_MAX_SECONDS || paraPremium !== mod.TARGET_DURATION_MAX_SECONDS) {
    failures.push(
      `duração: targetDurationMaxSecondsForTier("simples"/"premium") deveria continuar em ` +
        `${mod.TARGET_DURATION_MAX_SECONDS} (comportamento de antes desta rodada) — veio simples=` +
        `${paraSimples}, premium=${paraPremium}.`,
    );
  }

  // --- G-2: a TELA de fato chama a função, por FORMA ----------------------
  const { readFileSync } = await import("node:fs");
  const scriptStepSrc = readFileSync(path.join(repoRoot, SCRIPT_STEP_TSX), "utf8");
  if (!scriptStepSrc.includes("targetDurationMaxSecondsForTier(tierVideo)")) {
    failures.push(
      `duração: ${SCRIPT_STEP_TSX} não chama \`targetDurationMaxSecondsForTier(tierVideo)\` — a função ` +
        "pode devolver o número certo e a tela continuar usando um teto fixo, que é exatamente o defeito " +
        "de origem deste item.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      `    duração: targetDurationMaxSecondsForTier trava em ${NORMAL_MAX_TARGET_SECONDS}s para Normal e em ` +
        `${mod.TARGET_DURATION_MAX_SECONDS}s para Simples/Premium, e ${SCRIPT_STEP_TSX} de fato a consulta`,
    );
  }

  return { failures, notes };
}
