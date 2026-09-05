import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The loader is a module-level cached promise, so every case re-imports the
 * module to start from an unloaded state.
 */
async function load() {
  vi.resetModules()
  const mod = await import('../assetClasses')
  return mod.loadAssetClassData
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const US = {
  dates: ['2020-01', '2020-02'],
  series: { usStocks: [0.01, 0.02], usBonds: [0, 0], cash: [0, 0], cpi: [100, 101] },
}
const SIZE = {
  dates: ['2020-01', '2020-02'],
  series: { smallCap: [0.03, 0.04], midCap: [0, 0], largeCap: [0, 0] },
}

const respond = (fn: (url: string) => Response) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => Promise.resolve(fn(String(input)))),
  )
}

describe('loadAssetClassData', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('indexes returns and CPI by month', async () => {
    respond((url) => json(url.includes('size-premia') ? SIZE : US))
    const data = await (await load())()
    expect(data.returns.get('usStocks')?.get('2020-02')).toBe(0.02)
    expect(data.returns.get('smallCap')?.get('2020-01')).toBe(0.03)
    expect(data.cpi.get('2020-02')).toBe(101)
  })

  it('rejects with a readable error when the server answers with the SPA page', async () => {
    // A dev/preview server that does not know the path returns index.html at
    // 200 text/html; the raw failure is "Unexpected token '<'".
    respond(
      () =>
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    )
    const loadAssetClassData = await load()
    await expect(loadAssetClassData()).rejects.toThrow(/did not return JSON/)
  })

  it('rejects when a dataset is missing a series the app needs', async () => {
    respond((url) =>
      json(
        url.includes('size-premia')
          ? SIZE
          : { dates: US.dates, series: { usStocks: US.series.usStocks } },
      ),
    )
    const loadAssetClassData = await load()
    await expect(loadAssetClassData()).rejects.toThrow(/malformed/)
  })

  it('retries the load after a failure instead of caching the rejection', async () => {
    let fail = true
    respond(() =>
      fail
        ? new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
        : json(US),
    )
    const loadAssetClassData = await load()
    await expect(loadAssetClassData()).rejects.toThrow()
    fail = false
    respond((url) => json(url.includes('size-premia') ? SIZE : US))
    await expect(loadAssetClassData()).resolves.toBeTruthy()
  })
})
