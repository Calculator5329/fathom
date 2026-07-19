import type { DailyRecord } from '@/engine'

/**
 * Dividend income planner (Tool: Income). Pure, dependency-free math — the
 * single source of truth for forward income, mirroring how the engine owns
 * backtest math. Everything here is computed from the daily `divCash` /
 * `splitFactor` / `close` fields already present in every ticker JSON, so it
 * works on a shared URL with no login and no extra data fetch.
 *
 * "Forward" here means the trailing-twelve-month (TTM) dividend rate carried
 * forward: sum the last 12 months of per-share cash distributions, split-
 * adjust them onto today's share basis, and treat that as the go-forward
 * annual rate. It is the standard computable proxy when a declared forward
 * rate isn't published in the data — honest, reproducible, and stable.
 */

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export interface Holding {
  ticker: string
  name?: string
  /** Position market value today, in dollars. */
  value: number
  records: DailyRecord[]
}

export interface DividendPayment {
  /** Ex-date (yyyy-mm-dd) of the distribution. */
  date: string
  /** Calendar month index, 0 = Jan … 11 = Dec. */
  month: number
  /** Cash per share, split-adjusted onto today's share basis. */
  perShare: number
}

export interface HoldingIncome {
  ticker: string
  name?: string
  value: number
  latestPrice: number
  latestDate: string | null
  shares: number
  /** TTM cash per share on today's share basis. */
  annualDividendPerShare: number
  /** annualDividendPerShare / latestPrice (a fraction, 0.02 = 2%). */
  forwardYield: number
  /** forwardYield × value = annualDividendPerShare × shares. */
  annualIncome: number
  /** Income by calendar month (length 12, Jan…Dec); sums to annualIncome. */
  monthly: number[]
  payments: DividendPayment[]
  hasDividends: boolean
}

export interface IncomePlan {
  holdings: HoldingIncome[]
  totalValue: number
  annualIncome: number
  /** annualIncome / totalValue (a fraction). */
  portfolioYield: number
  /** Portfolio income by calendar month (length 12); sums to annualIncome. */
  monthly: number[]
}

/** yyyy-mm-dd shifted by whole years, keeping the month/day for a string cutoff. */
function shiftYear(date: string, deltaYears: number): string {
  const year = Number(date.slice(0, 4)) + deltaYears
  return `${String(year).padStart(4, '0')}${date.slice(4)}`
}

function monthIndex(date: string): number {
  return Number(date.slice(5, 7)) - 1
}

/**
 * Distributions in the trailing 12 months, split-adjusted onto today's share
 * basis. We walk backward accumulating the product of later splits — a past
 * $1.00 dividend followed by a 2:1 split is worth $0.50 per today's share, so
 * that today's (post-split) share count reproduces the same total cash.
 */
export function trailingDividends(records: DailyRecord[]): DividendPayment[] {
  const n = records.length
  if (n === 0) return []
  const cutoff = shiftYear(records[n - 1].date, -1)
  const payments: DividendPayment[] = []
  let futureSplit = 1
  for (let i = n - 1; i >= 0; i--) {
    const r = records[i]
    if (r.date > cutoff && r.divCash > 0) {
      payments.push({ date: r.date, month: monthIndex(r.date), perShare: r.divCash / futureSplit })
    }
    const sf = r.splitFactor
    if (sf && sf !== 1) futureSplit *= sf
  }
  return payments.reverse()
}

/** Forward income for one holding from its price + dividend history. */
export function planHolding(h: Holding): HoldingIncome {
  const n = h.records.length
  const last = n > 0 ? h.records[n - 1] : null
  const latestPrice = last ? last.close : 0
  const shares = latestPrice > 0 ? h.value / latestPrice : 0
  const payments = trailingDividends(h.records)

  const annualDividendPerShare = payments.reduce((s, p) => s + p.perShare, 0)
  const monthly = new Array<number>(12).fill(0)
  for (const p of payments) monthly[p.month] += p.perShare * shares

  return {
    ticker: h.ticker,
    name: h.name,
    value: h.value,
    latestPrice,
    latestDate: last ? last.date : null,
    shares,
    annualDividendPerShare,
    forwardYield: latestPrice > 0 ? annualDividendPerShare / latestPrice : 0,
    annualIncome: annualDividendPerShare * shares,
    monthly,
    payments,
    hasDividends: payments.length > 0,
  }
}

/** Aggregate forward income + a monthly income calendar across all holdings. */
export function planIncome(holdings: Holding[]): IncomePlan {
  const perHolding = holdings.map(planHolding)
  const monthly = new Array<number>(12).fill(0)
  let totalValue = 0
  let annualIncome = 0
  for (const h of perHolding) {
    totalValue += h.value
    annualIncome += h.annualIncome
    for (let m = 0; m < 12; m++) monthly[m] += h.monthly[m]
  }
  return {
    holdings: perHolding,
    totalValue,
    annualIncome,
    portfolioYield: totalValue > 0 ? annualIncome / totalValue : 0,
    monthly,
  }
}
