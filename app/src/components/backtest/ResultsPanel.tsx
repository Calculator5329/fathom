import { useMemo, useState } from 'react'
import { Check, Link as LinkIcon } from 'lucide-react'
import { EChart } from '@/components/charts/EChart'
import {
  annualReturnsOption,
  drawdownOption,
  growthOption,
  incomeOption,
  rollingOption,
  type NamedResult,
} from '@/components/charts/options'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { monthlyReturns, rollingReturns } from '@/engine'
import { formatUsd, formatUsdCompact } from '@/lib/format'

const pct = (v: number, dp = 1) => `${v >= 0 ? '' : '−'}${Math.abs(v * 100).toFixed(dp)}%`
const num = (v: number) => v.toFixed(2)

function PctCell({ v, dp = 1 }: { v: number; dp?: number }) {
  return <span className={`tnum ${v < 0 ? 'text-loss' : 'text-gain'}`}>{v > 0 ? '+' : ''}{pct(v, dp)}</span>
}

interface ResultsPanelProps {
  runs: NamedResult[]
  /** Off for total-return-only data (asset classes) where income is not tracked. */
  showIncome?: boolean
}

/** Summary metrics: big cards for one portfolio, comparison grid for several. */
function MetricSummary({ runs }: { runs: NamedResult[] }) {
  const rows: Array<{ label: string; render: (r: NamedResult) => React.ReactNode }> = [
    {
      label: 'Final value',
      render: (r) => (
        <span className="tnum" title={formatUsd(r.result.values.at(-1)!)}>
          {formatUsdCompact(r.result.values.at(-1)!)}
        </span>
      ),
    },
    { label: 'CAGR', render: (r) => <PctCell v={r.result.metrics.cagr} dp={2} /> },
    { label: 'Volatility', render: (r) => <span className="tnum">{pct(r.result.metrics.volatility)}</span> },
    { label: 'Max drawdown', render: (r) => <span className="tnum text-loss">{pct(r.result.metrics.drawdown.maxDrawdown)}</span> },
    { label: 'Sharpe', render: (r) => <span className="tnum">{num(r.result.metrics.sharpe)}</span> },
  ]

  if (runs.length === 1) {
    const r = runs[0]
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {rows.map((row) => (
          <Card key={row.label} className="gap-1">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">{row.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tracking-tight">
              {row.render(r)}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              {runs.map((r, i) => (
                <TableHead key={r.label} className="text-right">
                  <span className="inline-flex items-center gap-2">
                    {!r.isBenchmark && (
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ background: `var(--chart-${i + 1})` }}
                      />
                    )}
                    {r.label}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="text-muted-foreground">{row.label}</TableCell>
                {runs.map((r) => (
                  <TableCell key={r.label} className="text-right font-mono text-base">
                    {row.render(r)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function correlationMatrix(runs: NamedResult[]): number[][] {
  const series = runs.map((r) => monthlyReturns(r.result.dates, r.result.twrIndex))
  const n = Math.min(...series.map((s) => s.length))
  const trimmed = series.map((s) => s.slice(s.length - n))
  const corr = (a: number[], b: number[]): number => {
    const ma = a.reduce((s, x) => s + x, 0) / a.length
    const mb = b.reduce((s, x) => s + x, 0) / b.length
    let num = 0
    let da = 0
    let db = 0
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb)
      da += (a[i] - ma) ** 2
      db += (b[i] - mb) ** 2
    }
    const den = Math.sqrt(da * db)
    return den === 0 ? 1 : num / den
  }
  return trimmed.map((a) => trimmed.map((b) => corr(a, b)))
}

const ROLLING_WINDOWS = [1, 3, 5, 10]

export function ResultsPanel({ runs, showIncome = true }: ResultsPanelProps) {
  const [logScale, setLogScale] = useState(false)
  const [copied, setCopied] = useState(false)
  const [rollingWindow, setRollingWindow] = useState(3)

  const growth = useMemo(() => growthOption(runs, logScale), [runs, logScale])
  const drawdown = useMemo(() => drawdownOption(runs), [runs])
  const annual = useMemo(() => annualReturnsOption(runs), [runs])
  const corr = useMemo(() => (runs.length > 1 ? correlationMatrix(runs) : null), [runs])

  // Only offer rolling windows the history can actually fill.
  const horizonYears =
    (Date.parse(runs[0].result.dates.at(-1)!) - Date.parse(runs[0].result.dates[0])) /
    86_400_000 /
    365.25
  const windows = ROLLING_WINDOWS.filter((w) => w <= horizonYears)
  const activeWindow = windows.includes(rollingWindow) ? rollingWindow : windows[0]
  const rolling = useMemo(
    () => (activeWindow ? rollingOption(runs, activeWindow) : null),
    [runs, activeWindow],
  )
  const rollingStats = useMemo(
    () =>
      activeWindow
        ? runs.map((r) => {
            const pts = rollingReturns(r.result.dates, r.result.twrIndex, activeWindow)
            const values = pts.map((p) => p.value)
            return {
              label: r.label,
              count: values.length,
              avg: values.reduce((s, v) => s + v, 0) / (values.length || 1),
              min: Math.min(...values),
              max: Math.max(...values),
              positive: values.filter((v) => v > 0).length / (values.length || 1),
            }
          })
        : [],
    [runs, activeWindow],
  )

  const income = useMemo(() => incomeOption(runs), [runs])
  const incomeSummary = useMemo(
    () =>
      runs.map((r) => {
        const { dates, dividendIncome, values } = r.result
        const cutoff = new Date(Date.parse(dates.at(-1)!) - 365 * 86_400_000)
          .toISOString()
          .slice(0, 10)
        let trailing = 0
        for (let t = dates.length - 1; t >= 0 && dates[t] > cutoff; t--) {
          trailing += dividendIncome[t]
        }
        const total = dividendIncome.reduce((s, x) => s + x, 0)
        return { label: r.label, trailing, yieldOnValue: trailing / values.at(-1)!, total }
      }),
    [runs],
  )

  const dates = runs[0].result.dates
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="animate-enter space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tnum">{dates[0]}</span> &rarr;{' '}
          <span className="font-mono tnum">{dates[dates.length - 1]}</span>
        </p>
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? <Check className="text-gain" /> : <LinkIcon />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>

      <MetricSummary runs={runs} />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Portfolio value</CardTitle>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={logScale} onCheckedChange={setLogScale} />
            Log scale
          </label>
        </CardHeader>
        <CardContent>
          <EChart option={growth} group="backtest" className="h-80 w-full" />
          <EChart option={drawdown} group="backtest" className="mt-1 h-40 w-full" />
        </CardContent>
      </Card>

      <Tabs defaultValue="annual">
        <TabsList>
          <TabsTrigger value="annual">Annual returns</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="rolling" disabled={windows.length === 0}>
            Rolling
          </TabsTrigger>
          {showIncome && <TabsTrigger value="income">Income</TabsTrigger>}
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
        </TabsList>

        <TabsContent value="annual" className="animate-enter space-y-4">
          <Card>
            <CardContent>
              <EChart option={annual} className="h-72 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    {runs.map((r) => (
                      <TableHead key={r.label} className="text-right">
                        {r.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...runs[0].result.metrics.annualReturns].reverse().map((y) => (
                    <TableRow key={y.year}>
                      <TableCell className="font-mono tnum">{y.year}</TableCell>
                      {runs.map((r) => {
                        const yr = r.result.metrics.annualReturns.find((x) => x.year === y.year)
                        return (
                          <TableCell key={r.label} className="text-right font-mono">
                            {yr ? <PctCell v={yr.return} /> : '—'}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rolling" className="animate-enter space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">
                Rolling {activeWindow}-year annualized return
              </CardTitle>
              <div className="flex gap-1">
                {windows.map((w) => (
                  <Button
                    key={w}
                    variant={w === activeWindow ? 'secondary' : 'ghost'}
                    size="xs"
                    className="font-mono"
                    onClick={() => setRollingWindow(w)}
                  >
                    {w}y
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {rolling && <EChart option={rolling} className="h-72 w-full" />}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead className="text-right">Best</TableHead>
                    <TableHead className="text-right">Worst</TableHead>
                    <TableHead className="text-right">Positive windows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rollingStats.map((s) => (
                    <TableRow key={s.label}>
                      <TableCell className="text-muted-foreground">{s.label}</TableCell>
                      <TableCell className="text-right font-mono">
                        <PctCell v={s.avg} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <PctCell v={s.max} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <PctCell v={s.min} />
                      </TableCell>
                      <TableCell className="text-right font-mono tnum">
                        {pct(s.positive, 0)} of {s.count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {showIncome && (
        <TabsContent value="income" className="animate-enter space-y-4">
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead className="text-right">Dividends, trailing 12 mo</TableHead>
                    <TableHead className="text-right">Yield on value</TableHead>
                    <TableHead className="text-right">Total dividends received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomeSummary.map((s) => (
                    <TableRow key={s.label}>
                      <TableCell className="text-muted-foreground">{s.label}</TableCell>
                      <TableCell className="text-right font-mono tnum">
                        <span title={formatUsd(s.trailing)}>{formatUsdCompact(s.trailing)}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono tnum">
                        {pct(s.yieldOnValue, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono tnum">
                        <span title={formatUsd(s.total)}>{formatUsdCompact(s.total)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Dividend income by year
                <span className="ml-2 font-normal text-muted-foreground">
                  cash received; grows with reinvestment and contributions
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EChart option={income} className="h-72 w-full" />
            </CardContent>
          </Card>
        </TabsContent>
        )}

        <TabsContent value="holdings" className="animate-enter space-y-4">
          {runs
            .filter((r) => !r.isBenchmark)
            .map((r) => (
              <Card key={r.label}>
                <CardHeader>
                  <CardTitle className="text-base font-medium">{r.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticker</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">End weight</TableHead>
                        <TableHead className="text-right">Asset return</TableHead>
                        {showIncome && <TableHead className="text-right">Dividends paid</TableHead>}
                        <TableHead className="text-right">End value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.result.holdings.map((h) => (
                        <TableRow key={h.ticker}>
                          <TableCell className="font-mono font-medium">{h.ticker}</TableCell>
                          <TableCell className="text-right font-mono tnum">
                            {h.targetWeight.toFixed(0)}%
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">
                            {h.endWeight.toFixed(1)}%
                            {Math.abs(h.endWeight - h.targetWeight) >= 5 && (
                              <span className="ml-1.5 text-chart-3" title="Drifted 5%+ from target">
                                •
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <PctCell v={h.assetTotalReturn} />
                          </TableCell>
                          {showIncome && (
                            <TableCell className="text-right font-mono tnum">
                              <span title={formatUsd(h.income)}>{formatUsdCompact(h.income)}</span>
                            </TableCell>
                          )}
                          <TableCell className="text-right font-mono tnum">
                            <span title={formatUsd(h.endValue)}>{formatUsdCompact(h.endValue)}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                      {r.result.endingCash > 0.005 && (
                        <TableRow>
                          <TableCell className="text-muted-foreground">
                            Dividend cash (not reinvested)
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">—</TableCell>
                          <TableCell className="text-right font-mono tnum">
                            {((r.result.endingCash / r.result.values.at(-1)!) * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right font-mono tnum">—</TableCell>
                          {showIncome && (
                            <TableCell className="text-right font-mono tnum">—</TableCell>
                          )}
                          <TableCell className="text-right font-mono tnum">
                            <span title={formatUsd(r.result.endingCash)}>
                              {formatUsdCompact(r.result.endingCash)}
                            </span>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  {r.result.holdings.some(
                    (h) => Math.abs(h.endWeight - h.targetWeight) >= 5,
                  ) && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="text-chart-3">•</span> drifted 5%+ from target — consider
                      a rebalancing setting.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
        </TabsContent>

        <TabsContent value="risk" className="animate-enter space-y-4">
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    {runs.map((r) => (
                      <TableHead key={r.label} className="text-right">
                        {r.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(
                    [
                      ['Sharpe ratio', (r: NamedResult) => num(r.result.metrics.sharpe)],
                      ['Sortino ratio', (r: NamedResult) => num(r.result.metrics.sortino)],
                      ['Volatility (ann.)', (r: NamedResult) => pct(r.result.metrics.volatility)],
                      ['Max drawdown', (r: NamedResult) => pct(r.result.metrics.drawdown.maxDrawdown)],
                      ['Drawdown trough', (r: NamedResult) => r.result.metrics.drawdown.troughDate],
                      [
                        'Recovered by',
                        (r: NamedResult) => r.result.metrics.drawdown.recoveryDate ?? 'not yet',
                      ],
                      [
                        'Best year',
                        (r: NamedResult) =>
                          r.result.metrics.bestYear
                            ? `${pct(r.result.metrics.bestYear.return)} (${r.result.metrics.bestYear.year})`
                            : '—',
                      ],
                      [
                        'Worst year',
                        (r: NamedResult) =>
                          r.result.metrics.worstYear
                            ? `${pct(r.result.metrics.worstYear.return)} (${r.result.metrics.worstYear.year})`
                            : '—',
                      ],
                      ['IRR (money-weighted)', (r: NamedResult) => pct(r.result.metrics.irr, 2)],
                    ] as Array<[string, (r: NamedResult) => string]>
                  ).map(([label, render]) => (
                    <TableRow key={label}>
                      <TableCell className="text-muted-foreground">{label}</TableCell>
                      {runs.map((r) => (
                        <TableCell key={r.label} className="text-right font-mono tnum">
                          {render(r)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {corr && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  Correlation (monthly returns)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead />
                      {runs.map((r) => (
                        <TableHead key={r.label} className="text-right">
                          {r.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((a, i) => (
                      <TableRow key={a.label}>
                        <TableCell className="text-muted-foreground">{a.label}</TableCell>
                        {runs.map((b, j) => (
                          <TableCell key={b.label} className="text-right font-mono tnum">
                            {corr[i][j].toFixed(2)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
