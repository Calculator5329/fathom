import { ASSET_CLASSES } from '@/data/assetClasses'
import type { AllocationWeight } from './data'
import type { WithdrawalStrategy } from './simulate'

/**
 * URL codec for the Monte Carlo config (shareable scenarios):
 *   /montecarlo?a=usStocks:60,usBonds:40&bal=1000000&yrs=30&wr=4
 *     &strat=fixedReal&fee=0.1&mode=historical&trials=10000
 */
export interface MonteCarloConfig {
  allocation: AllocationWeight[]
  initialBalance: number
  horizonYears: number
  withdrawalRate: number // percent
  strategy: WithdrawalStrategy
  feeRate: number // percent
  mode: 'historical' | 'bootstrap'
  trials: number
  accumulationYears: number
  annualContribution: number // real $/yr during accumulation
}

const VALID_IDS = new Set(ASSET_CLASSES.map((a) => a.id))
const STRATEGIES: WithdrawalStrategy[] = ['fixedReal', 'fixedPercent', 'vpw', 'guardrails']

export const DEFAULT_MC: MonteCarloConfig = {
  allocation: [
    { assetId: 'usStocks', weight: 60 },
    { assetId: 'usBonds', weight: 40 },
  ],
  initialBalance: 1_000_000,
  horizonYears: 30,
  withdrawalRate: 4,
  strategy: 'fixedReal',
  feeRate: 0.02,
  mode: 'historical',
  trials: 10_000,
  accumulationYears: 0,
  annualContribution: 0,
}

const num = (raw: string | null, fallback: number, min: number, max: number) => {
  const n = Number(raw)
  return raw !== null && Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

export function encodeMonteCarlo(c: MonteCarloConfig): URLSearchParams {
  const p = new URLSearchParams()
  // Keep zero-weight entries so a just-added asset (or one being edited to 0)
  // survives the URL round-trip that drives this form's state.
  const alloc = c.allocation
    .filter((a) => a.weight >= 0)
    .map((a) => `${a.assetId}:${Math.round(a.weight * 100) / 100}`)
    .join(',')
  if (alloc) p.set('a', alloc)
  if (c.initialBalance !== DEFAULT_MC.initialBalance) p.set('bal', String(c.initialBalance))
  if (c.horizonYears !== DEFAULT_MC.horizonYears) p.set('yrs', String(c.horizonYears))
  if (c.withdrawalRate !== DEFAULT_MC.withdrawalRate) p.set('wr', String(c.withdrawalRate))
  if (c.strategy !== DEFAULT_MC.strategy) p.set('strat', c.strategy)
  if (c.feeRate !== DEFAULT_MC.feeRate) p.set('fee', String(c.feeRate))
  if (c.mode !== DEFAULT_MC.mode) p.set('mode', c.mode)
  if (c.trials !== DEFAULT_MC.trials) p.set('trials', String(c.trials))
  if (c.accumulationYears !== 0) p.set('acc', String(c.accumulationYears))
  if (c.annualContribution !== 0) p.set('save', String(c.annualContribution))
  return p
}

export function decodeMonteCarlo(p: URLSearchParams): MonteCarloConfig {
  const rawA = p.get('a')
  const allocation = rawA
    ? rawA
        .split(',')
        .map((part) => {
          const [id, w] = part.split(':')
          return { assetId: id ?? '', weight: Number(w) }
        })
        .filter((a) => VALID_IDS.has(a.assetId) && Number.isFinite(a.weight) && a.weight >= 0)
    : DEFAULT_MC.allocation

  const strat = p.get('strat') as WithdrawalStrategy | null
  const mode = p.get('mode')
  return {
    allocation: allocation.length ? allocation : DEFAULT_MC.allocation,
    initialBalance: num(p.get('bal'), DEFAULT_MC.initialBalance, 1, 1e12),
    horizonYears: num(p.get('yrs'), DEFAULT_MC.horizonYears, 1, 60),
    withdrawalRate: num(p.get('wr'), DEFAULT_MC.withdrawalRate, 0, 100),
    strategy: strat && STRATEGIES.includes(strat) ? strat : DEFAULT_MC.strategy,
    feeRate: num(p.get('fee'), DEFAULT_MC.feeRate, 0, 10),
    mode: mode === 'bootstrap' ? 'bootstrap' : 'historical',
    trials: num(p.get('trials'), DEFAULT_MC.trials, 1000, 50_000),
    accumulationYears: num(p.get('acc'), 0, 0, 50),
    annualContribution: num(p.get('save'), 0, 0, 1e9),
  }
}
