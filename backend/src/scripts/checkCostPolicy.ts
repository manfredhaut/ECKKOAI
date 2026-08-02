/**
 * Invariantes de CUSTO, de LOG e do CATÁLOGO DE ENDPOINTS.
 *
 * As três andam juntas porque protegem a mesma coisa por ângulos diferentes: o
 * que o produto AFIRMA sobre dinheiro, o que ele DEIXA ESCAPAR ao afirmar, e o
 * que ele PODE GASTAR sem querer.
 *
 *  1. Custo tem um número só, e ele é medido. Um segundo número em qualquer
 *     lugar volta a produzir o desvio de 4,5× que passou semanas na tela.
 *  2. Ausência de custo é ausência, nunca zero. "Custou nada" e "não sabemos"
 *     são afirmações diferentes.
 *  3. Nenhum evento sai sem passar pelo sumidouro do log. Foi um publicador
 *     fora do caminho que imprimiu a chave em claro.
 *  4. O freio de endpoints tarifáveis DERIVA do catálogo, e o catálogo cobre
 *     todo endpoint que o código alcança.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { HEYGEN_VIDEO_COST, costFor, estimateVideoCost } from "../services/billing/providerCost.js";
import { redactDeep, redactText } from "../services/log/safeLog.js";
import { VENDOR_ENDPOINTS, billableEndpointPaths } from "../services/providers/endpointCatalog.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "custo: um número só, e ele é medido",
    name: "número de custo reaparece fora da constante",
    kind: "obvio",
    file: "backend/src/routes/videos.ts",
    find: "    const vendor = video.provider_vendor ?? \"heygen\";",
    replace: "    const vendor = video.provider_vendor ?? \"heygen\";\n    const usdPerSecond = 0.045;\n    void usdPerSecond;",
    // Sem o valor no meio: a mensagem diz "o número de custo 0.045 fora de
    // providerCost.ts", e prender o `expect` ao número faria o mutante virar
    // AMBÍGUO no dia em que a medição fosse refeita — guarda saudável parecendo
    // quebrada. Terceira vez que um `expect` mal recortado acusa guarda boa.
    expect: "fora de providerCost.ts",
  },
  {
    guard: "custo: ausência nunca vira zero",
    name: "consumo sem medição passa a valer zero",
    kind: "esperto",
    file: "backend/src/services/billing/providerCost.ts",
    // A função continua existindo, continua devolvendo um objeto, e continua
    // com o campo `known`. Só o ramo sem medição passa a responder "custou
    // US$ 0,00" — que é uma frase verdadeira em aritmética e falsa em fato.
    // Uma guarda que só checasse "a função devolve algo" passaria.
    find: '  return { known: false, reason: "never_measured", explanation: NEVER_MEASURED };',
    replace: "  return { known: true, usd: 0, vendorUnits: 0 };",
    expect: "devolveu custo ZERO para um consumo sem medição",
  },
  {
    guard: "log: nada sai sem passar pelo sumidouro",
    name: "publicador novo imprime err.message cru",
    kind: "obvio",
    file: "backend/src/services/providers/vendorError.ts",
    find: "  const failure = classifyVendorFailure(err);",
    replace:
      "  const failure = classifyVendorFailure(err);\n" +
      "  console.error(JSON.stringify({ event: \"vendor_error_extra\", detail: err instanceof Error ? err.message : String(err) }));",
    expect: "publica log por fora do sumidouro",
  },
  {
    guard: "log: a redação do sumidouro está ligada",
    name: "a redação por forma é desligada",
    kind: "esperto",
    file: "backend/src/services/log/safeLog.ts",
    // `redactText` continua existindo, continua sendo chamada por todo mundo,
    // continua devolvendo string. Só deixa de redigir. Nenhuma assinatura
    // muda, nenhum publicador é tocado, e a guarda que apenas contasse
    // chamadas a `logEvent` passaria — é exatamente a forma do defeito que o
    // arnês existe para pegar.
    find: "  let out = text.replace(SECRET_ASSIGNMENT, `$1${REDACTED}`);",
    replace: "  let out = text;",
    expect: "não redigiu",
  },
  {
    guard: "freio: endpoint tarifável novo entra no freio sozinho",
    name: "endpoint tarifável acrescentado sem tocar no freio",
    kind: "esperto",
    file: "backend/src/services/providers/platformKeyProbe.ts",
    // O catálogo já conhece `/v1/voices/add` (clonagem, tarifada). Apontar o
    // probe para lá é o defeito real: um "teste de credencial" que gasta um
    // slot de voz. Se o freio ainda fosse a lista escrita à mão, este caminho
    // passaria — ela nunca teve endpoint de ElevenLabs.
    find: '  elevenlabs: "https://api.elevenlabs.io/v1/voices",',
    replace: '  elevenlabs: "https://api.elevenlabs.io/v1/voices/add",',
    expect: "contém o caminho",
  },
];

export interface CostCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkCostPolicy(repoRoot: string): Promise<CostCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  checkAbsenceIsNeverZero(failures, notes);
  await checkNoCostNumbersOutsideConstant(repoRoot, failures, notes);
  await checkNoLogOutsideSink(repoRoot, failures, notes);
  checkRedactionIsOn(failures, notes);
  checkFreioDerivesFromCatalog(failures, notes);

  return { failures, notes };
}

// --------------------------------------------------------------------- 1 ---

/**
 * Consumo sem medição devolve AUSÊNCIA, e nunca zero.
 *
 * Exercita a função real, e não uma cópia: é a única forma de a asserção
 * continuar valendo depois de alguém reorganizar os ramos.
 */
function checkAbsenceIsNeverZero(failures: string[], notes: string[]): void {
  const semMedicao = [
    { provider: "voice", vendor: "elevenlabs", unitType: "characters", unitCount: 1200 },
    { provider: "script", vendor: "gemini", unitType: "tokens_in", unitCount: 5000 },
    { provider: "avatar", vendor: "did", unitType: "seconds", unitCount: 30 },
    // Vendor medido, unidade que nunca foi medida.
    { provider: "avatar", vendor: "heygen", unitType: "characters", unitCount: 100 },
  ];

  for (const caso of semMedicao) {
    const c = costFor(caso);
    if (c.known) {
      failures.push(
        `custo: ${caso.provider}/${caso.vendor}/${caso.unitType} devolveu custo ZERO para um consumo ` +
          `sem medição (US$ ${c.usd}). "Custou nada" e "não sabemos" não são a mesma afirmação — e é ` +
          "a segunda que é verdade aqui. Zero numa tela de custo é lido como gratuito.",
      );
    } else if (!c.explanation || c.explanation.length < 30) {
      failures.push(
        `custo: ${caso.provider}/${caso.vendor} devolve ausência sem explicação utilizável. A ausência ` +
          "precisa ser legível na tela, senão vira um traço mudo que também é lido como zero.",
      );
    }
  }

  // Contraponto: o caminho medido TEM de devolver número. Uma guarda que
  // exigisse ausência sempre passaria em tudo acima sem distinguir nada.
  const medido = costFor({ provider: "avatar", vendor: "heygen", unitType: "seconds", unitCount: 10 });
  if (!medido.known || medido.usd <= 0) {
    failures.push(
      "custo: o caminho MEDIDO (avatar/heygen/seconds) deixou de devolver custo. A medição real é a " +
        "única coisa que o produto tem sobre dinheiro; sem ela não sobra estimativa nenhuma.",
    );
  }

  // E a estimativa tem de bater com a conta declarada.
  const est = estimateVideoCost(20, "heygen");
  const esperado = Number((20 * HEYGEN_VIDEO_COST.usdPerSecond).toFixed(4));
  if (!est.known || Math.abs(est.usd - esperado) > 1e-6) {
    failures.push(
      `custo: a estimativa de 20 s devolveu ${est.known ? est.usd : "ausência"}, esperado ${esperado} ` +
        "— a estimativa deixou de derivar da constante medida.",
    );
  }

  notes.push(
    `custo: ${semMedicao.length} consumo(s) sem medição devolvem AUSÊNCIA (nunca zero); ` +
      `medição base US$ ${HEYGEN_VIDEO_COST.usdPerSecond}/s em ` +
      `${HEYGEN_VIDEO_COST.measuredUnder.aspectRatio}/${HEYGEN_VIDEO_COST.measuredUnder.resolution}`,
  );
}

// --------------------------------------------------------------------- 2 ---

/** Só este arquivo pode conter os números da medição. */
const COST_CONSTANT_FILE = "backend/src/services/billing/providerCost.ts";

/**
 * Nenhum número de custo fora da constante.
 *
 * Procura os VALORES da medição em qualquer outro arquivo — é assim que um
 * segundo número nasce: alguém copia `0.045` para "não precisar importar". A
 * partir daí os dois divergem, e o produto passa a ter duas verdades sobre
 * dinheiro.
 */
async function checkNoCostNumbersOutsideConstant(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  const valores = [String(HEYGEN_VIDEO_COST.usdPerSecond), String(HEYGEN_VIDEO_COST.unitsPerDollar)];
  const arquivos = await listSourceFiles(path.join(repoRoot, "backend", "src"));
  let inspecionados = 0;

  for (const full of arquivos) {
    const rel = path.relative(repoRoot, full).replace(/\\/g, "/");
    if (rel === COST_CONSTANT_FILE) continue;
    // Os scripts de verificação IMPORTAM a constante e a citam em mensagem —
    // é uso legítimo, e acusá-lo abandonaria a guarda.
    if (rel.startsWith("backend/src/scripts/")) continue;

    const source = stripComments(await readFile(full, "utf8"));
    inspecionados += 1;

    for (const v of valores) {
      // `0.045` isolado, não como parte de outro número. `60` sozinho é comum
      // demais para casar (timeouts, segundos), então só o valor por segundo
      // é procurado como literal solto; o de unidades por dólar entra pelo
      // nome do campo.
      if (v.includes(".") && new RegExp(`(?<![\\d.])${v.replace(".", "\\.")}(?![\\d])`).test(source)) {
        failures.push(
          `custo: ${rel} contém o número de custo ${v} fora de providerCost.ts. Uma segunda cópia da ` +
            "medição diverge da primeira em silêncio, e o produto passa a ter duas verdades sobre dinheiro. " +
            "Importe de billing/providerCost.ts.",
        );
      }
    }
    if (/\bcost_per_unit_cents\b|\bestimated_cost_cents\b/.test(source)) {
      failures.push(
        `custo: ${rel} volta a ler a coluna de custo antiga. Ela guardava taxa palpite × duração PEDIDA ` +
          "— errado nos dois fatores, 4,5× de desvio medido — e foi removida do banco na migration 039.",
      );
    }
  }

  if (inspecionados === 0) {
    failures.push("custo: nenhum arquivo foi inspecionado — a guarda deixou de olhar qualquer coisa.");
  }
  notes.push(`custo: ${inspecionados} arquivo(s) sem número de custo próprio e sem a coluna antiga`);
}

// --------------------------------------------------------------------- 3 ---

/**
 * Só o sumidouro publica.
 *
 * A allowlist tem um arquivo e uma razão: `vendorResponseLog.ts` tem dois
 * `console.error` de ÚLTIMO RECURSO — o que fazer quando o próprio logger
 * falha. Eles já passam por `redactText`, e roteá-los pelo `logEvent` criaria
 * recursão no exato momento em que o log está quebrado.
 */
const LOG_SINK_FILE = "backend/src/services/log/safeLog.ts";
const DIRECT_CONSOLE_ALLOWED = ["backend/src/services/providers/vendorResponseLog.ts"];

async function checkNoLogOutsideSink(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  const arquivos = await listSourceFiles(path.join(repoRoot, "backend", "src"));
  let publicadores = 0;
  let inspecionados = 0;

  for (const full of arquivos) {
    const rel = path.relative(repoRoot, full).replace(/\\/g, "/");
    if (rel === LOG_SINK_FILE || DIRECT_CONSOLE_ALLOWED.includes(rel)) continue;
    // Scripts do gate imprimem relatório para o operador: é saída de
    // ferramenta, não log de servidor, e não passa por nenhuma requisição.
    if (rel.startsWith("backend/src/scripts/")) continue;

    const source = stripComments(await readFile(full, "utf8"));
    inspecionados += 1;

    if (/\bconsole\.(log|error|warn|info|debug)\s*\(/.test(source)) {
      failures.push(
        `log: ${rel} publica log por fora do sumidouro (console.* direto). O vazamento de chave medido ` +
          "no PREVOO-1 veio exatamente daí: um publicador imprimiu `err.message`, que carrega o corpo " +
          "bruto do fornecedor porque `fetchJson` o embute na exceção. Use logEvent() de services/log/safeLog.ts.",
      );
    }
    if (/\blogEvent\s*\(/.test(source)) publicadores += 1;
  }

  if (publicadores === 0) {
    failures.push(
      "log: nenhum módulo usa logEvent() — ou o sumidouro deixou de ser usado, ou a guarda deixou de " +
        "reconhecê-lo. Nos dois casos ela não está verificando nada.",
    );
  }
  notes.push(`log: ${inspecionados} arquivo(s) inspecionado(s), ${publicadores} publicando pelo sumidouro`);
}

/**
 * A redação está de fato redigindo — exercitando a função, não lendo uma flag.
 *
 * Os casos cobrem o que o item pedia explicitamente: segredo aninhado em array
 * dentro de objeto, e `err.message` cru. Uma flag diria "ligada" mesmo com a
 * lógica esvaziada.
 */
function checkRedactionIsOn(failures: string[], notes: string[]): void {
  const SENTINELA_SK = "sk-testeQUEparecechaveMASnaoE1234567890abcd";
  const SENTINELA_AIZA = "AIzaTESTEfalsoQUEparecechave1234567890";
  const SENTINELA_AQ = "AQ.testeFALSOqueParecechave1234567890abcd";

  const casos: Array<{ nome: string; valor: unknown; agulha: string }> = [
    { nome: "string solta", valor: SENTINELA_SK, agulha: SENTINELA_SK },
    { nome: "campo de objeto", valor: { detail: SENTINELA_AIZA }, agulha: SENTINELA_AIZA },
    {
      nome: "aninhado em array dentro de objeto",
      valor: { erros: [{ contexto: "x", corpo: { chaves: [SENTINELA_AQ] } }] },
      agulha: SENTINELA_AQ,
    },
    { nome: "Error com a chave na message", valor: new Error(`falhou: ${SENTINELA_SK}`), agulha: SENTINELA_SK },
    {
      nome: "par chave=valor com nome inocente",
      valor: { texto: 'x-api-key: "abcdef123456789"' },
      agulha: "abcdef123456789",
    },
  ];

  for (const caso of casos) {
    const saida = JSON.stringify(redactDeep(caso.valor));
    if (saida.includes(caso.agulha)) {
      failures.push(
        `log: a redação do sumidouro não redigiu o caso "${caso.nome}" — o valor saiu inteiro. ` +
          "Redigir só o que se antecipou cobre o vazamento que já aconteceu, não o próximo: " +
          "o valor real estava dentro de `detail`, um nome que não sugere segredo nenhum.",
      );
    }
  }

  // Contraponto: texto comum não pode virar tarja. Uma redação que apaga tudo
  // passaria em todos os casos acima e tornaria o log inútil.
  const comum = "video 3ef8da68 pronto em 3.37s, formato 9:16, engine avatar_iv";
  if (redactText(comum) !== comum) {
    failures.push(
      `log: a redação alterou texto legítimo ("${redactText(comum)}"). Uma redação que apaga o log ` +
        "inteiro é abandonada na primeira semana, e log abandonado não observa nada.",
    );
  }

  notes.push(`log: ${casos.length} forma(s) de segredo redigidas em qualquer profundidade, sem tarjar texto comum`);
}

// --------------------------------------------------------------------- 4 ---

/**
 * O freio deriva do catálogo, e o catálogo cobre o que o código alcança.
 *
 * A segunda metade é a que importa: um endpoint chamado pelo código e ausente
 * do catálogo é invisível para o freio — que é exatamente como `/v3/videos`
 * ficou de fora por tanto tempo.
 */
function checkFreioDerivesFromCatalog(failures: string[], notes: string[]): void {
  const tarifaveis = billableEndpointPaths();

  if (tarifaveis.length === 0) {
    failures.push(
      "freio: o catálogo não declara endpoint tarifável nenhum. O freio DERIVA desta lista, então " +
        "uma lista vazia desliga o freio inteiro sem que nada pareça errado.",
    );
    return;
  }

  for (const e of VENDOR_ENDPOINTS) {
    if (!e.note || e.note.length < 20) {
      failures.push(
        `freio: o endpoint ${e.vendor} ${e.path} está no catálogo sem nota utilizável. A nota é o que ` +
          "diz se o custo foi MEDIDO ou é suposição, e é ela que impede a próxima pessoa de decidir às cegas.",
      );
    }
  }

  const vendors = new Set(VENDOR_ENDPOINTS.map((e) => e.vendor));
  for (const v of ["heygen", "did", "elevenlabs"]) {
    if (!vendors.has(v as never)) {
      failures.push(
        `freio: o catálogo não cobre o fornecedor "${v}". Um fornecedor ausente é invisível ao freio, ` +
          "e foi assim que o endpoint de geração v3 ficou de fora da lista antiga.",
      );
    }
  }

  notes.push(
    `freio: ${VENDOR_ENDPOINTS.length} endpoint(s) no catálogo (${vendors.size} fornecedores), ` +
      `${tarifaveis.length} tarifável(is) — o freio do probe deriva desta lista`,
  );
}

// ------------------------------------------------------------------ util ---

async function listSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await listSourceFiles(full)));
      else if (entry.name.endsWith(".ts")) out.push(full);
    }
  } catch {
    // Diretório ausente é tratado pelo contador de "inspecionados".
  }
  return out;
}

/**
 * Remove comentários antes de inspecionar.
 *
 * Terceira vez que este projeto tropeça no próprio texto: uma guarda que
 * procura um termo acusa o comentário que EXPLICA a regra. Já aconteceu com a
 * de credencial literal, com a de chaves de plataforma e com a de elisão.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
