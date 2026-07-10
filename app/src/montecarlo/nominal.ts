import type { SimResult } from './simulate'

/**
 * Display-layer real→nominal conversion for the Monte Carlo results.
 *
 * The simulation is (correctly) REAL-terms internally — the math lives in
 * @calculator-5329/backtest-engine and is never touched here. This module only
 * re-inflates the *outputs* for display: a value that the sim reports "in
 * today's dollars" at year t becomes the nominal dollar amount you'd actually
 * see on a statement t years out, using the long-run average inflation implied
 * by the CPI series already in the asset-class data.
 *
 * Real mode never calls through here, so it stays byte-identical to before.
 */

export type DisplayBasis = 'real' | 'nominal'

/**
 * Long-run average annual inflation (geometric) implied by a CPI level series
 * keyed by yyyy-mm. Uses only the first and last dated points, so it is the
 * true compound rate over the whole covered span. Returns 0 for a degenerate
 * series (fewer than two usable points, zero span) so callers get a no-op
 * factor rather than a throw.
 */
export function annualInflationRate(cpi: Map<string, number>): number {
  const entries = [...cpi.entries()]
    .filter(([ym, v]) => /^\d{4}-\d{2}$/.test(ym) && Number.isFinite(v) && v > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  if (entries.length < 2) return 0
  const [firstYm, first] = entries[0]
  const [lastYm, last] = entries[entries.length - 1]
  const months = monthsBetween(firstYm, lastYm)
  if (months <= 0) return 0
  return Math.pow(last / first, 12 / months) - 1
}

/** Whole-month distance between two yyyy-mm labels (b − a). */
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/** Cumulative inflation multiplier for `years` from today at annual `rate`. */
export function inflationFactor(rate: number, years: number): number {
  return Math.pow(1 + rate, years)
}

/**
 * Return a copy of `result` with every dollar figure re-inflated to nominal
 * terms at the given annual `rate`. The original is never mutated. Each figure
 * is inflated by the factor at *its own* horizon year:
 *  - balance percentiles: year index t (0 = today, unchanged)
 *  - ending balances / median / worst starts: the final year (acc + horizon)
 *  - per-year income: the calendar year the withdrawal occurs (acc + retire-1)
 *  - income summary scalars: the first retirement year (acc), so the pay-cut
 *    comparisons stay proportional
 *
 * A rate of 0 yields factors of 1 everywhere → values identical to real mode.
 */
export function toNominalResult(result: SimResult, rate: number): SimResult {
  const f = (years: number) => inflationFactor(rate, years)
  const acc = result.accumulationYears
  const finalYear = acc + result.horizonYears

  const scaleByYear = (arr: number[], yearAt: (i: number) => number): number[] =>
    arr.map((v, i) => v * f(yearAt(i)))

  const scaleBands = (
    bands: SimResult['percentiles'],
    yearAt: (i: number) => number,
  ): SimResult['percentiles'] => ({
    p5: scaleByYear(bands.p5, yearAt),
    p25: scaleByYear(bands.p25, yearAt),
    p50: scaleByYear(bands.p50, yearAt),
    p75: scaleByYear(bands.p75, yearAt),
    p95: scaleByYear(bands.p95, yearAt),
  })

  const finalFactor = f(finalYear)
  const firstIncomeFactor = f(acc)

  return {
    ...result,
    // Balance fan: index t is years from today; t = 0 stays as-entered.
    percentiles: scaleBands(result.percentiles, (t) => t),
    endingBalances: result.endingBalances.map((v) => v * finalFactor),
    medianEnding: result.medianEnding * finalFactor,
    worstStarts: result.worstStarts.map((w) => ({
      ...w,
      endingBalance: w.endingBalance * finalFactor,
    })),
    // Income fan: retirement year i+1 is withdrawn at calendar year acc + i.
    incomeByYear: scaleBands(result.incomeByYear, (i) => acc + i),
    income: {
      ...result.income,
      firstYearMedian: result.income.firstYearMedian * firstIncomeFactor,
      worstYearMedian: result.income.worstYearMedian * firstIncomeFactor,
      worstYearP5: result.income.worstYearP5 * firstIncomeFactor,
    },
  }
}
