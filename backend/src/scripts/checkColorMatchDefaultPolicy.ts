/**
 * `corrigirCor` vira DEFAULT no tier Normal — RODADA 7, item 1 (30/08/2026).
 *
 * ┌─ O que muda, e por quê ────────────────────────────────────────────────┐
 * │ `corrigirCor` (`ffmpeg.ts`) nasceu opt-in (`false` por padrão) na       │
 * │ RODADA anterior, "existe para ser testado isoladamente antes de virar   │
 * │ default" — o teste aconteceu no item 6 da rodada seguinte, reusando os  │
 * │ 3 blocos JÁ PAGOS de uma corrida real: sem correção, o bloco 2 destoava │
 * │ ~28 pontos de RGB do bloco 0; com correção, a diferença caiu a ~1-2      │
 * │ pontos. Esta rodada liga o default — só para Normal.                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Por que só Normal, e por que a condição existe mesmo sendo redundante ─┐
 * │ Premium nunca fraciona — `blocos.length` é sempre 1 para ele            │
 * │ (`ContextoDaAnimacao.tier`), e `concatenarBlocosEPublicar` só é         │
 * │ chamada no caminho de VÁRIOS blocos. Hoje, na prática, `tier` já SÓ     │
 * │ pode ser `"normal"` neste ponto — mas a condição explícita             │
 * │ (`tier === "normal"`) é o que garante isso por CONSTRUÇÃO, não por      │
 * │ uma invariante silenciosa que quebraria sem aviso se Premium um dia     │
 * │ fracionar também.                                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ANCORADA NO TEXTO, não em execução — e por quê ─────────────────────────┐
 * │ `concatenarBlocosEPublicar` retorna ANTES de chamar `concatVideos` em    │
 * │ modo fixture (`if (isFixtureMode()) return ...`, comentário "FIXTURE,   │
 * │ ANTES do ffmpeg" no próprio código) — o `fetch` substituído nunca chega │
 * │ a ver o argumento `corrigirCor`, porque a chamada real a `concatVideos` │
 * │ simplesmente não acontece em fixture. Execução (como              │
 * │ `checkFalSceneWiringPolicy`/`checkExpressivenessDirectionPolicy` fazem   │
 * │ para o `prompt`) não tem como observar este argumento. O texto exato    │
 * │ do argumento é a única superfície que sobra.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. Só leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "concatVideos recebe corrigirCor:true para o tier Normal, e só para ele",
    name: "corrigirCor volta a ser sempre false (default antigo)",
    kind: "obvio",
    file: PIPELINE,
    find: "await concatVideos(videoUrls, outputPath, { corrigirCor: tier === \"normal\" });",
    replace: "await concatVideos(videoUrls, outputPath, { corrigirCor: false });",
    expect: "color-match: concatVideos não recebe corrigirCor:true para o tier Normal",
  },
  {
    guard: "concatVideos recebe corrigirCor:true para o tier Normal, e só para ele",
    name: "corrigirCor vira sempre true (perde a condição por tier)",
    kind: "esperto",
    // ESPERTO: o efeito de HOJE é idêntico (Premium nunca chega aqui com
    // N>1 blocos, então `true` fixo e `tier === "normal"` produzem o MESMO
    // resultado observável agora) — é exatamente por isso que a guarda
    // ancora no TEXTO da condição, não só no resultado: o dia em que
    // Premium fracionar, `true` fixo aplicaria correção de cor a um motor
    // nunca medido para isso, sem ninguém ter decidido isso de propósito.
    file: PIPELINE,
    find: "await concatVideos(videoUrls, outputPath, { corrigirCor: tier === \"normal\" });",
    replace: "await concatVideos(videoUrls, outputPath, { corrigirCor: true });",
    expect: "color-match: concatVideos recebe corrigirCor sem condicionar ao tier Normal",
  },
];

export interface ColorMatchDefaultCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkColorMatchDefaultPolicy(repoRoot: string): Promise<ColorMatchDefaultCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  let fonte: string;
  try {
    fonte = readFileSync(path.join(repoRoot, PIPELINE), "utf8");
  } catch {
    failures.push(`color-match: não consegui ler ${PIPELINE}.`);
    return { failures, notes };
  }

  const ANCORA = 'await concatVideos(videoUrls, outputPath, { corrigirCor: tier === "normal" });';
  const ocorrencias = fonte.split(ANCORA).length - 1;

  if (ocorrencias === 0) {
    failures.push(
      "color-match: concatVideos não recebe corrigirCor:true para o tier Normal — a chamada exata " +
        `\`${ANCORA}\` não aparece mais em ${PIPELINE}. Ou o default voltou a ser false para todo tier, ou ` +
        "a condição deixou de citar \"normal\" explicitamente, e nenhuma das duas foi decidida por " +
        "engano deveria passar em silêncio.",
    );
  } else if (ocorrencias > 1) {
    failures.push(
      `color-match: a âncora ocorre ${ocorrencias} vezes em ${PIPELINE} — deveria ser exatamente 1. ` +
        "Uma segunda ocorrência é um segundo call site de concatVideos que esta guarda não estava " +
        "vigiando, e pode divergir do primeiro sem que ninguém note.",
    );
  }

  // Confirma que a função continua tomando `tier` como parâmetro — sem
  // isso, `tier === "normal"` no corpo seria um erro de compilação (o
  // `tsc` já pegaria), mas a MENSAGEM certa é mais útil que "TS2304".
  if (!fonte.includes("videoUrls: string[],\n  tier: PipelineTier,")) {
    failures.push(
      `color-match: concatenarBlocosEPublicar não declara mais o parâmetro \`tier: PipelineTier\` em ` +
        `${PIPELINE} — sem ele, não há como a chamada condicionar corrigirCor ao tier.`,
    );
  }

  if (failures.length === 0) {
    notes.push(
      "    color-match: concatVideos recebe corrigirCor:true só quando tier === \"normal\" — MEDIDO " +
        "na rodada anterior (bloco destoante caiu de ~28 para ~1-2 pontos de RGB, mesmos 3 blocos pagos)",
    );
  }

  return { failures, notes };
}
