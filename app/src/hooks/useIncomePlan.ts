import { useEffect, useMemo, useRef, useState } from 'react'
import { loadManySeries, lookup } from '@/data/catalog'
import { planIncome, type Holding, type IncomePlan } from '@/income/planner'
import type { IncomeSetup } from '@/income/urlState'

export interface IncomeOutput {
  plan: IncomePlan | null
  loading: boolean
  error: string | null
}

/**
 * Load every held ticker's series and compute the forward-income plan. Holdings
 * are allocated proportionally: a ticker's position value is its share of the
 * summed weights times the total portfolio value, so weights need not add to
 * exactly 100. Stale-while-revalidate (invariant 6): the last good plan stays
 * mounted and dims while a new one computes.
 */
export function useIncomePlan(setup: IncomeSetup): IncomeOutput {
  const valid = setup.holdings.filter((h) => h.ticker && h.weight > 0)
  const sumWeights = valid.reduce((s, h) => s + h.weight, 0)

  const tickers = useMemo(
    () => [...new Set(valid.map((h) => h.ticker))].sort(),
    [JSON.stringify(valid)], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const [series, setSeries] = useState<Map<string, Holding['records']> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastPlan = useRef<IncomePlan | null>(null)

  useEffect(() => {
    if (tickers.length === 0) {
      setSeries(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    loadManySeries(tickers)
      .then((list) => {
        if (cancelled) return
        setSeries(new Map(list.map((s) => [s.ticker.toUpperCase(), s.records])))
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [tickers.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const plan = useMemo(() => {
    if (!series || valid.length === 0 || sumWeights <= 0) return null
    if (tickers.some((t) => !series.has(t))) return lastPlan.current
    const holdings: Holding[] = valid.map((h) => ({
      ticker: h.ticker,
      name: lookup(h.ticker)?.name,
      value: (h.weight / sumWeights) * setup.totalValue,
      records: series.get(h.ticker)!,
    }))
    const computed = planIncome(holdings)
    lastPlan.current = computed
    return computed
  }, [series, JSON.stringify(valid), sumWeights, setup.totalValue]) // eslint-disable-line react-hooks/exhaustive-deps

  return { plan, loading, error }
}
