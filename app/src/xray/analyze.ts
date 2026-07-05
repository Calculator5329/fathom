import type { TickerSeries } from '@/engine'
import { computeMetrics } from '@/engine'
import type { Fundamentals } from '@/fundamentals/load'
import { splitAdjustedCloses } from '@/lib/prices'
import type { PositionInput, TradeInput } from './parse'

// ---------- positions snapshot ----------------------------------------------

export interface HoldingRow {
  ticker: string
  name: string
  shares: number | null
  price: number
  value: number
  weight: number // percent of portfolio
  fromHigh52w: number // fraction, negative below high
  ttmPe: number | null
  divYield: number | null // fraction
}

export interface PositionAnalysis {
  holdings: HoldingRow[]
  totalValue: number
  /** Harmonic-weighted P/E across holdings with earnings (correct blend). */
  blendedPe: number | null
  blendedDivYield: number | null
  peCoverage: number // fraction of value with P/E available
}

/** TTM EPS with the same fallback chain the Research page uses. */
export function ttmEpsOf(f: Fundamentals | null): number | null {
  if (!f) return null
  const fy = f.fiscalYears.filter((y) => y.revenue != null).at(-1)
  const last4 = (f.quarters ?? []).slice(-4)
  if (last4.length === 4) {
    if (last4.every((q) => q.epsDiluted != null)) {
      return last4.reduce((s, q) => s + (q.epsDiluted ?? 0), 0)
    }
    if (last4.every((q) => q.netIncome != null) && fy?.sharesDiluted) {
      return last4.reduce((s, q) => s + (q.netIncome ?? 0), 0) / fy.sharesDiluted
    }
  }
  return fy?.epsDiluted ?? null
}

export function analyzePositions(
  positions: PositionInput[],
  series: Map<string, TickerSeries>,
  fundamentals: Map<string, Fundamentals | null>,
): PositionAnalysis {
  const rows: Array<Omit<HoldingRow, 'weight'>> = []

  for (const p of positions) {
    const s = series.get(p.ticker)
    if (!s || s.records.length === 0) continue
    const recs = s.records
    const price = recs[recs.length - 1].close
    const adj = splitAdjustedCloses(recs)
    const last252 = adj.slice(-252)
    const high52 = last252.reduce((m, v) => Math.max(m, v), 0)
    const f = fundamentals.get(p.ticker) ?? null
    const fy = f?.fiscalYears.filter((y) => y.revenue != null).at(-1)
    const eps = ttmEpsOf(f)
    const mktCap = fy?.sharesDiluted ? price * fy.sharesDiluted : null

    rows.push({
      ticker: p.ticker,
      name: s.name ?? p.ticker,
      shares: p.shares ?? null,
      price,
      // weight-mode rows get valued off a nominal $10k portfolio later
      value: p.shares != null ? p.shares * price : (p.weight ?? 0),
      fromHigh52w: high52 > 0 ? adj[adj.length - 1] / high52 - 1 : 0,
      ttmPe: eps && eps > 0 ? price / eps : null,
      divYield: mktCap && fy?.dividendsPaid ? fy.dividendsPaid / mktCap : null,
    })
  }

  const sharesMode = positions.some((p) => p.shares != null)
  const totalValue = sharesMode
    ? rows.reduce((s, r) => s + r.value, 0)
    : 10_000 // weights-only portfolios get a nominal base
  const holdings: HoldingRow[] = rows.map((r) => ({
    ...r,
    value: sharesMode ? r.value : (r.value / 100) * totalValue,
    weight: sharesMode
      ? (r.value / (totalValue || 1)) * 100
      : r.value, // in weight mode `value` held the raw percent
  }))
  holdings.sort((a, b) => b.weight - a.weight)

  // Harmonic blend: P/E of the basket = 1 / Σ(w × E/P) over covered holdings.
  let earningsYield = 0
  let covered = 0
  let divAccum = 0
  let divCovered = 0
  for (const h of holdings) {
    const w = h.weight / 100
    if (h.ttmPe && h.ttmPe > 0) {
      earningsYield += w * (1 / h.ttmPe)
      covered += w
    }
    if (h.divYield != null) {
      divAccum += w * h.divYield
      divCovered += w
    }
  }
  return {
    holdings,
    totalValue,
    blendedPe: covered > 0.2 ? covered / earningsYield : null, // renormalized over coverage
    blendedDivYield: divCovered > 0.2 ? divAccum / divCovered : null,
    peCoverage: covered,
  }
}

// ---------- activity-history reconstruction ----------------------------------

export interface ReconstructionResult {
  dates: string[]
  values: number[]
  twrIndex: number[]
  flows: number[]
  /** Money-weighted annual return. */
  irr: number
  totalInvested: number
  totalWithdrawn: number
  metrics: ReturnType<typeof computeMetrics>
  /** Current positions implied by the trade history (split-adjusted shares). */
  endPositions: Array<{ ticker: string; shares: number }>
  warnings: string[]
}

/**
 * Infer opening holdings from a current-positions snapshot plus the trade
 * window: opening (end basis) = current shares − net traded shares, with
 * each trade converted to the end basis via the splits after its date.
 * Returned as synthetic buys dated at the first trade date (in THAT date's
 * share basis) so reconstructHistory treats them as day-one capital — this
 * is what lets a Fidelity positions file + activity file merge into a
 * whole-portfolio history instead of just the traded slice.
 */
export function inferOpeningPositions(
  positions: Array<{ ticker: string; shares: number }>,
  trades: TradeInput[],
  series: Map<string, TickerSeries>,
): { synthetic: TradeInput[]; warnings: string[] } {
  const warnings: string[] = []
  const synthetic: TradeInput[] = []
  if (trades.length === 0) return { synthetic, warnings }
  const startDate = trades.reduce((m, t) => (t.date < m ? t.date : m), trades[0].date)

  const posByTicker = new Map(positions.map((p) => [p.ticker, p.shares]))
  const tickers = new Set([...posByTicker.keys(), ...trades.map((t) => t.ticker)])

  for (const ticker of tickers) {
    const s = series.get(ticker)
    if (!s) {
      if (posByTicker.has(ticker)) {
        warnings.push(`${ticker}: no price data — excluded from opening holdings`)
      }
      continue
    }
    const splitAfter = (date: string) => {
      let f = 1
      for (const r of s.records) {
        if (r.date > date && r.splitFactor && r.splitFactor !== 1) f *= r.splitFactor
      }
      return f
    }
    let netEnd = 0
    for (const t of trades) {
      if (t.ticker !== ticker) continue
      netEnd += (t.side === 'buy' ? t.shares : -t.shares) * splitAfter(t.date)
    }
    let openingEnd = (posByTicker.get(ticker) ?? 0) - netEnd
    if (openingEnd < -1e-6) {
      warnings.push(
        `${ticker}: trades sell more than the positions file explains — opening clamped to 0`,
      )
    }
    openingEnd = Math.max(0, openingEnd)
    const openingStart = openingEnd / splitAfter(startDate)
    if (openingStart > 1e-9) {
      synthetic.push({ date: startDate, ticker, side: 'buy', shares: openingStart })
    }
  }
  return { synthetic, warnings }
}

/**
 * Rebuild the actual portfolio history from a trade log.
 *
 * Split handling: a trade's share count is in the share basis OF ITS DATE.
 * Each ticker keeps a running share count that is multiplied by splitFactor
 * whenever a split occurs on a later date, so shares and that day's close
 * always share a basis. Trades execute at their CSV price when given, else
 * that day's close; buys are external inflows, sells external outflows
 * (proceeds leave the portfolio).
 */
export function reconstructHistory(
  trades: TradeInput[],
  series: Map<string, TickerSeries>,
): ReconstructionResult {
  const warnings: string[] = []
  const usable = trades.filter((t) => {
    if (series.has(t.ticker)) return true
    warnings.push(`${t.ticker}: no price data — its trades were skipped`)
    return false
  })
  if (usable.length === 0) throw new Error('No trades with available price data.')

  const start = usable[0].date
  // Shared calendar: union of trading days across involved tickers from first trade.
  const daySet = new Set<string>()
  for (const t of new Set(usable.map((x) => x.ticker))) {
    for (const r of series.get(t)!.records) if (r.date >= start) daySet.add(r.date)
  }
  const dates = [...daySet].sort()
  if (dates.length < 2) throw new Error('Not enough trading days after the first trade.')

  // Per-ticker: record index walker, running shares, last-known close.
  interface Book {
    recs: TickerSeries['records']
    i: number
    shares: number
    lastClose: number
  }
  const books = new Map<string, Book>()
  for (const t of new Set(usable.map((x) => x.ticker))) {
    const recs = series.get(t)!.records
    books.set(t, { recs, i: 0, shares: 0, lastClose: 0 })
  }
  const tradesByDate = new Map<string, TradeInput[]>()
  for (const t of usable) {
    const arr = tradesByDate.get(t.date) ?? []
    arr.push(t)
    tradesByDate.set(t.date, arr)
  }
  // Trades dated on non-trading days roll forward to the next trading day.
  const pending: TradeInput[] = []
  let pendingWarned = false

  const values: number[] = []
  const flows: number[] = []
  const twrIndex: number[] = []
  let totalInvested = 0
  let totalWithdrawn = 0

  for (let d = 0; d < dates.length; d++) {
    const date = dates[d]

    // 1) advance each book to `date`: apply splits and refresh closes.
    for (const book of books.values()) {
      while (book.i < book.recs.length && book.recs[book.i].date <= date) {
        const rec = book.recs[book.i]
        if (rec.splitFactor && rec.splitFactor !== 1) book.shares *= rec.splitFactor
        book.lastClose = rec.close
        book.i++
      }
    }

    // 2) execute trades for this date (plus any rolled-forward ones).
    const todays = [...pending.splice(0), ...(tradesByDate.get(date) ?? [])]
    // also roll forward any trade dated between previous date and this one
    if (d > 0) {
      for (const [td, list] of tradesByDate) {
        if (td > dates[d - 1] && td < date) {
          todays.push(...list)
          tradesByDate.delete(td)
          if (!pendingWarned) {
            warnings.push('Some trades were dated on non-trading days; executed next session.')
            pendingWarned = true
          }
        }
      }
    }
    let flow = 0
    for (const tr of todays) {
      const book = books.get(tr.ticker)!
      const px = tr.price ?? book.lastClose
      if (px <= 0) {
        warnings.push(`${tr.ticker} ${tr.date}: no price available; trade skipped`)
        continue
      }
      if (tr.side === 'buy') {
        book.shares += tr.shares
        flow += tr.shares * px
        totalInvested += tr.shares * px
      } else {
        const sell = Math.min(tr.shares, book.shares)
        if (sell < tr.shares) {
          warnings.push(`${tr.ticker} ${tr.date}: sold more than held; clamped`)
        }
        book.shares -= sell
        flow -= sell * px
        totalWithdrawn += sell * px
      }
    }

    // 3) mark to market.
    let value = 0
    for (const book of books.values()) value += book.shares * book.lastClose
    values.push(value)
    flows.push(flow)
    if (d === 0) {
      twrIndex.push(1)
    } else {
      const base = values[d - 1] + flow
      twrIndex.push(base > 0 ? twrIndex[d - 1] * (value / base) : twrIndex[d - 1])
    }
  }

  // Trim leading days before the first position existed (value 0, no flow).
  let firstLive = values.findIndex((v, i) => v > 0 || flows[i] !== 0)
  if (firstLive < 0) firstLive = 0
  const D = dates.slice(firstLive)
  const V = values.slice(firstLive)
  const F = flows.slice(firstLive)
  const T = twrIndex.slice(firstLive).map((x) => x / twrIndex[firstLive])

  const metrics = computeMetrics(D, T, V, F, 0)
  // IRR: initial flow is F[0] (first buy), engine's irr treats values[0] as the initial outlay.
  const endPositions = [...books.entries()]
    .filter(([, b]) => b.shares > 1e-9)
    .map(([ticker, b]) => ({ ticker, shares: Math.round(b.shares * 10000) / 10000 }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker))

  return {
    dates: D,
    values: V,
    twrIndex: T,
    flows: F,
    irr: metrics.irr,
    totalInvested,
    totalWithdrawn,
    metrics,
    endPositions,
    warnings,
  }
}
