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
 * ACHADO NESTA RODADA, NÃO CORRIGIDO — `/\bvocê\b/i` e `/\bestá\b/i` NUNCA
 * CASAM NADA, com ou sem aspas, mesmo antes desta correção: o `\b` do
 * JavaScript exige fronteira de PALAVRA (`\w` = ASCII só), e as duas regexes
 * terminam exatamente no caractere acentuado ("ê", "á"), que não é `\w` —
 * então a fronteira final nunca se satisfaz. Os outros 6 termos terminam em
 * letra ASCII e não têm este problema. Fora do escopo pedido (só a exceção
 * de aspas), registrado para o operador decidir — ver `CASOS` mais abaixo.
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
// depender de contaminação cruzada entre os 8 para provar cada um).
//
// ACHADO, RODADA 8b (30/08/2026) — "você" e "está" NÃO ENTRAM nesta lista,
// e o motivo é um defeito PRÉ-EXISTENTE e NÃO RELACIONADO a esta correção:
// `/\bvocê\b/i` e `/\bestá\b/i` NUNCA CASAM NADA, em qualquer string,
// independente de aspas. `\b` do JavaScript usa `\w` = `[A-Za-z0-9_]`, que
// NÃO inclui "ê" nem "á" — então a fronteira de palavra exigida IMEDIATAMENTE
// DEPOIS da última letra de "você"/"está" nunca se satisfaz (o caractere
// acentuado não é "palavra" nem o que vem depois é, então não há transição).
// MEDIDO diretamente: `/\bvocê\b/i.test("você")` e variantes com ".", ",",
// espaço e fim de string — todas `false`. Os outros 6 termos ("não", "com",
// "ela", "ele", "ção", "para") terminam em letra ASCII e não têm este
// problema — CONFIRMADO abaixo, os 6 casam normalmente fora de aspas.
// Corrigir os dois regexes é FORA DO ESCOPO desta rodada (só pediu a mesma
// técnica de aspas, não consertar a heurística em si) — registrado aqui,
// não corrigido, para o operador decidir.
const CASOS: CasoDeTeste[] = [
  { termo: "não", exemplo: "não vamos parar" },
  { termo: "com", exemplo: "converse com clareza" },
  { termo: "ela", exemplo: "ela chegou primeiro" },
  { termo: "ele", exemplo: "ele chegou depois" },
  { termo: "ção", exemplo: "essa é a ação certa" },
  { termo: "para", exemplo: "olhe para frente" },
];

// "você" e "está" continuam entrando no teste (a) — a exceção de aspas foi
// aplicada aos 8 por uniformidade de código — mas SEM a asserção (b), que
// seria impossível de satisfazer por um motivo que não tem nada a ver com
// aspas (ver comentário acima).
const TERMOS_ESTRUTURALMENTE_INERTES: CasoDeTeste[] = [
  { termo: "você", exemplo: "você já venceu" },
  { termo: "está", exemplo: "tudo está pronto" },
];

export async function checkWanPromptQuoteHeuristicPolicy(): Promise<WanPromptQuoteHeuristicCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  for (const { termo, exemplo } of [...CASOS, ...TERMOS_ESTRUTURALMENTE_INERTES]) {
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
  }

  for (const { termo, exemplo } of CASOS) {
    // (b) falso negativo continua pego: o MESMO termo, FORA de qualquer
    // aspas — erro real de tradução esquecida. Só para os 6 termos cujo
    // regex realmente funciona (ver TERMOS_ESTRUTURALMENTE_INERTES acima).
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
      "    aspas: os 8 termos da heurística passam quando citados entre aspas retas; os 6 cujo regex funciona " +
        "(não, com, ela, ele, ção, para) continuam reprovando fora delas — MEDIDO por execução real de " +
        "lintarPromptDoBlocoWan. \"você\" e \"está\" nunca casaram nada, com ou sem aspas — defeito PRÉ-EXISTENTE " +
        "e não relacionado a esta correção, registrado e não corrigido nesta rodada (ver comentário no código).",
    );
  }

  return { failures, notes };
}
