import type { TickerSeries } from '@/engine'
import { splitAdjustedCloses } from '@/lib/prices'
import type { CashFlowInput, DividendInput, TradeInput } from './parse'
import type { ReconstructionResult } from './analyze'

/**
 * Everything the activity + positions pair supports beyond raw performance:
 * deposits vs market gains, dividend income, per-ticker attribution, the
 * cost of selling, trading behavior, and a same-flows benchmark replay.
 * All figures are for the reconstruction WINDOW, not lifetime.
 */

export interface PortfolioInsights {
  window: { start: string; end: string; months: number }
  /** External money: EFT/direct deposits in, withdrawals out. */
  deposits: { total: number; withdrawals: number; count: number; perMonth: number }
  /** endValue − startValue − net trade flows: what the market contributed. */
  marketGain: number
  dividends: {
    total: number
    byTicker: Array<{ ticker: string; amount: number }>
    byMonth: Array<{ month: string; amount: number }>
    /** Window total annualized — a rough run-rate, labeled as such. */
    annualRunRate: number
  }
  /** Per-ticker window P&L: end value + sale proceeds + dividends − capital in. */
  attribution: Array<{ ticker: string; pnl: number; endValue: number }>
  /** For every ticker sold: proceeds then vs what those shares are worth now. */
  sold: Array<{ ticker: string; proceeds: number; worthNow: number }>
  behavior: { trades: number; buys: number; sells: number; perMonth: number }
  /** Same dates + same external flows replayed into a benchmark ticker. */
  benchmark: { ticker: string; values: number[]; twr: number } | null
}

const monthsBetween = (a: string, b: string) =>
  Math.max(1 / 30.44, (Date.parse(b) - Date.parse(a)) / 86_400_000 / 30.44)

/** Close on the last trading day ≤ date (raw basis of that day). */
function closeOn(s: TickerSeries, date: string): number {
  let last = 0
  for (const r of s.records) {
    if (r.date > date) break
    last = r.close
  }
  return last
}

function splitAfter(s: TickerSeries, date: string): number {
  let f = 1
  for (const r of s.records) {
    if (r.date > date && r.splitFactor && r.splitFactor !== 1) f *= r.splitFactor
  }
  return f
}

/**
 * Replay the portfolio's external flows into one benchmark ticker on the
 * same calendar: flow > 0 buys that day, flow < 0 sells. TWR is chained
 * with the reconstruction's convention (flow at the start of the day).
 */
export function replayBenchmark(
  result: ReconstructionResult,
  bench: TickerSeries,
): { values: number[]; twr: number } | null {
  const adj = splitAdjustedCloses(bench.records)
  const priceByDate = new Map(bench.records.map((r, i) => [r.date, adj[i]]))
  let price = 0
  let shares = 0
  const values: number[] = []
  let index = 1
  for (let d = 0; d < result.dates.length; d++) {
    price = priceByDate.get(result.dates[d]) ?? price
    if (price <= 0) return null // benchmark history doesn't cover the window
    const flow = result.flows[d]
    shares = Math.max(0, shares + flow / price)
    const value = shares * price
    if (d > 0) {
      const base = values[d - 1] + flow
      if (base > 0) index *= value / base
    }
    values.push(value)
  }
  return { values, twr: index - 1 }
}

export function computeInsights(opts: {
  result: ReconstructionResult
  /** Trades as reconstructed — INCLUDING synthetic opening buys. */
  allTrades: TradeInput[]
  /** Only the trades the user actually made (behavior stats, sold list). */
  realTrades: TradeInput[]
  dividends: DividendInput[]
  cashFlows: CashFlowInput[]
  series: Map<string, TickerSeries>
  benchmark?: { ticker: string; series: TickerSeries } | null
}): PortfolioInsights {
  const { result, allTrades, realTrades, dividends, cashFlows, series } = opts
  const start = result.dates[0]
  const end = result.dates[result.dates.length - 1]
  const months = monthsBetween(start, end)

  const total = cashFlows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0)
  const withdrawals = -cashFlows.filter((f) => f.amount < 0).reduce((s, f) => s + f.amount, 0)

  // Market contribution over the window: value change net of all trade flows
  // after day one (day one's flow IS the starting capital).
  let netFlows = 0
  for (let d = 1; d < result.flows.length; d++) netFlows += result.flows[d]
  const marketGain =
    result.values[result.values.length - 1] - result.values[0] - netFlows

  // Dividends.
  const divByTicker = new Map<string, number>()
  const divByMonth = new Map<string, number>()
  let divTotal = 0
  for (const dv of dividends) {
    divTotal += dv.amount
    divByTicker.set(dv.ticker, (divByTicker.get(dv.ticker) ?? 0) + dv.amount)
    const m = dv.date.slice(0, 7)
    divByMonth.set(m, (divByMonth.get(m) ?? 0) + dv.amount)
  }

  // Attribution: per-ticker window P&L.
  const endShares = new Map(result.endPositions.map((p) => [p.ticker, p.shares]))
  const tickers = new Set([...allTrades.map((t) => t.ticker), ...endShares.keys()])
  const attribution: PortfolioInsights['attribution'] = []
  for (const ticker of tickers) {
    const s = series.get(ticker)
    if (!s) continue
    let capitalIn = 0
    let proceeds = 0
    for (const t of allTrades) {
      if (t.ticker !== ticker) continue
      const px = t.price ?? closeOn(s, t.date)
      if (t.side === 'buy') capitalIn += t.shares * px
      else proceeds += t.shares * px
    }
    const endValue = (endShares.get(ticker) ?? 0) * closeOn(s, end)
    const pnl = endValue + proceeds + (divByTicker.get(ticker) ?? 0) - capitalIn
    attribution.push({ ticker, pnl, endValue })
  }
  attribution.sort((a, b) => b.pnl - a.pnl)

  // Cost of selling: what the sold shares would be worth today.
  const soldBy = new Map<string, { proceeds: number; worthNow: number }>()
  for (const t of realTrades) {
    if (t.side !== 'sell') continue
    const s = series.get(t.ticker)
    if (!s) continue
    const px = t.price ?? closeOn(s, t.date)
    const cur = soldBy.get(t.ticker) ?? { proceeds: 0, worthNow: 0 }
    cur.proceeds += t.shares * px
    cur.worthNow += t.shares * splitAfter(s, t.date) * closeOn(s, end)
    soldBy.set(t.ticker, cur)
  }
  const sold = [...soldBy.entries()]
    .map(([ticker, v]) => ({ ticker, ...v }))
    .sort((a, b) => b.worthNow - b.proceeds - (a.worthNow - a.proceeds))

  const buys = realTrades.filter((t) => t.side === 'buy').length
  const bench = opts.benchmark ? replayBenchmark(result, opts.benchmark.series) : null

  return {
    window: { start, end, months },
    deposits: { total, withdrawals, count: cashFlows.filter((f) => f.amount > 0).length, perMonth: total / months },
    marketGain,
    dividends: {
      total: divTotal,
      byTicker: [...divByTicker.entries()]
        .map(([ticker, amount]) => ({ ticker, amount }))
        .sort((a, b) => b.amount - a.amount),
      byMonth: [...divByMonth.entries()]
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      annualRunRate: (divTotal / months) * 12,
    },
    attribution,
    sold,
    behavior: {
      trades: realTrades.length,
      buys,
      sells: realTrades.length - buys,
      perMonth: realTrades.length / months,
    },
    benchmark: bench && opts.benchmark ? { ticker: opts.benchmark.ticker, ...bench } : null,
  }
}
