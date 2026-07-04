import type { DailyRecord } from '@/engine'

/**
 * Split-adjusted close series (splits only, dividends kept) so a long-run price
 * chart is continuous and ends at the actual current price. Raw Tiingo `close`
 * has split cliffs — e.g. AMZN's 20:1 in 2022 drops the line ~20×.
 *
 * Each record's `splitFactor` is the split that took effect that day, so its
 * own close is already post-split; only EARLIER prices need dividing. Walking
 * backward, we divide each price by the product of all splits that occur after
 * it.
 */
export function splitAdjustedCloses(records: DailyRecord[]): number[] {
  const n = records.length
  const adj = new Array<number>(n)
  let futureSplit = 1
  for (let i = n - 1; i >= 0; i--) {
    adj[i] = records[i].close / futureSplit
    const sf = records[i].splitFactor
    if (sf && sf !== 1) futureSplit *= sf
  }
  return adj
}
