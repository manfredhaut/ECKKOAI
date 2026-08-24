/**
 * O ENSAIO NÃO GASTA — e isso é MEDIDO, não prometido (R7.5, 24/08).
 *
 * ┌─ Por que uma guarda, se fixture já desvia antes da rede ─────────────────┐
 * │ Porque "fixture desvia" é uma propriedade de OUTRO arquivo               │
 * │ (`checkProviderMode.ts` reprova o build se algum export de provider      │
 * │ deixar de consultar `isFixtureMode()`), e o ensaio é um script novo que  │
 * │ pode ganhar uma chamada direta a qualquer momento — um `fetch` para      │
 * │ conferir saldo, um upload "só para testar". Nenhuma dessas passaria por  │
 * │ um provider, e portanto nenhuma seria pega por aquela guarda.            │
 * │                                                                          │
 * │ Aqui a prova é do ensaio INTEIRO: `globalThis.fetch` é substituído por   │
 * │ um contador, o ensaio roda de verdade, e o número esperado é ZERO. É a   │
 * │ diferença entre "os providers desviam" e "este script não fala com a     │
 * │ rede".                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  rodar o ensaio produz ZERO requisições de rede.
 *  G-2  o ensaio RECUSA rodar fora de fixture — em `live` ele executaria os
 *       dois níveis inteiros, e o Premium sozinho passa de US$ 2,50 pela
 *       régua num roteiro curto (mais de US$ 7 num de 15 s).
 *
 * ┌─ Como G-1 roda o ensaio sem que ele encerre o processo ──────────────────┐
 * │ `ensaioSimulado.ts` termina com `pool.end()` e, no caminho de erro,      │
 * │ `process.exit(1)` — os dois corretos para um script de linha de comando  │
 * │ e os dois fatais dentro do gate. Por isso a guarda importa as PARTES     │
 * │ (`ensaiarNivel`, `ensaiarFalhaParcial`), não o `main`: o que se quer     │
 * │ medir é o que os caminhos fazem, e o `main` só os enfileira e desliga o  │
 * │ banco.                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO — e é literalmente o que esta guarda mede.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { ensaiarFalhaParcial, ensaiarNivel } from "./ensaioSimulado.js";

const ENSAIO = "backend/src/scripts/ensaioSimulado.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "o ensaio recusa rodar fora de fixture",
    name: "o ensaio deixa de conferir o modo do provider",
    kind: "obvio",
    file: ENSAIO,
    find: "  if (!isFixtureMode()) {",
    replace: "  if (false as boolean) {",
    expect: "ensaio: não recusa rodar fora de fixture",
  },
  {
    guard: "o ensaio não emite requisição de rede nenhuma",
    name: "o ensaio ganha uma chamada de rede direta",
    kind: "esperto",
    // ESPERTO: um `fetch` de LEITURA, para "conferir o saldo antes de
    // ensaiar" — o tipo de linha que entra num script de diagnóstico sem
    // ninguém achar ruim. Ela não passa por provider nenhum, então
    // `checkProviderMode.ts` não a vê; e não gasta dinheiro, então revisão
    // humana tende a deixar passar. O que ela quebra é a invariante que
    // torna o ensaio seguro de rodar sem pensar: que ele não fala com
    // fornecedor. Amanhã a mesma linha vira um POST.
    file: ENSAIO,
    find: '  console.log("ENSAIO SIMULADO — nenhuma chamada paga. PROVIDER_MODE=fixture confirmado.");',
    replace:
      '  await fetch("https://api.elevenlabs.io/v1/voices").catch(() => {});\n' +
      '  console.log("ENSAIO SIMULADO — nenhuma chamada paga. PROVIDER_MODE=fixture confirmado.");',
    expect: "ensaio: o arquivo do ensaio contém chamada de rede em código",
  },
];

export interface EnsaioSimuladoCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export async function checkEnsaioSimuladoPolicy(): Promise<EnsaioSimuladoCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-1 — zero rede, por EXECUÇÃO do ensaio de verdade
  // -------------------------------------------------------------------------
  const fetchOriginal = globalThis.fetch;
  const modoOriginal = process.env.PROVIDER_MODE;
  const logOriginal = console.log;
  const urls: string[] = [];
  let erro = "";

  try {
    globalThis.fetch = (async (entrada: unknown) => {
      urls.push(
        String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada),
      );
      // Uma resposta qualquer: o que se conta é a TENTATIVA, e devolver erro
      // faria o ensaio morrer antes de percorrer os caminhos seguintes — a
      // guarda mediria menos justamente quando houvesse mais o que medir.
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    process.env.PROVIDER_MODE = "fixture";

    // O ensaio IMPRIME muito, de propósito — é a saída dele para o operador.
    // Silenciar aqui mantém o relatório do gate legível sem mudar o que roda.
    console.log = () => {};
    await ensaiarNivel("normal");
    await ensaiarNivel("premium");
    await ensaiarFalhaParcial();
  } catch (err) {
    erro = String(err);
  } finally {
    console.log = logOriginal;
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  if (erro) {
    failures.push(
      `ensaio: os caminhos do ensaio lançaram — ${erro.slice(0, 240)}. O ensaio existe para ser rodado ` +
        "a qualquer momento sem pensar; um que não completa não serve de ensaio.",
    );
  }
  if (urls.length > 0) {
    failures.push(
      `ensaio: houve requisição de rede — ${urls.length} chamada(s), a primeira para ` +
        `${JSON.stringify(urls[0].slice(0, 120))}. O ensaio é o único caminho do produto que se pode ` +
        "rodar sem conferir nada antes, e essa garantia vale exatamente enquanto ele não falar com " +
        "fornecedor nenhum. Uma leitura hoje é um POST amanhã.",
    );
  } else if (!erro) {
    notes.push(
      "    ensaio: os dois níveis e a falha parcial rodam ponta a ponta com ZERO requisições de rede",
    );
  }

  // -------------------------------------------------------------------------
  // G-1b — a mesma invariante por FORMA, no arquivo INTEIRO
  //
  // A execução acima é a prova forte, e ela tem um alcance exato: só os
  // caminhos que esta guarda IMPORTA. MEDIDO em 24/08 — o primeiro mutante
  // desta guarda saiu INERTE por causa disso: ele punha um `fetch` dentro do
  // `main()`, que a guarda não importa (o `main` chama `pool.end()`, fatal
  // dentro do gate), e a execução seguia contando zero com o `fetch` ali no
  // arquivo.
  //
  // Esta perna cobre o que a outra não alcança: `main`, `ensaiarUsuarioNovo`,
  // e qualquer função futura. É mais fraca (lê texto) e mais ampla — as duas
  // juntas é que respondem "o ensaio não fala com fornecedor".
  const fonteInteira = lerDaRaiz(ENSAIO);
  const chamadasDeRede = fonteInteira
    .split("\n")
    .map((l, i) => ({ linha: l, n: i + 1 }))
    // Ignora comentário: o cabeçalho deste arquivo e do ensaio FALAM de
    // `fetch` para explicar por que ele não existe, e casar a explicação
    // seria reprovar a documentação da própria invariante.
    .filter(({ linha }) => !/^\s*(\*|\/\/)/.test(linha))
    .filter(({ linha }) => /\bfetch\s*\(/.test(linha));
  if (chamadasDeRede.length > 0) {
    failures.push(
      `ensaio: o arquivo do ensaio contém chamada de rede em código — linha(s) ` +
        `${chamadasDeRede.map((c) => c.n).join(", ")}. A execução desta guarda só alcança os caminhos que ` +
        "ela importa (`main` fica de fora, porque encerra o pool); esta conferência cobre o arquivo " +
        "inteiro. O ensaio é o único caminho do produto que se pode rodar sem conferir nada antes.",
    );
  } else {
    notes.push("    ensaio: nenhuma chamada de rede no arquivo inteiro, inclusive nos caminhos que a execução não alcança");
  }

  // -------------------------------------------------------------------------
  // G-2 — a recusa fora de fixture (FORMA: exercitá-la exigiria deixar o
  // ensaio chamar `process.exit`, que mataria o gate)
  // -------------------------------------------------------------------------
  const fonte = lerDaRaiz(ENSAIO);
  const posGuarda = fonte.indexOf("if (!isFixtureMode()) {");
  const posPrimeiroEnsaio = fonte.indexOf("await ensaiarNivel(");
  if (posGuarda < 0) {
    failures.push(
      "ensaio: não recusa rodar fora de fixture — em `live` este script executaria os DOIS níveis " +
        "inteiros com dinheiro real. Pela régua, o Premium sozinho passa de US$ 2,50 num roteiro curto " +
        "e de US$ 7 num de 15 s.",
    );
  } else if (posPrimeiroEnsaio >= 0 && posGuarda > posPrimeiroEnsaio) {
    failures.push(
      "ensaio: a recusa fora de fixture acontece DEPOIS do primeiro nível — o que ela impediria já " +
        "teria acontecido. A ordem é a propriedade, não a existência da recusa.",
    );
  } else {
    notes.push("    ensaio: recusa rodar fora de fixture, antes de qualquer caminho");
  }

  return { failures, notes };
}
