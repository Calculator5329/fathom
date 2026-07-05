import type { BacktestConfig, PortfolioSpec, RebalanceFrequency } from '@/engine'
import { decodeWeightList, encodeWeightList, enumParam, numParam } from './urlCodec'

/**
 * The entire backtest setup lives in the URL query string so any backtest is
 * shareable/reproducible by link (the no-login substitute for saved state):
 *
 *   ?p1=VTI:60,BND:40&p2=SPY:100&start=1994-01-01&end=2024-12-31
 *    &amt=10000&contrib=500&rebal=annual&div=off&bench=SPY
 *
 * Defaults are omitted from the URL to keep links short.
 */
export interface BacktestSetup {
  portfolios: PortfolioSpec[]
  config: BacktestConfig
  benchmark: string | null
}

export const DEFAULT_CONFIG: BacktestConfig = {
  initialAmount: 10_000,
  monthlyContribution: 0,
  rebalance: 'annual',
  reinvestDividends: true,
}

const REBALANCE_VALUES: RebalanceFrequency[] = ['none', 'annual', 'quarterly', 'monthly']

export function encodeSetup(setup: BacktestSetup): URLSearchParams {
  const params = new URLSearchParams()
  setup.portfolios.forEach((p, i) => {
    const spec = encodeWeightList(p.allocations.map((a) => ({ key: a.ticker, weight: a.weight })))
    if (spec) params.set(`p${i + 1}`, spec)
  })
  const c = setup.config
  if (c.start) params.set('start', c.start)
  if (c.end) params.set('end', c.end)
  if (c.initialAmount !== DEFAULT_CONFIG.initialAmount) params.set('amt', String(c.initialAmount))
  if (c.monthlyContribution !== 0) params.set('contrib', String(c.monthlyContribution))
  if (c.rebalance !== DEFAULT_CONFIG.rebalance) params.set('rebal', c.rebalance)
  if (!c.reinvestDividends) params.set('div', 'off')
  if (setup.benchmark) params.set('bench', setup.benchmark)
  return params
}

export function decodeSetup(params: URLSearchParams): BacktestSetup {
  const portfolios: PortfolioSpec[] = []
  for (let i = 1; i <= 3; i++) {
    const raw = params.get(`p${i}`)
    if (!raw) continue
    // Zero weights are kept: a just-added ticker awaiting its weight must
    // survive the URL round-trip that happens on every edit.
    const allocations = decodeWeightList(raw, { uppercase: true }).map((e) => ({
      ticker: e.key,
      weight: e.weight,
    }))
    if (allocations.length) {
      portfolios.push({ name: `Portfolio ${portfolios.length + 1}`, allocations })
    }
  }

  const config: BacktestConfig = {
    ...DEFAULT_CONFIG,
    start: params.get('start') ?? undefined,
    end: params.get('end') ?? undefined,
    initialAmount: numParam(params.get('amt'), DEFAULT_CONFIG.initialAmount, { positive: true }),
    monthlyContribution: numParam(params.get('contrib'), 0),
    rebalance: enumParam(params.get('rebal'), REBALANCE_VALUES, DEFAULT_CONFIG.rebalance),
    reinvestDividends: params.get('div') !== 'off',
  }

  return {
    portfolios,
    config,
    benchmark: params.get('bench')?.toUpperCase() || null,
  }
}
