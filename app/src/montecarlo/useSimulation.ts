import { useEffect, useRef, useState } from 'react'
import { loadAssetClassData } from '@/data/assetClasses'
import type { AllocationWeight } from './data'
import { annualInflationRate } from './nominal'
import type { ParametricInput } from './parametric'
import type { SimParams, SimResult } from './simulate'
import { DEFAULT_CORRELATION, defaultAssumption, type ParametricConfig } from './state'
import type { WorkerRequest, WorkerResponse } from './simulate.worker'

export interface SimOutput {
  result: SimResult | null
  maxSwr: number
  running: boolean
  /** Last good result belongs to an earlier configuration. */
  stale: boolean
  error: string | null
}

interface RunConfig {
  allocation: AllocationWeight[]
  params: SimParams
  mode: 'historical' | 'bootstrap' | 'parametric'
  trials: number
  /**
   * Parametric mode's return distribution. Optional: when omitted (the current
   * builder does not yet expose the inputs), it is derived from the allocation
   * using each asset's default assumption so `?mode=parametric` still renders.
   */
  parametric?: ParametricConfig
}

/**
 * Turn the allocation (+ optional per-asset overrides) into the worker's
 * parametric input: weights normalized to fractions, means/vols from percent
 * to fractions. Falls back to default assumptions per asset when no override.
 */
function buildParametricInput(
  validAlloc: AllocationWeight[],
  weightSum: number,
  override: ParametricConfig | undefined,
): ParametricInput {
  const byId = new Map((override?.assets ?? []).map((a) => [a.assetId, a] as const))
  const assets = validAlloc.map((a) => {
    const o = byId.get(a.assetId)
    const def = defaultAssumption(a.assetId)
    return {
      weight: a.weight / weightSum,
      mean: (o?.mean ?? def.mean) / 100,
      vol: (o?.vol ?? def.vol) / 100,
    }
  })
  return { assets, correlation: override?.correlation ?? DEFAULT_CORRELATION }
}

/**
 * Runs the withdrawal simulation in a Web Worker so 10k trials + the
 * max-safe-withdrawal solver never block the UI. Debounced; keeps the last
 * result visible while recomputing (dim, don't unmount).
 */
export function useSimulation(config: RunConfig): SimOutput {
  const [output, setOutput] = useState<Omit<SimOutput, 'stale'>>({
    result: null,
    maxSwr: 0,
    running: true,
    error: null,
  })
  const requestIdRef = useRef(0)
  const resultKeyRef = useRef<string | null>(null)

  const validAlloc = config.allocation.filter((a) => a.weight > 0)
  const weightSum = validAlloc.reduce((s, a) => s + a.weight, 0)
  const key = JSON.stringify({ ...config, allocation: validAlloc })

  useEffect(() => {
    const requestId = ++requestIdRef.current
    let cancelled = false
    let settled = false
    let worker: Worker | null = null
    const current = () => !cancelled && !settled && requestIdRef.current === requestId
    const fail = (message: string) => {
      if (!current()) return
      settled = true
      worker?.terminate()
      setOutput(previous => ({ ...previous, running: false, error: message }))
    }
    if (validAlloc.length === 0 || Math.abs(weightSum - 100) > 0.5) {
      setOutput(previous => ({ ...previous, running: false, error: null }))
      return () => { cancelled = true }
    }
    setOutput(previous => ({ ...previous, running: true, error: null }))
    const timer = setTimeout(async () => {
      try {
        // Data and debounce resolve before allocating a worker. Obsolete loads
        // cannot enqueue computation, and cleanup stops already-posted work.
        const data = config.mode === 'parametric' ? null : await loadAssetClassData()
        if (!current()) return
        worker = new Worker(new URL('./simulate.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (!current() || event.data.requestId !== requestId) return
          if (event.data.error || !event.data.result) {
            fail(event.data.error ?? 'Simulation returned no result. Change the inputs to try again.')
            return
          }
          settled = true
          resultKeyRef.current = key
          worker?.terminate()
          setOutput({ result: event.data.result, maxSwr: event.data.maxSwr, running: false, error: null })
        }
        worker.onerror = event => {
          event.preventDefault()
          fail('Simulation could not finish. Change the inputs to try again.')
        }
        worker.onmessageerror = () => fail('Simulation result could not be read. Change the inputs to try again.')
        const request: WorkerRequest = {
          requestId,
          allocation: validAlloc,
          returns: data ? [...data.returns.entries()].map(([id, values]) => [id, [...values.entries()]]) : [],
          cpi: data ? [...data.cpi.entries()] : [],
          params: config.params,
          mode: config.mode,
          trials: config.trials,
          seed: 0x9e3779b9,
          ...(config.mode === 'parametric' ? { parametric: buildParametricInput(validAlloc, weightSum, config.parametric) } : {}),
        }
        worker.postMessage(request)
      } catch (err: unknown) {
        // A failed history load is a state this page can show (the results
        // panel renders `error`), not an unhandled rejection; keep the loader's
        // readable message (which file, which status) when it has one.
        fail(err instanceof Error && err.message ? err.message : 'Simulation data or worker could not be loaded. Change the inputs to try again.')
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
      worker?.terminate()
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...output, stale: output.result !== null && resultKeyRef.current !== key }
}

/**
 * Long-run average annual inflation implied by the CPI series in the
 * asset-class data — the rate the nominal display toggle re-inflates by.
 * Loads once (shared, cached promise); returns 0 until data resolves so the
 * initial render matches real mode. Display-only; never feeds the sim.
 */
export function useInflationRate(): number {
  const [rate, setRate] = useState(0)
  useEffect(() => {
    let cancelled = false
    loadAssetClassData()
      .then((data) => {
        if (!cancelled) setRate(annualInflationRate(data.cpi))
      })
      .catch(() => {
        /* leave at 0 (no-op factor) on transient load failure */
      })
    return () => {
      cancelled = true
    }
  }, [])
  return rate
}
