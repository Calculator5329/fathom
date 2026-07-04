import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowUpRight, ChevronsUpDown, LineChart, Search } from 'lucide-react'
import { EChart } from '@/components/charts/EChart'
import { TickerPicker } from '@/components/backtest/TickerPicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { loadSeries, lookup } from '@/data/catalog'
import type { TickerSeries } from '@/engine'
import { formatUsd, formatUsdCompact } from '@/lib/format'
import { splitAdjustedCloses } from '@/lib/prices'
import {
  VALUATION_LABELS,
  marginsOption,
  priceHistoryOption,
  revenueIncomeOption,
  valuationOption,
  type ValuationMetric,
} from '@/fundamentals/charts'
import { loadFundamentals, type FiscalYear, type Fundamentals } from '@/fundamentals/load'

/**
 * Tool 5 — Stock research page. The hub that ties the suite together:
 * split-adjusted long-run price + market-era context, fundamentals from SEC
 * filings, valuation over time, and one-click handoffs to backtest/projection.
 * Public, no login. Story: "Show me everything about this company and act on it."
 */
const pctStr = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`

type Range = 'all' | '10y' | '5y'
const RANGE_OPTS: Array<{ v: Range; label: string }> = [
  { v: 'all', label: 'All' },
  { v: '10y', label: '10y' },
  { v: '5y', label: '5y' },
]

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ v: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <Button
          key={o.v}
          variant={o.v === value ? 'secondary' : 'ghost'}
          size="xs"
          className="font-mono"
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

function sliceRange(years: FiscalYear[], range: Range): FiscalYear[] {
  if (range === 'all') return years
  return years.slice(-(range === '10y' ? 10 : 5))
}

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
  const [switching, setSwitching] = useState(false)
  const [range, setRange] = useState<Range>('all')
  const [valMetric, setValMetric] = useState<ValuationMetric>('pe')

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setSeries(null)
    setFundamentals(null)
    setSwitching(false)
    loadSeries(ticker)
      .then((s) => !cancelled && setSeries(s))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    loadFundamentals(ticker).then((f) => !cancelled && setFundamentals(f))
    return () => {
      cancelled = true
    }
  }, [ticker])

  // Split-adjusted closes: continuous price history + accurate from-high.
  const adjCloses = useMemo(
    () => (series ? splitAdjustedCloses(series.records) : []),
    [series],
  )

  const priceChart = useMemo(
    () => (series ? priceHistoryOption(series.records, adjCloses, logScale) : null),
    [series, adjCloses, logScale],
  )

  const stats = useMemo(() => {
    if (!series || series.records.length < 2) return null
    const recs = series.records
    const last = recs[recs.length - 1]
    const lastAdj = adjCloses[adjCloses.length - 1]
    const ath = adjCloses.reduce((m, v) => Math.max(m, v), 0)
    const curYear = last.date.slice(0, 4)
    let baseIdx = recs.findIndex((r) => r.date.slice(0, 4) === curYear) - 1
    if (baseIdx < 0) baseIdx = 0
    const fy = fundamentals?.fiscalYears.at(-1)
    return {
      price: last.close,
      asOf: last.date,
      ytd: lastAdj / adjCloses[baseIdx] - 1,
      fromHigh: lastAdj / ath - 1,
      pe: fy?.epsDiluted ? last.close / fy.epsDiluted : null,
      marketCap: fy?.sharesDiluted ? last.close * fy.sharesDiluted : null,
      netMargin: fy?.netMargin ?? null,
      revenue: fy?.revenue ?? null,
    }
  }, [series, adjCloses, fundamentals])

  const meta = lookup(ticker)
  const allYears = fundamentals?.fiscalYears.filter((y) => y.revenue != null) ?? []
  const years = sliceRange(allYears, range)

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
      {/* Header — click the ticker to switch */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {switching ? (
            <div
              className="w-64"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSwitching(false)
              }}
            >
              <TickerPicker
                autoFocus
                placeholder="Search ticker…"
                exclude={[ticker]}
                onPick={(e) => {
                  setSwitching(false)
                  navigate(`/stock/${e.ticker}`)
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSwitching(true)}
              className="group flex items-center gap-1.5 font-mono text-3xl font-semibold tracking-tight transition-colors hover:text-primary"
              title="Click to switch ticker"
            >
              {ticker}
              <ChevronsUpDown className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
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
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Price" value={formatUsd(stats.price)} sub={`as of ${stats.asOf}`} />
            <Stat label="Year to date" value={pctStr(stats.ytd)} sub={`${pctStr(stats.fromHigh)} from high`} />
            {stats.pe != null ? (
              <Stat label="P/E" value={`${stats.pe.toFixed(1)}×`} sub="trailing, last FY" />
            ) : (
              stats.netMargin != null && (
                <Stat label="Net margin" value={`${(stats.netMargin * 100).toFixed(1)}%`} sub="last FY" />
              )
            )}
            {stats.marketCap != null ? (
              <Stat label="Market cap" value={formatUsdCompact(stats.marketCap)} />
            ) : (
              stats.revenue != null && <Stat label="Revenue" value={formatUsdCompact(stats.revenue)} sub="last FY" />
            )}
          </div>

          {/* Split-adjusted price history */}
          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">
                Price history
                <span className="ml-2 font-normal text-muted-foreground">split-adjusted</span>
              </CardTitle>
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
      {allYears.length > 0 ? (
        <>
          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">
                Revenue &amp; net income
                <span className="ml-2 font-normal text-muted-foreground">SEC filings, by fiscal year</span>
              </CardTitle>
              <Segmented options={RANGE_OPTS} value={range} onChange={setRange} />
            </CardHeader>
            <CardContent>
              <EChart option={revenueIncomeOption(years)} className="h-72 w-full" />
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Margins</CardTitle>
              <Segmented options={RANGE_OPTS} value={range} onChange={setRange} />
            </CardHeader>
            <CardContent>
              <EChart option={marginsOption(years)} className="h-64 w-full" />
            </CardContent>
          </Card>

          {series && (
            <Card className="mt-6">
              <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base font-medium">
                  Valuation over time
                  <span className="ml-2 font-normal text-muted-foreground">vs its own history</span>
                </CardTitle>
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented
                    options={[
                      { v: 'pe' as ValuationMetric, label: 'P/E' },
                      { v: 'ps' as ValuationMetric, label: 'P/S' },
                      { v: 'pfcf' as ValuationMetric, label: 'P/FCF' },
                    ]}
                    value={valMetric}
                    onChange={setValMetric}
                  />
                  <Segmented options={RANGE_OPTS} value={range} onChange={setRange} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-sm text-muted-foreground">{VALUATION_LABELS[valMetric]}</p>
                <EChart option={valuationOption(series.records, years, valMetric)} className="h-64 w-full" />
              </CardContent>
            </Card>
          )}
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
