/**
 * Prova da derivação NOS ARQUIVOS — Fase 2 do 5E, estendida pelo 5F.
 *
 * Não afirma nada por aritmética: para cada insumo real, sonda o
 * preenchimento, roda o ffmpeg de verdade, mede a saída com `ffprobe`, mede o
 * SUJEITO com uma sonda separada e compara a altura dele com a do conteúdo.
 * A conta prevê; o arquivo constata.
 *
 *   docker compose exec backend npx tsx src/scripts/proveDerivation.ts <arquivo>...
 *
 * As saídas vão para uploads/_5e-prova/, que é descartável — nada disto é
 * artefato de cliente.
 */
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { probeVideo, runFfmpeg } from "../services/video/ffmpeg.js";
import { probePadding } from "../services/video/paddingProbe.js";
import {
  buildDerivationArgs,
  buildSubjectProbeArgs,
  deriveFormat,
  targetForAspect,
  type Resolution,
} from "../services/providers/formatDerivation.js";
import { HEYGEN_ASPECT_RATIOS } from "../services/providers/videoFormat.js";

/** Lado curto do alvo de entrega. É o teto do fornecedor, não uma constante nossa. */
const DELIVERY_SHORT_EDGE = 1080;

const OUT_DIR = path.join(config.uploadsDir, "_5e-prova");

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const insumos = process.argv.slice(2);
  if (insumos.length === 0) {
    console.error("uso: proveDerivation.ts <arquivo> [arquivo...]");
    process.exit(2);
  }

  let ampliaram = 0;
  let cortaram = 0;
  let tempoTotal = 0;

  for (const insumo of insumos) {
    const geo = await probeVideo(insumo);
    const nome = path.basename(insumo).slice(0, 8);
    const padding = await probePadding(insumo);

    const quadro: Resolution = { width: geo.width, height: geo.height };
    const conteudo: Resolution = { width: padding.content.width, height: padding.content.height };

    console.log(`\n${"=".repeat(78)}`);
    console.log(`INSUMO ${nome} — quadro ${geo.width}×${geo.height} ${geo.codec} ${geo.durationSeconds.toFixed(3)}s`);
    console.log(`  sonda: ${padding.verdict} · conteúdo ${conteudo.width}×${conteudo.height} · ` +
      `preenchimento ${(padding.paddingFraction * 100).toFixed(1)}%`);

    // -------- A.2: a régua antes e depois ---------------------------------
    console.log(`\n  RÉGUA — o que a tabela dizia (sobre o QUADRO) × o que diz agora (sobre o CONTEÚDO)`);
    console.log(`  formato | quadro:  saída        atende? | conteúdo: saída        atende?`);
    for (const aspect of HEYGEN_ASPECT_RATIOS) {
      const target = targetForAspect(aspect, DELIVERY_SHORT_EDGE);
      const antes = deriveFormat(quadro, { aspectRatio: aspect, target });
      const depois = deriveFormat(conteudo, { aspectRatio: aspect, target });
      const mudou = antes.meetsTarget !== depois.meetsTarget ||
        antes.canvas.width !== depois.canvas.width || antes.canvas.height !== depois.canvas.height;
      console.log(
        `  ${aspect.padEnd(7)} | ${`${antes.canvas.width}×${antes.canvas.height}`.padEnd(12)} ` +
          `${(antes.meetsTarget ? "sim" : "NÃO").padEnd(7)} | ` +
          `${`${depois.canvas.width}×${depois.canvas.height}`.padEnd(12)} ` +
          `${(depois.meetsTarget ? "sim" : "NÃO").padEnd(7)}${mudou ? "  ← mudou" : ""}`,
      );
    }

    // -------- A.3/A.4: a cadeia nova, medida ------------------------------
    console.log(`\n  DERIVAÇÃO (sonda → recorte → decrease → fundo → overlay)`);
    for (const aspect of HEYGEN_ASPECT_RATIOS) {
      const target = targetForAspect(aspect, DELIVERY_SHORT_EDGE);
      const plan = deriveFormat(conteudo, { aspectRatio: aspect, target });

      const slug = aspect.replace(":", "x");
      const saida = path.join(OUT_DIR, `${nome}-${slug}.mp4`);
      const sonda = path.join(OUT_DIR, `${nome}-${slug}-sujeito.png`);

      const { elapsedMs } = await runFfmpeg(
        buildDerivationArgs(insumo, saida, plan.canvas, padding.crop),
        `prova ${nome} ${aspect}`,
      );
      await runFfmpeg(
        buildSubjectProbeArgs(insumo, sonda, plan.canvas, padding.crop),
        `sonda ${nome} ${aspect}`,
      );
      tempoTotal += elapsedMs / 1000;

      const real = await probeVideo(saida);
      const sujeito = await probeVideo(sonda);

      // A INVARIANTE, medida contra o CONTEÚDO — não contra o quadro. Comparar
      // com o quadro daria folga falsa de 58% num master preenchido.
      const ampliou = sujeito.height > conteudo.height || sujeito.width > conteudo.width;
      const propConteudo = conteudo.width / conteudo.height;
      const propSujeito = sujeito.width / sujeito.height;
      const cortou = Math.abs(propConteudo - propSujeito) > 0.02;
      if (ampliou) ampliaram += 1;
      if (cortou) cortaram += 1;

      console.log(
        `  ${aspect.padEnd(7)} quadro ${`${real.width}×${real.height}`.padEnd(11)}` +
          ` sujeito ${`${sujeito.width}×${sujeito.height}`.padEnd(11)}` +
          ` (conteúdo ${conteudo.width}×${conteudo.height})` +
          ` ${ampliou ? "AMPLIOU ✗" : "sem ampliar ✓"}` +
          ` ${cortou ? "CORTOU ✗" : "sem cortar ✓"}` +
          ` ${(elapsedMs / 1000).toFixed(1)}s` +
          `${plan.meetsTarget ? "" : "  [ABAIXO DO ALVO]"}`,
      );
    }
  }

  console.log(
    `\n${"=".repeat(78)}\n${ampliaram} ampliaram, ${cortaram} cortaram. ` +
      `Tempo total ${tempoTotal.toFixed(1)}s. Saídas em ${OUT_DIR} ` +
      `(${(await readdir(OUT_DIR)).length} arquivo(s)).`,
  );

  if (ampliaram > 0 || cortaram > 0) process.exit(1);
}

main().catch((err) => {
  console.error("prova falhou:", err);
  process.exit(1);
});
