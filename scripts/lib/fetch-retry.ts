const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2_000;

export interface FetchRetryOptions {
  retries?: number;
  baseDelayMs?: number;
  rateLimitDelayMs?: number; // base delay specifically for 429 responses
}

export async function fetchRetry(
  input: string | URL | Request,
  init?: RequestInit,
  retriesOrOpts: number | FetchRetryOptions = MAX_RETRIES,
): Promise<Response> {
  const opts: FetchRetryOptions = typeof retriesOrOpts === "number"
    ? { retries: retriesOrOpts }
    : retriesOrOpts;
  const retries = opts.retries ?? MAX_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? BASE_DELAY_MS;
  const rateLimitDelayMs = opts.rateLimitDelayMs ?? baseDelayMs;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(input, init);
      if (r.status === 429) {
        const retryAfter = parseInt(r.headers.get("retry-after") ?? "", 10);
        const delay = retryAfter > 0
          ? retryAfter * 1000
          : rateLimitDelayMs * 2 ** attempt;
        if (attempt < retries) {
          console.log(`  Rate limited (429) — retry ${attempt + 1}/${retries} in ${Math.round(delay / 1000)}s`);
          await sleep(delay);
          continue;
        }
      }
      if (RETRYABLE_STATUS.has(r.status) && attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt;
        console.log(`  HTTP ${r.status} — retry ${attempt + 1}/${retries} in ${Math.round(delay / 1000)}s`);
        await sleep(delay);
        continue;
      }
      return r;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt;
        console.log(`  Network error — retry ${attempt + 1}/${retries} in ${Math.round(delay / 1000)}s (${lastError.message})`);
        await sleep(delay);
        continue;
      }
    }
  }
  throw lastError ?? new Error("fetchRetry exhausted");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
