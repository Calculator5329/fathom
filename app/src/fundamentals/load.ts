export interface FiscalYear {
  year: number
  revenue: number | null
  netIncome: number | null
  grossProfit: number | null
  operatingIncome: number | null
  epsDiluted: number | null
  sharesDiluted: number | null
  operatingCashFlow: number | null
  fcf: number | null
  dividendsPaid: number | null
  totalDebt: number | null
  totalAssets: number | null
  totalLiabilities: number | null
  stockholdersEquity: number | null
  cashAndEquivalents: number | null
  currentAssets: number | null
  currentLiabilities: number | null
  longTermDebt: number | null
  inventory: number | null
  grossMargin: number | null
  operatingMargin: number | null
  netMargin: number | null
}

export interface Quarter {
  fiscalYear: number
  fiscalQuarter: number
  periodEnd: string // yyyy-mm-dd
  revenue: number | null
  netIncome: number | null
  grossProfit: number | null
  operatingIncome: number | null
  epsDiluted: number | null
  grossMargin: number | null
  operatingMargin: number | null
  netMargin: number | null
}

export interface Fundamentals {
  ticker: string
  cik: string
  name: string
  source: string
  fetchedAt: string
  fiscalYears: FiscalYear[]
  quarters: Quarter[]
}

const DATA_BASE: string =
  import.meta.env.VITE_DATA_BASE_URL ?? `${import.meta.env.BASE_URL}data/`

const cache = new Map<string, Promise<Fundamentals | null>>()

/**
 * Some filers never tag total Liabilities directly (AMZN), but the balance
 * sheet identity fills it: liabilities = assets − equity.
 */
function normalize(f: Fundamentals | null): Fundamentals | null {
  if (!f) return null
  for (const fy of f.fiscalYears) {
    if (fy.totalLiabilities == null && fy.totalAssets != null && fy.stockholdersEquity != null) {
      fy.totalLiabilities = fy.totalAssets - fy.stockholdersEquity
    }
  }
  return f
}

/** Load a ticker's fundamentals (null if none — e.g. ETFs, foreign, uncovered). */
export function loadFundamentals(ticker: string): Promise<Fundamentals | null> {
  const key = ticker.toUpperCase()
  let p = cache.get(key)
  if (!p) {
    p = fetch(`${DATA_BASE}fundamentals/${key}.json`)
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('json') ? res.json() : null))
      .then((f) => normalize(f as Fundamentals | null))
      .catch(() => null)
    cache.set(key, p)
  }
  return p
}
