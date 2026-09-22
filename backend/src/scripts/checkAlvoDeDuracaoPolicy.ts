/**
 * V34, itens 3 e 4 — a duração-alvo escolhida no passo Roteiro vira um
 * PORTÃO de verdade, não decoração.
 *
 * ┌─ O que existia antes desta rodada ────────────────────────────────────────┐
 * │ `targetDurationSeconds` só servia para calcular um TETO de caracteres     │
 * │ (`exceedsTargetScriptLength`, checkScriptLimitPolicy.ts) — uma vez        │
 * │ aceito o roteiro, nada comparava a duração REAL da fala sintetizada       │
 * │ contra o alvo escolhido. Um roteiro dentro do teto de caracteres podia    │
 * │ ainda assim sintetizar bem mais curto ou mais longo que o alvo (a         │
 * │ variância de até 9,1% do ElevenLabs, já registrada neste projeto), e a    │
 * │ animação (a etapa mais cara) rodava sobre um número que não era o pedido. │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * `compararAlvoComFala` (falPipeline.ts) fecha esse buraco: compara alvo×fala
 * DEPOIS de narrar (`narrar()`, já sintetizado, já pago ao ElevenLabs) e ANTES
 * de qualquer submissão a `animar()` (nunca pago à fal). Um desvio acima de
 * `DESVIO_ALVO_MAXIMO_FRACAO` (8%) lança `AlvoDeDuracaoForaDoAlcanceError`,
 * que `classifyVendorFailure` mapeia para 422 (ver checkScriptValidationStatusPolicy.ts).
 *
 *  G-1  8,0% de desvio (a FRONTEIRA) passa — não lança.
 *  G-2  8,1% de desvio (um passo além) lança, dos dois lados (fala CURTA e
 *       fala LONGA demais).
 *  G-3  a mensagem cita o alvo, a fala medida e quantos caracteres ajustar,
 *       com o verbo certo por direção (Tire/Acrescente).
 *  G-4  sem alvo escolhido (`null`/`undefined`), a função não faz nada —
 *       nenhum vídeo sem alvo pode passar a recusar por causa deste bloco.
 *  G-5  PONTA A PONTA: o erro lançado por `compararAlvoComFala` classifica
 *       como "script_invalid" (nunca 502) pelo mesmo caminho real da rota.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — `compararAlvoComFala` é síncrona
 * e pura.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import {
  compararAlvoComFala,
  AlvoDeDuracaoForaDoAlcanceError,
  DESVIO_ALVO_MAXIMO_FRACAO,
  deveEngolirDesvioDeAlvo,
} from "../services/video/falPipeline.js";
import { classifyVendorFailure, vendorErrorStatus, toClientVendorError } from "../services/providers/vendorError.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "compararAlvoComFala recusa quando a fala diverge do alvo em mais de 8%",
    name: "a fronteira do desvio deixa de incluir o valor exato de 8%",
    kind: "esperto",
    // ESPERTO: troca `<=` por `<` — só o valor EXATO na fronteira muda de
    // lado (passa a recusar 8,0% de desvio, que devia ainda ser tolerado).
    // Qualquer desvio bem dentro ou bem fora da faixa continua igual, então
    // só um teste que mede a FRONTEIRA (G-1 abaixo) pega isto.
    file: PIPELINE,
    find: "  if (desvio <= DESVIO_ALVO_MAXIMO_FRACAO) return;",
    replace: "  if (desvio < DESVIO_ALVO_MAXIMO_FRACAO) return;",
    expect: "compararAlvoComFala: 8,0% de desvio (a fronteira) deveria PASSAR",
  },
  {
    guard: "a tomada única compara alvo×fala logo depois de narrar, antes de animar",
    name: "a chamada a compararAlvoComFala some do caminho de tomada única",
    kind: "obvio",
    file: PIPELINE,
    find:
      "  const { audioUrl, fala } = await narrar(input);\n" +
      "  // V34, item 3 — RECUSA antes de animar quando a fala diverge do alvo\n" +
      "  // escolhido em mais de 8%. Sem alvo (`targetDurationSeconds` ausente),\n" +
      "  // esta chamada não faz nada — comportamento de antes desta rodada.\n" +
      "  // P2-5, 22/09/2026 — \"Refazer\" (avisarDesvioDeAlvoSemRecusar) nunca\n" +
      "  // recusa por isto: a exceção é ENGOLIDA por `deveEngolirDesvioDeAlvo`,\n" +
      "  // nunca a comparação em si (que roda sempre, mesmo teto de 8%).\n" +
      "  try {\n" +
      "    compararAlvoComFala(input.targetDurationSeconds, fala);\n" +
      "  } catch (err) {\n" +
      "    if (!deveEngolirDesvioDeAlvo(err, input.avisarDesvioDeAlvoSemRecusar)) throw err;\n" +
      "  }",
    replace:
      "  const { audioUrl, fala } = await narrar(input);\n" +
      "  void AlvoDeDuracaoForaDoAlcanceError;\n" +
      "  void deveEngolirDesvioDeAlvo;",
    expect: "compararAlvoComFala: a tomada única deixou de comparar alvo×fala",
  },
  {
    guard: "o fracionado compara alvo×fala logo após a narração antecipada, antes do primeiro animar",
    name: "a chamada a compararAlvoComFala some do caminho fracionado",
    kind: "obvio",
    file: PIPELINE,
    find:
      "  // P2-5, 22/09/2026 — mesma engolição de exceção do caminho de tomada única.\n" +
      "  try {\n" +
      "    if (audioPreSintetizado) compararAlvoComFala(input.targetDurationSeconds, audioPreSintetizado.fala);\n" +
      "  } catch (err) {\n" +
      "    if (!deveEngolirDesvioDeAlvo(err, input.avisarDesvioDeAlvoSemRecusar)) throw err;\n" +
      "  }",
    replace: "  void audioPreSintetizado;\n  void deveEngolirDesvioDeAlvo;",
    expect: "compararAlvoComFala: o fracionado deixou de comparar alvo×fala",
  },
  {
    guard: "'Refazer' (avisarDesvioDeAlvoSemRecusar) NUNCA recusa por desvio de duração-alvo",
    name: "deveEngolirDesvioDeAlvo passa a engolir mesmo sem a flag pedir",
    kind: "esperto",
    // ESPERTO: troca `&&` por `||` — a função continua engolindo quando a
    // flag está ligada (G-7a continuaria verde), só que passa a engolir
    // TAMBÉM quando ela está ausente/false — exatamente o caso de `/approve`
    // (criação), que precisa CONTINUAR recusando.
    file: PIPELINE,
    find: "  return Boolean(avisarSemRecusar) && err instanceof AlvoDeDuracaoForaDoAlcanceError;",
    replace: "  return Boolean(avisarSemRecusar) || err instanceof AlvoDeDuracaoForaDoAlcanceError;",
    expect: "deveEngolirDesvioDeAlvo: engoliu com a flag AUSENTE",
  },
];

export interface AlvoDeDuracaoCheckResult {
  failures: string[];
  notes: string[];
}

function fala(durationSeconds: number): { audio: Buffer; durationSeconds: number; source: string | null } {
  return { audio: Buffer.alloc(0), durationSeconds, source: "tts_timestamps" };
}

export function checkAlvoDeDuracaoPolicy(): AlvoDeDuracaoCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1: a FRONTEIRA (8,0% exato) passa --------------------------------
  // alvo 100s, fala 108s => desvio = 8/100 = 0,08 = DESVIO_ALVO_MAXIMO_FRACAO
  // EXATAMENTE como double (verificado: `Math.abs(108-100)/100 === 0.08` bit
  // a bit — alvo=10/fala=10.8 NÃO serve aqui: `10.8-10` acumula erro de
  // ponto flutuante e vira 0,08000000000000007, marginalmente ACIMA da
  // constante, e faria este próprio teste mentir sobre a fronteira real).
  // `<=` inclui a fronteira — 8,0% ainda é tolerado.
  try {
    compararAlvoComFala(100, fala(108));
  } catch (err) {
    failures.push(
      "compararAlvoComFala: 8,0% de desvio (a fronteira) deveria PASSAR (alvo 100s, fala 108s) e lançou " +
        `${err instanceof Error ? err.constructor.name : String(err)} — a fronteira ficou mais apertada do ` +
        "que os 8% documentados.",
    );
  }

  // --- G-2: um passo além da fronteira (8,1%) recusa, nos dois sentidos ---
  // fala LONGA demais: alvo 100s, fala 108,1s => desvio = 0,081.
  try {
    compararAlvoComFala(100, fala(108.1));
    failures.push(
      "compararAlvoComFala: 8,1% de desvio (fala mais LONGA que o alvo) deveria RECUSAR (alvo 100s, fala " +
        "108,1s) e não lançou nada.",
    );
  } catch (err) {
    if (!(err instanceof AlvoDeDuracaoForaDoAlcanceError)) {
      failures.push(
        `compararAlvoComFala: o desvio de 8,1% lançou ${err instanceof Error ? err.constructor.name : String(err)}, ` +
          "esperado AlvoDeDuracaoForaDoAlcanceError.",
      );
    }
  }
  // fala CURTA demais: alvo 100s, fala 91,9s => desvio = 0,081.
  try {
    compararAlvoComFala(100, fala(91.9));
    failures.push(
      "compararAlvoComFala: 8,1% de desvio (fala mais CURTA que o alvo) deveria RECUSAR (alvo 100s, fala " +
        "91,9s) e não lançou nada.",
    );
  } catch (err) {
    if (!(err instanceof AlvoDeDuracaoForaDoAlcanceError)) {
      failures.push(
        `compararAlvoComFala: o desvio de 8,1% (fala curta) lançou ${err instanceof Error ? err.constructor.name : String(err)}, ` +
          "esperado AlvoDeDuracaoForaDoAlcanceError.",
      );
    }
  }

  // --- G-3: a mensagem cita os três números e o verbo certo por direção ---
  try {
    compararAlvoComFala(100, fala(108.1));
    failures.push("compararAlvoComFala: esperava lançar para medir a mensagem do G-3 e não lançou.");
  } catch (err) {
    if (err instanceof AlvoDeDuracaoForaDoAlcanceError) {
      const msg = err.message;
      if (!msg.includes("100") || !msg.includes("108.1") || !/tire/i.test(msg)) {
        failures.push(
          `compararAlvoComFala: a mensagem do desvio por EXCESSO não cita alvo/fala/"Tire" como esperado — ${JSON.stringify(msg)}.`,
        );
      }
      if (err.caracteresParaAjustar < 1) {
        failures.push(
          `compararAlvoComFala: caracteresParaAjustar deveria ser >= 1, veio ${err.caracteresParaAjustar}.`,
        );
      }
    }
  }
  try {
    compararAlvoComFala(100, fala(91.9));
  } catch (err) {
    if (err instanceof AlvoDeDuracaoForaDoAlcanceError && !/acrescente/i.test(err.message)) {
      failures.push(
        `compararAlvoComFala: a mensagem do desvio por FALTA não sugere "Acrescente" como esperado — ${JSON.stringify(err.message)}.`,
      );
    }
  }

  // --- G-4: sem alvo escolhido, não faz nada ------------------------------
  try {
    compararAlvoComFala(null, fala(999));
    compararAlvoComFala(undefined, fala(0.01));
  } catch (err) {
    failures.push(
      `compararAlvoComFala: sem alvo escolhido (null/undefined) não deveria lançar nada, e lançou ${err instanceof Error ? err.message : String(err)}.`,
    );
  }

  // --- G-5: PONTA A PONTA — o erro classifica como script_invalid/422 ----
  try {
    compararAlvoComFala(100, fala(108.1));
  } catch (err) {
    const failure = classifyVendorFailure(err);
    const status = vendorErrorStatus(failure);
    if (failure !== "script_invalid" || status !== 422) {
      failures.push(
        `compararAlvoComFala: AlvoDeDuracaoForaDoAlcanceError classificou como failure="${failure}"/status=${status}, ` +
          'esperado "script_invalid"/422 — o mesmo caminho real de erro que a rota usa devolveria o código errado.',
      );
    }
    const { message } = toClientVendorError("avatar", "checkAlvoDeDuracaoPolicy.G5", err);
    if (/tente novamente/i.test(message)) {
      failures.push(
        `compararAlvoComFala: a mensagem final ao cliente ainda sugere "tente novamente" — ${JSON.stringify(message)}.`,
      );
    }
  }

  // --- G-6: os DOIS call sites continuam chamando compararAlvoComFala -----
  // Execução (G-1..G-5) prova que a FUNÇÃO está correta; não prova que ela
  // ainda é CHAMADA nos dois lugares que a montam antes de `animar()` — só
  // leitura do texto exercita ausência de chamada.
  let fonte: string;
  try {
    fonte = readFileSync(path.join(process.env.REPO_ROOT ?? "/repo", PIPELINE), "utf8");
  } catch (err) {
    failures.push(`duração-alvo: não consegui ler ${PIPELINE} (${err instanceof Error ? err.message : err}).`);
    fonte = "";
  }
  if (fonte) {
    if (!fonte.includes("compararAlvoComFala(input.targetDurationSeconds, fala);")) {
      failures.push(
        "compararAlvoComFala: a tomada única deixou de comparar alvo×fala — a chamada exata " +
          `\`compararAlvoComFala(input.targetDurationSeconds, fala);\` não aparece mais em ${PIPELINE}.`,
      );
    }
    if (
      !fonte.includes(
        "if (audioPreSintetizado) compararAlvoComFala(input.targetDurationSeconds, audioPreSintetizado.fala);",
      )
    ) {
      failures.push(
        "compararAlvoComFala: o fracionado deixou de comparar alvo×fala — a chamada exata " +
          `\`if (audioPreSintetizado) compararAlvoComFala(...)\` não aparece mais em ${PIPELINE}.`,
      );
    }
  }

  // --- G-7: P2-5 — deveEngolirDesvioDeAlvo só engole quando PEDIDO, e só o
  // erro CERTO. Puro e síncrono: nenhuma narração/animação de verdade.
  const erroDeAlvo = new AlvoDeDuracaoForaDoAlcanceError(100, 108.1, 3);
  if (!deveEngolirDesvioDeAlvo(erroDeAlvo, true)) {
    failures.push(
      "deveEngolirDesvioDeAlvo: deveria engolir AlvoDeDuracaoForaDoAlcanceError quando avisarSemRecusar=true " +
        "— sem isto, 'Refazer' continuaria recusando por desvio de duração-alvo.",
    );
  }
  if (deveEngolirDesvioDeAlvo(erroDeAlvo, false)) {
    failures.push(
      "deveEngolirDesvioDeAlvo: engoliu mesmo com avisarSemRecusar=false — a criação/`/approve` passaria a " +
        "nunca mais recusar por desvio de duração-alvo.",
    );
  }
  if (deveEngolirDesvioDeAlvo(erroDeAlvo, undefined)) {
    failures.push(
      "deveEngolirDesvioDeAlvo: engoliu com a flag AUSENTE — `/approve` (criação) não passa a flag, e " +
        "precisa continuar recusando por desenho.",
    );
  }
  if (deveEngolirDesvioDeAlvo(new Error("outra falha qualquer"), true)) {
    failures.push(
      "deveEngolirDesvioDeAlvo: engoliu um erro de OUTRA classe — só AlvoDeDuracaoForaDoAlcanceError pode " +
        "ser engolido; qualquer outra falha (rede, fornecedor) tem de propagar normalmente.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      `    duração-alvo: compararAlvoComFala tolera exatamente ${(DESVIO_ALVO_MAXIMO_FRACAO * 100).toFixed(0)}% de ` +
        "desvio (fronteira passa, um passo além recusa nos dois sentidos), a mensagem nomeia alvo/fala/ajuste " +
        "com o verbo certo, sem alvo não faz nada, a recusa classifica como script_invalid/422 ponta a ponta, " +
        "os dois call sites (tomada única, fracionado) continuam chamando a comparação, e \"Refazer\" " +
        "(avisarDesvioDeAlvoSemRecusar) engole SÓ o próprio erro e SÓ quando pedido — nunca sem a flag",
    );
  }

  return { failures, notes };
}
