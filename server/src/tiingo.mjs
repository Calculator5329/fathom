/** Tiingo client: fetch + normalize to the canonical schema used everywhere. */

const TIINGO = 'https://api.tiingo.com'

export class TiingoError extends Error {
  constructor(path, status, retryAfterMs = null) {
    super(`Tiingo ${path}: HTTP ${status}`)
    this.name = 'TiingoError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

function token() {
  // trim: secrets created via shell pipes can carry a trailing newline,
  // which Tiingo rejects with HTTP 403
  const t = process.env.TIINGO_API_TOKEN?.trim()
  if (!t) throw new Error('TIINGO_API_TOKEN not set')
  return t
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function tiingoJson(path, params = {}, options = {}) {
  const url = new URL(`${TIINGO}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('token', token())
  const max429Retries = options.max429Retries ?? 0
  const retryDelayMs = options.retryDelayMs ?? 60_000
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } })
    if (res.status === 404) return null
    if (res.ok) return res.json()
    const retryAfterSeconds = Number(res.headers.get('retry-after'))
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1_000
      : retryDelayMs
    if (res.status === 429 && attempt < max429Retries) {
      await wait(Math.max(retryDelayMs, retryAfterMs))
      continue
    }
    throw new TiingoError(path, res.status, retryAfterMs)
  }
}

const round6 = (x) => (x == null ? 0 : Math.round(x * 1e6) / 1e6)

/** Full normalized history + metadata, or null when the ticker is unknown. */
export async function fetchTickerFull(symbol, options = {}) {
  const meta = await tiingoJson(`/tiingo/daily/${encodeURIComponent(symbol)}`, {}, options)
  if (!meta || !meta.ticker) return null
  const prices = await tiingoJson(`/tiingo/daily/${encodeURIComponent(symbol)}/prices`, {
    startDate: '1900-01-01',
    format: 'json',
  }, options)
  if (!Array.isArray(prices) || prices.length === 0) return null

  const records = prices.map((p) => ({
    date: String(p.date).slice(0, 10),
    close: round6(p.close),
    adjClose: round6(p.adjClose),
    divCash: round6(p.divCash),
    splitFactor: p.splitFactor == null ? 1 : round6(p.splitFactor),
  }))

  return {
    ticker: meta.ticker.toUpperCase(),
    name: meta.name ?? meta.ticker,
    exchange: meta.exchangeCode ?? '',
    source: 'tiingo',
    fetchedAt: new Date().toISOString(),
    startDate: records[0].date,
    endDate: records[records.length - 1].date,
    recordCount: records.length,
    records,
  }
}

/** Tiingo ticker search -> catalog-shaped entries (not yet cached locally). */
export async function searchTiingo(query, limit = 8) {
  const results = await tiingoJson('/tiingo/utilities/search', {
    query,
    limit: String(limit),
  })
  if (!Array.isArray(results)) return []
  const typeMap = { Stock: 'Stock', ETF: 'ETF', 'Mutual Fund': 'Mutual fund' }
  return results
    .filter((r) => r.ticker && (r.assetType in typeMap || !r.assetType))
    .map((r) => ({
      ticker: String(r.ticker).toUpperCase(),
      name: r.name ?? r.ticker,
      type: typeMap[r.assetType] ?? 'Stock',
      startDate: '',
      cached: false,
    }))
}
