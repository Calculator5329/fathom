import { Skeleton } from '@/components/ui/skeleton'

/**
 * Shared loading placeholders so pages never fall back to bare
 * "Loading…" text. Shapes mirror what they stand in for: a route shell
 * (PageSkeleton) or a results panel of metric cards + chart
 * (ResultsSkeleton, matching the Research page's pattern).
 */

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-6 py-8">
      <Skeleton className="h-8 w-56 rounded-md" />
      <Skeleton className="mt-3 h-5 w-96 max-w-full rounded-md" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-96 rounded-xl" />
    </div>
  )
}

export function ResultsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="mt-4 animate-pulse">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-96 rounded-xl" />
    </div>
  )
}
