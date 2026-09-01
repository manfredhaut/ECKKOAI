/**
 * V34, itens 5 e 6 — o vídeo PARA junto com a fala.
 *
 * ┌─ O defeito que isto fecha ────────────────────────────────────────────────┐
 * │ `duration` pedido ao Wan é `ceil(áudio real + margem)` — um INTEIRO,      │
 * │ sempre >= à fala. `sync_mode: "cut_off"` do `sync-lipsync` corta o VÍDEO  │
 * │ no fim da fala quando o vídeo é mais longo, mas só até o segundo mais    │
 * │ próximo que o fornecedor de fato entregou — a combinação de              │
 * │ arredondamento (ceil) + margem deixava 1-2s de vídeo MUDO sobrando no    │
 * │ fim (MEDIDO pelo operador como inaceitável). `apararSobraMuda`/          │
 * │ `apararVideoFinal` (ffmpeg.ts/falPipeline.ts) são o CORTE de precisão,   │
 * │ DEPOIS do lipsync, que fecha essa folga até no máximo                    │
 * │ `SOBRA_MAXIMA_APOS_APARAR_SEGUNDOS` (0,3s).                              │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  `apararSobraMuda`, rodando ffmpeg de VERDADE sobre a fixture local
 *       (sem rede, sem fornecedor), corta um vídeo mais longo para terminar
 *       no alvo pedido — a duração de SAÍDA fica dentro de uma folga mínima
 *       do alvo (nunca mais longa que o alvo + a granularidade de um quadro).
 *  G-2  a folga declarada (`SOBRA_MAXIMA_APOS_APARAR_SEGUNDOS`) é 0,3s —
 *       ESTÁTICO: o número em si é uma escolha de produto, não uma medição.
 *  G-3  ESTÁTICO (texto) — a fiação em `sincronizarComAudio` continua
 *       chamando `apararVideoFinal` condicionado a `apararSobraFinal !==
 *       false`; nenhuma guarda de EXECUÇÃO cobre este ponto porque toda
 *       chamada real passa por `falUpload` (rede ao fornecedor) — as duas
 *       guardas que testam este caminho (`checkFalVideoApprovalPolicy.ts`,
 *       `checkFalGastoInstrumentadoPolicy.ts`) desligam a função de
 *       propósito (`apararSobraFinal: false`) para não pagar `ffmpeg` contra
 *       uma URL fake. O texto exato da condição é a única superfície que
 *       sobra — mesma técnica de `checkColorMatchDefaultPolicy.ts`.
 *
 * Custo: ZERO. `ffmpeg` roda contra a fixture LOCAL versionada
 * (`simulated-video-9x16.mp4`) — nenhuma rede, nenhum fornecedor.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { Mutant } from "./mutants.js";
import { probeVideo, ffmpegAvailable, apararSobraMuda } from "../services/video/ffmpeg.js";
import { SOBRA_MAXIMA_APOS_APARAR_SEGUNDOS } from "../services/video/falPipeline.js";
import { FIXTURES_DIR } from "../services/providers/fixtureProvider.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "sincronizarComAudio apara o vídeo final para terminar logo depois do áudio",
    name: "a fiação do recorte final some de sincronizarComAudio",
    kind: "obvio",
    file: PIPELINE,
    find:
      "  const videoUrlFinal =\n" +
      '    input.tier !== "premium" &&\n' +
      "    !isFixtureMode() &&\n" +
      "    fala.durationSeconds != null &&\n" +
      "    input.apararSobraFinal !== false\n" +
      "      ? await apararVideoFinal(input.apiKeyFal, String(videoFinalUrl), fala.durationSeconds)\n" +
      "      : String(videoFinalUrl);",
    replace: "  const videoUrlFinal = String(videoFinalUrl);",
    expect: "a condição completa (tier, fixture, duração conhecida, apararSobraFinal) não aparece exatamente 1 vez",
  },
  {
    guard: "sincronizarComAudio apara o vídeo final para terminar logo depois do áudio",
    name: "o recorte final passa a rodar também no tier Premium",
    kind: "esperto",
    // ESPERTO: a condição de tier some, mas a superfície observável (para
    // Normal, com áudio conhecido) é idêntica — só Premium (fora de escopo
    // desta rodada, nunca medido contra este corte) passaria a ser afetado.
    file: PIPELINE,
    find:
      "  const videoUrlFinal =\n" +
      '    input.tier !== "premium" &&\n' +
      "    !isFixtureMode() &&\n",
    replace: "  const videoUrlFinal =\n    true &&\n    !isFixtureMode() &&\n",
    expect: "a condição completa (tier, fixture, duração conhecida, apararSobraFinal) não aparece exatamente 1 vez",
  },
];

export interface TrimOvershootCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkTrimOvershootPolicy(): Promise<TrimOvershootCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-2: a folga é 0,3s, e é uma ESCOLHA, não uma medição ---------------
  if (SOBRA_MAXIMA_APOS_APARAR_SEGUNDOS !== 0.3) {
    failures.push(
      `recorte final: SOBRA_MAXIMA_APOS_APARAR_SEGUNDOS é ${SOBRA_MAXIMA_APOS_APARAR_SEGUNDOS}, esperado 0,3 — ` +
        "o teto de overshoot documentado (V34, item 6) mudou sem que o texto deste arquivo fosse revisto.",
    );
  }

  // --- G-3: a fiação (texto) segue condicionada a apararSobraFinal !== false
  let fonte: string;
  try {
    fonte = readFileSync(path.join(process.env.REPO_ROOT ?? "/repo", PIPELINE), "utf8");
  } catch (err) {
    failures.push(`recorte final: não consegui ler ${PIPELINE} (${err instanceof Error ? err.message : err}).`);
    fonte = "";
  }
  if (fonte) {
    const ANCORA_CONDICAO = 'input.tier !== "premium" &&\n    !isFixtureMode() &&\n    fala.durationSeconds != null &&\n    input.apararSobraFinal !== false';
    if (fonte.split(ANCORA_CONDICAO).length - 1 !== 1) {
      failures.push(
        "recorte final: a condição completa (tier, fixture, duração conhecida, apararSobraFinal) não " +
          `aparece exatamente 1 vez em ${PIPELINE} — a fiação do corte final mudou de forma que este texto ` +
          "não acompanhou, e uma guarda ancorada em texto velho é pior que nenhuma.",
      );
    }
  }

  // --- G-1: a MEDIÇÃO — ffmpeg real sobre a fixture local ------------------
  const disponivel = await ffmpegAvailable();
  if (!disponivel.ok) {
    notes.push(
      `recorte final: ffmpeg indisponível (${disponivel.detail.slice(0, 60)}) — a medição do overshoot NÃO ` +
        "foi executada nesta passada. A invariante segue não verificada aqui.",
    );
    if (failures.length === 0) return { failures, notes };
    return { failures, notes };
  }

  const master = path.join(FIXTURES_DIR, "simulated-video-9x16.mp4");
  let duracaoMaster: number;
  try {
    const p = await probeVideo(master);
    duracaoMaster = p.durationSeconds;
  } catch (err) {
    failures.push(
      `recorte final: não foi possível medir a fixture de master (${err instanceof Error ? err.message.slice(0, 80) : err}). ` +
        "Sem ela, a medição do overshoot não é verificada por ninguém.",
    );
    return { failures, notes };
  }

  if (duracaoMaster < 1) {
    notes.push(
      `recorte final: a fixture de master mede ${duracaoMaster.toFixed(3)}s, curta demais para um corte ` +
        "de teste com folga — a medição do overshoot NÃO foi executada nesta passada.",
    );
    return { failures, notes };
  }

  // Alvo comfortavelmente MENOR que o master, para forçar um corte real —
  // metade da duração medida, nunca um número inventado.
  const alvoSegundos = duracaoMaster / 2;
  const dir = await mkdtemp(path.join(tmpdir(), "trim-guard-"));
  const outputPath = path.join(dir, "aparado.mp4");
  try {
    await apararSobraMuda(master, outputPath, alvoSegundos);
    const saida = await probeVideo(outputPath);

    // A folga aceita é a granularidade de UM quadro do ffmpeg (`-t` corta no
    // quadro mais próximo ANTES do alvo, nunca depois) — 0,2s cobre até 5fps,
    // bem abaixo de qualquer entrega real deste pipeline.
    const FOLGA_TESTE_SEGUNDOS = 0.2;
    if (saida.durationSeconds > alvoSegundos + FOLGA_TESTE_SEGUNDOS) {
      failures.push(
        `recorte final: pedido apararSobraMuda(..., ${alvoSegundos.toFixed(3)}s) e a saída mediu ` +
          `${saida.durationSeconds.toFixed(3)}s — ultrapassa o alvo em mais que a folga de um quadro ` +
          `(${FOLGA_TESTE_SEGUNDOS}s). O corte não está terminando no alvo pedido.`,
      );
    }
    if (saida.durationSeconds < alvoSegundos - FOLGA_TESTE_SEGUNDOS) {
      failures.push(
        `recorte final: pedido apararSobraMuda(..., ${alvoSegundos.toFixed(3)}s) e a saída mediu ` +
          `${saida.durationSeconds.toFixed(3)}s — cortou LONGE DEMAIS do alvo (mais de um quadro de folga ` +
          "para trás). Um corte que sobra pouco é aceitável (granularidade de quadro); um que sobra " +
          "MUITO some com fala que deveria ficar.",
      );
    }

    if (failures.length === 0) {
      notes.push(
        `recorte final: apararSobraMuda cortou um vídeo real de ${duracaoMaster.toFixed(3)}s para ` +
          `${saida.durationSeconds.toFixed(3)}s (alvo ${alvoSegundos.toFixed(3)}s) — dentro da folga de um ` +
          `quadro (${FOLGA_TESTE_SEGUNDOS}s), medido com ffmpeg real sobre a fixture local; ` +
          `SOBRA_MAXIMA_APOS_APARAR_SEGUNDOS = ${SOBRA_MAXIMA_APOS_APARAR_SEGUNDOS}s`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  return { failures, notes };
}
