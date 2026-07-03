import type { EChartsCoreOption } from 'echarts'
import type { BacktestResult } from '@/engine'
import { baseOption, chartPalette, cssVar } from './EChart'

const fmtUsd = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

export interface NamedResult {
  label: string
  result: BacktestResult
  /** Benchmark renders as a dashed muted line rather than a solid series. */
  isBenchmark?: boolean
}

/** Growth of the initial investment (TWR-scaled), optional log axis. */
export function growthOption(runs: NamedResult[], logScale: boolean): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()
  const initial = runs[0].result.values[0]

  return {
    ...base,
    color: palette,
    xAxis: { ...(base.xAxis as object), type: 'time', boundaryGap: false },
    yAxis: {
      ...(base.yAxis as object),
      type: logScale ? 'log' : 'value',
      logBase: 10,
      axisLabel: {
        ...(base.yAxis as { axisLabel: object }).axisLabel,
        formatter: (v: number) => fmtUsd(v),
      },
      scale: true,
    },
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: unknown) => fmtUsd(v as number),
    },
    series: runs.map((r, i) => ({
      name: r.label,
      type: 'line',
      showSymbol: false,
      sampling: 'lttb',
      data: r.result.twrIndex.map((x, t) => [
        r.result.dates[t],
        Math.round(x * initial * 100) / 100,
      ]),
      lineStyle: r.isBenchmark
        ? { width: 1.5, type: 'dashed', color: cssVar('--muted-foreground') }
        : { width: 2 },
      itemStyle: r.isBenchmark ? { color: cssVar('--muted-foreground') } : { color: palette[i] },
      emphasis: { disabled: true },
    })),
  }
}

/** Drawdown-from-peak area chart; shares its x-axis group with the growth chart. */
export function drawdownOption(runs: NamedResult[]): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()
  const loss = cssVar('--loss')

  const drawdownSeries = (dates: string[], twr: number[]): Array<[string, number]> => {
    let peak = twr[0]
    return twr.map((v, t) => {
      if (v > peak) peak = v
      return [dates[t], Math.round((v / peak - 1) * 10000) / 100] // percent, 2dp
    })
  }

  return {
    ...base,
    color: palette,
    legend: { show: false },
    xAxis: { ...(base.xAxis as object), type: 'time', boundaryGap: false },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      max: 0,
      axisLabel: {
        ...(base.yAxis as { axisLabel: object }).axisLabel,
        formatter: (v: number) => `${v}%`,
      },
    },
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: unknown) => `${(v as number).toFixed(1)}%`,
    },
    series: runs
      .filter((r) => !r.isBenchmark)
      .map((r, i) => ({
        name: r.label,
        type: 'line',
        showSymbol: false,
        sampling: 'lttb',
        data: drawdownSeries(r.result.dates, r.result.twrIndex),
        lineStyle: { width: 1.5, color: i === 0 ? loss : palette[i] },
        itemStyle: { color: i === 0 ? loss : palette[i] },
        areaStyle: i === 0 ? { color: loss, opacity: 0.12 } : { opacity: 0.06 },
        emphasis: { disabled: true },
      })),
  }
}

/** Grouped annual-return bars per portfolio. */
export function annualReturnsOption(runs: NamedResult[]): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()
  const years = [
    ...new Set(runs.flatMap((r) => r.result.metrics.annualReturns.map((y) => y.year))),
  ].sort()

  return {
    ...base,
    color: palette,
    xAxis: { ...(base.xAxis as object), type: 'category', data: years.map(String) },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      axisLabel: {
        ...(base.yAxis as { axisLabel: object }).axisLabel,
        formatter: (v: number) => fmtPct(v),
      },
    },
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: unknown) => (v == null ? '—' : fmtPct(v as number)),
    },
    series: runs.map((r, i) => {
      const byYear = new Map(r.result.metrics.annualReturns.map((y) => [y.year, y.return]))
      return {
        name: r.label,
        type: 'bar',
        barMaxWidth: 26,
        data: years.map((y) => byYear.get(y) ?? null),
        itemStyle: {
          color: r.isBenchmark ? cssVar('--muted-foreground') : palette[i],
          borderRadius: [3, 3, 0, 0],
        },
      }
    }),
  }
}
