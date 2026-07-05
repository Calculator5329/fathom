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
 * balance is exhausted before the horizon ends — except VPW's final-year
 * spend-to-zero, which is the plan working, not a failure.
 */

export type WithdrawalStrategy = 'fixedReal' | 'fixedPercent' | 'vpw' | 'guardrails'

export interface SimParams {
  initialBalance: number
  /**
   * Annual withdrawal rate (fraction). fixedReal/guardrails: × the balance at
   * RETIREMENT (start of the withdrawal phase); fixedPercent: × current
   * balance each year.
   */
  withdrawalRate: number
  strategy: WithdrawalStrategy
  /** Years of withdrawals (the retirement horizon). */
  horizonYears: number
  /** Annual expense ratio / advisory fee (fraction), applied monthly. */
  feeRate: number
  /** VPW assumed real return (fraction); ignored by other strategies. */
  vpwReturn?: number
  /** Years of saving BEFORE withdrawals begin (0 = retire immediately). */
  accumulationYears?: number
  /** Real dollars contributed per year during accumulation (monthly 1/12). */
  annualContribution?: number
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
  accumulationYears: number
  /** Per-year (0..acc+horizon) balance percentiles across trials, today's dollars. */
  percentiles: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] }
  /** Sorted ending balances for the distribution view. */
  endingBalances: number[]
  medianEnding: number
  /** Historical mode only: the worst starting years by outcome. */
  worstStarts: Array<{ label: string; endingBalance: number; depletedYear: number | null }>
  /**
   * Income variability across trials (real dollars): each trial's worst
   * withdrawal year, summarized. For fixedReal this equals the fixed amount
   * in successful trials; for variable strategies it shows the pay cut risk.
   */
  income: {
    firstYearMedian: number
    worstYearMedian: number
    worstYearP5: number
    /** Fraction of trials where income ever fell below the first year's. */
    cutProbability: number
    /** Median count of retirement years spent below the starting income. */
    yearsBelowStartMedian: number
  }
  /**
   * Per-retirement-year income percentiles across trials (real dollars,
   * actual amounts withdrawn — a depleted trial contributes $0). Arrays are
   * indexed by retirement year 1..horizonYears.
   */
  incomeByYear: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] }
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

/** Total months a trial spans (accumulation + withdrawal phases). */
export function trialMonths(params: SimParams): number {
  return ((params.accumulationYears ?? 0) + params.horizonYears) * 12
}

/**
 * Run one trial. Phases:
 *  1) Accumulation (optional): contribute annualContribution/12 at each
 *     month start, compound.
 *  2) Withdrawals: withdraw 1/12 of the year's amount at each month start
 *     (FiCalc convention — kinder than a full year up front), compound.
 * Strategy semantics: fixedReal/guardrails anchor to the balance at
 * retirement; guardrails then cuts the real withdrawal 10% when its current
 * rate drifts 20% above the initial rate, and raises it 10% when 20% below
 * (simplified Guyton-Klinger, decision applied at each year start).
 * Everything is in real terms; a fee drags returns monthly.
 */
function runTrial(
  params: SimParams,
  monthly: number[],
  offset: number,
): {
  path: number[]
  ending: number
  depletedYear: number | null
  /**
   * True only when the money ran out unplanned. VPW amortizes the balance to
   * zero by design, so hitting $0 in the FINAL year is the plan succeeding,
   * not a failure.
   */
  failed: boolean
  firstYearW: number
  worstYearW: number
  /** Actual real dollars withdrawn per retirement year (0 once depleted). */
  withdrawals: number[]
} {
  const { initialBalance, horizonYears, feeRate } = params
  const accYears = params.accumulationYears ?? 0
  const contribMonthly = (params.annualContribution ?? 0) / 12
  const monthlyFeeFactor = (1 - feeRate) ** (1 / 12)
  const totalYears = accYears + horizonYears

  let balance = initialBalance
  const path = new Array<number>(totalYears + 1)
  path[0] = balance
  const withdrawals = new Array<number>(horizonYears).fill(0)
  let depletedYear: number | null = null
  let m = offset

  // Guardrails / fixed-real state, set at retirement.
  let anchorW = 0
  let initialRate = 0
  let firstYearW = 0
  let worstYearW = Infinity

  for (let y = 0; y < totalYears; y++) {
    if (depletedYear !== null) {
      path[y + 1] = 0
      m += 12
      continue
    }
    const inAccumulation = y < accYears
    let wMonthly = 0

    if (!inAccumulation) {
      const yearsRetired = y - accYears
      if (yearsRetired === 0) {
        anchorW = balance * params.withdrawalRate
        initialRate = params.withdrawalRate
      }
      let w: number
      switch (params.strategy) {
        case 'fixedReal':
          w = anchorW
          break
        case 'fixedPercent':
          w = balance * params.withdrawalRate
          break
        case 'guardrails': {
          if (yearsRetired > 0 && balance > 0) {
            const currentRate = anchorW / balance
            if (currentRate > initialRate * 1.2) anchorW *= 0.9
            else if (currentRate < initialRate * 0.8) anchorW *= 1.1
          }
          w = anchorW
          break
        }
        default: {
          // VPW: amortize over remaining years at an assumed real return.
          const n = horizonYears - yearsRetired
          const r = params.vpwReturn ?? 0.025
          const rate = r === 0 ? 1 / n : r / (1 - (1 + r) ** -n)
          w = balance * rate
        }
      }
      if (yearsRetired === 0) firstYearW = w
      if (w < worstYearW) worstYearW = w
      wMonthly = w / 12
    }

    let drawn = 0
    for (let k = 0; k < 12; k++) {
      if (inAccumulation) {
        balance += contribMonthly
      } else {
        drawn += Math.min(wMonthly, balance)
        balance -= wMonthly
        if (balance <= 0) {
          balance = 0
          depletedYear = y + 1
          break
        }
      }
      balance *= (1 + monthly[m + k]) * monthlyFeeFactor
    }
    if (!inAccumulation) withdrawals[y - accYears] = drawn
    m += 12
    path[y + 1] = balance
  }
  if (!Number.isFinite(worstYearW)) worstYearW = 0
  const failed =
    depletedYear !== null && !(params.strategy === 'vpw' && depletedYear === totalYears)
  return { path, ending: balance, depletedYear, failed, firstYearW, worstYearW, withdrawals }
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

interface TrialOut {
  path: number[]
  failed: boolean
  firstYearW: number
  worstYearW: number
  withdrawals: number[]
}

function summarize(
  mode: SimResult['mode'],
  trialsOut: TrialOut[],
  labels: string[],
  params: SimParams,
): SimResult {
  const accumulationYears = params.accumulationYears ?? 0
  const totalYears = accumulationYears + params.horizonYears
  const trials = trialsOut.length
  const endings = trialsOut.map((t) => t.path[totalYears])
  const successes = trialsOut.filter((t) => !t.failed).length

  // Per-year percentiles.
  const pByYear = { p5: [], p25: [], p50: [], p75: [], p95: [] } as SimResult['percentiles']
  for (let y = 0; y <= totalYears; y++) {
    const col = trialsOut.map((t) => t.path[y]).sort((a, b) => a - b)
    pByYear.p5.push(percentile(col, 5))
    pByYear.p25.push(percentile(col, 25))
    pByYear.p50.push(percentile(col, 50))
    pByYear.p75.push(percentile(col, 75))
    pByYear.p95.push(percentile(col, 95))
  }

  const sortedEndings = [...endings].sort((a, b) => a - b)
  const firstW = trialsOut.map((t) => t.firstYearW).sort((a, b) => a - b)
  const worstW = trialsOut.map((t) => t.worstYearW).sort((a, b) => a - b)

  // Per-retirement-year income distribution + pay-cut stats. "Below start"
  // uses a 0.5% tolerance so float noise doesn't register as a cut; a
  // depleted trial's $0 years count, which is the honest reading.
  const incomeByYear = { p5: [], p25: [], p50: [], p75: [], p95: [] } as SimResult['incomeByYear']
  for (let y = 0; y < params.horizonYears; y++) {
    const col = trialsOut.map((t) => t.withdrawals[y]).sort((a, b) => a - b)
    incomeByYear.p5.push(percentile(col, 5))
    incomeByYear.p25.push(percentile(col, 25))
    incomeByYear.p50.push(percentile(col, 50))
    incomeByYear.p75.push(percentile(col, 75))
    incomeByYear.p95.push(percentile(col, 95))
  }
  let cutTrials = 0
  const yearsBelow: number[] = []
  for (const t of trialsOut) {
    const floor = t.firstYearW * 0.995
    const below = t.withdrawals.filter((w) => w < floor).length
    if (below > 0) cutTrials++
    yearsBelow.push(below)
  }
  yearsBelow.sort((a, b) => a - b)

  const worstStarts = labels.length
    ? trialsOut
        .map((t, i) => ({
          label: labels[i],
          endingBalance: t.path[totalYears],
          depletedYear: t.failed ? t.path.findIndex((b, y) => y > 0 && b === 0) : null,
        }))
        .sort((a, b) => a.endingBalance - b.endingBalance)
        .slice(0, 10)
    : []

  return {
    mode,
    trials,
    successRate: trials ? successes / trials : 0,
    horizonYears: params.horizonYears,
    accumulationYears,
    percentiles: pByYear,
    endingBalances: sortedEndings,
    medianEnding: percentile(sortedEndings, 50),
    worstStarts,
    income: {
      firstYearMedian: percentile(firstW, 50),
      worstYearMedian: percentile(worstW, 50),
      worstYearP5: percentile(worstW, 5),
      cutProbability: trials ? cutTrials / trials : 0,
      yearsBelowStartMedian: percentile(yearsBelow, 50),
    },
    incomeByYear,
  }
}

// ---- historical sequence ----------------------------------------------------
export function runHistoricalSequence(series: RealReturnSeries, params: SimParams): SimResult {
  const months = trialMonths(params)
  const out: TrialOut[] = []
  const labels: string[] = []
  for (let start = 0; start + months <= series.returns.length; start++) {
    out.push(runTrial(params, series.returns, start))
    labels.push(series.dates[start])
  }
  return summarize('historical', out, labels, params)
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
  const months = trialMonths(params)
  const block = opts.blockMonths ?? 24
  const rng = opts.rng ?? Math.random
  const src = series.returns
  const maxStart = src.length - block
  const out: TrialOut[] = []

  for (let t = 0; t < opts.trials; t++) {
    const seq = new Array<number>(months)
    let filled = 0
    while (filled < months) {
      const start = Math.floor(rng() * (maxStart + 1))
      const len = Math.min(block, months - filled)
      for (let i = 0; i < len; i++) seq[filled + i] = src[start + i]
      filled += len
    }
    out.push(runTrial(params, seq, 0))
  }
  return summarize('bootstrap', out, [], params)
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
