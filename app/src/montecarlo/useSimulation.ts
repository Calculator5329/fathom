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
  const [output, setOutput] = useState<SimOutput>({
    result: null,
    maxSwr: 0,
    running: true,
    error: null,
  })
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('./simulate.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      setOutput({
        result: e.data.result,
        maxSwr: e.data.maxSwr,
        running: false,
        error: e.data.error ?? null,
      })
    }
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const validAlloc = config.allocation.filter((a) => a.weight > 0)
  const weightSum = validAlloc.reduce((s, a) => s + a.weight, 0)
  const key = JSON.stringify({ ...config, allocation: validAlloc })

  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    if (validAlloc.length === 0 || Math.abs(weightSum - 100) > 0.5) {
      setOutput((o) => ({ ...o, running: false }))
      return
    }
    setOutput((o) => ({ ...o, running: true, error: null }))
    let cancelled = false
    const t = setTimeout(() => {
      // Parametric mode draws from the user's distribution — no history needed,
      // so post straight to the worker without loading the asset-class series.
      if (config.mode === 'parametric') {
        if (!workerRef.current) return
        const req: WorkerRequest = {
          allocation: validAlloc,
          returns: [],
          cpi: [],
          params: config.params,
          mode: 'parametric',
          trials: config.trials,
          seed: 0x9e3779b9,
          parametric: buildParametricInput(validAlloc, weightSum, config.parametric),
        }
        workerRef.current.postMessage(req)
        return
      }
      loadAssetClassData().then((data) => {
        if (cancelled || !workerRef.current) return
        const req: WorkerRequest = {
          allocation: validAlloc,
          returns: [...data.returns.entries()].map(([id, m]) => [id, [...m.entries()]]),
          cpi: [...data.cpi.entries()],
          params: config.params,
          mode: config.mode,
          trials: config.trials,
          seed: 0x9e3779b9,
        }
        workerRef.current.postMessage(req)
      })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return output
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
