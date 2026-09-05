import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const entry = { ticker: 'SYNTHETIC', name: 'Synthetic fixture', type: 'Stock', startDate: '' }

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', 'https://synthetic.invalid')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

function intercept(first: () => Promise<Response>) {
  const fetch = vi.fn(async (url: string) => {
    expect(new URL(url).hostname).toBe('synthetic.invalid')
    return fetch.mock.calls.length === 1 ? first() : new Response(JSON.stringify([entry]))
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('remote search transient failure cache', () => {
  for (const [name, fail] of [
    ['HTTP', async () => new Response('', { status: 503 })],
    ['network', async () => { throw new Error('synthetic network') }],
    ['JSON', async () => new Response('invalid-json')],
  ] as const) it(`retries the same query after ${name} failure`, async () => {
    const fetch = intercept(fail)
    const { searchTickers } = await import('../catalog')
    expect(await searchTickers('zzsynthetic')).toEqual({ entries: [], warning: null })
    expect((await searchTickers('zzsynthetic')).entries).toEqual([entry])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps global 429 cooldown and retries the failed query after expiry', async () => {
    const fetch = intercept(async () => new Response('', { status: 429 }))
    const { searchTickers } = await import('../catalog')
    expect((await searchTickers('zzsynthetic')).warning).toMatch(/rate-limited/)
    expect((await searchTickers('zzanother')).warning).toMatch(/rate-limited/)
    vi.advanceTimersByTime(15 * 60 * 1000 - 1)
    expect((await searchTickers('zzsynthetic')).warning).toMatch(/rate-limited/)
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(await searchTickers('zzsynthetic')).toEqual({ entries: [entry], warning: null })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('deduplicates inflight and successfully completed searches', async () => {
    let finish!: (response: Response) => void
    const fetch = intercept(() => new Promise(resolve => { finish = resolve }))
    const { searchTickers } = await import('../catalog')
    const first = searchTickers('zzsynthetic'), second = searchTickers('zzsynthetic')
    expect(fetch).toHaveBeenCalledTimes(1)
    finish(new Response(JSON.stringify([entry])))
    expect(await first).toEqual(await second)
    expect((await searchTickers('zzsynthetic')).entries).toEqual([entry])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
