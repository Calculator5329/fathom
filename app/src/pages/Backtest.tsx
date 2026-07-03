import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { BuilderPanel, weightSum } from '@/components/backtest/BuilderPanel'
import { ResultsPanel } from '@/components/backtest/ResultsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { loadCatalog } from '@/data/catalog'
import { useBacktests } from '@/hooks/useBacktests'
import { decodeSetup, encodeSetup, type BacktestSetup } from '@/lib/urlState'

/**
 * Screens B + C — builder and results share this route; the entire setup
 * lives in the URL so every backtest is reproducible by link.
 * Story: "Define 1–3 portfolios in under 30 seconds, judge them at a
 * glance, then dig arbitrarily deep."
 */
export function Backtest() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [catalogReady, setCatalogReady] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(true)

  useEffect(() => {
    loadCatalog().then(() => setCatalogReady(true))
  }, [])

  const setup = useMemo(() => {
    const s = decodeSetup(searchParams)
    if (s.portfolios.length === 0) {
      s.portfolios = [{ name: 'Portfolio 1', allocations: [] }]
    }
    return s
  }, [searchParams])

  const update = (next: BacktestSetup) => {
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
    <div className="mx-auto flex max-w-7xl gap-6 px-6 py-8">
      {/* Docked builder — collapsible so results can take the full width. */}
      {builderOpen && (
        <aside className="w-96 shrink-0">
          <Card className="sticky top-20">
            <CardContent>{builder}</CardContent>
          </Card>
        </aside>
      )}

      <main className="min-w-0 flex-1">
        <div className="mb-2 -ml-2">
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
