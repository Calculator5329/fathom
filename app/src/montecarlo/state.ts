import { ASSET_CLASSES } from '@/data/assetClasses'
import { decodeWeightList, encodeWeightList, enumParam, numParam } from '@/lib/urlCodec'
import type { AllocationWeight } from './data'
import type { DisplayBasis } from './nominal'
import type { WithdrawalStrategy } from './simulate'

/**
 * URL codec for the Monte Carlo config (shareable scenarios):
 *   /montecarlo?a=usStocks:60,usBonds:40&bal=1000000&yrs=30&wr=4
 *     &strat=fixedReal&fee=0.1&mode=historical&trials=10000&disp=nominal
 *
 * Parametric mode adds the return distribution to the URL:
 *   ...&mode=parametric&pm=usStocks:7,usBonds:2&pv=usStocks:16,usBonds:6&pcorr=0.15
 * where `pm`/`pv` are per-asset expected real return / volatility (%/yr) and
 * `pcorr` is the uniform cross-asset correlation.
 */
export type MonteCarloMode = 'historical' | 'bootstrap' | 'parametric'

/** Per-asset parametric assumptions, in percent-per-year (real). */
export interface ParametricAssetParams {
  assetId: string
  mean: number // expected annual real return, %/yr (may be negative)
  vol: number // annual volatility, %/yr (>= 0)
}

export interface ParametricConfig {
  /** One entry per allocation asset, aligned to `allocation` order. */
  assets: ParametricAssetParams[]
  correlation: number // uniform pairwise correlation, −1..1
}

export interface MonteCarloConfig {
  allocation: AllocationWeight[]
  initialBalance: number
  horizonYears: number
  withdrawalRate: number // percent
  strategy: WithdrawalStrategy
  feeRate: number // percent
  mode: MonteCarloMode
  trials: number
  accumulationYears: number
  annualContribution: number // real $/yr during accumulation
  basis: DisplayBasis // display-only: real (default) vs re-inflated nominal
  /**
   * Present only in parametric mode (kept `undefined` otherwise so non-
   * parametric configs stay byte-identical through the URL round-trip).
   */
  parametric?: ParametricConfig
}

/**
 * Sensible default real return / volatility (%/yr) per asset class, used to
 * seed parametric mode when the URL carries no explicit `pm`/`pv` override.
 * Long-run, order-of-magnitude figures — the user is expected to tune them.
 */
export const DEFAULT_ASSET_ASSUMPTIONS: Record<string, { mean: number; vol: number }> = {
  usStocks: { mean: 7, vol: 16 },
  largeCap: { mean: 6.8, vol: 15 },
  midCap: { mean: 7.2, vol: 18 },
  smallCap: { mean: 7.5, vol: 20 },
  usBonds: { mean: 2, vol: 6 },
  cash: { mean: 0.5, vol: 1.5 },
}
const FALLBACK_ASSUMPTION = { mean: 5, vol: 12 }
export const DEFAULT_CORRELATION = 0.15

/** Resolve one asset's default assumption (table hit, else generic fallback). */
export function defaultAssumption(assetId: string): { mean: number; vol: number } {
  return DEFAULT_ASSET_ASSUMPTIONS[assetId] ?? FALLBACK_ASSUMPTION
}

const VALID_IDS = new Set(ASSET_CLASSES.map((a) => a.id))
const STRATEGIES: WithdrawalStrategy[] = ['fixedReal', 'fixedPercent', 'vpw', 'guardrails']
const BASES: DisplayBasis[] = ['real', 'nominal']
const MODES: MonteCarloMode[] = ['historical', 'bootstrap', 'parametric']

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
  basis: 'real',
}

/** Encode a signed KEY:VALUE list (like weight lists, but values may be < 0). */
function encodeSignedList(entries: Array<{ key: string; value: number }>): string {
  return entries
    .filter((e) => e.key && Number.isFinite(e.value))
    .map((e) => `${e.key}:${Math.round(e.value * 100) / 100}`)
    .join(',')
}

/** Decode a signed KEY:VALUE list into a Map (last value wins on duplicates). */
function decodeSignedList(raw: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const part of raw.split(',')) {
    const [key, v] = part.split(':')
    const n = Number(v)
    if (key && VALID_IDS.has(key) && Number.isFinite(n)) m.set(key, n)
  }
  return m
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
  if (c.basis !== DEFAULT_MC.basis) p.set('disp', c.basis)
  // Parametric distribution (only when the config carries one — keeps every
  // other config byte-identical to before this mode existed).
  if (c.parametric) {
    const pm = encodeSignedList(c.parametric.assets.map((a) => ({ key: a.assetId, value: a.mean })))
    const pv = encodeSignedList(c.parametric.assets.map((a) => ({ key: a.assetId, value: a.vol })))
    if (pm) p.set('pm', pm)
    if (pv) p.set('pv', pv)
    p.set('pcorr', String(Math.round(c.parametric.correlation * 1000) / 1000))
  }
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

  const finalAlloc = allocation.length ? allocation : DEFAULT_MC.allocation
  const mode = enumParam(p.get('mode'), MODES, DEFAULT_MC.mode)

  const config: MonteCarloConfig = {
    allocation: finalAlloc,
    initialBalance: numParam(p.get('bal'), DEFAULT_MC.initialBalance, { min: 1, max: 1e12 }),
    horizonYears: numParam(p.get('yrs'), DEFAULT_MC.horizonYears, { min: 1, max: 60 }),
    withdrawalRate: numParam(p.get('wr'), DEFAULT_MC.withdrawalRate, { min: 0, max: 100 }),
    strategy: enumParam(p.get('strat'), STRATEGIES, DEFAULT_MC.strategy),
    feeRate: numParam(p.get('fee'), DEFAULT_MC.feeRate, { min: 0, max: 10 }),
    mode,
    trials: numParam(p.get('trials'), DEFAULT_MC.trials, { min: 1000, max: 50_000 }),
    accumulationYears: numParam(p.get('acc'), 0, { min: 0, max: 50 }),
    annualContribution: numParam(p.get('save'), 0, { min: 0, max: 1e9 }),
    basis: enumParam(p.get('disp'), BASES, DEFAULT_MC.basis),
  }

  // Parametric mode carries a per-asset return distribution. Any asset without
  // an explicit `pm`/`pv` override falls back to its default assumption, so the
  // distribution always covers the whole allocation. Only attached in
  // parametric mode — every other config stays byte-identical to before.
  if (mode === 'parametric') {
    config.parametric = parametricFromParams(finalAlloc, p)
  }

  return config
}

/** Build the parametric distribution for an allocation from URL overrides. */
export function parametricFromParams(
  allocation: AllocationWeight[],
  p: URLSearchParams,
): ParametricConfig {
  const rawMeans = p.get('pm')
  const rawVols = p.get('pv')
  const means = rawMeans ? decodeSignedList(rawMeans) : new Map<string, number>()
  const vols = rawVols ? decodeSignedList(rawVols) : new Map<string, number>()
  const assets = allocation.map((a) => {
    const def = defaultAssumption(a.assetId)
    const vol = vols.get(a.assetId)
    return {
      assetId: a.assetId,
      mean: means.get(a.assetId) ?? def.mean,
      vol: vol !== undefined && vol >= 0 ? vol : def.vol,
    }
  })
  return {
    assets,
    correlation: numParam(p.get('pcorr'), DEFAULT_CORRELATION, { min: -0.99, max: 0.999 }),
  }
}
