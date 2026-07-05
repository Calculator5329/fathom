import { describe, expect, it } from 'vitest'
import type { TickerSeries } from '../types'
import { maxSharpeIndex, minVarianceIndex, twoAssetFrontier } from '../frontier'

// Two synthetic monthly series: STK grows fast but choppy, BND grows slowly
// and smoothly. Month-end dates so the engine sees monthly returns.
function series(ticker: string, monthlyReturns: number[]): TickerSeries {
  const records = [{ date: '2000-01-31', close: 100, adjClose: 100, divCash: 0, splitFactor: 1 }]
  let px = 100
  let y = 2000
  let m = 2
  for (const r of monthlyReturns) {
    px *= 1 + r
    const date = `${y}-${String(m).padStart(2, '0')}-28`
    records.push({ date, close: px, adjClose: px, divCash: 0, splitFactor: 1 })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return { ticker, records }
}

const N = 120
const stk = series('STK', Array.from({ length: N }, (_, i) => 0.012 + (i % 2 === 0 ? 0.05 : -0.045)))
const bnd = series('BND', Array.from({ length: N }, () => 0.003))
const config = { initialAmount: 10_000, monthlyContribution: 0, rebalance: 'annual' as const, reinvestDividends: true }

describe('twoAssetFrontier', () => {
  const pts = twoAssetFrontier(stk, bnd, config, 11)

  it('sweeps weightA from 0 to 100 across the requested steps', () => {
    expect(pts).toHaveLength(11)
    expect(pts[0].weightA).toBe(0)
    expect(pts[pts.length - 1].weightA).toBe(100)
  })

  it('the all-bond end is lower risk than the all-stock end', () => {
    expect(pts[0].volatility).toBeLessThan(pts[pts.length - 1].volatility)
  })

  it('minimum-variance point is at or near the bond-heavy end', () => {
    const mv = minVarianceIndex(pts)
    expect(pts[mv].volatility).toBeLessThanOrEqual(pts[0].volatility + 1e-9)
    expect(pts[mv].weightA).toBeLessThan(50)
  })

  it('max-Sharpe point is a real index with the highest Sharpe', () => {
    const ms = maxSharpeIndex(pts)
    for (const p of pts) expect(pts[ms].sharpe).toBeGreaterThanOrEqual(p.sharpe - 1e-9)
  })

  it('single-asset endpoints do not throw (100/0 and 0/100)', () => {
    expect(pts[0].cagr).toBeTypeOf('number')
    expect(pts[pts.length - 1].cagr).toBeTypeOf('number')
  })
})
