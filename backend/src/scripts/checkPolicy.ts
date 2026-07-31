// Freezes, as assertions, the guarantees that documentation exposure and the
// credential probe were verified to have by hand. Exits non-zero on the first
// violated invariant so CI (and `npm run check`) treats a regression as a
// build failure rather than a log line nobody reads.
//
//   docker compose exec backend npm run check
//
// Needs the database only for the plan-limit assertion (section 6): the plans
// table is the single source of truth for limits, so an assertion about them
// has to read it. A database that cannot be reached is a FAILURE, not a skip
// — an assertion that silently doesn't run is worse than no assertion.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { loadDocsFor } from "../services/docs.js";
import { DOCS_EXCLUDED, DOCS_MANIFEST, type DocAudience } from "../services/docsManifest.js";
import {
  DENY_ENFORCED_FOR,
  DENY_TERMS,
  FALSE_CLAIM_ENFORCED_FOR,
  FALSE_CLAIM_TERMS,
  PLAN_LIMIT_PATTERNS,
  SIZE_LIMITS,
  UNLIMITED_CLAIM_PATTERN,
} from "../services/docsPolicy.js";

const AUDIENCES: DocAudience[] = ["public", "tenant", "admin"];
const RANK: Record<DocAudience, number> = { public: 0, tenant: 1, admin: 2 };

const failures: string[] = [];
const notes: string[] = [];

function fail(section: string, message: string): void {
  failures.push(`[${section}] ${message}`);
}

function note(message: string): void {
  notes.push(`  ${message}`);
}

async function listMarkdownOnDisk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdownOnDisk(full)));
    else if (entry.name.endsWith(".md")) out.push(path.relative(config.docsDir, full).replace(/\\/g, "/"));
  }
  return out;
}

async function main(): Promise<void> {
  const onDisk = await listMarkdownOnDisk(config.docsDir);
  const prompts = new Map<DocAudience, string>();
  for (const audience of AUDIENCES) prompts.set(audience, await loadDocsFor(audience));

  // --- 1. every file on disk is classified or explicitly excluded --------
  for (const file of onDisk) {
    if (!(file in DOCS_MANIFEST) && !DOCS_EXCLUDED.includes(file)) {
      fail(
        "classificação",
        `docs/${file} não está em DOCS_MANIFEST nem em DOCS_EXCLUDED. ` +
          `Classifique-o (public/tenant/admin) ou registre a exclusão deliberada.`,
      );
    }
  }
  note(`${onDisk.length} arquivos em docs/, ${Object.keys(DOCS_MANIFEST).length} classificados, ${DOCS_EXCLUDED.length} excluídos de propósito`);

  // --- 2. no manifest entry points at a file that does not exist ---------
  for (const entry of Object.keys(DOCS_MANIFEST)) {
    if (!onDisk.includes(entry)) {
      fail("manifesto", `DOCS_MANIFEST cita docs/${entry}, que não existe no disco.`);
    }
  }
  for (const entry of DOCS_EXCLUDED) {
    if (!onDisk.includes(entry)) {
      fail("manifesto", `DOCS_EXCLUDED cita docs/${entry}, que não existe no disco.`);
    }
  }

  // --- 3. deny-list --------------------------------------------------------
  for (const audience of DENY_ENFORCED_FOR) {
    const prompt = (prompts.get(audience) ?? "").toLowerCase();
    for (const term of DENY_TERMS) {
      if (prompt.includes(term.toLowerCase())) {
        fail("deny-list", `o prompt de nível "${audience}" contém o termo proibido "${term}".`);
      }
    }
  }
  note(`deny-list: ${DENY_TERMS.length} termos verificados em ${DENY_ENFORCED_FOR.join(" e ")}`);

  // --- 3b. false claims ---------------------------------------------------
  // Nada aqui é confidencial — é simplesmente falso. Uma afirmação comercial
  // falsa dita com confiança a quem é cobrado via Stripe é pior que vazar um
  // nome de tabela.
  for (const audience of FALSE_CLAIM_ENFORCED_FOR) {
    const prompt = (prompts.get(audience) ?? "").toLowerCase();
    for (const { term, why } of FALSE_CLAIM_TERMS) {
      if (prompt.includes(term.toLowerCase())) {
        fail("promessa falsa", `o prompt de nível "${audience}" afirma "${term}" — ${why}.`);
      }
    }
  }
  note(`promessa falsa: ${FALSE_CLAIM_TERMS.length} afirmações verificadas em todos os níveis`);

  // --- 4. no doc names a file that lives at a higher level ----------------
  // Generalizes the README finding: an index is as confidential as the most
  // confidential thing it indexes, and naming a file is already a leak —
  // it tells the reader the document exists and roughly what it covers.
  for (const audience of AUDIENCES) {
    const prompt = prompts.get(audience) ?? "";
    for (const [file, level] of Object.entries(DOCS_MANIFEST)) {
      if (RANK[level] <= RANK[audience]) continue;
      const basename = file.split("/").pop() as string;
      // The prompt prefixes each section with "## <path>", so match the
      // basename anywhere EXCEPT as one of those headers.
      const body = prompt.replace(/^## .+$/gm, "");
      if (body.includes(basename)) {
        fail(
          "vazamento de índice",
          `o prompt de nível "${audience}" cita o arquivo "${basename}", que é de nível "${level}".`,
        );
      }
    }
  }

  // --- 5. prompt size ceiling ---------------------------------------------
  for (const audience of AUDIENCES) {
    const size = (prompts.get(audience) ?? "").length;
    const limit = SIZE_LIMITS[audience];
    if (size > limit) {
      fail(
        "tamanho",
        `o prompt de nível "${audience}" tem ${size} chars, acima do teto de ${limit}. ` +
          `Se o crescimento é intencional, suba SIZE_LIMITS no mesmo commit que adiciona o conteúdo.`,
      );
    }
    note(`tamanho ${audience}: ${size}/${limit} chars (${Math.round((size / limit) * 100)}%)`);
  }

  // --- 6. plan limits quoted in docs match the plans table ---------------
  const { getAllPlansIncludingInactive } = await import("../plans.js");
  const plans = await getAllPlansIncludingInactive();
  if (plans.length === 0) {
    fail("planos", "a tabela plans está vazia — não há fonte de verdade contra a qual conferir os docs.");
  }

  for (const file of Object.keys(DOCS_MANIFEST)) {
    // A missing file is already reported by section 2. Skipping it here keeps
    // that violation readable instead of letting the read throw and abort the
    // whole run before anything is printed.
    if (!onDisk.includes(file)) continue;
    const content = await readFile(path.resolve(config.docsDir, file), "utf-8");

    for (const { regex, field } of PLAN_LIMIT_PATTERNS) {
      for (const match of content.matchAll(regex)) {
        const quoted = Number(match[1]);
        const valid = plans.map((p) => p[field]);
        if (!valid.includes(quoted)) {
          fail(
            "planos",
            `docs/${file} promete "${match[0].trim()}", mas nenhum plano tem ${field} = ${quoted} ` +
              `(valores reais: ${valid.join(", ")}).`,
          );
        }
      }
    }

    for (const match of content.matchAll(UNLIMITED_CLAIM_PATTERN)) {
      fail(
        "planos",
        `docs/${file} usa "${match[0]}" — nenhum plano é ilimitado em vídeo, roteiro ou avatar.`,
      );
    }
  }
  note(`planos conferidos contra a tabela: ${plans.map((p) => p.id).join(", ")}`);

  // --- 7. credential probe semantics --------------------------------------
  // The probe answers "is this key valid?", not "does the model produce
  // text?". Proven against controlled vendor responses because the real
  // free-tier quota makes a live 5x run unreliable — and because a live run
  // can only ever exercise whichever branch the vendor happens to take.
  await checkProbeSemantics();

  console.log("\nResumo:");
  notes.forEach((n) => console.log(n));

  if (failures.length > 0) {
    console.error(`\n${failures.length} violação(ões):\n`);
    failures.forEach((f) => console.error("  ✗ " + f));
    process.exit(1);
  }
  console.log("\n✓ Todas as invariantes de documentação e de probe de credencial passaram.");
  process.exit(0);
}

async function checkProbeSemantics(): Promise<void> {
  const { complete, AiEmptyResponseError, AiProviderError } = await import(
    "../services/providers/providerRegistry.js"
  );

  const realFetch = globalThis.fetch;
  const respond = (status: number, body: unknown): void => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
  };

  // A reasoning model that spends the whole budget thinking: HTTP 200,
  // finishReason MAX_TOKENS, no text part. This is the exact shape that used
  // to be reported as a bad key.
  const emptyGemini = { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] };
  const okGemini = { candidates: [{ content: { parts: [{ text: "pong" }] } }] };
  const badKey = { error: { code: 400, message: "API key not valid", status: "INVALID_ARGUMENT" } };

  try {
    respond(200, okGemini);
    const r = await complete("gemini", { apiKey: "x", messages: [{ role: "user", content: "ping" }] });
    if (r.text !== "pong") fail("probe", `resposta com texto deveria devolver "pong", devolveu "${r.text}".`);

    respond(200, emptyGemini);
    let emptyErr: unknown = null;
    try {
      await complete("gemini", { apiKey: "x", messages: [{ role: "user", content: "ping" }] });
    } catch (err) {
      emptyErr = err;
    }
    if (!(emptyErr instanceof AiEmptyResponseError)) {
      fail("probe", `200 sem texto deveria virar AiEmptyResponseError, virou ${String(emptyErr)}.`);
    } else {
      note("probe: 200 sem texto -> AiEmptyResponseError (chave válida, tratada como sucesso pelo ping)");
    }

    respond(400, badKey);
    let badErr: unknown = null;
    try {
      await complete("gemini", { apiKey: "x", messages: [{ role: "user", content: "ping" }] });
    } catch (err) {
      badErr = err;
    }
    if (!(badErr instanceof AiProviderError) || badErr instanceof AiEmptyResponseError) {
      fail("probe", `400 de chave inválida deveria virar AiProviderError puro, virou ${String(badErr)}.`);
    } else {
      note("probe: 400 de chave inválida -> AiProviderError (ping continua falhando, como deve)");
    }

    respond(429, { error: { code: 429, message: "quota" } });
    let quotaErr: unknown = null;
    try {
      await complete("gemini", { apiKey: "x", messages: [{ role: "user", content: "ping" }] });
    } catch (err) {
      quotaErr = err;
    }
    if (quotaErr instanceof AiEmptyResponseError) {
      fail("probe", "429 de quota não pode ser tratado como sucesso — seria um falso positivo.");
    } else {
      note("probe: 429 de quota -> falha (não é confundido com resposta vazia)");
    }
  } finally {
    globalThis.fetch = realFetch;
  }
}

main().catch((err) => {
  console.error("checkPolicy falhou de forma inesperada:", err);
  process.exit(1);
});
