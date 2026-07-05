import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { loadSeries } from '@/data/catalog'
import { splitAdjustedCloses } from '@/lib/prices'

/**
 * Screen A — tool hub.
 * User story: "I want to immediately understand what this site does and
 * jump into a tool in one click."
 */
const TOOLS = [
  {
    to: '/backtest',
    title: 'Portfolio backtest',
    body: 'Compare up to three ticker portfolios over any date range, with full risk and income analysis.',
  },
  {
    to: '/allocation',
    title: 'Asset allocation',
    body: 'Backtest asset-class mixes across 150 years of market history, in nominal or inflation-adjusted terms.',
  },
  {
    to: '/montecarlo',
    title: 'Monte Carlo',
    body: 'Test a retirement plan against every market era in history — success odds, safe withdrawal rates, worst cases.',
  },
  {
    to: '/stock',
    title: 'Stock research',
    body: 'Long-run price with market-era context and fundamentals from SEC filings — revenue, margins, valuation.',
  },
  {
    to: '/projections',
    title: 'Stock projections',
    body: 'Model bear / base / bull cases for any stock and track the implied return versus today’s real price.',
  },
  {
    to: '/xray',
    title: 'Portfolio X-ray',
    body: 'Paste positions or your trade history — blended valuation, concentration, and your real TWR and IRR. Stays in your browser.',
  },
]

/**
 * A quiet SPY sparkline under the hero — real data as the first impression.
 * Inline SVG on purpose: pulling ECharts into the landing chunk would undo
 * the route code-splitting.
 */
function HeroSparkline() {
  const [path, setPath] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    loadSeries('SPY')
      .then((s) => {
        if (cancelled) return
        const adj = splitAdjustedCloses(s.records)
        // ~monthly samples across the full history.
        const step = Math.max(1, Math.floor(adj.length / 160))
        const pts: number[] = []
        for (let i = 0; i < adj.length; i += step) pts.push(adj[i])
        const min = Math.min(...pts)
        const max = Math.max(...pts)
        const d = pts
          .map((v, i) => {
            const x = (i / (pts.length - 1)) * 1000
            const y = 96 - ((v - min) / (max - min || 1)) * 92
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
          })
          .join('')
        setPath(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  if (!path) return null
  return (
    <svg
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      className="animate-enter mt-10 h-20 w-full"
      aria-hidden
    >
      <path d={`${path}L1000,100L0,100Z`} fill="var(--primary)" opacity="0.06" />
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.5" />
    </svg>
  )
}

export function Landing() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-5xl font-semibold tracking-tight">
        Understand any market decision with decades of real data.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Backtesting, allocation, retirement simulation, and stock projections —
        computed instantly, shareable by link, no account for the core tools.
      </p>
      <HeroSparkline />

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="group">
            <Card className="h-full transition-colors group-hover:bg-surface-2">
              <CardContent>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
                  <ArrowUpRight className="size-5 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                </div>
                <p className="mt-2 text-muted-foreground">{t.body}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
