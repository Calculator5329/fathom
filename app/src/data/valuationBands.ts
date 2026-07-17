import type { EChartsCoreOption } from 'echarts'
import { VALUATION_LABELS, type ValuationMetric } from '@/fundamentals/charts'
import { baseOption } from '@/components/charts/EChart'

export type ValuationBandPoint = [string, number | null]

export interface ValuationBandSummary {
  metric: ValuationMetric
  sampleCount: number
  latest: { fiscalYear: string; value: number; percentile: number } | null
  boundaries: ValuationBandBoundaries | null
}

const BAND_LABELS = [
  'lower tail',
  'lower quartile',
  'central 50%',
  'upper quartile',
  'upper tail',
] as const

function isComparable(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v > 0
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const h = (n - 1) * p
  const i = Math.floor(h)
  const j = Math.ceil(h)
  if (i === j) return sorted[i]
  return sorted[i] + (sorted[j] - sorted[i]) * (h - i)
}

function midrankPercentile(values: number[], target: number): number {
  let less = 0
  let equal = 0

  for (const value of values) {
    if (value < target) less += 1
    if (value === target) equal += 1
  }

  return ((less + 0.5 * equal) / values.length) * 100
}

export interface ValuationBandBoundaries {
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export function computePercentiles(values: readonly number[]): ValuationBandBoundaries {
  if (values.length < 2) {
    throw new Error('Percentile requires at least two comparable values')
  }

  const sorted = [...values].sort((a, b) => a - b)
  return {
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
  }
}

export function computeValuationBandSummary(rows: readonly ValuationBandPoint[], metric: ValuationMetric): ValuationBandSummary {
  const eligible = rows
    .map(([, value]) => value)
    .filter((v): v is number => isComparable(v))

  const sampleCount = eligible.length
  const latest: ValuationBandSummary['latest'] = (() => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i]
      if (isComparable(row[1])) {
        return {
          fiscalYear: row[0],
          value: row[1],
          percentile: Math.round(midrankPercentile(eligible, row[1])),
        }
      }
    }
    return null
  })()

  const boundaries = sampleCount >= 8
    ? computePercentiles(eligible)
    : null

  return {
    metric,
    sampleCount,
    latest,
    boundaries,
  }
}

function percentileRanks(values: readonly number[]) {
  return (value: number) => Math.round(midrankPercentile([...values], value))
}

export function buildValuationBandOption(
  rows: readonly ValuationBandPoint[],
  metric: ValuationMetric,
  summary: ValuationBandSummary,
): EChartsCoreOption {
  const base = baseOption()
  const years = rows.map(([year]) => year)
  const values = rows.map(([, value]) => value).filter(isComparable)
  const minY = values.length ? Math.min(...values) : 0
  const maxY = values.length ? Math.max(...values) : 0
  const getPercentile = percentileRanks(values)
  const boundaries = summary.boundaries

  const bandRanges =
    boundaries == null
      ? []
      : [
          [{ name: BAND_LABELS[0], yAxis: minY }, { yAxis: boundaries.p10 }],
          [{ name: BAND_LABELS[1], yAxis: boundaries.p10 }, { yAxis: boundaries.p25 }],
          [{ name: BAND_LABELS[2], yAxis: boundaries.p25 }, { yAxis: boundaries.p75 }],
          [{ name: BAND_LABELS[3], yAxis: boundaries.p75 }, { yAxis: boundaries.p90 }],
          [{ name: BAND_LABELS[4], yAxis: boundaries.p90 }, { yAxis: maxY }],
        ]

  return {
    ...base,
    xAxis: { ...(base.xAxis as object), type: 'category', data: years },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      scale: true,
      axisLabel: { ...(base.yAxis as { axisLabel: object }).axisLabel, formatter: '{value}×' },
    },
    tooltip: {
      ...(base.tooltip as object),
      axisPointer: { type: 'line' },
      trigger: 'axis',
      formatter: (params: unknown) => {
        const candidate = Array.isArray(params) ? params[0] : null
        const index = candidate?.dataIndex ?? -1
        const point = rows[index]
        if (!point) return ''
        const [fiscalYear, value] = point
        if (!isComparable(value)) {
          return `${fiscalYear}<br/>${VALUATION_LABELS[metric]}<br/>not comparable<br/>Sample size: ${summary.sampleCount}`
        }
        return `${fiscalYear}<br/>${VALUATION_LABELS[metric]}: ${value.toFixed(1)}×<br/>percentile rank: ${getPercentile(value)}th<br/>Sample size: ${summary.sampleCount}`
      },
    },
    legend: { show: false },
    series: [
      {
        name: VALUATION_LABELS[metric],
        type: 'line',
        showSymbol: false,
        connectNulls: true,
        data: rows,
        lineStyle: { width: 2, color: 'var(--primary)' },
        itemStyle: { color: 'var(--primary)' },
        areaStyle: { color: 'var(--primary)', opacity: 0.08 },
        emphasis: { disabled: true },
        markArea:
          bandRanges.length === 0
            ? undefined
            : {
                silent: true,
                data: bandRanges.map((range, index) => {
                  const colorIndex = Math.min(1 + index, 4)
                  return [
                    {
                      ...range[0],
                      itemStyle: { color: `var(--chart-${colorIndex})`, opacity: 0.08 },
                      label: {
                        show: true,
                        color: 'var(--muted-foreground)',
                        fontSize: 12,
                        formatter: '{b}',
                        position: 'inside',
                      },
                    },
                    { ...range[1], label: { show: false } },
                  ]
                }),
              },
        ...(boundaries == null
          ? {}
          : {
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { color: 'var(--muted-foreground)', type: 'dashed', width: 1 },
                label: {
                  color: 'var(--muted-foreground)',
                  fontSize: 12,
                  position: 'insideEndTop',
                  formatter: `P50 ${boundaries.p50.toFixed(1)}×`,
                },
                data: [{ yAxis: boundaries.p50 }],
              },
            }),
      },
    ],
  }
}
