/**
 * TODO MUTANTE DECLARADO AINDA CASA — exatamente 1× — no arquivo que ele muta.
 *
 * ┌─ O defeito que esta guarda fecha, e o que ele custou ───────────────────┐
 * │ Um mutante cujo `find` deixou de casar não reprova nada: ele aborta com  │
 * │ ERRO no meio da passada, e a guarda que ele deveria provar fica SEM      │
 * │ PROVA — verde no gate, sem ninguém tendo verificado que ela reprova.     │
 * │                                                                          │
 * │ E o custo de descobrir isso era desproporcional: a passada completa leva │
 * │ ~80 min, e o ERRO aparece na posição do mutante. Dois deles ficaram      │
 * │ latentes por TRÊS rodadas em 12/08 — um desde o BLOCO 2, que acrescentou │
 * │ uma linha e fez um `find` passar a casar duas vezes; outro desde         │
 * │ `e483929`, que renomeou uma variável no frontend. Nenhuma das duas       │
 * │ mudanças tinha como saber que quebrava um mutante.                       │
 * │                                                                          │
 * │ Aqui a conferência custa MILISSEGUNDOS e roda no `npm run check`: ela    │
 * │ não aplica mutação nenhuma, não roda gate, só lê arquivo e conta         │
 * │ ocorrências. O ciclo passa a avisar no commit, não 80 min depois.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ela NÃO substitui o arnês: contar ocorrência prova que o mutante ainda se
 * aplica, nunca que a guarda reprova. É o mesmo raciocínio do cabeçalho de
 * `mutants.ts`, um nível antes — contagem não detecta guarda inerte, mas
 * detecta mutante podre, e podre ele não chega a exercitar guarda nenhuma.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Mutant } from "./mutants.js";
import { config } from "../config.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "registro de mutantes: todo find casa exatamente 1x",
    name: "um mutante deixa de casar no alvo (find podre)",
    kind: "obvio",
    // O defeito REAL de 12/08, reproduzido: o `find` de um mutante deixa de
    // existir no arquivo. Aqui a vítima é o mutante do teto de polling, e o
    // alvo é a própria declaração dele — mudar o texto procurado é
    // indistinguível, para esta guarda, de alguém ter renomeado a linha no
    // produto.
    file: "backend/src/scripts/checkFalPipelinePolicy.ts",
    // Sob o arnês a conferência é PULADA por construção (ver o corpo da
    // guarda); estes dois mutantes a forçam de volta, porque são os únicos que
    // querem exatamente o estado "há mutante aplicado".
    env: { ARNES_CONFERE_REGISTRO: "1" },
    find: '    find: "    if (Date.now() >= limite) {",',
    replace: '    find: "    if (Date.now() >= limite) { // linha que nao existe",',
    expect: "não casam mais no alvo (esperado exatamente 1 ocorrência)",
  },
  {
    guard: "registro de mutantes: todo find casa exatamente 1x",
    name: "um find passa a casar DUAS vezes no alvo",
    kind: "esperto",
    // ESPERTO, e é o caso que aconteceu de verdade: ninguém tocou no mutante.
    // Alguém acrescentou uma linha ao PRODUTO — no caso real, a linha da fal em
    // VENDOR_FORMAT_SUPPORT — e o trecho procurado deixou de ser único. O
    // mutante continua escrito corretamente e mesmo assim não se aplica mais.
    file: "backend/src/services/video/falPipeline.ts",
    env: { ARNES_CONFERE_REGISTRO: "1" },
    find: "export const PIPELINE_POLL_INTERVAL_MS = 5_000;",
    replace:
      "export const PIPELINE_POLL_INTERVAL_MS = 5_000;\n" +
      "/** duplicata deliberada do arnês */\n" +
      "const OUTRO_INTERVALO_IGUAL = 5_000;\n" +
      "void OUTRO_INTERVALO_IGUAL;\n" +
      "// export const PIPELINE_POLL_INTERVAL_MS = 5_000;",
    expect: "não casam mais no alvo (esperado exatamente 1 ocorrência)",
  },
];

export interface MutantRegistryCheckResult {
  failures: string[];
  notes: string[];
}

/**
 * Onde o arquivo do mutante está DENTRO do container.
 *
 * O runner roda no host, onde tudo é relativo à raiz do repositório. Aqui só
 * está montado o que o compose declara: `/repo` tem backend, frontend, tools e
 * o docker-compose.yml — mas **não tem `docs/`**, que é montado em
 * `/app/docs` (MEDIDO em 12/08: `ls /repo/docs` devolve "No such file or
 * directory"). Sem este mapeamento, os 4 mutantes de documentação apareceriam
 * como podres, que é o falso positivo mais perigoso possível numa guarda cujo
 * trabalho é acusar mutante podre.
 */
function caminhoNoContainer(repoRoot: string, file: string): string {
  if (file === "docs" || file.startsWith("docs/")) {
    return join(config.docsDir, file.slice("docs/".length));
  }
  return join(repoRoot, file);
}

/**
 * A MESMA normalização do runner (`tools/run-mutants.mjs`).
 *
 * O working copy vem em CRLF no Windows e os `find` são escritos com `\n`. Sem
 * isto, todo mutante multi-linha contaria zero ocorrências e esta guarda
 * acusaria o repositório inteiro de podre — o falso positivo em massa.
 */
function normalizar(conteudo: string, find: string): string {
  return conteudo.includes("\r\n") ? find.replace(/\n/g, "\r\n") : find;
}

export async function checkMutantRegistryPolicy(repoRoot: string): Promise<MutantRegistryCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // Import DINÂMICO, e não estático, por causa de um ciclo real: o registro
  // importa os MUTANTS de `checkPolicy.ts`, que importa esta guarda, que
  // precisa do registro. Estático, o ciclo estoura na carga com "Cannot access
  // 'policyMutants' before initialization" — MEDIDO. Dentro da função, o ciclo
  // já está resolvido quando ela roda.
  // ┌─ PULADA sob o arnês, e não é frouxidão: é a proposição ────────────────┐
  // │ Esta guarda afirma "todo find casa 1x NA ÁRVORE LIMPA". Durante uma     │
  // │ passada a árvore está mutada POR CONSTRUÇÃO — o mutante aplicado altera │
  // │ o trecho que ele mesmo procura, e a guarda acusaria a si própria a cada │
  // │ um dos 233.                                                             │
  // │                                                                          │
  // │ O estrago não seria só ruído: os contrapontos `expectGreen` exigem gate  │
  // │ VERDE, e uma violação extra em toda aplicação derrubaria TODOS eles de   │
  // │ uma vez. É exatamente o defeito de 06/08, quando nove contrapontos       │
  // │ caíram juntos por uma condição só (o PROVIDER_MODE herdado) e a leitura  │
  // │ fácil foi "nove guardas apodreceram".                                    │
  // │                                                                          │
  // │ MEDIDO antes de existir este desvio: os 3 mutantes consertados nesta     │
  // │ rodada já vinham com uma violação extra desta guarda em cada um.         │
  // └──────────────────────────────────────────────────────────────────────────┘
  const souArnes = process.env.ARNES_EM_CURSO === "1";
  const forcada = process.env.ARNES_CONFERE_REGISTRO === "1";
  if (souArnes && !forcada) {
    notes.push(
      "  registro de mutantes: PULADO — há mutante aplicado (ARNES_EM_CURSO), e sob mutação a " +
        "proposição é falsa por construção. A conferência vale no gate de árvore limpa.",
    );
    return { failures, notes };
  }

  const { ALL_MUTANTS } = await import("./mutantRegistry.js");

  const comArquivo = ALL_MUTANTS.filter((m) => m.file);
  const podres: string[] = [];
  const ilegiveis: string[] = [];
  let conferidos = 0;

  for (const m of comArquivo) {
    const alvo = caminhoNoContainer(repoRoot, m.file!);
    let conteudo: string;
    try {
      conteudo = readFileSync(alvo, "utf-8");
    } catch {
      ilegiveis.push(`${m.guard} :: ${m.name} → ${m.file}`);
      continue;
    }
    conferidos += 1;

    const find = normalizar(conteudo, m.find!);
    const ocorrencias = conteudo.split(find).length - 1;
    if (ocorrencias !== 1) {
      podres.push(
        `${m.guard} :: ${m.name} — ${ocorrencias}x em ${m.file} ` +
          `(find: ${JSON.stringify(m.find!.slice(0, 70))})`,
      );
    }
  }

  if (podres.length > 0) {
    failures.push(
      `registro de mutantes: ${podres.length} mutante(s) não casam mais no alvo (esperado exatamente ` +
        `1 ocorrência):\n      ${podres.join("\n      ")}\n    ` +
        "Um mutante que não se aplica não reprova nada: ele aborta com ERRO no meio da passada e deixa " +
        "a guarda dele SEM PROVA, verde no gate e nunca exercitada. ZERO ocorrência é o `find` que " +
        "apodreceu junto com o código; DUAS é alguém ter acrescentado uma linha ao produto e tornado o " +
        "trecho ambíguo — foi o que o BLOCO 2 fez sem ter como saber. Conserto: dar CONTEXTO ÚNICO ao " +
        "find, nunca apagar a linha nova do produto.",
    );
  }

  if (ilegiveis.length > 0) {
    failures.push(
      `registro de mutantes: ${ilegiveis.length} alvo(s) que não consegui ler:\n      ` +
        `${ilegiveis.join("\n      ")}\n    ` +
        "Verificador cego é pior que reprovar: um alvo ilegível daqui é um mutante que esta guarda " +
        "deixa de conferir sem dizer nada. Se o arquivo existe no host mas não no container, o " +
        "mapeamento de `caminhoNoContainer` precisa cobri-lo — foi o caso de `docs/`, montado em " +
        "/app/docs e ausente de /repo.",
    );
  }

  // Universo-zero reprova: uma varredura que não confere nada tem a mesma
  // aparência de um registro impecável.
  if (conferidos === 0) {
    failures.push(
      "registro de mutantes: NENHUM mutante foi conferido. O registro tem " +
        `${ALL_MUTANTS.length} entradas — a varredura deixou de casar com o código.`,
    );
  }

  if (failures.length === 0) {
    notes.push(
      `  registro de mutantes: ${conferidos} de ${ALL_MUTANTS.length} declarados casam exatamente 1x no ` +
        `alvo (${ALL_MUTANTS.length - comArquivo.length} são de ambiente e não têm arquivo)`,
    );
  }

  return { failures, notes };
}
