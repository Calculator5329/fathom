/**
 * Shared primitives for the three URL codecs (backtest, allocation, Monte
 * Carlo). The URL is canonical app state (invariant 3) — these helpers unify
 * the parsing rules so the codecs can't drift apart:
 *  - weight lists encode as `KEY:60,KEY2:40` with weights rounded to 2dp
 *  - zero weights survive the round-trip (a just-added row being edited)
 *  - malformed / out-of-range values fall back, never throw
 */

export interface WeightedEntry {
  key: string
  weight: number
}

export function encodeWeightList(entries: WeightedEntry[]): string {
  return entries
    .filter((e) => e.key && Number.isFinite(e.weight) && e.weight >= 0)
    .map((e) => `${e.key}:${Math.round(e.weight * 100) / 100}`)
    .join(',')
}

export function decodeWeightList(
  raw: string,
  opts?: { uppercase?: boolean; isValidKey?: (key: string) => boolean },
): WeightedEntry[] {
  const isValid = opts?.isValidKey ?? ((k: string) => k.length > 0)
  return raw
    .split(',')
    .map((part) => {
      const [key, w] = part.split(':')
      const k = key ?? ''
      return { key: opts?.uppercase ? k.toUpperCase() : k, weight: Number(w) }
    })
    .filter((e) => isValid(e.key) && Number.isFinite(e.weight) && e.weight >= 0)
}

/**
 * Parse a numeric param. `positive` requires n > 0; `min`/`max` are inclusive
 * bounds. Anything non-finite or out of range returns the fallback.
 */
export function numParam(
  raw: string | null,
  fallback: number,
  opts?: { min?: number; max?: number; positive?: boolean },
): number {
  if (raw === null) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  if (opts?.positive && n <= 0) return fallback
  if (opts?.min !== undefined && n < opts.min) return fallback
  if (opts?.max !== undefined && n > opts.max) return fallback
  return n
}

export function enumParam<T extends string>(
  raw: string | null,
  values: readonly T[],
  fallback: T,
): T {
  return raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : fallback
}
