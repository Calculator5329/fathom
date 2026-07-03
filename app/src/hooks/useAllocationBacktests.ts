import { useEffect, useMemo, useRef, useState } from 'react'
import { assetClass, loadAssetClassData, toTickerSeries } from '@/data/assetClasses'
import { runBacktest } from '@/engine'
import type { AllocationSetup } from '@/lib/allocationState'
import type { NamedResult } from '@/components/charts/options'

type AssetData = Awaited<ReturnType<typeof loadAssetClassData>>

export interface AllocationOutput {
  runs: NamedResult[]
  effectiveStart: string | null
  effectiveEnd: string | null
  /** Asset whose late data start constrains the range, if data (not the user) set it. */
  limitingAsset: string | null
  loading: boolean
  error: string | null
}

export function useAllocationBacktests(setup: AllocationSetup): AllocationOutput {
  const [data, setData] = useState<AssetData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadAssetClassData()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  const current = useMemo<AllocationOutput>(() => {
    const empty: AllocationOutput = {
      runs: [],
      effectiveStart: null,
      effectiveEnd: null,
      limitingAsset: null,
      loading: !data && !error,
      error,
    }
    if (!data || error) return empty

    const valid = setup.portfolios.filter((p) => {
      const sum = p.allocations.reduce((s, a) => s + a.weight, 0)
      return p.allocations.length > 0 && Math.abs(sum - 100) < 1e-6
    })
    if (valid.length === 0) return empty

    try {
      const ids = [...new Set(valid.flatMap((p) => p.allocations.map((a) => a.ticker)))]
      const series = new Map(ids.map((id) => [id, toTickerSeries(id, data, setup.real)]))

      // Shared range across every asset in play, so comparisons line up.
      let inception = '0000-00-00'
      let limitingAsset: string | null = null
      for (const id of ids) {
        const first = series.get(id)!.records[0].date
        if (first > inception) {
          inception = first
          limitingAsset = id
        }
      }
      const userStart = setup.config.start
      const start = userStart && userStart > inception ? userStart : inception
      const config = { ...setup.config, start }

      const runs: NamedResult[] = valid.map((p) => ({
        label: p.name,
        result: runBacktest(p.allocations.map((a) => series.get(a.ticker)!), p, config),
      }))
      const dates = runs[0].result.dates
      return {
        runs,
        effectiveStart: dates[0],
        effectiveEnd: dates[dates.length - 1],
        limitingAsset: userStart && userStart > inception ? null : limitingAsset,
        loading: false,
        error: null,
      }
    } catch (err) {
      return { ...empty, loading: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [data, error, JSON.stringify(setup)]) // eslint-disable-line react-hooks/exhaustive-deps

  // Same stale-while-revalidate contract as the ticker hook: keep the last
  // good results mounted while a portfolio is mid-edit.
  const lastGood = useRef<AllocationOutput | null>(null)
  if (current.runs.length > 0) lastGood.current = current
  const hasAnyAllocations = setup.portfolios.some((p) => p.allocations.length > 0)
  if (current.runs.length === 0 && !current.error && hasAnyAllocations && lastGood.current) {
    return { ...lastGood.current, loading: current.loading }
  }
  if (!hasAnyAllocations) lastGood.current = null
  return current
}

export function limitingAssetLabel(id: string | null): string | null {
  return id ? (assetClass(id)?.label ?? id) : null
}
