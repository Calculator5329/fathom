import type { CashFlowInput, DividendInput, PositionInput, TradeInput } from '@/xray/parse'
import type { ActionKind, ColumnMapping, ImportCounts, ImportReport, NormalizedBrokerImport } from './types'

const TICKER_RE = /^[A-Za-z][A-Za-z0-9.\-]{0,11}$/

function normalizeDate(raw: string): string | null {
  const value = raw.trim().replace(/"/g, '')
  if (!value) return null

  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`

  match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3]
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
  }

  match = value.match(/^([a-z]{3})-(\d{1,2})-(\d{2,4})$/i)
  if (match) {
    const months = [
      'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    ]
    const idx = months.indexOf(match[1].toLowerCase())
    if (idx >= 0) {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3]
      return `${year}-${String(idx + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}`
    }
  }

  return null
}

function normalizeNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed === '-' || trimmed === '—') return null

  const unicodeMinus = trimmed.replace('−', '-')
  const noParen = unicodeMinus.replace(/^\((.+)\)$/, '-$1')
  const cleaned = noParen.replace(/[,\$€£¥\s]/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function getValue(
  row: Map<string, string>,
  mapping: ColumnMapping,
  key: keyof ColumnMapping['columns'],
): string {
  const source = mapping.columns[key]
  if (!source) return ''
  return row.get(source) ?? ''
}

export function normalizeBrokerRows(
  kind: 'positions' | 'activity',
  mapping: ColumnMapping,
  headers: string[],
  bodyRows: string[][],
  classifyAction: (raw: string) => ActionKind,
  isIgnored: (raw: string[]) => string | null,
): NormalizedBrokerImport {
  const positions: PositionInput[] = []
  const trades: TradeInput[] = []
  const dividends: DividendInput[] = []
  const cashFlows: CashFlowInput[] = []
  const counts: ImportCounts = {
    positions: 0,
    buys: 0,
    sells: 0,
    dividends: 0,
    cashFlows: 0,
    ignoredRows: 0,
    unsupportedRows: 0,
  }
  const warnings: string[] = []
  const errors: string[] = []
  const dates: string[] = []
  const seen = new Set<string>()

  const rows = bodyRows
    .map((row, index) => {
      const rowMap = new Map<string, string>()
      headers.forEach((header, i) => {
        if (header) rowMap.set(header, row[i] ?? '')
      })
      return { rowMap, rowNumber: index + 2 }
    })
    .filter(({ rowMap }) => Array.from(rowMap.values()).some((v) => v.trim().length > 0))

  const asOfField = mapping.columns.positionAsOf

  for (const { rowMap, rowNumber } of rows) {
    const rawRow = headers.map((h) => rowMap.get(h) ?? '')
    const ignoreReason = isIgnored(rawRow)
    if (ignoreReason) {
      counts.ignoredRows += 1
      warnings.push(`Row ${rowNumber} ignored: ${ignoreReason}`)
      continue
    }

    if (kind === 'positions') {
      if (!mapping.columns.ticker || !mapping.columns.shares) {
        errors.push('Positions mapping missing required fields')
        break
      }
      const ticker = getValue(rowMap, mapping, 'ticker').toUpperCase().trim().replace(/\*+$/, '')
      const shares = normalizeNumber(getValue(rowMap, mapping, 'shares'))
      const date = asOfField ? normalizeDate(getValue(rowMap, mapping, 'positionAsOf')) : null
      if (!TICKER_RE.test(ticker) || shares == null || shares <= 0) {
        counts.unsupportedRows += 1
        warnings.push(`Row ${rowNumber} unsupported`)
        continue
      }

      const key = `${ticker}`
      if (seen.has(key)) {
        const existing = positions.find((p) => p.ticker === ticker)
        if (existing && existing.shares != null) existing.shares += shares
      } else {
        positions.push({ ticker, shares })
        seen.add(key)
      }
      counts.positions += 1
      if (date) dates.push(date)
      continue
    }

    const rawAction = getValue(rowMap, mapping, 'action')
    const date = normalizeDate(getValue(rowMap, mapping, 'date'))
    const action = classifyAction(rawAction)
    const shares = normalizeNumber(getValue(rowMap, mapping, 'shares'))
    const amount = normalizeNumber(getValue(rowMap, mapping, 'amount'))
    const rawPrice = normalizeNumber(getValue(rowMap, mapping, 'price'))
    const price = rawPrice != null && rawPrice > 0 ? rawPrice : undefined
    const rowTicker = getValue(rowMap, mapping, 'ticker').toUpperCase().trim()

    const requiresTicker = action !== 'deposit' && action !== 'withdrawal'
    if (!date || amount == null && shares == null || (requiresTicker && !TICKER_RE.test(rowTicker))) {
      counts.unsupportedRows += 1
      if (getValue(rowMap, mapping, 'ticker').trim().length > 0 || rawAction.trim().length > 0) {
        warnings.push(`Row ${rowNumber} unsupported`)
      }
      continue
    }

    const ticker = rowTicker
    switch (action) {
      case 'buy':
      case 'sell': {
        if (!shares || shares <= 0) {
          counts.unsupportedRows += 1
          warnings.push(`Row ${rowNumber} missing share quantity for trade`)
          break
        }
        trades.push({
          date,
          ticker,
          side: action,
          shares: action === 'sell' ? shares : shares,
          price,
        })
        if (action === 'buy') counts.buys += 1
        else counts.sells += 1
        dates.push(date)
        break
      }
      case 'dividend':
        if (amount == null) {
          counts.unsupportedRows += 1
          break
        }
        dividends.push({ date, ticker, amount })
        counts.dividends += 1
        dates.push(date)
        break
      case 'foreignTax':
        if (amount == null) {
          counts.unsupportedRows += 1
          break
        }
        dividends.push({ date, ticker, amount: -Math.abs(amount) })
        counts.dividends += 1
        dates.push(date)
        break
      case 'deposit':
      case 'withdrawal': {
        const signed = amount ?? 0
        if (action === 'withdrawal' && signed > 0) {
          cashFlows.push({ date, amount: -signed })
          counts.cashFlows += 1
        } else if (action === 'withdrawal' && signed < 0) {
          cashFlows.push({ date, amount: signed })
          counts.cashFlows += 1
        } else if (action === 'deposit' && signed < 0) {
          cashFlows.push({ date, amount: -signed })
          counts.cashFlows += 1
        } else {
          cashFlows.push({ date, amount: signed })
          counts.cashFlows += 1
        }
        dates.push(date)
        break
      }
      default:
        counts.unsupportedRows += 1
        warnings.push(`Row ${rowNumber} action ignored: ${rawAction || '(blank)'}`)
    }
  }

  const dateRange = dates.length > 0
    ? {
        start: dates.reduce((min, d) => (d < min ? d : min), dates[0]!),
        end: dates.reduce((max, d) => (d > max ? d : max), dates[0]!),
      }
    : null

  const blocked = kind === 'positions'
    ? positions.length === 0
    : trades.length === 0 && dividends.length === 0 && cashFlows.length === 0
  const report: ImportReport = {
    errors: errors.length ? errors : [],
    warnings,
    counts,
    blocked,
  }

  return {
    schemaVersion: 1,
    positions,
    trades,
    dividends,
    cashFlows,
    provenance: {
      brokers: ['generic'],
      fileKinds: [kind],
      importedAt: new Date().toISOString(),
      dateRange,
      counts,
    }
    ,
    report,
  }
}
