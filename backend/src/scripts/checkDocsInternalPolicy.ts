/**
 * O histórico de engenharia não alcança copiloto nenhum — provado por EXECUÇÃO.
 *
 * POR QUE ESTA GUARDA EXISTE, e por que ela não podia ser mais uma inspeção de
 * fonte: até o HIGIENE-1, tudo o que este projeto sabia sobre exposição de
 * documentação vinha de asserções sobre a LISTA — está no manifesto, está na
 * lista de excluídos, vive sob prefixo barrado. Nenhuma delas monta o prompt.
 * Uma allowlist correta e um carregador que a ignora produzem exatamente o
 * mesmo verde, e foi assim que o `loadDocsContent()` antigo varreu
 * `docs/**\/*.md` inteiro por vários blocos, com o manifesto do lado, certo,
 * sem ser consultado.
 *
 * Então esta guarda faz a única coisa que separa as duas situações: **monta o
 * prompt de verdade, com o carregador de produção, contra um disco que contém
 * a isca.** Três arquivos-isca vão para uma árvore de prova — um sob
 * `docs-internal/`, um sob `historico/` (o nome antigo, caso alguém o recrie) e
 * um solto na raiz de docs, sem classificação nenhuma. Se qualquer marcador
 * sair no prompt público ou no de tenant, a guarda reprova.
 *
 * A asserção que impede o falso verde: um prompt VAZIO também não contém
 * marcador nenhum. Por isso a árvore de prova carrega um marcador de CONTROLE,
 * plantado dentro de dois arquivos legítimos e classificados, e a guarda exige
 * que ele APAREÇA. Sem essa metade, apagar o corpo de `buildDocsContent`
 * deixaria tudo verde — o teste estaria medindo o nada.
 */
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";
import { loadDocsContent, loadPublicDocsContent, resetDocsCache } from "../services/docs.js";
import type { Mutant } from "./mutants.js";

export interface DocsInternalCheckResult {
  failures: string[];
  notes: string[];
}

/**
 * Nomes FIXOS, e não aleatórios, de propósito: um mutante precisa conseguir
 * citar a isca para classificá-la no manifesto. Marcador sorteado a cada
 * execução tornaria a guarda impossível de atacar — e guarda que não se
 * consegue atacar é guarda que não se consegue provar.
 */
export const ISCA_DOCS_INTERNAL = "docs-internal/00-referencia-do-projeto.md";
export const ISCA_HISTORICO = "historico/03-blocos-fechados.md";
export const ISCA_SOLTA = "memoria-de-engenharia.md";

const MARCA_DOCS_INTERNAL = "MARCADOR-HIGIENE1-DOCSINTERNAL-8f2b41";
const MARCA_HISTORICO = "MARCADOR-HIGIENE1-HISTORICO-6d7c93";
const MARCA_SOLTA = "MARCADOR-HIGIENE1-SOLTA-2a5e08";
const MARCA_CONTROLE = "MARCADOR-HIGIENE1-CONTROLE-c41d7a";

/** Onde o marcador de controle é plantado, e em que prompt ele tem de sair. */
const CONTROLES = [
  { arquivo: "faq.md", audiencia: "público" as const },
  { arquivo: "screens/painel.md", audiencia: "tenant" as const },
];

export const MUTANTS: Mutant[] = [
  {
    guard: "docs-internal fora de todo copiloto",
    name: "o carregador volta a varrer o diretório em vez de usar a allowlist",
    kind: "obvio",
    // Este mutante RESTAURA o defeito histórico, palavra por palavra: é o
    // `loadDocsContent()` que varria docs/**/*.md e que o comentário no topo
    // de docsManifest.ts descreve. Nenhuma asserção sobre a lista muda de cor
    // — o manifesto continua exatamente igual, correto e completo. Só o prompt
    // muda, e só quem monta o prompt vê.
    file: "backend/src/services/docs.ts",
    find: `  const allowed = Object.entries(DOCS_MANIFEST)
    .filter(([, docAudience]) => audienceAllows(viewer, docAudience))
    .map(([relativePath]) => relativePath)
    .sort();`,
    replace: `  const allowed = (await collectMarkdownFiles(config.docsDir)).map(toRelativeKey).sort();`,
    expect: "chegou ao prompt",
  },
  {
    guard: "docs-internal fora de todo copiloto",
    name: "um arquivo sob docs-internal/ é classificado no manifesto",
    kind: "esperto",
    // O modo de falha REAL, e o mais provável: ninguém reescreve o carregador
    // — alguém classifica um arquivo. A asserção 1b não pega mais isto, porque
    // DOCS_EXCLUDED_PREFIXES está vazia desde que o histórico saiu de `docs/`.
    // A seção 2 ("cita arquivo que não existe no disco") também não pega no
    // caso que importa: se o arquivo EXISTIR sob docs/docs-internal/, ela fica
    // verde e o conteúdo entra no prompt. Só montar o prompt separa as duas.
    file: "backend/src/services/docsManifest.ts",
    find: `  "screens/painel.md": "tenant",`,
    replace: `  "screens/painel.md": "tenant",\n  "docs-internal/00-referencia-do-projeto.md": "tenant",`,
    expect: "chegou ao prompt",
  },
  {
    guard: "docs-internal fora de todo copiloto",
    name: "o prompt de tenant continua sendo montado (contraponto)",
    kind: "esperto",
    expectGreen: true,
    // Sem este contraponto, um carregador que devolvesse string vazia passaria
    // nos dois mutantes acima — nenhum marcador aparece num prompt que não
    // existe. Aqui um doc de tenant é reclassificado para MAIS restritivo
    // (admin): o conteúdo sai do prompt de tenant, o que não é vazamento
    // nenhum, e esta guarda tem de continuar verde. Ela opina sobre o que
    // ESCAPA, não sobre quem vê o quê.
    file: "backend/src/services/docsManifest.ts",
    find: `  "screens/conteudo.md": "tenant",`,
    replace: `  "screens/conteudo.md": "admin",`,
    expect: "iscas plantadas",
  },
];

/** Copia recursivamente só os `.md`, preservando a estrutura de diretórios. */
async function copiarMarkdown(origem: string, destino: string, base = origem): Promise<number> {
  const { readdir } = await import("node:fs/promises");
  let copiados = 0;
  for (const entry of await readdir(origem, { withFileTypes: true })) {
    const full = path.join(origem, entry.name);
    if (entry.isDirectory()) {
      copiados += await copiarMarkdown(full, destino, base);
    } else if (entry.name.endsWith(".md")) {
      const rel = path.relative(base, full);
      const alvo = path.join(destino, rel);
      await mkdir(path.dirname(alvo), { recursive: true });
      await cp(full, alvo);
      copiados += 1;
    }
  }
  return copiados;
}

export async function checkDocsInternalPolicy(): Promise<DocsInternalCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- 1. o diretório antigo não voltou a existir dentro de docs/ ----------
  //
  // Barato e vale a pena: recriar `docs/historico/` é o jeito mais provável de
  // desfazer o HIGIENE-1 sem querer — um `git mv` revertido, um arquivo novo
  // salvo no caminho antigo por hábito.
  const historicoAntigo = path.join(config.docsDir, "historico");
  try {
    if ((await stat(historicoAntigo)).isDirectory()) {
      failures.push(
        `docs/historico/ voltou a existir. Ele foi movido para docs-internal/, na RAIZ do repositório, ` +
          "porque memória de engenharia — custos medidos, nomes de variáveis de chave, defeitos em " +
          "aberto — não é documentação de produto e não tem por que dividir árvore com ela. Dentro de " +
          "docs/ ela depende de uma regra para não vazar; fora, não está no caminho de varredura nenhuma.",
      );
    }
  } catch {
    // Ausente é o esperado.
  }

  // --- 2. o prompt montado, contra um disco com isca ----------------------
  const arvore = await mkdtemp(path.join(os.tmpdir(), "docs-prova-"));
  const docsDirOriginal = config.docsDir;
  try {
    const copiados = await copiarMarkdown(docsDirOriginal, arvore);
    if (copiados === 0) {
      failures.push(
        `não copiei nenhum .md de ${docsDirOriginal} para a árvore de prova. Sem árvore não há ` +
          "experimento, e uma guarda que não roda é pior que guarda nenhuma.",
      );
      return { failures, notes };
    }

    // As iscas. Conteúdo com cara de memória de engenharia de propósito: se um
    // dia isto vazar, o que se lê na saída da guarda é o tipo de texto que
    // estaria vazando de verdade.
    const iscas: Array<[string, string]> = [
      [ISCA_DOCS_INTERNAL, MARCA_DOCS_INTERNAL],
      [ISCA_HISTORICO, MARCA_HISTORICO],
      [ISCA_SOLTA, MARCA_SOLTA],
    ];
    for (const [rel, marca] of iscas) {
      const alvo = path.join(arvore, rel);
      await mkdir(path.dirname(alvo), { recursive: true });
      await writeFile(
        alvo,
        `# Memória de engenharia (isca do gate)\n\n${marca}\n\n` +
          "Vídeo custa US$ 0,05 por segundo inteiro truncado; a chave vive em PLATFORM_HEYGEN_API_KEY.\n",
        "utf-8",
      );
    }

    // O controle: plantado DENTRO de arquivos legítimos e classificados. É ele
    // que distingue "nada vazou" de "nada foi montado".
    for (const { arquivo } of CONTROLES) {
      const alvo = path.join(arvore, arquivo);
      try {
        const atual = await readFile(alvo, "utf-8");
        await writeFile(alvo, `${atual}\n\n${MARCA_CONTROLE}\n`, "utf-8");
      } catch {
        failures.push(
          `não consegui plantar o marcador de controle em docs/${arquivo}. Sem controle, a ausência ` +
            "das iscas não prova nada — um prompt vazio também não contém isca.",
        );
      }
    }

    // Troca o disco sob os pés do carregador REAL de produção e derruba o
    // cache. Não é injeção de teste em código de produção: `config.docsDir` já
    // é lido a cada montagem, e o cache tem um limpador declarado para isto.
    config.docsDir = arvore;
    resetDocsCache();

    const promptPublico = await loadPublicDocsContent();
    const promptTenant = await loadDocsContent();

    const montados = [
      { nome: "público", texto: promptPublico },
      { nome: "tenant", texto: promptTenant },
    ];

    // 2a. o controle apareceu — o experimento realmente rodou.
    for (const { arquivo, audiencia } of CONTROLES) {
      const alvo = montados.find((m) => m.nome === audiencia);
      if (!alvo?.texto.includes(MARCA_CONTROLE)) {
        failures.push(
          `o marcador de CONTROLE plantado em docs/${arquivo} não apareceu no prompt "${audiencia}" ` +
            `(${alvo?.texto.length ?? 0} chars). O experimento não rodou: ou o carregador leu outra ` +
            "árvore, ou o prompt saiu vazio. A ausência das iscas abaixo, nessa situação, não prova nada.",
        );
      }
    }

    // 2b. nenhuma isca escapou.
    for (const [rel, marca] of iscas) {
      for (const { nome, texto } of montados) {
        if (texto.includes(marca)) {
          failures.push(
            `o conteúdo de docs/${rel} chegou ao prompt "${nome}". Esse caminho carrega memória de ` +
              "ENGENHARIA — custo medido contra fornecedor, nome de variável de chave, defeito em " +
              "aberto — e o copiloto o entregaria a quem perguntasse. A allowlist de DOCS_MANIFEST é " +
              "a única coisa entre esse texto e o cliente: nada que não esteja nela pode ser lido.",
          );
        }
        // O nome do arquivo sozinho já é vazamento: diz que ele existe e do
        // que trata. É a mesma lição do README de docs/, que vazou os nomes de
        // docs/admin/ sem citar uma linha do conteúdo.
        const base = rel.split("/").pop() as string;
        if (texto.replace(/^## .+$/gm, "").includes(base)) {
          failures.push(
            `o prompt "${nome}" cita o nome do arquivo "${base}", que vive fora de todo copiloto. ` +
              "Um índice é tão confidencial quanto o item mais confidencial que ele indexa.",
          );
        }
      }
    }

    notes.push(
      `docs-internal: ${iscas.length} iscas plantadas (sob docs-internal/, sob historico/ e solta na ` +
        `raiz), prompt público ${promptPublico.length} chars e tenant ${promptTenant.length} chars ` +
        "montados com o carregador de produção — controle presente, nenhuma isca escapou",
    );
  } finally {
    config.docsDir = docsDirOriginal;
    resetDocsCache();
    await rm(arvore, { recursive: true, force: true });
  }

  return { failures, notes };
}
