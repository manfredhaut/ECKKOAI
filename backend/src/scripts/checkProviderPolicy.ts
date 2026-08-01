/**
 * Invariantes do modo de provedor e das feature flags.
 *
 * Três coisas que, quando quebram, quebram em silêncio:
 *
 *  1. `PROVIDER_MODE=fixture` com `NODE_ENV=production`. Entregar vídeo
 *     simulado a quem é cobrado via Stripe é uma mentira cobrada — e o
 *     sintoma não é um erro, é um cliente recebendo barras de teste.
 *  2. Caminho que chama HeyGen/ElevenLabs sem consultar o modo. Basta uma
 *     export nova esquecer a checagem para o modo fixture deixar de valer
 *     justamente onde importa: numa chamada que gasta cota.
 *  3. Código referenciando flag que não existe no registro. Uma flag
 *     renomeada num lugar e não no outro fica `false` para sempre, e o
 *     recurso simplesmente nunca liga.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { FEATURE_FLAG_KEYS } from "../services/featureFlags.js";
import { readProviderMode } from "../services/providers/providerMode.js";
import {
  LIVE_CONFIRM_ENV,
  LIVE_CONFIRM_VALUE,
  isLiveAuthorized,
  readLiveMaxGenerations,
} from "../services/providers/liveGuard.js";

export interface ProviderCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  // --- 1. modo de provedor ------------------------------------------------
  {
    guard: "provedor: fixture em produção",
    name: "fixture com NODE_ENV=production",
    kind: "obvio",
    env: { PROVIDER_MODE: "fixture", NODE_ENV: "production" },
    expect: "PROVIDER_MODE=fixture com NODE_ENV=production",
  },
  {
    guard: "provedor: live sem autorização",
    name: "live com a frase de confirmação errada",
    kind: "esperto",
    // A variável EXISTE e tem valor — só não é o valor exato. Uma guarda que
    // testasse "está definida?" em vez de "vale exatamente isto?" passaria.
    env: { PROVIDER_MODE: "live", PROVIDER_LIVE_CONFIRM: "sim" },
    expect: "PROVIDER_MODE=live sem",
  },
  // --- 2. caminho de vendor respeita o modo --------------------------------
  {
    guard: "provedor: vendor respeita modo",
    name: "generateVideo deixa de consultar isFixtureMode",
    kind: "obvio",
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "  if (isFixtureMode()) return generateVideoFixture(input);",
    replace: "",
    expect: "generateVideo() alcança um fornecedor tarifado sem desviar para fixture",
  },
  {
    guard: "provedor: vendor respeita modo",
    name: "cloneVoice consulta o modo e ignora o resultado",
    kind: "esperto",
    file: "backend/src/services/providers/voiceProvider.ts",
    // A CHAMADA continua lá — a superfície que a guarda inspeciona não muda.
    // Só o efeito some. Uma guarda que procura o texto `isFixtureMode(` passa.
    find: "  if (isFixtureMode()) return cloneVoiceFixture();",
    replace: "  if (isFixtureMode() && false) return cloneVoiceFixture();",
    expect: "cloneVoice() alcança um fornecedor tarifado sem desviar",
  },
  // --- 3. registro de feature flags ---------------------------------------
  {
    guard: "flags: referência existe no registro",
    name: "flag inexistente referenciada",
    kind: "obvio",
    file: "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx",
    find: `useFeature("removable_background")`,
    replace: `useFeature("removable_backgroundX")`,
    expect: `referencia a flag "removable_backgroundX"`,
  },
  {
    guard: "flags: referência existe no registro",
    name: "flag lida por caminho que a guarda não olha",
    kind: "esperto",
    file: "frontend/src/dev/galleryFetch.ts",
    // A chave literal existe fora dos helpers reconhecidos pelo regex. Se a
    // flag for renomeada no registro, ESTE uso quebra em silêncio e a guarda
    // não vê — é o buraco real desta guarda, não uma hipótese.
    find: `key: "removable_background"`,
    replace: `key: "removable_background_renomeada"`,
    expect: "removable_background_renomeada",
  },
];

/**
 * Arquivos que falam com HeyGen/ElevenLabs. Toda função exportada por eles
 * precisa consultar `isFixtureMode()` antes de qualquer `fetch`.
 */
const VENDOR_MODULES = [
  "backend/src/services/providers/avatarProvider.ts",
  "backend/src/services/providers/voiceProvider.ts",
];

/** Hosts que só podem ser alcançados por um caminho que respeite o modo. */
const METERED_VENDOR_HOSTS = ["api.heygen.com", "api.d-id.com", "api.elevenlabs.io"];

const FLAG_SOURCE_ROOTS = ["backend/src", "frontend/src"];
const FLAG_EXTENSIONS = new Set([".ts", ".tsx"]);

export async function checkProviderPolicy(repoRoot: string): Promise<ProviderCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  checkFixtureNotInProduction(failures, notes);
  await checkVendorCallsRespectMode(repoRoot, failures, notes);
  await checkFlagReferences(repoRoot, failures, notes);

  return { failures, notes };
}

// --------------------------------------------------------------- 1 -------

function checkFixtureNotInProduction(failures: string[], notes: string[]): void {
  const mode = readProviderMode();
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";

  if (mode === "fixture" && isProduction) {
    failures.push(
      "provedor: PROVIDER_MODE=fixture com NODE_ENV=production. Em simulação a " +
        "geração devolve artefatos locais — entregar isso a um cliente cobrado " +
        "via Stripe seria cobrar por um vídeo que nunca foi gerado.",
    );
    return;
  }
  // A proteção precisa valer nos DOIS sentidos. Impedir fixture em produção
  // sem impedir live sem autorização deixaria o acidente mais provável — e
  // mais caro — completamente desprotegido: trocar uma palavra no .env
  // libera chamada real numa carteira que comporta cerca de um vídeo.
  if (mode === "live" && !isLiveAuthorized()) {
    failures.push(
      `provedor: PROVIDER_MODE=live sem ${LIVE_CONFIRM_ENV}="${LIVE_CONFIRM_VALUE}". ` +
        "Em live cada geração consome cota paga; a intenção precisa ser declarada, " +
        "não herdada de um .env copiado.",
    );
    return;
  }

  notes.push(
    `provedor: PROVIDER_MODE=${mode}` +
      (mode === "fixture"
        ? " (simulação — nunca em produção)"
        : ` (AUTORIZADO, teto de ${readLiveMaxGenerations()} geração(ões) por sessão)`),
  );
}

// --------------------------------------------------------------- 2 -------

/**
 * Verifica que cada função exportada dos módulos de vendor consulta o modo.
 *
 * A checagem é textual e grosseira de propósito: analisar o fluxo de
 * verdade exigiria um parser, e o que se quer barrar é o esquecimento
 * (função nova sem a linha), não alguém determinado a burlar. Errar para o
 * lado de acusar é aceitável; errar para o lado de deixar passar não é.
 */
async function checkVendorCallsRespectMode(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  let checkedExports = 0;

  for (const rel of VENDOR_MODULES) {
    const full = path.join(repoRoot, rel);
    let content: string;
    try {
      content = await readFile(full, "utf-8");
    } catch {
      failures.push(`provedor: não consegui ler ${rel} para verificar o modo.`);
      continue;
    }
    if (!METERED_VENDOR_HOSTS.some((h) => content.includes(h))) {
      failures.push(
        `provedor: ${rel} não menciona nenhum host tarifado (${METERED_VENDOR_HOSTS.join(", ")}) — ` +
          "ou o módulo mudou de endereço, ou o verificador está olhando o arquivo errado.",
      );
      continue;
    }

    const funcs = splitFunctions(content);
    if (funcs.length === 0) {
      failures.push(`provedor: nenhuma função encontrada em ${rel} — o verificador ficou cego.`);
      continue;
    }

    const reachesNetwork = functionsReachingNetwork(funcs);

    for (const fn of funcs) {
      // Só as EXPORTADAS: é nelas que o desvio para fixture tem de estar,
      // porque são a fronteira do módulo. As privadas fazem o fetch e são
      // levadas em conta pela análise transitiva acima.
      if (!fn.exported || !reachesNetwork.has(fn.name)) continue;

      checkedExports += 1;

      // O PADRÃO, não a menção. Mencionar `isFixtureMode(` não prova nada:
      // `if (isFixtureMode() && false) return ...` menciona e não desvia. O
      // arnês de mutação provou exatamente isso — a versão anterior desta
      // guarda passava verde com esse mutante aplicado.
      if (!/if\s*\(\s*isFixtureMode\(\s*\)\s*\)\s*(return|\{)/.test(fn.body)) {
        failures.push(
          `provedor: ${rel} → ${fn.name}() alcança um fornecedor tarifado sem desviar para fixture. ` +
            "O padrão exigido é `if (isFixtureMode()) return ...` como PRIMEIRA decisão da função — " +
            "mencionar isFixtureMode() sem desviar (por exemplo dentro de uma condição composta) " +
            "deixa a chamada real acontecer em modo de simulação.",
        );
      }
    }
  }

  if (checkedExports > 0) {
    notes.push(`provedor: ${checkedExports} caminho(s) de vendor conferido(s) — todos desviam para fixture`);
  } else {
    failures.push(
      "provedor: nenhuma função exportada alcança a rede nos módulos de vendor — " +
        "o verificador deixou de casar com o código e passaria verde sem inspecionar nada.",
    );
  }
}

interface ParsedFunction {
  name: string;
  body: string;
  exported: boolean;
}

/**
 * Quais funções alcançam a rede, direta ou transitivamente.
 *
 * A versão anterior desta guarda usava uma heurística por regex no corpo, e
 * errava nos DOIS sentidos: `normalizeAvatarStatus` — cinco linhas, sem rede —
 * era dada como conferida porque seu trecho ia até o próximo export e engolia
 * todos os helpers do arquivo; enquanto `pollVideoJob` e
 * `checkAvatarConnection`, que falam com o fornecedor de verdade, eram
 * IGNORADAS porque delegam numa linha e não casavam o padrão. Uma guarda que
 * confere a função errada e pula as certas tem número alto e valor zero.
 */
function functionsReachingNetwork(funcs: ParsedFunction[]): Set<string> {
  const direct = new Set<string>();
  const calls = new Map<string, string[]>();

  for (const fn of funcs) {
    if (/\bfetch\(/.test(fn.body)) direct.add(fn.name);
    const chamados = [...fn.body.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)]
      .map((m) => m[1])
      .filter((n) => n !== fn.name);
    calls.set(fn.name, chamados);
  }

  // Ponto fixo: propaga "alcança rede" pelas chamadas até estabilizar.
  const reaches = new Set(direct);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const fn of funcs) {
      if (reaches.has(fn.name)) continue;
      if ((calls.get(fn.name) ?? []).some((c) => reaches.has(c))) {
        reaches.add(fn.name);
        mudou = true;
      }
    }
  }
  return reaches;
}

/**
 * Fatia o arquivo em funções, com o corpo REAL delimitado por chaves
 * balanceadas — e não "até a próxima declaração", que era o que fazia o corpo
 * de uma função pura engolir os helpers seguintes.
 */
function splitFunctions(content: string): ParsedFunction[] {
  const re = /(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  const out: ParsedFunction[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    const abre = content.indexOf("{", m.index + m[0].length);
    if (abre < 0) continue;

    let profundidade = 0;
    let fim = abre;
    for (let i = abre; i < content.length; i += 1) {
      if (content[i] === "{") profundidade += 1;
      else if (content[i] === "}") {
        profundidade -= 1;
        if (profundidade === 0) {
          fim = i;
          break;
        }
      }
    }
    out.push({ name: m[2], body: content.slice(abre, fim + 1), exported: Boolean(m[1]) });
  }
  return out;
}

// --------------------------------------------------------------- 3 -------

async function checkFlagReferences(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  const known = new Set<string>(FEATURE_FLAG_KEYS);
  const files = await collectFiles(repoRoot, FLAG_SOURCE_ROOTS, FLAG_EXTENSIONS);

  // Só conta como "referência a flag" um uso explícito pelos helpers ou
  // pelo tipo — procurar qualquer string solta produziria falso positivo em
  // qualquer texto que por acaso parecesse uma chave.
  // Os nomes aqui têm de acompanhar os helpers de verdade. Na primeira
  // versão a lista trazia `useFeatureFlag`, que não existe — o hook chama-se
  // `useFeature` —, então a asserção passava sem inspecionar nada. Uma
  // guarda que não casa com nada é pior que nenhuma: parece cobertura.
  //
  // `setGalleryFlag` e a forma `key: "..."` entraram no bloco GUARDAS-1: o
  // arnês de mutação renomeou a chave em `dev/galleryFetch.ts` e esta guarda
  // não viu. Eram DOIS dos três usos reais da flag no projeto passando fora do
  // radar — um rename no registro os quebraria em silêncio, que é exatamente o
  // defeito que ela existe para pegar.
  const refRe =
    /(?:isFeatureEnabled|useFeature|featureFlag|FEATURE_FLAGS|setGalleryFlag|\bkey:)\s*[(\[.]?\s*["'`]([a-zA-Z0-9_]+)["'`]/g;

  let references = 0;
  for (const file of files) {
    // O próprio registro e a migration que o semeia definem as chaves; não
    // são referências a verificar.
    if (file.endsWith("featureFlags.ts") || file.endsWith("featureFlagStore.ts")) continue;
    // Os módulos de guarda declaram MUTANTES, que por construção contêm
    // referências a flags inexistentes — é esse o defeito que eles injetam.
    // Sem esta exclusão a guarda acusa o próprio teste que a exercita, que é
    // a mesma armadilha já registrada duas vezes aqui: guarda tropeçando no
    // texto escrito para descrevê-la.
    if (/[\\/]scripts[\\/]check[A-Za-z]*\.ts$/.test(file)) continue;

    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch {
      continue;
    }

    let match: RegExpExecArray | null;
    refRe.lastIndex = 0;
    while ((match = refRe.exec(content)) !== null) {
      references += 1;
      const key = match[1];
      if (!known.has(key)) {
        failures.push(
          `flags: ${path.relative(repoRoot, file)} referencia a flag "${key}", que não existe no ` +
            "registro (services/featureFlags.ts). Uma flag fora do registro fica desligada para " +
            "sempre, em silêncio.",
        );
      }
    }
  }

  notes.push(
    `flags: ${known.size} no registro, ${references} referência(s) no código — todas existem`,
  );
}

async function collectFiles(
  repoRoot: string,
  roots: string[],
  extensions: Set<string>,
): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (extensions.has(path.extname(entry.name))) found.push(full);
    }
  }

  for (const root of roots) {
    const full = path.join(repoRoot, root);
    try {
      if ((await stat(full)).isDirectory()) await walk(full);
    } catch {
      // Ausente quando o check roda de um container que não monta esse
      // caminho — ver checkEnvironmentPolicy.ts.
    }
  }
  return found;
}
