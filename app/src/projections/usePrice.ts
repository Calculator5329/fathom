import { useEffect, useState } from 'react'
import { loadSeries } from '@/data/catalog'

export interface PriceInfo {
  ticker: string
  name?: string
  price: number
  asOf: string
}

/**
 * Current price for a ticker, from Fathom's own data layer (last close of the
 * cached/admitted series). Null ticker = idle.
 */
export function usePrice(ticker: string | null) {
  const [info, setInfo] = useState<PriceInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ticker) {
      setInfo(null)
      setError(null)
      return
    }
    let cancelled = false
    setInfo(null)
    setLoading(true)
    setError(null)
    loadSeries(ticker)
      .then((series) => {
        if (cancelled) return
        const last = series.records[series.records.length - 1]
        setInfo({ ticker: series.ticker, name: series.name, price: last.close, asOf: last.date })
      })
      .catch((err) => {
        if (cancelled) return
        setInfo(null)
        setError(err.message)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [ticker])

  return { info, loading, error }
}
