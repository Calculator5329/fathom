import { describe, expect, it } from 'vitest'
import type { TickerSeries } from '@/engine'
import { reconstructHistory } from '../analyze'
import { computeInsights, replayBenchmark } from '../insights'
import type { TradeInput } from '../parse'

const mk = (ticker: string, rows: Array<[string, number, number?]>): TickerSeries => ({
  ticker,
  records: rows.map(([date, close, splitFactor]) => ({
    date,
    close,
    adjClose: close,
    divCash: 0,
    splitFactor: splitFactor ?? 1,
  })),
})

// Three trading days; AAA doubles, BENCH gains 10% then flat.
const AAA = mk('AAA', [
  ['2026-01-02', 100],
  ['2026-02-02', 150],
  ['2026-03-02', 200],
])
const BENCH = mk('SPY', [
  ['2026-01-02', 500],
  ['2026-02-02', 550],
  ['2026-03-02', 550],
])
const series = new Map([
  ['AAA', AAA],
  ['SPY', BENCH],
])

const trades: TradeInput[] = [
  { date: '2026-01-02', ticker: 'AAA', side: 'buy', shares: 10, price: 100 },
  { date: '2026-03-02', ticker: 'AAA', side: 'sell', shares: 4, price: 200 },
]

describe('computeInsights', () => {
  const result = reconstructHistory(trades, series)
  const insights = computeInsights({
    result,
    allTrades: trades,
    realTrades: trades,
    dividends: [{ date: '2026-02-15', ticker: 'AAA', amount: 12 }],
    cashFlows: [
      { date: '2026-01-02', amount: 1000 },
      { date: '2026-02-02', amount: -100 },
    ],
    series,
    benchmark: { ticker: 'SPY', series: BENCH },
  })

  it('deposits and withdrawals split by sign', () => {
    expect(insights.deposits.total).toBe(1000)
    expect(insights.deposits.withdrawals).toBe(100)
    expect(insights.deposits.count).toBe(1)
  })

  it('market gain = value change net of trade flows', () => {
    // V0 1000 → sell 4×200 (flow −800) → V_end 6×200 = 1200.
    // gain = 1200 − 1000 − (−800) = 1000. (The price doubling.)
    expect(insights.marketGain).toBeCloseTo(1000, 6)
  })

  it('attribution: end value + proceeds + dividends − capital in', () => {
    const aaa = insights.attribution.find((a) => a.ticker === 'AAA')!
    // 1200 + 800 + 12 − 1000 = 1012
    expect(aaa.pnl).toBeCloseTo(1012, 6)
    expect(aaa.endValue).toBeCloseTo(1200, 6)
  })

  it('sold counterfactual: proceeds vs worth at window end', () => {
    // Sold 4 @ 200 on the last day → worth today identical (no regret).
    expect(insights.sold).toEqual([{ ticker: 'AAA', proceeds: 800, worthNow: 800 }])
  })

  it('dividend totals and run-rate', () => {
    expect(insights.dividends.total).toBe(12)
    expect(insights.dividends.byTicker[0]).toEqual({ ticker: 'AAA', amount: 12 })
    expect(insights.dividends.annualRunRate).toBeGreaterThan(12)
  })

  it('benchmark replay: same flows into SPY, TWR is SPY price return', () => {
    const b = replayBenchmark(result, BENCH)!
    // Day 1: buy $1000 at 500 → 2 sh. Day 2: 2×550 = 1100. Day 3: flow −800
    // sells 800/550 sh → value (2 − 1.4545…)×550 = 300.
    expect(b.values[0]).toBeCloseTo(1000, 6)
    expect(b.values[1]).toBeCloseTo(1100, 6)
    expect(b.values[2]).toBeCloseTo(300, 4)
    // TWR = SPY's own price path: +10%, then flat → +10% total.
    expect(b.twr).toBeCloseTo(0.1, 6)
    expect(insights.benchmark?.ticker).toBe('SPY')
  })
})
