import { decodeWeightList, encodeWeightList, numParam } from '@/lib/urlCodec'

/**
 * URL is canonical state (invariant 3) so any income plan is shareable by link
 * with no login:
 *
 *   /income?p=SCHD:40,VYM:35,JEPI:25&amt=100000
 *
 * `p` is a weight list (percent of the portfolio per ticker); `amt` is the
 * total position value in dollars. Position value = weight% × amt.
 */
export interface IncomeSetup {
  /** Ticker → percent-of-portfolio weight. Zero weights survive edits. */
  holdings: { ticker: string; weight: number }[]
  /** Total portfolio market value today, in dollars. */
  totalValue: number
}

export const DEFAULT_TOTAL_VALUE = 100_000

export function encodeIncome(setup: IncomeSetup): URLSearchParams {
  const params = new URLSearchParams()
  const spec = encodeWeightList(setup.holdings.map((h) => ({ key: h.ticker, weight: h.weight })))
  if (spec) params.set('p', spec)
  if (setup.totalValue !== DEFAULT_TOTAL_VALUE) params.set('amt', String(setup.totalValue))
  return params
}

export function decodeIncome(params: URLSearchParams): IncomeSetup {
  const raw = params.get('p')
  const holdings = raw
    ? decodeWeightList(raw, { uppercase: true }).map((e) => ({ ticker: e.key, weight: e.weight }))
    : []
  return {
    holdings,
    totalValue: numParam(params.get('amt'), DEFAULT_TOTAL_VALUE, { positive: true }),
  }
}
