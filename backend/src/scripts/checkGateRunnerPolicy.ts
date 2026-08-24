/**
 * O ARNÊS PARALELO NÃO ESCREVE NO REPOSITÓRIO — V0, 24/08/2026.
 *
 * ┌─ A garantia é ESTRUTURAL, e é por isso que ela dá para guardar ──────────┐
 * │ O paralelo funciona porque cada worker escreve na CÓPIA dele             │
 * │ (`applyMutation(m, arvore)`, com `arvore` sempre um `git worktree` em    │
 * │ `os.tmpdir()`). Se um dia alguém chamar `applyMutation(m)` sem a árvore  │
 * │ dentro do pool, o default é o repositório principal — e seis workers     │
 * │ passariam a escrever no mesmo arquivo, cada um lendo a mutação do outro. │
 * │                                                                          │
 * │ O sintoma disso é o pior possível: vereditos que variam de passada para  │
 * │ passada sem nada no código mudar. Nenhuma guarda pega isso depois; esta  │
 * │ pega antes, na forma.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  o worker do pool passa a ÁRVORE a `applyMutation` — nunca a chama
 *       com um argumento só.
 *  G-2  as montagens de `gateRunner.mjs` cobrem TODAS as do serviço
 *       `backend` no compose. Uma montagem nova no compose e ausente lá faz
 *       o gate paralelo reprovar por arquivo faltando, e o sintoma parece
 *       defeito da guarda em vez de defeito da lista.
 *  G-3  o número de workers é o MEDIDO (6) e está declarado com a medição ao
 *       lado — não um "quantos núcleos houver", que a medição refuta.
 *  G-4  nenhum script do repositório canaliza um comando de VERIFICAÇÃO para
 *       `head`/`tail`/`grep` sem `set -o pipefail`. SIGPIPE não é sucesso.
 *
 * FORMA, e não execução: exercitar o pool exigiria git, docker e worktrees, e
 * o gate roda dentro do container (sem git, e com o repositório montado
 * parcialmente). É a mesma limitação de `estadoAnchor.mjs`. O que dá para
 * medir aqui é o que o código DIZ, e é o que se mede.
 *
 * Custo: ZERO.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const RUNNER = "tools/gateRunner.mjs";
const ARNES = "tools/run-mutants.mjs";
const COMPOSE = "docker-compose.yml";

/**
 * Comandos cujo EXIT CODE é o resultado — não a saída.
 *
 * Canalizar um destes para `head` faz o comando morrer por SIGPIPE quando o
 * `head` fecha o pipe, e o `$?` que volta é o do `head`: **zero**. MEDIDO em
 * 24/08 — reportei uma passada do arnês como lançada quando ela tinha morrido
 * após 11 linhas, e o `exit 0` que li era do `head`. Um verde que não existia.
 */
const COMANDOS_DE_VERIFICACAO = ["npm run check", "run-mutants", "tsc --noEmit", "npm test"];

/** Quem fecha o pipe cedo. `cat`, `tee` e `sed` leem tudo e não entram. */
const FECHAM_O_PIPE = ["head", "grep -q"];

export const MUTANTS: Mutant[] = [
  {
    guard: "o worker do pool escreve na cópia, nunca no repositório",
    name: "o worker aplica a mutação sem passar a árvore",
    kind: "esperto",
    // ESPERTO: `applyMutation(m)` compila, roda, e no primeiro mutante até
    // funciona — o default é o repositório principal. Com seis workers, cada
    // um passa a escrever no mesmo arquivo e a ler a mutação do vizinho. O
    // sintoma é veredito que muda de passada para passada sem o código mudar,
    // e nenhuma outra guarda deste projeto pega isso.
    file: ARNES,
    find: "        restore = applyMutation(m, arvore);",
    replace: "        restore = applyMutation(m);",
    expect: "arnês paralelo: o worker não passa a árvore",
  },
  {
    guard: "o número de workers é o medido",
    name: "o paralelismo vira um por núcleo",
    kind: "esperto",
    // ESPERTO: "um worker por núcleo" é o palpite que todo mundo faria, e a
    // MEDIÇÃO o refuta: com 12 núcleos, N=10 já é PIOR que N=6 (0,150 contra
    // 0,159 gates/s) porque o `tsc` satura a CPU. O mutante deixa o arnês
    // funcionando e mais lento — o tipo de regressão que ninguém percebe.
    file: ARNES,
    find: "const WORKERS_PADRAO = 6;",
    replace: "const WORKERS_PADRAO = os.cpus().length;",
    expect: "arnês paralelo: o número de workers não é o medido",
  },
  {
    guard: "SIGPIPE não é sucesso",
    name: "um script passa a canalizar a verificação para head",
    kind: "esperto",
    // ESPERTO: `| head -20` é o que qualquer pessoa escreve para não encher a
    // tela, e o script continua "funcionando" — imprime o começo da saída e
    // sai com zero. O que se perde é o VEREDITO: o `$?` passa a ser o do
    // `head`, e um comando que morreu por SIGPIPE na linha 11 é indistinguível
    // de um que terminou verde. Foi exatamente isto em 24/08.
    file: "tools/up.sh",
    find: "#!/usr/bin/env bash",
    replace: "#!/usr/bin/env bash\nnpm run check | head -20",
    expect: "exit code: um comando de verificação é canalizado",
  },
];

export interface GateRunnerCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

/**
 * As montagens do serviço `backend`, lidas do compose.
 *
 * Recorte por indentação: o bloco `volumes:` do serviço tem 4 espaços e as
 * entradas 6, e o serviço seguinte volta para 2. Ler o YAML com uma
 * biblioteca seria mais robusto e traria uma dependência para conferir uma
 * lista de 15 linhas.
 */
function montagensDoCompose(texto: string): string[] {
  const inicio = texto.indexOf("\n  backend:");
  if (inicio < 0) return [];
  const volumes = texto.indexOf("\n    volumes:", inicio);
  if (volumes < 0) return [];

  const linhas = texto.slice(volumes + 1).split("\n").slice(1);
  const destinos: string[] = [];
  for (const linha of linhas) {
    if (/^\s{0,4}\S/.test(linha) && !/^\s*-/.test(linha)) break;
    const m = /^\s*-\s*\.\/(\S+?):(\S+?)(:ro)?\s*$/.exec(linha);
    if (m) destinos.push(m[2]);
  }
  return destinos;
}

export async function checkGateRunnerPolicy(): Promise<GateRunnerCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const arnes = lerDaRaiz(ARNES);
  const runner = lerDaRaiz(RUNNER);

  // -------------------------------------------------------------------------
  // G-1 — o worker passa a árvore
  // -------------------------------------------------------------------------
  const inicioWorker = arnes.indexOf("async function worker(arvore)");
  const fimWorker = arnes.indexOf("await Promise.all(arvores", inicioWorker);
  if (inicioWorker < 0 || fimWorker < 0) {
    failures.push(
      `arnês paralelo: não achei o worker do pool em ${ARNES} pelas âncoras ` +
        "`async function worker(arvore)` e `await Promise.all(arvores`. A guarda não pode opinar sobre " +
        "um trecho que não encontrou.",
    );
  } else {
    const corpo = arnes.slice(inicioWorker, fimWorker);
    if (!corpo.includes("applyMutation(m, arvore)")) {
      failures.push(
        "arnês paralelo: o worker não passa a árvore a `applyMutation` — o default é o REPOSITÓRIO " +
          "PRINCIPAL, e seis workers passariam a escrever no mesmo arquivo, cada um lendo a mutação do " +
          "vizinho. O sintoma é veredito que muda de passada para passada sem o código mudar.",
      );
    } else {
      notes.push("    arnês paralelo: o worker aplica a mutação na cópia dele, nunca no repositório");
    }
  }

  // -------------------------------------------------------------------------
  // G-2 — a lista de montagens acompanha o compose
  // -------------------------------------------------------------------------
  const doCompose = montagensDoCompose(lerDaRaiz(COMPOSE));
  if (doCompose.length === 0) {
    failures.push(
      `arnês paralelo: não consegui ler as montagens do serviço backend em ${COMPOSE}. Sem elas não há ` +
        "como conferir se o runner paralelo monta tudo o que o gate lê.",
    );
  } else {
    // `/app/uploads` é o único destino que o runner monta do repositório
    // PRINCIPAL (é ignorado pelo git e não existe na cópia), então ele não
    // aparece na lista de MONTAGENS — está no código, à parte, e por isso é
    // excluído aqui em vez de virar falso alarme.
    const faltando = doCompose.filter(
      (destino) => destino !== "/app/uploads" && !runner.includes(`destino: "${destino}"`),
    );
    if (faltando.length > 0) {
      failures.push(
        `arnês paralelo: ${RUNNER} não monta ${faltando.join(", ")}, que o compose monta no backend. O ` +
          "gate paralelo vai reprovar por arquivo faltando, e o sintoma parece defeito da guarda em vez " +
          "de defeito desta lista — foi assim que `/app/docs`, `image-stamp.mjs` e `.gitignore` " +
          "apareceram um a um em 24/08.",
      );
    } else {
      notes.push(
        `    arnês paralelo: as ${doCompose.length} montagens do compose estão cobertas pelo runner`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // G-3 — o número de workers é o medido, e a medição está ao lado
  // -------------------------------------------------------------------------
  if (!/const WORKERS_PADRAO = 6;/.test(arnes)) {
    failures.push(
      "arnês paralelo: o número de workers não é o medido (6). A vazão SOBE até 6 e CAI depois — com 12 " +
        "núcleos, N=10 dá 0,150 gates/s contra 0,159 de N=6, porque o `tsc` satura a CPU. " +
        "`os.cpus().length` parece a escolha óbvia e é mais lenta.",
    );
  } else if (!arnes.includes("0,159")) {
    failures.push(
      "arnês paralelo: a medição que justifica os 6 workers sumiu do comentário. Um número de " +
        "desempenho sem a medição ao lado vira palpite na primeira vez que alguém quiser mudá-lo.",
    );
  } else {
    notes.push("    arnês paralelo: 6 workers, com a tabela de vazão medida ao lado da constante");
  }

  // -------------------------------------------------------------------------
  // G-4 — SIGPIPE não é sucesso
  // -------------------------------------------------------------------------
  const scripts = ["tools/up.sh", "tools/smoke-demo.sh", "tools/probe-copilot-docs.sh", "package.json"];
  const suspeitas: string[] = [];
  for (const arquivo of scripts) {
    let texto = "";
    try {
      texto = lerDaRaiz(arquivo);
    } catch {
      continue; // arquivo opcional; ausência não é violação
    }
    const temPipefail = /set -o pipefail|set -euo pipefail/.test(texto);
    for (const [n, linha] of texto.split(String.fromCharCode(10)).entries()) {
      if (/^\s*#/.test(linha)) continue;
      const verifica = COMANDOS_DE_VERIFICACAO.some((c) => linha.includes(c));
      const corta = FECHAM_O_PIPE.some((c) => linha.includes("| " + c) || linha.includes("|" + c));
      if (verifica && corta && !temPipefail) suspeitas.push(`${arquivo}:${n + 1}`);
    }
  }
  if (suspeitas.length > 0) {
    failures.push(
      `exit code: um comando de verificação é canalizado para um leitor que fecha o pipe, sem ` +
        `\`set -o pipefail\` — ${suspeitas.join(", ")}. O comando morre por SIGPIPE e o \`$?\` que volta ` +
        "é o do leitor: ZERO. Um verde que não existe. MEDIDO em 24/08: uma passada do arnês foi " +
        "reportada como lançada tendo morrido na linha 11.",
    );
  } else {
    notes.push(
      "    exit code: nenhum script canaliza verificação para leitor que fecha o pipe (SIGPIPE não vira verde)",
    );
  }

  return { failures, notes };
}
