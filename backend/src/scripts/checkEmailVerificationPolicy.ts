/**
 * Confirmação por e-mail (15/08/2026): o portão principal para 'active' deixa
 * de ser só o clique do admin e passa a ser o link de verificação — a
 * aprovação manual não sai, vira exceção (e-mail que falhou, cliente que não
 * recebeu). RESEND_API_KEY obrigatória em QUALQUER ambiente (mesmo padrão de
 * DATABASE_URL/ENCRYPTION_KEY/SESSION_SECRET, não do BASE_DOMAIN do
 * frontend, que só exige em produção) — e-mail de verificação não tem custo
 * variável e roda mesmo em PROVIDER_MODE=fixture, de propósito.
 *
 * REGRA SEGUIDA À RISCA (documentada em checkTenantOnboardingPolicy.ts, e
 * quebrada duas vezes antes disso): todo `expect` abaixo é um recorte
 * LITERAL da mensagem que o failure() correspondente imprime.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface EmailVerificationCheckResult {
  failures: string[];
  notes: string[];
}

const MIGRATION_056 = "backend/src/db/migrations/056_email_verification.sql";
const CONFIG_TS = "backend/src/config.ts";
const EMAIL_PROVIDER_TS = "backend/src/services/providers/emailProvider.ts";
const AUTH_TS = "backend/src/routes/auth.ts";
const EMAIL_VERIFICATION_ROUTES_TS = "backend/src/routes/emailVerification.ts";
const ADMIN_PANEL_TS = "backend/src/routes/adminPanel.ts";
const SLUG_TS = "backend/src/services/slug.ts";
const ENDPOINT_CATALOG_TS = "backend/src/services/providers/endpointCatalog.ts";
const EGRESS_POLICY_TS = "backend/src/scripts/checkNetworkEgressPolicy.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "config: RESEND_API_KEY é obrigatória em qualquer ambiente",
    name: "vira optional() em vez de required()",
    kind: "obvio",
    file: CONFIG_TS,
    find: `  resendApiKey: required("RESEND_API_KEY"),`,
    replace: `  resendApiKey: optional("RESEND_API_KEY"),`,
    expect: "não exige RESEND_API_KEY incondicionalmente",
  },
  {
    guard: "email: envio de verificação roda em qualquer PROVIDER_MODE",
    name: "isFixtureMode() volta a ser importado no cliente de e-mail",
    kind: "obvio",
    // O mutante mais perigoso desta rodada: reintroduz exatamente o
    // acoplamento que o produto não pode ter. Sem RESEND_API_KEY sendo o
    // único interruptor, sobra o padrão que TODO outro fornecedor segue —
    // e este e-mail especificamente precisa ser a exceção.
    //
    // Só o IMPORT, de propósito, sem chamar a função no corpo: acrescentar
    // a CHAMADA também exigiria mudar duas regiões distantes do arquivo no
    // mesmo mutante (import no topo, corpo da função ~60 linhas abaixo), e
    // um `find` que abrange tudo isso é frágil a qualquer edição no meio.
    // O import sozinho já é prova suficiente para o texto que esta guarda
    // varre (`/isFixtureMode/.test(...)`, sem exigir uso) — e não quebra a
    // compilação (tsconfig deste projeto não liga noUnusedLocals). MEDIDO:
    // a primeira versão deste mutante ACRESCENTAVA a chamada sem o import
    // e quebrava o `tsc` antes de checkPolicy.ts sequer rodar — o arnês
    // real teria classificado isso como AMBÍGUO, não reprovado pela guarda.
    file: EMAIL_PROVIDER_TS,
    find: `import { vendorSignal } from "./vendorTimeout.js";`,
    replace: `import { vendorSignal } from "./vendorTimeout.js";
import { isFixtureMode } from "./providerMode.js";`,
    expect: "consulta isFixtureMode()",
  },
  {
    guard: "signup: token de verificação nasce junto com o tenant",
    name: "colunas de token somem do INSERT",
    kind: "obvio",
    file: AUTH_TS,
    find: `        \`INSERT INTO tenants (name, slug, status, email_verification_token, email_verification_expires_at)
         VALUES ($1, $2, 'pending', $3, $4) RETURNING *\`,
        [slug, slug, verificationToken, verificationExpiresAt],`,
    replace: `        "INSERT INTO tenants (name, slug, status) VALUES ($1, $2, 'pending') RETURNING *",
        [slug, slug],`,
    expect: "não grava email_verification_token no INSERT do signup",
  },
  {
    guard: "signup: falha de envio de e-mail não derruba o cadastro",
    name: "try/catch do envio removido",
    kind: "esperto",
    // O cadastro já foi commitado ANTES desta chamada — deixar o erro
    // escapar não desfaz o tenant, só faz a resposta 201 virar 500, com o
    // cliente pensando que a conta não foi criada quando ela FOI.
    file: AUTH_TS,
    find: `    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (err) {
      req.log.error({ err, tenantId: tenant.id }, "falha ao enviar e-mail de verificação no signup");
    }`,
    replace: `    await sendVerificationEmail(email, verificationToken);`,
    expect: "envio de e-mail no signup não está em try/catch",
  },
  {
    guard: "verify-email: token errado ou vencido nunca ativa o tenant",
    name: "checagem de expiração removida",
    kind: "esperto",
    // O SELECT pelo token continua ali — só a comparação de data some, e um
    // token de 6 meses atrás voltaria a ativar a conta.
    file: EMAIL_VERIFICATION_ROUTES_TS,
    find: `    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ success: false, reason: "expired" });
    }`,
    replace: ``,
    expect: "GET /verify-email não confere a expiração do token",
  },
  {
    guard: "resend-verification: limitado por taxa, como o login",
    name: "checagem de rate limit removida",
    kind: "obvio",
    file: EMAIL_VERIFICATION_ROUTES_TS,
    find: `    if (isResendRateLimited(req.ip)) {
      return reply
        .code(429)
        .send({ error: "rate_limited", message: "Too many resend attempts, try again later." });
    }

`,
    replace: ``,
    expect: "POST /resend-verification não está limitado por taxa",
  },
  {
    guard: "admin: aprovar manualmente limpa o token de verificação",
    name: "UPDATE volta a não tocar as colunas de token",
    kind: "esperto",
    file: ADMIN_PANEL_TS,
    find: `      if (status === "active") {
        await pool.query(
          "UPDATE tenants SET status = $1, email_verification_token = NULL, email_verification_expires_at = NULL WHERE id = $2",
          [status, tenantId],
        );
      } else {
        await pool.query("UPDATE tenants SET status = $1 WHERE id = $2", [status, tenantId]);
      }`,
    replace: `      await pool.query("UPDATE tenants SET status = $1 WHERE id = $2", [status, tenantId]);`,
    expect: "não limpa o token de verificação — um link de e-mail antigo continuaria válido",
  },
  {
    guard: "slug: /verify-email e /resend-verification são reservados",
    name: "os dois nomes somem de RESERVED_SLUGS",
    kind: "obvio",
    file: SLUG_TS,
    find: `  "verify-email",
  "resend-verification",
];`,
    replace: `];`,
    expect: "verify-email\" ou \"resend-verification\" não está em RESERVED_SLUGS",
  },
];

async function readRepoFile(repoRoot: string, rel: string): Promise<string | null> {
  try {
    return await readFile(path.join(repoRoot, rel), "utf-8");
  } catch {
    return null;
  }
}

export async function checkEmailVerificationPolicy(repoRoot: string): Promise<EmailVerificationCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- 1. migration 056 ------------------------------------------------
  const mig056 = await readRepoFile(repoRoot, MIGRATION_056);
  if (mig056 === null) {
    failures.push(`email: ${MIGRATION_056} não existe.`);
  } else {
    if (!/ADD COLUMN email_verification_token text;/.test(mig056)) {
      failures.push(`email: ${MIGRATION_056} não adiciona email_verification_token.`);
    }
    if (!/ADD COLUMN email_verification_expires_at timestamptz;/.test(mig056)) {
      failures.push(`email: ${MIGRATION_056} não adiciona email_verification_expires_at.`);
    }
  }

  // --- 2. RESEND_API_KEY obrigatória, sem condição de ambiente ----------
  const configSrc = await readRepoFile(repoRoot, CONFIG_TS);
  if (configSrc === null) {
    failures.push(`email: não consegui ler ${CONFIG_TS}.`);
  } else if (!/resendApiKey: required\("RESEND_API_KEY"\)/.test(configSrc)) {
    failures.push(
      `email: ${CONFIG_TS} não exige RESEND_API_KEY incondicionalmente — o boot poderia seguir sem ` +
        "ela, e o produto ficaria sem caminho principal para sair de 'pending' em algum ambiente.",
    );
  }

  // --- 3. envio roda fora do freio de PROVIDER_MODE ----------------------
  const emailProviderSrc = await readRepoFile(repoRoot, EMAIL_PROVIDER_TS);
  if (emailProviderSrc === null) {
    failures.push(`email: não consegui ler ${EMAIL_PROVIDER_TS}.`);
  } else {
    if (/isFixtureMode/.test(emailProviderSrc)) {
      failures.push(
        `email: ${EMAIL_PROVIDER_TS} consulta isFixtureMode() — o envio de verificação precisa rodar ` +
          "em QUALQUER PROVIDER_MODE (decisão de produto, 15/08/2026); e-mail não tem custo variável e " +
          "é necessário para o produto funcionar mesmo em fixture.",
      );
    }
    if (!/DE PROPÓSITO/.test(emailProviderSrc)) {
      failures.push(
        `email: ${EMAIL_PROVIDER_TS} não documenta em comentário a decisão de rodar independente de ` +
          "PROVIDER_MODE — sem o comentário, o próximo a mexer aqui não tem como saber que a ausência " +
          "de isFixtureMode() é deliberada, não esquecimento.",
      );
    }
  }

  // --- 4. signup: token gerado e enviado, sem derrubar o cadastro --------
  const authSrc = await readRepoFile(repoRoot, AUTH_TS);
  if (authSrc === null) {
    failures.push(`email: não consegui ler ${AUTH_TS}.`);
  } else {
    if (!/email_verification_token, email_verification_expires_at\)/.test(authSrc)) {
      failures.push(`email: ${AUTH_TS} não grava email_verification_token no INSERT do signup.`);
    }
    if (!/try \{\s*\n\s*await sendVerificationEmail\(email, verificationToken\);\s*\n\s*\} catch/.test(authSrc)) {
      failures.push(
        `email: ${AUTH_TS} — envio de e-mail no signup não está em try/catch. O tenant já foi ` +
          "commitado antes desta chamada; deixar o erro escapar transformaria uma Resend fora do ar " +
          "num 500 sobre um cadastro que, na verdade, teve sucesso.",
      );
    }
  }

  // --- 5. rotas de verificação --------------------------------------------
  const routesSrc = await readRepoFile(repoRoot, EMAIL_VERIFICATION_ROUTES_TS);
  if (routesSrc === null) {
    failures.push(`email: não consegui ler ${EMAIL_VERIFICATION_ROUTES_TS}.`);
  } else {
    if (!/expiresAt\.getTime\(\) < Date\.now\(\)/.test(routesSrc)) {
      failures.push(`email: GET /verify-email não confere a expiração do token em ${EMAIL_VERIFICATION_ROUTES_TS}.`);
    }
    if (!/isResendRateLimited\(req\.ip\)/.test(routesSrc)) {
      failures.push(`email: POST /resend-verification não está limitado por taxa em ${EMAIL_VERIFICATION_ROUTES_TS}.`);
    }
    if (!/const GENERIC_RESPONSE/.test(routesSrc)) {
      failures.push(
        `email: POST /resend-verification em ${EMAIL_VERIFICATION_ROUTES_TS} não devolve uma resposta ` +
          "genérica única — uma mensagem diferente por e-mail encontrado/pendente/inexistente revelaria " +
          "se aquele e-mail tem conta neste produto.",
      );
    }
  }

  // --- 6. admin: aprovação manual limpa o token ---------------------------
  const adminSrc = await readRepoFile(repoRoot, ADMIN_PANEL_TS);
  if (adminSrc === null) {
    failures.push(`email: não consegui ler ${ADMIN_PANEL_TS}.`);
  } else if (!/email_verification_token = NULL, email_verification_expires_at = NULL/.test(adminSrc)) {
    failures.push(
      `email: a aprovação manual no admin (${ADMIN_PANEL_TS}) não limpa o token de verificação — um ` +
        "link de e-mail antigo continuaria válido depois de uma aprovação manual.",
    );
  }

  // --- 7. slugs reservados -------------------------------------------------
  const slugSrc = await readRepoFile(repoRoot, SLUG_TS);
  if (slugSrc === null) {
    failures.push(`email: não consegui ler ${SLUG_TS}.`);
  } else {
    if (!/"verify-email",/.test(slugSrc) || !/"resend-verification",/.test(slugSrc)) {
      failures.push(
        `email: "verify-email" ou "resend-verification" não está em RESERVED_SLUGS (${SLUG_TS}) — um ` +
          "tenant poderia nascer com um desses slugs e ficar inalcançável, ou colidir com a rota real.",
      );
    }
  }

  // --- 8. catálogo e exceção de egresso -----------------------------------
  const catalogSrc = await readRepoFile(repoRoot, ENDPOINT_CATALOG_TS);
  if (catalogSrc === null) {
    failures.push(`email: não consegui ler ${ENDPOINT_CATALOG_TS}.`);
  } else if (!/vendor: "resend"/.test(catalogSrc)) {
    failures.push(`email: "resend" não está registrado em VENDOR_ENDPOINTS (${ENDPOINT_CATALOG_TS}).`);
  }

  const egressSrc = await readRepoFile(repoRoot, EGRESS_POLICY_TS);
  if (egressSrc === null) {
    failures.push(`email: não consegui ler ${EGRESS_POLICY_TS}.`);
  } else {
    if (!/"https:\/\/api\.resend\.com": "resend"/.test(egressSrc)) {
      failures.push(`email: api.resend.com não está mapeado para "resend" em HOST_DO_VENDOR (${EGRESS_POLICY_TS}).`);
    }
    if (!/services\/providers\/emailProvider\.ts/.test(egressSrc)) {
      failures.push(
        `email: ${EMAIL_PROVIDER_TS} não está declarado em EXCECOES (${EGRESS_POLICY_TS}) — sem a ` +
          "exceção com motivo, checkNetworkEgressPolicy reprovaria o arquivo por não desviar para " +
          "fixture, contradizendo a decisão de produto de rodar sempre.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "email: migration 056 ok, RESEND_API_KEY incondicional, envio roda fora do freio de " +
        "PROVIDER_MODE (com o motivo escrito), signup grava e envia o token sem derrubar o cadastro em " +
        "falha, verify-email confere expiração, resend é limitado por taxa e genérico, aprovação manual " +
        "limpa o token, slugs reservados e catálogo/egresso corretos",
    );
  }

  return { failures, notes };
}
