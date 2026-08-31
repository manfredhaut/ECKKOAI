/**
 * Sonda manual, descartável — item 5 da rodada de 29/08 seguinte.
 *
 * Testa `concatVideos` com `corrigirCor: true` contra `corrigirCor: false`
 * sobre 3 arquivos LOCAIS (blocos já aprovados nesta sessão) — CUSTO ZERO.
 *
 *   docker compose exec backend npx tsx src/scripts/probeColorMatch.ts
 */
import { concatVideos } from "../services/video/ffmpeg.js";

async function main() {
  await concatVideos(["/tmp/b1.mp4", "/tmp/b2.mp4", "/tmp/b3.mp4"], "/tmp/sem_colormatch.mp4", { corrigirCor: false });
  console.log("sem colorMatch: /tmp/sem_colormatch.mp4");
  await concatVideos(["/tmp/b1.mp4", "/tmp/b2.mp4", "/tmp/b3.mp4"], "/tmp/com_colormatch.mp4", { corrigirCor: true });
  console.log("com colorMatch: /tmp/com_colormatch.mp4");
}

main().catch((err) => {
  console.error("FALHOU:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
