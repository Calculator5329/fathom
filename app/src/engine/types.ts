/**
 * Canonical daily record, matching data/tickers/<TICKER>.json from the
 * Tiingo fetch layer. `close` is unadjusted; `adjClose` is split- and
 * dividend-adjusted as of fetch time.
 */
export interface DailyRecord {
  date: string // yyyy-mm-dd
  close: number
  adjClose: number
  divCash: number
  splitFactor: number
}

export interface TickerSeries {
  ticker: string
  name?: string
  records: DailyRecord[]
}

export type RebalanceFrequency = 'none' | 'annual' | 'quarterly' | 'monthly'

export interface Allocation {
  ticker: string
  /** Target weight in percent, e.g. 60 for 60%. Must sum to 100 across the portfolio. */
  weight: number
}

export interface PortfolioSpec {
  name: string
  allocations: Allocation[]
}

export interface BacktestConfig {
  /** yyyy-mm-dd inclusive bounds. Clamped to the common history of all tickers. */
  start?: string
  end?: string
  initialAmount: number
  /** Cash added (+) or withdrawn (−) at the start of each calendar month, invested at target weights. */
  monthlyContribution: number
  rebalance: RebalanceFrequency
  /** true = dividends reinvested same day (total return). false = dividends accrue as uninvested cash. */
  reinvestDividends: boolean
  /** Constant annual risk-free rate for Sharpe/Sortino, e.g. 0.03. Defaults to 0. */
  riskFreeRate?: number
}

/** Semantics of the simulation, documented once:
 * - Calendar = intersection of all tickers' trading days within [start, end].
 * - Day 0: initial amount buys in at the close. Returns accrue from day 1.
 * - Monthly cashflows and rebalancing execute at the START of the first
 *   trading day of the period, at the prior day's closing values.
 * - Reinvested dividends compound via adjClose ratios (reinvest at close on
 *   ex-date). Non-reinvested dividends accrue to a cash bucket earning 0%.
 */
export interface BacktestResult {
  portfolio: PortfolioSpec
  dates: string[]
  /** Total portfolio market value per day (holdings + dividend cash), after flows. */
  values: number[]
  /** Time-weighted return index, 1.0 at day 0. Flows are excluded — use for all metrics. */
  twrIndex: number[]
  /** External flow applied at the start of each day (contributions/withdrawals). */
  flows: number[]
  /**
   * Cash dividends received each day (before any reinvestment). When
   * reinvesting, this money bought shares the same day — it is still income.
   */
  dividendIncome: number[]
  endingCash: number
  totalContributions: number
  metrics: MetricSet
}

export interface DrawdownInfo {
  maxDrawdown: number // negative fraction, e.g. -0.55
  peakDate: string
  troughDate: string
  /** Date the previous peak was regained, or null if not yet recovered. */
  recoveryDate: string | null
}

export interface YearReturn {
  year: number
  return: number
}

/** One rolling-window observation, keyed by the window's end date. */
export interface RollingPoint {
  date: string
  /** Annualized return over the trailing window. */
  value: number
}

export interface MetricSet {
  totalReturn: number
  cagr: number
  /** Annualized from monthly return stdev (×√12), Portfolio Visualizer convention. */
  volatility: number
  sharpe: number
  sortino: number
  drawdown: DrawdownInfo
  annualReturns: YearReturn[]
  bestYear: YearReturn | null
  worstYear: YearReturn | null
  /** Money-weighted annual return (IRR). Equals CAGR when there are no flows. */
  irr: number
}
