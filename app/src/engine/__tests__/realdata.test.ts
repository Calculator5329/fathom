/**
 * Regression tests against real Tiingo data fetched by scripts/fetch-tiingo.mjs.
 * These pin the engine to known market history (approximate ranges, not
 * point values — vendor adjustment methodologies differ slightly).
 * Skipped automatically when the gitignored data files are absent.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { alignSeries } from '@/engine'
import { runBacktest } from '@/engine'
import type { BacktestConfig, TickerSeries } from '@/engine'

const DATA_DIR = path.resolve(import.meta.dirname, '../../../../data/tickers')

function load(ticker: string): TickerSeries {
  const raw = JSON.parse(readFileSync(path.join(DATA_DIR, `${ticker}.json`), 'utf8'))
  return { ticker: raw.ticker, name: raw.name, records: raw.records }
}

const hasData = ['SPY', 'BND', 'AAPL'].every((t) =>
  existsSync(path.join(DATA_DIR, `${t}.json`)),
)

const base: BacktestConfig = {
  initialAmount: 10_000,
  monthlyContribution: 0,
  rebalance: 'none',
  reinvestDividends: true,
}

describe.skipIf(!hasData)('real data: SPY', () => {
  const spy = load('SPY')
  const spec = { name: 'SPY', allocations: [{ ticker: 'SPY', weight: 100 }] }

  it('internal consistency: totalReturn ≈ priceReturn + divYield each day', () => {
    const { assets } = alignSeries([spy])
    const a = assets.get('SPY')!
    let worst = 0
    for (let t = 1; t < a.totalReturn.length; t++) {
      const diff = Math.abs(a.totalReturn[t] - (a.priceReturn[t] + a.divYield[t]))
      if (diff > worst) worst = diff
    }
    // adjClose is rounded to 6 decimals at fetch time; tiny residual expected.
    expect(worst).toBeLessThan(0.002)
  })

  it('1994–2023 CAGR lands in the known ~10% neighborhood', () => {
    const r = runBacktest([spy], spec, { ...base, start: '1994-01-01', end: '2023-12-31' })
    expect(r.metrics.cagr).toBeGreaterThan(0.09)
    expect(r.metrics.cagr).toBeLessThan(0.11)
  })

  it('GFC max drawdown ≈ −55% (total return)', () => {
    const r = runBacktest([spy], spec, { ...base, start: '2007-01-01', end: '2012-12-31' })
    expect(r.metrics.drawdown.maxDrawdown).toBeGreaterThan(-0.58)
    expect(r.metrics.drawdown.maxDrawdown).toBeLessThan(-0.5)
    expect(r.metrics.drawdown.troughDate.slice(0, 7)).toBe('2009-03')
    expect(r.metrics.drawdown.recoveryDate).not.toBeNull()
  })

  it('2008 annual return ≈ −37%', () => {
    const r = runBacktest([spy], spec, { ...base, start: '2007-12-01', end: '2009-01-31' })
    const y2008 = r.metrics.annualReturns.find((y) => y.year === 2008)!
    expect(y2008.return).toBeGreaterThan(-0.4)
    expect(y2008.return).toBeLessThan(-0.34)
  })

  it('reinvested beats non-reinvested over decades (dividends matter)', () => {
    const on = runBacktest([spy], spec, { ...base, start: '1994-01-01', end: '2023-12-31' })
    const off = runBacktest([spy], spec, {
      ...base,
      start: '1994-01-01',
      end: '2023-12-31',
      reinvestDividends: false,
    })
    expect(on.values.at(-1)!).toBeGreaterThan(off.values.at(-1)!)
    // Non-reinvested still holds all dividend cash — final value must exceed price-only.
    expect(off.endingCash).toBeGreaterThan(0)
  })
})

describe.skipIf(!hasData)('real data: 60/40 SPY/BND', () => {
  const spy = load('SPY')
  const bnd = load('BND')
  const spec = {
    name: '60/40',
    allocations: [
      { ticker: 'SPY', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
  }

  it('balanced portfolio has lower volatility and shallower drawdown than SPY', () => {
    const cfg = { ...base, start: '2008-01-01', end: '2023-12-31', rebalance: 'annual' as const }
    const mixed = runBacktest([spy, bnd], spec, cfg)
    const pure = runBacktest([spy], { name: 'SPY', allocations: [{ ticker: 'SPY', weight: 100 }] }, cfg)
    expect(mixed.metrics.volatility).toBeLessThan(pure.metrics.volatility)
    expect(mixed.metrics.drawdown.maxDrawdown).toBeGreaterThan(pure.metrics.drawdown.maxDrawdown)
    expect(mixed.metrics.cagr).toBeLessThan(pure.metrics.cagr)
    expect(mixed.metrics.cagr).toBeGreaterThan(0.03)
  })

  it('range clamps to BND inception (2007), not SPY (1993)', () => {
    const r = runBacktest([spy, bnd], spec, base)
    expect(r.dates[0].slice(0, 4)).toBe('2007')
  })
})

describe.skipIf(!hasData)('real data: AAPL splits', () => {
  const aapl = load('AAPL')
  const spec = { name: 'AAPL', allocations: [{ ticker: 'AAPL', weight: 100 }] }

  it('value is continuous across the 2020 4:1 split without reinvestment', () => {
    const r = runBacktest([aapl], spec, {
      ...base,
      reinvestDividends: false,
      start: '2020-08-24',
      end: '2020-09-04',
    })
    // Largest daily move in the window should be market movement (<15%), not a
    // 4x or 0.25x jump from mishandling the split.
    for (let t = 1; t < r.values.length; t++) {
      const dayMove = r.values[t] / r.values[t - 1]
      expect(dayMove).toBeGreaterThan(0.85)
      expect(dayMove).toBeLessThan(1.15)
    }
  })
})
