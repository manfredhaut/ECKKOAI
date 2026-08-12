/**
 * Invariantes de SAÍDA DE REDE do backend.
 *
 * ┌─ O defeito que esta guarda existe para impedir ─────────────────────────┐
 * │ `checkProviderPolicy` já verificava que os caminhos de vendor desviam   │
 * │ para fixture — mas a partir de `VENDOR_MODULES`, uma lista de DOIS      │
 * │ arquivos escrita à mão. O backend tem dez com saída de rede.            │
 * │                                                                         │
 * │ Resultado, medido no bloco 5D: `complete()` em providerRegistry.ts —    │
 * │ ponto único de saída para Anthropic, Gemini e OpenAI, e portanto para o │
 * │ botão "Gerar com IA" do passo 2, o copiloto do tenant e o do admin —    │
 * │ NUNCA consultou `isFixtureMode()`. Toda afirmação de "zero chamadas     │
 * │ tarifadas" dos blocos 3.5, 4A e 5D valeu porque ninguém clicou ali.     │
 * │                                                                         │
 * │ É o mesmo defeito de FORMA do 4A item 5, um nível acima: lá a deny-list │
 * │ nomeava os endpoints que conhecia; aqui a lista nomeava os ARQUIVOS que │
 * │ conhecia. Nos dois casos ela envelhece em silêncio, porque uma lista    │
 * │ incompleta tem exatamente a mesma aparência de uma completa.            │
 * │                                                                         │
 * │ Por isso esta guarda DESCOBRE: varre backend/src inteiro procurando     │
 * │ qualquer cliente HTTP, e exige que cada arquivo achado ou respeite o    │
 * │ modo, ou esteja declarado abaixo COM MOTIVO. Um cliente novo entra no   │
 * │ radar por existir, não por alguém lembrar de cadastrá-lo.               │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Mutant } from "./mutants.js";
import { VENDOR_ENDPOINTS, billableEndpointPaths } from "../services/providers/endpointCatalog.js";

export interface EgressCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "egress: todo cliente HTTP respeita o modo",
    name: "cliente HTTP novo entra sem checagem de modo",
    kind: "obvio",
    // Um módulo de vendor novo, com fetch e sem isFixtureMode. É literalmente
    // o estado em que providerRegistry.ts viveu até o bloco 5D-1.
    file: "backend/src/services/providers/vendorCatalog.ts",
    find: "export type ScriptVendor",
    replace:
      "export async function chamaFornecedorNovo(k: string) {\n" +
      "  return fetch('https://api.exemplo-novo.com/v1/gerar', { headers: { k } });\n" +
      "}\n\nexport type ScriptVendor",
    expect: "não consulta isFixtureMode()",
  },
  {
    guard: "egress: todo cliente HTTP respeita o modo",
    name: "a checagem continua no arquivo, mas fora do caminho de saída",
    kind: "esperto",
    // O MAIS IMPORTANTE dos três. `isFixtureMode` continua importado e
    // continua sendo mencionado — só deixa de DESVIAR. Uma guarda que
    // procurasse a menção da função passaria verde; a superfície inspecionada
    // não muda, e a chamada tarifada volta a sair em fixture.
    file: "backend/src/services/providers/providerRegistry.ts",
    find: "  if (isFixtureMode()) {",
    replace: "  if (isFixtureMode() && false) {",
    // O `expect` é o NÚCLEO da frase que a guarda emite, e não uma paráfrase
    // do que o mutante faz. Escrever "não desvia para fixture" — descrição do
    // defeito — fez uma guarda saudável aparecer como AMBÍGUA. Quarta vez
    // neste projeto que um `expect` mal recortado acusa guarda boa.
    expect: "não consulta isFixtureMode()",
  },
  {
    guard: "egress: todo fornecedor alcançado está no catálogo",
    name: "host de fornecedor que o catálogo não conhece",
    kind: "esperto",
    // O catálogo continua completo para tudo que já existia; só o fornecedor
    // NOVO fica de fora — que é exatamente como o buraco dos provedores de
    // texto se formou, e como ele voltaria a se formar.
    file: "backend/src/services/providers/providerRegistry.ts",
    find: 'const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";',
    replace:
      'const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";\n' +
      'const FORNECEDOR_NOVO = "https://api.cohere.ai/v1/chat";',
    expect: "não está no catálogo de endpoints",
  },
  {
    guard: "egress: o freio deriva do catálogo",
    name: "o freio volta a ser uma lista escrita à mão",
    kind: "obvio",
    file: "backend/src/services/providers/endpointCatalog.ts",
    find: "  return VENDOR_ENDPOINTS.filter((e) => e.billable).map((e) => e.path);",
    replace: '  return ["/v3/videos", "/v3/avatars"];',
    expect: "o freio deixou de derivar do catálogo",
  },
];

/**
 * Como se reconhece uma saída de rede. Deliberadamente amplo: um falso
 * positivo custa uma linha de allowlist, e um falso NEGATIVO é um fornecedor
 * sendo chamado sem nenhuma trava — que é o defeito que este arquivo fecha.
 */
const PADROES_DE_SAIDA: [RegExp, string][] = [
  [/\bfetch\s*\(/, "fetch"],
  [/\baxios\b/, "axios"],
  [/from ['"]node:https?['"]/, "node:http(s)"],
  [/\bhttps?\.request\s*\(/, "http.request"],
  [/from ['"]got['"]/, "got"],
  [/from ['"]undici['"]/, "undici"],
  [/from ['"]node-fetch['"]/, "node-fetch"],
  [/new Stripe\(/, "stripe SDK"],
  [/from ['"]@anthropic-ai\//, "anthropic SDK"],
  [/from ['"]openai['"]/, "openai SDK"],
  [/from ['"]@google\//, "google SDK"],
  [/from ['"]@aws-sdk\//, "aws SDK"],
];

/**
 * Arquivos que fazem rede e NÃO passam pelo modo, cada um com o motivo.
 *
 * A allowlist é fechada e o motivo é obrigatório — sem ele, ela viraria o
 * mesmo "ignore esses arquivos" que produziu o buraco. Acrescentar uma linha
 * aqui tem de ser um ato consciente, com a justificativa ao lado.
 */
const EXCECOES: { file: string; motivo: string }[] = [
  {
    file: "services/providers/platformKeyProbe.ts",
    motivo:
      "DELIBERADO (bloco CHAVES-2): a validação de chave da plataforma chama o fornecedor mesmo em " +
      "fixture, porque um saldo simulado levaria à decisão oposta à que os dados sustentam. Tem freio " +
      "próprio e mais estrito — só alcança a allowlist de endpoints de leitura.",
  },
  {
    file: "services/downloadProxy.ts",
    motivo:
      "Baixa um artefato JÁ produzido e pago; não dispara trabalho no fornecedor e não é tarifado. " +
      "Em fixture a URL aponta para o próprio servidor, então não há saída externa a barrar.",
  },
  {
    file: "services/billing/stripeClient.ts",
    motivo:
      "Stripe não é fornecedor de IA e tem mecanismo de teste PRÓPRIO (chaves de teste). Submetê-lo ao " +
      "PROVIDER_MODE criaria um segundo interruptor para a mesma coisa, e o de baixo — a chave — é o " +
      "que decide se o dinheiro é real.",
  },
];

/** Guardas e utilitários de linha de comando não servem tráfego de produto. */
function ehFerramenta(rel: string): boolean {
  return rel.startsWith("scripts/");
}

function listarTs(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) listarTs(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Sem comentários: três guardas deste projeto já acusaram o texto que as explicava. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

export async function checkNetworkEgressPolicy(repoRoot: string): Promise<EgressCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  const raiz = join(repoRoot, "backend/src");

  let arquivos: string[];
  try {
    arquivos = listarTs(raiz);
  } catch {
    failures.push("egress: não consegui varrer backend/src — verificador cego é pior que reprovar.");
    return { failures, notes };
  }

  const excecoes = new Map(EXCECOES.map((e) => [e.file, e.motivo]));
  const comSaida: string[] = [];
  const respeitam: string[] = [];
  const hostsAlcancados = new Set<string>();

  for (const abs of arquivos) {
    const rel = relative(raiz, abs).split("\\").join("/");
    const código = semComentarios(readFileSync(abs, "utf-8"));

    // `scripts/` sai ANTES de qualquer inspeção, inclusive a de hosts. Na
    // primeira execução isto estava depois, e a guarda acusou `api.cohere.ai`
    // — um host que existe apenas dentro do `replace` do MUTANTE declarado
    // neste mesmo arquivo. É a quarta vez que uma guarda deste projeto
    // tropeça no texto escrito para descrevê-la, e a primeira em que o texto
    // era a própria prova de que ela funciona.
    if (ehFerramenta(rel)) continue;

    for (const host of código.match(/https:\/\/[a-zA-Z0-9.-]+/g) ?? []) {
      // `exemplo` é placeholder de documentação, não fornecedor.
      if (!/exemplo/.test(host)) hostsAlcancados.add(host);
    }

    const saidas = PADROES_DE_SAIDA.filter(([re]) => re.test(código)).map(([, nome]) => nome);
    if (saidas.length === 0) continue;

    comSaida.push(rel);

    // Exige o PADRÃO de desvio, não a menção: `isFixtureMode() && false`
    // menciona a função e não desvia de nada.
    const desvia = /if\s*\(\s*isFixtureMode\(\)\s*\)/.test(código);
    if (desvia) {
      respeitam.push(rel);
      continue;
    }
    const motivo = excecoes.get(rel);
    if (motivo) continue;

    failures.push(
      `egress: ${rel} tem saída de rede (${saidas.join(", ")}) e não consulta isFixtureMode() nem ` +
        "está declarado como exceção. Em PROVIDER_MODE=fixture esse caminho ALCANÇA o fornecedor de " +
        "verdade, e toda afirmação de 'zero chamadas tarifadas' passa a depender de ninguém exercitá-lo. " +
        "Ou o caminho desvia para fixture, ou entra em EXCECOES com o motivo escrito.",
    );
  }

  // Universo-zero reprova: uma varredura que não acha nada tem a mesma
  // aparência de um backend sem rede nenhuma. Já aconteceu neste projeto
  // (GUARDAS-1, a asserção de planos que conferiu zero citações).
  if (comSaida.length === 0) {
    failures.push(
      "egress: NENHUM arquivo com saída de rede foi encontrado em backend/src. O backend fala com " +
        "quatro fornecedores — a varredura deixou de casar com o código.",
    );
  }

  // --- fornecedor alcançado tem de estar no catálogo ---------------------
  const HOST_DO_VENDOR: Record<string, string> = {
    "https://api.heygen.com": "heygen",
    "https://api.d-id.com": "did",
    "https://api.elevenlabs.io": "elevenlabs",
    "https://api.anthropic.com": "anthropic",
    "https://api.openai.com": "openai",
    "https://generativelanguage.googleapis.com": "gemini",
    // fal.ai fala por DOIS hosts: `rest` guarda arquivo, `queue` faz trabalho.
    // O terceiro host que a fal tem — o síncrono `https://fal.run` — está fora
    // desta tabela DE PROPÓSITO: ele não deve ser alcançado por caminho nenhum
    // deste projeto, e mantê-lo desconhecido faz esta guarda ser a segunda rede
    // atrás de `checkFalClientPolicy`, que mede a URL realmente usada.
    "https://rest.fal.ai": "fal",
    "https://queue.fal.run": "fal",
  };
  const vendorsNoCatalogo = new Set(VENDOR_ENDPOINTS.map((e) => e.vendor));
  for (const host of [...hostsAlcancados].sort()) {
    const vendor = HOST_DO_VENDOR[host];
    if (!vendor) {
      failures.push(
        `egress: o código alcança ${host}, que não está no catálogo de endpoints. ` +
          "Um fornecedor fora do catálogo é invisível para o freio do probe e para a conta de custo — " +
          "foi assim que Anthropic, Gemini e OpenAI ficaram de fora até o bloco 5D-1.",
      );
      continue;
    }
    if (!vendorsNoCatalogo.has(vendor as never)) {
      failures.push(`egress: o fornecedor "${vendor}" (${host}) não tem nenhum endpoint no catálogo.`);
    }
  }

  // --- o freio DERIVA do catálogo ----------------------------------------
  const tarifaveis = VENDOR_ENDPOINTS.filter((e) => e.billable).map((e) => e.path);
  const freio = billableEndpointPaths();
  const faltando = tarifaveis.filter((p) => !freio.includes(p));
  if (faltando.length > 0) {
    failures.push(
      `egress: o freio deixou de derivar do catálogo — ${faltando.length} endpoint(s) tarifável(is) ` +
        `fora dele (${faltando.join(", ")}). Uma lista escrita à mão volta a envelhecer em silêncio a ` +
        "cada fornecedor ou versão nova, que é o defeito que o catálogo existe para fechar.",
    );
  }

  notes.push(
    `egress: ${comSaida.length} arquivo(s) de produto com saída de rede — ${respeitam.length} respeitam o modo, ` +
      `${EXCECOES.length} são exceção declarada com motivo`,
  );
  notes.push(
    `egress: ${hostsAlcancados.size} fornecedor(es) alcançado(s) pelo código, todos no catálogo ` +
      `(${VENDOR_ENDPOINTS.length} endpoints, ${tarifaveis.length} tarifáveis e todos no freio)`,
  );
  return { failures, notes };
}
