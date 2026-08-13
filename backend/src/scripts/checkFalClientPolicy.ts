/**
 * Invariantes do CLIENTE DA FAL: fila, ponteiro salvo primeiro, catálogo fechado.
 *
 * ┌─ Ancorada no USO, e é isso que a torna diferente de uma busca de texto ──┐
 * │ Ela não procura `queue.fal.run` no arquivo. Ela troca `globalThis.fetch` │
 * │ por um gravador, CHAMA `falSubmit`/`falPoll`/`falResult` de verdade e    │
 * │ olha a URL que realmente saiu, e em que ordem as coisas aconteceram.     │
 * │                                                                          │
 * │ A diferença é a lição do Gap 1b e do LIVE-2: uma guarda textual continua │
 * │ verde quando a constante certa fica no arquivo e o caminho passa a usar  │
 * │ outra — e continua verde quando a gravação do ponteiro é MOVIDA sem ser  │
 * │ removida. As duas coisas são exatamente o que se quer pegar aqui.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * As três propriedades:
 *
 *  · **FILA** — nenhuma chamada paga sai por `fal.run` síncrono. Sem fila não
 *    há `request_id`, e sem `request_id` um processo morto no meio perde o
 *    trabalho JÁ PAGO sem deixar ponteiro. É o mesmo defeito que já deixou
 *    vídeo em `queued` para sempre neste projeto, agora com dinheiro da fal.
 *  · **ORDEM** — o `request_id` é gravado ANTES de qualquer processamento
 *    local. Medido pela ordem, nunca pela presença: gravar depois também
 *    "grava", e é o estado em que uma falha na conferência do contrato leva o
 *    ponteiro junto.
 *  · **CATÁLOGO** — endpoint fora do catálogo não alcança a rede. O catálogo é
 *    a fonte do freio; o que não está nele é invisível para a conta de custo.
 *
 * E uma quarta, sobre a ORIGEM DA CHAVE: ela vem do tenant (`api_credentials`),
 * nunca de `platform_credentials`. Está MEDIDO que a chave de plataforma não
 * tem consumidor neste caminho, e supor o contrário custou um dia em 09/08.
 *
 * ┌─ Custo: ZERO ───────────────────────────────────────────────────────────┐
 * │ Nenhuma rede: o `fetch` está substituído nas três chamadas. Nenhuma      │
 * │ credencial real — a chave passada é uma string literal, e o caminho que  │
 * │ leria a do tenant (`resolveFalApiKey`) é conferido por LEITURA, sem      │
 * │ tocar o banco. Nenhum arquivo escrito, nada a limpar.                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Mutant } from "./mutants.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "fal: chamada paga só por fila",
    name: "a submissão volta a sair pelo fal.run síncrono",
    kind: "obvio",
    // Uma constante, um host. É a troca que alguém faz "para simplificar" — o
    // síncrono devolve o resultado direto e parece menos código. O que ele tira
    // é o ponteiro para o trabalho pago.
    file: "backend/src/services/providers/falClient.ts",
    find: 'const FAL_QUEUE_BASE = "https://queue.fal.run";',
    replace: 'const FAL_QUEUE_BASE = "https://fal.run";',
    expect: "fal: uma chamada paga saiu por fal.run síncrono",
  },
  {
    guard: "fal: o request_id é gravado antes de qualquer processamento local",
    name: "a gravação do request_id desce para depois da conferência do contrato",
    kind: "esperto",
    // ESPERTO: a gravação continua lá, com o mesmo valor, e o caminho feliz
    // termina idêntico — qualquer guarda que perguntasse "o request_id é
    // persistido?" continuaria verde. Só a ORDEM muda, e com ela o que sobra
    // quando a conferência reprova: o trabalho foi aceito, já custa, e o único
    // ponteiro para ele morre com a exceção.
    file: "backend/src/services/providers/falClient.ts",
    find: "  await onRequestId(String(requestId));",
    replace:
      "  const statusUrlCedo = String(data?.status_url ?? \"\");\n" +
      "  if (!statusUrlCedo.startsWith(`${FAL_QUEUE_BASE}/`)) {\n" +
      "    throw new FalProviderError(\n" +
      "      `fal.queue.submit: status_url ${JSON.stringify(statusUrlCedo)} não é da fila.`,\n" +
      "    );\n" +
      "  }\n" +
      "  await onRequestId(String(requestId));",
    expect: "fal: o request_id não foi gravado ANTES",
  },
  {
    guard: "fal: endpoint fora do catálogo não alcança a rede",
    name: "a checagem de catálogo sai da submissão",
    kind: "obvio",
    // O `find` carrega o contexto porque a chamada aparece três vezes no
    // arquivo (submit, poll, result) e o arnês exige ocorrência única. É a
    // submissão que interessa: é ela que cria trabalho tarifado.
    file: "backend/src/services/providers/falClient.ts",
    find:
      "  assertFalEndpointNoCatalogo(endpointId);\n" +
      "\n" +
      "  if (isFixtureMode()) {\n" +
      "    const requestId",
    replace: "  void endpointId;\n" + "\n" + "  if (isFixtureMode()) {\n" + "    const requestId",
    expect: "fal: um endpoint fora do catálogo foi alcançado",
  },
  {
    guard: "fal: a chave vem do tenant",
    name: "a chave passa a vir do ambiente do processo em vez de api_credentials",
    kind: "esperto",
    // ESPERTO porque continua havendo uma função chamada `resolveFalApiKey`,
    // ela continua devolvendo uma chave, e o produto continua funcionando na
    // máquina de quem testou — com a chave da PLATAFORMA, igual para todo
    // tenant. É o defeito de 09/08 outra vez: uma credencial global num
    // caminho que o produto vende como BYOK.
    file: "backend/src/services/providers/falClient.ts",
    find: '  const cred = await getCredential(tenantId, "avatar");',
    replace:
      "  void tenantId;\n" +
      '  const cred = { apiKey: process.env.FAL_API_KEY ?? "", vendor: "fal" } as\n' +
      "    | { apiKey: string; vendor: string }\n" +
      "    | null;",
    expect: "fal: a chave deixou de vir do tenant",
  },
  {
    guard: "fal: endpoint fora do catálogo não alcança a rede",
    name: "um endpoint NOVO entra no catálogo da fal",
    kind: "esperto",
    // CONTRAPONTO. O catálogo é a fonte e crescer é o uso normal dele: um
    // modelo novo entra ali antes de ser chamado. Uma guarda amarrada ao
    // NÚMERO de entradas — ou aos três nomes de hoje — reprovaria isto, e
    // passaria a cobrar autorização para o ato que ela existe para exigir.
    file: "backend/src/services/providers/endpointCatalog.ts",
    find: "  // ------------------------------------------------------- TEXTO (bloco 5D-1)",
    replace:
      "  {\n" +
      '    vendor: "fal",\n' +
      '    path: "/fal-ai/modelo-do-contraponto",\n' +
      '    method: "POST",\n' +
      "    billable: true,\n" +
      '    note: "entrada de contraponto do arnês: o catálogo cresce sem que a guarda da fal reprove.",\n' +
      "  },\n" +
      "  // ------------------------------------------------------- TEXTO (bloco 5D-1)",
    expect: "fal: a submissão só sai por queue.fal.run",
    expectGreen: true,
  },
];

export interface FalClientCheckResult {
  failures: string[];
  notes: string[];
}

/** Endpoint que ESTÁ no catálogo. Trocá-lo por outro do catálogo não muda nada. */
const ENDPOINT_DO_CATALOGO = "fal-ai/sync-lipsync/v2";

/** Endpoint que NÃO está no catálogo, e não pode alcançar a rede. */
const ENDPOINT_FORA_DO_CATALOGO = "fal-ai/modelo-que-ninguem-catalogou";

const REQUEST_ID_DA_PROVA = "req-da-prova-0001";

/** O que aconteceu, na ordem em que aconteceu. */
type Passo = "POST_submit" | "gravou_request_id" | "GET_status" | "GET_result";

interface Corrida {
  passos: Passo[];
  urls: string[];
  erro: unknown;
  gravado: string | null;
}

/**
 * Roda o caminho real com `fetch` substituído.
 *
 * `statusUrlDevolvido` é o que a fila diz na resposta da submissão. O caso em
 * que ele NÃO é da fila é o que separa "gravou antes" de "gravou depois": a
 * conferência reprova, e a pergunta passa a ser se o ponteiro já estava salvo
 * quando isso aconteceu.
 */
async function correr(endpointId: string, statusUrlDevolvido: string | null): Promise<Corrida> {
  const { falSubmit, falPoll, falResult } = await import("../services/providers/falClient.js");
  const passos: Passo[] = [];
  const urls: string[] = [];
  let gravado: string | null = null;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown) => {
    const url = String(
      typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada,
    );
    urls.push(url);

    if (url.includes("/requests/") && url.endsWith("/status")) {
      passos.push("GET_status");
      return new Response(JSON.stringify({ status: "COMPLETED", request_id: REQUEST_ID_DA_PROVA }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/requests/")) {
      passos.push("GET_result");
      return new Response(JSON.stringify({ video: { url: "https://exemplo.fal.invalido/saida.mp4" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // A ÚNICA que cria trabalho tarifado. Chegar aqui por um host que não é o
    // da fila, ou com um endpoint fora do catálogo, é a reprovação.
    passos.push("POST_submit");
    return new Response(
      JSON.stringify({
        request_id: REQUEST_ID_DA_PROVA,
        response_url: `https://queue.fal.run/${endpointId}/requests/req`,
        ...(statusUrlDevolvido === null ? {} : { status_url: statusUrlDevolvido }),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  let erro: unknown = null;
  try {
    const submetido = await falSubmit(
      "chave-irrelevante-fetch-substituido",
      endpointId,
      { prompt: "entrada da prova" },
      (requestId) => {
        passos.push("gravou_request_id");
        gravado = requestId;
      },
    );
    await falPoll("chave-irrelevante-fetch-substituido", submetido.statusUrl);
    await falResult("chave-irrelevante-fetch-substituido", submetido.responseUrl);
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  return { passos, urls, erro, gravado };
}

export async function checkFalClientPolicy(repoRoot: string): Promise<FalClientCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const { FalProviderError } = await import("../services/providers/falClient.js");
  const modoOriginal = process.env.PROVIDER_MODE;

  let feliz: Corrida;
  let contratoQuebrado: Corrida;
  let foraDoCatalogo: Corrida;
  try {
    // `live` porque em fixture o caminho inteiro é desviado e nada disto
    // acontece — e é o de live que gasta. Nenhuma rede sai: `fetch` substituído.
    process.env.PROVIDER_MODE = "live";
    feliz = await correr(ENDPOINT_DO_CATALOGO, `https://queue.fal.run/${ENDPOINT_DO_CATALOGO}/requests/${REQUEST_ID_DA_PROVA}/status`);
    contratoQuebrado = await correr(ENDPOINT_DO_CATALOGO, "https://exemplo.outro-host.invalido/status");
    foraDoCatalogo = await correr(ENDPOINT_FORA_DO_CATALOGO, null);
  } finally {
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  // -------------------------------------------------------------------------
  // 1. FILA. Nenhuma URL alcançada pode ser o host síncrono, e a submissão do
  //    caminho feliz tem de sair pela fila.
  // -------------------------------------------------------------------------
  const sincronas = [...feliz.urls, ...contratoQuebrado.urls].filter((u) =>
    u.startsWith("https://fal.run/"),
  );
  if (sincronas.length > 0) {
    failures.push(
      `fal: uma chamada paga saiu por fal.run síncrono — ${sincronas.length} URL(s), a primeira ` +
        `${JSON.stringify(sincronas[0])}. O síncrono não devolve request_id, e sem ele um processo ` +
        "morto no meio da resposta perde um trabalho que JÁ foi aceito e JÁ custa, sem deixar ponteiro " +
        "para recuperá-lo. É o mesmo estado 'queued para sempre, sem estorno' que já custou vídeo aqui. " +
        "Submissão, status e resultado saem todos por queue.fal.run.",
    );
  }
  if (!feliz.urls.some((u) => u.startsWith("https://queue.fal.run/"))) {
    failures.push(
      "fal: uma chamada paga saiu por fal.run síncrono — ou por lugar nenhum: NENHUMA URL alcançada no " +
        `caminho feliz começa com https://queue.fal.run/. URLs observadas: ${JSON.stringify(feliz.urls)}. ` +
        "Universo-zero reprova: uma varredura que não observa chamada nenhuma tem a mesma aparência de " +
        "um cliente correto.",
    );
  }
  if (!feliz.passos.includes("POST_submit")) {
    failures.push(
      `fal: o caminho feliz não chegou a submeter — passos ${JSON.stringify(feliz.passos)}, erro ` +
        `${feliz.erro === null ? "nenhum" : JSON.stringify(String(feliz.erro).slice(0, 160))}. ` +
        "Um cliente que recusa o caso normal não protege dinheiro: apaga o produto.",
    );
  }

  // -------------------------------------------------------------------------
  // 2. ORDEM. O request_id é gravado ANTES de qualquer processamento local.
  //
  //    Conferido nos DOIS casos, e o segundo é o que importa: ali a conferência
  //    do contrato reprova, e a pergunta é se o ponteiro sobreviveu à exceção.
  // -------------------------------------------------------------------------
  for (const [rotulo, corrida] of [
    ["caminho feliz", feliz],
    ["contrato quebrado", contratoQuebrado],
  ] as const) {
    const iGravou = corrida.passos.indexOf("gravou_request_id");
    const iPost = corrida.passos.indexOf("POST_submit");
    if (iPost === -1) continue;
    if (iGravou === -1) {
      failures.push(
        `fal: o request_id não foi gravado ANTES de o processamento local seguir (${rotulo}): a ` +
          `gravação não aconteceu. Passos: ${corrida.passos.join(" → ") || "(nenhum)"}. O trabalho já ` +
          "foi aceito pela fila quando isto acontece — sem o ponteiro salvo, o que já custa fica sem " +
          "nome, e nem o estorno nem a recuperação manual têm por onde começar.",
      );
    } else if (iGravou > iPost + 1) {
      failures.push(
        `fal: o request_id não foi gravado ANTES de o processamento local seguir (${rotulo}): a ordem ` +
          `foi ${corrida.passos.join(" → ")}. Gravar tarde é o defeito, não gravar nunca — qualquer ` +
          "coisa entre a submissão e a gravação pode falhar levando o ponteiro junto.",
      );
    }
  }
  if (contratoQuebrado.gravado !== REQUEST_ID_DA_PROVA) {
    failures.push(
      `fal: o request_id não foi gravado ANTES da conferência do contrato — gravado ` +
        `${JSON.stringify(contratoQuebrado.gravado)} em vez de ${JSON.stringify(REQUEST_ID_DA_PROVA)}. ` +
        "É justamente quando a resposta vem estranha que o ponteiro importa: o trabalho foi aceito e a " +
        "única coisa que sabemos dele é esse id.",
    );
  }
  if (contratoQuebrado.erro === null) {
    failures.push(
      "fal: a fila devolveu status_url de outro host e o cliente seguiu como se nada fosse. Um " +
        "status_url fora da fila significa contrato diferente do que este cliente pediu, e engolir " +
        "isso transforma um desvio de contrato em resultado silenciosamente errado.",
    );
  }

  // -------------------------------------------------------------------------
  // 3. CATÁLOGO. Endpoint fora dele não alcança a rede — e a recusa é NOSSA.
  // -------------------------------------------------------------------------
  if (foraDoCatalogo.urls.length > 0) {
    failures.push(
      `fal: um endpoint fora do catálogo foi alcançado — ${foraDoCatalogo.urls.length} requisição(ões), ` +
        `a primeira ${JSON.stringify(foraDoCatalogo.urls[0])}. O catálogo é a fonte do freio: o que não ` +
        "está nele é invisível para a conta de custo e para o freio do probe de validação, que foi como " +
        "/v3/videos e /v3/avatars ficaram desprotegidos. A recusa acontece ANTES do fetch — recusar " +
        "depois de a requisição sair não recusa nada.",
    );
  }
  if (!(foraDoCatalogo.erro instanceof FalProviderError)) {
    failures.push(
      "fal: um endpoint fora do catálogo foi alcançado, ou recusado por erro que não é nosso — veio " +
        `${foraDoCatalogo.erro === null ? "sucesso" : JSON.stringify(String(foraDoCatalogo.erro).slice(0, 160))}. ` +
        "A recusa precisa ser FalProviderError: empacotada como falha de fornecedor, ela manda quem lê " +
        "procurar defeito numa fal.ai que sequer soube da tentativa.",
    );
  }

  // -------------------------------------------------------------------------
  // 4. A CHAVE VEM DO TENANT.
  //
  //    Por leitura, e não por execução: ler a chave de verdade exigiria banco e
  //    uma credencial. O recorte é ancorado na PRÓPRIA função — nunca num
  //    wrapper —, com rede anti-vazamento: a lição do Gap 1b é que uma âncora
  //    de layout faz o recorte engolir o bloco seguinte e acusar o vizinho.
  // -------------------------------------------------------------------------
  const relFal = "backend/src/services/providers/falClient.ts";
  let fonte: string;
  try {
    fonte = readFileSync(join(repoRoot, relFal), "utf-8");
  } catch {
    failures.push(`fal: não consegui ler ${relFal} — verificador cego é pior que reprovar.`);
    return { failures, notes };
  }

  const inicio = fonte.indexOf("export async function resolveFalApiKey(");
  if (inicio === -1) {
    failures.push(
      "fal: a chave deixou de vir do tenant — `resolveFalApiKey` não existe mais em " +
        `${relFal}. É a única função do arquivo que sabe de onde a chave vem.`,
    );
  } else {
    const fim = fonte.indexOf("\n}", inicio);
    const corpo = fonte.slice(inicio, fim === -1 ? fonte.length : fim);

    // Anti-vazamento: se o recorte passou do fim da função, ele está medindo
    // outra coisa e a acusação sairia com o nome errado.
    for (const vizinho of ["assertFalEndpointNoCatalogo", "falUpload", "falSubmit"]) {
      if (corpo.includes(vizinho)) {
        failures.push(
          `fal: o recorte de resolveFalApiKey vazou e alcançou "${vizinho}". A medição seguinte falaria ` +
            "de outra função — âncora de guarda tem de ser intrínseca ao que se mede.",
        );
      }
    }

    if (!corpo.includes('getCredential(tenantId, "avatar")')) {
      failures.push(
        "fal: a chave deixou de vir do tenant — `resolveFalApiKey` não chama mais " +
          '`getCredential(tenantId, "avatar")`. A chave da fal é POR TENANT (api_credentials, par ' +
          "avatar+fal). Está MEDIDO que a chave de plataforma não tem consumidor neste caminho, e " +
          "supor o contrário custou um dia em 09/08 — uma chave global num produto vendido como BYOK " +
          "cobra o dono da plataforma pelo uso de todo mundo, e some do painel do tenant.",
      );
    }
    if (!corpo.includes('cred.vendor !== "fal"')) {
      failures.push(
        "fal: a chave deixou de vir do tenant certo — `resolveFalApiKey` não confere mais o vendor. " +
          "Sem essa conferência, um tenant com HeyGen conectada manda a chave da HeyGen para a fal.ai: " +
          "é o vazamento gêmeo do que o BLOCO 2 fechou no botão Testar.",
      );
    }
  }

  for (const proibido of ["platformCredentials", "platformKeys", "getPlatformKey"]) {
    if (fonte.includes(proibido)) {
      failures.push(
        `fal: a chave deixou de vir do tenant — ${relFal} menciona "${proibido}". A credencial de ` +
          "plataforma não é consumidor deste caminho, e tê-la ao alcance da mão é como ela volta.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "  fal: a submissão só sai por queue.fal.run — status e resultado também, e o host síncrono não " +
        "é alcançado em nenhum dos casos exercitados",
    );
    notes.push(
      `  fal: o request_id é gravado antes de qualquer processamento local, inclusive quando a ` +
        `conferência do contrato reprova (ordem observada: ${contratoQuebrado.passos.join(" → ")})`,
    );
    notes.push(
      "  fal: endpoint fora do catálogo não emite requisição nenhuma, e a recusa é FalProviderError",
    );
    notes.push("  fal: a chave vem de api_credentials (tenant), com o vendor conferido");
  }

  return { failures, notes };
}
