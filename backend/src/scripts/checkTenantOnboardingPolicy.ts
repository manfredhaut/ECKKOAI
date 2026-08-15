/**
 * Prioridade 3 + perfil do tenant (15/08/2026): slugs reservados, tenant
 * nasce pendente e só ganha sessão depois de aprovado, slug recalcula
 * exatamente uma vez (no primeiro save do perfil) e trava, WhatsApp é
 * obrigatório nessa rota, e a URL (`/:slug/...`) sempre corrige sozinha
 * quando não bate com a sessão.
 *
 * MEDIDO no navegador nesta rodada (não só lido): signup → tela de espera
 * sem sessão; login de tenant pendente → 403 com mensagem, sem sessão;
 * aprovação no painel admin → o mesmo tenant loga e cai em `/:slug`;
 * primeiro save do perfil com "Ecko Comércio & Serviços LTDA" → slug
 * "ecko-com-rcio-servi-os-ltda", trava, e a tela mostra a URL; navegar para
 * a URL antiga depois disso redireciona para a nova. `admin@…` → "admin-3"
 * (pulou "admin", reservado, e "admin-2", já existente); `login@…` →
 * "login-2" (só o reservado, sem colisão de dados). Esta guarda prova a
 * FORMA do código-fonte que sustenta esse comportamento; não substitui a
 * medição, é o que garante que ela continue valendo depois da próxima
 * edição.
 *
 * REGRA SEGUIDA AQUI, na marra, depois de errar uma vez na rodada anterior
 * (checkSingleDomainPolicy.ts): todo `expect` de mutante é um RECORTE
 * LITERAL da mensagem que o failure() correspondente imprime — nunca uma
 * paráfrase. Verificado à mão, mensagem por mensagem, antes de declarar
 * pronto.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface TenantOnboardingCheckResult {
  failures: string[];
  notes: string[];
}

const SLUG_TS = "backend/src/services/slug.ts";
const AUTH_TS = "backend/src/routes/auth.ts";
const LOGIN_TS = "backend/src/routes/login.ts";
const SUBSCRIPTION_TS = "backend/src/routes/subscription.ts";
const APP_TSX = "frontend/src/App.tsx";
const MIGRATION_054 = "backend/src/db/migrations/054_tenant_profile_fields.sql";
const MIGRATION_055 = "backend/src/db/migrations/055_tenant_pending_approval.sql";

export const MUTANTS: Mutant[] = [
  {
    guard: "slug: reservados barram tanto no signup quanto no primeiro save",
    name: "checagem de RESERVED_SLUGS removida do laço",
    kind: "obvio",
    file: SLUG_TS,
    find: `  while (RESERVED_SLUGS.includes(candidate) || (await slugExists(candidate, excludeTenantId))) {`,
    replace: `  while (await slugExists(candidate, excludeTenantId)) {`,
    expect: "não verifica RESERVED_SLUGS no laço de geração",
  },
  {
    guard: "signup: tenant nasce pendente, nunca ativo",
    name: "status volta a ser 'active' no INSERT",
    kind: "esperto",
    // A transação inteira continua igual — só o status muda. É o mutante
    // que pegaria alguém "otimizando" o INSERT sem perceber que o valor
    // literal É a trava de aprovação.
    file: AUTH_TS,
    find: `VALUES ($1, $2, 'pending', $3, $4) RETURNING *\`,`,
    replace: `VALUES ($1, $2, 'active', $3, $4) RETURNING *\`,`,
    expect: "não cria o tenant com status 'pending' no signup",
  },
  {
    guard: "signup: nenhuma sessão é aberta antes da aprovação",
    name: "req.session volta a ser setado no signup",
    kind: "obvio",
    file: AUTH_TS,
    find: `    // NENHUMA sessão é aberta aqui — tenant nasceu 'pending' (migration
    // 055). req.session.userId/tenantId ficam intocados de propósito:`,
    replace: `    req.session.userId = user.id;
    req.session.tenantId = tenant.id;
    // NENHUMA sessão é aberta aqui — tenant nasceu 'pending' (migration
    // 055). req.session.userId/tenantId ficam intocados de propósito:`,
    expect: "abre sessão dentro do handler de /auth/signup",
  },
  {
    guard: "login: tenant pendente não recebe sessão (POST /login)",
    name: "checagem de status pendente removida",
    kind: "obvio",
    file: LOGIN_TS,
    find: `      if (tenantRows[0]?.status === "pending") {
        return reply.code(403).send(TENANT_PENDING);
      }

      req.session.userId = user.id;`,
    replace: `      req.session.userId = user.id;`,
    expect: "não verifica tenant pendente antes de abrir sessão",
  },
  {
    guard: "subscription: WhatsApp é obrigatório no primeiro perfil",
    name: "checagem de whatsapp ausente removida",
    kind: "obvio",
    file: SUBSCRIPTION_TS,
    find: `    if (!whatsapp) return reply.code(400).send({ error: "WhatsApp is required" });`,
    replace: ``,
    expect: "não exige WhatsApp em PUT /subscription/profile",
  },
  {
    guard: "subscription: slug só recalcula enquanto não travado",
    name: "slug_locked deixa de proteger o recálculo",
    kind: "esperto",
    // A chamada a generateUniqueSlugFromName continua lá, o UPDATE continua
    // gravando slug_locked=true — só o INTERRUPTOR que decide SE isso roda
    // desaparece, e o slug voltaria a mudar a cada save, quebrando qualquer
    // link/QR code já divulgado.
    file: SUBSCRIPTION_TS,
    find: `    if (!tenant.slug_locked) {`,
    replace: `    if (true) {`,
    expect: "não protege o recálculo de slug com slug_locked",
  },
  {
    guard: "migration 054: tenants existentes nascem com o slug travado",
    name: "UPDATE de proteção retroativa removido",
    kind: "obvio",
    file: MIGRATION_054,
    find: `UPDATE tenants SET slug_locked = true;`,
    replace: ``,
    expect: "não trava o slug dos tenants já existentes",
  },
  {
    guard: "migration 055: 'pending' é um status válido para tenants",
    name: "'pending' removido do CHECK",
    kind: "obvio",
    file: MIGRATION_055,
    find: `CHECK (status IN ('active', 'suspended', 'pending'));`,
    replace: `CHECK (status IN ('active', 'suspended'));`,
    expect: "não amplia o CHECK de tenants.status para incluir 'pending'",
  },
  {
    guard: "frontend: URL de tenant errada se autocorrige",
    name: "redirect de slug incompatível removido",
    kind: "obvio",
    file: APP_TSX,
    find: `  if (!tenant) return null;
  if (slug !== tenant.slug) {
    const suffix = rest ? \`/\${rest}\` : "";
    return <Navigate to={\`/\${tenant.slug}\${suffix}\${location.search}\${location.hash}\`} replace />;
  }
  return <>{children}</>;`,
    replace: `  if (!tenant) return null;
  return <>{children}</>;`,
    expect: "(TenantSlugGate) não compara o slug da URL com o da sessão",
  },
];

async function readRepoFile(repoRoot: string, rel: string): Promise<string | null> {
  try {
    return await readFile(path.join(repoRoot, rel), "utf-8");
  } catch {
    return null;
  }
}

export async function checkTenantOnboardingPolicy(repoRoot: string): Promise<TenantOnboardingCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- 1. slugs reservados -------------------------------------------------
  const slugSrc = await readRepoFile(repoRoot, SLUG_TS);
  if (slugSrc === null) {
    failures.push(`onboarding: não consegui ler ${SLUG_TS}.`);
  } else {
    if (!/RESERVED_SLUGS\.includes\(candidate\)/.test(slugSrc)) {
      failures.push(
        `onboarding: ${SLUG_TS} não verifica RESERVED_SLUGS no laço de geração — um tenant como ` +
          '"login" ou "admin" ficaria inalcançável para sempre (a rota estática sempre vence a ' +
          "dinâmica /:slug/*).",
      );
    }
    if (!/export async function generateUniqueSlugFromName/.test(slugSrc)) {
      failures.push(
        `onboarding: ${SLUG_TS} não exporta generateUniqueSlugFromName (usado no primeiro save do perfil).`,
      );
    }
  }

  // --- 2. signup: status pendente, sem sessão -------------------------------
  //
  // Recorte SÓ o handler de /auth/signup, não o arquivo inteiro: /auth/login
  // (handler vizinho, no mesmo arquivo) seta req.session.userId de propósito
  // — testar a string no arquivo inteiro acusaria uma rota que está certa.
  const authSrc = await readRepoFile(repoRoot, AUTH_TS);
  if (authSrc === null) {
    failures.push(`onboarding: não consegui ler ${AUTH_TS}.`);
  } else {
    const signupStart = authSrc.indexOf('"/auth/signup"');
    const signupEnd = authSrc.indexOf('app.post("/auth/logout"');
    const signupBlock = signupStart >= 0 && signupEnd > signupStart ? authSrc.slice(signupStart, signupEnd) : null;
    if (signupBlock === null) {
      failures.push(`onboarding: não encontrei o handler de /auth/signup em ${AUTH_TS} para conferir.`);
    } else {
      if (!/VALUES \(\$1, \$2, 'pending'/.test(signupBlock)) {
        failures.push(`onboarding: ${AUTH_TS} não cria o tenant com status 'pending' no signup.`);
      }
      if (/req\.session\.userId = user\.id;/.test(signupBlock)) {
        failures.push(
          `onboarding: ${AUTH_TS} abre sessão dentro do handler de /auth/signup — um tenant recém-` +
            "criado (ainda pendente de aprovação) sairia logado, driblando o painel admin.",
        );
      }
    }
  }

  // --- 3. login: pendente não recebe sessão --------------------------------
  const loginSrc = await readRepoFile(repoRoot, LOGIN_TS);
  if (loginSrc === null) {
    failures.push(`onboarding: não consegui ler ${LOGIN_TS}.`);
  } else if (!/status === "pending"/.test(loginSrc)) {
    failures.push(
      `onboarding: ${LOGIN_TS} não verifica tenant pendente antes de abrir sessão — a senha certa ` +
        "bastaria para logar num tenant que o painel admin ainda não aprovou.",
    );
  }

  // --- 4. subscription: WhatsApp obrigatório, slug trava ------------------
  const subSrc = await readRepoFile(repoRoot, SUBSCRIPTION_TS);
  if (subSrc === null) {
    failures.push(`onboarding: não consegui ler ${SUBSCRIPTION_TS}.`);
  } else {
    if (!/if \(!whatsapp\) return reply\.code\(400\)/.test(subSrc)) {
      failures.push(`onboarding: ${SUBSCRIPTION_TS} não exige WhatsApp em PUT /subscription/profile.`);
    }
    if (!/if \(!tenant\.slug_locked\) \{/.test(subSrc)) {
      failures.push(
        `onboarding: ${SUBSCRIPTION_TS} não protege o recálculo de slug com slug_locked — o endereço ` +
          "de um tenant já divulgado poderia mudar a qualquer edição de nome.",
      );
    }
  }

  // --- 5. migrations --------------------------------------------------------
  const mig054 = await readRepoFile(repoRoot, MIGRATION_054);
  if (mig054 === null) {
    failures.push(`onboarding: ${MIGRATION_054} não existe.`);
  } else if (!/UPDATE tenants SET slug_locked = true;/.test(mig054)) {
    failures.push(
      `onboarding: ${MIGRATION_054} não trava o slug dos tenants já existentes — o próximo save de ` +
        "perfil de uma conta antiga recalcularia (e trocaria) um endereço já divulgado.",
    );
  }

  const mig055 = await readRepoFile(repoRoot, MIGRATION_055);
  if (mig055 === null) {
    failures.push(`onboarding: ${MIGRATION_055} não existe.`);
  } else if (!/CHECK \(status IN \('active', 'suspended', 'pending'\)\);/.test(mig055)) {
    failures.push(
      `onboarding: ${MIGRATION_055} não amplia o CHECK de tenants.status para incluir 'pending'.`,
    );
  }

  // --- 6. frontend: autocorreção de URL ------------------------------------
  const appSrc = await readRepoFile(repoRoot, APP_TSX);
  if (appSrc === null) {
    failures.push(`onboarding: não consegui ler ${APP_TSX}.`);
  } else if (!/if \(slug !== tenant\.slug\) \{/.test(appSrc)) {
    failures.push(
      `onboarding: ${APP_TSX} (TenantSlugGate) não compara o slug da URL com o da sessão — um link ` +
        "para o slug antigo de um tenant (recalculado no primeiro save) não se corrigiria sozinho.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "onboarding: slugs reservados barrados nos dois geradores, tenant nasce pendente sem sessão, " +
        "login barra pendente, WhatsApp obrigatório, slug trava após o primeiro save, migrations " +
        "054/055 protegem tenants existentes e habilitam 'pending', URL de tenant se autocorrige",
    );
  }

  return { failures, notes };
}
