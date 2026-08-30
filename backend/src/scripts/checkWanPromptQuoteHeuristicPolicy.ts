/**
 * A exceção de ASPAS na heurística de português não traduzido do linter do
 * Wan (`lintarPromptDoBlocoWan`, `TERMO_NAO_PT` — falPipeline.ts) —
 * RODADA 8, item 3 (30/08/2026).
 *
 * ┌─ O bug real que motivou esta guarda ────────────────────────────────────┐
 * │ A direção traduzida cita a fala do roteiro entre aspas retas (ex.:      │
 * │ `"Inovar não é criar o futuro, é transformar o agora."`, MEDIDO num     │
 * │ vídeo real — `videos.motion_prompt_en` da corrida `7e943007…`, RODADA   │
 * │ 7). A heurística `/\bnão\b/i` reprovava isso como "português não        │
 * │ traduzido" — falso positivo: a fala citada é português DE PROPÓSITO,    │
 * │ não esquecimento. A correção remove trechos entre aspas retas ANTES de  │
 * │ testar só este termo; os outros 7 termos de `TERMOS_PT_HEURISTICA`      │
 * │ continuam testados contra o prompt inteiro, aspas incluídas — nenhum    │
 * │ deles bloqueou uma corrida real, e esta rodada corrige só o que          │
 * │ bloqueou, por instrução explícita do operador.                          │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ANCORADA EM EXECUÇÃO REAL, não em texto ────────────────────────────────┐
 * │ Chama `lintarPromptDoBlocoWan` de verdade, duas vezes, com corpos que     │
 * │ isolam CADA PONTA da exceção:                                            │
 * │  (a) fala em português citada ENTRE ASPAS + direção em inglês fora delas │
 * │      → precisa PASSAR (não lançar).                                     │
 * │  (b) "não" esquecido FORA de aspas, sem nenhuma outra palavra da lista   │
 * │      → precisa CONTINUAR REPROVANDO — senão a exceção de aspas virou uma │
 * │      porta para qualquer texto em português escapar do linter.          │
 * │ Os dois corpos evitam de propósito os outros 7 termos da heurística,     │
 * │ para que só a exceção de "não" seja exercitada — um mutante que          │
 * │ destruísse só essa exceção não pode ser mascarado pelos outros termos.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. `lintarPromptDoBlocoWan` é síncrona, sem rede.
 */
import { lintarPromptDoBlocoWan } from "../services/video/falPipeline.js";
import type { Mutant } from "./mutants.js";

const FILE = "backend/src/services/video/falPipeline.ts";

export const MUTANTS: Mutant[] = [
  {
    guard:
      "aspas retas protegem a fala citada do roteiro da heurística de \"não\" traduzido, sem deixar de pegar português esquecido fora delas",
    name: "reverte a exceção de aspas (TERMO_NAO_PT volta a testar o prompt inteiro)",
    kind: "obvio",
    file: FILE,
    find: "if (TERMO_NAO_PT.test(promptSemFala) || TERMOS_PT_HEURISTICA.some((re) => re.test(prompt))) {",
    replace: "if (TERMO_NAO_PT.test(prompt) || TERMOS_PT_HEURISTICA.some((re) => re.test(prompt))) {",
    expect: "aspas: falso positivo voltou — fala citada em português entre aspas reprova o linter de novo",
  },
  {
    guard:
      "aspas retas protegem a fala citada do roteiro da heurística de \"não\" traduzido, sem deixar de pegar português esquecido fora delas",
    name: "remoção de aspas fica gananciosa demais (apaga o prompt inteiro, não só as aspas)",
    kind: "esperto",
    // ESPERTO: não reverte a exceção, ALARGA a remoção — continua "removendo
    // texto entre aspas" na aparência, mas a regex passa a casar o prompt
    // inteiro (aspas ou não). O sintoma é o oposto do mutante óbvio: em vez
    // de o falso positivo voltar, é o falso negativo que volta, porque
    // `promptSemFala` vira "" mesmo quando não há aspas nenhuma no prompt.
    file: FILE,
    find: 'return texto.replace(/"[^"]*"/g, "");',
    replace: 'return texto.replace(/[\\s\\S]*/g, "");',
    expect: "aspas: falso negativo voltou — português fora de aspas deixou de ser pego pela heurística",
  },
];

export interface WanPromptQuoteHeuristicCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkWanPromptQuoteHeuristicPolicy(): Promise<WanPromptQuoteHeuristicCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // (a) falso positivo eliminado: fala citada em PT entre aspas retas +
  // direção em inglês fora delas. Nenhuma palavra fora das aspas pertence à
  // lista de heurísticas, de propósito.
  const corpoComFalaCitada = {
    prompt:
      'Medium shot, speak with an inspiring and confident tone while looking straight into the lens: ' +
      '"Inovar não é criar o futuro, é transformar o agora." Hold a steady gaze throughout.',
    negative_prompt: "cartoon, watermark",
  };
  try {
    lintarPromptDoBlocoWan(corpoComFalaCitada);
  } catch (erro) {
    failures.push(
      `aspas: falso positivo voltou — fala citada em português entre aspas reprova o linter de novo (${(erro as Error).message})`,
    );
  }

  // (b) falso negativo continua pego: "não" esquecido FORA de qualquer
  // aspas, sem nenhum outro termo da heurística presente — isola a exceção
  // de "não" de todos os outros 7 termos, que não foram tocados.
  const corpoComPortuguesEsquecido = {
    prompt: "Medium shot, não traduzido, hold a steady gaze throughout.",
    negative_prompt: "cartoon, watermark",
  };
  let reprovouComoEsperado = false;
  try {
    lintarPromptDoBlocoWan(corpoComPortuguesEsquecido);
  } catch (erro) {
    reprovouComoEsperado = (erro as Error).message.includes("português não traduzido");
  }
  if (!reprovouComoEsperado) {
    failures.push("aspas: falso negativo voltou — português fora de aspas deixou de ser pego pela heurística");
  }

  if (failures.length === 0) {
    notes.push(
      "    aspas: fala citada do roteiro entre aspas retas passa o linter; \"não\" esquecido fora delas " +
        "continua reprovando — MEDIDO por execução real de lintarPromptDoBlocoWan, corpo a corpo",
    );
  }

  return { failures, notes };
}
