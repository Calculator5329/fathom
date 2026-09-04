import { describe, expect, it } from 'vitest'
import { buildValuationBandOption, computePercentiles, computeValuationBandSummary, type ValuationBandPoint } from '../valuationBands'

function points(input: number[]): ValuationBandPoint[] {
  return input.map((value, idx) => [`FY${2010 + idx}`, value])
}

describe('computeValuationBandSummary', () => {
  it('reports the selected window separately from the latest comparable year', () => {
    const rows: ValuationBandPoint[] = [['2018', null], ['2019', 10], ['2020', -2], ['2021', Infinity], ['2022', 20], ['2023', null]]
    const result = computeValuationBandSummary(rows, 'pe')
    expect(result.window).toEqual({ first: '2018', last: '2023' })
    expect(result.excluded).toEqual({ missing: 2, nonfinite: 1, nonpositive: 1 })
    expect(result.sampleCount).toBe(2)
    expect(result.latest?.fiscalYear).toBe('2022')
    expect(computeValuationBandSummary([], 'pe')).toMatchObject({ window: null, latest: null, sampleCount: 0, boundaries: null })
  })

  it('does not turn small but different ratios into artificial ties', () => {
    // h = .7, 1.75, 3.5, 5.25, 6.3 in this evenly spaced eight-point sample.
    const input = [1.001, 1.002, 1.003, 1.004, 1.005, 1.006, 1.007, 1.008]
    const result = computePercentiles(input)
    expect(result.p10).toBeCloseTo(1.0017, 12)
    expect(result.p25).toBeCloseTo(1.00275, 12)
    expect(result.p50).toBeCloseTo(1.0045, 12)
    expect(result.p75).toBeCloseTo(1.00625, 12)
    expect(result.p90).toBeCloseTo(1.0073, 12)
    expect(computeValuationBandSummary(points(input), 'pe').latest?.percentile).toBe(94)
  })

  it('refuses direct quantile calculation with invalid or nonpositive inputs', () => {
    for (const invalid of [NaN, Infinity, -Infinity, -1, 0]) {
      expect(() => computePercentiles([10, invalid])).toThrow('finite positive')
    }
    expect(() => computePercentiles([10])).toThrow('at least two')
  })

  it('calculates Hyndman–Fan type-7 percentiles for a hand-computed sample', () => {
    expect(computePercentiles([10, 20, 30, 40, 50])).toEqual({ p10: 14, p25: 20, p50: 30, p75: 40, p90: 46 })
  })

  it('ignores negatives, zero, and non-comparable values', () => {
    const input: ValuationBandPoint[] = [
      ['A', -1],
      ['B', 0],
      ['C', NaN],
      ['D', Infinity],
      ['E', 12],
      ['F', 8],
      ['G', null],
      ['H', 10],
    ]
    const summary = computeValuationBandSummary(input, 'pfcf')
    expect(summary.sampleCount).toBe(3)
    expect(summary.latest).toMatchObject({ fiscalYear: 'H', value: 10, percentile: 50 })
    expect(summary.boundaries).toBeNull()
  })

  it('does not mutate input rows', () => {
    const input: ValuationBandPoint[] = [
      ['2020', 12],
      ['2021', 14],
      ['2022', 16],
    ]
    const copy = input.map((row) => [...row] as ValuationBandPoint)
    computeValuationBandSummary(input, 'pe')
    expect(input).toEqual(copy)
  })

  it('requires at least eight comparable points before rendering bands', () => {
    const sparse = points([1, 2, 3, 4, 5, 6, 7])
    expect(computeValuationBandSummary(sparse, 'pe').boundaries).toBeNull()

    const exact = points([1, 2, 3, 4, 5, 6, 7, 8])
    expect(computeValuationBandSummary(exact, 'pe').boundaries).not.toBeNull()
  })

  it('uses midrank for duplicate values', () => {
    const input: ValuationBandPoint[] = [
      ['2020', 10],
      ['2021', 20],
      ['2022', 20],
      ['2023', 20],
      ['2024', 30],
    ]
    const summary = computeValuationBandSummary(input, 'pb')
    expect(summary.latest).toMatchObject({ fiscalYear: '2024', value: 30, percentile: 90 })
    expect(summary.boundaries).toBeNull()
  })

  it('finds the latest eligible point in selected order and returns its percentile rank', () => {
    const input: ValuationBandPoint[] = [
      ['2018', 12],
      ['2019', null],
      ['2020', -2],
      ['2021', 16],
      ['2022', 18],
      ['2023', 0],
      ['2024', 20],
    ]
    const summary = computeValuationBandSummary(input, 'ps')
    expect(summary.latest).toEqual({
      fiscalYear: '2024',
      value: 20,
      percentile: 88,
    })
  })
})

describe('buildValuationBandOption', () => {
  it('includes neutral labeled regions and a single median divider with tokenized colors', () => {
    const original = globalThis.getComputedStyle
    const originalDocument = globalThis.document
    globalThis.document = { documentElement: {} } as unknown as Document
    // Echo the requested CSS custom property so we can assert cssVar() actually
    // resolved the token (canvas ECharts can't render raw `var(--x)` strings).
    globalThis.getComputedStyle = (() =>
      ({ getPropertyValue: (name: string) => `resolved(${name})` }) as unknown as CSSStyleDeclaration) as unknown as typeof globalThis.getComputedStyle

    try {
      const input = points([10, 11, 12, 13, 14, 15, 16, 17, 18])
      const summary = computeValuationBandSummary(input, 'pe')
      const option = buildValuationBandOption(input, 'pe', summary)

      const series = (option.series as unknown as { [key: string]: unknown }[])?.[0] as Record<string, unknown>
      expect(series).toBeDefined()
      expect(series.name).toBe('Price / Earnings')
      expect(series.emphasis).toEqual(expect.objectContaining({ disabled: true }))
      expect(series.markArea).toBeDefined()
      expect((series.markArea as { data: unknown[] }).data).toHaveLength(5)

      const markLine = series.markLine as { data: { yAxis: number }[] }
      expect(markLine.data).toHaveLength(1)
      expect(markLine).toMatchObject({ data: [{ yAxis: summary.boundaries!.p50 }] })
      expect(markLine).toMatchObject({ lineStyle: expect.objectContaining({ type: 'dashed' }) })
      // Colors go through cssVar() (resolved), never raw `var(--x)` canvas can't parse.
      expect(series.lineStyle).toMatchObject({ color: 'resolved(--primary)' })
      const bands = (series.markArea as { data: [{ itemStyle: { color: string } }, unknown][] }).data
      expect(bands.map((b) => b[0].itemStyle.color)).toEqual([
        'resolved(--chart-1)',
        'resolved(--chart-2)',
        'resolved(--chart-3)',
        'resolved(--chart-4)',
        'resolved(--chart-5)',
      ])
    } finally {
      globalThis.document = originalDocument
      globalThis.getComputedStyle = original
    }
  })
})
