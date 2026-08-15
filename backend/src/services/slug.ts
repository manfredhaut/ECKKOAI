import { pool } from "../db/pool.js";

const ADJECTIVES = ["swift", "bright", "calm", "bold", "quiet", "brave", "clever", "gentle"];
const NOUNS = ["falcon", "river", "cedar", "comet", "harbor", "meadow", "ember", "summit"];

// Path de nível superior que o React Router já dá significado próprio, ou
// prefixo que o backend já usa. Domínio único (14/08) fez o slug do tenant
// virar SEGMENTO DE PATH (/:slug/...) — sem esta lista, um tenant literalmente
// chamado "login" ou "admin" ficaria PARA SEMPRE inalcançável (a rota estática
// sempre vence a dinâmica) e ninguém saberia até tentar entrar.
//
// Checada nos DOIS lugares que geram slug: signup (generateUniqueSlug) e o
// primeiro save do perfil (generateUniqueSlugFromName) — os dois passam pelo
// mesmo laço em generateUniqueSlugFromBase, então a lista só existe aqui.
export const RESERVED_SLUGS: readonly string[] = [
  "login",
  "signup",
  "admin",
  "api",
  "health",
  "subscription",
  "create",
  "content",
  "rag",
  "settings",
  "dev",
  // Confirmação de e-mail (15/08/2026) — /verify-email é rota do frontend
  // (App.tsx); resend-verification não tem página própria, mas reservado
  // pelo mesmo motivo dos outros nomes de rota de API.
  "verify-email",
  "resend-verification",
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSlug(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}

async function slugExists(slug: string, excludeTenantId?: string): Promise<boolean> {
  const { rows } = excludeTenantId
    ? await pool.query("SELECT 1 FROM tenants WHERE slug = $1 AND id <> $2", [slug, excludeTenantId])
    : await pool.query("SELECT 1 FROM tenants WHERE slug = $1", [slug]);
  return rows.length > 0;
}

/**
 * O laço único de geração de slug — usado pelo signup (a partir do e-mail) e
 * pelo primeiro save do perfil (a partir do `name` digitado). Reservado OU já
 * em uso conta como colisão, e os dois casos anexam o MESMO sufixo numérico
 * (nome-2, nome-3…), porque para quem está lendo o resultado não há
 * diferença entre "já existe" e "está reservado" — os dois motivos por que o
 * primeiro palpite não serviu.
 *
 * `excludeTenantId`: só o recálculo do perfil usa. Sem ele, um tenant cujo
 * nome novo slugifica para o MESMO valor que o seu próprio slug de e-mail já
 * era (coincidência plausível) colidiria consigo mesmo e ganharia um sufixo
 * "-2" sem necessidade nenhuma.
 */
async function generateUniqueSlugFromBase(base: string, excludeTenantId?: string): Promise<string> {
  const seed = slugify(base) || randomSlug();
  let candidate = seed;
  let suffix = 1;
  while (RESERVED_SLUGS.includes(candidate) || (await slugExists(candidate, excludeTenantId))) {
    suffix += 1;
    candidate = `${seed}-${suffix}`;
  }
  return candidate;
}

export async function generateUniqueSlug(email: string): Promise<string> {
  return generateUniqueSlugFromBase(email.split("@")[0]);
}

// Primeiro save do perfil (Minha Assinatura) — ver routes/subscription.ts.
// Só é chamada enquanto tenants.slug_locked = false; depois disso o slug
// para de ser recalculado, mesmo que `name` mude de novo.
export async function generateUniqueSlugFromName(name: string, tenantId: string): Promise<string> {
  return generateUniqueSlugFromBase(name, tenantId);
}
