import { describe, expect, it } from 'vitest'
import type { SimResult } from '../simulate'
import { annualInflationRate, inflationFactor, toNominalResult } from '../nominal'

describe('annualInflationRate', () => {
  it('is the compound rate over the covered span (hand-computed)', () => {
    // 100 -> 200 across exactly 12 months = 100%/yr.
    expect(annualInflationRate(new Map([['2000-01', 100], ['2001-01', 200]]))).toBeCloseTo(1, 12)
    // 100 -> 121 across 24 months = 10%/yr (1.21^(1/2) - 1).
    expect(annualInflationRate(new Map([['2000-01', 100], ['2002-01', 121]]))).toBeCloseTo(0.1, 12)
  })

  it('uses the first and last dated points regardless of insertion order', () => {
    const cpi = new Map([
      ['2002-01', 121],
      ['2000-01', 100],
      ['2001-01', 137], // interior point is ignored — endpoints define the rate
    ])
    expect(annualInflationRate(cpi)).toBeCloseTo(0.1, 12)
  })

  it('returns 0 for a degenerate series (no throw)', () => {
    expect(annualInflationRate(new Map())).toBe(0)
    expect(annualInflationRate(new Map([['2000-01', 100]]))).toBe(0)
    // Non-positive / non-finite / malformed points are dropped.
    expect(annualInflationRate(new Map([['2000-01', 0], ['bad', 5], ['2001-01', 100]]))).toBe(0)
  })
})

describe('inflationFactor', () => {
  it('compounds the annual rate over whole years', () => {
    expect(inflationFactor(0.1, 0)).toBe(1)
    expect(inflationFactor(0.1, 3)).toBeCloseTo(1.331, 12) // 1.1^3
  })
})

/** Minimal SimResult: acc=2, horizon=3 → 5 total years, 6 balance points. */
function baseResult(): SimResult {
  return {
    mode: 'historical',
    trials: 100,
    successRate: 0.9,
    horizonYears: 3,
    accumulationYears: 2,
    percentiles: {
      p5: [0, 0, 0, 0, 0, 0],
      p25: [0, 0, 0, 0, 0, 0],
      p50: [100, 100, 100, 100, 100, 100],
      p75: [0, 0, 0, 0, 0, 0],
      p95: [0, 0, 0, 0, 0, 0],
    },
    endingBalances: [50, 80],
    medianEnding: 80,
    worstStarts: [{ label: '1966', endingBalance: 50, depletedYear: null }],
    income: {
      firstYearMedian: 200,
      worstYearMedian: 150,
      worstYearP5: 100,
      cutProbability: 0.3,
      yearsBelowStartMedian: 2,
    },
    incomeByYear: {
      p5: [0, 0, 0],
      p25: [0, 0, 0],
      p50: [200, 200, 200],
      p75: [0, 0, 0],
      p95: [0, 0, 0],
    },
  }
}

describe('toNominalResult', () => {
  const rate = 0.1 // 10%/yr → factor 1.1^years

  it('inflates each balance point by the factor at its own year (hand-computed)', () => {
    const nominal = toNominalResult(baseResult(), rate)
    // year t = 0..5: 100 * 1.1^t
    expect(nominal.percentiles.p50).toEqual([
      expect.closeTo(100, 10),
      expect.closeTo(110, 10),
      expect.closeTo(121, 10),
      expect.closeTo(133.1, 10),
      expect.closeTo(146.41, 10),
      expect.closeTo(161.051, 10),
    ])
    // t = 0 (today) is never inflated.
    expect(nominal.percentiles.p50[0]).toBe(100)
  })

  it('inflates ending balances and worst starts to the final year (acc + horizon = 5)', () => {
    const nominal = toNominalResult(baseResult(), rate)
    const f5 = 1.1 ** 5 // 1.61051
    expect(nominal.endingBalances).toEqual([
      expect.closeTo(50 * f5, 10),
      expect.closeTo(80 * f5, 10),
    ])
    expect(nominal.medianEnding).toBeCloseTo(80 * f5, 10)
    expect(nominal.worstStarts[0].endingBalance).toBeCloseTo(50 * f5, 10)
    // Non-monetary fields on worst starts pass through untouched.
    expect(nominal.worstStarts[0].label).toBe('1966')
    expect(nominal.worstStarts[0].depletedYear).toBe(null)
  })

  it('inflates per-year income by the calendar year the withdrawal occurs', () => {
    const nominal = toNominalResult(baseResult(), rate)
    // retirement year i+1 is withdrawn at calendar year acc + i = 2, 3, 4.
    expect(nominal.incomeByYear.p50).toEqual([
      expect.closeTo(200 * 1.1 ** 2, 10), // 242
      expect.closeTo(200 * 1.1 ** 3, 10), // 266.2
      expect.closeTo(200 * 1.1 ** 4, 10), // 292.82
    ])
  })

  it('inflates income summary scalars at the first retirement year (acc = 2)', () => {
    const nominal = toNominalResult(baseResult(), rate)
    const f2 = 1.1 ** 2 // 1.21
    expect(nominal.income.firstYearMedian).toBeCloseTo(200 * f2, 10)
    expect(nominal.income.worstYearMedian).toBeCloseTo(150 * f2, 10)
    expect(nominal.income.worstYearP5).toBeCloseTo(100 * f2, 10)
    // Unitless risk metrics are untouched.
    expect(nominal.income.cutProbability).toBe(0.3)
    expect(nominal.income.yearsBelowStartMedian).toBe(2)
  })

  it('is a no-op at rate 0 and never mutates the input', () => {
    const original = baseResult()
    const passthrough = toNominalResult(original, 0)
    expect(passthrough).toEqual(original)
    // Mutating the returned copy leaves the source arrays intact.
    passthrough.percentiles.p50[1] = 999
    expect(original.percentiles.p50[1]).toBe(100)
  })
})
