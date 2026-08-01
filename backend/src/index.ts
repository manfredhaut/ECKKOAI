import { config } from "./config.js";
import { assertLiveModeAuthorized } from "./services/providers/liveGuard.js";
import { runMigrations } from "./db/migrate.js";
import { buildApp } from "./app.js";
import { runMonthlyGrantSweep } from "./services/billing/monthlyGrant.js";
import { recordAuditLog } from "./services/auditLog.js";

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
      .catch((err) => console.error("Scheduled monthly grant sweep failed", err));
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
  await app.listen({ host: "0.0.0.0", port: config.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
