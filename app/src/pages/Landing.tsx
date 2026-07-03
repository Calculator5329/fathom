import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Screen A — tool hub.
 * User story: "I want to immediately understand what this site does and
 * jump into a tool in one click."
 */
export function Landing() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-5xl font-semibold tracking-tight">
        Backtest portfolios with decades of real data.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Any stock, ETF, or mutual fund. Dividends, splits, rebalancing, and
        contributions — computed instantly, shareable by link, no account.
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <Link to="/backtest" className="group">
          <Card className="h-full transition-colors group-hover:bg-surface-2">
            <CardContent>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Portfolio backtest</h2>
                <ArrowUpRight className="size-5 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
              </div>
              <p className="mt-2 text-muted-foreground">
                Compare up to three ticker portfolios over any date range, with
                full risk and income analysis.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Card className="h-full opacity-60">
          <CardContent>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Asset allocation</h2>
              <span className="rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                soon
              </span>
            </div>
            <p className="mt-2 text-muted-foreground">
              Backtest asset-class mixes across 100+ years of market history.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
