/**
 * Invariante do caminho de ERRO do fornecedor.
 *
 * O caminho feliz é o que se testa sem pensar; o de erro é o que roda no pior
 * momento e o que ninguém exercita. Três coisas precisam valer ao mesmo tempo
 * quando o fornecedor recusa, e elas puxam em direções opostas — por isso a
 * verificação é uma só:
 *
 *  1. O corpo do erro TEM de chegar ao log: é a única coisa que diz por que a
 *     recusa aconteceu, e sem ele sobra "não foi possível concluir", que não
 *     permite decidir nada.
 *  2. O corpo NÃO pode chegar ao cliente: o LOG-1 registra que a resposta de
 *     erro de um vendor carrega nome de modelo, tier da conta e valor de cota.
 *  3. Nada de segredo pode chegar ao log EM CLARO — em NENHUM dos eventos.
 *
 * O 3 é o que este arquivo nasceu para congelar, e nasceu de uma medição, não
 * de zelo: `fetchJson` monta a exceção como "<Vendor> API error (400): <corpo
 * bruto>", de modo que o corpo inteiro viaja dentro de `err.message`. O
 * `vendor_response` mascarava esse corpo, e o `vendor_error` — emitido logo
 * depois, por outro módulo — o publicava de volta legível. Um segredo
 * mascarado num evento e legível no seguinte não está mascarado.
 *
 * A verificação exercita o CAMINHO REAL (`pollVideoJob` → `fetchJson` → log)
 * com `fetch` substituído e `console` capturado. Nenhuma chamada de rede,
 * nenhuma escrita no banco, nenhuma unidade do teto consumida.
 */
import type { Mutant } from "./mutants.js";
import { isFixtureMode } from "../services/providers/providerMode.js";
import { toClientVendorError } from "../services/providers/vendorError.js";

/**
 * Literal que faz o papel de segredo ecoado pelo fornecedor. NÃO é uma chave:
 * é um valor de teste, e existe para que a máscara tenha o que mascarar.
 */
const SENTINELA = "sentinela-de-teste-nao-e-chave-9f3b";

/** Corpo de um 400 na forma que um fornecedor devolve. */
const CORPO_DE_ERRO = JSON.stringify({
  error: { code: "invalid_request", message: "avatar_id not found or not ready" },
  // Fornecedores ecoam parte da requisição no erro. É assim que uma chave
  // chega ao log sem ninguém ter pedido.
  api_key: SENTINELA,
});

export const MUTANTS: Mutant[] = [
  {
    guard: "erro de vendor: 400 interrompe o caminho",
    name: "resposta de erro deixa de ser tratada como erro",
    kind: "obvio",
    file: "backend/src/services/providers/avatarProvider.ts",
    // Sem o `throw`, um 400 segue adiante e o parser tenta ler um corpo de
    // erro como se fosse sucesso: o job fica em "processing" até o teto de
    // polling e termina como "demorou mais que o esperado". Erro engolido é
    // pior que falha visível — a tela mente que está processando.
    find: `  if (!res.ok) {
    throw new AvatarProviderError(\`\${providerLabel} API error (\${res.status}): \${rawBody}\`);
  }`,
    replace: "",
    expect: "NÃO interrompeu o caminho de geração",
  },
  {
    guard: "erro de vendor: corpo vai ao log",
    name: "o evento continua saindo, sem o corpo dentro",
    kind: "esperto",
    file: "backend/src/services/providers/vendorResponseLog.ts",
    // O evento `vendor_response` continua sendo emitido, com contexto, status,
    // cabeçalhos e tamanho — tudo que uma guarda de "esta função registra a
    // resposta?" verificaria. Só o CONTEÚDO some, e com ele a única coisa que
    // diz POR QUE o fornecedor recusou. É a diferença entre registrar que
    // houve uma resposta e registrar a resposta.
    find: `        // Corpo INTEIRO, sem corte. Ver o cabeçalho deste arquivo.
        body,`,
    replace: `        body: typeof body,`,
    expect: "não chegou ao log",
  },
  {
    guard: "erro de vendor: corpo vai ao log, mascarado",
    name: "o detalhe volta ao log sem passar pela máscara",
    kind: "esperto",
    file: "backend/src/services/providers/vendorError.ts",
    // O corpo continua indo ao log, o evento continua existindo, o campo
    // continua se chamando `detail`, e o `vendor_response` continua mascarando
    // o MESMO corpo alguns milissegundos antes. Só esta cópia volta a ser
    // legível. Uma guarda que checasse "o corpo aparece no log?" passaria — e
    // era exatamente este o estado do código antes desta verificação existir.
    find: "      detail: scrubSecretsFromText(err instanceof Error ? err.message : String(err)),",
    replace: "      detail: err instanceof Error ? err.message : String(err),",
    expect: "em CLARO no evento",
  },
];

export interface VendorErrorPathResult {
  failures: string[];
  notes: string[];
}

export async function checkVendorErrorPathPolicy(): Promise<VendorErrorPathResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const { pollVideoJob } = await import("../services/providers/avatarProvider.js");

  const modoOriginal = process.env.PROVIDER_MODE;
  const fetchOriginal = globalThis.fetch;
  const logOriginal = console.log;
  const errOriginal = console.error;
  const capturado: string[] = [];

  process.env.PROVIDER_MODE = "live";
  let lancou = false;
  let mensagemAoCliente = "";

  try {
    globalThis.fetch = (async () =>
      new Response(CORPO_DE_ERRO, {
        status: 400,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    console.log = (...args) => capturado.push(args.map(String).join(" "));
    console.error = (...args) => capturado.push(args.map(String).join(" "));

    try {
      await pollVideoJob("heygen", "chave-irrelevante-fetch-substituido", "job-teste");
    } catch (err) {
      lancou = true;
      // Mesmo tratamento que a rota aplica: é o caminho real do cliente.
      mensagemAoCliente = toClientVendorError("avatar", "check.vendorErrorPath", err).message;
    }
  } finally {
    console.log = logOriginal;
    console.error = errOriginal;
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  const log = capturado.join("\n");

  // 1. O erro não pode ser engolido: um 400 tratado como sucesso deixaria o
  //    job pendurado até o teto de polling, e o cliente veria "processando"
  //    para sempre.
  if (!lancou) {
    failures.push(
      "erro de vendor: um 400 do fornecedor NÃO interrompeu o caminho de geração. " +
        "Erro engolido vira job pendurado, que é pior que falha visível: a tela mente que está processando.",
    );
  }

  // 2. O corpo TEM de estar no log — e especificamente no evento
  //    `vendor_response`, que é o registro bruto de ANTES de qualquer
  //    interpretação.
  //
  //    O recorte por evento não é preciosismo: sem ele, esta asserção passava
  //    mesmo com o corpo removido do `vendor_response`, porque o `vendor_error`
  //    repete o mesmo texto (a exceção embute o corpo). O arnês pegou isso — a
  //    guarda afirmava "o corpo chega ao log" e o que verificava era "o corpo
  //    aparece em algum lugar". São coisas diferentes: o `vendor_error` passa
  //    por scrub e é emitido depois da interpretação, então depender dele
  //    esvaziaria justamente a garantia que o LOG-1 existe para dar.
  const linhaResposta = capturado.find((l) => l.includes('"event":"vendor_response"')) ?? "";
  if (!linhaResposta.includes("invalid_request") || !linhaResposta.includes("avatar_id not found")) {
    failures.push(
      "erro de vendor: o corpo do 400 não chegou ao log no evento `vendor_response`" +
        (linhaResposta ? "" : " (o evento nem foi emitido)") +
        ". Sem ele sobra a frase genérica mostrada ao cliente, que não permite distinguir chave " +
        "inválida de avatar inexistente de cota estourada. Registrar que HOUVE uma resposta não é " +
        "o mesmo que registrar a resposta.",
    );
  }

  // 3. E o segredo NÃO pode estar em claro, em evento nenhum.
  if (log.includes(SENTINELA)) {
    const eventos = [...log.matchAll(/"event":"([a-z_]+)"/g)]
      .map((m) => m[1])
      .filter((ev, i, arr) => arr.indexOf(ev) === i);
    failures.push(
      `erro de vendor: o valor de \`api_key\` do corpo apareceu em CLARO no evento de log. ` +
        `Eventos emitidos: ${eventos.join(", ")}. O corpo bruto viaja dentro de err.message ` +
        "(fetchJson o embute), então mascarar só no vendor_response não basta — o mesmo texto sai " +
        "de novo pelo vendor_error. Um segredo mascarado num evento e legível no seguinte não está mascarado.",
    );
  }

  // 4. O corpo do fornecedor não pode vazar para o cliente.
  if (mensagemAoCliente.includes("invalid_request") || mensagemAoCliente.includes(SENTINELA)) {
    failures.push(
      `erro de vendor: a mensagem devolvida ao cliente carrega o corpo do fornecedor ("${mensagemAoCliente}"). ` +
        "O detalhe é do log, nunca da tela.",
    );
  }

  if (!isFixtureMode()) {
    failures.push("erro de vendor: PROVIDER_MODE não voltou para fixture depois da verificação.");
  }

  notes.push(
    "erro de vendor: 400 exercitado no caminho real — corpo no log, segredo mascarado nos dois eventos, " +
      "nada do fornecedor na mensagem ao cliente",
  );
  return { failures, notes };
}
