import type { BrokerPreset, ImportFileKind } from '../types'
import { guessColumn } from '../mapping'

const TICKER_HEADERS = ['symbol', 'ticker']
const SHARE_HEADERS = ['quantity', 'shares']
const ACTION_HEADERS = ['action']
const PRICE_HEADERS = ['price ($)', 'price', 'execution price', 'price per share']
const AMOUNT_HEADERS = ['amount ($)', 'amount', 'net amount', 'cash balance ($)']
const DATE_HEADERS = ['run date', 'trade date', 'settlement date', 'run date']

const toLower = (s: string) => s.toLowerCase().trim()
const fidelityActionValues: Record<string, 'buy' | 'sell' | 'dividend' | 'foreignTax' | 'deposit' | 'withdrawal' | 'ignore'> = {
  'you bought': 'buy',
  'you sold': 'sell',
  'dividend received': 'dividend',
  'foreign tax paid': 'foreignTax',
  'electronic funds transfer received (cash)': 'deposit',
  'direct deposit': 'deposit',
  'electronic funds transfer paid (cash)': 'withdrawal',
}

const SCORE_HEADERS = [
  'account number',
  'account name',
]

export const fidelityPreset: BrokerPreset = {
  id: 'fidelity',
  score(headers) {
    const lower = headers.map(toLower)
    let score = 0
    if (lower.some((h) => SCORE_HEADERS.includes(h))) score += 45
    if (lower.some((h) => h === 'symbol')) score += 25
    if (lower.some((h) => ['run date', 'trade date', 'settlement date', 'type'].includes(h))) score += 20
    if (lower.some((h) => ['amount ($)', 'amount', 'quantity', 'price ($)'].includes(h))) score += 10
    return score
  },
  suggest(kind: ImportFileKind, headers) {
    if (kind === 'positions') {
      const symbol = guessColumn(headers, TICKER_HEADERS)
      const qty = guessColumn(headers, SHARE_HEADERS)
      if (!symbol || !qty) return null
      return {
        kind,
        columns: {
          ticker: symbol,
          shares: qty,
        },
        actionValues: {},
        decimalConvention: 'us',
      }
    }

    if (kind === 'activity') {
      const date = guessColumn(headers, DATE_HEADERS)
      const symbol = guessColumn(headers, TICKER_HEADERS)
      const shares = guessColumn(headers, SHARE_HEADERS)
      const action = guessColumn(headers, ACTION_HEADERS)
      if (!date || !symbol || !action || !shares) return null
      return {
        kind,
        columns: {
          date,
          ticker: symbol,
          action,
          shares,
          price: guessColumn(headers, PRICE_HEADERS),
          amount: guessColumn(headers, AMOUNT_HEADERS),
        },
        actionValues: fidelityActionValues,
        decimalConvention: 'us',
      }
    }

    return null
  },
  classifyAction(raw) {
    const value = toLower(raw)
    if (/you bought|reinvest/i.test(value)) return 'buy'
    if (/you sold/i.test(value)) return 'sell'
    if (/dividend/i.test(value)) return 'dividend'
    if (/foreign tax/i.test(value)) return 'foreignTax'
    if (/electronic funds transfer paid|withdraw|eft paid/i.test(value)) return 'withdrawal'
    if (/electronic funds transfer received|direct deposit/i.test(value)) return 'deposit'
    return 'ignore'
  },
  ignoreRow(raw) {
    const joined = raw.join(' ').toLowerCase()
    if (joined.includes('pending activity')) return 'pending activity row'
    if (joined.includes('money market') || joined.includes('sweep')) return 'money-market row'
    if (joined.includes('disclaimer')) return 'disclaimer/footer row'
    return null
  },
}
