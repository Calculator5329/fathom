import type { DailyRecord, TickerSeries } from './types'

/**
 * Per-ticker daily return components on a shared calendar.
 * All arrays have length = dates.length; index 0 is the buy-in day
 * (returns there are identity: 1, 1, 0).
 */
export interface PreparedAsset {
  ticker: string
  /** totalReturn[t] = adjClose[t] / adjClose[t-1] — dividends reinvested. */
  totalReturn: number[]
  /** priceReturn[t] = close[t] * splitFactor[t] / close[t-1] — splits neutralized, dividends dropped. */
  priceReturn: number[]
  /** divYield[t] = divCash[t] * (shares growth to t-1) / close[t-1] — cash dividend as fraction of prior value. */
  divYield: number[]
}

export interface AlignedData {
  dates: string[]
  assets: Map<string, PreparedAsset>
}

/**
 * Build the shared calendar (intersection of trading days across all series,
 * clamped to [start, end]) and per-ticker return components on it.
 *
 * Intersection can skip days a ticker traded (e.g. one fund had a holiday).
 * Returns are computed from each ticker's own consecutive records BETWEEN
 * calendar days, so a skipped day's move is never lost — it compounds into
 * the next shared day.
 */
export function alignSeries(
  seriesList: TickerSeries[],
  start?: string,
  end?: string,
): AlignedData {
  if (seriesList.length === 0) throw new Error('No ticker series provided')

  // Effective range: caller's range clamped to common history.
  let lo = start ?? '0000-00-00'
  let hi = end ?? '9999-99-99'
  for (const s of seriesList) {
    if (s.records.length === 0) throw new Error(`Empty series for ${s.ticker}`)
    const first = s.records[0].date
    const last = s.records[s.records.length - 1].date
    if (first > lo) lo = first
    if (last < hi) hi = last
  }
  if (lo > hi) throw new Error(`No overlapping history in range ${lo}..${hi}`)

  // Intersection of trading days within [lo, hi].
  const counts = new Map<string, number>()
  for (const s of seriesList) {
    for (const r of s.records) {
      if (r.date >= lo && r.date <= hi) {
        counts.set(r.date, (counts.get(r.date) ?? 0) + 1)
      }
    }
  }
  const dates = [...counts.entries()]
    .filter(([, n]) => n === seriesList.length)
    .map(([d]) => d)
    .sort()
  if (dates.length < 2) throw new Error(`Fewer than 2 shared trading days in ${lo}..${hi}`)

  const assets = new Map<string, PreparedAsset>()
  for (const s of seriesList) {
    assets.set(s.ticker, prepareAsset(s, dates))
  }
  return { dates, assets }
}

function prepareAsset(series: TickerSeries, dates: string[]): PreparedAsset {
  const byDate = new Map<string, number>()
  series.records.forEach((r, i) => byDate.set(r.date, i))

  const totalReturn: number[] = [1]
  const priceReturn: number[] = [1]
  const divYield: number[] = [0]

  for (let t = 1; t < dates.length; t++) {
    const from = byDate.get(dates[t - 1])
    const to = byDate.get(dates[t])
    if (from === undefined || to === undefined) {
      throw new Error(`${series.ticker} missing shared date ${dates[t - 1]} or ${dates[t]}`)
    }
    // Compound this ticker's own daily records across (from, to].
    let tr = 1
    let pr = 1
    let dy = 0
    for (let i = from + 1; i <= to; i++) {
      const prev = series.records[i - 1]
      const cur = series.records[i]
      tr *= cur.adjClose / prev.adjClose
      // A splitFactor of k means 1 share became k shares; neutralize the price drop.
      const dayPr = (cur.close * cur.splitFactor) / prev.close
      // Dividend cash per unit of value held at `prev` close. Scale by shares
      // accumulated through intermediate splits within this window (pr so far).
      dy += (pr * (cur.divCash * cur.splitFactor)) / prev.close
      pr *= dayPr
    }
    totalReturn.push(tr)
    priceReturn.push(pr)
    divYield.push(dy)
  }

  return { ticker: series.ticker, totalReturn, priceReturn, divYield }
}

/** True when `date` starts a new period vs `prevDate` for the given frequency. */
export function isPeriodStart(
  prevDate: string,
  date: string,
  freq: 'annual' | 'quarterly' | 'monthly',
): boolean {
  const py = Number(prevDate.slice(0, 4))
  const pm = Number(prevDate.slice(5, 7))
  const cy = Number(date.slice(0, 4))
  const cm = Number(date.slice(5, 7))
  if (freq === 'annual') return cy !== py
  if (freq === 'monthly') return cy !== py || cm !== pm
  return cy !== py || Math.floor((cm - 1) / 3) !== Math.floor((pm - 1) / 3)
}

export function isNewMonth(prevDate: string, date: string): boolean {
  return prevDate.slice(0, 7) !== date.slice(0, 7)
}

export type { DailyRecord }
