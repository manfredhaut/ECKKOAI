/**
 * Prova da derivação NOS ARQUIVOS — Fase 2 do bloco 5E.
 *
 * Não afirma nada por aritmética: para cada insumo real, roda o ffmpeg de
 * verdade, mede a saída com `ffprobe`, mede o SUJEITO com uma sonda separada e
 * compara a altura dele com a do master. A conta prevê; o arquivo constata.
 *
 *   docker compose exec backend npx tsx src/scripts/proveDerivation.ts
 *
 * As saídas vão para uploads/_5e-prova/, que é descartável — nada disto é
 * artefato de cliente.
 */
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { probeVideo, runFfmpeg } from "../services/video/ffmpeg.js";
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

interface Linha {
  insumo: string;
  aspect: string;
  quadroPrevisto: string;
  quadroReal: string;
  sujeitoPrevisto: string;
  sujeitoReal: string;
  alturaMaster: number;
  ampliou: boolean;
  cortou: boolean;
  segundos: number;
  atendeAlvo: boolean;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const insumos = process.argv.slice(2);
  if (insumos.length === 0) {
    console.error("uso: proveDerivation.ts <arquivo> [arquivo...]");
    process.exit(2);
  }

  const linhas: Linha[] = [];

  for (const insumo of insumos) {
    const master = await probeVideo(insumo);
    const nome = path.basename(insumo).slice(0, 8);
    console.log(
      `\n=== INSUMO ${nome} — ${master.width}×${master.height} ${master.codec} ` +
        `${master.durationSeconds.toFixed(3)}s`,
    );

    for (const aspect of HEYGEN_ASPECT_RATIOS) {
      const target = targetForAspect(aspect, DELIVERY_SHORT_EDGE);
      const d = deriveFormat({ width: master.width, height: master.height }, { aspectRatio: aspect, target });

      const slug = aspect.replace(":", "x");
      const saida = path.join(OUT_DIR, `${nome}-${slug}.mp4`);
      const sonda = path.join(OUT_DIR, `${nome}-${slug}-sujeito.png`);

      const { elapsedMs } = await runFfmpeg(
        buildDerivationArgs(insumo, saida, d.canvas),
        `prova ${nome} ${aspect}`,
      );
      await runFfmpeg(buildSubjectProbeArgs(insumo, sonda, d.canvas), `sonda ${nome} ${aspect}`);

      const real = await probeVideo(saida);
      const sujeito = await probeVideo(sonda);

      // A INVARIANTE, medida e não deduzida: o sujeito nunca sai mais alto nem
      // mais largo do que entrou. Passar significa que houve ampliação.
      const ampliou = sujeito.height > master.height || sujeito.width > master.width;
      // E nunca é cortado: a proporção do sujeito tem de ser a do master.
      const propMaster = master.width / master.height;
      const propSujeito = sujeito.width / sujeito.height;
      const cortou = Math.abs(propMaster - propSujeito) > 0.01;

      linhas.push({
        insumo: nome,
        aspect,
        quadroPrevisto: `${d.canvas.width}×${d.canvas.height}`,
        quadroReal: `${real.width}×${real.height}`,
        sujeitoPrevisto: `${d.subject.width}×${d.subject.height}`,
        sujeitoReal: `${sujeito.width}×${sujeito.height}`,
        alturaMaster: master.height,
        ampliou,
        cortou,
        segundos: elapsedMs / 1000,
        atendeAlvo: d.meetsTarget,
      });

      console.log(
        `  ${aspect.padEnd(5)} quadro ${`${real.width}×${real.height}`.padEnd(10)}` +
          ` sujeito ${`${sujeito.width}×${sujeito.height}`.padEnd(10)}` +
          ` (master h=${master.height})` +
          ` ${ampliou ? "AMPLIOU ✗" : "sem ampliar ✓"}` +
          ` ${cortou ? "CORTOU ✗" : "sem cortar ✓"}` +
          ` ${(elapsedMs / 1000).toFixed(1)}s` +
          ` ${d.meetsTarget ? "" : "[ABAIXO DO ALVO]"}`,
      );
      if (d.shortfall) console.log(`        ↳ ${d.shortfall}`);
    }
  }

  console.log("\n\n=== TABELA (Fase 2.4) ===");
  console.log(
    "insumo   | formato | quadro previsto→real      | sujeito previsto→real     | h master | ampliou | cortou | tempo",
  );
  for (const l of linhas) {
    console.log(
      `${l.insumo} | ${l.aspect.padEnd(7)} | ${l.quadroPrevisto.padEnd(11)}→${l.quadroReal.padEnd(11)} | ` +
        `${l.sujeitoPrevisto.padEnd(11)}→${l.sujeitoReal.padEnd(11)} | ${String(l.alturaMaster).padStart(8)} | ` +
        `${l.ampliou ? "SIM ✗" : "não ✓"}   | ${l.cortou ? "SIM ✗" : "não ✓"}  | ${l.segundos.toFixed(1)}s`,
    );
  }

  const ampliaram = linhas.filter((l) => l.ampliou);
  const cortaram = linhas.filter((l) => l.cortou);
  console.log(
    `\n${linhas.length} derivação(ões): ${ampliaram.length} ampliaram, ${cortaram.length} cortaram.`,
  );
  console.log(`Tempo total ${linhas.reduce((s, l) => s + l.segundos, 0).toFixed(1)}s.`);
  console.log(`Saídas em ${OUT_DIR}: ${(await readdir(OUT_DIR)).length} arquivo(s).`);

  if (ampliaram.length > 0 || cortaram.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("prova falhou:", err);
  process.exit(1);
});
