import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRealReturns, type AssetData } from '../data'
import {
  mulberry32,
  runBootstrap,
  runHistoricalSequence,
  type RealReturnSeries,
  type SimParams,
} from '../simulate'

// ---- unit tests on synthetic series ----------------------------------------
/** Constant real monthly return series of the given length. */
function constantSeries(monthlyReturn: number, months: number): RealReturnSeries {
  return {
    dates: Array.from({ length: months }, (_, i) => `2000-${String((i % 12) + 1).padStart(2, '0')}`),
    returns: Array.from({ length: months }, () => monthlyReturn),
  }
}

const base: SimParams = {
  initialBalance: 1_000_000,
  withdrawalRate: 0.04,
  strategy: 'fixedReal',
  horizonYears: 30,
  feeRate: 0,
}

describe('runTrial semantics (via historical with 1 start)', () => {
  it('a flat-zero-return portfolio lasts exactly 1/rate years on fixed-real', () => {
    // 0% real growth, 4% fixed-real withdrawal → depletes in 25 years, so a
    // 30-year horizon fails; a 24-year horizon survives.
    const s = constantSeries(0, 30 * 12)
    expect(runHistoricalSequence(s, { ...base, horizonYears: 30 }).successRate).toBe(0)
    expect(runHistoricalSequence(s, { ...base, horizonYears: 24 }).successRate).toBe(1)
  })

  it('fixed-percent withdrawal never depletes (balance can approach but not hit 0)', () => {
    const s = constantSeries(0, 30 * 12)
    const r = runHistoricalSequence(s, { ...base, strategy: 'fixedPercent', horizonYears: 30 })
    expect(r.successRate).toBe(1)
  })

  it('positive real growth above the withdrawal rate grows the balance', () => {
    const s = constantSeries(0.006, 30 * 12) // ~7.4%/yr real
    const r = runHistoricalSequence(s, base)
    expect(r.successRate).toBe(1)
    expect(r.medianEnding).toBeGreaterThan(base.initialBalance)
  })
})

describe('bootstrap', () => {
  it('is deterministic with a seeded RNG and matches trial count', () => {
    const s = constantSeries(0.004, 30 * 12)
    const a = runBootstrap(s, base, { trials: 500, rng: mulberry32(42) })
    const b = runBootstrap(s, base, { trials: 500, rng: mulberry32(42) })
    expect(a.trials).toBe(500)
    expect(a.successRate).toBe(b.successRate)
    expect(a.medianEnding).toBeCloseTo(b.medianEnding, 6)
  })
})

// ---- Trinity-study anchor on real historical data --------------------------
const DATA = path.resolve(import.meta.dirname, '../../../../data/asset-classes/us-monthly.json')
const hasData = existsSync(DATA)

function loadAssetData(): AssetData {
  const raw = JSON.parse(readFileSync(DATA, 'utf8')) as {
    dates: string[]
    series: Record<string, Array<number | null>>
  }
  const returns = new Map<string, Map<string, number>>()
  const put = (id: string) => {
    const m = new Map<string, number>()
    raw.dates.forEach((d, i) => {
      const v = raw.series[id][i]
      if (v !== null && Number.isFinite(v)) m.set(d, v)
    })
    returns.set(id, m)
  }
  put('usStocks')
  put('usBonds')
  const cpi = new Map<string, number>()
  raw.dates.forEach((d, i) => {
    const v = raw.series.cpi[i]
    if (v !== null && Number.isFinite(v)) cpi.set(d, v)
  })
  return { returns, cpi }
}

describe.skipIf(!hasData)('Trinity-study anchor (real data)', () => {
  it('4% fixed-real, 50/50 stocks/bonds, 30 years ≈ 95% historical success', () => {
    const series = buildRealReturns(
      [
        { assetId: 'usStocks', weight: 50 },
        { assetId: 'usBonds', weight: 50 },
      ],
      loadAssetData(),
    )
    expect(series.returns.length).toBeGreaterThan(1500) // ~150y of months
    const r = runHistoricalSequence(series, base)
    // The classic Trinity result is ~95-96%. Allow a band for data vintage.
    expect(r.successRate).toBeGreaterThan(0.9)
    expect(r.successRate).toBeLessThanOrEqual(1)
  })

  it('a punishing 8% fixed-real rate fails most of the time', () => {
    const series = buildRealReturns(
      [
        { assetId: 'usStocks', weight: 50 },
        { assetId: 'usBonds', weight: 50 },
      ],
      loadAssetData(),
    )
    const r = runHistoricalSequence(series, { ...base, withdrawalRate: 0.08 })
    expect(r.successRate).toBeLessThan(0.5)
  })
})
