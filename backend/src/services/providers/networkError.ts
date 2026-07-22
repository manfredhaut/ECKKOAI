// Shared by every provider adapter's fetch() catch block. Node's undici
// fetch surfaces the real reason a request failed (DNS, TLS, connection
// refused, timeout...) in err.cause, not err.message — err.message alone is
// just the generic "fetch failed", which is useless for diagnosing why a
// specific provider call didn't go through.

export function describeNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown error";
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) return `${err.message}: ${cause.message}`;
  if (cause !== undefined) return `${err.message}: ${String(cause)}`;
  return err.message;
}

// Logs the full error (Node prints err.cause and the stack automatically)
// to stdout so it's visible via `docker compose logs backend` — nothing
// else surfaces this today, so a network failure was otherwise invisible
// outside the thin message returned to the client. Safe to call with the
// raw fetch error: it only ever carries connection-level detail
// (DNS/TLS/timeout), never request headers or the API key — never pass the
// fetch() call's `init` object (headers/body) to this function.
export function logProviderNetworkError(context: string, err: unknown): void {
  console.error(`[${context}] network error calling provider API:`, err);
}
