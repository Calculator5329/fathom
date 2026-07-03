import { alignSeries, isNewMonth, isPeriodStart } from './align'
import { computeMetrics } from './metrics'
import type {
  BacktestConfig,
  BacktestResult,
  PortfolioSpec,
  TickerSeries,
} from './types'

/**
 * Run a portfolio backtest. See BacktestResult in types.ts for the exact
 * simulation semantics (flow timing, rebalancing, dividend handling).
 */
export function runBacktest(
  seriesList: TickerSeries[],
  portfolio: PortfolioSpec,
  config: BacktestConfig,
): BacktestResult {
  const weightSum = portfolio.allocations.reduce((s, a) => s + a.weight, 0)
  if (Math.abs(weightSum - 100) > 1e-6) {
    throw new Error(`Weights must sum to 100, got ${weightSum}`)
  }
  const bySymbol = new Map(seriesList.map((s) => [s.ticker, s]))
  const used = portfolio.allocations.map((a) => {
    const s = bySymbol.get(a.ticker)
    if (!s) throw new Error(`Missing series for ${a.ticker}`)
    return s
  })

  const { dates, assets } = alignSeries(used, config.start, config.end)
  const n = dates.length
  const weights = portfolio.allocations.map((a) => a.weight / 100)
  const prepared = portfolio.allocations.map((a) => assets.get(a.ticker)!)

  // State: market value per holding, plus uninvested dividend cash.
  const holdings = weights.map((w) => config.initialAmount * w)
  let cash = 0

  const values = new Array<number>(n)
  const twrIndex = new Array<number>(n)
  const flows = new Array<number>(n).fill(0)
  values[0] = config.initialAmount
  twrIndex[0] = 1
  let totalContributions = 0

  for (let t = 1; t < n; t++) {
    const prevValue = holdings.reduce((s, h) => s + h, cash)

    // 1. Start-of-day external flow (contribution/withdrawal at prior close values).
    let flow = 0
    if (config.monthlyContribution !== 0 && isNewMonth(dates[t - 1], dates[t])) {
      flow = config.monthlyContribution
      for (let i = 0; i < holdings.length; i++) holdings[i] += flow * weights[i]
      totalContributions += flow
      flows[t] = flow
    }

    // 2. Start-of-day rebalance to target weights (holdings only; dividend cash stays cash).
    if (
      config.rebalance !== 'none' &&
      isPeriodStart(dates[t - 1], dates[t], config.rebalance)
    ) {
      const invested = holdings.reduce((s, h) => s + h, 0)
      for (let i = 0; i < holdings.length; i++) holdings[i] = invested * weights[i]
    }

    // 3. Apply the day's returns.
    for (let i = 0; i < holdings.length; i++) {
      const asset = prepared[i]
      if (config.reinvestDividends) {
        holdings[i] *= asset.totalReturn[t]
      } else {
        cash += holdings[i] * asset.divYield[t]
        holdings[i] *= asset.priceReturn[t]
      }
    }

    const value = holdings.reduce((s, h) => s + h, cash)
    values[t] = value
    // Time-weighted return: the flow entered at prior-close values, so the
    // day's growth acted on (prevValue + flow) — divide it out.
    twrIndex[t] = twrIndex[t - 1] * (value / (prevValue + flow))
  }

  const metrics = computeMetrics(dates, twrIndex, values, flows, config.riskFreeRate ?? 0)

  return {
    portfolio,
    dates,
    values,
    twrIndex,
    flows,
    endingCash: cash,
    totalContributions,
    metrics,
  }
}
