/**
 * Invariantes da TRADUÇÃO FIEL de Cenário/Traje — irmã de
 * `checkTranslationPolicy.ts`, separada porque o módulo e a instrução ao
 * modelo são outros (fiel, não interpretativa; um campo pode faltar).
 *
 * Item B (L1, 21/09/2026) — a invariante "nunca existe `*_en` fora de
 * sincronia com o pt atual" é AUSÊNCIA de código (nenhuma UPDATE fora da
 * criação pode tocar `scenario_prompt_en`/`outfit_prompt_en`), e ausência não
 * se exercita chamando função — mesma técnica da checagem irmã em
 * `checkTranslationPolicy.ts` ("o roteiro nunca passa pelo tradutor"). Por
 * isso ela não é um mutante find/replace: é uma checagem estática, ao final
 * de `checkSceneTextTranslationPolicy()`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { SceneTextTranslationError, translateSceneText } from "../services/video/sceneTextTranslation.js";
import type { Mutant } from "./mutants.js";

const MODULO_SRC = "backend/src/services/video/sceneTextTranslation.ts";
const ROTA = "backend/src/routes/videos.ts";
const PROVIDER = "backend/src/services/providers/avatarProvider.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "cena-texto: falha RECUSA a geração, nunca envia o português",
    name: "falha do modelo cai em devolver os textos de origem",
    kind: "esperto",
    file: MODULO_SRC,
    find: "    throw new SceneTextTranslationError(err instanceof Error ? err.message : String(err));",
    replace: "    return { scenarioEnglish: input.scenario, outfitEnglish: input.outfit };",
    expect: "devolveu os textos de origem em vez de falhar",
  },
  {
    guard: "cena-texto: campo pedido sem tradução na resposta é falha",
    name: "resposta incompleta deixa de ser tratada como falha",
    kind: "esperto",
    file: MODULO_SRC,
    // `String(1) === "sentinela"`, não `false` literal: um `if (false)` já
    // quebrou o `tsc` neste projeto (bloco "definitivamente inalcançável",
    // V34) por estreitar tipos de um jeito que o resto do bloco não espera.
    find: "  if ((input.scenario && !scenarioEnglish) || (input.outfit && !outfitEnglish)) {",
    replace: '  if (String(1) === "sentinela") {',
    expect: "o modelo não devolveu todos os campos pedidos",
  },
  {
    guard: "cena-texto: não debita crédito",
    name: "a tradução de cena passa a debitar crédito de roteiro",
    kind: "esperto",
    file: MODULO_SRC,
    find: 'import { logEvent } from "../log/safeLog.js";',
    replace:
      'import { logEvent } from "../log/safeLog.js";\nimport { debitCredit } from "../billing/creditGate.js";',
    expect: "apareceu no módulo de tradução de cena",
  },
  {
    guard: "cena-texto: a flag TRANSLATE_SCENE_TEXT continua a gatilhar a chamada",
    name: "a tradução de cena roda mesmo com a flag desligada",
    kind: "obvio",
    file: ROTA,
    find: "    if (TRANSLATE_SCENE_TEXT && (scenarioPromptParaGerar || outfitPromptParaGerar)) {",
    replace: "    if (scenarioPromptParaGerar || outfitPromptParaGerar) {",
    expect: "a flag TRANSLATE_SCENE_TEXT não gatilha mais a tradução de cena",
  },
  {
    guard: "cena-texto: a composição usa o INGLÊS quando existe",
    name: "a composição na criação ignora a tradução do cenário",
    kind: "esperto",
    file: PROVIDER,
    find: "    cenarioTexto: input.scenarioPromptEn ?? input.scenarioPrompt,",
    replace: "    cenarioTexto: input.scenarioPrompt,",
    expect: "a composição ignora o cenário traduzido",
  },
  {
    guard: "cena-texto: a composição usa o INGLÊS quando existe",
    name: "a composição na criação ignora a tradução do traje",
    kind: "esperto",
    file: PROVIDER,
    find: "    trajeTexto: input.outfitPromptEn ?? input.outfitPrompt,",
    replace: "    trajeTexto: input.outfitPrompt,",
    expect: "a composição ignora o traje traduzido",
  },
  {
    guard: "cena-texto: a composição usa o INGLÊS quando existe",
    name: "a composição na aprovação/recompose ignora a tradução do cenário",
    kind: "esperto",
    file: ROTA,
    find: "      cenarioTexto: video.scenario_prompt_en ?? video.scenario_prompt,",
    replace: "      cenarioTexto: video.scenario_prompt,",
    expect: "a composição ignora o cenário traduzido",
  },
  {
    guard: "cena-texto: a composição usa o INGLÊS quando existe",
    name: "a composição na aprovação/recompose ignora a tradução do traje",
    kind: "esperto",
    file: ROTA,
    find: "      trajeTexto: video.outfit_prompt_en ?? video.outfit_prompt,",
    replace: "      trajeTexto: video.outfit_prompt,",
    expect: "a composição ignora o traje traduzido",
  },
];

export interface SceneTextTranslationCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf8").replace(/\r\n/g, "\n");
}

export async function checkSceneTextTranslationPolicy(
  repoRoot: string,
): Promise<SceneTextTranslationCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // O caminho inglês NÃO PODE tocar em rede — mesma prova de `translateDirection`.
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("BOMBA: o caminho de interface em inglês chamou a rede (cena-texto)");
  }) as typeof fetch;
  try {
    const r = await translateSceneText({
      tenantId: "tenant-de-teste",
      apiKey: "irrelevante",
      vendor: "gemini",
      scenario: "neon hallway",
      outfit: "leather jacket",
      locale: "en",
    });
    if (r.scenarioEnglish !== "neon hallway" || r.outfitEnglish !== "leather jacket") {
      failures.push(
        "cena-texto: com a interface em inglês os textos deveriam voltar inalterados e sem chamada — " +
          `recebi ${JSON.stringify(r)}.`,
      );
    }
  } catch (err) {
    failures.push(
      "cena-texto: com a interface em inglês a função tocou a rede — " +
        (err instanceof Error ? err.message : String(err)),
    );
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  // Falha do fornecedor RECUSA, com o tipo de erro certo.
  globalThis.fetch = (async () => {
    throw new Error("fornecedor de texto fora do ar (simulado pela guarda)");
  }) as typeof fetch;
  try {
    await translateSceneText({
      tenantId: "tenant-de-teste",
      apiKey: "irrelevante",
      vendor: "gemini",
      scenario: "corredor com luz neon",
      outfit: null,
      locale: "pt-BR",
    });
    failures.push("cena-texto: a falha do modelo não recusou a tradução.");
  } catch (err) {
    if (!(err instanceof SceneTextTranslationError)) {
      failures.push(
        `cena-texto: a falha lançou ${err instanceof Error ? err.constructor.name : typeof err} em vez de ` +
          "SceneTextTranslationError.",
      );
    }
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  // A tradução acontece ANTES do débito — mesma checagem posicional de
  // `checkTranslationPolicy.ts`, aplicada ao novo call site.
  const rota = lerDaRaiz(repoRoot, ROTA);
  const posTraducaoCena = rota.indexOf("await translateSceneText(");
  const posDebito = rota.indexOf("const debit = await debitCredit(");
  if (posTraducaoCena < 0 || posDebito < 0 || posTraducaoCena > posDebito) {
    failures.push(
      "cena-texto: ela deixou de acontecer ANTES do débito. Traduzir depois obriga a estornar quando o " +
        "modelo falha, e estorno só vale antes do aceite do fornecedor.",
    );
  }

  // Item B (L1) — a invariante é AUSÊNCIA: nenhuma UPDATE fora da criação
  // pode tocar `scenario_prompt_en`/`outfit_prompt_en`. Só existe UM
  // escritor (o INSERT de `POST /videos`); qualquer UPDATE que aparecer
  // citando essas colunas abre a janela exata que este bloco existe para
  // fechar — `*_en` desincronizado do pt atual.
  const rotaSemComentarios = rota
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
  if (/UPDATE\s+videos\s+SET[^;]*(scenario_prompt_en|outfit_prompt_en)/s.test(rotaSemComentarios)) {
    failures.push(
      "cena-texto: alguma rota faz UPDATE de scenario_prompt_en/outfit_prompt_en fora da criação. Essas " +
        "colunas só podem nascer junto do pt, no mesmo INSERT — uma UPDATE separada abre a janela exata " +
        "que este bloco existe para fechar: *_en desincronizado do pt atual.",
    );
  }

  notes.push(
    "cena-texto: caminho inglês provado sem tocar a rede, falha do modelo provada RECUSANDO, tradução " +
      "confirmada ANTES do débito, e nenhuma UPDATE fora da criação toca as colunas *_en",
  );
  return { failures, notes };
}
