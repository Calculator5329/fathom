/**
 * fetch with bounded retry for transient failures.
 *
 * Live-site receipt (2026-08-29): a first visit's series load died with
 * ERR_CONNECTION_CLOSED and the raw "Failed to fetch" TypeError rendered in
 * the results panel; the identical request succeeded seconds later. Data
 * loads here are all idempotent GETs, so a short retry is always safe.
 *
 * Retries only network-level failures (fetch TypeError) and 502/503/504.
 * Anything else — 404 misses, 429 provider limits, other 4xx — returns
 * immediately so callers keep their existing handling.
 */
const TRANSIENT_STATUS = new Set([502, 503, 504])

export async function fetchRetry(
  input: string,
  init?: RequestInit,
  retries = 2,
  backoffMs = 400,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(input, init)
      if (!TRANSIENT_STATUS.has(res.status) || attempt >= retries) return res
    } catch (err) {
      if (attempt >= retries) throw err
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** attempt))
  }
}
