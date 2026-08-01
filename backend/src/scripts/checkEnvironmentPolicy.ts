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
