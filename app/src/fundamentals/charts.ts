import type { EChartsCoreOption } from 'echarts'
import type { DailyRecord } from '@/engine'
import { baseOption, chartPalette, cssVar } from '@/components/charts/EChart'
import { formatUsd, formatUsdCompact } from '@/lib/format'
import type { FiscalYear, Quarter } from './load'

const quarterLabel = (q: Quarter) => `Q${q.fiscalQuarter} '${String(q.fiscalYear).slice(2)}`

// Major drawdown eras to shade on the long-run price chart.
const ERAS: Array<[string, string, string]> = [
  ['2000-03-01', '2002-10-01', 'Dot-com'],
  ['2007-10-01', '2009-03-01', 'GFC'],
  ['2020-02-15', '2020-04-01', 'COVID'],
  ['2022-01-01', '2022-10-01', '2022'],
]

const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`

/**
 * Long-run split-adjusted price with shaded market-crash eras. Takes the
 * pre-computed split-adjusted closes so the line is continuous (no split
 * cliffs) and ends at the actual current price.
 */
export function priceHistoryOption(
  records: DailyRecord[],
  adjustedCloses: number[],
  logScale: boolean,
): EChartsCoreOption {
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
        data: records.map((r, i) => [r.date, Math.round(adjustedCloses[i] * 100) / 100]),
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

/** A period (fiscal year or quarter) normalized for the income/margin charts. */
export interface PeriodRow {
  label: string
  revenue: number | null
  netIncome: number | null
  grossMargin: number | null
  operatingMargin: number | null
  netMargin: number | null
}

export function yearRows(years: FiscalYear[]): PeriodRow[] {
  return years.map((y) => ({
    label: String(y.year),
    revenue: y.revenue,
    netIncome: y.netIncome,
    grossMargin: y.grossMargin,
    operatingMargin: y.operatingMargin,
    netMargin: y.netMargin,
  }))
}

export function quarterRows(quarters: Quarter[]): PeriodRow[] {
  return quarters.map((q) => ({
    label: quarterLabel(q),
    revenue: q.revenue,
    netIncome: q.netIncome,
    grossMargin: q.grossMargin,
    operatingMargin: q.operatingMargin,
    netMargin: q.netMargin,
  }))
}

/** Revenue and net income by period (grouped bars). */
export function revenueIncomeOption(rows: PeriodRow[]): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()
  const labels = rows.map((r) => r.label)
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
        data: rows.map((r) => r.revenue),
        itemStyle: { color: palette[1], borderRadius: [3, 3, 0, 0] },
        emphasis: { disabled: true },
      },
      {
        name: 'Net income',
        type: 'bar',
        data: rows.map((r) => r.netIncome),
        itemStyle: { color: cssVar('--primary'), borderRadius: [3, 3, 0, 0] },
        emphasis: { disabled: true },
      },
    ],
  }
}

export type ValuationMetric = 'pe' | 'ps' | 'pfcf' | 'pocf' | 'pb'
export const VALUATION_LABELS: Record<ValuationMetric, string> = {
  pe: 'Price / Earnings',
  ps: 'Price / Sales',
  pfcf: 'Price / Free cash flow',
  pocf: 'Price / Operating cash flow',
  pb: 'Price / Book',
}

/**
 * A valuation ratio over time. Uses each fiscal year's contemporaneous
 * year-end price and as-reported figures, so the ratio is split-neutral
 * (both numerator and denominator are in that era's share basis).
 */
export function valuationOption(
  records: DailyRecord[],
  years: FiscalYear[],
  metric: ValuationMetric,
): EChartsCoreOption {
  const base = baseOption()
  // Last close of each calendar year, as the fiscal-year-end price proxy.
  const yearEndClose = new Map<number, number>()
  for (const r of records) yearEndClose.set(Number(r.date.slice(0, 4)), r.close)

  const ratio = (fy: FiscalYear): number | null => {
    const price = yearEndClose.get(fy.year)
    if (price == null) return null
    if (metric === 'pe') return fy.epsDiluted ? price / fy.epsDiluted : null
    if (!fy.sharesDiluted) return null
    const mktCap = price * fy.sharesDiluted
    if (metric === 'ps') return fy.revenue ? mktCap / fy.revenue : null
    if (metric === 'pfcf') return fy.fcf && fy.fcf > 0 ? mktCap / fy.fcf : null
    if (metric === 'pocf') return fy.operatingCashFlow && fy.operatingCashFlow > 0 ? mktCap / fy.operatingCashFlow : null
    return fy.stockholdersEquity && fy.stockholdersEquity > 0 ? mktCap / fy.stockholdersEquity : null
  }

  const data = years.map((fy) => {
    const v = ratio(fy)
    return [String(fy.year), v == null ? null : Math.round(v * 10) / 10]
  })
  const vals = data.map((d) => d[1]).filter((v): v is number => v != null)
  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0

  return {
    ...base,
    xAxis: { ...(base.xAxis as object), type: 'category', data: years.map((y) => String(y.year)) },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      scale: true,
      axisLabel: { ...(base.yAxis as { axisLabel: object }).axisLabel, formatter: '{value}×' },
    },
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: unknown) => (v == null ? '—' : `${(v as number).toFixed(1)}×`),
    },
    legend: { show: false },
    series: [
      {
        name: VALUATION_LABELS[metric],
        type: 'line',
        showSymbol: false,
        connectNulls: true,
        data,
        lineStyle: { width: 2, color: cssVar('--primary') },
        itemStyle: { color: cssVar('--primary') },
        areaStyle: { color: cssVar('--primary'), opacity: 0.08 },
        emphasis: { disabled: true },
        // Average line for context ("cheap vs its own history").
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: cssVar('--muted-foreground'), type: 'dashed', width: 1 },
          label: { color: cssVar('--muted-foreground'), fontSize: 12, formatter: `avg ${avg.toFixed(1)}×` },
          data: [{ yAxis: Math.round(avg * 10) / 10 }],
        },
      },
    ],
  }
}

/** Gross / operating / net margin trends by period. */
export function marginsOption(rows: PeriodRow[]): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()
  const labels = rows.map((r) => r.label)
  const line = (name: string, key: 'grossMargin' | 'operatingMargin' | 'netMargin', color: string) => ({
    name,
    type: 'line' as const,
    showSymbol: false,
    data: rows.map((r) => (r[key] == null ? null : Math.round((r[key] as number) * 1000) / 1000)),
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

/**
 * Balance sheet over time. Simple mode: assets / liabilities / equity.
 * Advanced adds cash, current assets/liabilities, long-term debt, inventory.
 */
export function balanceSheetOption(years: FiscalYear[], advanced: boolean): EChartsCoreOption {
  const base = baseOption()
  const palette = chartPalette()
  const labels = years.map((y) => String(y.year))

  const bar = (name: string, key: keyof FiscalYear, color: string, stack?: string) => ({
    name,
    type: 'bar' as const,
    stack,
    data: years.map((y) => y[key] as number | null),
    itemStyle: { color, borderRadius: stack ? [0, 0, 0, 0] : ([3, 3, 0, 0] as number[]) },
    emphasis: { disabled: true },
    barMaxWidth: 40,
  })

  const simple = [
    bar('Total assets', 'totalAssets', palette[1]),
    bar('Total liabilities', 'totalLiabilities', cssVar('--loss')),
    bar('Equity', 'stockholdersEquity', cssVar('--primary')),
  ]
  const advancedSeries = [
    bar('Cash', 'cashAndEquivalents', palette[1], 'assets'),
    bar('Other current assets', 'currentAssets', palette[2], 'assets'),
    bar('Current liabilities', 'currentLiabilities', palette[4], 'liabilities'),
    bar('Long-term debt', 'longTermDebt', cssVar('--loss'), 'liabilities'),
    bar('Equity', 'stockholdersEquity', cssVar('--primary')),
  ]

  return {
    ...base,
    color: palette,
    xAxis: { ...(base.xAxis as object), type: 'category', data: labels },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      axisLabel: { ...(base.yAxis as { axisLabel: object }).axisLabel, formatter: (v: number) => formatUsdCompact(v) },
    },
    tooltip: {
      ...(base.tooltip as object),
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: unknown) => (v == null ? '—' : formatUsdCompact(v as number)),
    },
    legend: { ...(base.legend as object) },
    series: advanced ? advancedSeries : simple,
  }
}
