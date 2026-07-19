import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts'
import { ResultsSkeleton } from '@/components/LoadingSkeletons'
import { TickerPicker } from '@/components/backtest/TickerPicker'
import { EChart, baseOption, cssVar } from '@/components/charts/EChart'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { loadCatalog } from '@/data/catalog'
import { useIncomePlan } from '@/hooks/useIncomePlan'
import { MONTH_LABELS, type IncomePlan } from '@/income/planner'
import { decodeIncome, encodeIncome, type IncomeSetup } from '@/income/urlState'
import { formatPct, formatUsd, formatUsdCompact } from '@/lib/format'

/**
 * Tool: Income — dividend income planner.
 * Story: "Given the portfolio I hold today, how much cash will it throw off
 * over the next year, and in which months?" No login: the whole plan lives in
 * the URL and is computed from the dividend history already in the ticker data.
 */

const SAMPLE: IncomeSetup = {
  holdings: [
    { ticker: 'SCHD', weight: 40 },
    { ticker: 'VYM', weight: 35 },
    { ticker: 'JEPI', weight: 25 },
  ],
  totalValue: 100_000,
}

function monthlyIncomeOption(plan: IncomePlan): EChartsCoreOption {
  const base = baseOption()
  const accent = cssVar('--chart-1')
  return {
    ...base,
    color: [accent],
    xAxis: { ...(base.xAxis as object), type: 'category', data: [...MONTH_LABELS] },
    yAxis: {
      ...(base.yAxis as object),
      type: 'value',
      axisLabel: {
        ...(base.yAxis as { axisLabel: object }).axisLabel,
        formatter: (v: number) => formatUsdCompact(v),
      },
    },
    tooltip: {
      ...(base.tooltip as object),
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: unknown) => (v == null ? '—' : formatUsd(v as number)),
    },
    series: [
      {
        name: 'Income',
        type: 'bar',
        barMaxWidth: 30,
        data: plan.monthly.map((v) => Math.round(v * 100) / 100),
        itemStyle: { color: accent, borderRadius: [3, 3, 0, 0] },
        emphasis: { disabled: true },
      },
    ],
  }
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-surface-2 px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tnum">{value}</p>
      {sub && <p className="mt-0.5 text-sm text-muted-foreground tnum">{sub}</p>}
    </div>
  )
}

function Builder({
  setup,
  onChange,
}: {
  setup: IncomeSetup
  onChange: (next: IncomeSetup, structural: boolean) => void
}) {
  const held = setup.holdings.map((h) => h.ticker)

  const addTicker = (ticker: string) => {
    if (held.includes(ticker)) return
    onChange({ ...setup, holdings: [...setup.holdings, { ticker, weight: 0 }] }, true)
  }
  const removeTicker = (ticker: string) => {
    onChange({ ...setup, holdings: setup.holdings.filter((h) => h.ticker !== ticker) }, true)
  }
  const setWeight = (ticker: string, weight: number) => {
    onChange(
      {
        ...setup,
        holdings: setup.holdings.map((h) => (h.ticker === ticker ? { ...h, weight } : h)),
      },
      false,
    )
  }
  const setTotal = (totalValue: number) => onChange({ ...setup, totalValue }, false)

  const sumWeights = setup.holdings.reduce((s, h) => s + (h.weight || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-sm text-muted-foreground" htmlFor="income-total">
          Portfolio value
        </label>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-muted-foreground">$</span>
          <Input
            id="income-total"
            type="number"
            min={0}
            step={1000}
            className="font-mono tnum"
            value={setup.totalValue}
            onChange={(e) => setTotal(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm text-muted-foreground">Holdings</p>
        <TickerPicker placeholder="Add a holding — e.g. SCHD, KO, JEPI" exclude={held} onPick={(e) => addTicker(e.ticker)} />
        {setup.holdings.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {setup.holdings.map((h) => (
              <li key={h.ticker} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-mono font-medium">{h.ticker}</span>
                <div className="relative flex-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    aria-label={`${h.ticker} weight`}
                    className="pr-7 font-mono tnum"
                    value={h.weight}
                    onChange={(e) => setWeight(h.ticker, Math.max(0, Number(e.target.value) || 0))}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
                    %
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${h.ticker}`}
                  className="text-muted-foreground transition-colors hover:text-loss"
                  onClick={() => removeTicker(h.ticker)}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {setup.holdings.length > 0 && Math.abs(sumWeights - 100) > 0.01 && (
          <p className="mt-2 text-sm text-muted-foreground tnum">
            Weights sum to {sumWeights.toFixed(0)}% — allocated proportionally.
          </p>
        )}
      </div>
    </div>
  )
}

function Results({ plan }: { plan: IncomePlan }) {
  const monthlyAvg = plan.annualIncome / 12
  const payers = plan.holdings.filter((h) => h.hasDividends)
  const option = useMemo(() => monthlyIncomeOption(plan), [plan])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Forward annual income"
          value={formatUsd(plan.annualIncome)}
          sub={`on ${formatUsd(plan.totalValue)}`}
        />
        <StatTile label="Portfolio yield" value={formatPct(plan.portfolioYield, { dp: 2 })} sub="trailing 12-mo" />
        <StatTile label="Avg. monthly" value={formatUsd(monthlyAvg)} sub="income / 12" />
      </div>

      <Card>
        <CardContent>
          <p className="mb-1 text-sm font-medium">Income by month</p>
          <p className="mb-3 text-sm text-muted-foreground">
            Next 12 months, mapped to the months each holding has historically paid.
          </p>
          <EChart option={option} exportName="fathom-monthly-income" className="h-64 w-full" />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">By holding</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">Ticker</th>
                  <th className="py-2 pr-3 text-right font-medium">Value</th>
                  <th className="py-2 pr-3 text-right font-medium">Yield</th>
                  <th className="py-2 pr-3 text-right font-medium">Annual income</th>
                  <th className="py-2 text-right font-medium">% of income</th>
                </tr>
              </thead>
              <tbody>
                {plan.holdings.map((h) => (
                  <tr key={h.ticker} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-mono font-medium">{h.ticker}</span>
                      {h.name && (
                        <span className="ml-2 hidden text-muted-foreground sm:inline">{h.name}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tnum">{formatUsd(h.value)}</td>
                    <td className="py-2 pr-3 text-right font-mono tnum">
                      {h.hasDividends ? formatPct(h.forwardYield, { dp: 2 }) : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tnum">{formatUsd(h.annualIncome)}</td>
                    <td className="py-2 text-right font-mono tnum text-muted-foreground">
                      {plan.annualIncome > 0
                        ? formatPct(h.annualIncome / plan.annualIncome, { dp: 0 })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3 text-right font-mono tnum">{formatUsd(plan.totalValue)}</td>
                  <td className="py-2 pr-3 text-right font-mono tnum">
                    {formatPct(plan.portfolioYield, { dp: 2 })}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tnum">{formatUsd(plan.annualIncome)}</td>
                  <td className="py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
          {payers.length < plan.holdings.length && (
            <p className="mt-3 text-sm text-muted-foreground">
              Holdings with no dividends in the last 12 months contribute no income.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function Income() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [catalogReady, setCatalogReady] = useState(false)
  const [setup, setSetup] = useState<IncomeSetup>(() => decodeIncome(searchParams))

  useEffect(() => {
    loadCatalog().then(() => setCatalogReady(true))
  }, [])

  useEffect(() => {
    // Adopt the URL only on external navigation (back/forward, pasted link).
    if (searchParams.toString() !== encodeIncome(setup).toString()) {
      setSetup(decodeIncome(searchParams))
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: IncomeSetup, structural: boolean) => {
    setSetup(next)
    setSearchParams(encodeIncome(next), { replace: !structural })
  }

  const { plan, loading, error } = useIncomePlan(setup)
  const hasHoldings = setup.holdings.some((h) => h.weight > 0)

  if (!catalogReady) return null

  const builder = <Builder setup={setup} onChange={update} />

  // Empty state: a centered builder, with one tap to load a sample portfolio.
  if (!hasHoldings) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Dividend income planner</h1>
        <p className="mt-2 mb-8 text-muted-foreground">
          Add the holdings you own today to see the forward annual income they throw off and how
          it lands across the calendar year.
        </p>
        <Card>
          <CardContent>
            {builder}
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 -ml-2 text-muted-foreground"
              onClick={() => update(SAMPLE, true)}
            >
              Try a sample dividend portfolio
            </Button>
          </CardContent>
        </Card>
        {error && <p className="mt-4 text-sm text-loss">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col px-6 lg:flex-row">
      <aside className="border-b py-6 lg:w-96 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-8 lg:pr-8">
        <div className="lg:sticky lg:top-20">
          <h1 className="mb-4 text-xl font-semibold tracking-tight">Income planner</h1>
          {builder}
        </div>
      </aside>
      <main className="min-w-0 flex-1 py-6 lg:py-8 lg:pl-8">
        {error ? (
          <p className="text-sm text-loss">{error}</p>
        ) : !plan ? (
          <ResultsSkeleton cards={2} />
        ) : (
          <div className={`transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
            <Results plan={plan} />
          </div>
        )}
      </main>
    </div>
  )
}
