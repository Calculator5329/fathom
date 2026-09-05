import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from '../simulate.worker'

const scope: { onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null } = { onmessage: null }
const post = vi.fn<(response: WorkerResponse) => void>()
const request: WorkerRequest = {
  requestId: 17,
  allocation: [{ assetId: 'usStocks', weight: 100 }],
  returns: [], cpi: [],
  params: { initialBalance: 1000, withdrawalRate: 0.04, strategy: 'fixedReal', horizonYears: 1, feeRate: 0 },
  mode: 'parametric', trials: 2, seed: 1,
  parametric: { assets: [{ weight: 1, mean: 0.05, vol: 0.1 }], correlation: 0 },
}

beforeEach(async () => {
  vi.resetModules()
  post.mockClear()
  vi.stubGlobal('self', scope)
  vi.stubGlobal('postMessage', post)
  await import('../simulate.worker')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function send(data: WorkerRequest) {
  scope.onmessage!({ data } as MessageEvent<WorkerRequest>)
  expect(post).toHaveBeenCalledTimes(1)
  return post.mock.calls[0][0]
}

describe('simulation worker request correlation', () => {
  it('echoes the request id with a successful synthetic simulation', () => {
    const response = send(request)
    expect(response.requestId).toBe(17)
    expect(response.result).not.toBeNull()
    expect(response.error).toBeUndefined()
  })
  it('echoes the request id with input/history errors', () => {
    const response = send({ ...request, requestId: 18, mode: 'historical' })
    expect(response.requestId).toBe(18)
    expect(response.result).toBeNull()
    expect(response.error).toBeTruthy()
  })
  it('echoes the request id when computation throws', async () => {
    const parametric = await import('../parametric')
    vi.spyOn(parametric, 'runParametric').mockImplementationOnce(() => { throw new Error('Synthetic computation failure') })
    const response = send({ ...request, requestId: 19 })
    expect(response.requestId).toBe(19)
    expect(response.result).toBeNull()
    expect(response.error).toBe('Synthetic computation failure')
  })
})
