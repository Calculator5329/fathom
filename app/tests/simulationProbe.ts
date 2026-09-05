import { createElement, useState } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { Montecarlo } from '../src/pages/Montecarlo'
import { createRoot } from 'react-dom/client'
import { useSimulation } from '../src/montecarlo/useSimulation'
import { runParametric } from '../src/montecarlo/parametric'
import type { WorkerRequest } from '../src/montecarlo/simulate.worker'

type Config = Parameters<typeof useSimulation>[0]
const initial: Config = {
  allocation: [{ assetId: 'usStocks', weight: 100 }],
  params: { initialBalance: 1000, withdrawalRate: 0.04, strategy: 'fixedReal', horizonYears: 1, feeRate: 0 },
  mode: 'parametric', trials: 2,
}

// Test-only browser adapter. Events can deliberately arrive after termination.
export function mountSimulationProbe(surface: 'hook' | 'page' = 'hook') {
  const workers: ProbeWorker[] = []
  class ProbeWorker {
    requests: WorkerRequest[] = []
    terminated = false
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    onmessageerror: (() => void) | null = null
    constructor() { workers.push(this) }
    postMessage(request: WorkerRequest) { this.requests.push(request) }
    terminate() { this.terminated = true }
  }
  const original = window.Worker
  window.Worker = ProbeWorker as unknown as typeof Worker
  const container = document.createElement('div')
  container.id = 'simulation-probe'
  document.body.append(container)
  const root = createRoot(container)
  let update: (config: Partial<Config>) => void = () => { throw new Error('Probe not mounted') }
  function Probe() {
    const [config, setConfig] = useState(initial)
    update = patch => setConfig(current => ({ ...current, ...patch }))
    const output = useSimulation(config)
    return createElement('pre', { id: 'simulation-output' }, JSON.stringify({ ...output, result: Boolean(output.result) }))
  }
  let changeSearch: (search: string) => void = () => { throw new Error('Page not mounted') }
  function PageProbe() {
    const navigate = useNavigate()
    changeSearch = search => navigate(`/?${search}`)
    return createElement(Montecarlo)
  }
  root.render(surface === 'hook' ? createElement(Probe) : createElement(MemoryRouter, {
    initialEntries: ['/?mode=parametric&yrs=1&trials=1000'],
  }, createElement(PageProbe)))
  return {
    // Call through the latest render's setter rather than returning the initial closure.
    change: (patch: Partial<Config>) => update(patch),
    changeSearch: (search: string) => changeSearch(search),
    workers: () => workers.map(w => ({ requests: w.requests.length, terminated: w.terminated })),
    respond: (index: number, value: number, requestIndex = 0) => {
      const worker = workers[index]
      const request = worker.requests[requestIndex]
      const result = runParametric({ assets: [{ weight: 1, mean: 0.05, vol: 0.1 }], correlation: 0 }, request.params, { trials: 2, seed: 1 })
      worker.onmessage?.(new MessageEvent('message', { data: { requestId: (request as WorkerRequest & { requestId?: number }).requestId, result, maxSwr: value } }))
    },
    fail: (index: number) => workers[index].onerror?.(new ErrorEvent('error', { message: 'Synthetic worker failure', cancelable: true })),
    unmount: () => { root.unmount(); window.Worker = original },
  }
}
