#!/usr/bin/env node
/**
 * O frontend está de pé com o CÓDIGO ATUAL, não com um bundle antigo — V2,
 * 22/08/2026.
 *
 * Existe porque um ensaio real (PASSO U1.C, 22/08/2026) reproduziu isto:
 * o container do frontend estava de pé desde 07:32Z, o commit que introduziu
 * o diálogo de confirmação do tier Simples/HeyGen (`a93d232`) é das 11:22Z, e
 * o Vite continuou servindo o módulo de ANTES do diálogo — sem erro, sem
 * aviso. Resultado: "Gerar vídeo" disparava `POST /videos` DIRETO, sem
 * ninguém ter escolhido isso, no caminho que dispara direto no fornecedor.
 * `docker compose restart frontend` corrigiu — o problema nunca foi o
 * código, foi o processo do Vite não ter percebido que ele mudou (bind mount
 * do Windows, watcher que não dispara sempre — gotcha já documentado no
 * CLAUDE.md).
 *
 * DOIS SINAIS, um bloqueia sozinho:
 *
 *  1. MARCADOR NO MÓDULO SERVIDO — não no arquivo em disco, no que o Vite
 *     REALMENTE devolve pela rede. É a prova direta do sintoma exato do
 *     ensaio: se o marcador não está lá, o diálogo não vai abrir, ponto.
 *  2. DATA — o container do frontend subiu DEPOIS do último commit que
 *     tocou `frontend/src`? Sinal mais amplo: cobre qualquer arquivo do
 *     frontend, não só este diálogo, para o dia em que outro componente
 *     tiver o mesmo problema sem uma checagem de marcador própria.
 *
 * Nenhum dos dois precisa do outro para reprovar — um staleness real quase
 * sempre aciona os dois juntos (foi o caso do ensaio), mas a garantia vem de
 * cada um sozinho.
 *
 * Roda no HOST (mesmo motivo de `backup-db.mjs`): precisa de `curl` para
 * falar com o Traefik pela MESMA porta que o navegador usa, `docker` para a
 * hora de início do container, e `git` para a data do commit — nenhum dos
 * três está disponível de dentro do container do backend.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A chave de i18n do botão "Confirmar e gerar" — `GenerateStep.tsx`,
 * `t("createVideo.generate.simpleConfirm.confirm")`. Escolhida como
 * marcador (em vez do TEXTO traduzido) porque sobrevive a troca de idioma
 * e a uma eventual minificação de produção: um minificador de JS renomeia
 * identificadores, nunca o CONTEÚDO de uma string literal passada para
 * `t()` — é a chave que o dicionário de tradução procura, então apagá-la
 * quebraria toda tradução, não só ofuscaria um nome.
 */
export const CONFIRM_DIALOG_MARKER = "simpleConfirm.confirm";

/** Caminho do arquivo-fonte, para a checagem de DATA (item 2). */
export const GENERATE_STEP_REL = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";

/** Caminho pelo qual o Vite serve o módulo transformado, em dev — mesma URL que o navegador pede. */
export const GENERATE_STEP_SERVED_PATH = "/src/pages/CreateVideo/steps/GenerateStep.tsx";

/**
 * PURA — item 1. Recebe o CORPO da resposta HTTP (o módulo como o Vite
 * realmente o serviu), não o caminho do arquivo: testável sem rede.
 */
export function bundleHasMarker(servedSource) {
  return typeof servedSource === "string" && servedSource.includes(CONFIRM_DIALOG_MARKER);
}

/**
 * PURA — item 2. `true` = o container subiu ANTES do commit, e por isso
 * pode estar servindo código de antes dele. Datas ausentes ou inválidas
 * nunca acusam staleness por conta própria — a ausência de evidência não é
 * evidência de ausência, mesmo gotcha já registrado no CLAUDE.md para logs.
 */
export function isBundleStale(frontendStartedAtIso, lastCommitIso) {
  const started = Date.parse(frontendStartedAtIso);
  const committed = Date.parse(lastCommitIso);
  if (!Number.isFinite(started) || !Number.isFinite(committed)) return false;
  return started < committed;
}

function fetchServedModule(origin, host) {
  const result = spawnSync(
    "curl",
    ["-s", "--max-time", "15", "-H", `Host: ${host}`, `${origin}${GENERATE_STEP_SERVED_PATH}`],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    return { ok: false, body: "", detail: result.error?.message ?? `curl saiu com código ${result.status}` };
  }
  return { ok: true, body: result.stdout, detail: "" };
}

function frontendStartedAt() {
  const cid = spawnSync("docker", ["compose", "ps", "-q", "frontend"], { cwd: ROOT, encoding: "utf8" });
  const id = (cid.stdout || "").trim();
  if (!id) return { ok: false, iso: "", detail: "container do frontend não está de pé (docker compose ps -q vazio)" };
  const inspect = spawnSync("docker", ["inspect", "-f", "{{.State.StartedAt}}", id], { encoding: "utf8" });
  if (inspect.error || inspect.status !== 0) {
    return { ok: false, iso: "", detail: inspect.error?.message ?? `docker inspect saiu com código ${inspect.status}` };
  }
  return { ok: true, iso: (inspect.stdout || "").trim(), detail: "" };
}

function lastCommitIsoFor(relPath) {
  const result = spawnSync("git", ["log", "-1", "--format=%cI", "--", relPath], { cwd: ROOT, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return { ok: false, iso: "", detail: result.error?.message ?? `git log saiu com código ${result.status}` };
  }
  const iso = (result.stdout || "").trim();
  if (!iso) return { ok: false, iso: "", detail: `git log não achou commit nenhum tocando ${relPath}` };
  return { ok: true, iso, detail: "" };
}

function green(s) {
  return `[32m${s}[0m`;
}
function red(s) {
  return `[31m${s}[0m`;
}

/**
 * PURA — combina os sinais independentes num veredito só. Separada do laço
 * de rede/exec de propósito, para ser testável sem depender de curl/docker/
 * git: um mutante que corrompesse só esta combinação (ex.: `.every` em vez
 * de `.some`) faria "Pronto." aparecer mesmo com um sinal vermelho impresso
 * na tela — os `console.error` continuariam lá, mas o CÓDIGO DE SAÍDA é o
 * único dado que `tools/up.sh` de fato lê (`|| failed=1`).
 */
export function anyCheckFailed(resultados) {
  return resultados.some((ok) => ok === false);
}

function main() {
  const origin = process.env.ORIGIN;
  const host = process.env.BASE_DOMAIN;
  if (!origin || !host) {
    console.error(red("  FALHA checagem de frescor do frontend: ORIGIN/BASE_DOMAIN não foram passados pelo chamador."));
    process.exitCode = 1;
    return;
  }

  const resultados = [];

  // --- item 1: marcador no módulo REALMENTE servido -----------------------
  const servido = fetchServedModule(origin, host);
  if (!servido.ok) {
    console.error(red(`  FALHA checagem de frescor: não consegui buscar o módulo servido (${servido.detail}).`));
    resultados.push(false);
  } else if (!bundleHasMarker(servido.body)) {
    console.error(
      red(
        "  FALHA o frontend está servindo um bundle SEM o diálogo de confirmação do tier Simples/HeyGen. " +
          '"Gerar vídeo" pode disparar geração direto, sem ninguém ter escolhido isso. ' +
          "Rode: docker compose restart frontend",
      ),
    );
    resultados.push(false);
  } else {
    console.log(green("  OK   diálogo de confirmação (Simples/HeyGen) presente no bundle servido"));
    resultados.push(true);
  }

  // --- item 2: container mais novo que o último commit em frontend/src ---
  const started = frontendStartedAt();
  const commit = lastCommitIsoFor("frontend/src");
  if (!started.ok || !commit.ok) {
    console.log(
      `  (sem dado suficiente para a checagem de data — ${started.detail || commit.detail}; ` +
        "a checagem de marcador acima é a decisiva)",
    );
  } else if (isBundleStale(started.iso, commit.iso)) {
    console.error(
      red(
        `  FALHA o container do frontend subiu em ${started.iso}, ANTES do último commit em frontend/src ` +
          `(${commit.iso}). Pode estar servindo código antigo em qualquer arquivo do frontend, não só o ` +
          "diálogo acima. Rode: docker compose restart frontend",
      ),
    );
    resultados.push(false);
  } else {
    console.log(green("  OK   frontend subiu depois do último commit em frontend/src"));
    resultados.push(true);
  }

  process.exitCode = anyCheckFailed(resultados) ? 1 : 0;
}

const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
  main();
}
