/**
 * Compatibility seam: the Monte Carlo simulator now lives in the shared
 * package @calculator53295/backtest-engine (extracted verbatim from this
 * file — same conventions: real terms, start-of-year withdrawals, mulberry32).
 */
export {
  mulberry32,
  trialMonths,
  runHistoricalSequence,
  runBootstrap,
  maxSafeWithdrawal,
  type WithdrawalStrategy,
  type SimParams,
  type RealReturnSeries,
  type SimResult,
} from '@calculator53295/backtest-engine'
