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
import { checkEnvironmentPolicy } from "./checkEnvironmentPolicy.js";
import { checkProviderPolicy } from "./checkProviderPolicy.js";
import { checkPlatformKeyPolicy } from "./checkPlatformKeyPolicy.js";
import { checkRefundPolicy } from "./checkRefundPolicy.js";
import { checkPollPolicy } from "./checkPollPolicy.js";
import {
  checkAvatarTrainingGate,
  checkLiveBudgetCallers,
  checkLiveBudgetPolicy,
  checkLiveBudgetRelease,
} from "./checkLiveBudgetPolicy.js";
import { checkNetworkEgressPolicy } from "./checkNetworkEgressPolicy.js";
import { checkVideoPlaybackPolicy } from "./checkVideoPlaybackPolicy.js";
import { checkGenerationReadinessPolicy } from "./checkGenerationReadinessPolicy.js";
import { checkVendorLogPolicy } from "./checkVendorLogPolicy.js";
import { checkVideoFormatPolicy } from "./checkVideoFormatPolicy.js";
import { checkVendorErrorPathPolicy } from "./checkVendorErrorPathPolicy.js";
import { checkImageFreshnessPolicy } from "./checkImageFreshnessPolicy.js";
import { checkCostPolicy } from "./checkCostPolicy.js";
import type { Mutant } from "./mutants.js";
import {
  DENY_ENFORCED_FOR,
  DENY_TERMS,
  FALSE_CLAIM_ENFORCED_FOR,
  FALSE_CLAIM_TERMS,
  PLAN_LIMIT_PATTERNS,
  SIZE_LIMITS,
  UNLIMITED_CLAIM_PATTERN,
} from "../services/docsPolicy.js";

/**
 * Mutantes das asserções que vivem NESTE arquivo (docs, planos, duração,
 * sanitização de erro, probe). As demais guardas declaram os seus no próprio
 * módulo — ver scripts/mutants.ts para o contrato.
 */
export const MUTANTS: Mutant[] = [
  {
    guard: "classificação de docs",
    name: "doc novo sem classificação",
    kind: "obvio",
    file: "backend/src/services/docsManifest.ts",
    find: `  "screens/painel.md": "tenant",`,
    replace: "",
    expect: "não está em DOCS_MANIFEST nem em DOCS_EXCLUDED",
  },
  {
    guard: "deny-list",
    name: "termo proibido entra em doc de tenant",
    kind: "obvio",
    file: "docs/screens/painel.md",
    find: "# Painel",
    replace: "# Painel\n\nA tabela credit_ledger guarda o histórico.",
    expect: "contém o termo proibido",
  },
  {
    guard: "deny-list",
    name: "doc de nível admin promovido a tenant",
    kind: "esperto",
    file: "backend/src/services/docsManifest.ts",
    // Nenhum texto muda, nenhum termo novo é escrito. Só a EXPOSIÇÃO de um
    // arquivo que já contém metade da deny-list. É o modo de falha real:
    // reclassificar é uma linha, e o conteúdo perigoso já estava escrito.
    find: `  "setup.md": "admin",`,
    replace: `  "setup.md": "tenant",`,
    expect: "contém o termo proibido",
  },
  {
    guard: "promessa falsa",
    name: "afirmação BYOK volta ao FAQ",
    kind: "obvio",
    file: "docs/faq.md",
    find: "# Perguntas frequentes",
    replace: "# Perguntas frequentes\n\nO modelo é BYOK.",
    expect: "promessa falsa",
  },
  {
    guard: "planos: limite citado bate com a tabela",
    name: "doc promete limite que nenhum plano tem",
    kind: "obvio",
    file: "docs/faq.md",
    find: "# Perguntas frequentes",
    replace: "# Perguntas frequentes\n\nO plano inclui 999 vídeos por mês.",
    expect: "mas nenhum plano tem videoLimitPerMonth = 999",
  },
  {
    guard: "planos: nada é ilimitado",
    name: "doc promete recurso ilimitado",
    kind: "obvio",
    file: "docs/faq.md",
    find: "# Perguntas frequentes",
    replace: "# Perguntas frequentes\n\nAvatares ilimitados.",
    expect: "nenhum plano é ilimitado",
  },
  {
    guard: "tamanho do prompt",
    name: "teto de tamanho estourado",
    kind: "obvio",
    file: "backend/src/services/docsPolicy.ts",
    find: "  public: 4_000,",
    replace: "  public: 10,",
    expect: "acima do teto de",
  },
  {
    guard: "duração: alvo derivado",
    name: "alvo de palavras deixa de derivar do wpm",
    kind: "esperto",
    file: "backend/src/services/script/scriptDuration.ts",
    // A função continua existindo e continua devolvendo um número plausível
    // para 30 s. Só deixa de ser DERIVADA — e o sintoma seria um vídeo com a
    // duração errada, visível só depois de gastar cota de três fornecedores.
    find: "  return Math.round((seconds / 60) * SCRIPT_DURATION.wordsPerMinute);",
    replace: "  return seconds > 0 ? 70 : 70;",
    expect: "não é o dobro de targetWords(30)",
  },
  {
    guard: "erro de vendor sanitizado",
    name: "mensagem ao cliente volta a citar o fornecedor",
    kind: "esperto",
    file: "backend/src/services/providers/vendorError.ts",
    // A sanitização continua existindo e continua sendo chamada nos oito
    // pontos. Só o TEXTO volta a nomear o vendor — que é o vazamento que o
    // bloco 4 corrigiu, e nenhuma contagem de chamadas perceberia.
    find: `  avatar: "de vídeo",`,
    replace: `  avatar: "do HeyGen",`,
    expect: "cita o fornecedor",
  },
];

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

  let citacoesConferidas = 0;
  for (const file of Object.keys(DOCS_MANIFEST)) {
    // A missing file is already reported by section 2. Skipping it here keeps
    // that violation readable instead of letting the read throw and abort the
    // whole run before anything is printed.
    if (!onDisk.includes(file)) continue;
    const content = await readFile(path.resolve(config.docsDir, file), "utf-8");

    for (const { regex, field } of PLAN_LIMIT_PATTERNS) {
      for (const match of content.matchAll(regex)) {
        citacoesConferidas += 1;
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
  // Universo de inspeção ZERO reprova.
  //
  // Esta asserção lia como cobertura sólida — "planos conferidos contra a
  // tabela: free, pro, business" — mas os planos eram só o que ela CARREGOU. O
  // que ela conferiu foram zero citações, porque nenhum doc cita limite na
  // forma que PLAN_LIMIT_PATTERNS reconhece. Nunca comparou um número sequer
  // com a tabela, e o resumo não deixava isso aparecer.
  //
  // A regra vale além deste caso: uma guarda que não encontra nada para
  // inspecionar não está aprovando, está cega. É um sinal fraco (não pega a
  // guarda que olha a coisa errada — para isso existe o arnês de mutação), mas
  // custa pouco e pega uma classe própria de defeito.
  if (citacoesConferidas === 0) {
    fail(
      "planos",
      "nenhuma citação de limite de plano foi encontrada nos docs — a asserção passou sem comparar " +
        "número nenhum com a tabela. Ou a documentação deixou de citar limites (e aí esta guarda não " +
        "protege mais nada), ou passou a citá-los numa forma que PLAN_LIMIT_PATTERNS não reconhece " +
        "(e aí ela é ainda pior: dá cobertura aparente a um texto que nunca é conferido).",
    );
  }
  note(
    `planos: ${citacoesConferidas} citação(ões) de limite conferida(s) contra a tabela (${plans.map((p) => p.id).join(", ")})`,
  );

  // --- 6b. script duration is derived, not hardcoded ----------------------
  await checkScriptDuration();

  // --- 6c. generation pipeline: retry, cap, truncation, meta stripping ----
  await checkScriptPipeline();

  // --- 6d. vendor errors never reach the client verbatim ------------------
  await checkVendorErrorSanitization();

  // --- 7. credential probe semantics --------------------------------------
  // The probe answers "is this key valid?", not "does the model produce
  // text?". Proven against controlled vendor responses because the real
  // free-tier quota makes a live 5x run unreliable — and because a live run
  // can only ever exercise whichever branch the vendor happens to take.
  await checkProbeSemantics();

  // --- 8. resiliência do ambiente e higiene das credenciais de acesso -----
  // Roda contra /repo (montado somente-leitura no compose) porque o alvo
  // são arquivos que vivem fora deste container.
  const envResult = await checkEnvironmentPolicy(process.env.REPO_ROOT ?? "/repo");
  // As mensagens já vêm prefixadas por seção ("ambiente:" / "acesso:"),
  // então entram direto — passar por fail() duplicaria o rótulo.
  envResult.failures.forEach((f) => failures.push(f));
  envResult.notes.forEach((n) => note(n));

  // --- 9. modo de provedor (fixture/live) e registro de feature flags ----
  const providerResult = await checkProviderPolicy(process.env.REPO_ROOT ?? "/repo");
  providerResult.failures.forEach((f) => failures.push(f));
  providerResult.notes.forEach((n) => note(n));

  // --- 10. chaves da plataforma: nenhuma rota devolve valor em claro ------
  const platformKeyResult = await checkPlatformKeyPolicy(process.env.REPO_ROOT ?? "/repo");
  platformKeyResult.failures.forEach((f) => failures.push(f));
  platformKeyResult.notes.forEach((n) => note(n));

  // --- 11. crédito volta quando o fornecedor recusa ----------------------
  const refundResult = await checkRefundPolicy(process.env.REPO_ROOT ?? "/repo");
  refundResult.failures.forEach((f) => failures.push(f));
  refundResult.notes.forEach((n) => note(n));

  // --- 12. concluído sem artefato falha na hora --------------------------
  const pollResult = await checkPollPolicy();
  pollResult.failures.forEach((f) => failures.push(f));
  pollResult.notes.forEach((n) => note(n));

  // --- 13. teto de operações tarifadas: mensagem que explica ------------
  const budgetResult = checkLiveBudgetPolicy();
  budgetResult.failures.forEach((f) => failures.push(f));
  budgetResult.notes.forEach((n) => note(n));

  // --- 13b. quem precisa consumir o teto continua consumindo -------------
  const budgetCallers = await checkLiveBudgetCallers(process.env.REPO_ROOT ?? "/repo");
  budgetCallers.failures.forEach((f) => failures.push(f));
  budgetCallers.notes.forEach((n) => note(n));

  // --- 13c. a falha devolve o gasto, e o laço continua barrado -----------
  const budgetRelease = await checkLiveBudgetRelease();
  budgetRelease.failures.forEach((f) => failures.push(f));
  budgetRelease.notes.forEach((n) => note(n));

  // --- 13d. TODA saída de rede respeita o modo (descoberta, não lista) ---
  const egress = await checkNetworkEgressPolicy(process.env.REPO_ROOT ?? "/repo");
  egress.failures.forEach((f) => failures.push(f));
  egress.notes.forEach((n) => note(n));

  // --- 13e. o vídeo é reproduzível DENTRO do produto ---------------------
  const playback = await checkVideoPlaybackPolicy(process.env.REPO_ROOT ?? "/repo");
  playback.failures.forEach((f) => failures.push(f));
  playback.notes.forEach((n) => note(n));

  // --- 13f. um bloqueio de geração existe dos DOIS lados ------------------
  const readiness = await checkGenerationReadinessPolicy(process.env.REPO_ROOT ?? "/repo");
  readiness.failures.forEach((f) => failures.push(f));
  readiness.notes.forEach((n) => note(n));

  // --- 14. portão de avatar em treino -----------------------------------
  const gateResult = await checkAvatarTrainingGate(process.env.REPO_ROOT ?? "/repo");
  gateResult.failures.forEach((f) => failures.push(f));
  gateResult.notes.forEach((n) => note(n));

  // --- 15. toda chamada a fornecedor registra a resposta bruta ------------
  const vendorLogResult = await checkVendorLogPolicy(process.env.REPO_ROOT ?? "/repo");
  vendorLogResult.failures.forEach((f) => failures.push(f));
  vendorLogResult.notes.forEach((n) => note(n));

  // --- 16. nenhuma geração vai ao fornecedor sem formato explícito --------
  const formatResult = await checkVideoFormatPolicy(process.env.REPO_ROOT ?? "/repo");
  formatResult.failures.forEach((f) => failures.push(f));
  formatResult.notes.forEach((n) => note(n));

  // --- 17. caminho de erro do fornecedor: corpo no log, mascarado ---------
  const errorPathResult = await checkVendorErrorPathPolicy();
  errorPathResult.failures.forEach((f) => failures.push(f));
  errorPathResult.notes.forEach((n) => note(n));

  // --- 18. a imagem do frontend corresponde ao repositório ---------------
  const freshnessResult = await checkImageFreshnessPolicy(process.env.REPO_ROOT ?? "/repo");
  freshnessResult.failures.forEach((f) => failures.push(f));
  freshnessResult.notes.forEach((n) => note(n));

  // --- 19. custo tem um número só; log tem um sumidouro só; freio deriva ---
  const costResult = await checkCostPolicy(process.env.REPO_ROOT ?? "/repo");
  costResult.failures.forEach((f) => failures.push(f));
  costResult.notes.forEach((n) => note(n));

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

// O valor do bloco de duração está em o alvo ser DERIVADO: trocar 30s por 60s
// tem de mudar tudo que depende disso sem editar mais nada. Um número literal
// reaparecendo em algum lugar quebraria isso silenciosamente, e o sintoma
// seria um vídeo com a duração errada — visível só depois de gastar cota dos
// três vendors.
async function checkScriptDuration(): Promise<void> {
  const {
    SCRIPT_DURATION,
    targetWords,
    wordBand,
    estimateSeconds,
    countWords,
    truncateAtSentence,
    buildLengthInstruction,
  } = await import("../services/script/scriptDuration.js");

  const wpm = SCRIPT_DURATION.wordsPerMinute;

  const expected30 = Math.round((30 / 60) * wpm);
  if (targetWords(30) !== expected30) {
    fail("duração", `targetWords(30) devolveu ${targetWords(30)}, esperado ${expected30} (derivado de ${wpm} wpm).`);
  }
  // Dobrar a duração tem de dobrar o alvo de palavras. Se não dobrar, algum
  // número parou de ser derivado.
  if (targetWords(60) !== targetWords(30) * 2) {
    fail("duração", `targetWords(60) (${targetWords(60)}) não é o dobro de targetWords(30) (${targetWords(30)}).`);
  }

  const band = wordBand(30);
  if (!(band.min < targetWords(30) && targetWords(30) < band.max)) {
    fail("duração", `a banda [${band.min}, ${band.max}] não contém o alvo ${targetWords(30)}.`);
  }

  const roundTrip = estimateSeconds(targetWords(30));
  if (Math.abs(roundTrip - 30) > 1) {
    fail("duração", `estimateSeconds(targetWords(30)) devolveu ${roundTrip}s, deveria voltar a ~30s.`);
  }

  if (countWords("- um\n- dois — três") !== 3) {
    fail("duração", `countWords contou ${countWords("- um\n- dois — três")} em vez de 3 (bullets e travessões não são palavras).`);
  }

  // A garantia que mais importa no corte: nunca terminar no meio de uma
  // frase. Um vídeo que corta a pessoa falando pela metade é pior que um
  // vídeo alguns segundos mais curto.
  const prosa = "Primeira frase aqui. Segunda frase um pouco maior que a outra. Terceira frase final!";
  const cortado = truncateAtSentence(prosa, 6);
  if (!/[.!?…]$/.test(cortado)) {
    fail("duração", `truncateAtSentence terminou fora de fim de frase: "${cortado}".`);
  }
  if (!prosa.startsWith(cortado.slice(0, 20))) {
    fail("duração", "truncateAtSentence não preservou o início do texto original.");
  }
  // Texto sem pontuação nenhuma não pode virar string vazia.
  if (truncateAtSentence("uma frase sem ponto final nenhum", 2).length === 0) {
    fail("duração", "truncateAtSentence devolveu vazio para texto sem pontuação.");
  }

  // O prompt fala em palavras, nunca em segundos — o modelo não sabe quanto
  // tempo leva para falar um texto.
  const instrucao = buildLengthInstruction(30);
  if (!instrucao.includes(String(targetWords(30)))) {
    fail("duração", "a instrução de tamanho não cita o alvo de palavras.");
  }
  if (/\b\d+\s*(s|seg|segundos?)\b/i.test(instrucao)) {
    fail("duração", `a instrução de tamanho menciona segundos: "${instrucao}".`);
  }

  note(
    `duração: alvo ${SCRIPT_DURATION.targetSeconds}s @ ${wpm} wpm -> ${targetWords()} palavras, banda [${wordBand().min}, ${wordBand().max}]`,
  );
}

// Prova o pipeline de geração com respostas de vendor controladas. Feito
// assim, e não com chamadas reais, por dois motivos: a cota gratuita não
// comporta exercitar cada ramo, e uma chamada real não deixa ESCOLHER o ramo
// — o caminho "voltou longo duas vezes seguidas" pode nunca acontecer numa
// corrida ao vivo e é justamente o que precisa estar certo.
async function checkScriptPipeline(): Promise<void> {
  const { generateScript } = await import("../services/providers/scriptProvider.js");
  const { wordBand, countWords } = await import("../services/script/scriptDuration.js");

  const band = wordBand();
  const realFetch = globalThis.fetch;
  // Desde o bloco 5D-1, `complete()` desvia para fixture antes de qualquer
  // fetch. Esta asserção exercita o pipeline REAL — retentativa, corte, cauda
  // truncada — então precisa do modo real; o `fetch` substituído abaixo é o
  // que garante que nada sai para a rede. Restaurado no `finally`, e a
  // restauração é conferida: deixar o processo do check em live seria um
  // efeito colateral caro (mesmo padrão de checkPollPolicy).
  const modoOriginal = process.env.PROVIDER_MODE;
  process.env.PROVIDER_MODE = "live";
  const words = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(" ");

  // Cada chamada consome a próxima resposta da fila e conta a requisição.
  let calls = 0;
  const queue: string[] = [];
  globalThis.fetch = (async () => {
    calls += 1;
    const text = queue.shift() ?? "";
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const run = async (responses: string[]) => {
    calls = 0;
    queue.length = 0;
    queue.push(...responses);
    const result = await generateScript({
      apiKey: "x",
      vendor: "gemini",
      prompt: "p",
      tenantId: "00000000-0000-0000-0000-000000000000",
    });
    return { ...result, calls };
  };

  try {
    // Dentro da banda na primeira: uma chamada só, sem corte.
    const ok = await run([`${words(band.min + 5)}.`]);
    if (ok.calls !== 1) fail("roteiro", `resposta boa deveria custar 1 chamada, custou ${ok.calls}.`);
    if (ok.truncated) fail("roteiro", "resposta dentro da banda não deveria ser cortada.");

    // Longa, depois boa: exatamente 2 chamadas, sem corte.
    const retried = await run([`${words(band.max + 40)}.`, `${words(band.min + 3)}.`]);
    if (retried.calls !== 2) fail("roteiro", `deveria ter tentado 2x, tentou ${retried.calls}.`);
    if (retried.truncated) fail("roteiro", "segunda tentativa dentro da banda não deveria ser cortada.");

    // Longa duas vezes: para em 2 chamadas (teto) e corta em fim de frase.
    const longSentences = "Uma frase completa aqui. " .repeat(60);
    const cut = await run([longSentences, longSentences]);
    if (cut.calls > 2) {
      fail("roteiro", `teto de chamadas ao vendor furado: ${cut.calls} — a cota não comporta laço.`);
    }
    if (!cut.truncated) fail("roteiro", "resposta longa nas duas tentativas deveria ter sido cortada.");
    if (cut.words > band.max) {
      fail("roteiro", `após o corte ainda restaram ${cut.words} palavras, acima do teto ${band.max}.`);
    }
    if (!/[.!?…]$/.test(cut.script)) {
      fail("roteiro", `o corte não terminou em fim de frase: "...${cut.script.slice(-40)}".`);
    }

    // Meta-comentário do modelo não pode virar fala do avatar. Este é o texto
    // real que o Gemini devolveu como se fosse roteiro.
    const meta = await run([
      `55 words! Target is 56 to 84 (aiming for ~70). Need to add a bit more text.\n\n*Draft 2 (Adjusting length):\n${words(band.min + 4)}.`,
      `${words(band.min + 4)}.`,
    ]);
    if (/draft|target is|\bwords!/i.test(meta.script)) {
      fail("roteiro", `meta-comentário do modelo sobreviveu e iria para o TTS: "${meta.script.slice(0, 80)}".`);
    }

    // Texto cortado pelo teto de tokens do vendor: chega curto E com a última
    // frase pela metade. Foi o que aconteceu ao vivo. A cauda incompleta tem
    // de ser descartada mesmo quando o tamanho não é o problema.
    const truncadoPeloVendor = `${words(30)}. Segunda frase completa aqui. Agora é possível criar conteúdos usando o seu próprio`;
    const cortadoPeloTeto = await run([truncadoPeloVendor, truncadoPeloVendor]);
    if (!/[.!?…]$/.test(cortadoPeloTeto.script)) {
      fail("roteiro", `texto truncado pelo vendor chegaria ao TTS com frase pela metade: "...${cortadoPeloTeto.script.slice(-40)}".`);
    }
    if (/usando o seu próprio$/.test(cortadoPeloTeto.script)) {
      fail("roteiro", "a cauda truncada não foi descartada.");
    }

    // Caso degenerado: texto sem pontuação nenhuma não tem cauda
    // identificável. Preservar é melhor que devolver vazio — um roteiro
    // estranho o usuário edita, um roteiro vazio quebra a tela.
    const semPontuacao = await run([words(60), words(60)]);
    if (semPontuacao.script.trim().length === 0) {
      fail("roteiro", "texto sem pontuação virou string vazia.");
    }

    note(`roteiro: banda [${band.min}, ${band.max}], teto de ${2} chamadas ao vendor respeitado, corte em fim de frase ok`);
    void countWords;
  } finally {
    globalThis.fetch = realFetch;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
    if (process.env.PROVIDER_MODE !== modoOriginal) {
      fail("roteiro", "PROVIDER_MODE não voltou ao valor original — o check alterou o estado que verifica.");
    }
  }
}

// Nenhuma resposta de API pode carregar texto do fornecedor. O caso que
// motivou isso: o copiloto público devolvia o corpo de erro do Google inteiro
// — modelo, tier, valor da cota — para qualquer visitante anônimo.
//
// Verifica as duas metades da garantia: que o vazamento sumiu do que vai ao
// cliente, e que o detalhe continua indo para o log do servidor (uma
// sanitização que também apaga o rastro de diagnóstico troca um problema por
// outro).
async function checkVendorErrorSanitization(): Promise<void> {
  const { toClientVendorError, classifyVendorFailure, vendorErrorMessage, vendorErrorStatus } =
    await import("../services/providers/vendorError.js");

  // Erros reais, copiados das respostas que estes fornecedores devolveram
  // durante o desenvolvimento.
  const casos: { nome: string; erro: string; esperado: string }[] = [
    {
      nome: "Gemini 429 (cota diária)",
      erro:
        'Gemini API error (429): {"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"20","model":"gemini-3.6-flash"}]}}',
      esperado: "rate_limited",
    },
    {
      nome: "Gemini 503 (sobrecarga)",
      erro: 'Gemini API error (503): {"error":{"code":503,"message":"This model is currently experiencing high demand."}}',
      esperado: "unavailable",
    },
    {
      nome: "Gemini 400 (chave inválida)",
      erro: 'Gemini API error (400): {"error":{"message":"API key not valid. Please pass a valid API key."}}',
      esperado: "auth",
    },
    {
      nome: "ElevenLabs 401 (sem permissão)",
      erro:
        'ElevenLabs API error (401): {"detail":{"status":"missing_permissions","message":"The API key you used is missing the permission user_read"}}',
      esperado: "auth",
    },
    {
      nome: "HeyGen 500",
      erro: 'HeyGen API error (500): {"error":{"message":"internal error"}}',
      esperado: "unavailable",
    },
    {
      nome: "timeout de rede",
      erro: "Could not reach ElevenLabs API: fetch failed: ETIMEDOUT",
      esperado: "unavailable",
    },
  ];

  // Fragmentos que jamais podem aparecer numa resposta de API.
  const PROIBIDO = [
    "gemini-3.6-flash",
    "FreeTier",
    "quotaValue",
    "RESOURCE_EXHAUSTED",
    "API key",
    "user_read",
    "missing_permissions",
    "generativelanguage",
    "elevenlabs",
    "heygen",
    "api error",
    "fetch failed",
    "ETIMEDOUT",
  ];

  const logged: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };

  try {
    for (const caso of casos) {
      const { failure, message } = toClientVendorError("script", "check", new Error(caso.erro));

      if (failure !== caso.esperado) {
        fail("erro de vendor", `"${caso.nome}" classificado como "${failure}", esperado "${caso.esperado}".`);
      }

      const lower = message.toLowerCase();
      for (const termo of PROIBIDO) {
        if (lower.includes(termo.toLowerCase())) {
          fail("erro de vendor", `a mensagem ao cliente para "${caso.nome}" contém "${termo}": "${message}".`);
        }
      }
      // Precisa ser útil ao usuário, não só inofensiva.
      if (message.length < 25 || !/[áâãéêíóôõúç]/i.test(message)) {
        fail("erro de vendor", `a mensagem para "${caso.nome}" não parece uma frase em pt-BR: "${message}".`);
      }
    }

    // O detalhe cru tem de continuar existindo — no servidor.
    const juntos = logged.join("\n");
    if (!juntos.includes("gemini-3.6-flash") || !juntos.includes("vendor_error")) {
      fail("erro de vendor", "o detalhe do fornecedor não está sendo registrado no log do servidor.");
    }

    // 429 vira 429 (o cliente pode tentar de novo); o resto vira 502.
    if (vendorErrorStatus(classifyVendorFailure(new Error("x (429)"))) !== 429) {
      fail("erro de vendor", "429 do fornecedor não está virando 429 na resposta.");
    }
    if (vendorErrorStatus("unavailable") !== 502) {
      fail("erro de vendor", "indisponibilidade deveria virar 502.");
    }

    // As três famílias de serviço falam do serviço, nunca do fornecedor.
    for (const kind of ["script", "voice", "avatar"] as const) {
      const msg = vendorErrorMessage(kind, "unavailable").toLowerCase();
      if (/heygen|elevenlabs|gemini|anthropic|openai|d-id/.test(msg)) {
        fail("erro de vendor", `a mensagem de "${kind}" cita o fornecedor: "${msg}".`);
      }
    }

    note(`erro de vendor: ${casos.length} falhas reais sanitizadas, detalhe preservado só no log`);
  } finally {
    console.error = realError;
  }
}

async function checkProbeSemantics(): Promise<void> {
  const { complete, AiEmptyResponseError, AiProviderError } = await import(
    "../services/providers/providerRegistry.js"
  );

  const realFetch = globalThis.fetch;
  // Mesma razão de checkScriptPipeline: estas asserções são sobre como o
  // registry INTERPRETA a resposta do vendor (200 sem texto, 400 de chave,
  // 429 de cota), e desde o 5D-1 `complete()` desvia para fixture antes de
  // chegar lá. O `fetch` substituído abaixo é o que impede a rede.
  const modoOriginal = process.env.PROVIDER_MODE;
  process.env.PROVIDER_MODE = "live";
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
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
    if (process.env.PROVIDER_MODE !== modoOriginal) {
      fail("probe", "PROVIDER_MODE não voltou ao valor original — o check alterou o estado que verifica.");
    }
  }
}

// Só executa quando é o módulo invocado, e não quando alguém o importa.
//
// Sem esta guarda, importar este arquivo para ler a lista de MUTANTS rodava o
// gate inteiro como efeito colateral — o coletor devolvia JSON seguido do
// relatório do check, e o arnês engasgava. Um módulo que age ao ser importado
// é uma armadilha para o próximo que precisar de qualquer coisa dele.
const invocadoDiretamente = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/checkPolicy.ts");
if (invocadoDiretamente) {
  main().catch((err) => {
    console.error("checkPolicy falhou de forma inesperada:", err);
    process.exit(1);
  });
}
