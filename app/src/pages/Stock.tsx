import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowUpRight, LineChart, Search } from 'lucide-react'
import { EChart } from '@/components/charts/EChart'
import { TickerPicker } from '@/components/backtest/TickerPicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { loadSeries, lookup } from '@/data/catalog'
import type { TickerSeries } from '@/engine'
import { formatUsd, formatUsdCompact } from '@/lib/format'
import { marginsOption, priceHistoryOption, revenueIncomeOption } from '@/fundamentals/charts'
import { loadFundamentals, type Fundamentals } from '@/fundamentals/load'

/**
 * Tool 5 — Stock research page. The hub that ties the suite together:
 * long-run price + market-era context, fundamentals from SEC filings, and
 * one-click handoffs to backtest and projection. Public, no login.
 * Story: "Show me everything about this company and let me act on it."
 */
const pctStr = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="gap-1">
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight tnum">{value}</p>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export function Stock() {
  const { symbol } = useParams<{ symbol: string }>()
  const ticker = (symbol ?? '').toUpperCase()
  const navigate = useNavigate()

  const [series, setSeries] = useState<TickerSeries | null>(null)
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [logScale, setLogScale] = useState(false)

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setSeries(null)
    setFundamentals(null)
    loadSeries(ticker)
      .then((s) => !cancelled && setSeries(s))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    loadFundamentals(ticker).then((f) => !cancelled && setFundamentals(f))
    return () => {
      cancelled = true
    }
  }, [ticker])

  const priceChart = useMemo(
    () => (series ? priceHistoryOption(series.records, logScale) : null),
    [series, logScale],
  )

  // Derived headline stats.
  const stats = useMemo(() => {
    if (!series || series.records.length < 2) return null
    const recs = series.records
    const last = recs[recs.length - 1]
    const yearAgo = recs[Math.max(0, recs.length - 253)]
    const ath = recs.reduce((m, r) => Math.max(m, r.close), 0)
    const fy = fundamentals?.fiscalYears.at(-1)
    return {
      price: last.close,
      asOf: last.date,
      oneYear: last.close / yearAgo.close - 1,
      fromHigh: last.close / ath - 1,
      pe: fy?.epsDiluted ? last.close / fy.epsDiluted : null,
      marketCap: fy?.sharesDiluted ? last.close * fy.sharesDiluted : null,
      netMargin: fy?.netMargin ?? null,
      revenue: fy?.revenue ?? null,
      fcf: fy?.fcf ?? null,
    }
  }, [series, fundamentals])

  const meta = lookup(ticker)
  const yearsWithData = fundamentals?.fiscalYears.filter((y) => y.revenue != null) ?? []

  if (!ticker) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="mb-2 flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Search className="size-7 text-primary" /> Stock research
        </h1>
        <p className="mb-8 text-muted-foreground">Search any ticker to see its full history and fundamentals.</p>
        <TickerPicker exclude={[]} autoFocus onPick={(e) => navigate(`/stock/${e.ticker}`)} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-3xl font-semibold tracking-tight">{ticker}</h1>
            <div className="w-56">
              <TickerPicker
                placeholder="Search another ticker"
                exclude={[ticker]}
                onPick={(e) => navigate(`/stock/${e.ticker}`)}
              />
            </div>
          </div>
          <p className="mt-1 truncate text-muted-foreground">{fundamentals?.name ?? meta?.name ?? ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/backtest?p1=${ticker}:100`)}>
            Backtest <ArrowUpRight />
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/projections')}>
            <LineChart /> Project
          </Button>
        </div>
      </div>

      {error && <p className="mt-6 text-sm text-loss">{error}</p>}
      {loading && !series && <p className="mt-6 text-sm text-muted-foreground">Loading {ticker}…</p>}

      {stats && (
        <>
          {/* Stat grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Price" value={formatUsd(stats.price)} sub={`as of ${stats.asOf}`} />
            <Stat label="1-year" value={pctStr(stats.oneYear)} sub={`${pctStr(stats.fromHigh)} from high`} />
            {stats.pe != null && <Stat label="P/E (last FY)" value={stats.pe.toFixed(1)} />}
            {stats.marketCap != null && <Stat label="Market cap" value={formatUsdCompact(stats.marketCap)} />}
            {stats.pe == null && stats.netMargin != null && (
              <Stat label="Net margin" value={`${(stats.netMargin * 100).toFixed(1)}%`} />
            )}
            {stats.pe == null && stats.revenue != null && (
              <Stat label="Revenue" value={formatUsdCompact(stats.revenue)} sub="last FY" />
            )}
          </div>

          {/* Price history */}
          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Price history</CardTitle>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={logScale} onCheckedChange={setLogScale} />
                Log scale
              </label>
            </CardHeader>
            <CardContent>
              {priceChart && <EChart option={priceChart} exportName={`fathom-${ticker}-price`} className="h-80 w-full" />}
            </CardContent>
          </Card>
        </>
      )}

      {/* Fundamentals */}
      {yearsWithData.length > 0 ? (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Revenue & net income
                <span className="ml-2 font-normal text-muted-foreground">SEC filings, by fiscal year</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EChart option={revenueIncomeOption(yearsWithData)} className="h-72 w-full" />
            </CardContent>
          </Card>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base font-medium">Margins</CardTitle>
            </CardHeader>
            <CardContent>
              <EChart option={marginsOption(yearsWithData)} className="h-64 w-full" />
            </CardContent>
          </Card>
        </>
      ) : (
        series && (
          <p className="mt-6 text-sm text-muted-foreground">
            Fundamentals are available for US-listed common stocks. Price history above covers this
            ticker in full.
          </p>
        )
      )}
    </div>
  )
}
