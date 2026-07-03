import type { EChartsCoreOption } from 'echarts'
import { baseOption, cssVar } from '@/components/charts/EChart'
import { formatUsd } from '@/lib/format'
import { pricePath, projectScenario, SCENARIO_KEYS, type ProjectionInputs } from './model'
import type { Projection } from './model'

// Bear = loss red, Base = accent, Bull = a brighter green-blue.
const scenarioColor = () => ({
  bear: cssVar('--loss'),
  base: cssVar('--chart-2'),
  bull: cssVar('--primary'),
})

/** Implied-price fan: one line per scenario from today to the horizon. */
export function projectionChartOption(
  inputs: ProjectionInputs,
  scenarios: Projection['scenarios'],
): EChartsCoreOption {
  const base = baseOption()
  const colors = scenarioColor()
  const thisYear = new Date().getFullYear()

  return {
    ...base,
    xAxis: {
      ...(base.xAxis as object),
      type: 'category',
      data: Array.from({ length: inputs.horizonYears + 1 }, (_, i) => String(thisYear + i)),
      boundaryGap: false,
    },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      scale: true,
      axisLabel: {
        ...(base.yAxis as { axisLabel: object }).axisLabel,
        formatter: (v: number) => formatUsd(v),
      },
    },
    tooltip: {
      ...(base.tooltip as object),
      valueFormatter: (v: unknown) => formatUsd(v as number),
    },
    legend: {
      ...(base.legend as object),
      data: ['Bull', 'Base', 'Bear'],
    },
    series: SCENARIO_KEYS.map((k) => ({
      name: k[0].toUpperCase() + k.slice(1),
      type: 'line',
      showSymbol: false,
      data: pricePath(inputs, scenarios[k]).map((p) => Math.round(p.price * 100) / 100),
      lineStyle: { width: k === 'base' ? 2.5 : 1.75, color: colors[k] },
      itemStyle: { color: colors[k] },
      emphasis: { disabled: true },
    })),
  }
}

/** Base-case total CAGR for list sorting/ranking. */
export function baseCagr(p: Projection): number {
  return projectScenario(p.inputs, p.scenarios.base).totalCagr
}
