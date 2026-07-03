/**
 * Stock projection model — earnings-based forward valuation, ported from the
 * finance-master research tool. Pure functions, no deps.
 *
 * The chain per scenario:
 *   futureNetIncome = baseRevenue × (1+growth)^years × netMargin
 *   futureShares    = sharesOut × (1 − buyback)^years        (buybacks shrink the count)
 *   targetPrice     = (futureNetIncome / futureShares) × exitPE
 *   priceCAGR       = (targetPrice / currentPrice)^(1/years) − 1
 *   totalCAGR       = priceCAGR + dividendYield
 *
 * finance-master lumps div+buyback into one "shareholder yield" added to price
 * CAGR. We split them: buybacks compound into the share count (more correct —
 * they raise EPS), dividends add to total return. When you don't want that
 * distinction, put everything in `dividendYield` and leave `buybackYield` 0.
 */

export type ScenarioKey = 'bear' | 'base' | 'bull'
export const SCENARIO_KEYS: ScenarioKey[] = ['bear', 'base', 'bull']
export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  bear: 'Bear',
  base: 'Base',
  bull: 'Bull',
}

/** Per-scenario assumptions. Rates are fractions (0.12 = 12%), not percents. */
export interface ScenarioAssumptions {
  revenueGrowth: number // annual, fraction
  netMargin: number // fraction of revenue
  exitPe: number // price / earnings multiple at horizon
  dividendYield: number // annual, fraction — added to total return
  buybackYield: number // annual, fraction — shrinks share count
}

/** Inputs shared across scenarios. Dollar figures in whole dollars (not cents). */
export interface ProjectionInputs {
  baseRevenue: number
  netIncome: number // current, for showing the current implied margin
  sharesOut: number
  currentPrice: number
  horizonYears: number
}

export interface ScenarioOutcome {
  targetPrice: number
  priceCagr: number
  totalCagr: number
  /** Upside vs current price over the whole horizon (not annualized). */
  totalUpside: number
}

export function projectScenario(
  inputs: ProjectionInputs,
  s: ScenarioAssumptions,
): ScenarioOutcome {
  const { baseRevenue, sharesOut, currentPrice, horizonYears: y } = inputs
  if (y <= 0 || currentPrice <= 0 || sharesOut <= 0) {
    return { targetPrice: 0, priceCagr: 0, totalCagr: 0, totalUpside: 0 }
  }
  const futureNI = baseRevenue * (1 + s.revenueGrowth) ** y * s.netMargin
  const futureShares = sharesOut * (1 - s.buybackYield) ** y
  const targetPrice = futureShares > 0 ? (futureNI / futureShares) * s.exitPe : 0
  const priceCagr = targetPrice > 0 ? (targetPrice / currentPrice) ** (1 / y) - 1 : -1
  return {
    targetPrice,
    priceCagr,
    totalCagr: priceCagr + s.dividendYield,
    totalUpside: targetPrice > 0 ? targetPrice / currentPrice - 1 : -1,
  }
}

/** The implied-price path from today to the horizon (for the projection chart). */
export function pricePath(
  inputs: ProjectionInputs,
  s: ScenarioAssumptions,
): Array<{ year: number; price: number }> {
  const { currentPrice, horizonYears: y } = inputs
  const { targetPrice } = projectScenario(inputs, s)
  const path: Array<{ year: number; price: number }> = []
  // Geometric interpolation between today's price and the target.
  for (let t = 0; t <= y; t++) {
    const price =
      targetPrice > 0 && currentPrice > 0
        ? currentPrice * (targetPrice / currentPrice) ** (t / y)
        : currentPrice
    path.push({ year: t, price })
  }
  return path
}

export interface Projection {
  ticker: string
  inputs: ProjectionInputs
  scenarios: Record<ScenarioKey, ScenarioAssumptions>
  notes: string
  updatedAt: number
  createdAt: number
}

export function currentImpliedMargin(inputs: ProjectionInputs): number | null {
  return inputs.baseRevenue > 0 ? inputs.netIncome / inputs.baseRevenue : null
}

/** Sensible starting assumptions for a fresh projection. */
export function defaultScenarios(): Record<ScenarioKey, ScenarioAssumptions> {
  return {
    bear: { revenueGrowth: 0.03, netMargin: 0.1, exitPe: 12, dividendYield: 0, buybackYield: 0 },
    base: { revenueGrowth: 0.08, netMargin: 0.15, exitPe: 18, dividendYield: 0, buybackYield: 0.01 },
    bull: { revenueGrowth: 0.15, netMargin: 0.2, exitPe: 25, dividendYield: 0, buybackYield: 0.02 },
  }
}
