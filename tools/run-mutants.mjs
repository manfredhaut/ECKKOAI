#!/usr/bin/env node
/**
 * Arnês de mutação: prova que cada guarda REPROVA de verdade.
 *
 * A razão de existir, em uma frase: contagem de ocorrências não detecta guarda
 * inerte. A `checkVendorLogPolicy` casava treze funções e era inerte, porque
 * verificava a proposição errada — só a tentativa de reprovar revelou isso, e
 * só porque alguém tentou à mão. Aqui a tentativa é automática.
 *
 * Roda no HOST, e não no container, por um motivo só: o guardrail deste arnês
 * é a reversão garantida, e provar reversão exige `git status`. O container não
 * tem git, e monta o repositório só parcialmente. Quem executa o gate continua
 * sendo o container — as mutações chegam lá pelo bind mount.
 *
 *   npm run check:mutants                              # PASSADA COMPLETA
 *   npm run check:mutants -- --guard "fal:"            # subconjunto por guarda
 *   npm run check:mutants -- --guard "fal:" --guard egress   # a UNIÃO das duas
 *   npm run check:mutants -- --name "request_id"       # subconjunto por mutante
 *   npm run check:mutants -- --list                    # não muta nada, só lista
 *   npm run check:mutants -- --affected                # só o que a rodada tocou
 *   npm run check:mutants -- --affected --base <ref>   # idem, contra outra base
 *
 * A AFETADA fecha rodada normal; a COMPLETA roda fora do horário de trabalho.
 * A troca só é honesta porque a conferência de cadastro (`checkMutantRegistry`)
 * pega mutante podre em SEGUNDOS no gate — era essa a função que tornava a
 * completa obrigatória a cada rodada.
 *
 * Sem filtro a passada é completa — o subconjunto é sempre explícito na
 * invocação, e toda passada filtrada carimba no começo E no fim quantos
 * mutantes foram PULADOS. Um verde filtrado nunca deve poder ser lido como o
 * arnês inteiro fechando.
 */
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: repoRoot, encoding: "utf8", stdio: "pipe", ...opts });
}

/**
 * Espera SÍNCRONA, sem spawn.
 *
 * `sleep` seria um processo novo — justamente o que está falhando quando esta
 * função é chamada. `Atomics.wait` bloqueia a thread sem pedir nada ao sistema
 * operacional.
 */
function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * O processo FALHOU AO INICIAR — ou seja, o comando nunca rodou?
 *
 * ┌─ A distinção, e por que ela é segura ───────────────────────────────────┐
 * │ Árvore suja NÃO passa por aqui. `git status --short` sai 0 mesmo com a   │
 * │ árvore suja: ele imprime os arquivos e termina com sucesso. Esse caso    │
 * │ volta pelo caminho de SUCESSO de `execSync` e é decidido pelo CONTEÚDO   │
 * │ do stdout, nunca por exceção. Retentar aqui, portanto, não pode          │
 * │ retentar uma árvore suja — são caminhos disjuntos no código, e não dois  │
 * │ ramos de uma mesma condição.                                            │
 * │                                                                          │
 * │ O que se retenta é o 0xC0000142 medido em 12/08: a passada dos 222       │
 * │ morreu entre o mutante 20 e o 21 porque o Windows não conseguiu criar o  │
 * │ processo do git. `status: 3221225794`, `stdout: ''`, `stderr: ''` —      │
 * │ nenhum byte escrito, porque não houve programa para escrever.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Dois testes, e os dois têm de passar quando o critério é o NTSTATUS:
 *
 *  · o código é de falha do carregador do Windows (>= 0xC0000000). Os códigos
 *    do próprio git são 0, 1 e 128 — ele nunca devolve isso;
 *  · nada foi escrito em stdout nem stderr. Um único byte prova que o processo
 *    iniciou, e aí o problema não é spawn e retentar esconderia um erro real.
 */
function ehFalhaDeSpawn(err) {
  // Erros em que o Node nem chegou a criar o processo. `EAGAIN` e `ENOMEM` são
  // esgotamento de recurso, que é a família do 0xC0000142.
  if (["ENOENT", "EAGAIN", "ENOMEM", "UNKNOWN", "ETXTBSY", "EBUSY"].includes(err?.code)) return true;

  const status = err?.status;
  if (typeof status === "number" && status >= 0xc000_0000) {
    return !err.stdout && !err.stderr;
  }
  return false;
}

/**
 * Árvore limpa? É a única prova de que a reversão funcionou.
 *
 * Até 3 tentativas, 2 s entre elas, e SÓ quando o processo não inicia. Uma
 * árvore suja continua abortando na primeira leitura, com exit 2 — ver
 * `ehFalhaDeSpawn` para por que os dois casos não podem se confundir.
 */
function treeStatus() {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      return sh("git status --short").trim();
    } catch (err) {
      ultimoErro = err;
      // Erro de verdade do git (repositório ausente, índice travado): sobe na
      // hora. Retentar isso transformaria um diagnóstico claro em três.
      if (!ehFalhaDeSpawn(err)) throw err;
      console.error(
        `  … git status NÃO INICIOU (tentativa ${tentativa}/3): ` +
          `${err.code ?? `status ${err.status}`}. Isto é falha de spawn do sistema operacional, ` +
          "não árvore suja — nova tentativa em 2 s.",
      );
      if (tentativa < 3) esperar(2000);
    }
  }
  throw ultimoErro;
}

/**
 * Roda o gate dentro do container e devolve { code, output }.
 *
 * Nunca lança em falha do gate: saída 1 é o resultado ESPERADO na metade dos
 * casos, e transformá-la em exceção faria o `finally` da reversão competir com
 * o tratamento de erro.
 */
/**
 * O gate, rodado como o projeto documenta: `-e PROVIDER_MODE=fixture`.
 *
 * O default NÃO era passado, e o arnês herdava o modo do container. Com o
 * ambiente armado em live isso deixava o gate estruturalmente vermelho: duas
 * guardas (`checkPollPolicy` e `checkVendorErrorPathPolicy`) trocam
 * `PROVIDER_MODE` por fixture, restauram o valor ORIGINAL no `finally` e depois
 * exigem `isFixtureMode()` — porque tudo que rodar em seguida naquele processo
 * falaria com a rede. Em live a restauração devolve "live" e as duas reprovam,
 * com a árvore limpa e sem mutante nenhum.
 *
 * O efeito era assimétrico e por isso passou despercebido: um mutante comum
 * continuava "ok", porque o gate reprovava e a mensagem esperada estava lá
 * junto das duas extras. Quem quebrava eram os CONTRAPONTOS (`expectGreen`),
 * que exigem verde — nove deles, todos ao mesmo tempo, sem nada em comum além
 * do modo.
 *
 * A base só entra quando o mutante NÃO declara `PROVIDER_MODE`: há mutantes que
 * mexem no modo de propósito (`checkProviderPolicy`), e dois `-e` para a mesma
 * variável dependeriam de qual o docker escolhe.
 */
function runGate(env = {}) {
  const base = Object.prototype.hasOwnProperty.call(env, "PROVIDER_MODE")
    ? env
    : { PROVIDER_MODE: "fixture", ...env };
  // Sinaliza que HÁ mutante aplicado. `checkMutantRegistryPolicy` usa isto
  // para pular a conferência de cadastro: sob mutação, "todo find casa 1x" é
  // falso por construção, e acusá-lo derrubaria todos os contrapontos.
  const args = ["compose", "exec", "-T", "-e", "ARNES_EM_CURSO=1"];
  for (const [k, v] of Object.entries(base)) args.push("-e", `${k}=${v}`);
  args.push("backend", "npm", "run", "check");
  try {
    // `maxBuffer` EXPLÍCITO, e ele não é enfeite: o default do `execFileSync` é
    // 1 MiB, e a saída do gate passa disso com facilidade — MEDIDO em 12/08,
    // 1.071.347 bytes num mutante que faz o produto emitir muitos eventos.
    // Estourado o buffer, o stdout chega TRUNCADO e a mensagem da guarda, que
    // sai no fim, se perde: o arnês vê "reprovou sem a mensagem" e reporta
    // AMBÍGUO. Guarda saudável, mutante correto, veredito errado — e o
    // diagnóstico manda reescrever a guarda, que é o pior lugar para procurar.
    //
    // O mesmo teto que `collectMutants` já usava. Aqui faltava.
    const out = execFileSync("docker", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, output: out };
  } catch (err) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function collectMutants() {
  const raw = execFileSync(
    "docker",
    ["compose", "exec", "-T", "backend", "npx", "tsx", "src/scripts/collectMutants.ts"],
    { cwd: repoRoot, encoding: "utf8", stdio: "pipe", maxBuffer: 32 * 1024 * 1024 },
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error(`collectMutants não devolveu JSON:\n${raw}`);
  return JSON.parse(raw.slice(start, end + 1));
}

/** Aplica a mutação em disco. Devolve o conteúdo original para o finally. */
function applyMutation(mutant) {
  if (!mutant.file) return null;
  const full = path.join(repoRoot, mutant.file);
  const original = readFileSync(full, "utf8");

  // Fins de linha: neste repositório o git entrega o working copy em CRLF
  // (autocrlf no Windows), enquanto os mutantes são escritos com \n. Sem esta
  // normalização todo `find` multi-linha casa ZERO vezes, e o arnês passaria a
  // reportar "mutante desatualizado" em guardas perfeitamente saudáveis — um
  // falso alarme que ensinaria a ignorar o arnês.
  const crlf = original.includes("\r\n");
  const find = crlf ? mutant.find.replace(/\n/g, "\r\n") : mutant.find;
  const replace = crlf ? mutant.replace.replace(/\n/g, "\r\n") : mutant.replace;

  // Ocorrência única, senão aborta. Zero significa que o mutante apodreceu
  // junto com o código (e estaria "provando" uma guarda sem mutar nada); mais
  // de uma significa substituição ambígua. As duas já custaram caro aqui.
  const occurrences = original.split(find).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `o trecho procurado ocorre ${occurrences}x em ${mutant.file} (esperado exatamente 1). ` +
        `Mutante desatualizado ou ambíguo — corrija a declaração da guarda.\n  find: ${JSON.stringify(mutant.find.slice(0, 120))}`,
    );
  }

  writeFileSync(full, original.replace(find, replace), "utf8");
  return { full, original };
}

/**
 * Os arquivos que a rodada tocou, segundo o git — nunca segundo alguém.
 *
 * `<base>...HEAD` (três pontos) usa o ancestral comum, então a lista é o que
 * ESTA linha de trabalho mudou, e não o que o outro lado mudou em paralelo.
 */
function arquivosTocados(base) {
  const saida = sh(`git diff --name-only ${base}...HEAD`).trim();
  if (!saida) return [];
  // `String.fromCharCode(10)` e nao um literal com escape: este arquivo ja
  // foi editado por heredoc, e a barra invertida sumiu no caminho tres vezes.
  return saida
    .split(String.fromCharCode(10))
    .map((linha) => linha.trim())
    .filter(Boolean);
}

/**
 * O aviso de passada filtrada, impresso no COMEÇO e no FIM.
 *
 * Nos dois lugares de propósito: quem lê um log de 227 linhas lê o fim, e um
 * "N/N mutante(s) tiveram o comportamento esperado" no rodapé de uma passada
 * de 5 é indistinguível de uma passada completa se o aviso ficar só no topo.
 * O número de PULADOS é o que separa as duas leituras, então ele é o que
 * aparece em destaque.
 */
function avisoDeFiltro(selecionados, total, filtros) {
  const pulados = total - selecionados;
  const borda = "=".repeat(78);
  return [
    "",
    borda,
    "  ATENCAO: PASSADA FILTRADA — ISTO NAO E A PASSADA COMPLETA",
    `  ${selecionados} de ${total} mutante(s) selecionado(s).  ${pulados} PULADO(S).`,
    `  seleção: ${filtros.length > 0 ? filtros.map((f) => `--${f.campo} ${JSON.stringify(f.termo)}`).join(" ") : "--affected (derivada do diff)"}`,
    "  Um verde aqui NAO autoriza dizer que o arnes fechou: ele fala apenas dos",
    "  mutantes acima. A passada completa e `npm run check:mutants` sem filtro.",
    borda,
    "",
  ].join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const apenasListar = argv.includes("--list");

  // Filtros REPETÍVEIS, por guarda ou por nome do mutante. A união, e não a
  // interseção: quem escreve `--guard fal: --guard egress` quer as duas
  // famílias, e exigir que um mutante case os dois termos daria conjunto vazio
  // em toda combinação útil.
  //
  // Sem nenhum filtro, a passada é COMPLETA — o default não muda, e o
  // subconjunto é sempre um ato explícito na invocação.
  const afetada = argv.includes("--affected");
  const base = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "HEAD~1";

  const filtros = [];
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--guard" || argv[i] === "--name") && argv[i + 1] !== undefined) {
      filtros.push({ campo: argv[i] === "--guard" ? "guard" : "name", termo: argv[i + 1] });
    }
  }

  // A ÂNCORA DO ESTADO.md, antes de qualquer mutação — R8, 24/08.
  //
  // AQUI porque o alcance é o melhor disponível: toda rodada termina numa
  // passada do arnês, e ele já roda no host com git à mão (o container não vê
  // nem `.git` nem `ESTADO.md` — MEDIDO). Não é a "abertura da sessão" que o
  // pedido descrevia, e `npm run estado` existe para isso; mas um aviso que
  // depende de alguém lembrar de rodar um comando é o mesmo mecanismo que já
  // falhou seis vezes. Este pega antes do commit de fechamento, que é onde o
  // conserto acontece de qualquer jeito.
  //
  // AVISA, NUNCA ABORTA: a âncora velha não invalida mutante nenhum, e matar
  // uma passada de 2 h por causa de um parágrafo desatualizado trocaria um
  // problema de prosa por um de trabalho perdido.
  try {
    const { conferirAncora, relatarAncora } = await import(
      pathToFileURL(path.join(repoRoot, "tools", "estadoAnchor.mjs")).href
    );
    const ancora = conferirAncora();
    if (ancora.desfecho !== "fresca") {
      console.error(`\n⚠ ${relatarAncora(ancora)}\n`);
    }
  } catch (err) {
    console.error(`\n? âncora do ESTADO.md: NÃO CONFERIDA — ${String(err).slice(0, 160)}\n`);
  }

  const sujoAntes = treeStatus();
  if (sujoAntes) {
    console.error(
      "ABORTADO: a árvore de trabalho já está suja antes de começar.\n" +
        "O arnês precisa distinguir uma reversão falha das suas próprias edições, e com a árvore\n" +
        "suja isso é impossível. Faça commit ou stash antes.\n\n" + sujoAntes,
    );
    process.exit(2);
  }

  const todos = collectMutants();

  let mutantes = todos;
  let tocados = null;
  if (afetada) {
    tocados = arquivosTocados(base);
    // Um mutante entra se o ALVO dele foi tocado, ou se a GUARDA que o declara
    // foi tocada. A segunda metade é a que importa: editar uma guarda sem tocar
    // o alvo é justamente quando os mutantes dela precisam rodar.
    //
    // Os mutantes de AMBIENTE (sem `file`) entram SEMPRE. O que eles vigiam —
    // NODE_ENV, limiter, fixture em produção — muda sem aparecer em diff de
    // código, então excluí-los por ausência de arquivo os desligaria justamente
    // no caso que eles cobrem. São 8, e o custo de tê-los é conhecido.
    mutantes = todos.filter(
      (m) => !m.file || tocados.includes(m.file) || tocados.includes(m.sourceFile),
    );
  }
  if (filtros.length > 0) {
    mutantes = mutantes.filter((m) => filtros.some((f) => String(m[f.campo]).includes(f.termo)));
  }

  // Filtro que não casa nada abortaria como "0/0 tiveram o comportamento
  // esperado" — verde perfeito, zero verificação. É o mesmo universo-zero que
  // as guardas deste projeto reprovam.
  if (filtros.length > 0 && mutantes.length === 0) {
    console.error(
      `ABORTADO: o filtro não casou nenhum dos ${todos.length} mutantes.\n` +
        `  filtro: ${filtros.map((f) => `--${f.campo} ${JSON.stringify(f.termo)}`).join(" ")}\n` +
        "Uma passada de zero mutantes terminaria verde sem verificar nada.",
    );
    process.exit(2);
  }

  const filtrada = filtros.length > 0 || afetada;
  if (afetada) {
    console.log(
      [
        "",
        "=".repeat(78),
        `  PASSADA AFETADA — base ${base} (git diff --name-only ${base}...HEAD)`,
        `  ${tocados.length} arquivo(s) tocado(s); ${mutantes.length} de ${todos.length} mutante(s) selecionado(s).`,
        "  Seleção DERIVADA do diff: alvo tocado, guarda tocada, ou mutante de ambiente.",
        ...tocados.map((f) => `    · ${f}`),
        "=".repeat(78),
        "",
      ].join(String.fromCharCode(10)),
    );
  }
  if (filtrada) console.log(avisoDeFiltro(mutantes.length, todos.length, filtros));

  if (apenasListar) {
    for (const m of mutantes) {
      console.log(`${m.kind === "obvio" ? "[óbvio ]" : "[esperto]"} ${m.guard} :: ${m.name}`);
    }
    console.log(`\n${mutantes.length} mutante(s).`);
    if (filtrada) console.log(avisoDeFiltro(mutantes.length, todos.length, filtros));
    return;
  }

  console.log(`Arnês de mutação: ${mutantes.length} mutante(s).`);
  console.log("Cada um é aplicado, o gate roda, e a reversão é conferida com git status.\n");

  const inertes = [];
  const erros = [];
  let ok = 0;

  for (const [i, m] of mutantes.entries()) {
    const rotulo = `${i + 1}/${mutantes.length} [${m.kind}] ${m.guard} :: ${m.name}`;
    let restore = null;

    try {
      restore = applyMutation(m);
      const { code, output } = runGate(m.env ?? {});

      if (m.expectGreen) {
        // Contraponto: este mutante DEVE manter o verde. Uma guarda que reprova
        // qualquer coisa passaria em todos os outros casos sem distinguir nada.
        if (code === 0 && output.includes(m.expect)) {
          ok += 1;
          console.log(`  ok      ${rotulo}  (contraponto: seguiu verde, como deve)`);
        } else {
          inertes.push({ ...m, motivo: code !== 0 ? `o gate reprovou (${code}) quando deveria passar` : `saída não contém ${JSON.stringify(m.expect)}` });
          console.log(`  FALHOU  ${rotulo}  (contraponto quebrado)`);
        }
      } else if (code === 0) {
        inertes.push({ ...m, motivo: "o gate passou VERDE com o defeito aplicado" });
        console.log(`  INERTE  ${rotulo}`);
      } else if (!output.includes(m.expect)) {
        // Reprovou, mas por outro motivo — tipicamente o tsc. Não conta: a
        // guarda não opinou, e dar isso como sucesso é o mesmo autoengano que
        // o arnês existe para desfazer.
        inertes.push({ ...m, motivo: `reprovou (${code}), mas sem a mensagem da guarda — ${JSON.stringify(m.expect)}` });
        console.log(`  AMBÍGUO ${rotulo}`);
      } else {
        ok += 1;
        console.log(`  ok      ${rotulo}`);
      }
    } catch (err) {
      erros.push({ ...m, motivo: err.message });
      console.log(`  ERRO    ${rotulo}\n          ${err.message.split("\n")[0]}`);
    } finally {
      // Reversão garantida. Acontece mesmo se o gate explodir, mesmo se a
      // aplicação falhar no meio.
      if (restore) writeFileSync(restore.full, restore.original, "utf8");
    }

    // Guardrail não negociável: a árvore tem de voltar limpa ANTES do próximo
    // mutante. Seguir com a árvore suja empilharia defeitos e faria os
    // resultados seguintes não significarem nada.
    const sujo = treeStatus();
    if (sujo) {
      console.error(
        `\nABORTADO NO MUTANTE ${i + 1}: a reversão falhou e a árvore ficou suja.\n` +
          "Nenhum outro mutante será aplicado. Restaure à mão antes de qualquer coisa:\n\n" +
          sujo +
          "\n\n  git checkout -- <arquivos acima>\n",
      );
      process.exit(3);
    }
  }

  console.log("\n" + "-".repeat(70));
  if (erros.length > 0) {
    console.error(`\n${erros.length} mutante(s) com ERRO de aplicação:\n`);
    for (const e of erros) console.error(`  ✗ ${e.guard} :: ${e.name}\n      ${e.motivo}`);
  }
  if (inertes.length > 0) {
    console.error(`\n${inertes.length} GUARDA(S) INERTE(S) — o defeito passou pelo gate:\n`);
    for (const g of inertes) console.error(`  ✗ ${g.guard} :: ${g.name}\n      ${g.motivo}`);
    console.error(
      "\nUma guarda inerte é pior que guarda nenhuma: ela ocupa o lugar da verificação\n" +
        "que faria falta, e o resumo verde diz que está tudo certo.\n",
    );
  }

  const total = mutantes.length;
  console.log(`\n${ok}/${total} mutante(s) tiveram o comportamento esperado.`);

  // O aviso repetido no rodapé. Vem ANTES do exit, para aparecer também quando
  // a passada filtrada reprova.
  if (filtrada) console.log(avisoDeFiltro(mutantes.length, todos.length, filtros));

  if (inertes.length > 0 || erros.length > 0) process.exit(1);

  console.log(
    filtrada
      ? `✓ Os ${total} mutante(s) DESTE FILTRO reprovaram de verdade — e a árvore voltou limpa em cada ` +
          `uma. Os outros ${todos.length - total} NÃO foram exercitados.`
      : "✓ Todas as guardas exercitadas reprovaram de verdade — e a árvore voltou limpa em cada uma.",
  );
}

/**
 * A passada só dispara quando o arquivo é INVOCADO, nunca quando é importado.
 *
 * Sem esta guarda, importar o módulo para provar `ehFalhaDeSpawn` — que é como
 * o critério do retry é exercitado, já que 0xC0000142 não se produz sob
 * demanda — dispararia uma passada completa de 227 mutantes como efeito
 * colateral do `import`.
 */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error("arnês falhou de forma inesperada:", err);
    console.error("\nCONFIRA A ÁRVORE À MÃO: git status --short");
    process.exit(1);
  });
}

export { ehFalhaDeSpawn, treeStatus };
