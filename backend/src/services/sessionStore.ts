import type { Session } from "fastify";
import { pool } from "../db/pool.js";

// Backs @fastify/session with the "sessions" table instead of an in-memory
// Map: an in-memory store would log everyone out every time tsx watch
// restarts the backend on a file change during dev.
export class PgSessionStore {
  set(sessionId: string, session: unknown, callback: (err?: Error) => void): void {
    const expiresAt = (session as { cookie?: { expires?: string } }).cookie?.expires
      ? new Date((session as { cookie: { expires: string } }).cookie.expires)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    pool
      .query(
        `INSERT INTO sessions (id, sess, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET sess = $2, expires_at = $3`,
        [sessionId, JSON.stringify(session), expiresAt],
      )
      .then(() => callback())
      .catch(callback);
  }

  // The callback signature has to match @fastify/session's CallbackSession
  // (`(err, result?: Session | null) => void`) or `app.register(fastifySession,
  // { store })` fails to typecheck — which it did, and that single error kept
  // `npm run check` red and therefore useless as a gate. Types only: the value
  // passed back is exactly what it always was, `rows[0]?.sess`, undefined
  // included, since @fastify/session treats undefined as "no session".
  get(sessionId: string, callback: (err: Error | null, session?: Session | null) => void): void {
    pool
      .query<{ sess: Session }>(
        "SELECT sess FROM sessions WHERE id = $1 AND expires_at > now()",
        [sessionId],
      )
      .then(({ rows }) => callback(null, rows[0]?.sess))
      .catch((err) => callback(err));
  }

  destroy(sessionId: string, callback: (err?: Error) => void): void {
    pool
      .query("DELETE FROM sessions WHERE id = $1", [sessionId])
      .then(() => callback())
      .catch(callback);
  }
}
