import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { AssetClassPicker } from '@/components/AssetClassPicker'
import { ResultsSkeleton } from '@/components/LoadingSkeletons'
import { EChart } from '@/components/charts/EChart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ASSET_CLASSES, assetClass } from '@/data/assetClasses'
import { formatUsd, formatUsdCompact } from '@/lib/format'
import { endingHistogramOption, fanChartOption, incomeFanOption } from '@/montecarlo/chart'
import type { WithdrawalStrategy } from '@/montecarlo/simulate'
import { decodeMonteCarlo, encodeMonteCarlo, type MonteCarloConfig } from '@/montecarlo/state'
import { useSimulation } from '@/montecarlo/useSimulation'

/**
 * Tool 4 — Monte Carlo retirement simulator.
 * Story: "Will my portfolio survive N years of withdrawals? Show me the odds
 * against every market era in history, and how bad the worst cases got."
 * All client-side, in a Web Worker; shareable by URL. No login.
 */

const STRATEGY_LABELS: Record<WithdrawalStrategy, string> = {
  fixedReal: 'Fixed real dollar',
  fixedPercent: 'Fixed % of balance',
  vpw: 'Variable % (VPW)',
  guardrails: 'Guardrails (Guyton-Klinger)',
}

const pctStr = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`

function weightSum(alloc: MonteCarloConfig['allocation']) {
  return Math.round(alloc.reduce((s, a) => s + a.weight, 0) * 100) / 100
}

export function Montecarlo() {
  const [params, setParams] = useSearchParams()
  const config = useMemo(() => decodeMonteCarlo(params), [params])

  const update = (next: MonteCarloConfig) => setParams(encodeMonteCarlo(next), { replace: true })

  const sim = useSimulation({
    allocation: config.allocation,
    params: {
      initialBalance: config.initialBalance,
      withdrawalRate: config.withdrawalRate / 100,
      strategy: config.strategy,
      horizonYears: config.horizonYears,
      feeRate: config.feeRate / 100,
      accumulationYears: config.accumulationYears,
      annualContribution: config.annualContribution,
    },
    mode: config.mode,
    trials: config.trials,
  })

  const sum = weightSum(config.allocation)
  const balanced = Math.abs(sum - 100) < 0.5

  const setAlloc = (allocation: MonteCarloConfig['allocation']) => update({ ...config, allocation })

  const addAsset = (assetId: string) => {
    const remaining = Math.round((100 - sum) * 100) / 100
    if (remaining > 0.005) {
      setAlloc([...config.allocation, { assetId, weight: remaining }])
    } else {
      // Portfolio already full — equalize so the new asset is usable.
      const n = config.allocation.length + 1
      const even = Math.floor(10000 / n) / 100
      setAlloc(
        [...config.allocation, { assetId, weight: 0 }].map((a, i) => ({
          ...a,
          weight: i === 0 ? Math.round((100 - even * (n - 1)) * 100) / 100 : even,
        })),
      )
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col px-6 lg:flex-row">
      {/* Builder rail — stacks above results on narrow screens */}
      <aside className="border-b py-6 lg:w-80 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-8 lg:pr-8">
        {/* Allocation */}
        <div className="space-y-2">
          <Label>Portfolio</Label>
          {config.allocation.map((a, i) => (
            <div key={a.assetId} className="group flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{assetClass(a.assetId)?.label ?? a.assetId}</span>
              <div className="relative w-20 shrink-0">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={Number.isFinite(a.weight) ? a.weight : ''}
                  onChange={(e) =>
                    setAlloc(config.allocation.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))
                  }
                  className="pr-6 text-right font-mono tnum"
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-muted-foreground">
                  %
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${assetClass(a.assetId)?.label ?? a.assetId}`}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => setAlloc(config.allocation.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {config.allocation.length < ASSET_CLASSES.length && (
            <AssetClassPicker exclude={config.allocation.map((a) => a.assetId)} onPick={addAsset} />
          )}
          {!balanced && (
            <p className="text-sm text-loss">
              Weights total <span className="font-mono tnum">{sum}%</span> — must equal 100%.
            </p>
          )}
        </div>

        {/* Plan inputs */}
        <div className="mt-7 grid grid-cols-2 gap-x-3 gap-y-4">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="bal">Starting balance</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
              <Input
                id="bal"
                type="number"
                step={50000}
                value={config.initialBalance}
                onChange={(e) => update({ ...config, initialBalance: Math.max(1, Number(e.target.value)) })}
                className="pl-7 font-mono tnum"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc">Years to retire</Label>
            <div className="relative">
              <Input
                id="acc"
                type="number"
                min={0}
                max={50}
                value={config.accumulationYears}
                onChange={(e) =>
                  update({ ...config, accumulationYears: Math.max(0, Math.min(50, Math.round(Number(e.target.value)))) })
                }
                className="pr-7 font-mono tnum"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">y</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="save">Saving / yr</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
              <Input
                id="save"
                type="number"
                step={1000}
                min={0}
                value={config.annualContribution}
                disabled={config.accumulationYears === 0}
                onChange={(e) => update({ ...config, annualContribution: Math.max(0, Number(e.target.value)) })}
                className="pl-7 font-mono tnum"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="yrs">Horizon</Label>
            <div className="relative">
              <Input
                id="yrs"
                type="number"
                min={1}
                max={60}
                value={config.horizonYears}
                onChange={(e) => update({ ...config, horizonYears: Math.max(1, Math.min(60, Math.round(Number(e.target.value)))) })}
                className="pr-7 font-mono tnum"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">y</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wr">Withdrawal</Label>
            <div className="relative">
              <Input
                id="wr"
                type="number"
                step={0.1}
                value={config.withdrawalRate}
                onChange={(e) => update({ ...config, withdrawalRate: Math.max(0, Number(e.target.value)) })}
                className="pr-7 font-mono tnum"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Strategy</Label>
            <Select value={config.strategy} onValueChange={(v) => update({ ...config, strategy: v as WithdrawalStrategy })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STRATEGY_LABELS) as WithdrawalStrategy[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STRATEGY_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {config.strategy === 'fixedReal' && `${formatUsd((config.initialBalance * config.withdrawalRate) / 100)}/yr, inflation-adjusted`}
              {config.strategy === 'fixedPercent' && 'Recomputed from the balance each year'}
              {config.strategy === 'vpw' && 'Rises with age as the horizon shortens'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fee">Fees</Label>
            <div className="relative">
              <Input
                id="fee"
                type="number"
                step={0.01}
                value={config.feeRate}
                onChange={(e) => update({ ...config, feeRate: Math.max(0, Number(e.target.value)) })}
                className="pr-7 font-mono tnum"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={config.mode} onValueChange={(v) => update({ ...config, mode: v as 'historical' | 'bootstrap' })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="historical">Historical</SelectItem>
                <SelectItem value="bootstrap">Bootstrap</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {config.mode === 'historical'
            ? 'Every rolling period in history as one trial.'
            : `${config.trials.toLocaleString()} resampled trials (24-mo blocks).`}
          {' '}All figures in today's dollars.
        </p>
      </aside>

      {/* Results */}
      <main className={`min-w-0 flex-1 py-6 transition-opacity duration-200 lg:py-8 lg:pl-8 ${sim.running ? 'opacity-60' : ''}`}>
        {sim.error ? (
          <p className="text-sm text-loss">{sim.error}</p>
        ) : !sim.result ? (
          sim.running ? (
            <ResultsSkeleton />
          ) : (
            <p className="text-sm text-muted-foreground">Set an allocation to run.</p>
          )
        ) : (
          <Results result={sim.result} maxSwr={sim.maxSwr} config={config} />
        )}
      </main>
    </div>
  )
}

function Results({
  result,
  maxSwr,
  config,
}: {
  result: import('@/montecarlo/simulate').SimResult
  maxSwr: number
  config: MonteCarloConfig
}) {
  const fan = useMemo(() => fanChartOption(result), [result])
  const incomeFan = useMemo(
    () => (config.strategy !== 'fixedReal' ? incomeFanOption(result) : null),
    [result, config.strategy],
  )
  const hist = useMemo(() => endingHistogramOption(result), [result])
  const success = result.successRate
  const successColor = success >= 0.9 ? 'text-gain' : success >= 0.75 ? 'text-chart-3' : 'text-loss'

  return (
    <div className="animate-enter space-y-6">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="gap-1">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Success rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-semibold tracking-tight tnum ${successColor}`}>{pctStr(success)}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{result.trials.toLocaleString()} trials</p>
          </CardContent>
        </Card>
        <Card className="gap-1">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Median ending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tracking-tight tnum">{formatUsdCompact(result.medianEnding)}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">today's dollars</p>
          </CardContent>
        </Card>
        <Card className="gap-1">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Max safe rate</CardTitle>
          </CardHeader>
          <CardContent>
            {Number.isFinite(maxSwr) ? (
              <>
                <p className="text-3xl font-semibold tracking-tight tnum text-gain">{pctStr(maxSwr, 2)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">95% historical</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-semibold tracking-tight tnum text-muted-foreground">&mdash;</p>
                <p className="mt-0.5 text-sm text-muted-foreground">spending adapts to balance</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="gap-1">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Worst ending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tracking-tight tnum">{formatUsdCompact(result.endingBalances[0])}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{config.horizonYears}-yr horizon</p>
          </CardContent>
        </Card>
      </div>

      {/* Income variability — the real story for variable strategies. */}
      {config.strategy !== 'fixedReal' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="gap-1">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">First-year income</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight tnum">{formatUsdCompact(result.income.firstYearMedian)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">median, today's $</p>
            </CardContent>
          </Card>
          <Card className="gap-1">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">Worst year (median)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight tnum">{formatUsdCompact(result.income.worstYearMedian)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">typical deepest pay cut</p>
            </CardContent>
          </Card>
          <Card className="gap-1">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">Worst year (5th pct)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight tnum text-loss">{formatUsdCompact(result.income.worstYearP5)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">bad-luck floor</p>
            </CardContent>
          </Card>
          <Card className="gap-1">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">Pay cut odds</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight tnum">{pctStr(result.income.cutProbability)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                median {Math.round(result.income.yearsBelowStartMedian)} yrs below start
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Income over time — how deep and how long the cuts run. */}
      {config.strategy !== 'fixedReal' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Income over time
              <span className="ml-2 font-normal text-muted-foreground">
                annual withdrawals, today's dollars &middot; median with 25&ndash;75 and 5&ndash;95 bands
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={incomeFan!} exportName="fathom-montecarlo-income" className="h-72 w-full" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Balance over time
            <span className="ml-2 font-normal text-muted-foreground">median with 25–75 and 5–95 bands</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EChart option={fan} exportName="fathom-montecarlo" className="h-80 w-full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Ending balance distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <EChart option={hist} className="h-64 w-full" />
        </CardContent>
      </Card>

      {result.worstStarts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Worst starting years</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Retired in</TableHead>
                  <TableHead className="text-right">Ending balance</TableHead>
                  <TableHead className="text-right">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.worstStarts.map((w) => (
                  <TableRow key={w.label}>
                    <TableCell className="font-mono tnum">{w.label}</TableCell>
                    <TableCell className="text-right font-mono tnum">{formatUsd(w.endingBalance)}</TableCell>
                    <TableCell className="text-right font-mono tnum">
                      {w.depletedYear ? (
                        <span className="text-loss">depleted yr {w.depletedYear}</span>
                      ) : (
                        <span className="text-gain">survived</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
