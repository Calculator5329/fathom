import { describe, expect, it } from 'vitest'
import {
  type ParametricInput,
  equicorrelationCholesky,
  generateParametricPool,
  makeNormal,
  runParametric,
} from '../parametric'
import { mulberry32, type SimParams } from '../simulate'

/** Sample mean / population standard deviation of an array. */
function stats(xs: number[]): { mean: number; std: number } {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  const varc = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length
  return { mean, std: Math.sqrt(varc) }
}

describe('makeNormal (seeded standard normals)', () => {
  it('is deterministic for a given seed and diverges across seeds', () => {
    const a = Array.from({ length: 8 }, makeNormal(mulberry32(42)))
    const b = Array.from({ length: 8 }, makeNormal(mulberry32(42)))
    const c = Array.from({ length: 8 }, makeNormal(mulberry32(43)))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('approximates a standard normal (mean 0, std 1)', () => {
    const n = makeNormal(mulberry32(7))
    const xs = Array.from({ length: 50_000 }, n)
    const { mean, std } = stats(xs)
    expect(Math.abs(mean)).toBeLessThan(0.02)
    expect(Math.abs(std - 1)).toBeLessThan(0.02)
  })
})

describe('equicorrelationCholesky', () => {
  it('reconstructs the equicorrelation matrix (L·Lᵀ = Σ)', () => {
    const n = 3
    const rho = 0.3
    const L = equicorrelationCholesky(n, rho)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0
        for (let k = 0; k < n; k++) s += L[i][k] * L[j][k]
        expect(s).toBeCloseTo(i === j ? 1 : rho, 10)
      }
    }
  })

  it('clamps an out-of-range correlation into the positive-definite interval', () => {
    // rho = -1 for n=3 is not PD; the factor must still be real (no NaNs).
    const L = equicorrelationCholesky(3, -1)
    for (const row of L) for (const v of row) expect(Number.isFinite(v)).toBe(true)
  })

  it('returns [[1]] for a single asset', () => {
    expect(equicorrelationCholesky(1, 0.5)).toEqual([[1]])
  })
})

describe('generateParametricPool', () => {
  it('matches the target monthly mean and vol for a single asset', () => {
    const input: ParametricInput = {
      assets: [{ weight: 1, mean: 0.08, vol: 0.18 }],
      correlation: 0,
    }
    const pool = generateParametricPool(input, 60_000, mulberry32(123))
    const { mean, std } = stats(pool)
    // Annual 8% / 18% → monthly mean 0.08/12, vol 0.18/√12.
    expect(mean).toBeCloseTo(0.08 / 12, 2)
    expect(std).toBeCloseTo(0.18 / Math.sqrt(12), 2)
  })

  it('applies correlation to portfolio variance (closed form)', () => {
    const w = [0.6, 0.4]
    const mVol = [0.16 / Math.sqrt(12), 0.06 / Math.sqrt(12)]
    for (const rho of [-0.2, 0, 0.5]) {
      const input: ParametricInput = {
        assets: [
          { weight: w[0], mean: 0.07, vol: 0.16 },
          { weight: w[1], mean: 0.02, vol: 0.06 },
        ],
        correlation: rho,
      }
      const pool = generateParametricPool(input, 80_000, mulberry32(9))
      const { std } = stats(pool)
      const expected = Math.sqrt(
        w[0] ** 2 * mVol[0] ** 2 +
          w[1] ** 2 * mVol[1] ** 2 +
          2 * w[0] * w[1] * mVol[0] * mVol[1] * rho,
      )
      expect(std).toBeCloseTo(expected, 2)
    }
  })

  it('is deterministic for a given seed', () => {
    const input: ParametricInput = {
      assets: [{ weight: 1, mean: 0.05, vol: 0.1 }],
      correlation: 0,
    }
    const a = generateParametricPool(input, 500, mulberry32(2024))
    const b = generateParametricPool(input, 500, mulberry32(2024))
    expect(a).toEqual(b)
  })
})

describe('runParametric', () => {
  const params: SimParams = {
    initialBalance: 1_000_000,
    withdrawalRate: 0.04,
    strategy: 'fixedReal',
    horizonYears: 30,
    feeRate: 0.001,
    accumulationYears: 0,
    annualContribution: 0,
  }
  const input: ParametricInput = {
    assets: [
      { weight: 0.6, mean: 0.07, vol: 0.16 },
      { weight: 0.4, mean: 0.02, vol: 0.06 },
    ],
    correlation: 0.15,
  }

  it('produces a well-formed, monotonic percentile fan', () => {
    const r = runParametric(input, params, { trials: 4000, seed: 0x9e3779b9 })
    const total = params.horizonYears + (params.accumulationYears ?? 0)
    expect(r.percentiles.p50).toHaveLength(total + 1)
    expect(r.incomeByYear.p50).toHaveLength(params.horizonYears)
    expect(r.endingBalances).toHaveLength(4000)
    expect(r.successRate).toBeGreaterThanOrEqual(0)
    expect(r.successRate).toBeLessThanOrEqual(1)
    // Percentile bands are ordered at every year.
    for (let y = 0; y <= total; y++) {
      expect(r.percentiles.p5[y]).toBeLessThanOrEqual(r.percentiles.p25[y])
      expect(r.percentiles.p25[y]).toBeLessThanOrEqual(r.percentiles.p50[y])
      expect(r.percentiles.p50[y]).toBeLessThanOrEqual(r.percentiles.p75[y])
      expect(r.percentiles.p75[y]).toBeLessThanOrEqual(r.percentiles.p95[y])
    }
    // Year 0 is the starting balance for every trial.
    expect(r.percentiles.p50[0]).toBeCloseTo(params.initialBalance, 6)
    // Parametric mode has no historical starting years to rank.
    expect(r.worstStarts).toEqual([])
  })

  it('is deterministic in the seed and responsive to it', () => {
    const a = runParametric(input, params, { trials: 2000, seed: 1 })
    const b = runParametric(input, params, { trials: 2000, seed: 1 })
    const c = runParametric(input, params, { trials: 2000, seed: 2 })
    expect(a.medianEnding).toEqual(b.medianEnding)
    expect(a.endingBalances).toEqual(b.endingBalances)
    expect(a.medianEnding).not.toEqual(c.medianEnding)
  })

  it('lower expected returns yield lower median ending balances', () => {
    const rich = runParametric(input, params, { trials: 3000, seed: 5 })
    const poor = runParametric(
      { ...input, assets: input.assets.map((a) => ({ ...a, mean: a.mean - 0.03 })) },
      params,
      { trials: 3000, seed: 5 },
    )
    expect(poor.medianEnding).toBeLessThan(rich.medianEnding)
  })

  it('produces fan-chart-ready bands (the exact shape fanChartOption consumes)', () => {
    // fanChartOption (../chart) reads result.percentiles + accumulation/horizon
    // years and builds stacked-area bands as `upper[i] - lower[i]`. Reproduce
    // that transform here (DOM-free, since the chart module touches `document`)
    // to prove a parametric result renders a valid fan: every band delta is
    // non-negative and the x-axis spans year 0..(acc+horizon).
    const r = runParametric(input, params, { trials: 2000, seed: 11 })
    const total = r.accumulationYears + r.horizonYears
    const years = Array.from({ length: total + 1 }, (_, i) => String(i))
    expect(years).toHaveLength(params.horizonYears + 1)
    const { p5, p25, p50, p75, p95 } = r.percentiles
    for (const [lo, hi] of [
      [p5, p95],
      [p25, p75],
    ] as const) {
      expect(lo).toHaveLength(total + 1)
      expect(hi).toHaveLength(total + 1)
      for (let i = 0; i <= total; i++) expect(hi[i] - lo[i]).toBeGreaterThanOrEqual(0)
    }
    expect(p50.every((v) => Number.isFinite(v))).toBe(true)
  })
})
