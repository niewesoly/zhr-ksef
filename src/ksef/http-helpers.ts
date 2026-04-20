export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  maxRetries: number;
  isRetryable: (err: unknown) => boolean;
  backoffMs?: (attempt: number) => number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const backoff = opts.backoffMs ?? ((a) => 2 ** a * 1000);
  let lastError: unknown;
  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!opts.isRetryable(err)) throw err;
      if (attempt < opts.maxRetries - 1) {
        await new Promise((r) => setTimeout(r, backoff(attempt)));
      }
    }
  }
  throw lastError ?? new Error("retries exhausted");
}
