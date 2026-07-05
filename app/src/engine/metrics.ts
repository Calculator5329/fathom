import type { DrawdownInfo, MetricSet, RollingPoint, YearReturn } from './types'

const DAY_MS = 86_400_000

function yearsBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / DAY_MS / 365.25
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

/** Sample standard deviation. */
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

/** Compound the TWR index into calendar-month returns. */
export function monthlyReturns(dates: string[], twrIndex: number[]): number[] {
  return monthlyReturnsLabeled(dates, twrIndex).map((m) => m.ret)
}

/** Calendar-month returns with their 'yyyy-mm' labels (for rf matching, regression). */
export function monthlyReturnsLabeled(
  dates: string[],
  twrIndex: number[],
): Array<{ month: string; ret: number }> {
  const out: Array<{ month: string; ret: number }> = []
  let monthStartIdx = 0
  for (let t = 1; t < dates.length; t++) {
    if (dates[t].slice(0, 7) !== dates[t - 1].slice(0, 7)) {
      out.push({ month: dates[t - 1].slice(0, 7), ret: twrIndex[t - 1] / twrIndex[monthStartIdx] - 1 })
      monthStartIdx = t - 1
    }
  }
  out.push({
    month: dates[dates.length - 1].slice(0, 7),
    ret: twrIndex[dates.length - 1] / twrIndex[monthStartIdx] - 1,
  })
  return out
}

export function annualReturns(dates: string[], twrIndex: number[]): YearReturn[] {
  const out: YearReturn[] = []
  let yearStartIdx = 0
  for (let t = 1; t < dates.length; t++) {
    if (dates[t].slice(0, 4) !== dates[t - 1].slice(0, 4)) {
      out.push({
        year: Number(dates[t - 1].slice(0, 4)),
        return: twrIndex[t - 1] / twrIndex[yearStartIdx] - 1,
      })
      yearStartIdx = t - 1
    }
  }
  out.push({
    year: Number(dates[dates.length - 1].slice(0, 4)),
    return: twrIndex[dates.length - 1] / twrIndex[yearStartIdx] - 1,
  })
  return out
}

/** Indices of the last trading day of each calendar month (incl. the final day). */
function monthEndIndices(dates: string[]): number[] {
  const out: number[] = []
  for (let t = 1; t < dates.length; t++) {
    if (dates[t].slice(0, 7) !== dates[t - 1].slice(0, 7)) out.push(t - 1)
  }
  out.push(dates.length - 1)
  return out
}

/**
 * Trailing-window annualized returns, one observation per month-end.
 * Empty when the history is shorter than the window.
 */
export function rollingReturns(
  dates: string[],
  twrIndex: number[],
  windowYears: number,
): RollingPoint[] {
  const ends = monthEndIndices(dates)
  const w = windowYears * 12
  const out: RollingPoint[] = []
  for (let k = w; k < ends.length; k++) {
    const start = ends[k - w]
    const end = ends[k]
    const years = yearsBetween(dates[start], dates[end])
    if (years <= 0) continue
    out.push({
      date: dates[end],
      value: (twrIndex[end] / twrIndex[start]) ** (1 / years) - 1,
    })
  }
  return out
}

/** Cash dividend income summed per calendar year. */
export function annualIncome(
  dates: string[],
  dividendIncome: number[],
): Array<{ year: number; income: number }> {
  const byYear = new Map<number, number>()
  for (let t = 0; t < dates.length; t++) {
    if (dividendIncome[t] === 0) continue
    const year = Number(dates[t].slice(0, 4))
    byYear.set(year, (byYear.get(year) ?? 0) + dividendIncome[t])
  }
  return [...byYear.entries()]
    .map(([year, income]) => ({ year, income }))
    .sort((a, b) => a.year - b.year)
}

export function maxDrawdown(dates: string[], twrIndex: number[]): DrawdownInfo {
  let peak = twrIndex[0]
  let peakDate = dates[0]
  let maxDd = 0
  let ddPeakDate = dates[0]
  let troughDate = dates[0]
  let troughIdx = 0

  for (let t = 1; t < twrIndex.length; t++) {
    if (twrIndex[t] > peak) {
      peak = twrIndex[t]
      peakDate = dates[t]
    }
    const dd = twrIndex[t] / peak - 1
    if (dd < maxDd) {
      maxDd = dd
      ddPeakDate = peakDate
      troughDate = dates[t]
      troughIdx = t
    }
  }

  // Recovery: first date after the trough where the index regains its peak.
  let recoveryDate: string | null = null
  if (maxDd < 0) {
    const peakLevel = twrIndex[dates.indexOf(ddPeakDate)]
    for (let t = troughIdx + 1; t < twrIndex.length; t++) {
      if (twrIndex[t] >= peakLevel) {
        recoveryDate = dates[t]
        break
      }
    }
  }

  return { maxDrawdown: maxDd, peakDate: ddPeakDate, troughDate, recoveryDate }
}

/**
 * Money-weighted annual return via bisection on the rate that zeroes the
 * NPV of {initial investment, flows, final value}.
 */
export function irr(
  dates: string[],
  flows: number[],
  initialAmount: number,
  finalValue: number,
): number {
  const t0 = Date.parse(dates[0])
  const horizon = yearsBetween(dates[0], dates[dates.length - 1])
  if (horizon <= 0) return 0

  const npv = (rate: number): number => {
    let v = -initialAmount
    for (let t = 1; t < dates.length; t++) {
      if (flows[t] !== 0) {
        const yrs = (Date.parse(dates[t]) - t0) / DAY_MS / 365.25
        v -= flows[t] / (1 + rate) ** yrs
      }
    }
    v += finalValue / (1 + rate) ** horizon
    return v
  }

  let lo = -0.9999
  let hi = 10
  // Short horizons annualize to enormous rates — expand the bracket as needed.
  while (npv(hi) > 0 && hi < 1e12) hi *= 10
  if (npv(lo) * npv(hi) > 0) return NaN // no sign change — IRR undefined
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(lo) * npv(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

export function computeMetrics(
  dates: string[],
  twrIndex: number[],
  values: number[],
  flows: number[],
  riskFreeRate: number,
  rfByMonth?: Record<string, number>,
): MetricSet {
  const totalReturn = twrIndex[twrIndex.length - 1] / twrIndex[0] - 1
  const horizon = yearsBetween(dates[0], dates[dates.length - 1])
  const cagr = horizon > 0 ? (1 + totalReturn) ** (1 / horizon) - 1 : 0

  const labeled = monthlyReturnsLabeled(dates, twrIndex)
  const monthly = labeled.map((m) => m.ret)
  const rfConst = (1 + riskFreeRate) ** (1 / 12) - 1
  // Prefer the contemporaneous monthly T-bill return when supplied.
  const excess = labeled.map((m) => m.ret - (rfByMonth?.[m.month] ?? rfConst))
  const monthlyStdev = stdev(monthly)
  const volatility = monthlyStdev * Math.sqrt(12)
  const sharpe = monthlyStdev > 0 ? (mean(excess) / monthlyStdev) * Math.sqrt(12) : 0
  // Downside deviation over ALL months (Portfolio Visualizer convention).
  const downside = Math.sqrt(mean(excess.map((e) => Math.min(0, e) ** 2)))
  const sortino = downside > 0 ? (mean(excess) / downside) * Math.sqrt(12) : 0

  const annual = annualReturns(dates, twrIndex)
  // Partial first/last years still count for best/worst, matching PV.
  const best = annual.length
    ? annual.reduce((a, b) => (b.return > a.return ? b : a))
    : null
  const worst = annual.length
    ? annual.reduce((a, b) => (b.return < a.return ? b : a))
    : null

  return {
    totalReturn,
    cagr,
    volatility,
    sharpe,
    sortino,
    drawdown: maxDrawdown(dates, twrIndex),
    annualReturns: annual,
    bestYear: best,
    worstYear: worst,
    irr: irr(dates, flows, values[0], values[values.length - 1]),
  }
}
