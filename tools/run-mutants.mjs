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
 *   npm run check:mutants                 # todos
 *   npm run check:mutants -- --guard log  # só as guardas cujo nome casa
 *   npm run check:mutants -- --list       # não muta nada, só lista
 */
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: repoRoot, encoding: "utf8", stdio: "pipe", ...opts });
}

/** Árvore limpa? É a única prova de que a reversão funcionou. */
function treeStatus() {
  return sh("git status --short").trim();
}

/**
 * Roda o gate dentro do container e devolve { code, output }.
 *
 * Nunca lança em falha do gate: saída 1 é o resultado ESPERADO na metade dos
 * casos, e transformá-la em exceção faria o `finally` da reversão competir com
 * o tratamento de erro.
 */
function runGate(env = {}) {
  const args = ["compose", "exec", "-T"];
  for (const [k, v] of Object.entries(env)) args.push("-e", `${k}=${v}`);
  args.push("backend", "npm", "run", "check");
  try {
    const out = execFileSync("docker", args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });
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

async function main() {
  const argv = process.argv.slice(2);
  const filtro = argv.includes("--guard") ? argv[argv.indexOf("--guard") + 1] : null;
  const apenasListar = argv.includes("--list");

  const sujoAntes = treeStatus();
  if (sujoAntes) {
    console.error(
      "ABORTADO: a árvore de trabalho já está suja antes de começar.\n" +
        "O arnês precisa distinguir uma reversão falha das suas próprias edições, e com a árvore\n" +
        "suja isso é impossível. Faça commit ou stash antes.\n\n" + sujoAntes,
    );
    process.exit(2);
  }

  let mutantes = collectMutants();
  if (filtro) mutantes = mutantes.filter((m) => m.guard.includes(filtro) || m.name.includes(filtro));

  if (apenasListar) {
    for (const m of mutantes) {
      console.log(`${m.kind === "obvio" ? "[óbvio ]" : "[esperto]"} ${m.guard} :: ${m.name}`);
    }
    console.log(`\n${mutantes.length} mutante(s).`);
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

  if (inertes.length > 0 || erros.length > 0) process.exit(1);

  console.log("✓ Todas as guardas exercitadas reprovaram de verdade — e a árvore voltou limpa em cada uma.");
}

main().catch((err) => {
  console.error("arnês falhou de forma inesperada:", err);
  console.error("\nCONFIRA A ÁRVORE À MÃO: git status --short");
  process.exit(1);
});
