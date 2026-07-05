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
// (RealReturnSeries used by the fidelity-pack crash fixture)

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

describe('fidelity pack', () => {
  it('accumulation phase: contributions compound into the retirement balance', () => {
    // 0% return, save 12k/yr for 10y on 100k start -> exactly 220k at retirement.
    const s = constantSeries(0, 40 * 12)
    const r = runHistoricalSequence(s, {
      ...base,
      initialBalance: 100_000,
      accumulationYears: 10,
      annualContribution: 12_000,
      horizonYears: 10,
      withdrawalRate: 0.04,
    })
    expect(r.accumulationYears).toBe(10)
    expect(r.percentiles.p50[10]).toBeCloseTo(220_000, 4)
    // fixedReal anchors to the retirement balance: 4% of 220k = 8.8k/yr.
    expect(r.income.firstYearMedian).toBeCloseTo(8_800, 4)
  })

  it('guardrails cuts income after a crash and never depletes as fast as fixedReal', () => {
    // Crash 40% in year one, flat after: guardrails should cut 10%.
    const months = 30 * 12
    const returns = Array.from({ length: months }, (_, i) => (i < 12 ? -0.0417 : 0))
    const s: RealReturnSeries = { dates: constantSeries(0, months).dates, returns }
    const fixed = runHistoricalSequence(s, { ...base, horizonYears: 30 })
    const guard = runHistoricalSequence(s, { ...base, horizonYears: 30, strategy: 'guardrails' })
    // At least one 10% cut fired (repeatedly, in this pathological flat fixture).
    expect(guard.income.worstYearMedian).toBeLessThanOrEqual(guard.income.firstYearMedian * 0.9)
    expect(guard.income.worstYearMedian).toBeGreaterThan(0)
    // Cutting withdrawals must not end worse than never cutting.
    expect(guard.medianEnding).toBeGreaterThanOrEqual(fixed.medianEnding)
    expect(guard.successRate).toBeGreaterThanOrEqual(fixed.successRate)
  })

  it('income stats: fixedReal worst year equals first year when nothing depletes', () => {
    const s = constantSeries(0.004, 30 * 12)
    const r = runHistoricalSequence(s, base)
    expect(r.income.worstYearMedian).toBeCloseTo(r.income.firstYearMedian, 6)
    expect(r.income.firstYearMedian).toBeCloseTo(base.initialBalance * base.withdrawalRate, 6)
  })
})

describe('income distribution (incomeByYear + pay-cut stats)', () => {
  it('fixedReal, healthy market: income is flat, no cuts', () => {
    const s = constantSeries(0.004, 30 * 12)
    const r = runHistoricalSequence(s, base)
    expect(r.incomeByYear.p50).toHaveLength(30)
    for (let y = 0; y < 30; y++) {
      expect(r.incomeByYear.p50[y]).toBeCloseTo(40_000, 6)
      expect(r.incomeByYear.p5[y]).toBeCloseTo(r.incomeByYear.p95[y], 6)
    }
    expect(r.income.cutProbability).toBe(0)
    expect(r.income.yearsBelowStartMedian).toBe(0)
  })

  it('guardrails after a crash: median income steps down and cut stats fire', () => {
    const months = 30 * 12
    const returns = Array.from({ length: months }, (_, i) => (i < 12 ? -0.0417 : 0))
    const s: RealReturnSeries = { dates: constantSeries(0, months).dates, returns }
    const r = runHistoricalSequence(s, { ...base, horizonYears: 30, strategy: 'guardrails' })
    // Year 1 is the anchor; the crash forces at least one 10% cut later.
    expect(r.incomeByYear.p50[0]).toBeCloseTo(40_000, 6)
    const later = Math.min(...r.incomeByYear.p50.slice(1))
    expect(later).toBeLessThanOrEqual(40_000 * 0.9 + 1)
    expect(later).toBeGreaterThan(0)
    expect(r.income.cutProbability).toBe(1)
    expect(r.income.yearsBelowStartMedian).toBeGreaterThan(0)
  })

  it('fixedReal that depletes: income goes to zero after depletion (counted as cut)', () => {
    const s = constantSeries(0, 30 * 12) // depletes in year 25
    const r = runHistoricalSequence(s, { ...base, horizonYears: 30 })
    expect(r.incomeByYear.p50[0]).toBeCloseTo(40_000, 6)
    expect(r.incomeByYear.p50[29]).toBe(0)
    expect(r.income.cutProbability).toBe(1)
  })
})

describe('VPW planned spend-down', () => {
  it('depleting AT the horizon is the plan, not a failure', () => {
    // VPW amortizes to zero by design — its final year withdraws the whole
    // balance. With flat-zero returns the balance hits 0 in year 10 exactly
    // as planned, so success must be 100% and nothing reads as "depleted".
    const s = constantSeries(0, 10 * 12)
    const r = runHistoricalSequence(s, { ...base, strategy: 'vpw', horizonYears: 10 })
    expect(r.successRate).toBe(1)
    expect(r.medianEnding).toBeLessThan(base.initialBalance * 0.05)
    expect(r.worstStarts.every((w) => w.depletedYear === null)).toBe(true)
  })

  it('first-year VPW income amortizes the balance over the horizon', () => {
    // 2.5% assumed real return over 10 years → payout rate ≈ 11.4%/yr on 1M.
    const s = constantSeries(0, 10 * 12)
    const r = runHistoricalSequence(s, { ...base, strategy: 'vpw', horizonYears: 10 })
    expect(r.income.firstYearMedian).toBeGreaterThan(100_000)
    expect(r.income.firstYearMedian).toBeLessThan(130_000)
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
