import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { BuilderPanel, weightSum } from '@/components/backtest/BuilderPanel'
import { ResultsPanel } from '@/components/backtest/ResultsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { loadCatalog } from '@/data/catalog'
import { useBacktests } from '@/hooks/useBacktests'
import { decodeSetup, encodeSetup, type BacktestSetup } from '@/lib/urlState'

function withEditorDefaults(setup: BacktestSetup): BacktestSetup {
  if (setup.portfolios.length === 0) {
    return { ...setup, portfolios: [{ name: 'Portfolio 1', allocations: [] }] }
  }
  return setup
}

/**
 * Screens B + C — builder and results share this route; the setup lives in
 * the URL so every backtest is reproducible by link.
 * Story: "Define 1–3 portfolios in under 30 seconds, judge them at a
 * glance, then dig arbitrarily deep."
 *
 * State model: the canonical DATA is the URL, but the editor keeps local
 * state so transient shapes the URL can't express (an empty just-added
 * portfolio, a row awaiting its weight) survive while editing. External
 * navigation (back/forward, pasted link) re-syncs local state from the URL.
 */
export function Backtest() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [catalogReady, setCatalogReady] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(true)
  const [setup, setSetup] = useState<BacktestSetup>(() =>
    withEditorDefaults(decodeSetup(searchParams)),
  )

  useEffect(() => {
    loadCatalog().then(() => setCatalogReady(true))
  }, [])

  useEffect(() => {
    // Adopt the URL only when it diverges from what our state encodes to —
    // i.e. on external navigation, never on our own writes.
    if (searchParams.toString() !== encodeSetup(setup).toString()) {
      setSetup(withEditorDefaults(decodeSetup(searchParams)))
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: BacktestSetup) => {
    setSetup(next)
    setSearchParams(encodeSetup(next), { replace: true })
  }

  const output = useBacktests(setup)
  const hasValidPortfolio = setup.portfolios.some(
    (p) => p.allocations.length > 0 && Math.abs(weightSum(p) - 100) < 0.005,
  )
  const showResults = hasValidPortfolio && output.runs.length > 0

  if (!catalogReady) return null

  const builder = (
    <BuilderPanel
      setup={setup}
      onChange={update}
      effectiveStart={output.effectiveStart}
      limitingTicker={output.limitingTicker}
    />
  )

  // Empty state: centered builder, nothing else competing for attention.
  if (!showResults) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Backtest a portfolio</h1>
        <p className="mt-2 mb-8 text-muted-foreground">
          Add a ticker to see decades of performance instantly. Everything else
          has sensible defaults.
        </p>
        <Card>
          <CardContent>{builder}</CardContent>
        </Card>
        {output.error && <p className="mt-4 text-sm text-loss">{output.error}</p>}
        {output.loading && <p className="mt-4 text-sm text-muted-foreground">Loading data&hellip;</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl px-6">
      {/* Docked builder — a left rail with a full-height divider, so both
          the menu and the results have room to grow independently. */}
      {builderOpen && (
        <aside className="w-96 shrink-0 border-r py-8 pr-8">
          <div className="sticky top-20">{builder}</div>
        </aside>
      )}

      <main className="min-w-0 flex-1 py-8 pl-8">
        <div className="mb-3 -ml-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setBuilderOpen((v) => !v)}
          >
            {builderOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            {builderOpen ? 'Hide builder' : 'Edit portfolios'}
          </Button>
        </div>
        {output.error ? (
          <p className="text-sm text-loss">{output.error}</p>
        ) : (
          <ResultsPanel runs={output.runs} />
        )}
      </main>
    </div>
  )
}
