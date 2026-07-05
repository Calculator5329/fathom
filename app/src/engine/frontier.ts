import type { BacktestConfig, TickerSeries } from './types'
import { runBacktest } from './backtest'

/**
 * A point on the two-asset efficient frontier: the risk (annualized
 * volatility) and reward (CAGR) of a specific A/B weight mix, plus its
 * Sharpe ratio, all computed by the real backtest engine over the shared
 * window — no mean/covariance shortcuts, so it matches every other number
 * the tool reports.
 */
export interface FrontierPoint {
  weightA: number // percent in asset A (B is the remainder)
  volatility: number
  cagr: number
  sharpe: number
}

/**
 * Sweep the A/B mix from 0→100% A in `steps` increments. Two assets is the
 * classic, honest frontier: the whole curve is enumerable, so there's no
 * optimizer to trust — every point is a portfolio you could actually hold.
 */
export function twoAssetFrontier(
  a: TickerSeries,
  b: TickerSeries,
  config: BacktestConfig,
  steps = 21,
): FrontierPoint[] {
  const series = [a, b]
  const points: FrontierPoint[] = []
  for (let i = 0; i < steps; i++) {
    const weightA = Math.round((i / (steps - 1)) * 10000) / 100
    const weightB = Math.round((100 - weightA) * 100) / 100
    const allocations = [
      { ticker: a.ticker, weight: weightA },
      { ticker: b.ticker, weight: weightB },
    ].filter((x) => x.weight > 0)
    // Single-asset endpoints: one allocation at 100%.
    const spec = { name: `mix-${i}`, allocations: allocations.length ? allocations : [{ ticker: a.ticker, weight: 100 }] }
    const m = runBacktest(series, spec, config).metrics
    points.push({ weightA, volatility: m.volatility, cagr: m.cagr, sharpe: m.sharpe })
  }
  return points
}

/** Index of the minimum-variance point. */
export function minVarianceIndex(points: FrontierPoint[]): number {
  let idx = 0
  for (let i = 1; i < points.length; i++) if (points[i].volatility < points[idx].volatility) idx = i
  return idx
}

/** Index of the maximum-Sharpe (tangency) point. */
export function maxSharpeIndex(points: FrontierPoint[]): number {
  let idx = 0
  for (let i = 1; i < points.length; i++) if (points[i].sharpe > points[idx].sharpe) idx = i
  return idx
}
