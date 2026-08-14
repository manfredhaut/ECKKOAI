/**
 * Domínio único (14/08/2026): subdomínio por tenant foi CANCELADO como
 * decisão de produto — MEDIDO por SSH que eckkoai.com/subscription já
 * carrega o painel completo, sem subdomínio nenhum, e que o único defeito
 * era o frontend redirecionar para `${slug}.${BASE_DOMAIN}` depois de
 * login/signup, um host sem DNS (NXDOMAIN garantido).
 *
 * Esta guarda prova, por texto, que os cinco pontos que causavam ou
 * mascaravam esse defeito continuam corrigidos:
 *
 *  1. nenhum arquivo de autenticação do frontend volta a montar um redirect
 *     cruzando para `${algo}.${BASE_DOMAIN}`;
 *  2. "/" decide landing-vs-painel pela SESSÃO (App.tsx), não mais pelo
 *     hostname — sem isto, um tenant logado via eckkoai.com/ cai na landing
 *     para sempre, porque a rota estática "/" sempre vence o catch-all;
 *  3. POST /auth/signup rejeita e-mail que já existe em QUALQUER tenant,
 *     tanto pela checagem otimista quanto pela corrida (23505 do Postgres);
 *  4. a resposta de signup não promete mais um `host` de subdomínio;
 *  5. a migration que torna e-mail único globalmente existe e ABORTA diante
 *     de duplicata, em vez de apagar ou escolher uma linha sozinha.
 *
 * O QUE ESTA GUARDA NÃO FAZ, de propósito: não sobe o frontend nem o
 * backend, não abre browser, não roda a migration contra um banco real.
 * Prova a FORMA do código-fonte; a Prioridade 3 (slug no path, tenant
 * pendente/aprovação) fica de fora — não foi pedida nesta rodada.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface SingleDomainCheckResult {
  failures: string[];
  notes: string[];
}

const AUTH_TS = "backend/src/routes/auth.ts";
const SUBSCRIPTION_TS = "backend/src/routes/subscription.ts";
const APP_TSX = "frontend/src/App.tsx";
const MIGRATION_053 = "backend/src/db/migrations/053_users_email_unique.sql";
// Todo arquivo do frontend que já teve, ou poderia voltar a ter, um redirect
// para o subdomínio do tenant. EntryPanel.tsx entra porque foi de lá que o
// bug alcançava um visitante ANÔNIMO na landing, antes mesmo de logar.
const FRONTEND_AUTH_FILES = [
  "frontend/src/pages/Login/LoginPage.tsx",
  "frontend/src/pages/Signup/SignupPage.tsx",
  "frontend/src/pages/Landing/LandingPage.tsx",
  "frontend/src/pages/Landing/EntryPanel.tsx",
];

export const MUTANTS: Mutant[] = [
  {
    guard: "domínio único: signup rejeita e-mail duplicado",
    name: "checagem otimista removida",
    kind: "obvio",
    file: AUTH_TS,
    find: `    if (existingRows.length > 0) {
      return reply.code(409).send({ error: "email_in_use", message: "Email already in use" });
    }

`,
    replace: "",
    expect: "não rejeita e-mail já existente antes de criar o tenant",
  },
  {
    guard: "domínio único: signup rejeita e-mail duplicado",
    name: "condição invertida (=== 0 em vez de > 0)",
    kind: "esperto",
    // A chamada continua lá, a resposta 409 continua lá — só a condição
    // muda de sentido. Um mutante que apagasse a linha inteira seria pego
    // por qualquer coisa; este é o que pegaria uma guarda que só confere
    // "existe uma checagem", sem checar que ela barra o caso certo.
    file: AUTH_TS,
    find: `    if (existingRows.length > 0) {`,
    replace: `    if (existingRows.length === 0) {`,
    expect: "não rejeita e-mail já existente antes de criar o tenant",
  },
  {
    guard: "domínio único: signup fecha a corrida sob concorrência",
    name: "catch de 23505 removido",
    kind: "obvio",
    file: AUTH_TS,
    find: `      if (err && typeof err === "object" && "code" in err && err.code === POSTGRES_UNIQUE_VIOLATION) {
        return reply.code(409).send({ error: "email_in_use", message: "Email already in use" });
      }
      throw err;`,
    replace: `      throw err;`,
    expect: "não trata a violação de UNIQUE (23505) no catch da transação de signup",
  },
  {
    guard: "domínio único: resposta de signup não promete subdomínio",
    name: "campo host volta à resposta",
    kind: "obvio",
    file: AUTH_TS,
    find: `      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    });`,
    replace: `      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, host: \`\${tenant.slug}.eckkoai.com\` },
    });`,
    expect: 'volta a devolver um campo "host" de subdomínio na resposta de signup',
  },
  {
    guard: "domínio único: '/' decide pela sessão, não pelo hostname",
    name: "showLanding volta a ser incondicional",
    kind: "obvio",
    // Reproduz o defeito 1.3 exato: um tenant logado em eckkoai.com/ cairia
    // na landing para sempre, porque a rota estática "/" sempre vence o
    // catch-all "/*" do painel protegido — não importa a ordem de
    // declaração das rotas.
    file: APP_TSX,
    find: `  const showLanding = !user;`,
    replace: `  const showLanding = true;`,
    expect: "a decisão de mostrar a landing em vez do painel",
  },
  {
    guard: "domínio único: subscription.ts respeita o protocolo real",
    name: "origin volta a ser http:// fixo",
    kind: "obvio",
    file: SUBSCRIPTION_TS,
    find: `function requestOrigin(req: FastifyRequest): string {
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || "http";
  return \`\${proto}://\${req.headers.host}\`;
}`,
    replace: `function requestOrigin(req: FastifyRequest): string {
  void req;
  return "";
}`,
    expect: "não lê x-forwarded-proto para montar a origem",
  },
  {
    guard: "domínio único: migration 053 aborta diante de e-mail duplicado",
    name: "RAISE EXCEPTION removido do bloco de checagem",
    kind: "obvio",
    file: MIGRATION_053,
    find: `  IF dup_count > 0 THEN
    RAISE EXCEPTION 'migration 053: % e-mail(s) duplicado(s) entre tenants em users — UNIQUE (email) não aplicada. Resolva as duplicatas manualmente (SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1) e rode a migration de novo. Esta migration NUNCA apaga ou altera linha nenhuma sozinha.', dup_count;
  END IF;
`,
    replace: "",
    expect: "não aborta diante de e-mail duplicado",
  },
];

async function readRepoFile(repoRoot: string, rel: string): Promise<string | null> {
  try {
    return await readFile(path.join(repoRoot, rel), "utf-8");
  } catch {
    return null;
  }
}

export async function checkSingleDomainPolicy(repoRoot: string): Promise<SingleDomainCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- 1. nenhum redirect de auth cruza para um subdomínio de tenant ------
  //
  // O padrão `.${BASE_DOMAIN}` (ou o literal já resolvido, ex.: ".eckkoai.com"
  // dentro de um template de host) é a assinatura do defeito: um browser
  // navegando para um host que o BASE_DOMAIN de produção não publica em DNS
  // nenhum. Testa o literal do template, não o valor resolvido — o mesmo
  // código roda em qualquer BASE_DOMAIN.
  let arquivosVarridos = 0;
  for (const rel of FRONTEND_AUTH_FILES) {
    const src = await readRepoFile(repoRoot, rel);
    if (src === null) {
      failures.push(`domínio único: não consegui ler ${rel} para conferir redirect de subdomínio.`);
      continue;
    }
    arquivosVarridos += 1;
    if (/\$\{[^}]*\}\.\$\{?BASE_DOMAIN/.test(src) || /\.\$\{[a-zA-Z]*BASE_DOMAIN/.test(src)) {
      failures.push(
        `domínio único: ${rel} monta um host de subdomínio de tenant (padrão "\${...}.\${BASE_DOMAIN}"). ` +
          "Subdomínio por tenant foi cancelado — um host desses não tem DNS em produção (NXDOMAIN).",
      );
    }
  }
  notes.push(`domínio único: ${arquivosVarridos} arquivo(s) de auth do frontend sem redirect de subdomínio`);

  // --- 2. "/" decide pela sessão -------------------------------------------
  const appSrc = await readRepoFile(repoRoot, APP_TSX);
  if (appSrc === null) {
    failures.push(`domínio único: não consegui ler ${APP_TSX}.`);
  } else {
    if (/isRootDomain\s*\(/.test(appSrc)) {
      failures.push(
        `domínio único: ${APP_TSX} ainda chama isRootDomain() — "/" decidiria landing-vs-painel pelo ` +
          "hostname, que em produção é sempre o mesmo agora (domínio único), travando qualquer tenant " +
          "logado na landing.",
      );
    }
    if (!/const showLanding = !user;/.test(appSrc)) {
      failures.push(
        `domínio único: ${APP_TSX} não tem "const showLanding = !user;" — a decisão de mostrar a ` +
          "landing em vez do painel em \"/\" precisa vir da sessão (useAuth()), não de outra fonte.",
      );
    }
  }

  // --- 3. signup rejeita e-mail duplicado (otimista + corrida) ------------
  const authSrc = await readRepoFile(repoRoot, AUTH_TS);
  if (authSrc === null) {
    failures.push(`domínio único: não consegui ler ${AUTH_TS}.`);
  } else {
    if (!/if \(existingRows\.length > 0\) \{/.test(authSrc)) {
      failures.push(
        `domínio único: ${AUTH_TS} não rejeita e-mail já existente antes de criar o tenant — dois ` +
          "signups com o mesmo e-mail voltam a criar dois tenants (o defeito medido: manfredhaut-5, " +
          "manfredhaut-6, manfred-3).",
      );
    }
    if (!/err\.code === POSTGRES_UNIQUE_VIOLATION/.test(authSrc)) {
      failures.push(
        `domínio único: ${AUTH_TS} não trata a violação de UNIQUE (23505) no catch da transação de ` +
          "signup — duas tentativas concorrentes com o mesmo e-mail vazariam um 500 genérico em vez de " +
          "409 claro.",
      );
    }
    if (/host: `\$\{tenant\.slug\}/.test(authSrc)) {
      failures.push(
        `domínio único: ${AUTH_TS} volta a devolver um campo "host" de subdomínio na resposta de ` +
          "signup — não existe mais subdomínio de tenant para montar.",
      );
    }
  }

  // --- 4. subscription.ts respeita o protocolo real -----------------------
  const subSrc = await readRepoFile(repoRoot, SUBSCRIPTION_TS);
  if (subSrc === null) {
    failures.push(`domínio único: não consegui ler ${SUBSCRIPTION_TS}.`);
  } else {
    if (/`http:\/\/\$\{req\.headers\.host\}`/.test(subSrc)) {
      failures.push(
        `domínio único: ${SUBSCRIPTION_TS} monta a origem do Stripe Checkout com "http://" fixo — ` +
          "produção é HTTPS (Traefik termina o TLS), e o success_url/cancel_url saía errado mesmo atrás " +
          "de certificado real.",
      );
    }
    if (!/x-forwarded-proto/.test(subSrc)) {
      failures.push(
        `domínio único: ${SUBSCRIPTION_TS} não lê x-forwarded-proto para montar a origem — sem ` +
          "trustProxy no Fastify, é o único jeito de saber se a requisição chegou por HTTPS.",
      );
    }
  }

  // --- 5. migration 053 aborta diante de duplicata, nunca corrige sozinha -
  const migrationSrc = await readRepoFile(repoRoot, MIGRATION_053);
  if (migrationSrc === null) {
    failures.push(
      `domínio único: ${MIGRATION_053} não existe — e-mail continua único só por tenant ` +
        "(UNIQUE (tenant_id, email), migration 004), que é a ambiguidade que /login explora quando " +
        "não há subdomínio.",
    );
  } else {
    if (!/RAISE EXCEPTION/.test(migrationSrc)) {
      failures.push(
        `domínio único: ${MIGRATION_053} não aborta diante de e-mail duplicado — aplicaria UNIQUE ` +
          "(email) sobre um banco com duplicatas sem decisão humana nenhuma sobre qual conta manter.",
      );
    }
    if (!/ADD CONSTRAINT users_email_unique UNIQUE \(email\)/.test(migrationSrc)) {
      failures.push(`domínio único: ${MIGRATION_053} não adiciona UNIQUE (email) em users.`);
    }
    if (/DELETE FROM users|DELETE FROM tenants/.test(migrationSrc)) {
      failures.push(
        `domínio único: ${MIGRATION_053} contém um DELETE — esta migration nunca pode apagar linha ` +
          "nenhuma sozinha; duplicata é decisão humana.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "domínio único: signup rejeita e-mail duplicado (otimista + corrida), '/' decide pela sessão, " +
        "nenhum redirect de subdomínio, origem do Stripe respeita HTTPS, migration 053 aborta em duplicata",
    );
  }

  return { failures, notes };
}
