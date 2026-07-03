import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { AllocationBuilder } from '@/components/allocation/AllocationBuilder'
import { ResultsPanel } from '@/components/backtest/ResultsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  limitingAssetLabel,
  useAllocationBacktests,
} from '@/hooks/useAllocationBacktests'
import {
  decodeAllocation,
  encodeAllocation,
  type AllocationSetup,
} from '@/lib/allocationState'

function withEditorDefaults(setup: AllocationSetup): AllocationSetup {
  if (setup.portfolios.length === 0) {
    return { ...setup, portfolios: [{ name: 'Portfolio 1', allocations: [] }] }
  }
  return setup
}

/**
 * Tool 2 — asset-allocation backtester over 100+ years of asset-class data.
 * Story: "Judge an allocation across every market era since 1871, in
 * nominal or real terms." Same state model as the ticker backtester:
 * URL is canonical, editor state preserves transient shapes.
 */
export function Allocation() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [builderOpen, setBuilderOpen] = useState(true)
  const [setup, setSetup] = useState<AllocationSetup>(() =>
    withEditorDefaults(decodeAllocation(searchParams)),
  )

  useEffect(() => {
    if (searchParams.toString() !== encodeAllocation(setup).toString()) {
      setSetup(withEditorDefaults(decodeAllocation(searchParams)))
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: AllocationSetup) => {
    setSetup(next)
    setSearchParams(encodeAllocation(next), { replace: true })
  }

  const output = useAllocationBacktests(setup)
  const showResults = output.runs.length > 0

  const builder = (
    <AllocationBuilder
      setup={setup}
      onChange={update}
      effectiveStart={output.effectiveStart}
      limitingAssetLabel={limitingAssetLabel(output.limitingAsset)}
    />
  )

  if (!showResults) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Backtest an allocation</h1>
        <p className="mt-2 mb-8 text-muted-foreground">
          Asset-class mixes over 150 years of market history &mdash; every
          panic, boom, and inflation era since 1871.
        </p>
        <Card>
          <CardContent>{builder}</CardContent>
        </Card>
        {output.error && <p className="mt-4 text-sm text-loss">{output.error}</p>}
        {output.loading && (
          <p className="mt-4 text-sm text-muted-foreground">Loading data&hellip;</p>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl px-6">
      {builderOpen && (
        <aside className="w-96 shrink-0 border-r py-8 pr-8">
          <div className="sticky top-20">{builder}</div>
        </aside>
      )}

      <main className="min-w-0 flex-1 py-8 pl-8">
        <div className="mb-3 -ml-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setBuilderOpen((v) => !v)}
          >
            {builderOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            {builderOpen ? 'Hide builder' : 'Edit portfolios'}
          </Button>
          {setup.real && (
            <span className="rounded border border-chart-3/40 px-2 py-0.5 font-mono text-sm text-chart-3">
              real (inflation-adjusted)
            </span>
          )}
        </div>
        {output.error ? (
          <p className="text-sm text-loss">{output.error}</p>
        ) : (
          <div className={`transition-opacity duration-200 ${output.loading ? 'opacity-60' : ''}`}>
            <ResultsPanel runs={output.runs} showIncome={false} />
          </div>
        )}
      </main>
    </div>
  )
}
