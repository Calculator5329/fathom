import type { ActionKind, ColumnMapping } from './types'

const FIELD_ALIASES: Record<string, string[]> = {
  date: [
    'date',
    'run date',
    'trade date',
    'tradedate',
    'transaction date',
    'activity date',
    'settlement date',
    'as of date',
    'asofdate',
    'as of',
  ],
  ticker: ['ticker', 'symbol', 'instrument', 'security', 'description'],
  action: ['action', 'side', 'type', 'transaction type', 'transaction', 'activity'],
  shares: ['shares', 'quantity', 'qty', 'units'],
  price: ['price', 'price per share', 'share price', 'execution price', 'unit price'],
  amount: ['amount', 'amount ($)', 'net amount', 'cash amount', 'total amount'],
  positionAsOf: ['position as of', 'as of', 'asof'],
}

function normalizeHeaderCell(cell: string): string {
  return cell.toLowerCase().replace(/[\s_]+/g, ' ').trim()
}

export function guessColumn(headers: string[], aliases: string[]): string {
  const normalized = headers.map(normalizeHeaderCell)
  for (const alias of aliases) {
    const i = normalized.findIndex((h) => h === alias)
    if (i >= 0) return headers[i]!
  }
  for (const alias of aliases) {
    const i = normalized.findIndex((h) => h.includes(alias))
    if (i >= 0) return headers[i]!
  }
  return ''
}

export function buildPositionMapper(headers: string[]): ColumnMapping {
  return {
    kind: 'positions',
    columns: {
      ticker: guessColumn(headers, FIELD_ALIASES.ticker),
      shares: guessColumn(headers, FIELD_ALIASES.shares),
      positionAsOf: guessColumn(headers, FIELD_ALIASES.positionAsOf),
    },
    actionValues: {},
    decimalConvention: 'us',
  }
}

export function buildActivityMapper(headers: string[]): ColumnMapping {
  return {
    kind: 'activity',
    columns: {
      date: guessColumn(headers, FIELD_ALIASES.date),
      ticker: guessColumn(headers, FIELD_ALIASES.ticker),
      action: guessColumn(headers, FIELD_ALIASES.action),
      shares: guessColumn(headers, FIELD_ALIASES.shares),
      price: guessColumn(headers, FIELD_ALIASES.price),
      amount: guessColumn(headers, FIELD_ALIASES.amount),
    },
    actionValues: {
      'buy': 'buy',
      'sell': 'sell',
      'dividend': 'dividend',
      'dividend received': 'dividend',
      'foreign tax': 'foreignTax',
      'foreign tax paid': 'foreignTax',
      'deposit': 'deposit',
      'withdrawal': 'withdrawal',
      'ach in': 'deposit',
      'ach out': 'withdrawal',
      'cash transfer in': 'deposit',
      'cash transfer out': 'withdrawal',
    },
    decimalConvention: 'us',
  }
}

function classifyActionText(raw: string): ActionKind {
  const s = raw.toLowerCase()
  if (/(you )?bought|purchase|reinvest|buy/i.test(s)) return 'buy'
  if (/(you )?sold|sell|sale/i.test(s)) return 'sell'
  if (/dividend/i.test(s)) return 'dividend'
  if (/foreign tax/i.test(s)) return 'foreignTax'
  if (/electronic funds transfer paid|withdraw|fee paid|payment out|ach out|debit/i.test(s)) return 'withdrawal'
  if (/electronic funds transfer received|direct deposit|wire|ach|deposit|eft/i.test(s)) return 'deposit'
  return 'ignore'
}

function normalizeActionLookup(actionValues: Record<string, ActionKind>): (raw: string) => ActionKind {
  const lookup = new Map<string, ActionKind>()
  for (const [raw, action] of Object.entries(actionValues)) {
    lookup.set(raw.toLowerCase(), action)
  }
  return (raw: string) => {
    const key = raw.trim().toLowerCase()
    if (key && lookup.has(key)) return lookup.get(key)!
    return classifyActionText(raw)
  }
}

export function buildActionClassifier(mapping: ColumnMapping): (raw: string) => ActionKind {
  return normalizeActionLookup(mapping.actionValues)
}
