/// <reference lib="webworker" />
import { buildRealReturns, type AllocationWeight, type AssetData } from './data'
import {
  maxSafeWithdrawal,
  mulberry32,
  runBootstrap,
  runHistoricalSequence,
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
    if (series.returns.length < e.data.params.horizonYears * 12) {
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
    // Max safe withdrawal is always evaluated historically (the honest floor).
    const maxSwr = maxSafeWithdrawal(series, params, 0.95)
    postMessage({ result, maxSwr } satisfies WorkerResponse)
  } catch (err) {
    postMessage({
      result: null,
      maxSwr: 0,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse)
  }
}
