import { describe, expect, it } from 'vitest'
import { annualIncome, rollingReturns } from '../metrics'
import { runBacktest } from '../backtest'
import type { BacktestConfig, TickerSeries } from '../types'

/** Month-end dates + a TWR index compounding at `monthly` per month. */
function syntheticMonthly(months: number, monthly: number) {
  const dates: string[] = []
  const twr: number[] = []
  for (let m = 0; m <= months; m++) {
    const d = new Date(Date.UTC(2010, m + 1, 0)) // last day of month m
    dates.push(d.toISOString().slice(0, 10))
    twr.push((1 + monthly) ** m)
  }
  return { dates, twr }
}

describe('rollingReturns', () => {
  it('constant 1%/month compounds to ~12.68% annualized in every window', () => {
    const { dates, twr } = syntheticMonthly(48, 0.01)
    for (const windowYears of [1, 3]) {
      const points = rollingReturns(dates, twr, windowYears)
      expect(points.length).toBe(49 - windowYears * 12)
      for (const p of points) {
        expect(p.value).toBeGreaterThan(0.12)
        expect(p.value).toBeLessThan(0.135)
      }
    }
  })

  it('returns empty when history is shorter than the window', () => {
    const { dates, twr } = syntheticMonthly(10, 0.01)
    expect(rollingReturns(dates, twr, 1)).toEqual([])
  })
})

describe('dividend income tracking', () => {
  const series = (rows: Array<[string, number, number, number]>): TickerSeries => ({
    ticker: 'DIV',
    records: rows.map(([date, close, adjClose, div]) => ({
      date,
      close,
      adjClose,
      divCash: div,
      splitFactor: 1,
    })),
  })
  // $2 dividend on day 2 (100 shares at $100), $1 dividend in the next year.
  const a = series([
    ['2020-12-30', 100, 100, 0],
    ['2020-12-31', 99, 101, 2],
    ['2021-01-04', 99, 102.01, 1],
  ])
  const spec = { name: 'p', allocations: [{ ticker: 'DIV', weight: 100 }] }
  const base: BacktestConfig = {
    initialAmount: 10_000,
    monthlyContribution: 0,
    rebalance: 'none',
    reinvestDividends: true,
  }

  it('records income identically whether or not dividends are reinvested', () => {
    const on = runBacktest([a], spec, base)
    const off = runBacktest([a], spec, { ...base, reinvestDividends: false })
    expect(on.dividendIncome[1]).toBeCloseTo(200, 6) // 100 shares x $2
    expect(off.dividendIncome[1]).toBeCloseTo(200, 6)
    // Reinvested: day-2 income bought shares, so day-3's $1/share pays on more value.
    expect(on.dividendIncome[2]).toBeGreaterThan(off.dividendIncome[2])
  })

  it('aggregates income by calendar year', () => {
    const r = runBacktest([a], spec, { ...base, reinvestDividends: false })
    const years = annualIncome(r.dates, r.dividendIncome)
    expect(years).toHaveLength(2)
    expect(years[0].year).toBe(2020)
    expect(years[0].income).toBeCloseTo(200, 6)
    expect(years[1].year).toBe(2021)
    expect(years[1].income).toBeCloseTo(100, 4) // 100 shares x $1, not reinvested
  })
})
