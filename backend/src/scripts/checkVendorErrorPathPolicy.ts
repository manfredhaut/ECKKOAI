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
    guard: "erro de vendor: a recusa não volta como 201",
    name: "a rota de geração volta a responder 201 numa recusa",
    kind: "esperto",
    // MEDIDO na Fase 2 do bloco 5D, e o defeito é exatamente este: uma geração
    // que o fornecedor RECUSOU voltava como `HTTP 201 Created` com
    // `status: "error"` no corpo. `vendorErrorStatus` já estava importado no
    // arquivo e nunca era chamado — `videos.ts` era a única das seis rotas que
    // tratam erro de fornecedor sem ele.
    //
    // O mutante é esperto porque a linha do vídeo continua sendo devolvida, com
    // `status: "error"` e a mensagem sanitizada dentro: tudo que uma guarda de
    // "a falha é registrada?" verificaria continua verdade. Só o código HTTP
    // mente — e `api/client.ts` só levanta erro quando `!res.ok`.
    file: "backend/src/routes/videos.ts",
    find: "      return reply.code(vendorErrorStatus(failure)).send(errored[0]);",
    replace: "      return reply.code(201).send(errored[0]);",
    expect: "responde 201 quando o fornecedor recusa",
  },
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
    throw new AvatarProviderError(\`\${providerLabel} API error (\${res.status}): \${rawBody}\`, res.status);
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
    guard: "erro de vendor: a defesa é em profundidade",
    name: "a máscara do publicador some — o sumidouro tem de segurar sozinho",
    kind: "esperto",
    file: "backend/src/services/providers/vendorError.ts",
    // CONTRAPONTO, e não reprovação. Ele mudou de sentido no bloco 4A, e o
    // arnês foi quem mostrou isso: quando este mutante foi escrito, remover o
    // scrub daqui vazava a chave, e a guarda reprovava. Depois que `logEvent`
    // virou o sumidouro único — com redação por FORMA em qualquer
    // profundidade —, o mesmo defeito deixou de vazar, porque a camada de
    // baixo segura.
    //
    // Isso não é a guarda ficando inerte: é a proposição dela deixando de ser
    // falsificável POR AQUI, porque a defesa passou a ter duas camadas. Manter
    // o mutante como `expectGreen` documenta a redundância e a PROVA a cada
    // execução — se um dia o sumidouro for enfraquecido, este contraponto
    // quebra junto com o mutante da redação, e os dois apontam para o mesmo
    // lugar. A camada de cima continua no código de propósito: ela custa uma
    // chamada de função e cobre o caso de alguém publicar por um caminho novo
    // antes de a guarda de log ser executada.
    find: "      detail: scrubSecretsFromText(err instanceof Error ? err.message : String(err)),",
    replace: "      detail: err instanceof Error ? err.message : String(err),",
    expectGreen: true,
    expect: "segredo mascarado nos dois eventos",
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

  // A recusa não pode voltar como sucesso HTTP.
  //
  // Textual, e ancorado no USO de `vendorErrorStatus` dentro do ramo de falha —
  // não na importação, que estava lá o tempo todo e não impediu nada (é
  // literalmente como este defeito passou despercebido). Ver checklist nº 10
  // do CLAUDE.md.
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  let rota = "";
  try {
    rota = await readFile(path.join(repoRoot, "backend/src/routes/videos.ts"), "utf-8");
  } catch {
    failures.push("erro de vendor: não consegui ler routes/videos.ts — verificador cego é pior que reprovar.");
  }
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  if (rota && !/reply\.code\(vendorErrorStatus\(failure\)\)\.send\(errored\[0\]\)/.test(semComentarios)) {
    failures.push(
      "erro de vendor: routes/videos.ts responde 201 quando o fornecedor recusa a geração, em vez de um " +
        "status de erro derivado de `vendorErrorStatus`. A linha do vídeo até volta com status 'error' " +
        "dentro, mas `api/client.ts` só levanta erro quando `!res.ok` — com 201, a recusa é lida como " +
        "sucesso por qualquer consumidor que confie no código HTTP, que é para isso que ele existe.",
    );
  }

  notes.push(
    "erro de vendor: 400 exercitado no caminho real — corpo no log, segredo mascarado nos dois eventos, " +
      "nada do fornecedor na mensagem ao cliente",
  );
  notes.push("erro de vendor: a recusa de geração responde status de erro derivado do fornecedor, nunca 201");
  return { failures, notes };
}
