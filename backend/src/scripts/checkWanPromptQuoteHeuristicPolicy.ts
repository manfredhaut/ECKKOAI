/**
 * A exceção de ASPAS na heurística de português não traduzido do linter do
 * Wan (`lintarPromptDoBlocoWan`, `TERMOS_PT_HEURISTICA` — falPipeline.ts).
 *
 * RODADA 8 (30/08/2026) — só `/\bnão\b/i` foi corrigido: a direção traduzida
 * cita a fala do roteiro entre aspas retas (ex.: `"Inovar não é criar o
 * futuro..."`, MEDIDO num vídeo real, `videos.motion_prompt_en` da corrida
 * `7e943007…`), e a fala citada é português DE PROPÓSITO, não esquecimento.
 * Os outros 7 termos ficaram como estavam, por instrução explícita de
 * corrigir só o que bloqueou de fato.
 *
 * RODADA 8b (30/08/2026) — os 7 restantes (`você`, `está`, `com`, `ela`,
 * `ele`, `ção`, `para`) têm o MESMO problema em tese: qualquer um pode
 * aparecer dentro de uma fala citada tão facilmente quanto "não". A mesma
 * técnica se generaliza para os 8: todos são testados contra o prompt com
 * trechos entre aspas retas removidos (`removerFalaEntreAspas`), e a
 * heurística continua vigiando o resto do prompt por português esquecido
 * FORA das aspas.
 *
 * RODADA 9 (30/08/2026) — `/\bvocê\b/i` e `/\bestá\b/i` CORRIGIDAS. O achado
 * da rodada anterior (nunca casavam nada, com ou sem aspas: o `\b` do
 * JavaScript exige fronteira `\w` = ASCII só, e as duas regexes terminam no
 * caractere acentuado "ê"/"á", que não é `\w`) foi resolvido trocando por
 * lookaround Unicode-aware: `(?<!\p{L})termo(?!\p{L})` (flag `u`), que não
 * depende de `\w` e reprova o termo cercado por espaço/pontuação/fim de
 * string, sem casar dentro de outra palavra. Os outros 6 termos, que já
 * funcionavam, não foram tocados. Agora os 8 têm as duas pontas provadas.
 *
 * ┌─ ANCORADA EM EXECUÇÃO REAL, não em texto ────────────────────────────────┐
 * │ Chama `lintarPromptDoBlocoWan` de verdade, duas vezes POR TERMO (16      │
 * │ chamadas no total, 8 termos × 2 pontas):                                 │
 * │  (a) o termo aparece DENTRO de uma fala citada entre aspas, cercado de   │
 * │      direção em inglês fora delas → precisa PASSAR (não lançar).         │
 * │  (b) o MESMO termo aparece FORA de qualquer aspas → precisa CONTINUAR    │
 * │      REPROVANDO — senão a exceção de aspas virou uma porta para          │
 * │      qualquer texto em português escapar do linter.                     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. `lintarPromptDoBlocoWan` é síncrona, sem rede.
 */
import { lintarPromptDoBlocoWan } from "../services/video/falPipeline.js";
import type { Mutant } from "./mutants.js";

const FILE = "backend/src/services/video/falPipeline.ts";
const GUARD =
  'aspas retas protegem TODOS os 8 termos da heurística de português não traduzido, sem deixar de pegar português esquecido fora delas';

export const MUTANTS: Mutant[] = [
  {
    guard: GUARD,
    name: "reverte a exceção de aspas para todos os termos (volta a testar o prompt inteiro)",
    kind: "obvio",
    file: FILE,
    find: "if (TERMOS_PT_HEURISTICA.some((re) => re.test(promptSemFala))) {",
    replace: "if (TERMOS_PT_HEURISTICA.some((re) => re.test(prompt))) {",
    expect: "aspas: falso positivo voltou",
  },
  {
    guard: GUARD,
    name: "remoção de aspas fica gananciosa demais (apaga o prompt inteiro, não só as aspas)",
    kind: "esperto",
    // ESPERTO: não reverte a exceção, ALARGA a remoção — continua "removendo
    // texto entre aspas" na aparência, mas a regex passa a casar o prompt
    // inteiro (aspas ou não). O sintoma é o oposto do mutante óbvio: em vez
    // de o falso positivo voltar, é o falso negativo que volta para os 8
    // termos de uma vez, porque `promptSemFala` vira "" mesmo sem aspas.
    file: FILE,
    find: 'return texto.replace(/"[^"]*"/g, "");',
    replace: 'return texto.replace(/[\\s\\S]*/g, "");',
    expect: "aspas: falso negativo voltou",
  },
];

export interface WanPromptQuoteHeuristicCheckResult {
  failures: string[];
  notes: string[];
}

interface CasoDeTeste {
  termo: string;
  exemplo: string;
}

// Uma frase por termo, escolhida para casar SÓ aquele termo (evita
// depender de contaminação cruzada entre os 8 para provar cada um). Os 8
// termos agora têm as duas pontas provadas — "você"/"está" entraram nesta
// rodada, depois da correção do lookaround (RODADA 9).
const CASOS: CasoDeTeste[] = [
  { termo: "não", exemplo: "não vamos parar" },
  { termo: "você", exemplo: "você já venceu" },
  { termo: "está", exemplo: "tudo está pronto" },
  { termo: "com", exemplo: "converse com clareza" },
  { termo: "ela", exemplo: "ela chegou primeiro" },
  { termo: "ele", exemplo: "ele chegou depois" },
  { termo: "ção", exemplo: "essa é a ação certa" },
  { termo: "para", exemplo: "olhe para frente" },
];

export async function checkWanPromptQuoteHeuristicPolicy(): Promise<WanPromptQuoteHeuristicCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  for (const { termo, exemplo } of CASOS) {
    // (a) falso positivo eliminado: o termo aparece DENTRO de uma fala
    // citada entre aspas retas, com direção em inglês fora delas.
    const corpoComFalaCitada = {
      prompt: `Medium shot, speak with an inspiring tone while looking into the lens: "${exemplo}." Hold a steady gaze.`,
      negative_prompt: "cartoon, watermark",
    };
    try {
      lintarPromptDoBlocoWan(corpoComFalaCitada);
    } catch (erro) {
      failures.push(
        `aspas: falso positivo voltou para o termo "${termo}" — fala citada em português entre aspas reprova o linter de novo (${(erro as Error).message})`,
      );
    }

    // (b) falso negativo continua pego: o MESMO termo, FORA de qualquer
    // aspas — erro real de tradução esquecida.
    const corpoComPortuguesEsquecido = {
      prompt: `Medium shot, ${exemplo}, hold a steady gaze throughout.`,
      negative_prompt: "cartoon, watermark",
    };
    let reprovouComoEsperado = false;
    try {
      lintarPromptDoBlocoWan(corpoComPortuguesEsquecido);
    } catch (erro) {
      reprovouComoEsperado = (erro as Error).message.includes("português não traduzido");
    }
    if (!reprovouComoEsperado) {
      failures.push(`aspas: falso negativo voltou para o termo "${termo}" — deixou de ser pego fora de aspas`);
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    aspas: os 8 termos da heurística de português não traduzido passam quando citados entre aspas " +
        "retas e continuam reprovando fora delas — MEDIDO por execução real de lintarPromptDoBlocoWan, " +
        "16 corpos (8 termos × 2 pontas)",
    );
  }

  return { failures, notes };
}
