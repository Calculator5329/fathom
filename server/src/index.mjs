/**
 * Fathom API — Cloud Run service.
 *
 *   GET  /api/health          (note: /healthz is reserved by Google's frontend on run.app)
 *   GET  /api/search?q=voo     catalog search; falls through to Tiingo search
 *                              for symbols we haven't cached yet
 *   GET  /api/ticker/:SYM      returns the series; unknown tickers are fetched
 *                              from Tiingo, cached to GCS, added to the catalog
 *   POST /api/refresh          nightly full refresh of every cached ticker
 *                              (requires X-Refresh-Token) — full refetch, not
 *                              append, because adjusted closes rebase whenever
 *                              a dividend is paid
 *
 * Data lives in the public GCS bucket; the browser reads series straight from
 * storage.googleapis.com. This service only searches, admits new tickers, and
 * refreshes.
 */
import http from 'node:http'
import { Storage } from '@google-cloud/storage'
import { fetchFundamentals } from './edgar.mjs'
import {
  isWeekdayCycle,
  mergeRefreshBatch,
  refreshFreshness,
  resolveRefreshPlan,
  selectRefreshBatch,
} from './refresh.mjs'
import { TiingoError, fetchTickerFull, searchTiingo } from './tiingo.mjs'

const PORT = Number(process.env.PORT) || 8080
const BUCKET = process.env.BUCKET || 'ethan-488900-fathom-data'
const CATALOG_PATH = 'tickers/catalog.json'
const CATALOG_TTL_MS = 5 * 60 * 1000
const CACHE_CONTROL = 'public,max-age=3600'

const storage = new Storage()
const bucket = storage.bucket(BUCKET)

// ---- catalog cache -------------------------------------------------------
let catalog = []
let catalogLoadedAt = 0
let catalogGeneration = null

function upstreamMessage(err) {
  if (err instanceof TiingoError && err.status === 429) {
    return {
      status: 429,
      body: {
        error: 'Data provider rate limit reached. Try again later.',
        code: 'DATA_PROVIDER_RATE_LIMITED',
      },
      headers: { 'Retry-After': '3600' },
    }
  }
  if (err instanceof TiingoError && err.status >= 500) {
    return {
      status: 503,
      body: {
        error: 'Data provider is temporarily unavailable. Try again later.',
        code: 'DATA_PROVIDER_UNAVAILABLE',
      },
      headers: { 'Retry-After': '300' },
    }
  }
  return null
}

async function loadCatalog(force = false) {
  if (!force && Date.now() - catalogLoadedAt < CATALOG_TTL_MS) return catalog
  const file = bucket.file(CATALOG_PATH)
  let buf = null
  let generation = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [metadata] = await file.getMetadata()
    generation = metadata.generation ?? null
    const source = generation ? bucket.file(CATALOG_PATH, { generation }) : file
    try {
      const downloaded = await source.download()
      buf = downloaded[0]
      break
    } catch (err) {
      if (Number(err?.code ?? err?.statusCode) !== 404 || attempt === 2) throw err
    }
  }
  catalog = JSON.parse(buf.toString())
  catalogLoadedAt = Date.now()
  catalogGeneration = generation
  return catalog
}

function isPreconditionFailed(err) {
  return Number(err?.code ?? err?.statusCode) === 412
}

async function updateCatalog(mutator) {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fresh = await loadCatalog(true)
    const next = await mutator([...fresh])
    if (next === null) return { changed: false, catalog: fresh }

    const sorted = next.toSorted((a, b) => a.ticker.localeCompare(b.ticker))
    const saveOptions = {
      contentType: 'application/json',
      metadata: { cacheControl: 'public, max-age=300' },
    }
    if (catalogGeneration !== null) {
      saveOptions.preconditionOpts = { ifGenerationMatch: catalogGeneration }
    }
    try {
      await bucket.file(CATALOG_PATH).save(JSON.stringify(sorted), saveOptions)
      catalog = sorted
      catalogLoadedAt = Date.now()
      const [metadata] = await bucket.file(CATALOG_PATH).getMetadata()
      catalogGeneration = metadata.generation ?? null
      return { changed: true, catalog }
    } catch (err) {
      if (!isPreconditionFailed(err)) throw err
      lastError = err
    }
  }
  throw lastError ?? new Error('catalog update failed')
}

async function saveJson(path, data, cacheControl = CACHE_CONTROL) {
  await bucket.file(path).save(JSON.stringify(data), {
    contentType: 'application/json',
    metadata: { cacheControl },
  })
}

async function saveVersionedJson(path, data, cacheControl = CACHE_CONTROL) {
  const payload = { ...data, v: 1 }
  await saveJson(path, payload, cacheControl)
  return payload
}

async function saveReport(path, report) {
  return saveVersionedJson(path, report, CACHE_CONTROL)
}

async function loadReport(path) {
  try {
    const [buffer] = await bucket.file(path).download()
    return JSON.parse(buffer.toString())
  } catch (err) {
    if (Number(err?.code ?? err?.statusCode) === 404) return null
    throw err
  }
}

async function saveFundamentals(data) {
  return saveVersionedJson(`fundamentals/${data.ticker}.json`, data, CACHE_CONTROL)
}

async function cacheFundamentals(ticker) {
  const data = await fetchFundamentals(ticker)
  if (!data) {
    console.warn(`${ticker}: no EDGAR fundamentals to cache`)
    return null
  }
  return saveFundamentals(data)
}

async function saveSeries(data) {
  return saveVersionedJson(`tickers/${data.ticker}.json`, data, CACHE_CONTROL)
}

// ---- handlers ------------------------------------------------------------
function searchLocal(cat, q, limit) {
  const Q = q.trim().toUpperCase()
  if (!Q) return cat.slice(0, limit)
  return cat
    .map((e) => {
      const t = e.ticker.toUpperCase()
      const n = (e.name ?? '').toUpperCase()
      let score = -1
      if (t === Q) score = 0
      else if (t.startsWith(Q)) score = 1
      else if (n.startsWith(Q)) score = 2
      else if (n.includes(Q)) score = 3
      else if (t.includes(Q)) score = 4
      return { e, score }
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.e.ticker.localeCompare(b.e.ticker))
    .slice(0, limit)
    .map((x) => ({ ...x.e, cached: true }))
}

async function handleSearch(q, limit) {
  const cat = await loadCatalog()
  const local = searchLocal(cat, q, limit)
  if (local.length >= 3 || q.trim().length < 2) return local
  // Not enough cached hits — surface the rest of Tiingo's universe.
  const cachedSet = new Set(local.map((e) => e.ticker))
  let remote = []
  try {
    remote = (await searchTiingo(q, limit)).filter((e) => !cachedSet.has(e.ticker))
  } catch (err) {
    console.warn('tiingo search failed:', err.message)
    if (local.length === 0 && upstreamMessage(err)) throw err
  }
  return [...local, ...remote].slice(0, limit)
}

const inflight = new Map()

/** Fetch-and-cache an unknown ticker exactly once even under concurrent requests. */
function admitTicker(symbol) {
  const key = symbol.toUpperCase()
  let p = inflight.get(key)
  if (!p) {
    p = (async () => {
      const data = await fetchTickerFull(key)
      if (!data) return null
      const savedData = await saveSeries(data)
      let type = 'Stock'
      try {
        const [match] = await searchTiingo(data.ticker, 1)
        if (match?.ticker === data.ticker) type = match.type
      } catch {
        /* default Stock */
      }

      let catalogType = type
      await updateCatalog((cat) => {
        const existing = cat.find((e) => e.ticker === data.ticker)
        if (existing) {
          catalogType = existing.type
          return null
        }
        return [...cat, { ticker: data.ticker, name: data.name, type, startDate: data.startDate }]
      })

      if (catalogType === 'Stock') {
        cacheFundamentals(data.ticker).catch(console.warn)
      }

      return savedData
    })().finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

async function handleRefresh(searchParams) {
  const startedAt = Date.now()
  const cat = await loadCatalog(true)
  const existingReport = await loadReport('refresh-report.json')
  const plan = resolveRefreshPlan({ searchParams, existingReport, catalogSize: cat.length })
  if (!isWeekdayCycle(plan.cycleId)) {
    return { skipped: true, reason: 'weekend market cycle', cycleId: plan.cycleId }
  }
  if (plan.alreadyComplete) return existingReport
  const selected = selectRefreshBatch(cat, plan.batchIndex, plan.batchCount)
  const results = { refreshed: 0, failed: [] }
  const updated = []
  const endDateCounts = {}
  for (const entry of selected) {
    try {
      const data = await fetchTickerFull(entry.ticker, { max429Retries: 3, retryDelayMs: 60_000 })
      if (!data) throw new Error('no data')
      await saveSeries(data)
      updated.push({ ...entry, startDate: data.startDate })
      results.refreshed++
      const endDate = data.endDate ?? 'missing'
      endDateCounts[endDate] = (endDateCounts[endDate] ?? 0) + 1
    } catch (err) {
      results.failed.push(`${entry.ticker}: ${err.message}`)
      updated.push(entry)
    }
    await new Promise((r) => setTimeout(r, 1200)) // stay polite to Tiingo
  }
  const updatedByTicker = new Map(updated.map((entry) => [entry.ticker, entry]))
  await updateCatalog((fresh) => fresh.map((entry) => updatedByTicker.get(entry.ticker) ?? entry))
  const batchReport = {
    batchIndex: plan.batchIndex,
    batchCount: plan.batchCount,
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    attempted: selected.length,
    refreshed: results.refreshed,
    failed: results.failed,
    endDateCounts,
  }
  const report = mergeRefreshBatch(existingReport, batchReport, {
    cycleId: plan.cycleId,
    batchCount: plan.batchCount,
    catalogSize: cat.length,
  })
  return saveReport('refresh-report.json', report)
}

async function handleRefreshFundamentals() {
  const startedAt = Date.now()
  const cat = await loadCatalog(true)
  const stocks = cat.filter((entry) => entry.type === 'Stock')
  const results = { refreshed: 0, failed: [] }

  for (const entry of stocks) {
    try {
      const data = await fetchFundamentals(entry.ticker)
      if (!data) throw new Error('no fundamentals')
      await saveFundamentals(data)
      results.refreshed++
    } catch (err) {
      results.failed.push(`${entry.ticker}: ${err.message}`)
    }
  }

  const report = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    refreshed: results.refreshed,
    failed: results.failed,
    catalogSize: cat.length,
  }
  return saveReport('fundamentals-report.json', report)
}

// ---- http ----------------------------------------------------------------
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  })
  res.end(payload)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const freshness = refreshFreshness(await loadReport('refresh-report.json'))
      return send(res, 200, { ok: true, refresh: freshness })
    }

    if (req.method === 'GET' && url.pathname === '/api/freshness') {
      const freshness = refreshFreshness(await loadReport('refresh-report.json'))
      return send(res, freshness.ok ? 200 : 503, freshness, {
        'Cache-Control': 'public, max-age=60',
      })
    }

    if (req.method === 'GET' && url.pathname === '/api/search') {
      const q = url.searchParams.get('q') ?? ''
      const limit = Math.min(Number(url.searchParams.get('limit')) || 8, 25)
      return send(res, 200, await handleSearch(q, limit), {
        'Cache-Control': 'public, max-age=60',
      })
    }

    const tickerMatch = url.pathname.match(/^\/api\/ticker\/([A-Za-z0-9.\-]{1,12})$/)
    if (req.method === 'GET' && tickerMatch) {
      const symbol = tickerMatch[1].toUpperCase()
      const file = bucket.file(`tickers/${symbol}.json`)
      const [exists] = await file.exists()
      if (exists) {
        // Already cached — the public bucket URL is the fast path.
        return send(res, 302, '', {
          Location: `https://storage.googleapis.com/${BUCKET}/tickers/${symbol}.json`,
        })
      }
      const data = await admitTicker(symbol)
      if (!data) return send(res, 404, { error: `Unknown ticker: ${symbol}` })
      return send(res, 200, data)
    }

    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      if (
        !process.env.REFRESH_TOKEN ||
        req.headers['x-refresh-token'] !== process.env.REFRESH_TOKEN
      ) {
        return send(res, 401, { error: 'unauthorized' })
      }
      const results = await handleRefresh(url.searchParams)
      console.log('refresh complete:', JSON.stringify(results))
      return send(res, 200, results)
    }

    if (req.method === 'POST' && url.pathname === '/api/refresh-fundamentals') {
      if (
        !process.env.REFRESH_TOKEN ||
        req.headers['x-refresh-token'] !== process.env.REFRESH_TOKEN
      ) {
        return send(res, 401, { error: 'unauthorized' })
      }
      const results = await handleRefreshFundamentals()
      console.log('fundamentals refresh complete:', JSON.stringify(results))
      return send(res, 200, results)
    }

    return send(res, 404, { error: 'not found' })
  } catch (err) {
    console.error(`${req.method} ${url.pathname} failed:`, err)
    const upstream = upstreamMessage(err)
    if (upstream) return send(res, upstream.status, upstream.body, upstream.headers)
    return send(res, 500, { error: 'internal error' })
  }
})

server.listen(PORT, () => console.log(`fathom-api listening on :${PORT}`))
