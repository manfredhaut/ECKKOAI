/**
 * Sonda manual, descartável — item 3 da rodada de 29/08 (corte seco).
 *
 * Testa `concatVideosCorteSeco` sobre 3 arquivos LOCAIS (aproximações dos 3
 * blocos, extraídas do vídeo já aprovado por `wiperight` desta sessão, longe
 * das zonas de wipe) — CUSTO ZERO, nenhuma chamada à fal.
 *
 *   docker compose exec backend npx tsx src/scripts/probeCorteSeco.ts
 */
import { concatVideosCorteSeco } from "../services/video/ffmpeg.js";

async function main() {
  await concatVideosCorteSeco(["/tmp/b1.mp4", "/tmp/b2.mp4", "/tmp/b3.mp4"], "/tmp/corteseco.mp4");
  console.log("concatVideosCorteSeco concluído: /tmp/corteseco.mp4");
}

main().catch((err) => {
  console.error("FALHOU:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
