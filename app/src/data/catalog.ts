import type { TickerSeries } from '@/engine'

export type AssetType = 'Stock' | 'ETF' | 'Mutual fund' | 'Leveraged'

export interface CatalogEntry {
  ticker: string
  name: string
  type: AssetType
  /** Earliest date available, for inception / limiting-ticker hints. */
  startDate: string
  /** false = known to Tiingo but not yet in our data cache (first load is slower). */
  cached?: boolean
}

/** Fallback when catalog.json hasn't been generated yet (scripts/build-catalog.mjs). */
const FALLBACK: CatalogEntry[] = [
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'ETF', startDate: '1993-01-29' },
  { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'ETF', startDate: '2001-05-31' },
  { ticker: 'BND', name: 'Vanguard Total Bond Market ETF', type: 'ETF', startDate: '2007-04-10' },
  { ticker: 'AAPL', name: 'Apple Inc.', type: 'Stock', startDate: '1980-12-12' },
  { ticker: 'KO', name: 'The Coca-Cola Company', type: 'Stock', startDate: '1970-01-02' },
]

/**
 * Where ticker data lives. Dev serves copies from public/; production points
 * at the public GCS bucket via VITE_DATA_BASE_URL (see .env.production).
 */
const DATA_BASE: string =
  import.meta.env.VITE_DATA_BASE_URL ?? `${import.meta.env.BASE_URL}data/`

/** Cloud Run API for search + admitting tickers we haven't cached. Optional in dev. */
const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? ''

let catalog: CatalogEntry[] = FALLBACK
let catalogLoaded: Promise<CatalogEntry[]> | null = null

/**
 * Load the generated catalog (dev stand-in for the future Cloud Run search
 * endpoint — same shape, so screens won't change when the API lands).
 */
export function loadCatalog(): Promise<CatalogEntry[]> {
  if (!catalogLoaded) {
    catalogLoaded = fetch(`${DATA_BASE}tickers/catalog.json`)
      .then((res) => (res.ok ? res.json() : FALLBACK))
      .then((entries: CatalogEntry[]) => {
        catalog = entries
        return entries
      })
      .catch(() => catalog)
  }
  return catalogLoaded
}

export function getCatalog(): CatalogEntry[] {
  return catalog
}

export function lookup(ticker: string): CatalogEntry | undefined {
  const t = ticker.toUpperCase()
  return catalog.find((e) => e.ticker === t)
}

/** Ranked search over ticker + name for the autocomplete. */
export function searchCatalog(query: string, limit = 8): CatalogEntry[] {
  const q = query.trim().toUpperCase()
  if (!q) return catalog.slice(0, limit)
  return catalog
    .map((e) => {
      const t = e.ticker.toUpperCase()
      const n = e.name.toUpperCase()
      let score = -1
      if (t === q) score = 0
      else if (t.startsWith(q)) score = 1
      else if (n.startsWith(q)) score = 2
      else if (n.includes(q)) score = 3
      else if (t.includes(q)) score = 4
      return { e, score }
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.e.ticker.localeCompare(b.e.ticker))
    .slice(0, limit)
    .map((x) => x.e)
}

/**
 * Async search: local catalog first; when it comes up short and the API is
 * configured, extend with Tiingo's full ticker universe.
 */
export async function searchTickers(query: string, limit = 8): Promise<CatalogEntry[]> {
  const local = searchCatalog(query, limit).map((e) => ({ ...e, cached: true }))
  if (local.length >= 3 || !API_BASE || query.trim().length < 2) return local
  try {
    const res = await fetch(
      `${API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    )
    if (!res.ok) return local
    const remote: CatalogEntry[] = await res.json()
    const seen = new Set(local.map((e) => e.ticker))
    return [...local, ...remote.filter((e) => !seen.has(e.ticker))].slice(0, limit)
  } catch {
    return local
  }
}

/** Make a just-admitted ticker resolvable by lookup() without a full reload. */
export function upsertCatalogEntry(entry: CatalogEntry): void {
  if (!catalog.some((e) => e.ticker === entry.ticker)) {
    catalog = [...catalog, entry].sort((a, b) => a.ticker.localeCompare(b.ticker))
  }
}

const seriesCache = new Map<string, Promise<TickerSeries>>()

/** Load a full ticker series from the static data directory (cached per session). */
export function loadSeries(ticker: string): Promise<TickerSeries> {
  const key = ticker.toUpperCase()
  let promise = seriesCache.get(key)
  if (!promise) {
    promise = fetch(`${DATA_BASE}tickers/${key}.json`)
      .then(async (res) => {
        // Dev static hosting answers unknown paths with index.html (200 text/html)
        // — treat anything non-JSON as a miss so users see a clean message
        // instead of a JSON parse error.
        if (res.ok && res.headers.get('content-type')?.includes('json')) return res.json()
        // Not in the cache — ask the API to admit it (fetches from Tiingo,
        // stores to the bucket, returns the series).
        if (API_BASE) {
          const admitted = await fetch(`${API_BASE}/api/ticker/${key}`)
          if (admitted.ok) return admitted.json()
        }
        throw new Error(`No data available for ${key} — check the ticker symbol.`)
      })
      .then((raw): TickerSeries => {
        upsertCatalogEntry({
          ticker: raw.ticker ?? key,
          name: raw.name ?? key,
          type: 'Stock',
          startDate: raw.startDate ?? raw.records?.[0]?.date ?? '',
          cached: true,
        })
        return { ticker: raw.ticker ?? key, name: raw.name, records: raw.records }
      })
      .catch((err) => {
        seriesCache.delete(key) // allow retry after a failure
        throw err
      })
    seriesCache.set(key, promise)
  }
  return promise
}

export function loadManySeries(tickers: string[]): Promise<TickerSeries[]> {
  return Promise.all([...new Set(tickers.map((t) => t.toUpperCase()))].map(loadSeries))
}
