export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (err: unknown) => boolean;
  },
): Promise<T> {
  const retries = opts?.retries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 250;
  const maxDelayMs = opts?.maxDelayMs ?? 5_000;
  const shouldRetry =
    opts?.shouldRetry ??
    (() => {
      return true;
    });

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err)) break;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }

  throw lastErr;
}
