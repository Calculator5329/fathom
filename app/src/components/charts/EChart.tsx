import { useEffect, useRef } from 'react'
import { Download } from 'lucide-react'
// Tree-shaken ECharts: register only what Fathom actually renders. Importing
// the full 'echarts' bundle costs ~700KB extra minified — don't regress this.
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
])

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
    // Snap to new data instead of morphing. Editing a portfolio swaps the
    // series for a different-length dataset; the default update animation
    // interpolates old→new point-by-point on the time axis and briefly
    // renders wild spikes. Keep the first-render appear animation only.
    animationDurationUpdate: 0,
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
  /** When set, a hover-revealed button downloads the chart as a PNG named this. */
  exportName?: string
}

export function EChart({ option, group, className, exportName }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.EChartsType | null>(null)

  const exportPng = () => {
    const chart = chartRef.current
    if (!chart) return
    const url = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: cssVar('--background'),
    })
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportName}.png`
    a.click()
  }

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

  if (!exportName) return <div ref={ref} className={className} />

  return (
    <div className="group/chart relative">
      <div ref={ref} className={className} />
      <button
        type="button"
        aria-label="Download chart as PNG"
        onClick={exportPng}
        className="absolute top-0 right-0 rounded-md border bg-surface-2 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/chart:opacity-100"
      >
        <Download className="size-4" />
      </button>
    </div>
  )
}
