import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { ResultsSkeleton } from '@/components/LoadingSkeletons'
import { BuilderPanel } from '@/components/backtest/BuilderPanel'
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
    // Structural changes (tickers/portfolios added or removed) PUSH so the
    // back button steps through meaningful checkpoints; continuous tweaks
    // (weights, dates, toggles) REPLACE so history doesn't flood.
    const structural = (s: BacktestSetup) =>
      s.portfolios.map((p) => p.allocations.map((a) => a.ticker).join(',')).join('|')
    const replace = structural(next) === structural(setup)
    setSetup(next)
    setSearchParams(encodeSetup(next), { replace })
  }

  const output = useBacktests(setup)
  const showResults = output.runs.length > 0

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
        {output.loading && <ResultsSkeleton cards={2} />}
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col px-6 lg:flex-row">
      {/* Docked builder — a left rail with a full-height divider, so both
          the menu and the results have room to grow independently. Stacks
          above the results on narrow screens. */}
      {builderOpen && (
        <aside className="border-b py-6 lg:w-96 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-8 lg:pr-8">
          <div className="lg:sticky lg:top-20">{builder}</div>
        </aside>
      )}

      <main className="min-w-0 flex-1 py-6 lg:py-8 lg:pl-8">
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
          <div
            className={`transition-opacity duration-200 ${output.loading ? 'opacity-60' : ''}`}
          >
            <ResultsPanel runs={output.runs} />
          </div>
        )}
      </main>
    </div>
  )
}
