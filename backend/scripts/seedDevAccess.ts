/**
 * Seed das credenciais fixas de desenvolvimento (admin da plataforma +
 * usuário do tenant de demo `dev-c77a5b`).
 *
 * Motivo de existir: o projeto não tem NENHUM endpoint de troca de senha
 * (nem `adminAuth.ts` nem `auth.ts`/`login.ts` — só verificação no login),
 * então até aqui toda rotação era um UPDATE manual, refeito a cada sessão.
 * Este script torna esse acesso previsível e repetível.
 *
 * Rodar com: `npm run dev:seed-access` (dentro do container do backend).
 * É idempotente: cria o que faltar, atualiza o que existir, e pode rodar
 * quantas vezes for preciso.
 *
 * As senhas NUNCA aparecem em linha de comando de SQL — entram por variável
 * de ambiente e vão para o Postgres como parâmetro ($1/$2/$3).
 * Os valores em claro ficam só em DEV-ACCESS.local.md (raiz do repo) (não versionado).
 */
import { pool } from "../src/db/pool.js";
import { hashPassword } from "../src/services/passwords.js";
import { recordAuditLog } from "../src/services/auditLog.js";

const ADMIN_EMAIL = "admin@eckkoai.com";
const ADMIN_NAME = "Admin eckko.ai";
const TENANT_SLUG = "dev-c77a5b";
const TENANT_EMAIL = "demo@eckko.ai";

const adminPassword = process.env.DEV_ADMIN_PASSWORD || "AdminEckko2026";
const tenantPassword = process.env.DEV_TENANT_PASSWORD || "DemoEckko2026";

// Hosts aceitos como "banco local". Cobre acesso direto da máquina e o nome
// do serviço dentro da rede do Docker Compose (`postgres`), que é como o
// container do backend enxerga o banco. Qualquer outro host é tratado como
// ambiente que não é o meu — ver abort() abaixo.
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "postgres", "db"]);

function abort(reason: string): never {
  console.error("\n  ABORTADO — seed de credenciais de dev não executado.");
  console.error(`  Motivo: ${reason}`);
  console.error("  Estas contas são de desenvolvimento e não devem existir em produção.\n");
  process.exit(1);
}

function assertLocalEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    abort("NODE_ENV === 'production'.");
  }

  const url = process.env.DATABASE_URL;
  if (!url) abort("DATABASE_URL não está definida.");

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    abort("DATABASE_URL não é uma URL válida — não dá pra confirmar que o banco é local.");
  }

  // Um hostname vazio (ex.: socket unix) também não prova localidade.
  if (!host || !LOCAL_DB_HOSTS.has(host)) {
    abort(
      `DATABASE_URL aponta para o host "${host}", que não está na lista de hosts locais ` +
        `(${[...LOCAL_DB_HOSTS].join(", ")}).`,
    );
  }
}

async function seedAdmin(passwordHash: string): Promise<"criado" | "atualizado"> {
  const { rows } = await pool.query<{ inserido: boolean }>(
    `INSERT INTO admin_users (email, password_hash, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING (xmax = 0) AS inserido`,
    [ADMIN_EMAIL, passwordHash, ADMIN_NAME],
  );
  return rows[0].inserido ? "criado" : "atualizado";
}

async function seedTenantUser(passwordHash: string): Promise<"criado" | "atualizado"> {
  const { rows: tenantRows } = await pool.query<{ id: string }>(
    "SELECT id FROM tenants WHERE slug = $1",
    [TENANT_SLUG],
  );
  if (!tenantRows[0]) {
    abort(
      `o tenant de demo "${TENANT_SLUG}" não existe neste banco. ` +
        "Crie-o antes (via /auth/signup) — este script não inventa tenant.",
    );
  }

  const { rows } = await pool.query<{ inserido: boolean }>(
    `INSERT INTO users (tenant_id, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING (xmax = 0) AS inserido`,
    [tenantRows[0].id, TENANT_EMAIL, passwordHash],
  );
  return rows[0].inserido ? "criado" : "atualizado";
}

async function main(): Promise<void> {
  assertLocalEnvironment();

  // bcrypt é CPU-bound: hash antes de qualquer ida ao banco.
  const [adminHash, tenantHash] = await Promise.all([
    hashPassword(adminPassword),
    hashPassword(tenantPassword),
  ]);

  const adminResult = await seedAdmin(adminHash);
  const tenantResult = await seedTenantUser(tenantHash);

  // Ator nulo exige prefixo de sistema (convenção de services/auditLog.ts).
  // `after` carrega só metadado — nunca a senha nem o hash.
  await recordAuditLog({
    tenantId: null,
    actorAdminUserId: null,
    action: "system.dev_access_seeded",
    before: null,
    after: {
      adminEmail: ADMIN_EMAIL,
      adminOutcome: adminResult,
      tenantEmail: TENANT_EMAIL,
      tenantSlug: TENANT_SLUG,
      tenantOutcome: tenantResult,
      method: "npm run dev:seed-access",
    },
  });

  console.log(`  admin  ${ADMIN_EMAIL} → ${adminResult}`);
  console.log(`  tenant ${TENANT_EMAIL} (${TENANT_SLUG}) → ${tenantResult}`);
  console.log("  Senhas em DEV-ACCESS.local.md (raiz do repo) (não versionado).");

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
