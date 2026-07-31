/**
 * Aplica as migrations e sai. Existe para que a falha de bootstrap tenha um
 * código de saída próprio, observável pelo PID 1 do container.
 *
 * Antes, migrar era um passo dentro de `index.ts`, e `main().catch(→
 * process.exit(1))` matava só o processo filho do `tsx watch` — o container
 * continuava `running` com o servidor morto e `/api/health` em 502, sem
 * jamais disparar a política de restart. Separar migrar de servir faz a
 * falha subir até o entrypoint, que é quem o Docker observa.
 *
 * `runMigrations()` é idempotente (consulta `schema_migrations`), então
 * rodar isto antes do servidor não repete trabalho — e `index.ts` continua
 * chamando a mesma função, o que mantém `npm start` correto sozinho.
 */
import { runMigrations } from "../db/migrate.js";
import { pool } from "../db/pool.js";

runMigrations()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Falha ao aplicar migrations:", err);
    // Não espera o pool fechar: se o banco está fora, `pool.end()` pode
    // ficar pendurado, e um bootstrap que trava é pior que um que falha —
    // travado, o container fica `running` e a política de restart nunca
    // age, que é exatamente o problema que este arquivo existe para evitar.
    process.exit(1);
  });
