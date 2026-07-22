import { pool } from "../db/pool.js";

const ADJECTIVES = ["swift", "bright", "calm", "bold", "quiet", "brave", "clever", "gentle"];
const NOUNS = ["falcon", "river", "cedar", "comet", "harbor", "meadow", "ember", "summit"];

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

async function slugExists(slug: string): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM tenants WHERE slug = $1", [slug]);
  return rows.length > 0;
}

export async function generateUniqueSlug(email: string): Promise<string> {
  const base = slugify(email.split("@")[0]) || randomSlug();
  let candidate = base;
  let suffix = 1;
  while (await slugExists(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
