import type { BacktestConfig, PortfolioSpec, RebalanceFrequency } from '@/engine'
import { ASSET_CLASSES } from '@/data/assetClasses'
import { decodeWeightList, encodeWeightList, enumParam, numParam } from './urlCodec'
import { DEFAULT_CONFIG } from './urlState'

/**
 * URL codec for the allocation backtester:
 *   /allocation?a1=usStocks:60,usBonds:40&a2=usStocks:100&real=1&rebal=annual
 */
export interface AllocationSetup {
  portfolios: PortfolioSpec[]
  config: BacktestConfig
  /** Inflation-adjusted (real) returns via CPI deflation. */
  real: boolean
}

const VALID_IDS = new Set(ASSET_CLASSES.map((a) => a.id))
const REBALANCE_VALUES: RebalanceFrequency[] = ['none', 'annual', 'quarterly', 'monthly']

export function encodeAllocation(setup: AllocationSetup): URLSearchParams {
  const params = new URLSearchParams()
  setup.portfolios.forEach((p, i) => {
    const spec = encodeWeightList(p.allocations.map((a) => ({ key: a.ticker, weight: a.weight })))
    if (spec) params.set(`a${i + 1}`, spec)
  })
  const c = setup.config
  if (c.start) params.set('start', c.start)
  if (c.end) params.set('end', c.end)
  if (c.initialAmount !== DEFAULT_CONFIG.initialAmount) params.set('amt', String(c.initialAmount))
  if (c.monthlyContribution !== 0) params.set('contrib', String(c.monthlyContribution))
  if (c.rebalance !== DEFAULT_CONFIG.rebalance) params.set('rebal', c.rebalance)
  if (setup.real) params.set('real', '1')
  return params
}

export function decodeAllocation(params: URLSearchParams): AllocationSetup {
  const portfolios: PortfolioSpec[] = []
  for (let i = 1; i <= 3; i++) {
    const raw = params.get(`a${i}`)
    if (!raw) continue
    const allocations = decodeWeightList(raw, { isValidKey: (k) => VALID_IDS.has(k) }).map((e) => ({
      ticker: e.key,
      weight: e.weight,
    }))
    if (allocations.length) {
      portfolios.push({ name: `Portfolio ${portfolios.length + 1}`, allocations })
    }
  }

  return {
    portfolios,
    config: {
      ...DEFAULT_CONFIG,
      start: params.get('start') ?? undefined,
      end: params.get('end') ?? undefined,
      initialAmount: numParam(params.get('amt'), DEFAULT_CONFIG.initialAmount, { positive: true }),
      monthlyContribution: numParam(params.get('contrib'), 0),
      rebalance: enumParam(params.get('rebal'), REBALANCE_VALUES, DEFAULT_CONFIG.rebalance),
      reinvestDividends: true, // total-return series; no separate dividends
    },
    real: params.get('real') === '1',
  }
}
