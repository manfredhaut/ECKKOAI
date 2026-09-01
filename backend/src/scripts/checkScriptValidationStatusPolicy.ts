/**
 * BUG 2 (29/08/2026) — recusa de roteiro fora do teto do tier não pode sair
 * como 502.
 *
 * ┌─ O defeito, MEDIDO no INCIDENTE-502-1 ────────────────────────────────────┐
 * │ `conferirRoteiro`/`conferirRoteiroENormal` (falPipeline.ts) recusam o     │
 * │ roteiro ANTES de qualquer chamada à fal — validação NOSSA, nunca o        │
 * │ fornecedor. `classifyVendorFailure` não tinha regra para essa classe de   │
 * │ erro, caía no `"unknown"` do fim, e `vendorErrorStatus("unknown")` = 502  │
 * │ — indistinguível, para o navegador, de uma queda real de infraestrutura. │
 * │ Foi exatamente esse 502 que disparou toda a investigação de "sono da     │
 * │ máquina"/WSL2 que, no fim, não tinha nada a ver com rede nenhuma.         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  `classifyVendorFailure(new RoteiroInvalidoError(...))` devolve
 *       `"script_invalid"` — por CLASSE, não por regex sobre o texto.
 *  G-2  `vendorErrorStatus("script_invalid")` devolve 422, nunca 502.
 *  G-3  a mensagem ao cliente fala em "roteiro" e NÃO diz "tente novamente"
 *       — é uma coisa para a pessoa mudar, não para tentar de novo igual.
 *  G-4  PONTA A PONTA: `conferirRoteiroENormal()` com um roteiro que excede
 *       o teto de blocos do tier Normal, jogado através de
 *       `toClientVendorError()` (a MESMA função que a rota chama), produz
 *       `{failure: "script_invalid"}` e `vendorErrorStatus` = 422 — nunca
 *       502, mesmo passando pelo caminho real de tratamento de erro.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco.
 */
import type { Mutant } from "./mutants.js";
import { RoteiroInvalidoError, conferirRoteiroENormal } from "../services/video/falPipeline.js";
import { NORMAL_MAX_BLOCOS } from "../services/video/scriptFractioning.js";
import { classifyVendorFailure, vendorErrorStatus, toClientVendorError } from "../services/providers/vendorError.js";

const VENDOR_ERROR = "backend/src/services/providers/vendorError.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "classifyVendorFailure reconhece RoteiroInvalidoError por classe, antes do fallback genérico",
    name: "a checagem de RoteiroInvalidoError desaparece de classifyVendorFailure",
    kind: "obvio",
    // ÓBVIO: sem ela, a recusa de roteiro cai direto no fallback de regex,
    // não bate em nenhuma, e volta a ser "unknown" — o defeito original.
    //
    // ÂNCORA ATUALIZADA — V34, item 3 (01/09/2026): a mesma linha passou a
    // reconhecer `AlvoDeDuracaoForaDoAlcanceError` também
    // (`checkAlvoDeDuracaoPolicy`/`compararAlvoComFala`, falPipeline.ts) —
    // a mutação remove só a metade de `RoteiroInvalidoError`, preservando
    // a outra, para continuar testando ESTA classe especificamente.
    file: VENDOR_ERROR,
    find:
      '  if (err instanceof RoteiroInvalidoError || err instanceof AlvoDeDuracaoForaDoAlcanceError) return "script_invalid";',
    replace: '  if (err instanceof AlvoDeDuracaoForaDoAlcanceError) return "script_invalid";',
    expect: "classifyVendorFailure(new RoteiroInvalidoError",
  },
  {
    guard: "vendorErrorStatus mapeia script_invalid para 422, nunca 502",
    name: "script_invalid volta a cair no 502 genérico",
    kind: "esperto",
    // ESPERTO: `too_large` continua mapeando certo (o `||` só perde uma
    // das duas pontas) — só quem passou a ser tratado por este bug fica
    // sem tratamento, exatamente o retrocesso que este item existe para
    // impedir.
    file: VENDOR_ERROR,
    find: 'if (failure === "too_large" || failure === "script_invalid") return 422;',
    replace: 'if (failure === "too_large") return 422;',
    expect: "vendorErrorStatus(\"script_invalid\")",
  },
];

export interface ScriptValidationStatusCheckResult {
  failures: string[];
  notes: string[];
}

export function checkScriptValidationStatusPolicy(): ScriptValidationStatusCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1: classificação por CLASSE --------------------------------------
  const erroDeRoteiro = new RoteiroInvalidoError("roteiro fora do teto, prova da guarda");
  const classificado = classifyVendorFailure(erroDeRoteiro);
  if (classificado !== "script_invalid") {
    failures.push(
      `classifyVendorFailure(new RoteiroInvalidoError(...)) devolveu "${classificado}", esperado ` +
        '"script_invalid" — a recusa de roteiro deixou de ser reconhecida por CLASSE, e cai no fallback ' +
        "genérico que produz 502.",
    );
  }

  // --- G-2: status HTTP ----------------------------------------------------
  const status = vendorErrorStatus("script_invalid");
  if (status !== 422) {
    failures.push(
      `vendorErrorStatus("script_invalid") devolveu ${status}, esperado 422 — uma recusa de VALIDAÇÃO ` +
        "nossa (nunca fala com o fornecedor) não pode sair com o mesmo código de uma queda real de " +
        "infraestrutura.",
    );
  }

  // --- G-3: a mensagem fala do roteiro, não manda "tentar de novo" --------
  const { message } = toClientVendorError("avatar", "checkScriptValidationStatusPolicy.G3", erroDeRoteiro);
  if (!message.toLowerCase().includes("roteiro")) {
    failures.push(`checkScriptValidationStatusPolicy: a mensagem ao cliente não menciona "roteiro" — saiu ${JSON.stringify(message)}.`);
  }
  if (/tente novamente/i.test(message)) {
    failures.push(
      `checkScriptValidationStatusPolicy: a mensagem ainda diz "tente novamente" — ${JSON.stringify(message)}. ` +
        "Tentar de novo com o MESMO roteiro produz a MESMA recusa; a mensagem tem de pedir para mudar o " +
        "roteiro, não para repetir a tentativa.",
    );
  }

  // --- G-4: PONTA A PONTA — roteiro real, acima do teto de blocos --------
  // Um bloco que sozinho já ocupa o teto de 15s, repetido NORMAL_MAX_BLOCOS+1
  // vezes — mesma construção de checkScriptFractioningPolicy.ts G-4.
  const blocoCheio = "y".repeat(140) + ".";
  const roteiroDemais = Array(NORMAL_MAX_BLOCOS + 1).fill(blocoCheio).join(" ");
  let erroPontaAPonta: unknown = null;
  try {
    conferirRoteiroENormal(roteiroDemais);
  } catch (err) {
    erroPontaAPonta = err;
  }
  if (!(erroPontaAPonta instanceof RoteiroInvalidoError)) {
    failures.push(
      `checkScriptValidationStatusPolicy: um roteiro que exige mais de ${NORMAL_MAX_BLOCOS} blocos não ` +
        `lançou RoteiroInvalidoError — lançou ${erroPontaAPonta === null ? "nada (sucesso)" : (erroPontaAPonta as Error)?.constructor?.name}.`,
    );
  } else {
    const { failure } = toClientVendorError("avatar", "checkScriptValidationStatusPolicy.G4", erroPontaAPonta);
    const statusPontaAPonta = vendorErrorStatus(failure);
    if (failure !== "script_invalid" || statusPontaAPonta !== 422) {
      failures.push(
        `checkScriptValidationStatusPolicy: ponta a ponta, um roteiro real acima do teto de blocos ` +
          `produziu failure="${failure}" / status=${statusPontaAPonta}, esperado "script_invalid" / 422 — ` +
          "o caminho REAL de erro (o mesmo que a rota usa) ainda devolveria 502 para este caso.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    validação de roteiro: RoteiroInvalidoError é reconhecida por classe (não por regex), mapeia " +
        "para 422 (nunca 502), a mensagem ao cliente fala do roteiro sem sugerir \"tente novamente\", e um " +
        "roteiro real acima do teto de blocos do tier Normal confirma isso ponta a ponta, via " +
        "toClientVendorError() — a mesma função que a rota chama",
    );
  }

  return { failures, notes };
}
