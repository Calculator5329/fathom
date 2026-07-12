/**
 * Compatibility seam: THE backtest engine now lives in the shared package
 * @calculator53295/backtest-engine (extracted verbatim from this directory —
 * same math, same conventions, same fixtures). All app imports keep going
 * through '@/engine'. The real-data golden regressions stay in
 * __tests__/realdata.test.ts here, pinned against this repo's data/tickers.
 */
export {
  runBacktest,
  twoAssetFrontier,
  minVarianceIndex,
  maxSharpeIndex,
  type FrontierPoint,
  alignSeries,
  isNewMonth,
  isPeriodStart,
  annualIncome,
  annualReturns,
  computeMetrics,
  irr,
  maxDrawdown,
  monthlyReturns,
  monthlyReturnsLabeled,
  rollingReturns,
} from '@calculator53295/backtest-engine'
export type * from '@calculator53295/backtest-engine'
