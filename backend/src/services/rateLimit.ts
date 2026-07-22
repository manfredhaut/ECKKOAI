// Single-instance, in-memory limiter — good enough to slow down brute
// force against a login endpoint; not meant to survive a restart or work
// across replicas. Each call creates an independent counter (its own Map),
// so callers protecting different endpoints don't share attempt budgets.
export function createRateLimiter(maxAttempts: number, windowMs: number): (key: string) => boolean {
  const attempts = new Map<string, { count: number; resetAt: number }>();

  return function isRateLimited(key: string): boolean {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || now >= entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > maxAttempts;
  };
}
