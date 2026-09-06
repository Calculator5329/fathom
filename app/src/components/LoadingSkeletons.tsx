import { Skeleton } from '@/components/ui/skeleton'

/**
 * Shared loading placeholders so pages never fall back to bare "Loading…"
 * text.
 *
 * The rule they follow: a placeholder may only promise layout the settled
 * page actually renders. A route-level fallback of metric cards + chart is a
 * lie on every route that settles into a centered builder card — the promised
 * dashboard vanishes and every element jumps position — so PageSkeleton picks
 * its shape from the route it is standing in for.
 */

/** The three layouts every route in this app settles into. */
export type RouteSkeletonShape =
  /** Centered narrow card: the empty builder / picker states. */
  | 'entry'
  /** Builder rail + results: backtest, allocation, income, monte carlo with a setup in the URL. */
  | 'workbench'
  /** Generic wide page: landing, projections, links, x-ray, stock detail, styleguide. */
  | 'page'

const hasAny = (params: URLSearchParams, keys: string[]) =>
  keys.some((k) => (params.get(k) ?? '') !== '')

/**
 * Which shape a route settles into, decided the same way the pages decide it:
 * the builder routes render their empty state until the URL carries a
 * portfolio, because the URL is the canonical setup (see lib/urlState).
 * Pure — pathname + search in, shape out — so it stays checkable in isolation.
 */
export function shapeForRoute(pathname: string, search = ''): RouteSkeletonShape {
  const path = pathname.replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1')
  const params = new URLSearchParams(search)

  switch (path) {
    // Backtest / allocation: `p1`…`p3` hold the portfolios.
    case '/backtest':
    case '/allocation':
      return hasAny(params, ['p1', 'p2', 'p3']) ? 'workbench' : 'entry'
    // Income: `p` holds the holdings.
    case '/income':
      return hasAny(params, ['p']) ? 'workbench' : 'entry'
    // Monte carlo has no empty state — the rail and results are always there.
    case '/montecarlo':
      return 'workbench'
    // Research lands on a bare ticker picker; /stock/:symbol is a full page.
    case '/stock':
      return 'entry'
    default:
      return 'page'
  }
}

/**
 * Read the location at render time instead of via useLocation: this renders
 * as a Suspense fallback, which only mounts once the history entry has
 * already changed, and staying hook-free keeps the component usable outside
 * a Router.
 */
function currentShape(): RouteSkeletonShape {
  if (typeof window === 'undefined') return 'page'
  return shapeForRoute(window.location.pathname, window.location.search)
}

/** Two muted lines standing in for a page's lede paragraph. */
function LedeSkeleton() {
  return (
    <div className="mt-3 space-y-2">
      <Skeleton className="h-5 w-full rounded-md" />
      <Skeleton className="h-5 w-3/4 rounded-md" />
    </div>
  )
}

/** The builder's own controls: a ticker row, a second-portfolio button, dates. */
function BuilderFormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-28 rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
      <Skeleton className="h-9 w-56 rounded-md" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-12 rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
      <Skeleton className="h-5 w-24 rounded-md" />
    </div>
  )
}

/**
 * Empty-state shape: the narrow centered column the builder routes render
 * before there is anything to show (max-w-xl, heading, lede, one card).
 */
function EntrySkeleton() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16" data-skeleton="entry">
      <Skeleton className="h-9 w-80 max-w-full rounded-md" />
      <LedeSkeleton />
      <div className="mt-8 rounded-xl border bg-card py-4 shadow-sm">
        <div className="px-5">
          <BuilderFormSkeleton />
        </div>
      </div>
    </div>
  )
}

/**
 * Working shape: the docked builder rail plus a results column of metric
 * cards and charts, mirroring the pages that settle there.
 */
function WorkbenchSkeleton() {
  return (
    <div
      className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col px-6 lg:flex-row"
      data-skeleton="workbench"
    >
      <aside className="border-b py-6 lg:w-96 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-8 lg:pr-8">
        <BuilderFormSkeleton />
      </aside>
      <main className="min-w-0 flex-1 py-6 lg:py-8 lg:pl-8">
        <Skeleton className="mb-3 h-8 w-32 rounded-md" />
        <MetricsAndChartSkeleton cards={4} />
      </main>
    </div>
  )
}

/**
 * Generic page shape: heading, lede, one panel. Deliberately promises a
 * single block rather than a metric grid, because these routes differ too
 * much for a shared placeholder to claim more than that.
 */
function PageShellSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12" data-skeleton="page">
      <Skeleton className="h-8 w-64 max-w-full rounded-md" />
      <LedeSkeleton />
      <Skeleton className="mt-8 h-80 rounded-xl" />
    </div>
  )
}

/**
 * Route-level fallback for a lazily loaded page. `shape` overrides the shape
 * derived from the current URL, for a caller that already knows what it is
 * about to render.
 */
export function PageSkeleton({ shape }: { shape?: RouteSkeletonShape } = {}) {
  switch (shape ?? currentShape()) {
    case 'entry':
      return <EntrySkeleton />
    case 'workbench':
      return <WorkbenchSkeleton />
    default:
      return <PageShellSkeleton />
  }
}

/**
 * The metric cards + chart card a results panel settles into: the chart lives
 * in a bordered card with a title row, a tall growth chart and a short
 * drawdown strip under it, so the placeholder is about as tall as the real
 * thing rather than a bare 384px block.
 */
function MetricsAndChartSkeleton({ cards }: { cards: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 rounded-xl border bg-card py-4 shadow-sm">
        <div className="px-5">
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="mt-4 h-80 rounded-md" />
          <Skeleton className="mt-1 h-40 rounded-md" />
        </div>
      </div>
    </>
  )
}

/**
 * Results that are genuinely on their way in — a run is pending, so promising
 * metric cards and a chart is honest here.
 */
export function ResultsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="mt-4" data-skeleton="results">
      <MetricsAndChartSkeleton cards={cards} />
    </div>
  )
}
