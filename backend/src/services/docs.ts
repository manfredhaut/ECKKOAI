import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { audienceAllows, DOCS_MANIFEST, type DocAudience } from "./docsManifest.js";

// Documentation is fed to the copilots' system prompt from an explicit
// allowlist (services/docsManifest.ts), never from a directory sweep. A file
// sitting in docs/ that nobody classified is invisible to every audience —
// including the admin one — so a forgotten classification degrades into
// "missing answer", not "leaked document".
//
// Cached per audience for the life of the process; docs only change on a
// redeploy/restart.
const cache = new Map<DocAudience, string>();

// Files present on disk but absent from the manifest are reported once, at
// first load, so an unclassified doc surfaces as a startup warning instead of
// silently never being used.
let driftReported = false;

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(path.join(dir, entry.name))));
    } else if (entry.name.endsWith(".md")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function toRelativeKey(absolutePath: string): string {
  return path.relative(config.docsDir, absolutePath).replace(/\\/g, "/");
}

async function reportManifestDrift(): Promise<void> {
  if (driftReported) return;
  driftReported = true;

  let onDisk: string[];
  try {
    onDisk = (await collectMarkdownFiles(config.docsDir)).map(toRelativeKey);
  } catch {
    return; // docs dir missing entirely — buildDocsContent already reports per-file
  }

  const unclassified = onDisk.filter((key) => !(key in DOCS_MANIFEST));
  if (unclassified.length > 0) {
    console.warn(
      `[docs] ${unclassified.length} markdown file(s) in docs/ are not in DOCS_MANIFEST and will not reach any copilot: ${unclassified.join(", ")}`,
    );
  }

  const missing = Object.keys(DOCS_MANIFEST).filter((key) => !onDisk.includes(key));
  if (missing.length > 0) {
    console.warn(
      `[docs] ${missing.length} manifest entr(ies) have no file on disk: ${missing.join(", ")}`,
    );
  }
}

async function buildDocsContent(viewer: DocAudience): Promise<string> {
  await reportManifestDrift();

  const allowed = Object.entries(DOCS_MANIFEST)
    .filter(([, docAudience]) => audienceAllows(viewer, docAudience))
    .map(([relativePath]) => relativePath)
    .sort();

  const sections: string[] = [];
  for (const relativePath of allowed) {
    const absolutePath = path.resolve(config.docsDir, relativePath);

    // The manifest is authored by us, but resolving it against docsDir and
    // re-checking containment keeps a stray "../" from ever reading outside
    // the docs tree.
    const root = path.resolve(config.docsDir);
    if (absolutePath !== root && !absolutePath.startsWith(root + path.sep)) {
      console.warn(`[docs] manifest entry escapes docs dir, skipped: ${relativePath}`);
      continue;
    }

    try {
      const content = await readFile(absolutePath, "utf-8");
      sections.push(`## ${relativePath}\n\n${content}`);
    } catch {
      console.warn(`[docs] manifest entry could not be read, skipped: ${relativePath}`);
    }
  }

  return sections.join("\n\n---\n\n");
}

export async function loadDocsFor(viewer: DocAudience): Promise<string> {
  const cached = cache.get(viewer);
  if (cached !== undefined) return cached;
  const built = await buildDocsContent(viewer);
  cache.set(viewer, built);
  return built;
}

// Anonymous landing-page copilot (routes/public.ts). Public-level docs only.
export async function loadPublicDocsContent(): Promise<string> {
  return loadDocsFor("public");
}

// Authenticated tenant copilot (routes/copilot.ts). Public + tenant docs.
export async function loadDocsContent(): Promise<string> {
  return loadDocsFor("tenant");
}

// Internal admin copilot (routes/adminCopilot.ts). Everything.
export async function loadAdminDocsContent(): Promise<string> {
  return loadDocsFor("admin");
}
