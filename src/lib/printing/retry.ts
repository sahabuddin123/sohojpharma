// Retry helper with exponential backoff. Used by the queue to wrap QZ calls.
// MAX 3 attempts; on final failure the caller decides whether to fall back.
const BACKOFF_MS = [250, 750, 2000] as const;

export interface RetryResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  attempts: number;
}

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<RetryResult<T>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn();
      return { ok: true, value, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = BACKOFF_MS[attempt - 1] ?? 2000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  return { ok: false, error: message, attempts: maxAttempts };
}
