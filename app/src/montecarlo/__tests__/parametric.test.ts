import { describe, expect, it } from 'vitest'
import {
  type ParametricInput,
  equicorrelationCholesky,
  generateParametricPool,
  makeNormal,
  runParametric,
} from '../parametric'
import { fanChartOption } from '../chart'
import { mulberry32, type SimParams, type SimResult } from '../simulate'

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

describe('runParametric', () => {
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
})

// ---------------------------------------------------------------------------
// fanChartOption — the real chart builder, real seeded results.
// ---------------------------------------------------------------------------

/** The part of the option object these assertions read. */
type FanOption = {
  xAxis: { type: string; data: string[]; boundaryGap: boolean; name: string }
  yAxis: { type: string; axisLabel: { formatter: (v: number) => string } }
  series: {
    name: string
    data: number[]
    stack?: string
    lineStyle?: Record<string, unknown>
    areaStyle?: { color: string; opacity: number }
    markArea?: {
      itemStyle: { color: string; opacity: number }
      data: [{ name: string; xAxis: string }, { xAxis: string }][]
    }
    markLine?: {
      lineStyle: { color: string; type: string }
      label: { formatter: string }
      data: { xAxis: string }[]
    }
  }[]
}

/**
 * The chart module's only environment dependency is `cssVar`, which reads
 * computed styles off `document.documentElement`. Stub that seam (the same
 * shape valuationBands.test.ts uses) and echo the token name back, so an
 * assertion can tell a resolved token from a raw `var(--x)` string. The chart
 * function itself is never mocked.
 */
function withCssStub<T>(fn: () => T): T {
  const originalStyle = globalThis.getComputedStyle
  const originalDocument = globalThis.document
  globalThis.document = { documentElement: {} } as unknown as Document
  globalThis.getComputedStyle = (() =>
    ({ getPropertyValue: (name: string) => `resolved(${name})` }) as unknown as CSSStyleDeclaration) as unknown as typeof globalThis.getComputedStyle
  try {
    return fn()
  } finally {
    globalThis.document = originalDocument
    globalThis.getComputedStyle = originalStyle
  }
}

describe('fanChartOption', () => {
  /** A complete, seeded SimResult spanning `accumulation + horizon` years. */
  const seeded = (accumulationYears: number, horizonYears: number): SimResult =>
    runParametric(
      input,
      { ...params, accumulationYears, horizonYears },
      { trials: 200, seed: 77 },
    )

  // Both fixtures span 3 years, so the same hand-picked bands fit either one.
  // Small integers make every stacked band delta checkable by eye.
  const percentiles = {
    p5: [100, 80, 60, 40],
    p25: [100, 90, 85, 70],
    p50: [100, 110, 120, 130],
    p75: [100, 130, 160, 200],
    p95: [100, 150, 210, 300],
  }
  const accumulating: SimResult = { ...seeded(2, 1), percentiles }
  const retiredNow: SimResult = { ...seeded(0, 3), percentiles }

  it('builds the year axis, both bands and the median from the result', () => {
    const option = withCssStub(() => fanChartOption(accumulating)) as unknown as FanOption

    // Year range is accumulation + horizon, inclusive of year 0.
    expect(option.xAxis).toMatchObject({
      type: 'category',
      data: ['0', '1', '2', '3'],
      boundaryGap: false,
      name: 'Year',
    })
    expect(option.yAxis.type).toBe('value')
    expect(option.yAxis.axisLabel.formatter(1_250_000)).toBe('$1.25M')

    const [lowBase, lowBand, midBase, midBand, median] = option.series
    expect(option.series.map((s) => s.name)).toEqual([
      '5–95-base',
      '5–95',
      '25–75-base',
      '25–75',
      'Median',
    ])

    // Each band is an invisible base line plus a filled delta stacked on it.
    expect(lowBase.data).toEqual(percentiles.p5)
    expect(lowBand.data).toEqual([0, 70, 150, 260]) // p95 − p5
    expect(midBase.data).toEqual(percentiles.p25)
    expect(midBand.data).toEqual([0, 40, 75, 130]) // p75 − p25
    expect([lowBase.stack, lowBand.stack, midBase.stack, midBand.stack]).toEqual([
      '5–95',
      '5–95',
      '25–75',
      '25–75',
    ])
    expect(lowBand.areaStyle).toEqual({ color: 'resolved(--primary)', opacity: 0.08 })
    expect(midBand.areaStyle).toEqual({ color: 'resolved(--primary)', opacity: 0.16 })

    expect(median.data).toEqual(percentiles.p50)
    expect(median.lineStyle).toEqual({ width: 2.5, color: 'resolved(--primary)' })
    // Colors must be resolved tokens: canvas ECharts cannot parse `var(--x)`.
    expect(JSON.stringify(option)).not.toContain('var(--')
  })

  it('shades the saving years and marks retirement when accumulating', () => {
    const option = withCssStub(() => fanChartOption(accumulating)) as unknown as FanOption
    const median = option.series[4]

    expect(median.markArea?.data).toEqual([[{ name: 'saving', xAxis: '0' }, { xAxis: '2' }]])
    expect(median.markArea?.itemStyle).toEqual({ color: 'resolved(--chart-2)', opacity: 0.05 })
    // The retirement line lands on the accumulation/withdrawal boundary.
    expect(median.markLine?.data).toEqual([{ xAxis: '2' }])
    expect(median.markLine?.lineStyle).toMatchObject({
      type: 'dashed',
      color: 'resolved(--muted-foreground)',
    })
    expect(median.markLine?.label.formatter).toBe('retire')
  })

  it('omits the saving markers when retirement starts immediately', () => {
    const option = withCssStub(() => fanChartOption(retiredNow)) as unknown as FanOption
    const median = option.series[4]

    // Same 3-year span, reached through horizon alone: no saving phase to mark.
    expect(option.xAxis.data).toEqual(['0', '1', '2', '3'])
    expect(median.data).toEqual(percentiles.p50)
    expect(median.markArea).toBeUndefined()
    expect(median.markLine).toBeUndefined()
  })
})
