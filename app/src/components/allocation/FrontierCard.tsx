import { useEffect, useMemo, useState } from 'react'
import { EChart, baseOption, cssVar } from '@/components/charts/EChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { assetClass, loadAssetClassData, toTickerSeries } from '@/data/assetClasses'
import {
  maxSharpeIndex,
  minVarianceIndex,
  twoAssetFrontier,
  type FrontierPoint,
} from '@/engine'
import type { AllocationSetup } from '@/lib/allocationState'

/**
 * The classic two-asset efficient frontier, drawn from the REAL backtest
 * engine (not mean/covariance shortcuts) so every point matches the rest of
 * the tool. Shows only for a portfolio of exactly two asset classes — the
 * one case where the whole curve is enumerable and there's no optimizer to
 * trust. Marks the minimum-variance and maximum-Sharpe mixes, and where the
 * user's current allocation sits.
 */
export function FrontierCard({
  setup,
  start,
  end,
}: {
  setup: AllocationSetup
  start: string | null
  end: string | null
}) {
  const pair = useMemo(() => {
    const valid = setup.portfolios.find((p) => {
      const sum = p.allocations.reduce((s, a) => s + a.weight, 0)
      return p.allocations.length === 2 && Math.abs(sum - 100) < 1e-6
    })
    return valid ? valid.allocations : null
  }, [setup])

  const [points, setPoints] = useState<FrontierPoint[] | null>(null)

  useEffect(() => {
    if (!pair) {
      setPoints(null)
      return
    }
    let cancelled = false
    loadAssetClassData()
      .then((data) => {
        if (cancelled) return
        const a = toTickerSeries(pair[0].ticker, data, setup.real)
        const b = toTickerSeries(pair[1].ticker, data, setup.real)
        setPoints(
          twoAssetFrontier(a, b, {
            initialAmount: 10_000,
            monthlyContribution: 0,
            rebalance: 'annual',
            reinvestDividends: true,
            start: start ?? undefined,
            end: end ?? undefined,
          }),
        )
      })
      .catch(() => setPoints(null))
    return () => {
      cancelled = true
    }
  }, [pair, setup.real, start, end])

  const option = useMemo(() => {
    if (!points || !pair) return null
    const base = baseOption()
    const mv = minVarianceIndex(points)
    const ms = maxSharpeIndex(points)
    const currentA = pair[0].weight // user's weight in asset A
    // Nearest frontier point to the user's mix.
    let cur = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].weightA - currentA) < Math.abs(points[cur].weightA - currentA)) cur = i
    }
    const labelA = assetClass(pair[0].ticker)?.label ?? pair[0].ticker
    const labelB = assetClass(pair[1].ticker)?.label ?? pair[1].ticker
    const xy = (p: FrontierPoint) => [
      Math.round(p.volatility * 1000) / 10,
      Math.round(p.cagr * 1000) / 10,
    ]
    const mark = (i: number, color: string, name: string) => ({
      name,
      type: 'scatter' as const,
      symbolSize: 12,
      data: [xy(points[i])],
      itemStyle: { color: cssVar(color) },
      emphasis: { disabled: true },
      z: 5,
    })

    return {
      ...base,
      grid: { left: 56, right: 24, top: 16, bottom: 44 },
      xAxis: {
        ...(base.xAxis as object),
        type: 'value' as const,
        name: 'Risk (volatility)',
        nameLocation: 'middle' as const,
        nameGap: 28,
        axisLabel: { ...(base.xAxis as { axisLabel: object }).axisLabel, formatter: '{value}%' },
      },
      yAxis: {
        ...(base.yAxis as object),
        type: 'value' as const,
        scale: true,
        name: 'Return (CAGR)',
        axisLabel: { ...(base.yAxis as { axisLabel: object }).axisLabel, formatter: '{value}%' },
      },
      tooltip: {
        ...(base.tooltip as object),
        formatter: (p: { data: [number, number]; seriesName: string }) =>
          `${p.seriesName}<br/>${p.data[1]}% return · ${p.data[0]}% risk`,
      },
      legend: { show: false },
      series: [
        {
          name: `${labelA} / ${labelB} frontier`,
          type: 'line' as const,
          smooth: true,
          showSymbol: false,
          data: points.map(xy),
          lineStyle: { width: 2, color: cssVar('--muted-foreground') },
          emphasis: { disabled: true },
        },
        mark(mv, '--chart-3', 'Minimum risk'),
        mark(ms, '--primary', 'Best risk-adjusted (max Sharpe)'),
        {
          name: 'Your mix',
          type: 'scatter' as const,
          symbol: 'diamond',
          symbolSize: 13,
          data: [xy(points[cur])],
          itemStyle: { color: cssVar('--foreground') },
          emphasis: { disabled: true },
          z: 6,
        },
      ],
    }
  }, [points, pair])

  const summary = useMemo(() => {
    if (!points || !pair) return null
    const ms = points[maxSharpeIndex(points)]
    const labelA = assetClass(pair[0].ticker)?.label ?? pair[0].ticker
    const labelB = assetClass(pair[1].ticker)?.label ?? pair[1].ticker
    return `Best risk-adjusted mix over this window: ${Math.round(ms.weightA)}% ${labelA} / ${Math.round(100 - ms.weightA)}% ${labelB}.`
  }, [points, pair])

  if (!pair) return null // frontier only meaningful for a 2-asset mix

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">
          Efficient frontier
          <span className="ml-2 font-normal text-muted-foreground">
            every mix of your two assets, risk vs return
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {option ? (
          <>
            <EChart option={option} exportName="fathom-frontier" className="h-72 w-full" />
            {summary && <p className="mt-2 text-sm text-muted-foreground tnum">{summary}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Computing frontier&hellip;</p>
        )}
      </CardContent>
    </Card>
  )
}
