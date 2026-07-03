import { describe, expect, it } from 'vitest'
import { runBacktest } from '../backtest'
import type { BacktestConfig, DailyRecord, TickerSeries } from '../types'

/** Build a series from compact tuples: [date, close, adjClose, div, split]. */
function series(
  ticker: string,
  rows: Array<[string, number, number?, number?, number?]>,
): TickerSeries {
  const records: DailyRecord[] = rows.map(([date, close, adjClose, div, split]) => ({
    date,
    close,
    adjClose: adjClose ?? close,
    divCash: div ?? 0,
    splitFactor: split ?? 1,
  }))
  return { ticker, records }
}

const base: BacktestConfig = {
  initialAmount: 10_000,
  monthlyContribution: 0,
  rebalance: 'none',
  reinvestDividends: true,
}

describe('single asset, no dividends', () => {
  const a = series('AAA', [
    ['2020-01-02', 100],
    ['2020-01-03', 110],
    ['2020-01-06', 99],
  ])

  it('portfolio tracks the asset exactly; reinvest toggle is a no-op', () => {
    for (const reinvest of [true, false]) {
      const r = runBacktest([a], { name: 'p', allocations: [{ ticker: 'AAA', weight: 100 }] }, {
        ...base,
        reinvestDividends: reinvest,
      })
      expect(r.values[0]).toBeCloseTo(10_000, 8)
      expect(r.values[1]).toBeCloseTo(11_000, 8)
      expect(r.values[2]).toBeCloseTo(9_900, 8)
      expect(r.metrics.totalReturn).toBeCloseTo(-0.01, 10)
      expect(r.endingCash).toBe(0)
    }
  })
})

describe('dividends', () => {
  // $2 dividend on day 2. Unadjusted close drops 100 -> 99 (market fell $1
  // net of the dividend effect). adjClose encodes total return:
  // total return day 2 = (99 + 2) / 100 = 1.01.
  const a = series('DIV', [
    ['2020-01-02', 100, 100],
    ['2020-01-03', 99, 101, 2],
  ])
  const spec = { name: 'p', allocations: [{ ticker: 'DIV', weight: 100 }] }

  it('reinvested: value follows adjClose', () => {
    const r = runBacktest([a], spec, base)
    expect(r.values[1]).toBeCloseTo(10_100, 8)
    expect(r.endingCash).toBe(0)
  })

  it('not reinvested: price return on shares plus dividend cash', () => {
    const r = runBacktest([a], spec, { ...base, reinvestDividends: false })
    // Shares: 100 @ $100. Day 2: share value 9_900, cash 100 * $2 = 200.
    expect(r.values[1]).toBeCloseTo(10_100, 8)
    expect(r.endingCash).toBeCloseTo(200, 8)
  })
})

describe('splits', () => {
  // 2:1 split on day 2: close halves 100 -> 51 (real +2% move), adjClose continuous.
  const a = series('SPL', [
    ['2020-01-02', 100, 100],
    ['2020-01-03', 51, 102, 0, 2],
  ])
  const spec = { name: 'p', allocations: [{ ticker: 'SPL', weight: 100 }] }

  it('price return neutralizes the split', () => {
    const r = runBacktest([a], spec, { ...base, reinvestDividends: false })
    expect(r.values[1]).toBeCloseTo(10_200, 8)
    expect(r.endingCash).toBe(0)
  })

  it('dividend after split pays on post-split shares', () => {
    // Day 3: $1 dividend per (post-split) share, price flat.
    const b = series('SPL', [
      ['2020-01-02', 100, 100],
      ['2020-01-03', 51, 102, 0, 2],
      ['2020-01-06', 50, 101, 1],
    ])
    const r = runBacktest([b], spec, { ...base, reinvestDividends: false })
    // 100 shares -> 200 shares after split. Cash = 200 * $1 = 200.
    expect(r.endingCash).toBeCloseTo(200, 6)
    // Share value: 200 * $50 = 10_000; total 10_200.
    expect(r.values[2]).toBeCloseTo(10_200, 6)
  })
})

describe('two assets with monthly rebalancing', () => {
  // Jan: A +10%, B flat. Feb: A flat, B +10%.
  const a = series('A', [
    ['2020-01-30', 100],
    ['2020-01-31', 110],
    ['2020-02-03', 110],
  ])
  const b = series('B', [
    ['2020-01-30', 100],
    ['2020-01-31', 100],
    ['2020-02-03', 110],
  ])
  const spec = {
    name: 'p',
    allocations: [
      { ticker: 'A', weight: 60 },
      { ticker: 'B', weight: 40 },
    ],
  }

  it('without rebalancing, drifted weights carry into February', () => {
    const r = runBacktest([a, b], spec, base)
    // Day 1: 6600 + 4000 = 10600. Day 2 (no rebalance): A stays 6600, B 4000*1.1=4400.
    expect(r.values[1]).toBeCloseTo(10_600, 8)
    expect(r.values[2]).toBeCloseTo(11_000, 8)
  })

  it('monthly rebalancing resets to 60/40 at the month boundary', () => {
    const r = runBacktest([a, b], spec, { ...base, rebalance: 'monthly' })
    // Feb 3 starts a new month: rebalance 10600 -> A 6360, B 4240.
    // Then B gains 10%: 6360 + 4664 = 11_024.
    expect(r.values[2]).toBeCloseTo(11_024, 8)
  })
})

describe('monthly contributions', () => {
  const a = series('A', [
    ['2020-01-30', 100],
    ['2020-01-31', 100],
    ['2020-02-03', 110],
  ])
  const spec = { name: 'p', allocations: [{ ticker: 'A', weight: 100 }] }

  it('contribution enters at prior close and earns that day\'s return', () => {
    const r = runBacktest([a], spec, { ...base, monthlyContribution: 1_000 })
    // Feb 3: +1000 at prior close, then +10% on 11_000 -> 12_100.
    expect(r.values[2]).toBeCloseTo(12_100, 8)
    expect(r.totalContributions).toBe(1_000)
    expect(r.flows[2]).toBe(1_000)
  })

  it('TWR strips flows: same index with and without contributions', () => {
    const with_ = runBacktest([a], spec, { ...base, monthlyContribution: 1_000 })
    const without = runBacktest([a], spec, base)
    expect(with_.twrIndex[2]).toBeCloseTo(without.twrIndex[2], 10)
    expect(with_.metrics.totalReturn).toBeCloseTo(0.1, 10)
  })

  it('IRR sits between start and end weighting when timing matters', () => {
    const r = runBacktest([a], spec, { ...base, monthlyContribution: 1_000 })
    // All growth came after the contribution, so IRR is well-defined and positive.
    expect(r.metrics.irr).toBeGreaterThan(0)
    expect(Number.isFinite(r.metrics.irr)).toBe(true)
  })
})

describe('validation', () => {
  it('rejects weights that do not sum to 100', () => {
    const a = series('A', [
      ['2020-01-02', 100],
      ['2020-01-03', 101],
    ])
    expect(() =>
      runBacktest([a], { name: 'p', allocations: [{ ticker: 'A', weight: 50 }] }, base),
    ).toThrow(/sum to 100/)
  })

  it('rejects non-overlapping ranges', () => {
    const a = series('A', [
      ['2020-01-02', 100],
      ['2020-01-03', 101],
    ])
    const b = series('B', [
      ['2021-01-04', 100],
      ['2021-01-05', 101],
    ])
    expect(() =>
      runBacktest(
        [a, b],
        {
          name: 'p',
          allocations: [
            { ticker: 'A', weight: 50 },
            { ticker: 'B', weight: 50 },
          ],
        },
        base,
      ),
    ).toThrow(/overlap/i)
  })
})
