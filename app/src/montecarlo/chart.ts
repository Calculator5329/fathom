import type { EChartsCoreOption } from 'echarts'
import { baseOption, cssVar } from '@/components/charts/EChart'
import { formatUsdCompact } from '@/lib/format'
import type { SimResult } from './simulate'

/**
 * Percentile fan of portfolio balance over the horizon. Median is a solid
 * accent line; the 25–75 and 5–95 bands are translucent fills.
 */
export function fanChartOption(result: SimResult): EChartsCoreOption {
  const base = baseOption()
  const accent = cssVar('--primary')
  const totalYears = result.accumulationYears + result.horizonYears
  const years = Array.from({ length: totalYears + 1 }, (_, i) => String(i))
  const { p5, p25, p50, p75, p95 } = result.percentiles

  // Stacked-area trick for bands: base (invisible) + delta (filled).
  const bandSeries = (lower: number[], upper: number[], opacity: number, name: string) => [
    {
      name: `${name}-base`,
      type: 'line' as const,
      data: lower,
      stack: name,
      lineStyle: { opacity: 0 },
      showSymbol: false,
      silent: true,
      emphasis: { disabled: true },
    },
    {
      name,
      type: 'line' as const,
      data: upper.map((u, i) => u - lower[i]),
      stack: name,
      lineStyle: { opacity: 0 },
      areaStyle: { color: accent, opacity },
      showSymbol: false,
      silent: true,
      emphasis: { disabled: true },
    },
  ]

  return {
    ...base,
    xAxis: { ...(base.xAxis as object), type: 'category', data: years, boundaryGap: false, name: 'Year' },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      axisLabel: {
        ...(base.yAxis as { axisLabel: object }).axisLabel,
        formatter: (v: number) => formatUsdCompact(v),
      },
    },
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: unknown) => formatUsdCompact(v as number),
    },
    legend: { show: false },
    series: [
      ...bandSeries(p5, p95, 0.08, '5–95'),
      ...bandSeries(p25, p75, 0.16, '25–75'),
      {
        name: 'Median',
        type: 'line',
        data: p50,
        lineStyle: { width: 2.5, color: accent },
        itemStyle: { color: accent },
        showSymbol: false,
        emphasis: { disabled: true },
        // Shade the saving years and mark retirement.
        ...(result.accumulationYears > 0
          ? {
              markArea: {
                silent: true,
                itemStyle: { color: cssVar('--chart-2'), opacity: 0.05 },
                label: { color: cssVar('--muted-foreground'), fontSize: 12, position: 'insideTop' },
                data: [[{ name: 'saving', xAxis: '0' }, { xAxis: String(result.accumulationYears) }]],
              },
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { color: cssVar('--muted-foreground'), type: 'dashed', width: 1 },
                label: { color: cssVar('--muted-foreground'), fontSize: 12, formatter: 'retire' },
                data: [{ xAxis: String(result.accumulationYears) }],
              },
            }
          : {}),
      },
    ],
  }
}

/** Histogram of ending balances (today's dollars). */
export function endingHistogramOption(result: SimResult): EChartsCoreOption {
  const base = baseOption()
  const vals = result.endingBalances
  const max = vals[vals.length - 1] || 1
  const bins = 24
  const width = max / bins
  const counts = new Array<number>(bins).fill(0)
  for (const v of vals) {
    const i = Math.min(bins - 1, Math.floor(v / width))
    counts[i]++
  }
  const labels = counts.map((_, i) => formatUsdCompact(i * width))

  return {
    ...base,
    xAxis: {
      ...(base.xAxis as object),
      type: 'category',
      data: labels,
      axisLabel: { ...(base.xAxis as { axisLabel: object }).axisLabel, interval: 3 },
    },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      axisLabel: { ...(base.yAxis as { axisLabel: object }).axisLabel, formatter: '{value}' },
    },
    tooltip: { ...(base.tooltip as object), axisPointer: { type: 'shadow' } },
    legend: { show: false },
    series: [
      {
        type: 'bar',
        data: counts,
        itemStyle: { color: cssVar('--chart-2'), borderRadius: [2, 2, 0, 0] },
        emphasis: { disabled: true },
        barCategoryGap: '10%',
      },
    ],
  }
}
