/**
 * Invariantes das chaves DA PLATAFORMA.
 *
 * A porta que este bloco abriu é uma tela que grava segredo. A pergunta que
 * precisa ficar respondida para sempre não é "grava direito?", e sim "algum
 * caminho devolve o valor de volta?". Nada aqui é opinião de estilo: cada
 * asserção corresponde a uma forma concreta de a chave sair do servidor.
 *
 *  1. O serializador não vaza. Provado com uma sentinela na LINHA CRUA e a
 *     função real — não uma cópia da lógica, que envelheceria sozinha.
 *  2. Nenhum arquivo de rota decifra. Escrita é possível, leitura de volta
 *     não; a única forma de garantir isso é a rota nunca ter o valor na mão.
 *  3. Nenhum arquivo de rota devolve o objeto de resolução.
 *  4. O probe de validação é somente-leitura: só endpoints da allowlist, e
 *     nenhum endpoint de geração.
 *  5. Toda credencial do registro tem nome de variável de ambiente próprio —
 *     duas apontando para a mesma variável fariam uma sobrescrever a outra em
 *     silêncio.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { encrypt } from "../services/crypto.js";
import {
  PLATFORM_CREDENTIALS,
  PLATFORM_CREDENTIAL_IDS,
} from "../services/platformCredentials.js";
import { toPublicPlatformCredential } from "../services/platformCredentialStore.js";
import { PROBE_ENDPOINTS } from "../services/providers/platformKeyProbe.js";

export interface PlatformKeyCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "chaves: serializador não vaza",
    name: "serializador devolve a chave em claro",
    kind: "obvio",
    file: "backend/src/services/platformCredentialStore.ts",
    // Vaza o TEXTO CIFRADO por um campo que já existe e parece inofensivo —
    // nenhum campo novo, nenhuma assinatura alterada. Cifrado ainda é material
    // de chave, e é assim que um vazamento chegaria: por conveniência de tela.
    find: "    lastFour: source === \"panel\" && row ? row.last_four : null,",
    replace: "    lastFour: source === \"panel\" && row ? row.encrypted_key : null,",
    expect: "devolveu o TEXTO CIFRADO",
  },
  {
    guard: "chaves: rota nunca vê valor em claro",
    name: "rota passa a resolver a chave",
    kind: "obvio",
    file: "backend/src/routes/adminPlatformCredentials.ts",
    find: `import { listPlatformCredentials, setPlatformKey } from "../services/platformCredentialStore.js";`,
    replace: `import { listPlatformCredentials, setPlatformKey, resolvePlatformKey } from "../services/platformCredentialStore.js";\nvoid resolvePlatformKey;`,
    expect: `menciona "resolvePlatformKey"`,
  },
  {
    guard: "chaves: probe é somente leitura",
    name: "probe do HeyGen apontado para endpoint de geração",
    kind: "esperto",
    file: "backend/src/services/providers/platformKeyProbe.ts",
    // O probe continua fazendo UMA chamada, continua na allowlist, continua
    // com cara de validação. Só o endpoint muda — e validar passaria a gerar.
    find: `  heygen: "https://api.heygen.com/v2/user/remaining_quota",`,
    replace: `  heygen: "https://api.heygen.com/v2/video/generate",`,
    expect: "contém o caminho",
  },
  {
    guard: "chaves: variáveis distintas",
    name: "duas credenciais na mesma variável de ambiente",
    kind: "esperto",
    file: "backend/src/services/platformCredentials.ts",
    // Nenhuma credencial some do registro; a tela continua mostrando cinco.
    // Só duas passam a ler a MESMA variável, e uma vira retaguarda silenciosa
    // da outra.
    find: `envVar: "PLATFORM_EMBEDDING_API_KEY"`,
    replace: `envVar: "PLATFORM_GOOGLE_API_KEY"`,
    expect: "apontam para a mesma variável",
  },
];

const ROUTES_DIR = "backend/src/routes";

/**
 * Só estes módulos podem ver uma chave de plataforma em claro.
 *
 * Até o bloco GUARDAS-1 esta lista era decorativa: ela só era usada para
 * conferir se os arquivos existiam, e a inspeção olhava apenas `routes/`. A
 * nota impressa dizia "leitura em claro só em 2 módulos declarados" — uma
 * afirmação que a guarda não sustentava, e que estava ERRADA: um terceiro
 * módulo (`providers/platformKeys.ts`) resolve chave e nunca era olhado.
 * Agora a lista é aplicada contra `backend/src` inteiro, e a nota só diz o que
 * foi de fato verificado.
 */
const PLAINTEXT_ALLOWED = [
  "backend/src/services/platformCredentialStore.ts",
  "backend/src/services/platformCredentialValidation.ts",
  // Decide QUAL chave paga cada caminho de IA (plataforma ou tenant), então
  // precisa resolver o valor para entregá-lo a quem vai chamar o fornecedor.
  // É o terceiro leitor legítimo, e estava fora da lista sem que nada
  // acusasse.
  "backend/src/services/providers/platformKeys.ts",
];

/**
 * Termos que, num arquivo de rota, significam ter a chave DA PLATAFORMA em
 * claro na mão. A checagem é textual e grosseira de propósito, pelo mesmo
 * motivo da guarda de PROVIDER_MODE: o que se barra é o esquecimento, não quem
 * quer burlar.
 *
 * `encrypted_key` NÃO entra nesta lista, apesar de ser a coluna do valor
 * cifrado: é o mesmo nome de coluna em `api_credentials`, do tenant, onde
 * `adminPanel.ts` e `credentials.ts` a usam legitimamente. Uma guarda que
 * acusa uso legítimo é abandonada, e uma guarda abandonada não protege nada.
 * O que se cobra no lugar é a tabela: SQL cru contra `platform_credentials`
 * num arquivo de rota é o desvio real, porque contorna o store.
 */
//
// `readStoredValue` saiu no bloco GUARDAS-1 (achado B da auditoria): é uma
// função PRIVADA de platformCredentialStore.ts, sem `export`. Nenhum arquivo
// de fora consegue chamá-la, com ou sem má-fé, então o marcador não podia
// casar nunca — ocupava um terço da lista aparentando cobertura.
const PLAINTEXT_MARKERS = ["resolvePlatformKey", "platform_credentials"];

/** Endpoints de geração. Nenhum deles pode ser alcançável pelo probe. */
const GENERATION_ENDPOINTS = [
  "/v2/video/generate",
  "/v2/text_to_speech",
  "/v1/text-to-speech",
  "/generateContent",
  "/v1/messages",
  "/v2/avatar_group",
  "/talks",
];

export async function checkPlatformKeyPolicy(repoRoot: string): Promise<PlatformKeyCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  checkSerializerDoesNotLeak(failures, notes);
  await checkRoutesNeverSeePlaintext(repoRoot, failures, notes);
  checkProbeIsReadOnly(failures, notes);
  checkEnvVarsAreDistinct(failures, notes);

  return { failures, notes };
}

// --------------------------------------------------------------- 1 -------

/**
 * Monta uma linha crua com uma sentinela reconhecível, passa pelo
 * serializador REAL, e reprova se a sentinela sobreviver em qualquer campo.
 *
 * Vale a pena dizer o que esta asserção NÃO é: não é um teste de que a
 * serialização "parece certa". É a pergunta literal — o valor sai? — feita
 * contra a função que a rota chama.
 */
function checkSerializerDoesNotLeak(failures: string[], notes: string[]): void {
  const sentinel = "sk-SENTINELA-DE-CHAVE-QUE-NAO-PODE-VAZAR-9Z7Q";
  const cipher = encrypt(sentinel);
  const before = failures.length;

  for (const id of PLATFORM_CREDENTIAL_IDS) {
    const row = {
      key: id,
      encrypted_key: cipher,
      last_four: sentinel.slice(-4),
      updated_at: new Date().toISOString(),
      updated_by: null,
      updated_by_name: "verificador",
      last_validated_at: null,
      last_validation_ok: null,
      last_validation_detail: null,
    };

    for (const forceEnv of [false, true]) {
      const view = toPublicPlatformCredential(PLATFORM_CREDENTIALS[id], row, true, forceEnv);
      const serialized = JSON.stringify(view);

      if (serialized.includes(sentinel)) {
        failures.push(
          `chaves de plataforma: o serializador devolveu a chave em claro para "${id}" ` +
            `(forceEnv=${forceEnv}). Nenhuma rota pode devolver valor de credencial.`,
        );
      }
      if (serialized.includes(cipher)) {
        failures.push(
          `chaves de plataforma: o serializador devolveu o TEXTO CIFRADO de "${id}" ` +
            `(forceEnv=${forceEnv}). Cifrado ainda é material de chave e não sai do servidor.`,
        );
      }
    }
  }

  // A nota tem de acompanhar o veredito. Na primeira prova desta guarda o
  // resumo dizia "nenhuma vazou" logo acima de dez violações dizendo o
  // contrário — e o resumo é a parte que se lê de relance.
  const leaked = failures.length - before;
  notes.push(
    `chaves de plataforma: ${PLATFORM_CREDENTIAL_IDS.length} credenciais serializadas com sentinela — ` +
      (leaked === 0 ? "nenhuma vazou" : `${leaked} VAZAMENTO(S)`),
  );
}

// --------------------------------------------------------------- 2 e 3 ---

async function checkRoutesNeverSeePlaintext(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  const dir = path.join(repoRoot, ROUTES_DIR);
  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith(".ts"));
  } catch {
    failures.push(
      `chaves de plataforma: não consegui ler ${ROUTES_DIR} — o verificador ficaria cego, o que é pior que reprovar.`,
    );
    return;
  }
  if (entries.length === 0) {
    failures.push(`chaves de plataforma: nenhum arquivo de rota encontrado em ${ROUTES_DIR}.`);
    return;
  }

  // Varre TODO o backend/src, e não só as rotas: uma chave em claro num
  // service alcançável por rota vaza igual, e foi assim que platformKeys.ts
  // ficou três blocos fora do radar.
  const todos = await collectTsFiles(path.join(repoRoot, "backend/src"));
  let inspecionadosFora = 0;
  for (const full of todos) {
    const rel = path.relative(repoRoot, full).replace(/\\/g, "/");
    if (PLAINTEXT_ALLOWED.includes(rel)) continue;
    // Arquivos que citam os marcadores como DADO, não como uso: os
    // verificadores (mutantes) e a política de documentação (que lista
    // `platform_credentials` justamente para PROIBIR que apareça em doc).
    // Acusá-los seria acusar quem protege — a mesma armadilha que já derrubou
    // esta guarda duas vezes com comentários.
    if (/^backend\/src\/scripts\//.test(rel)) continue;
    if (rel === "backend/src/services/docsPolicy.ts") continue;

    const content = stripComments(await readFile(full, "utf-8"));
    inspecionadosFora += 1;
    for (const marker of PLAINTEXT_MARKERS) {
      if (content.includes(marker)) {
        failures.push(
          `chaves de plataforma: ${rel} menciona "${marker}" e NÃO está na allowlist de leitura em claro. ` +
            "Quem resolve chave de plataforma precisa estar declarado em PLAINTEXT_ALLOWED, com o motivo — " +
            "senão o conjunto de quem pode ler cresce sem ninguém decidir.",
        );
      }
    }
  }

  let inspected = 0;
  for (const name of entries) {
    const rel = `${ROUTES_DIR}/${name}`;
    const content = stripComments(await readFile(path.join(dir, name), "utf-8"));
    inspected += 1;

    // `decrypt(` continua legítimo em adminPanel.ts: lá a credencial é do
    // TENANT, e testá-la exige decifrar. A regra é sobre chave de plataforma,
    // então o que se cobra é o conjunto de marcadores abaixo.
    for (const marker of PLAINTEXT_MARKERS) {
      if (content.includes(marker)) {
        failures.push(
          `chaves de plataforma: ${rel} menciona "${marker}", ou seja teria a chave da plataforma ` +
            "em claro na mão. Rotas falam com listPlatformCredentials/setPlatformKey/" +
            "validatePlatformCredential, que devolvem só metadado e resultado.",
        );
      }
    }
  }

  // A allowlist só vale se os arquivos dela existirem — um caminho com erro de
  // digitação faria a regra parecer aplicada sem aplicar nada.
  for (const allowed of PLAINTEXT_ALLOWED) {
    try {
      await readFile(path.join(repoRoot, allowed), "utf-8");
    } catch {
      failures.push(
        `chaves de plataforma: ${allowed} está na allowlist de leitura em claro mas não existe no disco.`,
      );
    }
  }

  // A nota diz o que foi VERIFICADO, e não o que se gostaria que fosse
  // verdade. A versão anterior afirmava "leitura em claro só em 2 módulos
  // declarados" sem nunca ter olhado fora de routes/ — e o número estava
  // errado.
  notes.push(
    `chaves de plataforma: ${inspected} rota(s) + ${inspecionadosFora} arquivo(s) de backend/src inspecionado(s); ` +
      `leitura em claro confinada aos ${PLAINTEXT_ALLOWED.length} módulo(s) da allowlist`,
  );
}

async function collectTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectTsFiles(full)));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * Remove comentários antes de procurar os marcadores.
 *
 * Sem isto, a guarda acusaria justamente o comentário que EXPLICA a regra —
 * `adminPlatformCredentials.ts` diz, em texto, que não chama
 * `resolvePlatformKey`, e isso a reprovava. Não é hipótese: aconteceu na
 * primeira execução, e já tinha acontecido antes neste projeto com a guarda de
 * credencial literal. Reescrever o comentário resolveria uma vez; a próxima
 * pessoa a documentar a regra tropeçaria de novo.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// --------------------------------------------------------------- 4 -------

function checkProbeIsReadOnly(failures: string[], notes: string[]): void {
  for (const [vendor, url] of Object.entries(PROBE_ENDPOINTS)) {
    for (const gen of GENERATION_ENDPOINTS) {
      if (url.includes(gen)) {
        failures.push(
          `chaves de plataforma: o endpoint de validação de ${vendor} ("${url}") contém o caminho ` +
            `de geração "${gen}". Validar chave nunca pode gerar — a carteira do HeyGen comporta ` +
            "cerca de um vídeo.",
        );
      }
    }
  }

  // Toda credencial precisa de uma forma de validação declarada, e ela tem de
  // apontar para um endpoint que existe na allowlist.
  const kinds = new Set(PLATFORM_CREDENTIAL_IDS.map((id) => PLATFORM_CREDENTIALS[id].validation));
  const expected: Record<string, string> = {
    gemini_list_models: PROBE_ENDPOINTS.gemini,
    anthropic_list_models: PROBE_ENDPOINTS.anthropic,
    heygen_quota: PROBE_ENDPOINTS.heygen,
    elevenlabs_voices: PROBE_ENDPOINTS.elevenlabs,
  };
  for (const kind of kinds) {
    if (!expected[kind]) {
      failures.push(
        `chaves de plataforma: a forma de validação "${kind}" não tem endpoint declarado na allowlist do probe.`,
      );
    }
  }

  notes.push(
    `chaves de plataforma: ${Object.keys(PROBE_ENDPOINTS).length} endpoint(s) de validação, todos de leitura`,
  );
}

// --------------------------------------------------------------- 5 -------

function checkEnvVarsAreDistinct(failures: string[], notes: string[]): void {
  const seen = new Map<string, string>();
  for (const id of PLATFORM_CREDENTIAL_IDS) {
    const envVar = PLATFORM_CREDENTIALS[id].envVar;
    const other = seen.get(envVar);
    if (other) {
      failures.push(
        `chaves de plataforma: "${id}" e "${other}" apontam para a mesma variável ${envVar}. ` +
          "Duas credenciais na mesma variável fazem uma servir de retaguarda para a outra sem ninguém pedir.",
      );
    }
    seen.set(envVar, id);
  }
  notes.push(`chaves de plataforma: ${seen.size} variáveis de ambiente distintas no registro`);
}
