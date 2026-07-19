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

/** A dividend credited to the account (negative = foreign tax clawback). */
export interface DividendInput {
  date: string
  ticker: string
  amount: number
}

/** External money moving in (+) or out (−) of the account. */
export interface CashFlowInput {
  date: string
  amount: number
}

type ActionKind = 'buy' | 'sell' | 'dividend' | 'foreignTax' | 'deposit' | 'withdrawal' | 'ignore'
type BrokerPresetId = 'fidelity' | 'schwab' | 'vanguard' | 'generic'

interface PositionColumns {
  ticker: number
  shares: number
  positionAsOf: number
}

interface ActivityColumns {
  date: number
  ticker: number
  action: number
  shares: number
  price: number
  amount: number
}

interface BrokerPreset {
  id: BrokerPresetId
  sniffPositions(headers: string[], sampleRows: string[][]): number
  sniffActivity(headers: string[], sampleRows: string[][]): number
  scorePositions(headers: string[], sampleRows: string[][]): number
  scoreActivity(headers: string[], sampleRows: string[][]): number
  mapPositions(headers: string[]): PositionColumns | null
  mapActivity(headers: string[]): ActivityColumns | null
  classifyAction(raw: string): ActionKind
  ignorePositionRow(raw: string, cells: string[]): string | null
  ignoreActivityRow(raw: string, cells: string[]): string | null
}

const TICKER_RE = /^[A-Za-z][A-Za-z0-9.\-]{0,11}$/

const toLower = (value: string) => value.toLowerCase().trim()
const normalizeHeader = (value: string) => toLower(value).replace(/[\u2011\u2013]/g, '-')

function findCol(headers: string[], aliases: string[]): number {
  const idx = headers.findIndex((h) => aliases.includes(h))
  if (idx >= 0) return idx
  return headers.findIndex((h) => aliases.some((a) => h.includes(a)))
}

function findAlias(headers: string[], aliases: string[]): boolean {
  return headers.some((header) => {
    const c = header
    return aliases.includes(c) || aliases.some((a) => c.includes(a))
  })
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const minusSign = trimmed.replace(/\u2212/g, '-')
  const unparenthesized = minusSign.replace(/^\((.+)\)$/u, '-$1')
  const cleaned = unparenthesized.replace(/[,$"]/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function isNumeric(raw: string): boolean {
  return /^-?\(?\d/.test(raw.trim())
}

const presets: BrokerPreset[] = [
  {
    id: 'fidelity',
    sniffPositions(headers, _sampleRows) {
      if (!findAlias(headers, ['account number', 'account name'])) return 0
      if (!findAlias(headers, ['symbol', 'ticker'])) return 0
      if (!findAlias(headers, ['quantity', 'shares', 'qty'])) return 0
      return 120
    },
    sniffActivity(headers, _sampleRows) {
      if (!findAlias(headers, ['run date', 'trade date', 'settlement date'])) return 0
      if (!findAlias(headers, ['symbol', 'ticker'])) return 0
      if (!findAlias(headers, ['action', 'transaction type', 'type'])) return 0
      if (findAlias(headers, ['cash balance', 'account number', 'account name'])) return 120
      return 0
    },
    scorePositions(headers: string[], sampleRows: string[][]) {
      let score = 0
      if (findAlias(headers, ['account number', 'account name'])) score += 70
      if (findAlias(headers, ['symbol', 'ticker'])) score += 10
      if (findAlias(headers, ['quantity', 'shares'])) score += 10
      if (sampleRows.some((row: string[]) => row.some((cell: string) => /money market|pending activity|sweep/i.test(cell)))) {
        score += 10
      }
      return score
    },
    scoreActivity(headers: string[], sampleRows: string[][]) {
      if (!findAlias(headers, ['cash balance', 'account number', 'account name'])) return 0
      let score = 0
      if (findAlias(headers, ['run date', 'trade date', 'settlement date'])) score += 35
      if (findAlias(headers, ['action', 'transaction type', 'type'])) score += 25
      if (findAlias(headers, ['symbol', 'ticker'])) score += 15
      if (findAlias(headers, ['amount', 'amount ($)', 'net amount'])) score += 10
      if (findAlias(headers, ['quantity', 'shares', 'qty'])) score += 10
      if (sampleRows.some((row: string[]) => row.some((cell: string) => /pending activity|money market|sweep/i.test(cell)))) {
        score += 10
      }
      return score
    },
    mapPositions(headers) {
      const ticker = findCol(headers, ['symbol', 'ticker'])
      const shares = findCol(headers, ['quantity', 'shares', 'qty'])
      if (ticker < 0 || shares < 0) return null
      return {
        ticker,
        shares,
        positionAsOf: findCol(headers, ['as of date', 'position as of', 'position as of date']),
      }
    },
    mapActivity(headers) {
      const date = findCol(headers, ['run date', 'trade date', 'settlement date'])
      const ticker = findCol(headers, ['symbol', 'ticker'])
      const action = findCol(headers, ['action', 'type', 'transaction type', 'activity'])
      const shares = findCol(headers, ['shares', 'quantity', 'qty'])
      const price = findCol(headers, ['price ($)', 'price', 'price per share', 'execution price', 'unit price'])
      const amount = findCol(headers, ['amount ($)', 'amount', 'net amount', 'cash balance ($)'])
      if (date < 0 || ticker < 0 || shares < 0) return null
      return { date, ticker, action, shares, price, amount }
    },
    classifyAction(raw) {
      const s = raw.toLowerCase()
      if (/\b(you )?bought\b|\bbuy\b|reinvest|purchase/.test(s)) return 'buy'
      if (/\b(you )?sold\b|sale/.test(s)) return 'sell'
      if (/dividend/i.test(s)) return 'dividend'
      if (/foreign tax/i.test(s)) return 'foreignTax'
      if (/electronic funds transfer paid|withdraw|withdrawal|eft paid|purchased/.test(s)) return 'withdrawal'
      if (/electronic funds transfer received|direct deposit|wire|ach|deposit/.test(s)) return 'deposit'
      return 'ignore'
    },
    ignorePositionRow(raw) {
      if (/pending activity/.test(toLower(raw))) return 'pending activity row'
      return null
    },
    ignoreActivityRow(raw) {
      const s = toLower(raw)
      if (s.includes('pending activity')) return 'pending activity row'
      if (s.includes('money market') || s.includes('sweep')) return 'money-market row'
      if (s.includes('disclaimer')) return 'disclaimer row'
      return null
    },
  },
  {
    id: 'schwab',
    sniffPositions(headers, sampleRows) {
      if (!findAlias(headers, ['symbol', 'ticker', 'security'])) return 0
      if (!findAlias(headers, ['quantity', 'qty', 'shares'])) return 0
      let score = 60
      if (findAlias(headers, ['position as of', 'as of', 'as-of'])) score += 40
      if (sampleRows.some((row) => row.some((cell) => /commission|fees|position value|settlement/i.test(cell)))) score += 10
      return score
    },
    sniffActivity(headers, sampleRows) {
      if (!findAlias(headers, ['trade date', 'activity date', 'run date', 'settlement date'])) return 0
      if (!findAlias(headers, ['symbol', 'ticker', 'security'])) return 0
      if (!findAlias(headers, ['transaction', 'action', 'type'])) return 0
      let score = 60
      if (findAlias(headers, ['quantity', 'qty', 'shares'])) score += 25
      if (sampleRows.some((row) => row.some((cell) => /commission|fees|principal|settlement|dividend|distribution/i.test(cell)))) score += 10
      return score
    },
    scorePositions(headers, sampleRows) {
      let score = 0
      if (findAlias(headers, ['symbol', 'ticker'])) score += 15
      if (findAlias(headers, ['quantity', 'qty', 'shares'])) score += 20
      if (findAlias(headers, ['cost basis', 'market value', 'position value'])) score += 12
      if (findAlias(headers, ['fund symbol', 'position as of'])) score += 15
      if (sampleRows.some((row) => row.some((cell) => /commission|fees|position value/i.test(cell)))) score += 10
      return score
    },
    scoreActivity(headers, sampleRows) {
      let score = 0
      if (findAlias(headers, ['trade date', 'activity date', 'settlement date'])) score += 30
      if (findAlias(headers, ['transaction type', 'action', 'type'])) score += 25
      if (findAlias(headers, ['symbol', 'ticker'])) score += 15
      if (findAlias(headers, ['quantity', 'shares', 'qty'])) score += 15
      if (sampleRows.some((row) => row.some((cell) => /commission|fees|principal|settlement/i.test(cell)))) score += 10
      return score
    },
    mapPositions(headers) {
      const ticker = findCol(headers, ['symbol', 'ticker', 'security', 'symbol description'])
      const shares = findCol(headers, ['quantity', 'shares', 'shares held', 'qty', 'units'])
      if (ticker < 0 || shares < 0) return null
      return {
        ticker,
        shares,
        positionAsOf: findCol(headers, ['position as of', 'as of', 'as-of']),
      }
    },
    mapActivity(headers) {
      const date = findCol(headers, ['trade date', 'activity date', 'run date', 'settlement date', 'as of date'])
      const ticker = findCol(headers, ['symbol', 'ticker', 'security'])
      const action = findCol(headers, ['transaction', 'action', 'type', 'activity'])
      const shares = findCol(headers, ['quantity', 'shares', 'qty', 'units'])
      const price = findCol(headers, ['price', 'price per share', 'trade price', 'execution price'])
      const amount = findCol(headers, ['amount', 'amount ($)', 'net amount', 'total amount', 'commission', 'fees'])
      if (date < 0 || ticker < 0 || shares < 0) return null
      return { date, ticker, action, shares, price, amount }
    },
    classifyAction(raw) {
      const s = raw.toLowerCase()
      if (/\byou bought\b|\breinvestment\b|\bbuy\b|\badd\b|\bpurchase\b/.test(s)) return 'buy'
      if (/\byou sold\b|\bsell\b|\bsale\b|\bclose\b/.test(s)) return 'sell'
      if (/dividend|distribution|payment/.test(s)) return 'dividend'
      if (/foreign tax|withholding/.test(s)) return 'foreignTax'
      if (/contribution|cash deposit|ach in|wire in|deposit/.test(s)) return 'deposit'
      if (/withdraw|withdrawal|ach out|wire out|cash out|fee|service/.test(s)) return 'withdrawal'
      return 'ignore'
    },
    ignorePositionRow(raw) {
      if (/subtotal|summary|disclaimer|pending/.test(toLower(raw))) return 'summary/footer row'
      return null
    },
    ignoreActivityRow(raw) {
      if (/subtotal|summary|disclaimer|pending/.test(toLower(raw))) return 'summary/footer row'
      return null
    },
  },
  {
    id: 'vanguard',
    sniffPositions(headers, _sampleRows) {
      if (!findAlias(headers, ['fund symbol', 'fund ticker'])) return 0
      if (!findAlias(headers, ['shares held', 'shares', 'quantity'])) return 0
      let score = 80
      if (findAlias(headers, ['position as of', 'as of date'])) score += 20
      return score
    },
    sniffActivity(headers, sampleRows) {
      if (!findAlias(headers, ['transaction date', 'trade date'])) return 0
      if (!findAlias(headers, ['fund symbol', 'fund ticker'])) return 0
      if (!findAlias(headers, ['transaction type', 'activity type', 'type'])) return 0
      let score = 80
      if (sampleRows.some((row) => row.some((cell) => /distribution|dividend|withdrawal|contribution|foreign tax/i.test(cell)))) score += 15
      return score
    },
    scorePositions(headers, sampleRows) {
      let score = 0
      if (findAlias(headers, ['fund symbol', 'fund ticker'])) score += 70
      if (findAlias(headers, ['position as of', 'as of date'])) score += 20
      if (findAlias(headers, ['shares held', 'quantity', 'shares'])) score += 20
      if (sampleRows.some((row) => row.some((cell) => /fund family|expense|yield/i.test(cell)))) score += 8
      return score
    },
    scoreActivity(headers, sampleRows) {
      let score = 0
      if (findAlias(headers, ['transaction date', 'trade date'])) score += 30
      if (findAlias(headers, ['transaction type', 'activity type', 'type'])) score += 25
      if (findAlias(headers, ['fund symbol', 'symbol', 'ticker'])) score += 15
      if (findAlias(headers, ['shares', 'quantity'])) score += 10
      if (sampleRows.some((row) => row.some((cell) => /distribution|dividend|withdrawal|contribution/i.test(cell)))) score += 10
      return score
    },
    mapPositions(headers) {
      const ticker = findCol(headers, ['fund symbol', 'symbol', 'ticker'])
      const shares = findCol(headers, ['shares', 'shares held', 'quantity', 'units'])
      if (ticker < 0 || shares < 0) return null
      return {
        ticker,
        shares,
        positionAsOf: findCol(headers, ['position as of', 'as of date']),
      }
    },
    mapActivity(headers) {
      const date = findCol(headers, ['transaction date', 'trade date', 'settlement date'])
      const ticker = findCol(headers, ['fund symbol', 'symbol', 'ticker'])
      const action = findCol(headers, ['transaction type', 'activity type', 'type', 'action'])
      const shares = findCol(headers, ['quantity', 'shares', 'units'])
      const price = findCol(headers, ['price', 'price paid', 'share price', 'unit price'])
      const amount = findCol(headers, ['amount', 'amount ($)', 'net amount', 'net contributions'])
      if (date < 0 || ticker < 0 || shares < 0) return null
      return { date, ticker, action, shares, price, amount }
    },
    classifyAction(raw) {
      const s = raw.toLowerCase()
      if (/\byou bought\b|\bbuy\b|\badd\b/.test(s)) return 'buy'
      if (/\bsell\b|\bredeem\b|\bremove\b|\bredemption\b/.test(s)) return 'sell'
      if (/dividend|distribution/.test(s)) return 'dividend'
      if (/foreign tax|withholding/.test(s)) return 'foreignTax'
      if (/contribution|deposit|inflow|transfer in|wire in/.test(s)) return 'deposit'
      if (/withdrawal|withdraw|outflow|transfer out|wire out|redemption/.test(s)) return 'withdrawal'
      return 'ignore'
    },
    ignorePositionRow(raw) {
      if (/subtotal|summary|disclaimer|fund transfer/i.test(toLower(raw))) return 'summary/footer row'
      return null
    },
    ignoreActivityRow(raw) {
      if (/subtotal|summary|disclaimer|fund transfer/i.test(toLower(raw))) return 'summary/footer row'
      return null
    },
  },
  {
    id: 'generic',
    sniffPositions() {
      return 0
    },
    sniffActivity() {
      return 0
    },
    scorePositions(headers, _sampleRows) {
      return findAlias(headers, ['symbol', 'ticker', 'instrument', 'security']) &&
        findAlias(headers, ['shares', 'qty', 'quantity'])
        ? 12
        : 0
    },
    scoreActivity(headers, _sampleRows) {
      if (!findAlias(headers, ['date', 'run date', 'trade date', 'activity date', 'settlement date'])) return 0
      if (!findAlias(headers, ['symbol', 'ticker', 'instrument', 'security'])) return 0
      return findAlias(headers, ['shares', 'qty', 'quantity']) ? 12 : 0
    },
    mapPositions(headers) {
      const ticker = findCol(headers, ['symbol', 'ticker', 'instrument', 'security', 'description'])
      const shares = findCol(headers, ['shares', 'quantity', 'qty'])
      if (ticker < 0 || shares < 0) return null
      return {
        ticker,
        shares,
        positionAsOf: findCol(headers, ['position as of', 'as of', 'asof']),
      }
    },
    mapActivity(headers) {
      const date = findCol(headers, ['date', 'run date', 'trade date', 'activity date', 'settlement date'])
      const ticker = findCol(headers, ['symbol', 'ticker', 'instrument', 'security', 'description'])
      const action = findCol(headers, ['action', 'side', 'type', 'transaction type', 'transaction', 'activity'])
      const shares = findCol(headers, ['shares', 'quantity', 'qty', 'units'])
      if (date < 0 || ticker < 0 || shares < 0) return null
      return {
        date,
        ticker,
        action,
        shares,
        price: findCol(headers, ['price', 'price ($)', 'price per share', 'execution price']),
        amount: findCol(headers, ['amount', 'amount ($)', 'net amount', 'cash amount']),
      }
    },
    classifyAction(raw) {
      const s = raw.toLowerCase()
      if (/\b(you )?bought\b|\bbuy\b|\badded\b|\breceived\b/.test(s)) return 'buy'
      if (/\b(you )?sold\b|\bsell\b|\bremoved\b/.test(s)) return 'sell'
      if (/dividend|distribution/.test(s)) return 'dividend'
      if (/foreign tax|withholding/.test(s)) return 'foreignTax'
      if (/contribution|electronic funds transfer|direct deposit|ach|deposit|wire|inflow/.test(s)) return 'deposit'
      if (/withdrawal|electronic funds transfer paid|withdraw|outflow|wire|payment out/.test(s)) return 'withdrawal'
      return 'ignore'
    },
    ignorePositionRow(raw) {
      if (/pending activity|disclaimer|summary/.test(toLower(raw))) return 'summary/footer row'
      return null
    },
    ignoreActivityRow(raw) {
      if (/pending activity|disclaimer|summary/.test(toLower(raw))) return 'summary/footer row'
      return null
    },
  },
]

function selectPreset(kind: 'positions' | 'activity', headers: string[], sampleRows: string[][] = []) {
  const normalized = headers.map(normalizeHeader)
  let best: { preset: BrokerPreset; columns: PositionColumns | ActivityColumns } | null = null
  let bestScore = -1
  let sniffed: { preset: BrokerPreset; columns: PositionColumns | ActivityColumns } | null = null
  let sniffedScore = 0

  for (const preset of presets) {
    const columns = kind === 'positions' ? preset.mapPositions(normalized) : preset.mapActivity(normalized)
    if (!columns) continue
    const sniff = kind === 'positions' ? preset.sniffPositions(normalized, sampleRows) : preset.sniffActivity(normalized, sampleRows)
    if (sniff > sniffedScore) {
      sniffed = { preset, columns }
      sniffedScore = sniff
      if (sniff >= 120) return sniffed
    }
    const score = kind === 'positions' ? preset.scorePositions(normalized, sampleRows) : preset.scoreActivity(normalized, sampleRows)
    if (score > bestScore) {
      bestScore = score
      best = { preset, columns }
      if ((preset.id === 'fidelity' && kind === 'activity' && score >= 40) || score >= 90) {
        break
      }
    }
  }

  if (sniffed) return sniffed

  if (!best) {
    const generic = presets[presets.length - 1]!
    const columns = kind === 'positions' ? generic.mapPositions(normalized) : generic.mapActivity(normalized)
    return columns ? { preset: generic, columns } : null
  }

  return best
}

export function detectBrokerFromCsv(
  kind: 'positions' | 'activity',
  text: string,
): BrokerPresetId | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return null
  const preview = lines.slice(0, 12).map((line) => splitCsv(line).map((c) => toLower(c.trim())))

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const headers = preview[i] ?? []
    const detected = selectPreset(kind, headers, preview.slice(i + 1, i + 12))
    if (!detected) continue
    if (kind === 'positions') {
      const cols = detected.columns as PositionColumns
      if (cols.ticker < 0 || cols.shares < 0) continue
      return detected.preset.id
    }
    const cols = detected.columns as ActivityColumns
    if (cols.date < 0 || cols.ticker < 0 || cols.shares < 0) continue
    return detected.preset.id
  }
  return null
}

/**
 * Positions: one per line — "AAPL 10", "VTI, 25%", "MSFT\t12 shares".
 * A number with % (or ≤100 when the whole list is weight-like) = weight.
 */
export function parsePositions(text: string): { positions: PositionInput[]; errors: string[] } {
  // Broker positions exports (e.g. Fidelity "Portfolio_Positions_*.csv") are
  // CSVs with Symbol/Quantity columns — detect those before line parsing.
  const csv = parsePositionsCsv(text)
  if (csv) return csv

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

  return dedupePositions(positions, errors)
}

/** Dedupe: same ticker listed twice sums. */
function dedupePositions(
  positions: PositionInput[],
  errors: string[],
): { positions: PositionInput[]; errors: string[] } {
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

/**
 * Positions from a broker CSV: any header row (within the first 10 lines)
 * that has symbol + quantity columns. Returns null when the text doesn't
 * look like such a CSV so the caller falls back to line parsing.
 */
function parsePositionsCsv(text: string): { positions: PositionInput[]; errors: string[] } | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const preview = lines.slice(0, 12).map((line) => splitCsv(line).map((c) => toLower(c.trim())))

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const headers = preview[i] ?? []
    const detected = selectPreset('positions', headers, preview.slice(i + 1, i + 12))
    if (!detected) continue
    const { preset, columns } = detected
    const cols = columns as PositionColumns

    const positions: PositionInput[] = []
    for (const line of lines.slice(i + 1)) {
      if (isCashRow(line)) continue
      const cells = splitCsv(line)
      const ignoreReason = preset.ignorePositionRow(line, cells)
      if (ignoreReason) continue
      if (cells.length < 3) continue
      const ticker = (cells[cols.ticker] ?? '').trim().toUpperCase().replace(/\*+$/, '')
      const sharesRaw = cells[cols.shares] ?? ''
      const shares = parseNumber(sharesRaw)
      if (!isNumeric(sharesRaw) || !TICKER_RE.test(ticker) || shares == null || shares <= 0) {
        continue
      }
      positions.push({ ticker, shares })
    }
    return positions.length > 0 ? dedupePositions(positions, []) : null
  }
  return null
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/"/g, '')
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // US-broker orderings: MM/DD/YYYY and Fidelity's MM-DD-YYYY.
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

/**
 * Rows that describe cash sweep / money-market activity (e.g. Fidelity SPAXX
 * dividends + reinvestments, "Pending activity"). They're cash, not
 * positions, and would otherwise pollute the analysis.
 */
function isCashRow(line: string): boolean {
  return /money market|pending activity/i.test(line)
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

export interface ParsedActivity {
  trades: TradeInput[]
  errors: string[]
  /** Rows that are neither trades nor captured income/flows. */
  skipped: number
  /** Dividends credited (and foreign-tax clawbacks, negative). */
  dividends: DividendInput[]
  /** External deposits (+) / withdrawals (−): EFTs, direct deposits. */
  cashFlows: CashFlowInput[]
}

const EMPTY_ACTIVITY = (errors: string[]): ParsedActivity => ({
  trades: [],
  errors,
  skipped: 0,
  dividends: [],
  cashFlows: [],
})

/**
 * Trade-history CSV → normalized trades PLUS the income/flow rows brokers
 * mix in. Requires date/ticker/side/shares columns (any common naming);
 * price optional. Dividends and external transfers are captured when an
 * amount column exists; everything else non-trade is skipped, not fatal.
 */
export function parseTrades(text: string): ParsedActivity {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return EMPTY_ACTIVITY(['Need a header row plus at least one trade.'])

  // Find the header row (some exports have preamble lines).
  let headerIdx = -1
  let presetChoice: { preset: BrokerPreset; columns: ActivityColumns } | null = null

  const preview = lines.slice(0, 12).map((line) => splitCsv(line).map((c) => toLower(c.trim())))

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const headers = preview[i] ?? []
    const detected = selectPreset('activity', headers, preview.slice(i + 1, i + 20))
    if (!detected || (detected.columns as ActivityColumns).date < 0) continue
    const cols = detected.columns as ActivityColumns
    if (cols.date < 0 || cols.ticker < 0 || cols.shares < 0) continue
    headerIdx = i
    presetChoice = { preset: detected.preset, columns: cols }
    break
  }

  if (headerIdx < 0 || !presetChoice) {
    return EMPTY_ACTIVITY([
      'Could not find columns for date, ticker/symbol, and shares/quantity in the header.',
    ])
  }

  const { preset, columns: cols } = presetChoice

  const trades: TradeInput[] = []
  const dividends: DividendInput[] = []
  const cashFlows: CashFlowInput[] = []
  let skipped = 0

  for (const line of lines.slice(headerIdx + 1)) {
    if (isCashRow(line)) {
      skipped++
      continue
    }
    const cells = splitCsv(line)
    const ignoreReason = preset.ignoreActivityRow(line, cells)
    if (ignoreReason) {
      skipped++
      continue
    }

    const date = normalizeDate(cells[cols.date] ?? '')
    const sharesRaw = parseNumber(cells[cols.shares] ?? '')
    const action = cols.action >= 0 ? (cells[cols.action] ?? '') : ''
    const actionKind = preset.classifyAction(action)
    const tickerRaw = (cells[cols.ticker] ?? '').toUpperCase().trim()
    const amount = cols.amount >= 0 ? parseNumber(cells[cols.amount] ?? '') : null
    const priceRaw = cols.price >= 0 ? parseNumber(cells[cols.price] ?? '') : null

    if (date && amount != null && amount !== 0) {
      if (actionKind === 'dividend' && TICKER_RE.test(tickerRaw)) {
        dividends.push({ date, ticker: tickerRaw, amount })
        continue
      }
      if (actionKind === 'foreignTax' && TICKER_RE.test(tickerRaw)) {
        dividends.push({ date, ticker: tickerRaw, amount: -Math.abs(amount) })
        continue
      }
      if (actionKind === 'deposit') {
        cashFlows.push({ date, amount: amount >= 0 ? amount : -amount })
        continue
      }
      if (actionKind === 'withdrawal') {
        cashFlows.push({ date, amount: amount <= 0 ? amount : -amount })
        continue
      }
    }

    let side: TradeInput['side'] | null = null
    let shares = sharesRaw
    if (actionKind === 'buy' || actionKind === 'sell') {
      side = actionKind
      if (shares == null || shares === 0) shares = null
      else shares = Math.abs(shares)
    } else if (cols.action < 0 && sharesRaw != null && sharesRaw !== 0) {
      side = sharesRaw < 0 ? 'sell' : 'buy'
      shares = Math.abs(sharesRaw)
    } else if (actionKind === 'ignore' && cols.action < 0) {
      side = null
    } else {
      side = null
    }

    const hasRequiredTicker = (actionKind === 'deposit' || actionKind === 'withdrawal') ? true : TICKER_RE.test(tickerRaw)
    if (!date || !hasRequiredTicker || shares == null || !Number.isFinite(shares) || shares <= 0 || !side) {
      skipped++
      continue
    }

    trades.push({
      date,
      ticker: tickerRaw,
      side,
      shares,
      price: priceRaw != null && priceRaw > 0 ? priceRaw : undefined,
    })
  }

  trades.sort((a, b) => a.date.localeCompare(b.date))
  dividends.sort((a, b) => a.date.localeCompare(b.date))
  cashFlows.sort((a, b) => a.date.localeCompare(b.date))
  return { trades, errors, skipped, dividends, cashFlows }
}
