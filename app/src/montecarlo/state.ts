import { ASSET_CLASSES } from '@/data/assetClasses'
import { decodeWeightList, encodeWeightList, enumParam, numParam } from '@/lib/urlCodec'
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

export function encodeMonteCarlo(c: MonteCarloConfig): URLSearchParams {
  const p = new URLSearchParams()
  // Zero-weight entries are kept so a just-added asset (or one being edited
  // to 0) survives the URL round-trip that drives this form's state.
  const alloc = encodeWeightList(c.allocation.map((a) => ({ key: a.assetId, weight: a.weight })))
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
    ? decodeWeightList(rawA, { isValidKey: (k) => VALID_IDS.has(k) }).map((e) => ({
        assetId: e.key,
        weight: e.weight,
      }))
    : DEFAULT_MC.allocation

  return {
    allocation: allocation.length ? allocation : DEFAULT_MC.allocation,
    initialBalance: numParam(p.get('bal'), DEFAULT_MC.initialBalance, { min: 1, max: 1e12 }),
    horizonYears: numParam(p.get('yrs'), DEFAULT_MC.horizonYears, { min: 1, max: 60 }),
    withdrawalRate: numParam(p.get('wr'), DEFAULT_MC.withdrawalRate, { min: 0, max: 100 }),
    strategy: enumParam(p.get('strat'), STRATEGIES, DEFAULT_MC.strategy),
    feeRate: numParam(p.get('fee'), DEFAULT_MC.feeRate, { min: 0, max: 10 }),
    mode: p.get('mode') === 'bootstrap' ? 'bootstrap' : 'historical',
    trials: numParam(p.get('trials'), DEFAULT_MC.trials, { min: 1000, max: 50_000 }),
    accumulationYears: numParam(p.get('acc'), 0, { min: 0, max: 50 }),
    annualContribution: numParam(p.get('save'), 0, { min: 0, max: 1e9 }),
  }
}
