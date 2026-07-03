/**
 * Fathom API — Cloud Run service.
 *
 *   GET  /healthz
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
import { fetchTickerFull, searchTiingo } from './tiingo.mjs'

const PORT = Number(process.env.PORT) || 8080
const BUCKET = process.env.BUCKET || 'ethan-488900-fathom-data'
const CATALOG_PATH = 'tickers/catalog.json'
const CATALOG_TTL_MS = 5 * 60 * 1000
const CACHE_CONTROL = 'public, max-age=3600'

const storage = new Storage()
const bucket = storage.bucket(BUCKET)

// ---- catalog cache -------------------------------------------------------
let catalog = []
let catalogLoadedAt = 0

async function loadCatalog(force = false) {
  if (!force && Date.now() - catalogLoadedAt < CATALOG_TTL_MS) return catalog
  const [buf] = await bucket.file(CATALOG_PATH).download()
  catalog = JSON.parse(buf.toString())
  catalogLoadedAt = Date.now()
  return catalog
}

async function saveCatalog(next) {
  catalog = next.sort((a, b) => a.ticker.localeCompare(b.ticker))
  catalogLoadedAt = Date.now()
  await bucket.file(CATALOG_PATH).save(JSON.stringify(catalog), {
    contentType: 'application/json',
    metadata: { cacheControl: 'public, max-age=300' },
  })
}

async function saveSeries(data) {
  await bucket.file(`tickers/${data.ticker}.json`).save(JSON.stringify(data), {
    contentType: 'application/json',
    metadata: { cacheControl: CACHE_CONTROL },
  })
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
      await saveSeries(data)
      const cat = await loadCatalog(true)
      if (!cat.some((e) => e.ticker === data.ticker)) {
        let type = 'Stock'
        try {
          const [match] = await searchTiingo(data.ticker, 1)
          if (match?.ticker === data.ticker) type = match.type
        } catch {
          /* default Stock */
        }
        await saveCatalog([
          ...cat,
          { ticker: data.ticker, name: data.name, type, startDate: data.startDate },
        ])
      }
      return data
    })().finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

async function handleRefresh() {
  const cat = await loadCatalog(true)
  const results = { refreshed: 0, failed: [] }
  const updated = []
  for (const entry of cat) {
    try {
      const data = await fetchTickerFull(entry.ticker)
      if (!data) throw new Error('no data')
      await saveSeries(data)
      updated.push({ ...entry, startDate: data.startDate })
      results.refreshed++
    } catch (err) {
      results.failed.push(`${entry.ticker}: ${err.message}`)
      updated.push(entry)
    }
    await new Promise((r) => setTimeout(r, 1200)) // stay polite to Tiingo
  }
  await saveCatalog(updated)
  return results
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
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return send(res, 200, { ok: true })
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
      const results = await handleRefresh()
      console.log('refresh complete:', JSON.stringify(results))
      return send(res, 200, results)
    }

    return send(res, 404, { error: 'not found' })
  } catch (err) {
    console.error(`${req.method} ${url.pathname} failed:`, err)
    return send(res, 500, { error: 'internal error' })
  }
})

server.listen(PORT, () => console.log(`fathom-api listening on :${PORT}`))
