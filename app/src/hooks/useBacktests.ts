import { useEffect, useMemo, useRef, useState } from 'react'
import { loadManySeries } from '@/data/catalog'
import { loadFactors, type FactorData } from '@/data/factors'
import { runBacktest, type TickerSeries } from '@/engine'
import type { BacktestSetup } from '@/lib/urlState'
import type { NamedResult } from '@/components/charts/options'

export interface BacktestOutput {
  /** One entry per portfolio, plus the benchmark last (isBenchmark: true). */
  runs: NamedResult[]
  /** Effective shared range after clamping to the shortest history. */
  effectiveStart: string | null
  effectiveEnd: string | null
  /** Ticker whose late inception constrains the start date, if any. */
  limitingTicker: string | null
  loading: boolean
  error: string | null
}

function portfolioIsValid(p: BacktestSetup['portfolios'][number]): boolean {
  const sum = p.allocations.reduce((s, a) => s + a.weight, 0)
  return p.allocations.length > 0 && Math.abs(sum - 100) < 1e-6
}

/**
 * Load all needed series and run the engine for every portfolio (and the
 * benchmark) over a SHARED date range — the intersection of all tickers'
 * histories — so the comparison and the charts line up.
 */
export function useBacktests(setup: BacktestSetup): BacktestOutput {
  const validPortfolios = setup.portfolios.filter(portfolioIsValid)

  const tickers = useMemo(() => {
    const t = validPortfolios.flatMap((p) => p.allocations.map((a) => a.ticker))
    if (setup.benchmark) t.push(setup.benchmark)
    return [...new Set(t)].sort()
  }, [JSON.stringify(validPortfolios), setup.benchmark]) // eslint-disable-line react-hooks/exhaustive-deps

  const [series, setSeries] = useState<Map<string, TickerSeries> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [factors, setFactors] = useState<FactorData | null>(null)

  useEffect(() => {
    let cancelled = false
    // Best-effort: Sharpe/Sortino fall back to rf=0 if this never resolves.
    loadFactors().then((f) => !cancelled && setFactors(f))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (tickers.length === 0) {
      setSeries(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    loadManySeries(tickers)
      .then((list) => {
        if (cancelled) return
        setSeries(new Map(list.map((s) => [s.ticker.toUpperCase(), s])))
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [tickers.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(() => {
    const empty: BacktestOutput = {
      runs: [],
      effectiveStart: null,
      effectiveEnd: null,
      limitingTicker: null,
      loading,
      error,
    }
    if (!series || validPortfolios.length === 0 || loading || error) return empty
    if (tickers.some((t) => !series.has(t))) return empty

    // Shared range: latest inception and earliest end across every ticker in play.
    let inception = '0000-00-00'
    let end = setup.config.end ?? '9999-99-99'
    let inceptionTicker: string | null = null
    for (const t of tickers) {
      const recs = series.get(t)!.records
      if (recs[0].date > inception) {
        inception = recs[0].date
        inceptionTicker = t
      }
      const last = recs[recs.length - 1].date
      if (last < end) end = last
    }
    const userStart = setup.config.start
    const start = userStart && userStart > inception ? userStart : inception
    // Only meaningful when data availability (not the user's choice) sets the start.
    const limitingTicker = start === inception && !(userStart && userStart > inception) ? inceptionTicker : null

    try {
      const config = { ...setup.config, start, end, rfByMonth: factors?.rfByMonth }
      const runs: NamedResult[] = validPortfolios.map((p, i) => ({
        label: p.name || `Portfolio ${i + 1}`,
        result: runBacktest(p.allocations.map((a) => series.get(a.ticker)!), p, config),
      }))
      if (setup.benchmark && series.has(setup.benchmark)) {
        runs.push({
          label: setup.benchmark,
          isBenchmark: true,
          result: runBacktest(
            [series.get(setup.benchmark)!],
            { name: setup.benchmark, allocations: [{ ticker: setup.benchmark, weight: 100 }] },
            config,
          ),
        })
      }
      const dates = runs[0].result.dates
      return {
        runs,
        effectiveStart: dates[0],
        effectiveEnd: dates[dates.length - 1],
        limitingTicker,
        loading: false,
        error: null,
      }
    } catch (err) {
      return { ...empty, error: err instanceof Error ? err.message : String(err) }
    }
  }, [series, loading, error, factors, JSON.stringify(setup)]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stale-while-revalidate: while data loads or a portfolio is mid-edit
  // (weights not summing yet), keep showing the last good results instead of
  // unmounting the whole results panel — no layout-destroying flicker.
  const lastGood = useRef<BacktestOutput | null>(null)
  if (current.runs.length > 0) lastGood.current = current

  const hasAnyAllocations = setup.portfolios.some((p) => p.allocations.length > 0)
  if (current.runs.length === 0 && !current.error && hasAnyAllocations && lastGood.current) {
    return { ...lastGood.current, loading: current.loading }
  }
  if (!hasAnyAllocations) lastGood.current = null
  return current
}
