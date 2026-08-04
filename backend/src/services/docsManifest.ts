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

  // README.md is deliberately absent from every level. It is meta-content
  // for whoever edits this folder — an index that names and summarizes files
  // at all three levels, including docs/admin/. Classifying it as "tenant"
  // leaked upward in adversarial testing: asked "what's in docs/admin?", the
  // tenant copilot happily listed all three admin files and what each covers,
  // straight out of the index. An index is only ever as confidential as the
  // most confidential thing it indexes, so it belongs to no audience.

  // --- tenant: authenticated customer, inside their own account ----------
  // How the screens work. Not secret, but useless to a prospect and it
  // describes internals of the app's navigation that we would rather not
  // hand to an anonymous scraper.
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
  // A tela das chaves da plataforma. "admin" e nada abaixo disso: mesmo sem
  // citar valor nenhum, ela descreve onde os segredos da casa ficam, como a
  // precedência entre painel e ambiente funciona, e qual é a saída de
  // emergência — um mapa que não interessa a cliente nem a visitante.
  "admin/admin-chaves-da-plataforma.md": "admin",
  "admin/admin-taxas-de-custo.md": "admin",
  "admin/admin-planos.md": "admin",
};

// Files that exist in docs/ and are meant to reach no copilot at all. Listing
// them here is not what keeps them out — anything absent from DOCS_MANIFEST is
// already excluded. It only records that the omission was a decision, so the
// drift warning stays meaningful: an unlisted, unexcluded file is a genuine
// "someone forgot to classify this".
export const DOCS_EXCLUDED: readonly string[] = [
  // Index of the docs folder itself, for humans editing it. Names and
  // summarizes files at every level, admin included — see the note above.
  "README.md",
];

/**
 * Diretórios inteiros que NUNCA chegam a copiloto nenhum.
 *
 * Existe por causa de `historico/`, criado em 2026-08-04 quando o CLAUDE.md foi
 * partido em duas camadas. São memórias de ENGENHARIA — decisões de custo,
 * medições contra fornecedor, nomes de variáveis de chave, defeitos em aberto —
 * e não documentação de produto. O manifesto é uma allowlist, então nada aqui
 * alcançaria um copiloto de qualquer forma; o que este prefixo faz é impedir
 * que a guarda de classificação cobre um por um a cada bloco novo, e que
 * alguém "resolva" o vermelho classificando o arquivo — que é justamente como
 * o conteúdo vazaria.
 *
 * A lição que sustenta isto está registrada no histórico: **um índice é tão
 * confidencial quanto o item mais confidencial que ele indexa.** Foi assim que
 * o README de `docs/` chegou a vazar os nomes de `docs/admin/`.
 */
export const DOCS_EXCLUDED_PREFIXES: readonly string[] = ["historico/"];

/** Um arquivo de `docs/` está deliberadamente fora de todo copiloto? */
export function isDocExcluded(relativePath: string): boolean {
  if (DOCS_EXCLUDED.includes(relativePath)) return true;
  return DOCS_EXCLUDED_PREFIXES.some((prefixo) => relativePath.startsWith(prefixo));
}
