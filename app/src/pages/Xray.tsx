import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, ScanSearch, Upload } from 'lucide-react'
import { EChart, baseOption, cssVar } from '@/components/charts/EChart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { loadSeries } from '@/data/catalog'
import type { TickerSeries } from '@/engine'
import { loadFundamentals, type Fundamentals } from '@/fundamentals/load'
import { formatUsd, formatUsdCompact } from '@/lib/format'
import {
  analyzePositions,
  reconstructHistory,
  type PositionAnalysis,
  type ReconstructionResult,
} from '@/xray/analyze'
import { parsePositions, parseTrades } from '@/xray/parse'

/**
 * Tool 6 — Portfolio X-ray. Story: "Show me what I actually own — blended
 * valuation, concentration, distance from highs — and if I paste my trade
 * history, my real performance." Everything stays in the browser
 * (localStorage); nothing is uploaded anywhere.
 */

const pctStr = (v: number, dp = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(dp)}%`
const LS_POSITIONS = 'fathom.xray.positions.v1'
const LS_TRADES = 'fathom.xray.trades.v1'

function Stat({ label, value, sub, loss }: { label: string; value: string; sub?: string; loss?: boolean }) {
  return (
    <Card className="gap-1">
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold tracking-tight tnum ${loss ? 'text-loss' : ''}`}>{value}</p>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

async function loadAll(tickers: string[]) {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))]
  const series = new Map<string, TickerSeries>()
  const fundamentals = new Map<string, Fundamentals | null>()
  const missing: string[] = []
  await Promise.all(
    unique.map(async (t) => {
      try {
        series.set(t, await loadSeries(t))
      } catch {
        missing.push(t)
      }
      fundamentals.set(t, await loadFundamentals(t).catch(() => null))
    }),
  )
  return { series, fundamentals, missing }
}

export function Xray() {
  const navigate = useNavigate()
  const [positionsText, setPositionsText] = useState('')
  const [tradesText, setTradesText] = useState('')
  const [busy, setBusy] = useState(false)
  const [posResult, setPosResult] = useState<PositionAnalysis | null>(null)
  const [histResult, setHistResult] = useState<ReconstructionResult | null>(null)
  const [histBlend, setHistBlend] = useState<PositionAnalysis | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPositionsText(localStorage.getItem(LS_POSITIONS) ?? '')
    setTradesText(localStorage.getItem(LS_TRADES) ?? '')
  }, [])

  const runPositions = async () => {
    setBusy(true)
    setNotes([])
    setHistResult(null)
    setHistBlend(null)
    try {
      const { positions, errors } = parsePositions(positionsText)
      if (positions.length === 0) {
        setNotes(errors.length ? errors : ['Nothing to analyze — add lines like "AAPL 10" or "VTI 40%".'])
        setPosResult(null)
        return
      }
      localStorage.setItem(LS_POSITIONS, positionsText)
      const { series, fundamentals, missing } = await loadAll(positions.map((p) => p.ticker))
      const analysis = analyzePositions(positions, series, fundamentals)
      setPosResult(analysis)
      setNotes([...errors, ...missing.map((t) => `${t}: no price data available`)])
    } catch (err) {
      setNotes([err instanceof Error ? err.message : String(err)])
      setPosResult(null)
    } finally {
      setBusy(false)
    }
  }

  const runTrades = async () => {
    setBusy(true)
    setNotes([])
    setPosResult(null)
    try {
      const { trades, errors, skipped } = parseTrades(tradesText)
      if (trades.length === 0) {
        setNotes(errors.length ? errors : ['No trades recognized in that CSV.'])
        setHistResult(null)
        setHistBlend(null)
        return
      }
      localStorage.setItem(LS_TRADES, tradesText)
      const { series, fundamentals } = await loadAll(trades.map((t) => t.ticker))
      const result = reconstructHistory(trades, series)
      setHistResult(result)
      // Blend analysis of the CURRENT reconstructed positions.
      const blend = analyzePositions(
        result.endPositions.map((p) => ({ ticker: p.ticker, shares: p.shares })),
        series,
        fundamentals,
      )
      setHistBlend(blend)
      setNotes([
        ...errors,
        ...(skipped > 0 ? [`${skipped} non-trade rows skipped (dividends, transfers…)`] : []),
        ...result.warnings,
      ])
    } catch (err) {
      setNotes([err instanceof Error ? err.message : String(err)])
      setHistResult(null)
      setHistBlend(null)
    } finally {
      setBusy(false)
    }
  }

  const valueChart = useMemo(() => {
    if (!histResult) return null
    const base = baseOption()
    return {
      ...base,
      xAxis: { ...(base.xAxis as object), type: 'time' as const, boundaryGap: false },
      yAxis: {
        ...(base.yAxis as object),
        type: 'value' as const,
        scale: true,
        axisLabel: {
          ...(base.yAxis as { axisLabel: object }).axisLabel,
          formatter: (v: number) => formatUsdCompact(v),
        },
      },
      tooltip: { ...(base.tooltip as object), valueFormatter: (v: unknown) => formatUsd(v as number) },
      legend: { show: false },
      series: [
        {
          name: 'Portfolio value',
          type: 'line' as const,
          showSymbol: false,
          sampling: 'lttb' as const,
          data: histResult.values.map((v, i) => [histResult.dates[i], Math.round(v * 100) / 100]),
          lineStyle: { width: 1.75, color: cssVar('--primary') },
          itemStyle: { color: cssVar('--primary') },
          areaStyle: { color: cssVar('--primary'), opacity: 0.06 },
          emphasis: { disabled: true },
        },
      ],
    }
  }, [histResult])

  const backtestMix = (analysis: PositionAnalysis) => {
    const top = analysis.holdings.slice(0, 10)
    const total = top.reduce((s, h) => s + h.weight, 0)
    const spec = top
      .map((h) => `${h.ticker}:${Math.round((h.weight / total) * 10000) / 100}`)
      .join(',')
    navigate(`/backtest?p1=${spec}`)
  }

  const blend = posResult ?? histBlend

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
        <ScanSearch className="size-7 text-primary" /> Portfolio X-ray
      </h1>
      <p className="mt-2 mb-6 max-w-2xl text-muted-foreground">
        Paste positions or a broker trade history. Everything is analyzed in
        your browser and saved only on this device.
      </p>

      <Tabs defaultValue={tradesText ? 'activity' : 'positions'}>
        <TabsList>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="activity">Activity history</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="animate-enter">
          <Card>
            <CardContent className="space-y-3">
              <textarea
                value={positionsText}
                onChange={(e) => setPositionsText(e.target.value)}
                placeholder={'One per line — shares or weight:\nAAPL 12\nVTI 40%\nBRK-B 5'}
                className="min-h-28 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <Button onClick={runPositions} disabled={busy || !positionsText.trim()}>
                {busy ? 'Analyzing…' : 'Analyze positions'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="animate-enter">
          <Card>
            <CardContent className="space-y-3">
              <textarea
                value={tradesText}
                onChange={(e) => setTradesText(e.target.value)}
                placeholder={'Paste a trade-history CSV (date, symbol, action, quantity, price)\nor use the file button below.'}
                className="min-h-28 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <div className="flex items-center gap-2">
                <Button onClick={runTrades} disabled={busy || !tradesText.trim()}>
                  {busy ? 'Reconstructing…' : 'Reconstruct history'}
                </Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload /> CSV file
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    f.text().then(setTradesText)
                    e.target.value = ''
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {notes.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-sm text-muted-foreground">
          {notes.map((n, i) => (
            <li key={i}>· {n}</li>
          ))}
        </ul>
      )}

      {/* Activity results: performance first */}
      {histResult && (
        <div className="animate-enter mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Current value" value={formatUsdCompact(histResult.values.at(-1) ?? 0)} />
            <Stat
              label="Return (TWR)"
              value={pctStr(histResult.metrics.cagr)}
              sub="per year, time-weighted"
              loss={histResult.metrics.cagr < 0}
            />
            <Stat
              label="Your IRR"
              value={Number.isFinite(histResult.irr) ? pctStr(histResult.irr) : '—'}
              sub="money-weighted"
              loss={histResult.irr < 0}
            />
            <Stat
              label="Max drawdown"
              value={pctStr(histResult.metrics.drawdown.maxDrawdown, 1)}
              sub={`invested ${formatUsdCompact(histResult.totalInvested)} · withdrawn ${formatUsdCompact(histResult.totalWithdrawn)}`}
              loss
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Portfolio value — reconstructed</CardTitle>
            </CardHeader>
            <CardContent>{valueChart && <EChart option={valueChart} exportName="fathom-xray-history" className="h-72 w-full" />}</CardContent>
          </Card>
        </div>
      )}

      {/* Blended snapshot (from positions, or from reconstructed holdings) */}
      {blend && blend.holdings.length > 0 && (
        <div className="animate-enter mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={posResult ? 'Total value' : 'Holdings'} value={posResult ? formatUsdCompact(blend.totalValue) : String(blend.holdings.length)} />
            <Stat
              label="Blended P/E"
              value={blend.blendedPe ? `${blend.blendedPe.toFixed(1)}×` : '—'}
              sub={blend.blendedPe ? `covers ${(blend.peCoverage * 100).toFixed(0)}% of value` : 'no covered stocks'}
            />
            <Stat label="Blended div yield" value={blend.blendedDivYield != null ? `${(blend.blendedDivYield * 100).toFixed(2)}%` : '—'} />
            <Stat label="Top position" value={blend.holdings[0] ? `${blend.holdings[0].ticker} ${blend.holdings[0].weight.toFixed(0)}%` : '—'} sub="concentration" />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Holdings</CardTitle>
              <Button variant="outline" size="sm" onClick={() => backtestMix(blend)}>
                Backtest this mix <ArrowUpRight />
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">vs 52-wk high</TableHead>
                    <TableHead className="text-right">TTM P/E</TableHead>
                    <TableHead className="text-right">Div yield</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blend.holdings.map((h) => (
                    <TableRow key={h.ticker}>
                      <TableCell>
                        <button
                          type="button"
                          className="font-mono font-medium transition-colors hover:text-primary"
                          onClick={() => navigate(`/stock/${h.ticker}`)}
                          title={h.name}
                        >
                          {h.ticker}
                        </button>
                      </TableCell>
                      <TableCell className="text-right font-mono tnum">{h.shares != null ? h.shares : '—'}</TableCell>
                      <TableCell className="text-right font-mono tnum">{formatUsd(h.price)}</TableCell>
                      <TableCell className="text-right font-mono tnum">{h.weight.toFixed(1)}%</TableCell>
                      <TableCell className={`text-right font-mono tnum ${h.fromHigh52w < -0.15 ? 'text-loss' : ''}`}>
                        {pctStr(h.fromHigh52w)}
                      </TableCell>
                      <TableCell className="text-right font-mono tnum">{h.ttmPe ? `${h.ttmPe.toFixed(1)}×` : '—'}</TableCell>
                      <TableCell className="text-right font-mono tnum">
                        {h.divYield != null ? `${(h.divYield * 100).toFixed(2)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
