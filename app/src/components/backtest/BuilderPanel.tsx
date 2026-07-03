import { useState } from 'react'
import { ChevronDown, Plus, Scale, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { getCatalog, lookup } from '@/data/catalog'
import type { PortfolioSpec, RebalanceFrequency } from '@/engine'
import type { BacktestSetup } from '@/lib/urlState'
import { DatePicker } from './DatePicker'
import { TickerPicker } from './TickerPicker'

interface BuilderPanelProps {
  setup: BacktestSetup
  onChange: (next: BacktestSetup) => void
  /** From useBacktests — for the "Limited by QQQ (inception ...)" hint. */
  effectiveStart: string | null
  limitingTicker: string | null
}

const monthName = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

export function weightSum(p: PortfolioSpec): number {
  return Math.round(p.allocations.reduce((s, a) => s + a.weight, 0) * 100) / 100
}

function PortfolioEditor({
  portfolio,
  index,
  onChange,
  onRemove,
}: {
  portfolio: PortfolioSpec
  index: number
  onChange: (p: PortfolioSpec) => void
  onRemove: (() => void) | null
}) {
  const sum = weightSum(portfolio)
  const balanced = Math.abs(sum - 100) < 0.005

  const setWeight = (i: number, weight: number) => {
    const allocations = portfolio.allocations.map((a, j) => (j === i ? { ...a, weight } : a))
    onChange({ ...portfolio, allocations })
  }

  const equalize = () => {
    const n = portfolio.allocations.length
    if (n === 0) return
    const even = Math.floor(10000 / n) / 100
    const allocations = portfolio.allocations.map((a, i) => ({
      ...a,
      weight: i === 0 ? Math.round((100 - even * (n - 1)) * 100) / 100 : even,
    }))
    onChange({ ...portfolio, allocations })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: `var(--chart-${index + 1})` }}
          />
          {portfolio.name}
        </h3>
        <div className="flex items-center gap-1">
          {!balanced && portfolio.allocations.length > 0 && (
            <Button variant="ghost" size="xs" onClick={equalize}>
              <Scale />
              Balance
            </Button>
          )}
          {onRemove && (
            <Button variant="ghost" size="icon-xs" aria-label={`Remove ${portfolio.name}`} onClick={onRemove}>
              <X />
            </Button>
          )}
        </div>
      </div>

      {portfolio.allocations.map((a, i) => {
        const entry = lookup(a.ticker)
        return (
          <div key={a.ticker} className="group flex items-center gap-2">
            <span className="w-16 shrink-0 font-mono font-medium">{a.ticker}</span>
            {entry && (
              <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                {entry.type}
              </Badge>
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {entry?.name ?? ''}
            </span>
            <div className="relative w-24 shrink-0">
              <Input
                type="number"
                min={0}
                max={100}
                step={5}
                value={Number.isFinite(a.weight) ? a.weight : ''}
                onChange={(e) => setWeight(i, Number(e.target.value))}
                className="pr-7 text-right font-mono tnum"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${a.ticker}`}
              className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={() =>
                onChange({
                  ...portfolio,
                  allocations: portfolio.allocations.filter((_, j) => j !== i),
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        )
      })}

      <TickerPicker
        exclude={portfolio.allocations.map((a) => a.ticker)}
        autoFocus={index === 0 && portfolio.allocations.length === 0}
        onPick={(entry) => {
          const remaining = Math.round((100 - sum) * 100) / 100
          let allocations
          if (portfolio.allocations.length === 0) {
            allocations = [{ ticker: entry.ticker, weight: 100 }]
          } else if (remaining > 0) {
            // There's unallocated room — the new ticker takes it.
            allocations = [...portfolio.allocations, { ticker: entry.ticker, weight: remaining }]
          } else {
            // Portfolio is already fully allocated — split evenly so adding
            // a ticker always yields a runnable portfolio (smart default).
            const n = portfolio.allocations.length + 1
            const even = Math.floor(10000 / n) / 100
            allocations = [...portfolio.allocations, { ticker: entry.ticker, weight: 0 }].map(
              (a, i) => ({
                ...a,
                weight: i === 0 ? Math.round((100 - even * (n - 1)) * 100) / 100 : even,
              }),
            )
          }
          onChange({ ...portfolio, allocations })
        }}
      />

      {portfolio.allocations.length > 0 && !balanced && (
        <p className="text-sm text-loss">
          Weights total <span className="font-mono tnum">{sum}%</span> — must equal 100%.
        </p>
      )}
    </div>
  )
}

export function BuilderPanel({ setup, onChange, effectiveStart, limitingTicker }: BuilderPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(
    setup.config.initialAmount !== 10_000 ||
      setup.config.monthlyContribution !== 0 ||
      !setup.config.reinvestDividends ||
      setup.benchmark !== null,
  )

  const updatePortfolio = (i: number, p: PortfolioSpec) => {
    const portfolios = setup.portfolios.map((old, j) => (j === i ? p : old))
    onChange({ ...setup, portfolios })
  }

  const limitingEntry = limitingTicker ? lookup(limitingTicker) : null

  return (
    <div className="space-y-6">
      {setup.portfolios.map((p, i) => (
        <PortfolioEditor
          key={i}
          portfolio={p}
          index={i}
          onChange={(next) => updatePortfolio(i, next)}
          onRemove={
            setup.portfolios.length > 1
              ? () =>
                  onChange({
                    ...setup,
                    portfolios: setup.portfolios
                      .filter((_, j) => j !== i)
                      .map((q, j) => ({ ...q, name: `Portfolio ${j + 1}` })),
                  })
              : null
          }
        />
      ))}

      {setup.portfolios.length < 3 && (
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={() =>
            onChange({
              ...setup,
              portfolios: [
                ...setup.portfolios,
                { name: `Portfolio ${setup.portfolios.length + 1}`, allocations: [] },
              ],
            })
          }
        >
          <Plus />
          Compare another portfolio
        </Button>
      )}

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="start">Start</Label>
          <DatePicker
            id="start"
            value={setup.config.start}
            placeholder="Earliest"
            onChange={(v) => onChange({ ...setup, config: { ...setup.config, start: v } })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end">End</Label>
          <DatePicker
            id="end"
            value={setup.config.end}
            placeholder="Latest"
            onChange={(v) => onChange({ ...setup, config: { ...setup.config, end: v } })}
          />
        </div>
      </div>
      {limitingEntry && effectiveStart && (
        <p className="-mt-3 text-sm text-muted-foreground">
          Using max available history &mdash; limited by{' '}
          <span className="font-mono">{limitingEntry.ticker}</span>, inception{' '}
          {monthName(effectiveStart)}.
        </p>
      )}

      {/* Advanced — collapsed by default (progressive disclosure) */}
      <div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <ChevronDown
            className={`size-4 transition-transform ${showAdvanced ? '' : '-rotate-90'}`}
          />
          Advanced
        </button>

        {showAdvanced && (
          <div className="animate-enter mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amt">Initial amount</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="amt"
                    type="number"
                    min={1}
                    step={1000}
                    value={setup.config.initialAmount}
                    onChange={(e) =>
                      onChange({
                        ...setup,
                        config: { ...setup.config, initialAmount: Number(e.target.value) || 10_000 },
                      })
                    }
                    className="pl-7 font-mono tnum"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contrib">Monthly contribution</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="contrib"
                    type="number"
                    step={100}
                    value={setup.config.monthlyContribution}
                    onChange={(e) =>
                      onChange({
                        ...setup,
                        config: {
                          ...setup.config,
                          monthlyContribution: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="pl-7 font-mono tnum"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rebalancing</Label>
                <Select
                  value={setup.config.rebalance}
                  onValueChange={(v) =>
                    onChange({
                      ...setup,
                      config: { ...setup.config, rebalance: v as RebalanceFrequency },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="annual">Annually</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Benchmark</Label>
                <Select
                  value={setup.benchmark ?? 'none'}
                  onValueChange={(v) => onChange({ ...setup, benchmark: v === 'none' ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {getCatalog().map((e) => (
                      <SelectItem key={e.ticker} value={e.ticker}>
                        {e.ticker}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="reinvest"
                checked={setup.config.reinvestDividends}
                onCheckedChange={(v) =>
                  onChange({ ...setup, config: { ...setup.config, reinvestDividends: v } })
                }
              />
              <Label htmlFor="reinvest" className="font-normal">
                Reinvest dividends
                <span className="ml-2 text-muted-foreground">
                  {setup.config.reinvestDividends ? 'total return' : 'dividends held as cash'}
                </span>
              </Label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
