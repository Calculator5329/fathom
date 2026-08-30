import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRetry } from '../fetchRetry'

const ok = () => new Response('{}', { status: 200 })
const status = (code: number) => new Response('', { status: code })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchRetry', () => {
  it('returns first success without retrying', async () => {
    const spy = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', spy)
    const res = await fetchRetry('u', undefined, 2, 0)
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('retries a network-level failure, then succeeds', async () => {
    const spy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', spy)
    const res = await fetchRetry('u', undefined, 2, 0)
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('retries 503 but gives the final response back when retries run out', async () => {
    const spy = vi.fn().mockResolvedValue(status(503))
    vi.stubGlobal('fetch', spy)
    const res = await fetchRetry('u', undefined, 2, 0)
    expect(res.status).toBe(503)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('rethrows a network failure after retries run out', async () => {
    const spy = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', spy)
    await expect(fetchRetry('u', undefined, 1, 0)).rejects.toThrow('Failed to fetch')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-transient statuses (404, 429)', async () => {
    for (const code of [404, 429]) {
      const spy = vi.fn().mockResolvedValue(status(code))
      vi.stubGlobal('fetch', spy)
      const res = await fetchRetry('u', undefined, 2, 0)
      expect(res.status).toBe(code)
      expect(spy).toHaveBeenCalledTimes(1)
    }
  })
})
