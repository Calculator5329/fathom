import { useMemo, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { EChart } from '@/components/charts/EChart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatUsd } from '@/lib/format'
import { projectionChartOption } from './chart'
import {
  currentImpliedMargin,
  projectScenario,
  SCENARIO_KEYS,
  SCENARIO_LABELS,
  type Projection,
  type ScenarioAssumptions,
  type ScenarioKey,
} from './model'

const pct = (v: number, dp = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(dp)}%`

const scenarioAccent: Record<ScenarioKey, string> = {
  bear: 'var(--loss)',
  base: 'var(--chart-2)',
  bull: 'var(--primary)',
}

// Assumption rows: label + the field + whether the UI shows it as a percent.
const ROWS: Array<{ label: string; field: keyof ScenarioAssumptions; percent: boolean; suffix: string }> = [
  { label: 'Revenue growth', field: 'revenueGrowth', percent: true, suffix: '%' },
  { label: 'Net margin', field: 'netMargin', percent: true, suffix: '%' },
  { label: 'Exit P/E', field: 'exitPe', percent: false, suffix: '×' },
  { label: 'Dividend yield', field: 'dividendYield', percent: true, suffix: '%' },
  { label: 'Buyback yield', field: 'buybackYield', percent: true, suffix: '%' },
]

interface ProjectionEditorProps {
  draft: Projection
  currentPrice: number | null
  priceAsOf: string | null
  onChange: (next: Projection) => void
  onSave: () => void
  onDelete: (() => void) | null
  saving: boolean
  dirty: boolean
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  step?: number
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="pr-8 font-mono tnum"
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export function ProjectionEditor({
  draft,
  currentPrice,
  priceAsOf,
  onChange,
  onSave,
  onDelete,
  saving,
  dirty,
}: ProjectionEditorProps) {
  const [showNotes, setShowNotes] = useState(!!draft.notes)
  const hasLivePrice = currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0
  const usingManualPrice = draft.manualPrice || !hasLivePrice
  const effectiveCurrentPrice = usingManualPrice ? draft.inputs.currentPrice : currentPrice
  const shownCurrentPrice = usingManualPrice ? draft.inputs.currentPrice : effectiveCurrentPrice

  // Model inputs use live price unless this thesis explicitly overrides it.
  const inputs = useMemo(
    () => ({ ...draft.inputs, currentPrice: effectiveCurrentPrice }),
    [draft.inputs, effectiveCurrentPrice],
  )
  const chart = useMemo(
    () => projectionChartOption(inputs, draft.scenarios),
    [inputs, draft.scenarios],
  )
  const impliedMargin = currentImpliedMargin(inputs)

  const setInput = (field: keyof Projection['inputs'], v: number) =>
    onChange({ ...draft, inputs: { ...draft.inputs, [field]: v } })

  const setScenario = (k: ScenarioKey, field: keyof ScenarioAssumptions, uiValue: number, percent: boolean) =>
    onChange({
      ...draft,
      scenarios: {
        ...draft.scenarios,
        [k]: { ...draft.scenarios[k], [field]: percent ? uiValue / 100 : uiValue },
      },
    })

  const setManualPrice = (checked: boolean) => {
    if (!hasLivePrice) return
    onChange({
      ...draft,
      manualPrice: checked,
      inputs: {
        ...draft.inputs,
        currentPrice: checked ? draft.inputs.currentPrice : currentPrice,
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header: ticker + current price + save/delete */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-2xl font-semibold tracking-tight">{draft.ticker}</h2>
          {hasLivePrice ? (
            <p className="text-sm text-muted-foreground">
              {usingManualPrice ? 'Manual price' : 'Current'}{' '}
              <span className="font-mono tnum text-foreground">{formatUsd(effectiveCurrentPrice)}</span>
              {priceAsOf && <span className="ml-1">as of {priceAsOf}</span>}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Manual price <span className="font-mono tnum text-foreground">{formatUsd(effectiveCurrentPrice)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 />
              Delete
            </Button>
          )}
          <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
            <Save />
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </div>

      {/* Base inputs */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-medium">
              Company inputs
              <span className="ml-2 font-normal text-muted-foreground">most recent annual figures</span>
            </CardTitle>
            {!hasLivePrice && (
              <p className="mt-1 text-sm text-muted-foreground">
                No live cached quote available.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <Label htmlFor="manual-price" className="text-sm font-normal text-muted-foreground">
              Manual price
            </Label>
            <Switch
              id="manual-price"
              size="sm"
              checked={usingManualPrice}
              disabled={!hasLivePrice}
              onCheckedChange={setManualPrice}
            />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <NumField
            label="Current price"
            value={shownCurrentPrice}
            step={0.01}
            disabled={!usingManualPrice}
            onChange={(v) => setInput('currentPrice', Math.max(0, v))}
          />
          <NumField label="Revenue ($M)" value={draft.inputs.baseRevenue} step={100} onChange={(v) => setInput('baseRevenue', v)} />
          <NumField label="Net income ($M)" value={draft.inputs.netIncome} step={10} onChange={(v) => setInput('netIncome', v)} />
          <NumField label="Shares out (M)" value={draft.inputs.sharesOut} step={10} onChange={(v) => setInput('sharesOut', v)} />
          <NumField label="Horizon (yrs)" value={draft.inputs.horizonYears} onChange={(v) => setInput('horizonYears', Math.max(1, Math.min(30, Math.round(v))))} suffix="y" />
          {impliedMargin != null && (
            <p className="col-span-full text-sm text-muted-foreground">
              Current net margin{' '}
              <span className="font-mono tnum text-foreground">{(impliedMargin * 100).toFixed(1)}%</span>
              {' '}— your scenario margins compound from here.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Scenario matrix */}
      <Card>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="pb-3 text-left text-sm font-normal text-muted-foreground">Assumption</th>
                  {SCENARIO_KEYS.map((k) => (
                    <th key={k} className="pb-3 text-right">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className="inline-block size-2.5 rounded-full" style={{ background: scenarioAccent[k] }} />
                        {SCENARIO_LABELS[k]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.field}>
                    <td className="py-1.5 text-muted-foreground">{row.label}</td>
                    {SCENARIO_KEYS.map((k) => {
                      const raw = draft.scenarios[k][row.field]
                      const shown = row.percent ? Math.round(raw * 1000) / 10 : raw
                      return (
                        <td key={k} className="py-1.5 pl-3">
                          <div className="relative ml-auto w-28">
                            <Input
                              type="number"
                              step={row.field === 'exitPe' ? 1 : 0.5}
                              value={shown}
                              onChange={(e) => setScenario(k, row.field, Number(e.target.value), row.percent)}
                              className="pr-7 text-right font-mono tnum"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
                              {row.suffix}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* Outcomes */}
                <tr className="border-t">
                  <td className="pt-3 font-medium">Target price</td>
                  {SCENARIO_KEYS.map((k) => (
                    <td key={k} className="pt-3 text-right font-mono tnum">
                      {formatUsd(projectScenario(inputs, draft.scenarios[k]).targetPrice)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1.5 font-medium">{draft.inputs.horizonYears}-yr CAGR</td>
                  {SCENARIO_KEYS.map((k) => {
                    const c = projectScenario(inputs, draft.scenarios[k]).totalCagr
                    return (
                      <td key={k} className={`py-1.5 text-right font-mono tnum ${c < 0 ? 'text-loss' : 'text-gain'}`}>
                        {pct(c)}
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <td className="text-muted-foreground">Total upside</td>
                  {SCENARIO_KEYS.map((k) => {
                    const u = projectScenario(inputs, draft.scenarios[k]).totalUpside
                    return (
                      <td key={k} className={`text-right font-mono tnum ${u < 0 ? 'text-loss' : 'text-gain'}`}>
                        {pct(u, 0)}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Implied price path</CardTitle>
        </CardHeader>
        <CardContent>
          <EChart option={chart} className="h-72 w-full" />
        </CardContent>
      </Card>

      {/* Notes */}
      <div>
        {showNotes ? (
          <div className="space-y-1.5">
            <Label htmlFor="notes">Thesis notes</Label>
            <textarea
              id="notes"
              value={draft.notes}
              onChange={(e) => onChange({ ...draft, notes: e.target.value.slice(0, 5000) })}
              placeholder="Why this thesis? Key risks, catalysts, what would change your mind…"
              className="min-h-24 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowNotes(true)}>
            + Add thesis notes
          </Button>
        )}
      </div>
    </div>
  )
}
