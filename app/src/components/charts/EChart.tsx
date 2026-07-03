import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

/** Resolve a CSS custom property from :root (e.g. chart token colors). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export const chartPalette = () => [
  cssVar('--chart-1'),
  cssVar('--chart-2'),
  cssVar('--chart-3'),
  cssVar('--chart-4'),
  cssVar('--chart-5'),
]

/** Shared Ledger Dark defaults merged into every chart option. */
export function baseOption(): echarts.EChartsCoreOption {
  const muted = cssVar('--muted-foreground')
  const border = 'rgba(255,255,255,0.07)'
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Inter Variable, sans-serif', fontSize: 14 },
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    xAxis: {
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
      axisLabel: { color: muted, fontSize: 14 },
      splitLine: { show: false },
    },
    yAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: muted, fontSize: 14 },
      splitLine: { lineStyle: { color: border } },
    },
    legend: {
      top: 0,
      left: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
      textStyle: { color: cssVar('--foreground'), fontSize: 14 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: cssVar('--surface-3'),
      borderColor: border,
      textStyle: { color: cssVar('--foreground'), fontSize: 15 },
      padding: [8, 12],
    },
  }
}

interface EChartProps {
  option: echarts.EChartsCoreOption
  /** Charts with the same group id share tooltips/zoom (linked x-axes). */
  group?: string
  className?: string
}

export function EChart({ option, group, className }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = echarts.init(el)
    chartRef.current = chart
    if (group) {
      chart.group = group
      echarts.connect(group)
    }
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [group])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={ref} className={className} />
}
