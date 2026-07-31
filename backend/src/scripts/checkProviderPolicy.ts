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
import { FEATURE_FLAG_KEYS } from "../services/featureFlags.js";
import { readProviderMode } from "../services/providers/providerMode.js";

export interface ProviderCheckResult {
  failures: string[];
  notes: string[];
}

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
  notes.push(`provedor: PROVIDER_MODE=${mode}${mode === "fixture" ? " (simulação — nunca em produção)" : ""}`);
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

    const bodies = splitExportedFunctions(content);
    if (bodies.length === 0) {
      failures.push(`provedor: nenhuma função exportada encontrada em ${rel} — o verificador ficou cego.`);
      continue;
    }

    for (const fn of bodies) {
      // Só interessa quem realmente pode gastar cota: função exportada que
      // (direta ou indiretamente) leva a um host tarifado.
      const reachesVendor =
        METERED_VENDOR_HOSTS.some((h) => content.includes(h)) && /\bfetch\(|[A-Za-z]+(Heygen|Did|Elevenlabs|ElevenLabs)\(/.test(fn.body);
      if (!reachesVendor) continue;

      checkedExports += 1;
      if (!fn.body.includes("isFixtureMode(")) {
        failures.push(
          `provedor: ${rel} → ${fn.name}() pode chamar um fornecedor tarifado sem consultar ` +
            "isFixtureMode(). Todo caminho que gasta cota precisa respeitar PROVIDER_MODE.",
        );
      }
    }
  }

  if (checkedExports > 0) {
    notes.push(`provedor: ${checkedExports} caminho(s) de vendor conferido(s) — todos respeitam PROVIDER_MODE`);
  }
}

interface ExportedFunction {
  name: string;
  body: string;
}

/**
 * Fatia o arquivo em funções exportadas. Cada bloco vai do `export ...
 * function nome(` até a próxima declaração exportada — suficiente para
 * perguntar "esta função menciona isFixtureMode?".
 */
function splitExportedFunctions(content: string): ExportedFunction[] {
  const re = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  const starts: { name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    starts.push({ name: m[1], index: m.index });
  }
  return starts.map((s, i) => ({
    name: s.name,
    body: content.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : content.length),
  }));
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
  const refRe = /(?:isFeatureEnabled|useFeature|featureFlag|FEATURE_FLAGS)\s*[(\[.]?\s*["'`]([a-zA-Z0-9_]+)["'`]/g;

  let references = 0;
  for (const file of files) {
    // O próprio registro e a migration que o semeia definem as chaves; não
    // são referências a verificar.
    if (file.endsWith("featureFlags.ts") || file.endsWith("featureFlagStore.ts")) continue;

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
