/**
 * Parsers for the Portfolio X-ray inputs. Deliberately forgiving: brokers
 * export wildly different CSVs, and people paste hand-typed lists.
 */

export interface PositionInput {
  ticker: string
  /** Exactly one of shares or weight is set. */
  shares?: number
  weight?: number // percent
}

export interface TradeInput {
  date: string // yyyy-mm-dd
  ticker: string
  side: 'buy' | 'sell'
  shares: number
  /** Execution price; when absent we use that day's close. */
  price?: number
}

const TICKER_RE = /^[A-Za-z][A-Za-z0-9.\-]{0,11}$/

/**
 * Positions: one per line — "AAPL 10", "VTI, 25%", "MSFT\t12 shares".
 * A number with % (or ≤100 when the whole list is weight-like) = weight.
 */
export function parsePositions(text: string): { positions: PositionInput[]; errors: string[] } {
  const positions: PositionInput[] = []
  const errors: string[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  for (const line of lines) {
    const parts = line.split(/[\s,;\t]+/).filter(Boolean)
    if (parts.length === 0) continue
    const ticker = parts[0].toUpperCase()
    if (!TICKER_RE.test(ticker)) {
      errors.push(`"${line}" — doesn't start with a ticker`)
      continue
    }
    const numToken = parts.slice(1).find((p) => /^[\d.,]+%?$/.test(p.replace(/^\$/, '')))
    if (!numToken) {
      errors.push(`"${line}" — no share count or weight found`)
      continue
    }
    const isPct = numToken.endsWith('%')
    const value = Number(numToken.replace(/[%,$]/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`"${line}" — invalid number`)
      continue
    }
    positions.push(isPct ? { ticker, weight: value } : { ticker, shares: value })
  }

  // Dedupe: same ticker listed twice sums.
  const merged = new Map<string, PositionInput>()
  for (const p of positions) {
    const prev = merged.get(p.ticker)
    if (!prev) merged.set(p.ticker, { ...p })
    else if (prev.shares != null && p.shares != null) prev.shares += p.shares
    else if (prev.weight != null && p.weight != null) prev.weight += p.weight
    else errors.push(`${p.ticker} — mixed shares and % entries; using the first`)
  }
  return { positions: [...merged.values()], errors }
}

// Header aliases seen across broker exports.
const H = {
  date: ['date', 'trade date', 'tradedate', 'transaction date', 'activity date', 'run date', 'settlement date'],
  ticker: ['ticker', 'symbol', 'instrument', 'security'],
  side: ['side', 'action', 'type', 'transaction type', 'transaction', 'activity', 'buy/sell', 'description'],
  shares: ['shares', 'quantity', 'qty', 'units', 'amount of shares'],
  price: ['price', 'share price', 'price per share', 'execution price', 'unit price'],
}

function findCol(headers: string[], aliases: string[]): number {
  const idx = headers.findIndex((h) => aliases.includes(h))
  if (idx >= 0) return idx
  return headers.findIndex((h) => aliases.some((a) => h.includes(a)))
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/"/g, '')
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

function normalizeSide(raw: string): 'buy' | 'sell' | null {
  const s = raw.toLowerCase()
  if (/\bbuy|bought|purchase|reinvest/.test(s)) return 'buy'
  if (/\bsell|sold|sale\b/.test(s)) return 'sell'
  return null
}

/** Split a CSV line respecting double quotes. */
function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

/**
 * Trade-history CSV → normalized trades. Requires date/ticker/side/shares
 * columns (any common naming); price optional. Skips non-trade rows
 * (dividends, transfers) rather than failing.
 */
export function parseTrades(text: string): { trades: TradeInput[]; errors: string[]; skipped: number } {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { trades: [], errors: ['Need a header row plus at least one trade.'], skipped: 0 }

  // Find the header row (some exports have preamble lines).
  let headerIdx = -1
  let cols = { date: -1, ticker: -1, side: -1, shares: -1, price: -1 }
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const headers = splitCsv(lines[i]).map((h) => h.toLowerCase().trim())
    const c = {
      date: findCol(headers, H.date),
      ticker: findCol(headers, H.ticker),
      side: findCol(headers, H.side),
      shares: findCol(headers, H.shares),
      price: findCol(headers, H.price),
    }
    if (c.date >= 0 && c.ticker >= 0 && c.shares >= 0) {
      headerIdx = i
      cols = c
      break
    }
  }
  if (headerIdx < 0) {
    return {
      trades: [],
      errors: ['Could not find columns for date, ticker/symbol, and shares/quantity in the header.'],
      skipped: 0,
    }
  }

  const trades: TradeInput[] = []
  let skipped = 0
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsv(line)
    const date = normalizeDate(cells[cols.date] ?? '')
    const tickerRaw = (cells[cols.ticker] ?? '').toUpperCase().trim()
    const shares = Math.abs(Number((cells[cols.shares] ?? '').replace(/[,$"]/g, '')))
    const sideRaw = cols.side >= 0 ? (cells[cols.side] ?? '') : ''
    let side = normalizeSide(sideRaw)
    // Some exports encode sells as negative quantities with no side column.
    if (!side && cols.side < 0) {
      side = Number((cells[cols.shares] ?? '').replace(/[,$"]/g, '')) < 0 ? 'sell' : 'buy'
    }
    if (!date || !TICKER_RE.test(tickerRaw) || !Number.isFinite(shares) || shares <= 0 || !side) {
      skipped++
      continue
    }
    const priceRaw = cols.price >= 0 ? Number((cells[cols.price] ?? '').replace(/[,$"]/g, '')) : NaN
    trades.push({
      date,
      ticker: tickerRaw,
      side,
      shares,
      price: Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : undefined,
    })
  }
  trades.sort((a, b) => a.date.localeCompare(b.date))
  return { trades, errors, skipped }
}
