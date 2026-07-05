export { runBacktest } from './backtest'
export {
  twoAssetFrontier,
  minVarianceIndex,
  maxSharpeIndex,
  type FrontierPoint,
} from './frontier'
export { alignSeries, isNewMonth, isPeriodStart } from './align'
export {
  annualIncome,
  annualReturns,
  computeMetrics,
  irr,
  maxDrawdown,
  monthlyReturns,
  monthlyReturnsLabeled,
  rollingReturns,
} from './metrics'
export type * from './types'
