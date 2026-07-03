import type { EChartsCoreOption } from 'echarts'
import type { DailyRecord } from '@/engine'
import { baseOption, chartPalette, cssVar } from '@/components/charts/EChart'
import { formatUsd, formatUsdCompact } from '@/lib/format'
import type { FiscalYear } from './load'

// Major drawdown eras to shade on the long-run price chart.
const ERAS: Array<[string, string, string]> = [
  ['2000-03-01', '2002-10-01', 'Dot-com'],
  ['2007-10-01', '2009-03-01', 'GFC'],
  ['2020-02-15', '2020-04-01', 'COVID'],
  ['2022-01-01', '2022-10-01', '2022'],
]

const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`

/** Long-run actual price (close) with shaded market-crash eras. */
export function priceHistoryOption(records: DailyRecord[], logScale: boolean): EChartsCoreOption {
  const base = baseOption()
  const first = records[0]?.date
  const last = records[records.length - 1]?.date
  const eras = ERAS.filter(([s, e]) => e >= (first ?? '') && s <= (last ?? ''))

  return {
    ...base,
    xAxis: { ...(base.xAxis as object), type: 'time', boundaryGap: false },
    yAxis: {
      ...(base.yAxis as object),
      type: logScale ? 'log' : 'value',
      scale: true,
      axisLabel: {
        ...(base.yAxis as { axisLabel: object }).axisLabel,
        formatter: (v: number) => formatUsdCompact(v),
      },
    },
    tooltip: { ...(base.tooltip as object), valueFormatter: (v: unknown) => formatUsd(v as number) },
    legend: { show: false },
    series: [
      {
        name: 'Price',
        type: 'line',
        showSymbol: false,
        sampling: 'lttb',
        data: records.map((r) => [r.date, Math.round(r.close * 100) / 100]),
        lineStyle: { width: 1.75, color: cssVar('--primary') },
        itemStyle: { color: cssVar('--primary') },
        emphasis: { disabled: true },
        markArea: {
          silent: true,
          itemStyle: { color: cssVar('--loss'), opacity: 0.07 },
          label: { color: cssVar('--muted-foreground'), fontSize: 12, position: 'top' },
          data: eras.map(([s, e, label]) => [{ name: label, xAxis: s }, { xAxis: e }]),
        },
      },
    ],
  }
}

/** Revenue and net income by fiscal year (grouped bars). */
export function revenueIncomeOption(years: FiscalYear[]): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()
  const labels = years.map((y) => String(y.year))
  return {
    ...base,
    color: palette,
    xAxis: { ...(base.xAxis as object), type: 'category', data: labels },
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
      valueFormatter: (v: unknown) => (v == null ? '—' : formatUsdCompact(v as number)),
    },
    legend: { ...(base.legend as object), data: ['Revenue', 'Net income'] },
    series: [
      {
        name: 'Revenue',
        type: 'bar',
        data: years.map((y) => y.revenue),
        itemStyle: { color: palette[1], borderRadius: [3, 3, 0, 0] },
        emphasis: { disabled: true },
      },
      {
        name: 'Net income',
        type: 'bar',
        data: years.map((y) => y.netIncome),
        itemStyle: { color: cssVar('--primary'), borderRadius: [3, 3, 0, 0] },
        emphasis: { disabled: true },
      },
    ],
  }
}

/** Gross / operating / net margin trends. */
export function marginsOption(years: FiscalYear[]): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()
  const labels = years.map((y) => String(y.year))
  const line = (name: string, key: keyof FiscalYear, color: string) => ({
    name,
    type: 'line' as const,
    showSymbol: false,
    data: years.map((y) => (y[key] == null ? null : Math.round((y[key] as number) * 1000) / 1000)),
    lineStyle: { width: 2, color },
    itemStyle: { color },
    emphasis: { disabled: true },
    connectNulls: true,
  })
  return {
    ...base,
    xAxis: { ...(base.xAxis as object), type: 'category', data: labels },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      axisLabel: { ...(base.yAxis as { axisLabel: object }).axisLabel, formatter: (v: number) => fmtPct(v) },
    },
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: unknown) => (v == null ? '—' : fmtPct(v as number)),
    },
    legend: { ...(base.legend as object), data: ['Gross', 'Operating', 'Net'] },
    series: [
      line('Gross', 'grossMargin', palette[2]),
      line('Operating', 'operatingMargin', palette[1]),
      line('Net', 'netMargin', cssVar('--primary')),
    ],
  }
}
