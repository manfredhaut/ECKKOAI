/**
 * Invariantes de ambiente e de acesso, cobradas pelo `npm run check`.
 *
 * Três coisas que só falham quando ninguém está olhando, e por isso viram
 * teste em vez de convenção:
 *
 *  1. Serviço do Compose sem política de restart ou sem healthcheck. Um
 *     serviço sem restart não volta de um crash; um sem healthcheck faz o
 *     Compose declarar "de pé" algo que não responde. Este projeto já teve
 *     as duas coisas ao mesmo tempo.
 *  2. Limiter de login afrouxado com NODE_ENV=production. A configuração é
 *     legítima em desenvolvimento; levá-la para produção não é.
 *  3. Credencial de desenvolvimento literal no fonte, ou flag de autofill
 *     ligada em produção. As senhas de dev já estiveram publicadas no
 *     repositório como default de um script — um default confortável é
 *     exatamente como uma senha vaza, porque ninguém a digita e ninguém
 *     percebe que ela está no git.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import {
  LOGIN_RATE_LIMIT_DEFAULTS,
  describeLoginRateLimit,
  isRelaxed,
  readLoginRateLimit,
} from "../services/loginRateLimitPolicy.js";

export interface EnvironmentCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  // --- compose: restart e healthcheck --------------------------------------
  {
    guard: "ambiente: restart policy",
    name: "traefik perde a política de restart",
    kind: "obvio",
    file: "docker-compose.yml",
    find: "    # restart.\n    restart: unless-stopped\n    ports:",
    replace: "    # restart.\n    ports:",
    expect: 'serviço "traefik" está sem política de restart',
  },
  {
    guard: "ambiente: restart policy",
    name: "restart presente, mas com o valor que anula tudo",
    kind: "esperto",
    file: "docker-compose.yml",
    // A CHAVE continua lá. Uma guarda que só perguntasse "existe restart?"
    // passaria verde num serviço que nunca reinicia.
    find: "  backend:\n    build:\n      context: ./backend\n    restart: unless-stopped",
    replace: "  backend:\n    build:\n      context: ./backend\n    restart: no\n    x-nota: mutante",
    expect: 'serviço "backend" tem restart: no',
  },
  {
    guard: "ambiente: healthcheck",
    name: "backend perde o healthcheck",
    kind: "obvio",
    file: "docker-compose.yml",
    find: "    healthcheck:\n      test: [\"CMD-SHELL\", \"node -e \\\"fetch('http://127.0.0.1:'",
    replace: "    x-healthcheck-desativado:\n      test: [\"CMD-SHELL\", \"node -e \\\"fetch('http://127.0.0.1:'",
    expect: 'serviço "backend" está sem healthcheck',
  },
  // --- credencial de desenvolvimento ---------------------------------------
  // --- compose: a variável lida chega mesmo ao container -------------------
  {
    guard: "ambiente: variável lida chega ao container",
    name: "uma variável nova é lida sem ser repassada",
    kind: "esperto",
    // O caso de quem renomeia a variável no código e esquece do compose. Nada
    // quebra: o `?? padrão` absorve a ausência e o produto continua
    // funcionando com o valor de fábrica. O sintoma só aparece no dia em que
    // alguém preencher a variável no `.env` e ela não fizer efeito nenhum —
    // que foi como `DAILY_PAID_GENERATION_LIMIT` e `DNS_PROVIDER` passaram
    // despercebidas.
    file: "backend/src/services/providers/voiceProvider.ts",
    find: 'export const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL?.trim()',
    replace: 'export const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL_V2?.trim()',
    expect: "`ELEVENLABS_TTS_MODEL_V2` é lida pelo código",
  },
  {
    guard: "ambiente: variável lida chega ao container",
    name: "o teto diário volta a não chegar ao container",
    kind: "esperto",
    // O defeito original, ao pé da letra: a variável continua no `.env`, o
    // `docker compose config` continua resolvendo-a, e o container não a
    // recebe. O produto recusa em 5 de 5 com o teto configurado em 10.
    file: "docker-compose.yml",
    find: "      DAILY_PAID_GENERATION_LIMIT: ${DAILY_PAID_GENERATION_LIMIT:-5}\n",
    replace: "",
    expect: "`DAILY_PAID_GENERATION_LIMIT` é lida pelo código",
  },
  {
    guard: "acesso: autofill em produção",
    name: "DEV_AUTOFILL=1 com NODE_ENV=production",
    kind: "obvio",
    env: { DEV_AUTOFILL: "1", NODE_ENV: "production" },
    expect: "DEV_AUTOFILL=1 com NODE_ENV=production",
  },
  {
    guard: "acesso: galeria em produção",
    name: "DEV_GALLERY=1 com NODE_ENV=production",
    kind: "obvio",
    env: { DEV_GALLERY: "1", NODE_ENV: "production" },
    expect: "DEV_GALLERY=1 com NODE_ENV=production",
  },
  {
    guard: "acesso: limiter de login",
    name: "limiter afrouxado em produção",
    kind: "obvio",
    env: { LOGIN_RATE_LIMIT_MAX: "999", NODE_ENV: "production" },
    expect: "limiter de login afrouxado",
  },
  {
    guard: "acesso: limiter de login",
    name: "limiter com valor que vira NaN",
    kind: "esperto",
    // A variável está DEFINIDA e parece configurada. Se o parser não tratasse
    // o inválido, o limite viraria NaN e toda comparação seria falsa — o
    // limiter desligado em silêncio, com a configuração parecendo presente.
    // Aqui o esperado é o INVERSO: a guarda deve continuar VERDE, porque a
    // política cai no default. Ver `expectGreen`.
    env: { LOGIN_RATE_LIMIT_MAX: "abc" },
    expect: "limiter de login 5 tentativas",
    expectGreen: true,
  },
];

/** Serviços que precisam existir e estar protegidos. */
const REQUIRED_SERVICES = ["traefik", "postgres", "backend", "frontend"] as const;

/** Variáveis cujo VALOR nunca pode aparecer em arquivo versionado. */
const SECRET_ENV_VARS = ["DEV_ADMIN_PASSWORD", "DEV_TENANT_PASSWORD"] as const;

/**
 * Diretórios varridos em busca de credencial literal. `node_modules` e
 * artefatos de build ficam de fora: não são versionados, e varrê-los
 * transformaria o check num scanner de dependência, que é outro problema.
 */
const SOURCE_ROOTS = ["backend/src", "backend/scripts", "frontend/src", "tools"];
// `.mjs` entrou junto com tools/set-key.mjs: um arquivo que manipula chaves
// ficaria fora da varredura de credencial literal só por causa da extensão,
// que é exatamente o tipo de buraco que a guarda existe para não ter.
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".json", ".sh", ".yml", ".yaml", ".md"]);

export async function checkEnvironmentPolicy(repoRoot: string): Promise<EnvironmentCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  await checkComposeResilience(repoRoot, failures, notes);
  checkLoginRateLimit(failures, notes);
  await checkNoLiteralCredentials(repoRoot, failures, notes);
  await checkEnvVarsReachContainer(repoRoot, failures, notes);

  return { failures, notes };
}

// --------------------------------------------------------------- 1 -------

/**
 * Lê o docker-compose.yml como texto, não como YAML.
 *
 * Deliberado: adicionar um parser de YAML como dependência do backend só
 * para esta asserção seria caro demais para o que ela verifica. O formato
 * do arquivo é estável e indentado a dois espaços, e o teste que importa é
 * grosseiro — "esta chave aparece dentro deste bloco?" — não uma leitura
 * semântica. Se o arquivo mudar de forma, isto falha barulhento em vez de
 * passar em silêncio, que é o lado certo para errar.
 */
async function checkComposeResilience(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  const composePath = path.join(repoRoot, "docker-compose.yml");
  let raw: string;
  try {
    raw = await readFile(composePath, "utf-8");
  } catch {
    failures.push(`ambiente: não consegui ler ${composePath}`);
    return;
  }

  const blocks = splitServiceBlocks(raw);
  const seen: string[] = [];

  for (const service of REQUIRED_SERVICES) {
    const block = blocks.get(service);
    if (!block) {
      failures.push(
        `ambiente: serviço "${service}" não encontrado em docker-compose.yml — ` +
          "se ele foi renomeado, atualize REQUIRED_SERVICES em checkEnvironmentPolicy.ts.",
      );
      continue;
    }

    const restart = /^\s{4}restart:\s*(\S+)/m.exec(block);
    if (!restart) {
      failures.push(
        `ambiente: serviço "${service}" está sem política de restart. ` +
          "Sem ela, um crash não volta sozinho — e traefik, que é a única porta " +
          "exposta, já ficou assim.",
      );
    } else if (restart[1] === "no") {
      failures.push(`ambiente: serviço "${service}" tem restart: no, o que anula a recuperação.`);
    }

    if (!/^\s{4}healthcheck:/m.test(block)) {
      failures.push(
        `ambiente: serviço "${service}" está sem healthcheck. ` +
          "Sem ele, `running` é confundido com saudável — e este projeto tem um " +
          "modo de falha em que o container fica running com o servidor morto.",
      );
    }

    if (restart && /^\s{4}healthcheck:/m.test(block)) seen.push(service);
  }

  if (seen.length === REQUIRED_SERVICES.length) {
    notes.push(`ambiente: ${seen.length} serviços com restart policy e healthcheck`);
  }
}

/**
 * Fatia o bloco `services:` em um trecho por serviço, usando a indentação de
 * dois espaços do nome do serviço como delimitador.
 */
function splitServiceBlocks(raw: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const lines = raw.split(/\r?\n/);

  let inServices = false;
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) blocks.set(current, buffer.join("\n"));
    current = null;
    buffer = [];
  };

  for (const line of lines) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (!inServices) continue;

    // Qualquer chave em coluna zero encerra o bloco services (networks:, volumes:).
    if (/^\S/.test(line)) {
      flush();
      inServices = false;
      continue;
    }

    const serviceStart = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (serviceStart) {
      flush();
      current = serviceStart[1];
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();

  return blocks;
}

// --------------------------------------------------------------- 2 -------

function checkLoginRateLimit(failures: string[], notes: string[]): void {
  const limit = readLoginRateLimit();
  const relaxed = isRelaxed(limit);
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";

  if (relaxed && isProduction) {
    failures.push(
      `acesso: limiter de login afrouxado (${describeLoginRateLimit(limit)}) com NODE_ENV=production. ` +
        `O valor de produção é ${describeLoginRateLimit(LOGIN_RATE_LIMIT_DEFAULTS)}. ` +
        "Afrouxar é uma conveniência de desenvolvimento; em produção, é a porta aberta.",
    );
    return;
  }

  notes.push(
    `acesso: limiter de login ${describeLoginRateLimit(limit)}` +
      (relaxed ? " (afrouxado — só vale fora de produção)" : " (valor de produção)"),
  );
}

// --------------------------------------------------------------- 3 -------

async function checkNoLiteralCredentials(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";

  if (process.env.DEV_GALLERY === "1" && isProduction) {
    failures.push(
      "acesso: DEV_GALLERY=1 com NODE_ENV=production. A galeria de passos (/dev/steps) " +
        "monta componentes com estado falso e uma rede falsa; em produção a rota não pode " +
        "sequer existir — o caminho certo é 404, não uma tela vazia que esconde código vivo.",
    );
  }

  if (process.env.DEV_AUTOFILL === "1" && isProduction) {
    failures.push(
      "acesso: DEV_AUTOFILL=1 com NODE_ENV=production. O preenchimento automático " +
        "de credenciais é ferramenta de desenvolvimento e não pode existir num build " +
        "de produção, nem por engano de configuração.",
    );
  }

  // Só dá para procurar um segredo cujo valor se conhece. Quando a variável
  // não está no ambiente, isto NÃO passa em silêncio: registra que não pôde
  // verificar, para a nota não ser confundida com aprovação.
  const secrets: { name: string; value: string }[] = [];
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value) secrets.push({ name, value });
  }

  if (secrets.length === 0) {
    notes.push(
      "acesso: nenhuma DEV_*_PASSWORD no ambiente — varredura de credencial literal NÃO executada",
    );
    return;
  }

  const files = await collectSourceFiles(repoRoot);
  let hits = 0;

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch {
      continue;
    }
    for (const secret of secrets) {
      if (content.includes(secret.value)) {
        hits += 1;
        failures.push(
          `acesso: valor de ${secret.name} encontrado em ${path.relative(repoRoot, file)}. ` +
            "Credencial de desenvolvimento não pode aparecer em arquivo versionado — " +
            "os valores vivem só no .env, que está no .gitignore.",
        );
      }
    }
  }

  if (hits === 0) {
    notes.push(
      `acesso: ${secrets.length} credencial(is) de dev conferida(s) contra ${files.length} arquivos do fonte — nenhuma literal`,
    );
  }
}

async function collectSourceFiles(repoRoot: string): Promise<string[]> {
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
      if (entry.isDirectory()) {
        await walk(full);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        found.push(full);
      }
    }
  }

  for (const root of SOURCE_ROOTS) {
    const full = path.join(repoRoot, root);
    try {
      if ((await stat(full)).isDirectory()) await walk(full);
    } catch {
      // Diretório ausente não é violação: o check roda dentro do container
      // do backend, onde frontend/ e tools/ podem não estar montados.
    }
  }

  return found;
}

// --------------------------------------------------------------- 4 -------

/**
 * TODA VARIÁVEL LIDA PELO CÓDIGO CHEGA AO CONTAINER — ou está declarada aqui
 * como ausência deliberada, com o motivo escrito.
 *
 * O defeito que isto fecha aconteceu duas vezes, e as duas em silêncio. Docker
 * Compose NÃO exporta o `.env` inteiro para dentro do container: repassa o que
 * está listado em `environment:`. Uma variável documentada no `.env` e ausente
 * dali é lida pelo `docker compose config`, descartada na fronteira do
 * container, e o processo cai no default sem dizer que caiu.
 *
 *  · `DAILY_PAID_GENERATION_LIMIT` — o sintoma era "subi o teto e o sistema
 *    continua recusando em 5 de 5".
 *  · `DNS_PROVIDER` — MEDIDO em 06/08: já estava PREENCHIDA no `.env` e nunca
 *    chegava ao container. O valor escolhido não valia nada.
 *
 * Nenhuma das duas dá erro. É por isso que a verificação tem de ser mecânica.
 */

/** Onde o código lê ambiente. `frontend/src` não lê: quem lê é o build. */
const ENV_READ_ROOTS = ["backend/src", "frontend/vite.config.ts"];

/**
 * Lidas de propósito FORA do container, e por isso ausentes do compose.
 *
 * Cada uma precisa de motivo porque a lista é a única coisa entre "decisão" e
 * "esquecimento" — e as duas se parecem exatamente igual no diff.
 */
const ENV_FORA_DO_COMPOSE: { nome: string; motivo: string }[] = [
  {
    nome: "REPO_ROOT",
    motivo:
      "só o gate a lê, e com default `/repo`, que é onde o repositório está montado. MEDIDO: o " +
      "processo do backend responde vazio para ela, e o gate roda verde — o default é o caminho real.",
  },
  {
    nome: "FAL_API_KEY",
    motivo:
      "PROIBIDA no compose, e não apenas dispensável. Ela existe para UMA invocação de " +
      "`seedFalKey.ts`, que lê a chave e a grava cifrada em `api_credentials` — o caminho por TENANT. " +
      "Declará-la em `environment:` deixaria a chave da fal de pé no processo do backend o tempo todo, " +
      "que é exatamente o estado que `checkFalClientPolicy` reprova (`a chave deixou de vir do tenant`) " +
      "e que custou um dia em 09/08. O script a recebe pelo `-e` de uma invocação e ela morre com o " +
      "processo.",
  },
  {
    nome: "ARNES_EM_CURSO",
    motivo:
      "injetada pelo RUNNER do arnês em cada `docker compose exec -e`, nunca pelo `environment:` do " +
      "serviço. Declará-la no compose seria pior que omiti-la: o valor ficaria de pé no processo do " +
      "backend em todo momento, e a conferência de cadastro de mutantes — que ela existe para PULAR " +
      "durante uma passada — ficaria desligada também no gate de árvore limpa, que é o único lugar " +
      "onde ela vale.",
  },
  {
    nome: "ARNES_CONFERE_REGISTRO",
    motivo:
      "declarada pelos dois mutantes de `checkMutantRegistryPolicy` para FORÇAR a conferência que o " +
      "arnês pula. Chega pelo `-e` que o runner monta a partir do campo `env` do mutante; fora dessa " +
      "aplicação ela não existe, e no compose ela não teria a quem servir.",
  },
  {
    nome: "VIDEO_APPROVAL_MAX_AGE_MS",
    motivo:
      "AUSÊNCIA DELIBERADA, e ela é diferente da de `VIDEO_RECOVERY_MAX_AGE_MS` — que está no compose " +
      "porque ajustar a janela de um trabalho EM VOO é operação de plantão. Esta não é: a janela de " +
      "24 h é um default derivado de um raciocínio de produto (nada está em voo, ninguém está " +
      "gastando, e o único relógio real é a validade NÃO VERIFICADA da URL em `v3b.fal.media`), e " +
      "encurtá-la joga fora composições já pagas. O caminho de mudá-la é discutir o número, não " +
      "exportar a variável. O `override` existe no código para o dia em que houver medição da " +
      "validade daquela URL, e é a guarda de aprovação que o exercita — ela lê `videoApprovalMaxAgeMs()` " +
      "em vez de digitar 24 h.",
  },
  {
    nome: "QUOTA_BASELINE_TENANT",
    motivo:
      "override de operador para os scripts de leitura de saldo (`quotaBaseline`, `probeLookEndpoints`), " +
      "com default `dev-c77a5b`. Não participa de nenhum caminho de produto.",
  },
];

async function checkEnvVarsReachContainer(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  let compose: string;
  try {
    compose = await readFile(path.join(repoRoot, "docker-compose.yml"), "utf-8");
  } catch {
    failures.push("ambiente: não consegui ler docker-compose.yml para conferir as variáveis repassadas.");
    return;
  }
  // Chaves de `environment:` de QUALQUER serviço: a pergunta é se a variável
  // chega a algum container, e `IMAGE_UPLOAD_MAX_BYTES` de propósito vai para
  // dois.
  const declaradas = new Set(
    [...compose.matchAll(/^ {6}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]),
  );

  const arquivos: string[] = [];
  for (const raiz of ENV_READ_ROOTS) {
    const abs = path.join(repoRoot, raiz);
    if (/\.tsx?$/.test(raiz)) arquivos.push(abs);
    else arquivos.push(...(await collectFilesWithExtensions(abs, new Set([".ts", ".tsx"]))));
  }

  // As quatro formas em que uma variável é lida neste repositório. Um nome que
  // só aparece dentro de comentário NÃO conta: `config.ts` explica o problema
  // do `??` com uma linha `process.env.X`, e contá-la faria a guarda pedir uma
  // variável chamada X.
  const FORMAS: RegExp[] = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']/g,
    /\b(?:required|optional|envNumber)\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
    /_ENV(?:[A-Z_]*)?\s*[:=]\s*["']([A-Z][A-Z0-9_]*)["']/g,
  ];

  const lidas = new Map<string, Set<string>>();
  for (const arquivo of arquivos) {
    let fonte: string;
    try {
      fonte = await readFile(arquivo, "utf-8");
    } catch {
      continue;
    }
    const rel = path.relative(repoRoot, arquivo).split(path.sep).join("/");
    for (const linha of semMutantes(fonte).split("\n")) {
      const t = linha.trim();
      if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) continue;
      for (const forma of FORMAS) {
        forma.lastIndex = 0;
        for (const m of linha.matchAll(forma)) {
          if (!lidas.has(m[1])) lidas.set(m[1], new Set());
          lidas.get(m[1])!.add(rel);
        }
      }
    }
  }

  // O objeto `LOGIN_RATE_LIMIT_ENV` guarda DOIS nomes em campos minúsculos, e
  // a forma `_ENV = "..."` só pega o de atribuição direta. Sem isto a guarda
  // não enxergaria as duas variáveis do limiter de login.
  for (const arquivo of arquivos) {
    let fonte: string;
    try {
      fonte = await readFile(arquivo, "utf-8");
    } catch {
      continue;
    }
    const rel = path.relative(repoRoot, arquivo).split(path.sep).join("/");
    for (const bloco of semMutantes(fonte).matchAll(/_ENV\s*=\s*\{([^}]*)\}/g)) {
      for (const m of bloco[1].matchAll(/["']([A-Z][A-Z0-9_]{3,})["']/g)) {
        if (!lidas.has(m[1])) lidas.set(m[1], new Set());
        lidas.get(m[1])!.add(rel);
      }
    }
  }

  const excecoes = new Map(ENV_FORA_DO_COMPOSE.map((e) => [e.nome, e.motivo]));
  const usadas = new Set<string>();

  for (const [nome, onde] of [...lidas].sort()) {
    if (declaradas.has(nome)) continue;
    if (excecoes.has(nome)) {
      usadas.add(nome);
      continue;
    }
    failures.push(
      `ambiente: \`${nome}\` é lida pelo código (${[...onde].join(", ")}) e NÃO é repassada em ` +
        "docker-compose.yml. Compose não exporta o `.env` inteiro: repassa o que está listado em " +
        "`environment:`. Preencher esta variável no `.env` não teria efeito nenhum — o valor é lido " +
        "pelo `docker compose config`, descartado na fronteira do container, e o processo cai no " +
        "default sem dizer que caiu. Já aconteceu duas vezes aqui, com " +
        "`DAILY_PAID_GENERATION_LIMIT` e com `DNS_PROVIDER`, e nenhuma das duas deu erro. " +
        "Se a ausência for deliberada, declare-a em ENV_FORA_DO_COMPOSE com o motivo.",
    );
  }

  for (const e of ENV_FORA_DO_COMPOSE) {
    if (declaradas.has(e.nome)) {
      failures.push(
        `ambiente: \`${e.nome}\` está declarada como ausência deliberada e ESTÁ no compose. ` +
          "Uma exceção que não é mais exceção ensina a ignorar a lista.",
      );
    } else if (!usadas.has(e.nome)) {
      failures.push(
        `ambiente: \`${e.nome}\` está na lista de ausências deliberadas e não é lida por ninguém. ` +
          "Ou a leitura sumiu e a entrada tem de sair, ou ela mudou de forma e a varredura deixou de " +
          "enxergá-la — as duas exigem olhar.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      `  ambiente: ${lidas.size} variável(is) lida(s) pelo código, todas repassadas ao container — ` +
        `exceto ${ENV_FORA_DO_COMPOSE.length} ausência(s) declarada(s) com motivo`,
    );
  }
}

/**
 * Tira o bloco `MUTANTS` antes de varrer.
 *
 * As guardas declaram mutantes que, por construção, contêm o defeito — e um
 * deles renomeia uma variável de ambiente de propósito. Sem esta poda, a
 * varredura acusava `ELEVENLABS_TTS_MODEL_V2` como variável ausente do compose:
 * a guarda reprovando por causa do texto escrito para exercitá-la. É a mesma
 * armadilha que a guarda de feature flags já resolveu pulando os arquivos de
 * guarda inteiros; aqui a poda é mais estreita de propósito, porque `REPO_ROOT`
 * só é lida dentro de scripts de guarda e excluí-los cegaria a exceção que a
 * declara.
 *
 * O bloco é reconhecido pela abertura e pelo `];` na coluna zero — a mesma
 * leitura grosseira que o resto deste arquivo faz com o compose, e pelo mesmo
 * motivo: se o formato mudar, isto falha barulhento em vez de passar calado.
 */
function semMutantes(fonte: string): string {
  return fonte.replace(/export const MUTANTS: Mutant\[\] = \[[\s\S]*?\n\];/, "");
}

/** Varredura recursiva por extensão, sem as exclusões da busca de credencial. */
async function collectFilesWithExtensions(dir: string, exts: Set<string>): Promise<string[]> {
  const saida: string[] = [];
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return saida;
  }
  for (const e of entradas) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...(await collectFilesWithExtensions(p, exts)));
    else if (exts.has(path.extname(e.name))) saida.push(p);
  }
  return saida;
}
