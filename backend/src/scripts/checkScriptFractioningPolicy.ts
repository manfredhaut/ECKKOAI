/**
 * O FRACIONAMENTO do roteiro em blocos de animação — tier Normal, BLOCO
 * FRACOES-1 (28/08/2026). Ver `docs-internal/plano-fracoes-2026-08-28.md`
 * e `scriptFractioning.ts`.
 *
 *  G-1  um roteiro que cabe num bloco só produz exatamente 1 bloco (caminho
 *       de sempre, sem regressão para o que já existia).
 *  G-2  um roteiro com várias frases que juntas passam do teto de um bloco
 *       produz MAIS de um bloco.
 *  G-3  uma frase ÚNICA maior que o teto de um bloco (142 caracteres) é
 *       RECUSADA, nunca cortada — mesmo cercada de frases curtas.
 *  G-4  um roteiro que exigiria mais de `NORMAL_MAX_BLOCOS` blocos (mais de
 *       `NORMAL_MAX_TARGET_SECONDS` = 120 s) é recusado ANTES de qualquer
 *       chamada, com o teto citado na mensagem.
 *
 * Tudo por EXECUÇÃO direta de `fracionarRoteiro()` — função pura, sem rede,
 * sem banco. Custo: ZERO.
 */
import {
  fracionarRoteiro,
  segundosTotaisDosBlocos,
  ScriptFractioningError,
  NORMAL_MAX_BLOCOS,
  NORMAL_MAX_TARGET_SECONDS,
} from "../services/video/scriptFractioning.js";
import type { Mutant } from "./mutants.js";

const FRASE_CURTA = "Frase curta.";
/**
 * 143 caracteres — acima do teto de um bloco Normal, HOJE 95 (10 s), desde a
 * migração para `reference-to-video/flash` (item 2, 29/08). Era 142 (15 s)
 * antes; o número (143) não mudou porque só precisa exceder o teto atual, e
 * 143 excede os dois.
 */
const FRASE_LONGA_DEMAIS = "x".repeat(143) + ".";

export const MUTANTS: Mutant[] = [
  {
    guard: "fracionarRoteiro recusa frase única maior que o teto de um bloco",
    name: "a recusa de frase única grande demais desaparece",
    kind: "esperto",
    // ESPERTO: o laço continua rodando, `escolherDuracao` continua sendo
    // chamado no fechamento de cada bloco — só a checagem POR FRASE
    // desaparece, e uma frase de 143+ caracteres passa a integrar um bloco
    // normalmente (o bloco fica maior que 15 s de fala real, e a sincronia
    // corta a frase no meio via `cut_off`, silenciosamente).
    file: "backend/src/services/video/scriptFractioning.ts",
    find:
      "    if (frase.length > tetoMaiorBloco) {\n" +
      "      throw new ScriptFractioningError(\n" +
      "        `fracionamento: uma frase de ${frase.length} caracteres excede o teto de ${tetoMaiorBloco} ` +\n" +
      '          `caracteres (${PIPELINE_DURACAO_MAXIMA} s, o maior bloco que o Wan aceita por chamada). ` +\n' +
      '          "Frase não é cortada no meio — encurte-a ou divida-a em duas frases.",\n' +
      "      );\n" +
      "    }\n",
    replace: "",
    // MEDIDO ao aplicar este mutante à mão (28/08): a frase longa NÃO passa a
    // integrar um bloco silenciosamente, como o comentário acima previa — ela
    // ainda é recusada, só que por um caminho DIFERENTE e pior: o acumulado
    // cresce além do que qualquer duração comporta, e `escolherDuracao`
    // devolve `null`, disparando "estado interno inválido — bloco acumulado
    // sem duração" (o `throw` de linha 137, defensivo). É esse texto — não
    // "uma frase de" — que aparece na falha real, dentro do ramo "mensagem
    // inesperada" do check abaixo.
    expect: "a recusa da frase longa saiu com mensagem inesperada",
  },
  {
    guard: "fracionarRoteiro recusa roteiro que exige mais de NORMAL_MAX_BLOCOS blocos",
    name: "o teto de blocos do tier Normal desaparece",
    kind: "esperto",
    // ESPERTO: cada bloco continua sendo fechado corretamente, com a
    // duração certa — só o TOTAL deixa de ser comparado contra o teto. Um
    // roteiro de 20 blocos (300 s) passaria a animar em vez de ser recusado
    // antes da primeira chamada paga.
    file: "backend/src/services/video/scriptFractioning.ts",
    find: "  if (blocos.length > NORMAL_MAX_BLOCOS) {",
    replace: "  if (false as boolean) {",
    // MEDIDO ao aplicar este mutante à mão (28/08): com o `if` desligado,
    // `fracionarRoteiro` nunca lança — quem detecta é o `!recusouTetoDeBlocos`
    // do check abaixo ("NÃO foi recusado"), não o texto que a produção
    // emitiria se o `throw` ainda existisse. "o roteiro exige" (sem "um")
    // era a frase da mensagem de PRODUÇÃO, que neste mutante nunca chega a
    // ser montada.
    expect: "NÃO foi recusado",
  },
];

export interface ScriptFractioningCheckResult {
  failures: string[];
  notes: string[];
}

export function checkScriptFractioningPolicy(): ScriptFractioningCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1 -------------------------------------------------------------
  const umBloco = fracionarRoteiro(FRASE_CURTA);
  if (umBloco.length !== 1) {
    failures.push(
      `fracionamento: um roteiro de uma frase curta ("${FRASE_CURTA}") produziu ${umBloco.length} ` +
        "blocos, esperado 1 — o caminho de sempre (script curto) não pode virar mais de um bloco.",
    );
  }

  // --- G-2 -------------------------------------------------------------
  // Repete uma frase curta o bastante para passar do teto de um bloco só
  // (142 caracteres), mas cada frase sozinha cabe tranquila.
  const roteiroLongo = Array(20).fill("Uma frase curta de teste.").join(" ");
  const variosBlocos = fracionarRoteiro(roteiroLongo);
  if (variosBlocos.length <= 1) {
    failures.push(
      `fracionamento: um roteiro de ${roteiroLongo.length} caracteres (bem acima do teto de um bloco) ` +
        `produziu só ${variosBlocos.length} bloco(s) — o empacotador não está fracionando roteiros longos.`,
    );
  }

  // --- G-3 -------------------------------------------------------------
  let recusouFraseLonga = false;
  let mensagemFraseLonga = "";
  try {
    fracionarRoteiro(`${FRASE_CURTA} ${FRASE_LONGA_DEMAIS} ${FRASE_CURTA}`);
  } catch (err) {
    if (err instanceof ScriptFractioningError) {
      recusouFraseLonga = true;
      mensagemFraseLonga = err.message;
    } else {
      throw err;
    }
  }
  if (!recusouFraseLonga) {
    failures.push(
      "fracionamento: uma frase de 144 caracteres (1 acima do teto de 143 usado nesta prova) cercada " +
        "de frases curtas NÃO foi recusada — o pipeline cortaria essa frase no meio em vez de recusar " +
        "o roteiro inteiro.",
    );
  } else if (!mensagemFraseLonga.includes("excede o teto")) {
    failures.push(
      `fracionamento: a recusa da frase longa saiu com mensagem inesperada: ${JSON.stringify(mensagemFraseLonga.slice(0, 160))}`,
    );
  }

  // --- G-4 -------------------------------------------------------------
  // Um "bloco" de texto que sozinho já ocupa o teto de UM bloco Normal —
  // HOJE 95 caracteres (10s), desde a migração para `reference-to-video/
  // flash` (item 2, 29/08; era 142/15s antes) — repetido NORMAL_MAX_BLOCOS + 1
  // vezes, para estourar o teto de blocos mesmo com folga de arredondamento.
  // PRECISA caber no teto de UMA frase (senão dispara G-3 em vez de G-4) e
  // ainda assim ocupar o bloco inteiro sozinho — 93 + "." = 94, 1 abaixo do
  // teto de 95.
  const blocoCheio = "y".repeat(93) + ".";
  const roteiroDemais = Array(NORMAL_MAX_BLOCOS + 1).fill(blocoCheio).join(" ");
  let recusouTetoDeBlocos = false;
  let mensagemTetoDeBlocos = "";
  try {
    fracionarRoteiro(roteiroDemais);
  } catch (err) {
    if (err instanceof ScriptFractioningError) {
      recusouTetoDeBlocos = true;
      mensagemTetoDeBlocos = err.message;
    } else {
      throw err;
    }
  }
  if (!recusouTetoDeBlocos) {
    failures.push(
      `fracionamento: um roteiro que exige mais de ${NORMAL_MAX_BLOCOS} blocos NÃO foi recusado — o ` +
        `teto de ${NORMAL_MAX_TARGET_SECONDS} s do tier Normal deixou de ser aplicado.`,
    );
  } else if (!mensagemTetoDeBlocos.includes(`${NORMAL_MAX_BLOCOS} blocos`)) {
    failures.push(
      `fracionamento: a recusa por excesso de blocos saiu sem citar o teto: ${JSON.stringify(mensagemTetoDeBlocos.slice(0, 200))}`,
    );
  }

  if (failures.length === 0) {
    notes.push(
      `    fracionamento: 1 frase → ${umBloco.length} bloco; roteiro longo (${roteiroLongo.length} car.) → ` +
        `${variosBlocos.length} blocos (${segundosTotaisDosBlocos(variosBlocos)} s); frase >142 car. e ` +
        `roteiro >${NORMAL_MAX_BLOCOS} blocos recusados antes de qualquer chamada`,
    );
  }

  return { failures, notes };
}
