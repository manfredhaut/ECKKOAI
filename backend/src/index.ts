import { config } from "./config.js";
import { assertLiveModeAuthorized } from "./services/providers/liveGuard.js";
import { runMigrations } from "./db/migrate.js";
import { buildApp } from "./app.js";
import { runMonthlyGrantSweep } from "./services/billing/monthlyGrant.js";
import { recordAuditLog } from "./services/auditLog.js";
import { logEvent } from "./services/log/safeLog.js";
import { recoverInFlightVideos } from "./services/video/recovery.js";
import { rearmVideoPolling, reacompanharFal } from "./routes/videos.js";

const GRANT_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Runs at boot and every 24h after — not pinned to an exact clock time,
// because this process restarts often (dev bind-mount gotcha, prod
// deploys) and a sweep gated purely by "is it day 1 at midnight" would
// silently miss a whole month if the process happened to be down at that
// moment. Safe to run this often: runMonthlyGrantSweep() is idempotent per
// tenant/credit_type/month, so re-running mid-month is always a no-op
// until the calendar month actually changes.
function startMonthlyGrantScheduler(): void {
  const run = () => {
    runMonthlyGrantSweep()
      .then((result) =>
        recordAuditLog({
          tenantId: null,
          actorAdminUserId: null,
          action: "system.credits.monthly_grant_sweep",
          before: null,
          after: result,
        }),
      )
      .catch((err) => logEvent("error", "monthly_grant_sweep_failed", { detail: err }));
  };
  run();
  setInterval(run, GRANT_SWEEP_INTERVAL_MS);
}

async function main() {
  // Antes de qualquer coisa: em live, sem autorização explícita, o servidor
  // não sobe. Lançar aqui faz o processo sair com código != 0, que o
  // entrypoint propaga ao PID 1 — ver docker-entrypoint.sh.
  assertLiveModeAuthorized(config.providerMode);

  await runMigrations();

  const app = await buildApp();
  startMonthlyGrantScheduler();

  // VARREDURA ÚNICA de registros presos, ANTES de aceitar conexão.
  //
  // O acompanhamento de uma geração vive num `setInterval` na memória deste
  // processo. Até aqui, morto o processo, o laço morria com ele e nada o
  // re-armava: a linha ficava em `queued`/`processing` para sempre, com o
  // crédito já debitado. Esta chamada é a rede de segurança mínima — não é
  // fila, não é worker, e não roda de novo enquanto o processo viver.
  //
  // Antes do `listen` de propósito: um registro preso que só fosse recolhido
  // depois de a porta abrir competiria com uma geração nova pelo mesmo teto.
  //
  // Nunca lança (o `catch` é interno): um processo que não sobe não acompanha
  // nada, que é exatamente o oposto do que esta varredura existe para garantir.
  const recuperacao = await recoverInFlightVideos(rearmVideoPolling, reacompanharFal);
  if (recuperacao.encontrados > 0) {
    await recordAuditLog({
      tenantId: null,
      actorAdminUserId: null,
      action: "system.videos.boot_recovery",
      before: null,
      after: recuperacao,
    }).catch((err) => logEvent("error", "boot_recovery_audit_failed", { detail: err }));
  }

  await app.listen({ host: "0.0.0.0", port: config.port });
}

main().catch((err) => {
  logEvent("error", "boot_failed", { detail: err });
  process.exit(1);
});
