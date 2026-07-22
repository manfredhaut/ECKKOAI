import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

// docs/admin/ holds internal-only content about the admin panel itself
// (billing, cost rates, tenant suspension) — must never reach the
// tenant/public copilot prompts (see routes/copilot.ts, routes/public.ts),
// only the admin one (routes/adminCopilot.ts). Excluded by name, not by an
// audience flag threaded through every caller, so a future doc author can't
// accidentally leak it just by adding a file to the wrong folder — the
// exclusion is a directory boundary, not a per-file decision.
const ADMIN_ONLY_DIR = "admin";

let cachedGeneral: string | null = null;
let cachedAdmin: string | null = null;

async function collectMarkdownFiles(dir: string, skipDirName?: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipDirName && entry.name === skipDirName) continue;
      files.push(...(await collectMarkdownFiles(path.join(dir, entry.name), skipDirName)));
    } else if (entry.name.endsWith(".md")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

async function buildDocsContent(skipDirName?: string): Promise<string> {
  const files = (await collectMarkdownFiles(config.docsDir, skipDirName)).sort();
  const sections = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(file, "utf-8");
      const relativePath = path.relative(config.docsDir, file).replace(/\\/g, "/");
      return `## ${relativePath}\n\n${content}`;
    }),
  );
  return sections.join("\n\n---\n\n");
}

// Loads every /docs markdown file EXCEPT docs/admin/ into a single string,
// for the tenant and public copilots' system prompt. Cached in memory for
// the life of the process — docs only change on a redeploy/restart.
export async function loadDocsContent(): Promise<string> {
  if (!cachedGeneral) cachedGeneral = await buildDocsContent(ADMIN_ONLY_DIR);
  return cachedGeneral;
}

// Everything loadDocsContent() has, plus docs/admin/ — only ever passed to
// the admin copilot (routes/adminCopilot.ts). An admin asking "how does the
// wizard work" should still get a real answer, so this is additive on top
// of the general docs, not a replacement for them.
export async function loadAdminDocsContent(): Promise<string> {
  if (!cachedAdmin) cachedAdmin = await buildDocsContent();
  return cachedAdmin;
}
