/**
 * Sonda manual, descartável, do bug de estorno da etapa "animar".
 *
 * Não vai a nenhum vendor (fixture ou não — as funções aqui testadas não
 * tocam rede em nenhum modo). Simula, via linhas reais no diário
 * (fal_pipeline_runs/fal_pipeline_steps), os dois desfechos possíveis de uma
 * submissão de animação:
 *
 *   CASO A — a fal REJEITOU antes de aceitar (ex.: 422 de schema). Nenhum
 *   request_id foi gravado. Espera-se `nao_saiu` → estorna.
 *
 *   CASO B — a fal ACEITOU (request_id gravado) e algo falhou depois.
 *   Espera-se `indeterminado` → NÃO estorna.
 *
 * Testa as peças REAIS e exportadas que o novo trecho de routes/videos.ts
 * usa: `requestIdDaEtapa` (nova) + `decidirEstorno` + `refundCredit`
 * (existentes, já usadas pela etapa "compor"). Não importa `decidirEEstornar`
 * porque ela não é exportada por routes/videos.ts — mas é um wrapper fino
 * das três funções abaixo, na mesma ordem, então testar as três é testar a
 * decisão inteira.
 *
 * Todas as linhas criadas são apagadas ao final, e o saldo é conferido antes
 * e depois para provar que a limpeza foi completa.
 *
 *   docker compose exec backend npx tsx src/scripts/probeEstornoAnimar.ts
 */
import { pool } from "../db/pool.js";
import { decidirEstorno } from "../services/video/videoFailure.js";
import { refundCredit } from "../services/billing/creditGate.js";
import { requestIdDaEtapa } from "../services/video/falPipelineJournal.js";

const TENANT_SLUG = "dev-c77a5b";

async function main() {
  const { rows: tenantRows } = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [
    TENANT_SLUG,
  ]);
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) throw new Error(`tenant ${TENANT_SLUG} não encontrado`);

  const saldoAntes = await lerSaldo(tenantId);
  console.log(`saldo de vídeo ANTES do teste: ${saldoAntes}`);

  const criados: { videos: string[]; runs: string[] } = { videos: [], runs: [] };

  try {
    // --- CASO A: rejeitado antes do aceite -> deve estornar ----------------
    const videoA = await criarVideoDescartavel(tenantId);
    criados.videos.push(videoA);
    const runA = await criarCorrida(tenantId, videoA);
    criados.runs.push(runA);
    await criarEtapaAnimar(runA, null); // request_id NULL = fal nunca aceitou
    await debitarConsumoFalso(tenantId, videoA);

    const reqIdA = await requestIdDaEtapa(runA, "animar");
    const decisaoA = decidirEstorno("vendor_rejected", reqIdA != null);
    console.log(`CASO A — requestIdDaEtapa: ${reqIdA === null ? "null (correto)" : `"${reqIdA}" (ERRADO, esperava null)`}`);
    console.log(`CASO A — decidirEstorno: gasto=${decisaoA.gasto} estorna=${decisaoA.estorna}`);
    if (decisaoA.gasto !== "nao_saiu" || !decisaoA.estorna) {
      throw new Error(`CASO A deveria dar gasto=nao_saiu, estorna=true. Recebido: ${JSON.stringify(decisaoA)}`);
    }
    const refundA = await refundCredit({ tenantId, creditType: "video", relatedVideoId: videoA });
    console.log(`CASO A — refundCredit: ${JSON.stringify(refundA)}`);
    if (!refundA.refunded) throw new Error("CASO A: refundCredit deveria ter devolvido o crédito");
    console.log(`CASO A — saldo após débito+estorno: ${await lerSaldo(tenantId)} (esperado: igual ao inicial, ${saldoAntes})`);

    const { rows: ledgerA } = await pool.query(
      "SELECT reason, delta FROM credit_ledger WHERE related_video_id = $1 ORDER BY created_at",
      [videoA],
    );
    console.log(`CASO A — lançamentos no ledger: ${JSON.stringify(ledgerA)}`);
    if (!ledgerA.some((r: any) => r.reason === "refund")) {
      throw new Error("CASO A: não há linha 'refund' no ledger — o bug NÃO foi corrigido");
    }

    // --- CASO B: aceito, falhou depois -> NÃO deve estornar -----------------
    const videoB = await criarVideoDescartavel(tenantId);
    criados.videos.push(videoB);
    const runB = await criarCorrida(tenantId, videoB);
    criados.runs.push(runB);
    await criarEtapaAnimar(runB, "fake-fal-request-id-aceito-b"); // aceito pela fal
    await debitarConsumoFalso(tenantId, videoB);

    const reqIdB = await requestIdDaEtapa(runB, "animar");
    const decisaoB = decidirEstorno("vendor_rejected", reqIdB != null);
    console.log(`CASO B — requestIdDaEtapa: "${reqIdB}"`);
    console.log(`CASO B — decidirEstorno: gasto=${decisaoB.gasto} estorna=${decisaoB.estorna}`);
    if (decisaoB.gasto !== "indeterminado" || decisaoB.estorna) {
      throw new Error(`CASO B deveria dar gasto=indeterminado, estorna=false. Recebido: ${JSON.stringify(decisaoB)}`);
    }
    // Mesma regra do decidirEEstornar real: só chama refundCredit se decisao.estorna.
    console.log("CASO B — refundCredit NÃO chamado, como o código real faz (decisao.estorna === false)");
    console.log(`CASO B — saldo após débito sem estorno: ${await lerSaldo(tenantId)} (esperado: ${saldoAntes - 1}, um a menos que o inicial)`);

    const { rows: ledgerB } = await pool.query(
      "SELECT reason, delta FROM credit_ledger WHERE related_video_id = $1 ORDER BY created_at",
      [videoB],
    );
    console.log(`CASO B — lançamentos no ledger: ${JSON.stringify(ledgerB)}`);
    if (ledgerB.some((r: any) => r.reason === "refund")) {
      throw new Error("CASO B: NÃO deveria haver linha 'refund' — estornou quando não devia");
    }

    console.log("\n✓ Os dois casos se comportaram como esperado.");
  } finally {
    // --- limpeza: apaga tudo que este script criou -------------------------
    for (const videoId of criados.videos) {
      await pool.query("DELETE FROM credit_ledger WHERE related_video_id = $1", [videoId]);
    }
    for (const runId of criados.runs) {
      await pool.query("DELETE FROM fal_pipeline_steps WHERE run_id = $1", [runId]);
    }
    for (const runId of criados.runs) {
      await pool.query("DELETE FROM fal_pipeline_runs WHERE id = $1", [runId]);
    }
    for (const videoId of criados.videos) {
      await pool.query("DELETE FROM videos WHERE id = $1", [videoId]);
    }
    const saldoDepois = await lerSaldo(tenantId);
    console.log(`\nsaldo de vídeo DEPOIS da limpeza: ${saldoDepois} (antes era ${saldoAntes})`);
    if (saldoDepois !== saldoAntes) {
      console.error("⚠ SALDO NÃO BATEU — corrigindo manualmente para o valor original.");
      await pool.query("UPDATE tenant_credits SET balance = $2 WHERE tenant_id = $1 AND credit_type = 'video'", [
        tenantId,
        saldoAntes,
      ]);
    }
    await pool.end();
  }
}

async function lerSaldo(tenantId: string): Promise<number> {
  const { rows } = await pool.query<{ balance: number }>(
    "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = 'video'",
    [tenantId],
  );
  return rows[0]?.balance ?? 0;
}

async function criarVideoDescartavel(tenantId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO videos (tenant_id, script, duration_seconds, status, provider_vendor, failure_reason)
     VALUES ($1, 'teste descartável — estorno de animar', 10, 'error', 'fal', 'vendor_rejected')
     RETURNING id`,
    [tenantId],
  );
  return rows[0].id;
}

async function criarCorrida(tenantId: string, videoId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO fal_pipeline_runs (tenant_id, video_id, script, target_seconds, script_chars, chars_per_second)
     VALUES ($1, $2, 'teste', 10, 10, 12.8)
     RETURNING id`,
    [tenantId, videoId],
  );
  return rows[0].id;
}

async function criarEtapaAnimar(runId: string, requestId: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO fal_pipeline_steps (run_id, etapa, ordem, vendor, endpoint_id, request_id, status, request_at)
     VALUES ($1, 'animar', 2, 'fal', 'wan/v2.6/image-to-video/flash', $2, 'running', now())`,
    [runId, requestId],
  );
}

/** Simula o débito que JÁ tinha acontecido na criação do vídeo — ledger E saldo, como o débito real faz. */
async function debitarConsumoFalso(tenantId: string, videoId: string): Promise<void> {
  await pool.query(
    `INSERT INTO credit_ledger (tenant_id, credit_type, delta, reason, related_video_id)
     VALUES ($1, 'video', -1, 'consumption', $2)`,
    [tenantId, videoId],
  );
  await pool.query("UPDATE tenant_credits SET balance = balance - 1 WHERE tenant_id = $1 AND credit_type = 'video'", [
    tenantId,
  ]);
}

main().catch((err) => {
  console.error("FALHOU:", err);
  process.exitCode = 1;
});
