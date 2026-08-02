/**
 * Invariantes de REPRODUÇÃO de vídeo dentro do produto.
 *
 * O defeito congelado aqui foi medido na Fase 0 do bloco 5D: o único lugar do
 * produto que reproduzia um vídeo era o passo 6 do wizard, cujo resultado vive
 * num `useState` — sair de /create ou dar F5 tornava o vídeo inalcançável. A
 * Biblioteca listava onze vídeos com uma única ação, "Baixar", de modo que VER
 * o que se acabou de gerar exigia sair do produto e abrir o arquivo num player
 * externo.
 *
 * Textual, e não comportamental: provar reprodução de verdade exigiria
 * navegador, sessão e um artefato — a Fase 1 fez isso à mão e MEDIU
 * (readyState 4, 360×640, aspect-ratio 9/16). O que a guarda impede é a
 * REMOÇÃO silenciosa: alguém simplificar a Biblioteca de volta para uma lista
 * de downloads, ou o player perder a proporção e voltar a esticar um 9:16 num
 * quadro 16:9, sem que nada reprove.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface PlaybackCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "reprodução: a Biblioteca reproduz",
    name: "a Biblioteca volta a ser uma lista de downloads",
    kind: "obvio",
    file: "frontend/src/pages/Content/ContentPage.tsx",
    find: "              <VideoPlayer video={playingVideo} />",
    replace: "              <span />",
    expect: "não usa <VideoPlayer>",
  },
  {
    guard: "reprodução: a proporção é respeitada",
    name: "o player volta a desenhar todo vídeo no mesmo quadro",
    kind: "esperto",
    // O player continua existindo, continua reproduzindo, e a Biblioteca
    // continua usando-o — só o `aspectRatio` sai. Um 9:16 volta a ser
    // esticado num quadro horizontal, e nada na estrutura da tela muda.
    file: "frontend/src/features/VideoPlayer.tsx",
    find: "          aspectRatio: cssRatio,",
    replace: "",
    expect: "não aplica a proporção",
  },
  {
    guard: "reprodução: todo player avisa quando é simulação",
    name: "o aviso de simulação some do player",
    kind: "esperto",
    // O mais perigoso dos três numa apresentação: o vídeo continua tocando,
    // bonito, e nada diz que ele é um artefato de fixture.
    file: "frontend/src/features/VideoPlayer.tsx",
    find: "      <SimulatedNotice simulated={video.simulated} />",
    replace: "",
    expect: "não avisa quando o vídeo é simulado",
  },
];

const PLAYER = "frontend/src/features/VideoPlayer.tsx";
const BIBLIOTECA = "frontend/src/pages/Content/ContentPage.tsx";

/** Comentários fora: guardas deste projeto já acusaram o texto que as explicava. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

export async function checkVideoPlaybackPolicy(repoRoot: string): Promise<PlaybackCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const ler = async (rel: string): Promise<string | null> => {
    try {
      return semComentarios(await readFile(path.join(repoRoot, rel), "utf-8"));
    } catch {
      failures.push(`reprodução: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
      return null;
    }
  };

  const player = await ler(PLAYER);
  const biblioteca = await ler(BIBLIOTECA);
  if (!player || !biblioteca) return { failures, notes };

  // 1. O player reproduz de verdade.
  if (!/<video\b/.test(player)) {
    failures.push(
      `reprodução: ${PLAYER} não renderiza <video> — não reproduz vídeo nenhum. Sem isso, ver o ` +
        "resultado volta a exigir baixar o arquivo e abri-lo fora do produto.",
    );
  }

  // 2. E respeita a proporção.
  if (!/aspectRatio/.test(player)) {
    failures.push(
      `reprodução: ${PLAYER} não aplica a proporção do vídeo (aspectRatio). Um 9:16 passa a ser ` +
        "desenhado no mesmo quadro de um 16:9 — o vídeo vertical aparece esticado, e o formato que o " +
        "bloco FORMATO-1 existe para honrar deixa de ser visível na tela.",
    );
  }

  // 3. E avisa quando é simulação.
  //
  // Ancorado no USO em JSX (`<SimulatedNotice`), nunca no nome: a primeira
  // versão procurava `SimulatedNotice` no arquivo, e o arnês a flagrou INERTE
  // — removida a renderização, o `import { SimulatedNotice }` continuava lá e
  // satisfazia a busca. O gate passou verde com o defeito aplicado, que numa
  // apresentação seria fixture tocando sem aviso nenhum. É a quinta vez que
  // uma guarda deste projeto casa a menção em vez do uso.
  if (!/<SimulatedNotice\b/.test(player)) {
    failures.push(
      `reprodução: ${PLAYER} não avisa quando o vídeo é simulado. Numa apresentação, um artefato de ` +
        "fixture tocando sem aviso é indistinguível de uma geração real.",
    );
  }

  // 4. A Biblioteca usa o player — e não uma cópia local.
  if (!/<VideoPlayer\b/.test(biblioteca)) {
    failures.push(
      `reprodução: ${BIBLIOTECA} não usa <VideoPlayer>. A Biblioteca é onde o vídeo continua existindo ` +
        "depois que o wizard é fechado; sem player ali, o resultado só é alcançável por download.",
    );
  }

  // 5. E o download continua existindo — reproduzir não substitui levar embora.
  if (!/download/.test(player) && !/download/.test(biblioteca)) {
    failures.push(
      "reprodução: nem o player nem a Biblioteca oferecem download. Assistir dentro do produto não " +
        "substitui baixar o arquivo para publicar.",
    );
  }

  notes.push(
    "reprodução: a Biblioteca reproduz com <VideoPlayer>, que respeita a proporção, avisa simulação e mantém o download",
  );
  return { failures, notes };
}
