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
  /** Local search-only synonyms: company names, product names, old names, common spellings. */
  aliases?: string[]
  /** Local search-only themes/categories, not currently displayed as UI chips. */
  tags?: string[]
}

/** Fallback when catalog.json hasn't been generated yet (scripts/build-catalog.mjs). */
const FALLBACK: CatalogEntry[] = [
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'ETF', startDate: '1993-01-29' },
  { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'ETF', startDate: '2001-05-31' },
  { ticker: 'BND', name: 'Vanguard Total Bond Market ETF', type: 'ETF', startDate: '2007-04-10' },
  { ticker: 'AAPL', name: 'Apple Inc.', type: 'Stock', startDate: '1980-12-12' },
  { ticker: 'KO', name: 'The Coca-Cola Company', type: 'Stock', startDate: '1970-01-02' },
]

type SemanticOverlayEntry = Omit<CatalogEntry, 'startDate'> & { startDate?: string }

const SEMANTIC_OVERLAY: SemanticOverlayEntry[] = [
  {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    type: 'Stock',
    aliases: ['Apple Computer', 'iPhone', 'iPad', 'Mac'],
    tags: ['mega cap', 'technology', 'consumer electronics'],
  },
  {
    ticker: 'MSFT',
    name: 'Microsoft Corporation',
    type: 'Stock',
    aliases: ['Microsoft', 'Azure', 'Office', 'Windows', 'OpenAI partner'],
    tags: ['mega cap', 'technology', 'software', 'cloud', 'ai'],
  },
  {
    ticker: 'NVDA',
    name: 'NVIDIA Corporation',
    type: 'Stock',
    aliases: ['Nvidia', 'GeForce', 'CUDA'],
    tags: ['mega cap', 'technology', 'semiconductor', 'chips', 'ai chips', 'ai'],
  },
  {
    ticker: 'AMZN',
    name: 'Amazon.com, Inc.',
    type: 'Stock',
    aliases: ['Amazon', 'AWS', 'Amazon Web Services'],
    tags: ['mega cap', 'technology', 'ecommerce', 'cloud'],
  },
  {
    ticker: 'GOOGL',
    name: 'Alphabet Inc.',
    type: 'Stock',
    aliases: ['Google', 'Alphabet', 'YouTube', 'Waymo'],
    tags: ['mega cap', 'technology', 'search', 'advertising', 'ai'],
  },
  {
    ticker: 'META',
    name: 'Meta Platforms, Inc.',
    type: 'Stock',
    aliases: ['Meta Platform', 'Meta Platforms', 'Facebook', 'Instagram', 'WhatsApp', 'Oculus'],
    tags: ['mega cap', 'technology', 'social media', 'advertising', 'metaverse'],
  },
  {
    ticker: 'TSLA',
    name: 'Tesla, Inc.',
    type: 'Stock',
    aliases: ['Tesla', 'Tesla Motors'],
    tags: ['mega cap', 'automotive', 'electric vehicles', 'ev'],
  },
  {
    ticker: 'BRK-B',
    name: 'Berkshire Hathaway Inc. Class B',
    type: 'Stock',
    aliases: ['Berkshire', 'Berkshire Hathaway', 'Warren Buffett'],
    tags: ['mega cap', 'financials', 'holding company', 'value'],
  },
  {
    ticker: 'PYPL',
    name: 'PayPal Holdings, Inc.',
    type: 'Stock',
    cached: false,
    aliases: ['PayPal', 'Pay Pal', 'Venmo', 'Braintree'],
    tags: ['payments', 'fintech'],
  },
  {
    ticker: 'NOW',
    name: 'ServiceNow, Inc.',
    type: 'Stock',
    cached: false,
    aliases: ['ServiceNow', 'Service Now'],
    tags: ['workflow', 'enterprise software', 'cloud', 'software'],
  },
  {
    ticker: 'PLTR',
    name: 'Palantir Technologies Inc.',
    type: 'Stock',
    cached: false,
    aliases: ['Palantir'],
    tags: ['analytics', 'software', 'ai', 'defense'],
  },
  {
    ticker: 'AVGO',
    name: 'Broadcom Inc.',
    type: 'Stock',
    cached: false,
    aliases: ['Broadcom'],
    tags: ['semiconductor', 'chips', 'ai chips', 'technology'],
  },
  {
    ticker: 'CRM',
    name: 'Salesforce, Inc.',
    type: 'Stock',
    cached: false,
    aliases: ['Salesforce', 'Sales Force'],
    tags: ['software', 'cloud', 'crm'],
  },
  {
    ticker: 'ORCL',
    name: 'Oracle Corporation',
    type: 'Stock',
    cached: false,
    aliases: ['Oracle'],
    tags: ['software', 'cloud', 'database', 'ai'],
  },
  {
    ticker: 'ADBE',
    name: 'Adobe Inc.',
    type: 'Stock',
    cached: false,
    aliases: ['Adobe', 'Photoshop', 'Creative Cloud'],
    tags: ['software', 'creative software'],
  },
  {
    ticker: 'QCOM',
    name: 'QUALCOMM Incorporated',
    type: 'Stock',
    cached: false,
    aliases: ['Qualcomm', 'Snapdragon'],
    tags: ['semiconductor', 'chips', 'mobile chips', 'technology'],
  },
  {
    ticker: 'MU',
    name: 'Micron Technology, Inc.',
    type: 'Stock',
    cached: false,
    aliases: ['Micron'],
    tags: ['semiconductor', 'chips', 'memory chips', 'technology'],
  },
  {
    ticker: 'AMD',
    name: 'Advanced Micro Devices, Inc.',
    type: 'Stock',
    cached: false,
    aliases: ['Advanced Micro Devices', 'Radeon', 'Ryzen'],
    tags: ['semiconductor', 'chips', 'ai chips', 'technology'],
  },
  {
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    type: 'ETF',
    aliases: ['S&P 500', 'SP 500', 'S and P 500'],
    tags: ['large cap', 'us stocks', 'index', 'core etf'],
  },
  {
    ticker: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    type: 'ETF',
    aliases: ['S&P 500', 'SP 500', 'Vanguard 500'],
    tags: ['large cap', 'us stocks', 'index', 'core etf'],
  },
  {
    ticker: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    type: 'ETF',
    aliases: ['Total Stock Market', 'Vanguard Total Market'],
    tags: ['total market', 'us stocks', 'index', 'core etf'],
  },
  {
    ticker: 'VTSAX',
    name: 'Vanguard Total Stock Market Index Fund Admiral Shares',
    type: 'Mutual fund',
    aliases: ['Total Stock Market', 'Vanguard Total Market'],
    tags: ['total market', 'us stocks', 'index', 'core fund'],
  },
  {
    ticker: 'QQQ',
    name: 'Invesco QQQ Trust',
    type: 'ETF',
    aliases: ['Nasdaq 100', 'NASDAQ 100', 'Invesco QQQ'],
    tags: ['large cap', 'technology', 'growth', 'index'],
  },
  {
    ticker: 'DIA',
    name: 'SPDR Dow Jones Industrial Average ETF Trust',
    type: 'ETF',
    aliases: ['Dow', 'Dow Jones', 'Dow Jones Industrial Average'],
    tags: ['large cap', 'us stocks', 'index'],
  },
  {
    ticker: 'IWM',
    name: 'iShares Russell 2000 ETF',
    type: 'ETF',
    aliases: ['Russell 2000', 'Small Caps'],
    tags: ['small cap', 'us stocks', 'index'],
  },
  {
    ticker: 'VXUS',
    name: 'Vanguard Total International Stock ETF',
    type: 'ETF',
    aliases: ['International Stocks', 'Ex-US Stocks'],
    tags: ['international', 'ex us', 'global ex us', 'index'],
  },
  {
    ticker: 'VEA',
    name: 'Vanguard FTSE Developed Markets ETF',
    type: 'ETF',
    aliases: ['Developed Markets'],
    tags: ['international', 'developed markets', 'ex us', 'index'],
  },
  {
    ticker: 'VWO',
    name: 'Vanguard FTSE Emerging Markets ETF',
    type: 'ETF',
    aliases: ['Emerging Markets'],
    tags: ['international', 'emerging markets', 'ex us', 'index'],
  },
  {
    ticker: 'SCHD',
    name: 'Schwab U.S. Dividend Equity ETF',
    type: 'ETF',
    aliases: ['Schwab Dividend'],
    tags: ['dividend', 'income', 'dividend growth'],
  },
  {
    ticker: 'VIG',
    name: 'Vanguard Dividend Appreciation ETF',
    type: 'ETF',
    aliases: ['Dividend Appreciation'],
    tags: ['dividend', 'income', 'dividend growth'],
  },
  {
    ticker: 'VYM',
    name: 'Vanguard High Dividend Yield ETF',
    type: 'ETF',
    aliases: ['High Dividend Yield'],
    tags: ['dividend', 'income', 'high yield dividend'],
  },
  {
    ticker: 'DGRO',
    name: 'iShares Core Dividend Growth ETF',
    type: 'ETF',
    cached: false,
    aliases: ['Dividend Growth'],
    tags: ['dividend', 'income', 'dividend growth'],
  },
  {
    ticker: 'NOBL',
    name: 'ProShares S&P 500 Dividend Aristocrats ETF',
    type: 'ETF',
    cached: false,
    aliases: ['Dividend Aristocrats'],
    tags: ['dividend', 'income', 'dividend growth'],
  },
  {
    ticker: 'SDY',
    name: 'SPDR S&P Dividend ETF',
    type: 'ETF',
    cached: false,
    aliases: ['S&P Dividend'],
    tags: ['dividend', 'income'],
  },
  {
    ticker: 'JEPI',
    name: 'JPMorgan Equity Premium Income ETF',
    type: 'ETF',
    cached: false,
    aliases: ['Equity Premium Income'],
    tags: ['dividend', 'income', 'covered call'],
  },
  {
    ticker: 'BND',
    name: 'Vanguard Total Bond Market ETF',
    type: 'ETF',
    aliases: ['Total Bond Market'],
    tags: ['bond', 'bonds', 'aggregate bond', 'fixed income'],
  },
  {
    ticker: 'AGG',
    name: 'iShares Core U.S. Aggregate Bond ETF',
    type: 'ETF',
    aliases: ['Aggregate Bond'],
    tags: ['bond', 'bonds', 'aggregate bond', 'fixed income'],
  },
  {
    ticker: 'TLT',
    name: 'iShares 20+ Year Treasury Bond ETF',
    type: 'ETF',
    aliases: ['Long Treasury', '20 Year Treasury'],
    tags: ['bond', 'bonds', 'treasury', 'long term treasury', 'rates'],
  },
  {
    ticker: 'IEF',
    name: 'iShares 7-10 Year Treasury Bond ETF',
    type: 'ETF',
    aliases: ['Intermediate Treasury', '10 Year Treasury'],
    tags: ['bond', 'bonds', 'treasury', 'intermediate treasury', 'rates'],
  },
  {
    ticker: 'SHY',
    name: 'iShares 1-3 Year Treasury Bond ETF',
    type: 'ETF',
    aliases: ['Short Treasury'],
    tags: ['bond', 'bonds', 'treasury', 'short term treasury', 'rates'],
  },
  {
    ticker: 'TIP',
    name: 'iShares TIPS Bond ETF',
    type: 'ETF',
    aliases: ['TIPS', 'Treasury Inflation Protected Securities'],
    tags: ['bond', 'bonds', 'treasury', 'inflation', 'tips'],
  },
  {
    ticker: 'LQD',
    name: 'iShares iBoxx $ Investment Grade Corporate Bond ETF',
    type: 'ETF',
    aliases: ['Investment Grade Corporate Bonds'],
    tags: ['bond', 'bonds', 'corporate bond', 'fixed income'],
  },
  {
    ticker: 'HYG',
    name: 'iShares iBoxx $ High Yield Corporate Bond ETF',
    type: 'ETF',
    aliases: ['High Yield Bonds', 'Junk Bonds'],
    tags: ['bond', 'bonds', 'high yield', 'corporate bond', 'fixed income'],
  },
  {
    ticker: 'GLD',
    name: 'SPDR Gold Shares',
    type: 'ETF',
    aliases: ['Gold'],
    tags: ['commodity', 'commodities', 'real assets', 'gold'],
  },
  {
    ticker: 'SLV',
    name: 'iShares Silver Trust',
    type: 'ETF',
    aliases: ['Silver'],
    tags: ['commodity', 'commodities', 'real assets', 'silver'],
  },
  {
    ticker: 'GDX',
    name: 'VanEck Gold Miners ETF',
    type: 'ETF',
    aliases: ['Gold Miners'],
    tags: ['commodity', 'commodities', 'real assets', 'gold miners'],
  },
  {
    ticker: 'VNQ',
    name: 'Vanguard Real Estate ETF',
    type: 'ETF',
    aliases: ['REIT', 'Real Estate'],
    tags: ['real estate', 'reit', 'real assets'],
  },
  {
    ticker: 'XLK',
    name: 'Technology Select Sector SPDR Fund',
    type: 'ETF',
    aliases: ['Technology Sector', 'Tech Sector'],
    tags: ['sector', 'technology'],
  },
  {
    ticker: 'XLF',
    name: 'Financial Select Sector SPDR Fund',
    type: 'ETF',
    aliases: ['Financial Sector', 'Financials'],
    tags: ['sector', 'financials'],
  },
  {
    ticker: 'XLE',
    name: 'Energy Select Sector SPDR Fund',
    type: 'ETF',
    aliases: ['Energy Sector'],
    tags: ['sector', 'energy'],
  },
  {
    ticker: 'XLV',
    name: 'Health Care Select Sector SPDR Fund',
    type: 'ETF',
    aliases: ['Healthcare Sector', 'Health Care Sector'],
    tags: ['sector', 'health care', 'healthcare'],
  },
  {
    ticker: 'XLY',
    name: 'Consumer Discretionary Select Sector SPDR Fund',
    type: 'ETF',
    aliases: ['Consumer Discretionary Sector'],
    tags: ['sector', 'consumer discretionary'],
  },
  {
    ticker: 'XLP',
    name: 'Consumer Staples Select Sector SPDR Fund',
    type: 'ETF',
    aliases: ['Consumer Staples Sector'],
    tags: ['sector', 'consumer staples'],
  },
  {
    ticker: 'XLI',
    name: 'Industrial Select Sector SPDR Fund',
    type: 'ETF',
    aliases: ['Industrial Sector', 'Industrials'],
    tags: ['sector', 'industrials'],
  },
  {
    ticker: 'XLU',
    name: 'Utilities Select Sector SPDR Fund',
    type: 'ETF',
    aliases: ['Utilities Sector'],
    tags: ['sector', 'utilities'],
  },
  {
    ticker: 'TQQQ',
    name: 'ProShares UltraPro QQQ',
    type: 'Leveraged',
    cached: true,
    aliases: ['3x QQQ', 'Triple QQQ'],
    tags: ['leveraged', '3x leveraged', 'nasdaq 100', 'technology'],
  },
  {
    ticker: 'UPRO',
    name: 'ProShares UltraPro S&P500',
    type: 'Leveraged',
    cached: true,
    aliases: ['3x S&P 500', 'Triple S&P 500'],
    tags: ['leveraged', '3x leveraged', 's&p 500', 'large cap'],
  },
  {
    ticker: 'SSO',
    name: 'ProShares Ultra S&P500',
    type: 'Leveraged',
    cached: true,
    aliases: ['2x S&P 500'],
    tags: ['leveraged', '2x leveraged', 's&p 500', 'large cap'],
  },
  {
    ticker: 'SPXL',
    name: 'Direxion Daily S&P 500 Bull 3X Shares',
    type: 'Leveraged',
    cached: false,
    aliases: ['3x S&P 500 Bull'],
    tags: ['leveraged', '3x leveraged', 's&p 500', 'large cap'],
  },
  {
    ticker: 'SOXL',
    name: 'Direxion Daily Semiconductor Bull 3X Shares',
    type: 'Leveraged',
    cached: false,
    aliases: ['3x Semiconductor Bull'],
    tags: ['leveraged', '3x leveraged', 'semiconductor', 'chips', 'ai chips'],
  },
  {
    ticker: 'TECL',
    name: 'Direxion Daily Technology Bull 3X Shares',
    type: 'Leveraged',
    cached: false,
    aliases: ['3x Technology Bull'],
    tags: ['leveraged', '3x leveraged', 'technology'],
  },
  {
    ticker: 'QLD',
    name: 'ProShares Ultra QQQ',
    type: 'Leveraged',
    cached: false,
    aliases: ['2x QQQ'],
    tags: ['leveraged', '2x leveraged', 'nasdaq 100', 'technology'],
  },
  {
    ticker: 'SQQQ',
    name: 'ProShares UltraPro Short QQQ',
    type: 'Leveraged',
    cached: false,
    aliases: ['3x Short QQQ', 'Inverse QQQ'],
    tags: ['inverse', 'leveraged', 'inverse leveraged', '3x inverse', 'nasdaq 100'],
  },
  {
    ticker: 'SPXU',
    name: 'ProShares UltraPro Short S&P500',
    type: 'Leveraged',
    cached: false,
    aliases: ['3x Short S&P 500', 'Inverse S&P 500'],
    tags: ['inverse', 'leveraged', 'inverse leveraged', '3x inverse', 's&p 500'],
  },
  {
    ticker: 'SOXS',
    name: 'Direxion Daily Semiconductor Bear 3X Shares',
    type: 'Leveraged',
    cached: false,
    aliases: ['3x Semiconductor Bear', 'Inverse Semiconductor'],
    tags: ['inverse', 'leveraged', 'inverse leveraged', '3x inverse', 'semiconductor', 'chips'],
  },
]

/**
 * Where ticker data lives. Dev serves copies from public/; production points
 * at the public GCS bucket via VITE_DATA_BASE_URL (see .env.production).
 */
const DATA_BASE: string =
  import.meta.env.VITE_DATA_BASE_URL ?? `${import.meta.env.BASE_URL}data/`

/** Cloud Run API for search + admitting tickers we haven't cached. Optional in dev. */
const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? ''
const REMOTE_SEARCH_MIN_LENGTH = 3
const REMOTE_SEARCH_COOLDOWN_MS = 15 * 60 * 1000

export interface TickerSearchResult {
  entries: CatalogEntry[]
  warning: string | null
}

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
  return getSearchCatalog().find((e) => e.ticker === t)
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, '')
}

function mergeCatalogWithOverlay(entries: CatalogEntry[]): CatalogEntry[] {
  const merged = new Map(entries.map((entry) => [entry.ticker, entry]))
  for (const overlay of SEMANTIC_OVERLAY) {
    const ticker = overlay.ticker.toUpperCase()
    const existing = merged.get(ticker)
    if (existing) {
      merged.set(ticker, {
        ...existing,
        aliases: [...new Set([...(existing.aliases ?? []), ...(overlay.aliases ?? [])])],
        tags: [...new Set([...(existing.tags ?? []), ...(overlay.tags ?? [])])],
      })
    } else {
      merged.set(ticker, {
        ...overlay,
        ticker,
        startDate: overlay.startDate ?? '',
        cached: overlay.cached ?? false,
      })
    }
  }
  return [...merged.values()]
}

function getSearchCatalog(): CatalogEntry[] {
  return mergeCatalogWithOverlay(catalog)
}

function fieldScore(value: string, normalizedQuery: string, compactQuery: string): number {
  const normalized = normalizeSearchText(value)
  const compact = compactSearchText(value)
  if (!normalized) return -1
  if (normalized === normalizedQuery || compact === compactQuery) return 2
  if (normalized.startsWith(normalizedQuery) || compact.startsWith(compactQuery)) return 3
  if (normalized.includes(normalizedQuery) || compact.includes(compactQuery)) return 4
  return -1
}

function scoreCatalogEntry(entry: CatalogEntry, query: string): number {
  const ticker = entry.ticker.toUpperCase()
  const tickerQuery = query.trim().toUpperCase()
  if (ticker === tickerQuery) return 0
  if (ticker.startsWith(tickerQuery)) return 1

  const normalizedQuery = normalizeSearchText(query)
  const compactQuery = compactSearchText(query)
  const searchableFields = [
    entry.name,
    entry.type,
    ...(entry.aliases ?? []),
    ...(entry.tags ?? []),
  ]
  return searchableFields.reduce((best, field) => {
    const score = fieldScore(field, normalizedQuery, compactQuery)
    if (score < 0) return best
    return best < 0 ? score : Math.min(best, score)
  }, -1)
}

/** Ranked search over ticker, name, type, aliases, and tags for the autocomplete. */
export function searchCatalog(query: string, limit = 8): CatalogEntry[] {
  const q = query.trim()
  if (!q) return catalog.slice(0, limit)
  const entries = getSearchCatalog()
  return entries
    .map((e) => {
      const score = scoreCatalogEntry(e, q)
      return { e, score }
    })
    .filter((x) => x.score >= 0)
    .sort(
      (a, b) =>
        a.score - b.score ||
        Number(a.e.cached === false) - Number(b.e.cached === false) ||
        a.e.ticker.localeCompare(b.e.ticker),
    )
    .slice(0, limit)
    .map((x) => x.e)
}

/**
 * Async search: local catalog first; when it comes up short and the API is
 * configured, extend with Tiingo's full ticker universe.
 */
let remoteSearchBlockedUntil = 0
const remoteSearchCache = new Map<string, Promise<TickerSearchResult>>()

function providerLimitMessage(): string {
  return 'New ticker lookup is temporarily rate-limited by the data provider. Cached tickers still work.'
}

export async function searchTickers(query: string, limit = 8): Promise<TickerSearchResult> {
  const local = searchCatalog(query, limit).map((e) => ({
    ...e,
    cached: e.cached === false ? false : true,
  }))
  const trimmed = query.trim()
  if (local.length >= 3 || !API_BASE || trimmed.length < REMOTE_SEARCH_MIN_LENGTH) {
    return { entries: local, warning: null }
  }
  if (Date.now() < remoteSearchBlockedUntil) {
    return { entries: local, warning: providerLimitMessage() }
  }

  const cacheKey = `${trimmed.toUpperCase()}:${limit}`
  let pending = remoteSearchCache.get(cacheKey)
  if (!pending) {
    pending = (async () => {
      const res = await fetch(
        `${API_BASE}/api/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`,
      )
      if (res.status === 429) {
        remoteSearchBlockedUntil = Date.now() + REMOTE_SEARCH_COOLDOWN_MS
        return { entries: local, warning: providerLimitMessage() }
      }
      if (!res.ok) return { entries: local, warning: null }
      const remote: CatalogEntry[] = await res.json()
      const seen = new Set(local.map((e) => e.ticker))
      return {
        entries: [...local, ...remote.filter((e) => !seen.has(e.ticker))].slice(0, limit),
        warning: null,
      }
    })().catch(() => ({ entries: local, warning: null }))
    remoteSearchCache.set(cacheKey, pending)
  }
  return pending
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
          if (admitted.status === 429) throw new Error(providerLimitMessage())
          if (!admitted.ok) {
            const body = await admitted.json().catch(() => null)
            throw new Error(
              body?.error ?? `No data available for ${key} - check the ticker symbol.`,
            )
          }
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
