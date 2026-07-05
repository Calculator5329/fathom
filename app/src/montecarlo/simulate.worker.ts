/// <reference lib="webworker" />
import { buildRealReturns, type AllocationWeight, type AssetData } from './data'
import {
  maxSafeWithdrawal,
  mulberry32,
  runBootstrap,
  runHistoricalSequence,
  trialMonths,
  type SimParams,
  type SimResult,
} from './simulate'

export interface WorkerRequest {
  allocation: AllocationWeight[]
  /** Serialized AssetData (Maps become entry arrays for structured clone). */
  returns: Array<[string, Array<[string, number]>]>
  cpi: Array<[string, number]>
  params: SimParams
  mode: 'historical' | 'bootstrap'
  trials: number
  seed: number
}

export interface WorkerResponse {
  result: SimResult | null
  maxSwr: number
  error?: string
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const data: AssetData = {
      returns: new Map(e.data.returns.map(([id, entries]) => [id, new Map(entries)])),
      cpi: new Map(e.data.cpi),
    }
    const series = buildRealReturns(e.data.allocation, data)
    if (series.returns.length < trialMonths(e.data.params)) {
      postMessage({
        result: null,
        maxSwr: 0,
        error: 'Not enough shared history for this allocation and horizon.',
      } satisfies WorkerResponse)
      return
    }
    const { params, mode } = e.data
    const result =
      mode === 'bootstrap'
        ? runBootstrap(series, params, { trials: e.data.trials, rng: mulberry32(e.data.seed) })
        : runHistoricalSequence(series, params)
    // Max safe withdrawal is evaluated historically (the honest floor) — but
    // only for rate-driven strategies. VPW and fixed-percent adapt spending to
    // the balance and can't deplete early, so "max safe rate" is meaningless
    // there (the solver would just return its search ceiling).
    const rateDriven = params.strategy === 'fixedReal' || params.strategy === 'guardrails'
    const maxSwr = rateDriven ? maxSafeWithdrawal(series, params, 0.95) : NaN
    postMessage({ result, maxSwr } satisfies WorkerResponse)
  } catch (err) {
    postMessage({
      result: null,
      maxSwr: 0,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse)
  }
}
