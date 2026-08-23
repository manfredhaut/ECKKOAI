/**
 * `tools/checkFrontendBundleFreshness.mjs` — V2, 22/08/2026.
 *
 * A guarda prova por EXECUÇÃO das funções puras (mesmo padrão de
 * `checkBackupPolicy.ts`), e prova contra o CASO REAL do incidente que a
 * motivou, não só contra o estado atual: o achado #1 do ensaio PASSO U1.C
 * (22/08/2026) foi o frontend servir o `GenerateStep.tsx` de ANTES do
 * commit `a93d232` (o diálogo de confirmação do tier Simples/HeyGen),
 * porque o container estava de pé desde antes daquele commit e o Vite não
 * recarregou sozinho — `docker compose restart frontend` corrigiu.
 *
 * G-1 mede `bundleHasMarker` contra o EXCERTO REAL do arquivo tal como
 * existia no commit `429b69b` (pai de `a93d232`, obtido por
 * `git show 429b69b:frontend/src/pages/CreateVideo/steps/GenerateStep.tsx`)
 * — o texto que estava de fato sendo servido durante o incidente — e contra
 * o arquivo ATUAL, lido do disco. Provar só contra o atual não pegaria uma
 * guarda que sempre devolve `true`; provar só contra o excerto antigo não
 * pegaria uma guarda que sempre devolve `false`. As duas pontas, sempre.
 *
 * G-2 mede `isBundleStale` com os DOIS horários REAIS do incidente:
 * `StartedAt` do container (`2026-08-22T07:32:13Z`, medido por
 * `docker inspect` no ensaio) contra o horário do commit `a93d232`
 * (`2026-08-22T08:22:06-03:00`, `git log --format=%cI`) — o par que
 * REALMENTE ocorreu e que a checagem existe para detectar.
 *
 * G-3 mede `anyCheckFailed` — a função que traduz os sinais em código de
 * saída, separada do laço de rede/exec para ser testável sem curl/docker/
 * git. É ela, não os `console.error`, que `tools/up.sh` de fato lê.
 *
 * G-4 é FORMA: confere que `tools/up.sh` chama o script e que a falha dele
 * é somada a `failed` — sem isso, o mecanismo existe mas "Pronto." aparece
 * de qualquer jeito, que é o mesmo defeito de ter uma trava e nunca
 * fechá-la.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const SCRIPT_REL = "tools/checkFrontendBundleFreshness.mjs";
const UP_SH_REL = "tools/up.sh";

/**
 * Excerto REAL de `frontend/src/pages/CreateVideo/steps/GenerateStep.tsx`
 * no commit `429b69b` (pai de `a93d232`, T2 — antes do diálogo de
 * confirmação). É literalmente o texto que o Vite estava servindo durante
 * o incidente do ensaio: o clique em "Gerar vídeo" ia direto para
 * `handleGenerate`, sem gate nenhum por tier.
 */
const EXCERTO_ANTES_DO_DIALOGO = `
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={submitting || blocked}
            style={{ marginTop: 12 }}
          >
            {submitting ? t("createVideo.generate.submitting") : t("createVideo.generate.generateButton")}
          </button>
`;

/** O par real do incidente — medido no ensaio de 22/08/2026. */
const FRONTEND_STARTED_AT_DO_INCIDENTE = "2026-08-22T07:32:13Z";
const COMMIT_DO_DIALOGO = "2026-08-22T08:22:06-03:00"; // a93d232, git log --format=%cI

export const MUTANTS: Mutant[] = [
  {
    guard: "checagem de frescor: bundleHasMarker exige o marcador do diálogo de confirmação",
    name: "bundleHasMarker passa a devolver sempre true, ignorando o conteúdo",
    kind: "esperto",
    // ESPERTO: a função continua existindo, continua com a mesma assinatura,
    // continua sendo chamada em `main()` — só o VEREDITO fica cego. Um
    // frontend com bundle velho (o incidente real) passaria "Pronto." de
    // qualquer jeito.
    file: SCRIPT_REL,
    find: "  return typeof servedSource === \"string\" && servedSource.includes(CONFIRM_DIALOG_MARKER);",
    replace: "  return true;",
    expect: "checagem de frescor: bundleHasMarker(excerto SEM o diálogo) devolveu true, esperado false",
  },
  {
    guard: "checagem de frescor: isBundleStale compara STARTED < COMMITTED, não o inverso",
    name: "a comparação de isBundleStale é invertida",
    kind: "esperto",
    // ESPERTO: as duas datas continuam sendo parseadas, a função continua
    // devolvendo um booleano — só o SENTIDO da comparação inverte. Um
    // frontend REALMENTE desatualizado (started < committed) passaria a ler
    // "não está obsoleto", e um frontend recém-reiniciado seria acusado à
    // toa.
    file: SCRIPT_REL,
    find: "  return started < committed;",
    replace: "  return started > committed;",
    expect: "checagem de frescor: isBundleStale(par real do incidente) devolveu false, esperado true",
  },
  {
    guard: "checagem de frescor: anyCheckFailed acusa falha quando QUALQUER sinal deu false",
    name: "anyCheckFailed passa a exigir que TODOS os sinais falhem (.every em vez de .some)",
    kind: "esperto",
    // ESPERTO: a função continua existindo, continua devolvendo um
    // booleano, continua sendo chamada por `main()` para decidir
    // `process.exitCode` — só o CRITÉRIO de combinação muda. Com dois
    // sinais (marcador + data), um bundle velho que só reprovasse o
    // marcador (o caso do incidente, quando a data não tem dado suficiente)
    // deixaria de virar código de saída 1 — os `console.error` continuam
    // na tela, ignorados por `up.sh`, que só lê o código de saída.
    file: SCRIPT_REL,
    find: "  return resultados.some((ok) => ok === false);",
    replace: "  return resultados.every((ok) => ok === false);",
    expect: "checagem de frescor: anyCheckFailed([true, false]) devolveu false, esperado true",
  },
  {
    guard: "tools/up.sh chama a checagem de frescor do frontend e soma a falha a `failed`",
    name: "a chamada a checkFrontendBundleFreshness.mjs some de up.sh",
    kind: "obvio",
    file: UP_SH_REL,
    find: 'ORIGIN="$ORIGIN" BASE_DOMAIN="$BASE_DOMAIN" node "$ROOT/tools/checkFrontendBundleFreshness.mjs" || failed=1',
    replace: "true",
    // ⚠️ I1, 22/08/2026: faltava o prefixo "tools/" antes do nome do script —
    // a mensagem real (linha abaixo, G-4) inclui SCRIPT_REL por extenso
    // ("tools/checkFrontendBundleFreshness.mjs"), e o `expect` sem o prefixo
    // nunca casava como substring. A guarda SEMPRE reprovou pela razão certa
    // (G-4 dispara certinho); só o texto de prova estava desalinhado, e o
    // arnês classificou como INERTE por não achar a mensagem esperada.
    expect: "checagem de frescor: tools/up.sh não chama mais tools/checkFrontendBundleFreshness.mjs",
  },
];

export interface FrontendBundleFreshnessCheckResult {
  failures: string[];
  notes: string[];
}

interface FreshnessModuleShape {
  bundleHasMarker: (servedSource: string) => boolean;
  isBundleStale: (frontendStartedAtIso: string, lastCommitIso: string) => boolean;
  anyCheckFailed: (resultados: Array<boolean>) => boolean;
  CONFIRM_DIALOG_MARKER: string;
  GENERATE_STEP_REL: string;
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export async function checkFrontendBundleFreshnessPolicy(
  repoRoot: string,
): Promise<FrontendBundleFreshnessCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------
  // EXECUÇÃO REAL das funções puras — `?bust=` invalida o cache de módulo
  // ESM do Node, mesmo motivo de checkBackupPolicy.ts: sem isso, um mutante
  // revertido leria a versão em cache da primeira importação.
  // ---------------------------------------------------------------------
  const scriptFull = path.join(repoRoot, SCRIPT_REL);
  let mod: FreshnessModuleShape;
  try {
    mod = (await import(
      `file://${scriptFull.replace(/\\/g, "/")}?bust=${Date.now()}-${Math.random()}`
    )) as FreshnessModuleShape;
  } catch (err) {
    failures.push(
      `checagem de frescor: ${SCRIPT_REL} não pôde ser importado para execução (${
        err instanceof Error ? err.message : String(err)
      }) — um erro de sintaxe aqui quebraria a checagem sem que ninguém percebesse até precisar dela.`,
    );
    return { failures, notes };
  }

  // -------------------------------------------------------------------------
  // G-1: bundleHasMarker — excerto REAL de antes do diálogo (429b69b) e o
  // arquivo ATUAL, lido do disco.
  // -------------------------------------------------------------------------
  if (mod.bundleHasMarker(EXCERTO_ANTES_DO_DIALOGO) !== false) {
    failures.push(
      "checagem de frescor: bundleHasMarker(excerto SEM o diálogo) devolveu true, esperado false — este " +
        "excerto é o texto REAL de frontend/src/pages/CreateVideo/steps/GenerateStep.tsx no commit " +
        "429b69b (pai de a93d232), o que estava de fato servido durante o incidente do ensaio de 22/08. " +
        "Uma guarda que aceita este texto como \"tem o diálogo\" nunca pegaria o bug real.",
    );
  }

  let generateStepAtual: string;
  try {
    generateStepAtual = lerDaRaiz(repoRoot, mod.GENERATE_STEP_REL);
  } catch (err) {
    failures.push(
      `checagem de frescor: não consegui ler ${mod.GENERATE_STEP_REL} para conferir o marcador no arquivo ` +
        `atual (${err instanceof Error ? err.message : String(err)}).`,
    );
    generateStepAtual = "";
  }
  if (generateStepAtual && mod.bundleHasMarker(generateStepAtual) !== true) {
    failures.push(
      `checagem de frescor: bundleHasMarker(${mod.GENERATE_STEP_REL} atual) devolveu false, esperado true — ` +
        `o marcador (\`${mod.CONFIRM_DIALOG_MARKER}\`) não está mais no arquivo-fonte de verdade. Ou o ` +
        "diálogo do Simples foi removido, ou a chave de tradução mudou sem atualizar a checagem junto.",
    );
  }

  if (!failures.some((f) => f.startsWith("checagem de frescor: bundleHasMarker"))) {
    notes.push(
      "    checagem de frescor: bundleHasMarker distingue o excerto real de antes do diálogo (429b69b) " +
        "do arquivo atual",
    );
  }

  // -------------------------------------------------------------------------
  // G-2: isBundleStale — o par real do incidente.
  // -------------------------------------------------------------------------
  if (mod.isBundleStale(FRONTEND_STARTED_AT_DO_INCIDENTE, COMMIT_DO_DIALOGO) !== true) {
    failures.push(
      "checagem de frescor: isBundleStale(par real do incidente) devolveu false, esperado true — o " +
        `container subiu em ${FRONTEND_STARTED_AT_DO_INCIDENTE}, o commit do diálogo é de ` +
        `${COMMIT_DO_DIALOGO} (posterior). Esta função precisa acusar staleness NESTE par, porque foi ` +
        "exatamente este par que aconteceu de verdade.",
    );
  } else if (mod.isBundleStale("2026-08-22T15:00:00Z", COMMIT_DO_DIALOGO) !== false) {
    failures.push(
      "checagem de frescor: isBundleStale(container reiniciado DEPOIS do commit) devolveu true, esperado " +
        "false — um frontend recém-reiniciado seria acusado de estar obsoleto à toa.",
    );
  } else if (mod.isBundleStale("", "") !== false) {
    failures.push(
      "checagem de frescor: isBundleStale(datas ausentes) devolveu true — sem os dois horários, a função " +
        "não tem base para acusar staleness; ausência de evidência não é evidência de staleness.",
    );
  } else {
    notes.push(
      "    checagem de frescor: isBundleStale acusa exatamente o par real do incidente (container antes " +
        "do commit), e só ele",
    );
  }

  // -------------------------------------------------------------------------
  // G-3: anyCheckFailed — a combinação dos sinais em código de saída.
  // -------------------------------------------------------------------------
  if (mod.anyCheckFailed([true, true]) !== false) {
    failures.push("checagem de frescor: anyCheckFailed([true, true]) devolveu true, esperado false.");
  } else if (mod.anyCheckFailed([true, false]) !== true) {
    failures.push(
      "checagem de frescor: anyCheckFailed([true, false]) devolveu false, esperado true — um bundle velho " +
        "(marcador ausente) com o sinal de data mudo (sem dado suficiente) precisa continuar virando " +
        "código de saída 1, não ser diluído pelo sinal que não opinou.",
    );
  } else if (mod.anyCheckFailed([]) !== false) {
    failures.push(
      "checagem de frescor: anyCheckFailed([]) devolveu true — nenhum sinal coletado não pode, sozinho, " +
        "virar falha.",
    );
  } else {
    notes.push("    checagem de frescor: anyCheckFailed acusa falha quando QUALQUER sinal deu false, e só então");
  }

  // -------------------------------------------------------------------------
  // G-4: FORMA — tools/up.sh chama o script e soma a falha.
  // -------------------------------------------------------------------------
  const upSh = lerDaRaiz(repoRoot, UP_SH_REL);
  if (
    !upSh.includes(
      'ORIGIN="$ORIGIN" BASE_DOMAIN="$BASE_DOMAIN" node "$ROOT/tools/checkFrontendBundleFreshness.mjs" || failed=1',
    )
  ) {
    failures.push(
      `checagem de frescor: ${UP_SH_REL} não chama mais ${SCRIPT_REL} (ou não soma a falha a \`failed\`) — ` +
        'a checagem pode até existir e reprovar, mas "Pronto." apareceria de qualquer jeito, com o aviso ' +
        "de erro ignorado acima dele.",
    );
  } else {
    notes.push(
      "    checagem de frescor: tools/up.sh chama checkFrontendBundleFreshness.mjs e soma a falha a `failed`",
    );
  }

  return { failures, notes };
}
