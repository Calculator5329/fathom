import { describe, expect, it } from 'vitest'
import { buildValuationBandOption, computePercentiles, computeValuationBandSummary, type ValuationBandPoint } from '../valuationBands'

function points(input: number[]): ValuationBandPoint[] {
  return input.map((value, idx) => [`FY${2010 + idx}`, value])
}

describe('computeValuationBandSummary', () => {
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
    globalThis.getComputedStyle = (() =>
      ({ getPropertyValue: () => '' }) as unknown as CSSStyleDeclaration) as unknown as typeof globalThis.getComputedStyle

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
      expect(series.lineStyle).toMatchObject({ color: 'var(--primary)' })
    } finally {
      globalThis.document = originalDocument
      globalThis.getComputedStyle = original
    }
  })
})
