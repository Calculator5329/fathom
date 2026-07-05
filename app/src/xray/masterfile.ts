import type { CashFlowInput, DividendInput, TradeInput } from './parse'
import type { PositionAnalysis, ReconstructionResult } from './analyze'
import type { PortfolioInsights } from './insights'

/**
 * "fathom.portfolio" v1 â€” a self-describing, versioned master file for a
 * portfolio: normalized inputs (positions, trades, dividends, cash flows)
 * plus everything derived. JSON on purpose: lossless nesting, trivially
 * parsed anywhere, diffable, and future projects can consume it without
 * this codebase. Money is USD, dates are ISO (yyyy-mm-dd), fractions are
 * decimals (0.084 = 8.4%).
 */
export interface FathomPortfolioFile {
  format: 'fathom.portfolio'
  version: 1
  generatedAt: string
  window: { start: string; end: string; months: number }
  positions: Array<{
    ticker: string
    shares: number | null
    price: number
    value: number
    weightPct: number
    ttmPe: number | null
    divYield: number | null
  }>
  openingPositions: Array<{ ticker: string; shares: number; asOf: string }>
  trades: TradeInput[]
  dividends: DividendInput[]
  cashFlows: Array<{ date: string; amount: number; kind: 'deposit' | 'withdrawal' }>
  performance: {
    startValue: number
    endValue: number
    twr: number
    irr: number
    maxDrawdown: number
    totalInvested: number
    totalWithdrawn: number
    marketGain: number
    benchmark: { ticker: string; twr: number } | null
  }
  income: PortfolioInsights['dividends']
  deposits: PortfolioInsights['deposits']
  attribution: PortfolioInsights['attribution']
  soldCounterfactual: PortfolioInsights['sold']
  buyReturns: PortfolioInsights['bought']
  behavior: PortfolioInsights['behavior']
  valueSeries: { dates: string[]; values: number[] }
  notes: string[]
}

export function buildMasterFile(opts: {
  blend: PositionAnalysis | null
  result: ReconstructionResult
  insights: PortfolioInsights
  synthetic: TradeInput[]
  realTrades: TradeInput[]
  dividends: DividendInput[]
  cashFlows: CashFlowInput[]
  notes: string[]
}): FathomPortfolioFile {
  const { blend, result, insights } = opts
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    format: 'fathom.portfolio',
    version: 1,
    generatedAt: new Date().toISOString(),
    window: insights.window,
    positions: (blend?.holdings ?? []).map((h) => ({
      ticker: h.ticker,
      shares: h.shares,
      price: h.price,
      value: r2(h.value),
      weightPct: r2(h.weight),
      ttmPe: h.ttmPe,
      divYield: h.divYield,
    })),
    openingPositions: opts.synthetic.map((t) => ({
      ticker: t.ticker,
      shares: t.shares,
      asOf: t.date,
    })),
    trades: opts.realTrades,
    dividends: opts.dividends,
    cashFlows: opts.cashFlows.map((f) => ({
      date: f.date,
      amount: Math.abs(f.amount),
      kind: f.amount >= 0 ? ('deposit' as const) : ('withdrawal' as const),
    })),
    performance: {
      startValue: r2(result.values[0]),
      endValue: r2(result.values[result.values.length - 1]),
      twr: result.twrIndex[result.twrIndex.length - 1] - 1,
      irr: result.irr,
      maxDrawdown: result.metrics.drawdown.maxDrawdown,
      totalInvested: r2(result.totalInvested),
      totalWithdrawn: r2(result.totalWithdrawn),
      marketGain: r2(insights.marketGain),
      benchmark: insights.benchmark
        ? { ticker: insights.benchmark.ticker, twr: insights.benchmark.twr }
        : null,
    },
    income: insights.dividends,
    deposits: insights.deposits,
    attribution: insights.attribution.map((a) => ({ ...a, pnl: r2(a.pnl), endValue: r2(a.endValue) })),
    soldCounterfactual: insights.sold.map((s) => ({
      ...s,
      proceeds: r2(s.proceeds),
      worthNow: r2(s.worthNow),
    })),
    buyReturns: insights.bought.map((b) => ({
      ...b,
      cost: r2(b.cost),
      worthNow: r2(b.worthNow),
    })),
    behavior: insights.behavior,
    valueSeries: { dates: result.dates, values: result.values.map(r2) },
    notes: opts.notes,
  }
}

export function downloadMasterFile(file: FathomPortfolioFile) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fathom-portfolio-${file.window.end}.json`
  a.click()
  URL.revokeObjectURL(url)
}
