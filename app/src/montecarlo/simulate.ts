/**
 * Monte Carlo retirement / withdrawal simulator. Pure TS, no deps.
 *
 * Everything runs in REAL (inflation-adjusted) terms — the only honest way to
 * ask "will my purchasing power last." Nominal returns from the asset-class
 * data are deflated by CPI, and a fixed-real withdrawal is therefore constant
 * in the series' units. Balances are reported in today's dollars.
 *
 * Convention (matches the Trinity study / FiCalc): withdraw once at the START
 * of each year, then compound 12 months of returns. A trial "fails" if the
 * balance is exhausted before the horizon ends.
 */

export type WithdrawalStrategy = 'fixedReal' | 'fixedPercent' | 'vpw'

export interface SimParams {
  initialBalance: number
  /** Annual withdrawal rate (fraction). fixedReal: ×initial; fixedPercent: ×current. */
  withdrawalRate: number
  strategy: WithdrawalStrategy
  horizonYears: number
  /** Annual expense ratio / advisory fee (fraction), applied monthly. */
  feeRate: number
  /** VPW assumed real return (fraction); ignored by other strategies. */
  vpwReturn?: number
}

export interface RealReturnSeries {
  /** yyyy-mm labels aligned to `returns` (the month each return occurs in). */
  dates: string[]
  /** Real monthly total returns (fractions). */
  returns: number[]
}

export interface SimResult {
  mode: 'historical' | 'bootstrap'
  trials: number
  successRate: number
  horizonYears: number
  /** Per-year (0..horizon) balance percentiles across trials, today's dollars. */
  percentiles: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] }
  /** Sorted ending balances for the distribution view. */
  endingBalances: number[]
  medianEnding: number
  /** Historical mode only: the worst starting years by outcome. */
  worstStarts: Array<{ label: string; endingBalance: number; depletedYear: number | null }>
}

// ---- seedable RNG (deterministic tests; Math.random in the worker) ----------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- withdrawal amount for a given year ------------------------------------
function withdrawalForYear(
  params: SimParams,
  balance: number,
  yearsElapsed: number,
): number {
  const { strategy, withdrawalRate, initialBalance, horizonYears } = params
  if (strategy === 'fixedReal') return initialBalance * withdrawalRate
  if (strategy === 'fixedPercent') return balance * withdrawalRate
  // VPW: amortize the balance over the remaining years at an assumed real return.
  const n = horizonYears - yearsElapsed
  const r = params.vpwReturn ?? 0.025
  const rate = r === 0 ? 1 / n : r / (1 - (1 + r) ** -n)
  return balance * rate
}

/**
 * Run one trial over a sequence of `horizon×12` monthly real returns.
 * Returns ending balance (0 if depleted), the yearly balance path
 * (length horizon+1, index 0 = start), and the year it depleted (or null).
 */
function runTrial(
  params: SimParams,
  monthly: number[],
  offset: number,
): { path: number[]; ending: number; depletedYear: number | null } {
  const { initialBalance, horizonYears, feeRate } = params
  const monthlyFeeFactor = (1 - feeRate) ** (1 / 12)
  let balance = initialBalance
  const path = new Array<number>(horizonYears + 1)
  path[0] = balance
  let depletedYear: number | null = null

  for (let y = 0; y < horizonYears; y++) {
    if (depletedYear !== null) {
      path[y + 1] = 0
      continue
    }
    const w = withdrawalForYear(params, balance, y)
    balance -= w
    if (balance <= 0) {
      balance = 0
      depletedYear = y + 1
      path[y + 1] = 0
      continue
    }
    for (let m = 0; m < 12; m++) {
      balance *= (1 + monthly[offset + y * 12 + m]) * monthlyFeeFactor
    }
    path[y + 1] = balance
  }
  return { path, ending: balance, depletedYear }
}

// ---- percentile helper ------------------------------------------------------
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function summarize(
  mode: SimResult['mode'],
  paths: number[][],
  labels: string[],
  horizonYears: number,
): SimResult {
  const trials = paths.length
  const endings = paths.map((p) => p[horizonYears])
  const successes = endings.filter((e) => e > 0).length

  // Per-year percentiles.
  const pByYear = { p5: [], p25: [], p50: [], p75: [], p95: [] } as SimResult['percentiles']
  for (let y = 0; y <= horizonYears; y++) {
    const col = paths.map((p) => p[y]).sort((a, b) => a - b)
    pByYear.p5.push(percentile(col, 5))
    pByYear.p25.push(percentile(col, 25))
    pByYear.p50.push(percentile(col, 50))
    pByYear.p75.push(percentile(col, 75))
    pByYear.p95.push(percentile(col, 95))
  }

  const sortedEndings = [...endings].sort((a, b) => a - b)

  // Worst starts (historical): lowest ending balances first.
  const worstStarts = labels.length
    ? paths
        .map((p, i) => ({
          label: labels[i],
          endingBalance: p[horizonYears],
          depletedYear: p[horizonYears] > 0 ? null : p.findIndex((b, y) => y > 0 && b === 0),
        }))
        .sort((a, b) => a.endingBalance - b.endingBalance)
        .slice(0, 10)
    : []

  return {
    mode,
    trials,
    successRate: trials ? successes / trials : 0,
    horizonYears,
    percentiles: pByYear,
    endingBalances: sortedEndings,
    medianEnding: percentile(sortedEndings, 50),
    worstStarts,
  }
}

// ---- historical sequence ----------------------------------------------------
export function runHistoricalSequence(series: RealReturnSeries, params: SimParams): SimResult {
  const months = params.horizonYears * 12
  const paths: number[][] = []
  const labels: string[] = []
  for (let start = 0; start + months <= series.returns.length; start++) {
    const { path } = runTrial(params, series.returns, start)
    paths.push(path)
    labels.push(series.dates[start])
  }
  return summarize('historical', paths, labels, params.horizonYears)
}

// ---- block bootstrap --------------------------------------------------------
/**
 * Resample the return series in contiguous blocks (default 24 months) to
 * preserve short-run autocorrelation, building `trials` synthetic sequences.
 */
export function runBootstrap(
  series: RealReturnSeries,
  params: SimParams,
  opts: { trials: number; blockMonths?: number; rng?: () => number } = { trials: 10000 },
): SimResult {
  const months = params.horizonYears * 12
  const block = opts.blockMonths ?? 24
  const rng = opts.rng ?? Math.random
  const src = series.returns
  const maxStart = src.length - block
  const paths: number[][] = []

  for (let t = 0; t < opts.trials; t++) {
    const seq = new Array<number>(months)
    let filled = 0
    while (filled < months) {
      const start = Math.floor(rng() * (maxStart + 1))
      const len = Math.min(block, months - filled)
      for (let i = 0; i < len; i++) seq[filled + i] = src[start + i]
      filled += len
    }
    paths.push(runTrial(params, seq, 0).path)
  }
  return summarize('bootstrap', paths, [], params.horizonYears)
}

/** Solve the max withdrawal rate meeting a target success rate (historical). */
export function maxSafeWithdrawal(
  series: RealReturnSeries,
  params: Omit<SimParams, 'withdrawalRate'>,
  targetSuccess = 0.95,
): number {
  let lo = 0
  let hi = 0.2
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const r = runHistoricalSequence(series, { ...params, withdrawalRate: mid })
    if (r.successRate >= targetSuccess) lo = mid
    else hi = mid
  }
  return lo
}
