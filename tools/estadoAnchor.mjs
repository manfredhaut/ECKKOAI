#!/usr/bin/env node
/**
 * A ÂNCORA DO ESTADO.md ENVELHECE EM SILÊNCIO — esta é a conferência que acusa.
 *
 * ┌─ Por que existe: cinco ocorrências, e o padrão é sempre o mesmo ─────────┐
 * │ A §1 do ESTADO.md lista os commits do topo do repositório, e é o         │
 * │ primeiro parágrafo que qualquer sessão lê. Ela já divergiu do HEAD real  │
 * │ CINCO vezes — a quarta ficou oito commits atrás por semanas, a quinta    │
 * │ (23/08) ficou quatro. Nenhuma foi acidente isolado: o commit que fecha a │
 * │ sessão é sempre o mais fácil de esquecer, porque ele é escrito quando o  │
 * │ trabalho já parece terminado.                                            │
 * │                                                                          │
 * │ O próprio arquivo já avisa "confira `git log` antes de confiar nesta     │
 * │ lista". Um aviso que depende de alguém lembrar de obedecê-lo é o mesmo   │
 * │ mecanismo que falhou nas cinco vezes. Isto aqui não depende de ninguém.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Por que NÃO é uma guarda do gate, apesar de guarda ser o padrão da casa ┐
 * │ MEDIDO em 24/08: o container do backend monta o repositório PARCIALMENTE │
 * │ — `ls /repo` devolve `backend`, `frontend`, `tools`, `docker-compose.yml`│
 * │ e `package.json`. Não há `.git` e não há `ESTADO.md`. O gate roda        │
 * │ inteiro lá dentro, então ele não consegue ler NENHUM dos dois lados      │
 * │ desta comparação. Montar o repo inteiro no container para viabilizar     │
 * │ uma guarda seria alargar a superfície do container por causa de um       │
 * │ arquivo de prosa.                                                        │
 * │                                                                          │
 * │ Roda no HOST, como o arnês e pelo mesmo motivo dele: precisa de git.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE COMPARA: o penúltimo commit do repositório (`HEAD~1`) tem de aparecer
 * na lista da §1. É `HEAD~1`, e não `HEAD`, porque o próprio arquivo declara a
 * regra: *"o último commit desta lista é sempre o penúltimo do repositório: o
 * próprio commit que atualiza este arquivo não caberia dentro dele"*. Exigir o
 * HEAD acusaria toda sessão bem fechada.
 *
 * NÃO CONSERTA NADA e nunca falha o processo que a chama: ela relata. Reescrever
 * a §1 sozinha trocaria um arquivo que mente por um arquivo que mente com
 * confiança — a lista tem PROSA junto dos hashes (as notas de divergência), e
 * decidir o que sobrevive é de quem escreve o fechamento.
 *
 * Uso:
 *   npm run estado                 # primeiro comando da sessão
 *   node tools/estadoAnchor.mjs
 *
 * Sai 0 quando a âncora está fresca, 1 quando está velha, 2 quando não
 * conseguiu comparar (repo sem git, ESTADO.md sem a §1). Os três casos
 * imprimem o porquê.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ESTADO = "ESTADO.md";

/** Marca o começo da §1 — o cabeçalho, não uma frase que o cite. */
const CABECALHO_SECAO_1 = "## 1 · Onde o repositório está";

/**
 * `stderr: "pipe"` porque uma das chamadas FALHA de propósito: medir a
 * distância contra um hash que não existe mais (rebase, ou hash errado na
 * lista) é um desfecho previsto, tratado no `catch`. Sem isto o `fatal:` do
 * git aparece no terminal ANTES do relatório, e a pessoa lê um erro cru onde
 * a ferramenta já tinha a resposta em português logo abaixo.
 */
function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Os hashes do PRIMEIRO bloco cercado depois do cabeçalho da §1.
 *
 * O primeiro bloco, e não todos: a seção tem notas de divergência abaixo da
 * lista, e uma delas cita hashes antigos ("a lista anterior (topo em
 * `bfd5364`…)"). Varrer a seção inteira faria a âncora parecer fresca por
 * causa de um hash mencionado justamente para dizer que estava velho.
 */
export function hashesDaAncora(texto) {
  const inicio = texto.indexOf(CABECALHO_SECAO_1);
  if (inicio < 0) return { erro: `não achei "${CABECALHO_SECAO_1}" em ${ESTADO}` };

  const abre = texto.indexOf("```", inicio);
  if (abre < 0) return { erro: `não achei o bloco de commits depois de "${CABECALHO_SECAO_1}"` };
  const fecha = texto.indexOf("```", abre + 3);
  if (fecha < 0) return { erro: "o bloco de commits da §1 abre e não fecha" };

  const bloco = texto.slice(abre + 3, fecha);
  const hashes = [];
  for (const linha of bloco.split("\n")) {
    // Hash no COMEÇO da linha: é assim que `git log --oneline` escreve, e é o
    // que impede casar um hash citado no meio da mensagem de um commit.
    const m = /^\s*([0-9a-f]{7,40})\s+\S/.exec(linha);
    if (m) hashes.push(m[1]);
  }
  return hashes.length === 0 ? { erro: "o bloco de commits da §1 não tem nenhum hash" } : { hashes };
}

/**
 * Um hash da lista casa o commit? Compara pelo PREFIXO, nos dois sentidos.
 *
 * A §1 usa 7 dígitos e o `git rev-parse` devolve 40 — comparar por igualdade
 * nunca casaria. E o sentido importa: um dia a lista pode passar a guardar o
 * hash inteiro, e aí é ela que contém o abreviado.
 */
function casa(hashDaLista, hashCompleto) {
  return hashCompleto.startsWith(hashDaLista) || hashDaLista.startsWith(hashCompleto);
}

export function conferirAncora() {
  let texto;
  try {
    texto = readFileSync(path.join(repoRoot, ESTADO), "utf-8").replace(/\r\n/g, "\n");
  } catch (err) {
    return { desfecho: "indeterminado", motivo: `não consegui ler ${ESTADO}: ${String(err)}` };
  }

  const { hashes, erro } = hashesDaAncora(texto);
  if (erro) return { desfecho: "indeterminado", motivo: erro };

  let head, penultimo, total;
  try {
    head = git("rev-parse", "HEAD");
    total = Number(git("rev-list", "--count", "HEAD"));
    penultimo = total >= 2 ? git("rev-parse", "HEAD~1") : head;
  } catch (err) {
    return { desfecho: "indeterminado", motivo: `git não respondeu: ${String(err).slice(0, 160)}` };
  }

  // O HEAD conta como fresco também: uma sessão pode conferir a âncora ANTES
  // de escrever o commit de fechamento, e nesse instante o topo da lista é o
  // próprio HEAD. Aceitar os dois evita um alarme que some sozinho.
  const alvo = hashes.find((h) => casa(h, penultimo) || casa(h, head));
  if (alvo) {
    return { desfecho: "fresca", topo: hashes[0], head: head.slice(0, 7), casouCom: alvo };
  }

  // A DISTÂNCIA, medida — é ela que diz se isto é um deslize de uma sessão ou
  // um arquivo abandonado. `rev-list --count <topo>..HEAD` falha se o hash não
  // existe mais (rebase, hash inventado), e aí o número fica desconhecido em
  // vez de errado.
  let distancia = null;
  try {
    distancia = Number(git("rev-list", "--count", `${hashes[0]}..HEAD`));
  } catch {
    distancia = null;
  }

  return {
    desfecho: "velha",
    topo: hashes[0],
    head: head.slice(0, 7),
    penultimo: penultimo.slice(0, 7),
    distancia,
    listados: hashes.length,
  };
}

/** Uma linha por caso, para quem chama de dentro de outro processo. */
export function relatarAncora(r) {
  if (r.desfecho === "fresca") {
    // Diz COM QUAL hash casou, e não só o topo. Uma lista pode estar fresca
    // pelo segundo item (o fechamento escreveu um commit a mais depois de
    // reancorar), e imprimir só o topo faria o relato apontar para um hash que
    // não é o que sustenta o veredito — enganoso justamente no arquivo cuja
    // razão de existir é não deixar ninguém confiar no ponteiro errado.
    const por = r.casouCom === r.topo ? "" : `, casou pelo item ${r.casouCom}`;
    return `âncora do ESTADO.md: FRESCA (topo ${r.topo}, HEAD ${r.head}${por}).`;
  }
  if (r.desfecho === "indeterminado") {
    return `âncora do ESTADO.md: NÃO CONFERIDA — ${r.motivo}`;
  }
  const quantos =
    r.distancia === null
      ? "distância desconhecida (o hash do topo não existe mais neste histórico)"
      : `${r.distancia} commit(s) atrás do HEAD`;
  return (
    `âncora do ESTADO.md: VELHA — o topo da §1 é ${r.topo}, ${quantos}; HEAD ${r.head}. ` +
    `Nenhum dos ${r.listados} hashes listados é o HEAD nem o penúltimo (${r.penultimo}). ` +
    "Quem ler a §1 confiando nela recebe o mapa de outro repositório."
  );
}

function main() {
  const r = conferirAncora();
  const linha = relatarAncora(r);

  if (r.desfecho === "fresca") {
    console.log(`✓ ${linha}`);
    process.exit(0);
  }
  if (r.desfecho === "indeterminado") {
    console.error(`? ${linha}`);
    process.exit(2);
  }
  console.error(`⚠ ${linha}`);
  console.error(
    "\nConserto: reescreva o bloco de commits da §1 com `git log --oneline -8`, e registre a\n" +
      "divergência em vez de corrigi-la em silêncio — as cinco anteriores só viraram padrão\n" +
      "reconhecível porque foram anotadas uma a uma.",
  );
  process.exit(1);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
