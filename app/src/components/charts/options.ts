import type { EChartsCoreOption } from 'echarts'
import { annualIncome, rollingReturns, type BacktestResult } from '@/engine'
import { formatPct, formatUsd, formatUsdCompact } from '@/lib/format'
import { baseOption, chartPalette, cssVar } from './EChart'

const fmtPct = (v: number) => formatPct(v)

export interface NamedResult {
  label: string
  result: BacktestResult
  /** Benchmark renders as a dashed muted line rather than a solid series. */
  isBenchmark?: boolean
}

/** Actual portfolio value over time — includes contributions/withdrawals. */
export function growthOption(runs: NamedResult[], logScale: boolean): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()

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
        formatter: (v: number) => formatUsdCompact(v),
      },
      scale: true,
    },
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: unknown) => formatUsd(v as number),
    },
    series: runs.map((r, i) => ({
      name: r.label,
      type: 'line',
      showSymbol: false,
      sampling: 'lttb',
      data: r.result.values.map((v, t) => [r.result.dates[t], Math.round(v * 100) / 100]),
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

/** Rolling annualized returns for a trailing window, one point per month-end. */
export function rollingOption(runs: NamedResult[], windowYears: number): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()

  return {
    ...base,
    color: palette,
    xAxis: { ...(base.xAxis as object), type: 'time', boundaryGap: false },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      scale: true,
      axisLabel: {
        ...(base.yAxis as { axisLabel: object }).axisLabel,
        formatter: (v: number) => fmtPct(v),
      },
    },
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: unknown) => fmtPct(v as number),
    },
    series: runs.map((r, i) => ({
      name: r.label,
      type: 'line',
      showSymbol: false,
      data: rollingReturns(r.result.dates, r.result.twrIndex, windowYears).map((p) => [
        p.date,
        Math.round(p.value * 10000) / 10000,
      ]),
      lineStyle: r.isBenchmark
        ? { width: 1.5, type: 'dashed', color: cssVar('--muted-foreground') }
        : { width: 2 },
      itemStyle: r.isBenchmark ? { color: cssVar('--muted-foreground') } : { color: palette[i] },
      emphasis: { disabled: true },
    })),
  }
}

/** Dividend income received per calendar year, grouped bars per portfolio. */
export function incomeOption(runs: NamedResult[]): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()
  const perRun = runs.map((r) => annualIncome(r.result.dates, r.result.dividendIncome))
  const years = [...new Set(perRun.flatMap((list) => list.map((y) => y.year)))].sort()

  return {
    ...base,
    color: palette,
    xAxis: { ...(base.xAxis as object), type: 'category', data: years.map(String) },
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
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: unknown) => (v == null ? '—' : formatUsd(v as number)),
    },
    series: runs.map((r, i) => {
      const byYear = new Map(perRun[i].map((y) => [y.year, Math.round(y.income)]))
      return {
        name: r.label,
        type: 'bar',
        barMaxWidth: 26,
        data: years.map((y) => byYear.get(y) ?? null),
        itemStyle: {
          color: r.isBenchmark ? cssVar('--muted-foreground') : palette[i],
          borderRadius: [3, 3, 0, 0],
        },
        // Hover emphasis restyles bars unpredictably on the dark theme
        // (observed: hovered bar vanishing) — the shadow pointer is enough.
        emphasis: { disabled: true },
      }
    }),
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
      axisPointer: { type: 'shadow' },
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
        emphasis: { disabled: true },
      }
    }),
  }
}
