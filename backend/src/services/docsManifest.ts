// Allowlist of which /docs files may reach which copilot audience.
//
// This file — not the folder layout, not a frontmatter header — is the single
// source of truth for documentation exposure. A markdown file that is not
// listed here reaches NO copilot prompt at all, public or otherwise. Adding a
// file to docs/ is therefore never enough to publish it; someone has to make
// that call here, in the backend, where it shows up as a reviewable diff.
//
// It deliberately lives outside docs/ so that writing documentation and
// deciding its exposure are separate acts: a doc author cannot promote their
// own file to "public" by editing the file they are already editing.
//
// Why an allowlist and not the previous directory-exclusion rule: the old
// loadDocsContent() swept docs/**/*.md and only skipped docs/admin/, so every
// other file — including setup.md, with environment variables, session
// mechanics and DNS layout — was fed to the anonymous landing-page copilot.
// Excluding what is secret fails open on anything new; including what is
// public fails closed.

export type DocAudience = "public" | "tenant" | "admin";

// Ordered from least to most privileged. An audience receives every file at
// its own level and below: the tenant copilot sees public + tenant, the admin
// copilot sees all three, the public copilot sees public only.
const AUDIENCE_RANK: Record<DocAudience, number> = {
  public: 0,
  tenant: 1,
  admin: 2,
};

export function audienceAllows(viewer: DocAudience, doc: DocAudience): boolean {
  return AUDIENCE_RANK[doc] <= AUDIENCE_RANK[viewer];
}

// Keys are paths relative to config.docsDir, always with forward slashes.
export const DOCS_MANIFEST: Record<string, DocAudience> = {
  // --- public: safe for an anonymous visitor on the landing page ---------
  // Written in end-user voice, describes the product as a product. Nothing
  // here may name an environment variable, an internal route, a database
  // table, a container, or an internal process.
  "faq.md": "public",

  // --- tenant: authenticated customer, inside their own account ----------
  // How the screens work. Not secret, but useless to a prospect and it
  // describes internals of the app's navigation that we would rather not
  // hand to an anonymous scraper.
  "README.md": "tenant",
  "screens/painel.md": "tenant",
  "screens/criar-video.md": "tenant",
  "screens/configurar-avatar.md": "tenant",
  "screens/conteudo.md": "tenant",
  "screens/conhecimento-e-midia.md": "tenant",
  "screens/configuracoes.md": "tenant",
  "screens/minha-assinatura.md": "tenant",

  // --- admin: internal staff only ---------------------------------------
  // setup.md is here, not at tenant level, on purpose: it documents
  // environment variables, the session cookie's domain scoping, the reverse
  // proxy layout and how tenants are provisioned. That is infrastructure
  // detail for whoever operates the platform, not for the customer using it
  // — and until now it was being read out to anonymous visitors.
  "setup.md": "admin",
  "admin/admin-tenants.md": "admin",
  "admin/admin-taxas-de-custo.md": "admin",
  "admin/admin-planos.md": "admin",
};
