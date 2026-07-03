import { useState } from 'react'
import { ChevronDown, Plus, Scale, Trash2, X } from 'lucide-react'
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
import { ASSET_CLASSES, assetClass } from '@/data/assetClasses'
import type { PortfolioSpec, RebalanceFrequency } from '@/engine'
import type { AllocationSetup } from '@/lib/allocationState'
import { DatePicker } from '@/components/backtest/DatePicker'

interface AllocationBuilderProps {
  setup: AllocationSetup
  onChange: (next: AllocationSetup) => void
  effectiveStart: string | null
  limitingAssetLabel: string | null
}

const monthName = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

function weightSum(p: PortfolioSpec): number {
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
  const available = ASSET_CLASSES.filter(
    (a) => !portfolio.allocations.some((x) => x.ticker === a.id),
  )

  const equalizeAll = (allocations: PortfolioSpec['allocations']) => {
    const n = allocations.length
    const even = Math.floor(10000 / n) / 100
    return allocations.map((a, i) => ({
      ...a,
      weight: i === 0 ? Math.round((100 - even * (n - 1)) * 100) / 100 : even,
    }))
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
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onChange({ ...portfolio, allocations: equalizeAll(portfolio.allocations) })}
            >
              <Scale />
              Balance
            </Button>
          )}
          {onRemove && (
            <Button variant="ghost" size="icon-xs" aria-label="Remove portfolio" onClick={onRemove}>
              <X />
            </Button>
          )}
        </div>
      </div>

      {portfolio.allocations.map((a, i) => {
        const meta = assetClass(a.ticker)
        return (
          <div key={a.ticker} className="group flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{meta?.label ?? a.ticker}</span>
            <span className="hidden shrink-0 font-mono text-sm text-muted-foreground sm:inline">
              {meta?.startDate.slice(0, 4)}&ndash;
            </span>
            <div className="relative w-24 shrink-0">
              <Input
                type="number"
                min={0}
                max={100}
                step={5}
                value={Number.isFinite(a.weight) ? a.weight : ''}
                onChange={(e) =>
                  onChange({
                    ...portfolio,
                    allocations: portfolio.allocations.map((x, j) =>
                      j === i ? { ...x, weight: Number(e.target.value) } : x,
                    ),
                  })
                }
                className="pr-7 text-right font-mono tnum"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${meta?.label ?? a.ticker}`}
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

      {available.length > 0 && (
        <Select
          value=""
          onValueChange={(id) => {
            const remaining = Math.round((100 - sum) * 100) / 100
            let allocations
            if (portfolio.allocations.length === 0) {
              allocations = [{ ticker: id, weight: 100 }]
            } else if (remaining > 0) {
              allocations = [...portfolio.allocations, { ticker: id, weight: remaining }]
            } else {
              allocations = equalizeAll([...portfolio.allocations, { ticker: id, weight: 0 }])
            }
            onChange({ ...portfolio, allocations })
          }}
        >
          <SelectTrigger className="w-full text-muted-foreground">
            <SelectValue placeholder="Add asset class&hellip;" />
          </SelectTrigger>
          <SelectContent>
            {available.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <span className="flex w-full items-center justify-between gap-4">
                  {a.label}
                  <span className="font-mono text-sm text-muted-foreground">
                    {a.startDate.slice(0, 4)}&ndash;
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {portfolio.allocations.length > 0 && !balanced && (
        <p className="text-sm text-loss">
          Weights total <span className="font-mono tnum">{sum}%</span> &mdash; must equal 100%.
        </p>
      )}
    </div>
  )
}

export function AllocationBuilder({
  setup,
  onChange,
  effectiveStart,
  limitingAssetLabel,
}: AllocationBuilderProps) {
  const [showAdvanced, setShowAdvanced] = useState(
    setup.config.initialAmount !== 10_000 || setup.config.monthlyContribution !== 0,
  )

  return (
    <div className="space-y-6">
      {setup.portfolios.map((p, i) => (
        <PortfolioEditor
          key={i}
          portfolio={p}
          index={i}
          onChange={(next) =>
            onChange({
              ...setup,
              portfolios: setup.portfolios.map((old, j) => (j === i ? next : old)),
            })
          }
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

      <div className="flex items-center gap-3">
        <Switch
          id="real"
          checked={setup.real}
          onCheckedChange={(v) => onChange({ ...setup, real: v })}
        />
        <Label htmlFor="real" className="font-normal">
          Inflation-adjusted
          <span className="ml-2 text-muted-foreground">
            {setup.real ? 'real returns (CPI-deflated)' : 'nominal returns'}
          </span>
        </Label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="alloc-start">Start</Label>
          <DatePicker
            id="alloc-start"
            value={setup.config.start}
            placeholder="Earliest"
            fromYear={1871}
            onChange={(v) => onChange({ ...setup, config: { ...setup.config, start: v } })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alloc-end">End</Label>
          <DatePicker
            id="alloc-end"
            value={setup.config.end}
            placeholder="Latest"
            fromYear={1871}
            onChange={(v) => onChange({ ...setup, config: { ...setup.config, end: v } })}
          />
        </div>
      </div>
      {limitingAssetLabel && effectiveStart && (
        <p className="-mt-3 text-sm text-muted-foreground">
          Using max available history &mdash; limited by {limitingAssetLabel}, data from{' '}
          {monthName(effectiveStart)}.
        </p>
      )}

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
                <Label htmlFor="alloc-amt">Initial amount</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="alloc-amt"
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
                <Label htmlFor="alloc-contrib">Monthly contribution</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="alloc-contrib"
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
                <SelectTrigger className="w-full">
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
          </div>
        )}
      </div>
    </div>
  )
}
