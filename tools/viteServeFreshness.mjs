#!/usr/bin/env node
/**
 * O Vite está SERVINDO o que está em disco? — L1, 23/08/2026.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXISTE, TENDO `checkFrontendBundleFreshness.mjs`
 *
 * O bypass do diálogo de confirmação aconteceu DUAS vezes. Na segunda
 * (23/08/2026), `checkFrontendBundleFreshness.mjs` já existia e já estava
 * integrado ao `tools/up.sh` — e mesmo assim não impediu nada. O motivo é
 * de ALCANCE, não de lógica: aquele script só roda quando alguém executa
 * `tools/up.sh`, e o ambiente sobe por pelo menos seis caminhos:
 *
 *   1. `npm run up` / `bash tools/up.sh`      → passa pela checagem
 *   2. `docker compose up -d`                  → NÃO passa
 *   3. `docker compose restart <svc>`          → NÃO passa  ← o caso real
 *   4. `docker compose start`                  → NÃO passa
 *   5. boot da máquina (`restart: unless-stopped`) → NÃO passa
 *   6. botão do Docker Desktop / IDE           → NÃO passa
 *
 * O gotcha 2 do CLAUDE.md manda literalmente `docker compose restart
 * frontend` como conserto — ou seja, o caminho recomendado para consertar é
 * exatamente um dos que não passam pela checagem. Uma guarda que depende de
 * alguém lembrar do comando certo não é guarda.
 *
 * ---------------------------------------------------------------------------
 * O MECANISMO REAL, MEDIDO em 23/08/2026
 *
 * `frontend/src` é BIND MOUNT (`docker-compose.yml`). O arquivo em disco
 * DENTRO do container está sempre atual — foi medido: com o bundle servido
 * ainda pré-G3, `grep falConfirm.composeCost /app/src/.../GenerateStep.tsx`
 * dentro do container devolvia 1. Quem estava velho era o CACHE DE
 * TRANSFORMAÇÃO do Vite: o watcher não recebe eventos de filesystem através
 * do bind mount no Windows, então o Vite nunca soube que o arquivo mudou e
 * continuou devolvendo a versão transformada antiga.
 *
 * Isso é o que torna esta checagem possível SEM git e SEM docker: os dois
 * lados da comparação estão dentro do container do frontend.
 *
 *   disco   → /app/src/...              (bind mount, sempre atual)
 *   servido → http://127.0.0.1:5173/src/...  (cache do Vite, pode estar velho)
 *
 * ---------------------------------------------------------------------------
 * ONDE ELE RODA, E POR QUÊ AÍ
 *
 * No HEALTHCHECK do container do frontend. Alternativas descartadas:
 *
 *  · boot do backend — o backend pode subir ANTES do frontend, e um
 *    `restart frontend` sozinho (o caso real) não passaria por lá nunca.
 *  · middleware comparando versão a cada requisição — custo por request, e
 *    exigiria o frontend REPORTAR uma versão que, estando velho, ele não
 *    tem.
 *  · banner no próprio frontend — ovo e galinha: um bundle velho não
 *    executa o código novo do banner. Um detector não pode viver dentro
 *    daquilo que ele precisa detectar como velho.
 *
 * O healthcheck roda a cada 10 s, independentemente de por onde o container
 * subiu, e o resultado aparece nos comandos que já se usa todo dia
 * (`docker compose ps`, `docker inspect`) e bloqueia `tools/up.sh`, que já
 * espera por `healthy`.
 *
 * ---------------------------------------------------------------------------
 * LIMITE HONESTO
 *
 * A comparação usa o arquivo de MAIOR mtime que tenha sinal comparável —
 * o mais provável de estar velho logo depois de uma edição. Uma edição que
 * NÃO mude nenhum nome declarado nem nenhuma chave de i18n (só o corpo de
 * uma função, por exemplo) passa despercebida. Isso é uma redução de risco,
 * não uma prova — e está escrito aqui em vez de ser deduzido depois.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Onde o `frontend/src` está montado dentro do container do frontend. */
export const SRC_DIR = process.env.VITE_SRC_DIR ?? "/app/src";

/** De onde o Vite dev server responde, de dentro do próprio container. */
export const VITE_ORIGIN = process.env.VITE_ORIGIN ?? "http://127.0.0.1:5173";

/**
 * PURA — tira comentários antes de qualquer extração.
 *
 * O transform do Vite REMOVE comentários, então um nome que só aparece
 * dentro de um comentário no disco nunca apareceria no servido, e a
 * checagem acusaria staleness onde não há. Falso positivo em healthcheck é
 * pior que checagem ausente: ensina a ignorar o sinal.
 */
export function semComentarios(fonte) {
  if (typeof fonte !== "string") return "";
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/**
 * PURA — os sinais do arquivo em disco que TÊM de sobreviver ao transform.
 *
 * Dois tipos, escolhidos porque o transform de DESENVOLVIMENTO preserva os
 * dois (não há minificação em dev, então identificador não é renomeado):
 *
 *  · chaves de i18n em `t("...")` — nunca são tipo, nunca são caminho de
 *    import (que o Vite REESCREVE, e por isso import não serve de sinal).
 *  · nomes DECLARADOS em `function X(` e `const X =` — pegam mudanças de
 *    lógica que não tocam texto nenhum. Foi exatamente o caso do G3:
 *    `handleSimpleConfirmCorrect` virou `handleConfirmDialogCorrect`, e
 *    nenhuma chave de i18n mudou junto.
 *
 * `type`/`interface` ficam de fora de propósito: o transform os APAGA, e
 * incluí-los produziria falso positivo em todo arquivo tipado.
 */
export function sinaisDoDisco(fonteEmDisco) {
  const limpo = semComentarios(fonteEmDisco);
  const sinais = new Set();

  for (const m of limpo.matchAll(/\bt\(\s*"([^"]{8,})"/g)) sinais.add(m[1]);
  for (const m of limpo.matchAll(/\bfunction\s+([A-Za-z_$][\w$]{3,})\s*\(/g)) sinais.add(m[1]);
  for (const m of limpo.matchAll(/\bconst\s+([A-Za-z_$][\w$]{3,})\s*=/g)) sinais.add(m[1]);

  return [...sinais];
}

/**
 * PURA — quais sinais do disco NÃO estão no módulo servido.
 *
 * Lista vazia = o Vite está servindo o arquivo atual. Lista não-vazia = ele
 * está servindo outra coisa, e cada item é uma prova nomeada disso.
 */
export function sinaisAusentesNoServido(sinais, servido) {
  if (typeof servido !== "string" || servido.length === 0) return [...sinais];
  return sinais.filter((s) => !servido.includes(s));
}

/**
 * PURA — o veredito. Separada da coleta pelo mesmo motivo de
 * `anyCheckFailed` no script irmão: é o CÓDIGO DE SAÍDA que o healthcheck
 * lê, não o texto impresso, e um defeito que corrompesse só a combinação
 * deixaria a saída verde com os erros visíveis na tela.
 *
 * `minimoDeSinais` existe para não declarar frescor com base em nada: um
 * arquivo do qual não se extraiu sinal nenhum não prova coisa alguma, e
 * tratar isso como "fresco" seria o mesmo autoengano de uma guarda inerte.
 */
export function estaObsoleto({ sinais, ausentes, minimoDeSinais = 3 }) {
  if (!Array.isArray(sinais) || sinais.length < minimoDeSinais) return false;
  return Array.isArray(ausentes) && ausentes.length > 0;
}

/** Todos os `.ts`/`.tsx` sob `dir`, com o mtime de cada um. */
function arquivosDeFonte(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const full = path.join(dir, nome);
    const st = statSync(full);
    if (st.isDirectory()) arquivosDeFonte(full, acc);
    else if (/\.tsx?$/.test(nome)) acc.push({ full, mtimeMs: st.mtimeMs });
  }
  return acc;
}

/**
 * PURA — escolhe o alvo: o arquivo de maior mtime que produza sinal
 * suficiente. Ordenar por mtime é o que dispensa marcador fixo: a checagem
 * segue sozinha o que foi editado por último, que é justamente o que o
 * cache do Vite mais provavelmente não viu.
 */
export function escolherAlvo(arquivos, lerFonte, minimoDeSinais = 3) {
  const ordenados = [...arquivos].sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const arq of ordenados) {
    let sinais;
    try {
      sinais = sinaisDoDisco(lerFonte(arq.full));
    } catch {
      continue;
    }
    if (sinais.length >= minimoDeSinais) return { full: arq.full, sinais };
  }
  return null;
}

async function main() {
  let arquivos;
  try {
    arquivos = arquivosDeFonte(SRC_DIR);
  } catch (err) {
    console.error(`frescor do Vite: não consegui ler ${SRC_DIR} (${err.message}).`);
    process.exitCode = 1;
    return;
  }

  const alvo = escolherAlvo(arquivos, (f) => readFileSync(f, "utf8"));
  if (!alvo) {
    console.log("frescor do Vite: nenhum arquivo com sinal suficiente — nada a afirmar.");
    return;
  }

  const rel = path.relative(SRC_DIR, alvo.full).split(path.sep).join("/");
  const url = `${VITE_ORIGIN}/src/${rel}`;

  let servido = "";
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.error(`frescor do Vite: ${url} respondeu ${r.status}.`);
      process.exitCode = 1;
      return;
    }
    servido = await r.text();
  } catch (err) {
    console.error(`frescor do Vite: não consegui buscar ${url} (${err.message}).`);
    process.exitCode = 1;
    return;
  }

  const ausentes = sinaisAusentesNoServido(alvo.sinais, servido);
  if (estaObsoleto({ sinais: alvo.sinais, ausentes })) {
    console.error(
      `frescor do Vite: o módulo SERVIDO de src/${rel} não é o que está em disco. ` +
        `${ausentes.length} de ${alvo.sinais.length} sinal(is) do arquivo atual não aparecem no que o Vite ` +
        `devolveu: ${JSON.stringify(ausentes.slice(0, 6))}. ` +
        "O watcher do Vite não viu a edição (bind mount no Windows). Rode: docker compose restart frontend",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`frescor do Vite: src/${rel} servido igual ao disco (${alvo.sinais.length} sinais conferidos).`);
}

const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
  await main();
}
