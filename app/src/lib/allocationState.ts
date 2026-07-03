import type { BacktestConfig, PortfolioSpec, RebalanceFrequency } from '@/engine'
import { ASSET_CLASSES } from '@/data/assetClasses'
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
    const spec = p.allocations
      .filter((a) => a.ticker)
      .map((a) => `${a.ticker}:${Math.round(a.weight * 100) / 100}`)
      .join(',')
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
    const allocations = raw
      .split(',')
      .map((part) => {
        const [id, w] = part.split(':')
        return { ticker: id ?? '', weight: Number(w) }
      })
      .filter((a) => VALID_IDS.has(a.ticker) && Number.isFinite(a.weight) && a.weight >= 0)
    if (allocations.length) {
      portfolios.push({ name: `Portfolio ${portfolios.length + 1}`, allocations })
    }
  }

  const rebalRaw = params.get('rebal') as RebalanceFrequency | null
  const amt = Number(params.get('amt'))
  const contrib = Number(params.get('contrib'))
  return {
    portfolios,
    config: {
      ...DEFAULT_CONFIG,
      start: params.get('start') ?? undefined,
      end: params.get('end') ?? undefined,
      initialAmount: Number.isFinite(amt) && amt > 0 ? amt : DEFAULT_CONFIG.initialAmount,
      monthlyContribution: Number.isFinite(contrib) ? contrib : 0,
      rebalance:
        rebalRaw && REBALANCE_VALUES.includes(rebalRaw) ? rebalRaw : DEFAULT_CONFIG.rebalance,
      reinvestDividends: true, // total-return series; no separate dividends
    },
    real: params.get('real') === '1',
  }
}
