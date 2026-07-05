import { loadFundamentals } from '@/fundamentals/load'
import { defaultScenarios, type Projection } from './model'

const M = 1_000_000
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000

/**
 * Build a new projection draft for a ticker, prefilled from SEC filings when
 * we have them (company inputs, current margins, valuation-anchored exit
 * P/Es, actual dividend/buyback yields). Every field stays editable — the
 * editor itself is the manual override. Falls back to generic defaults for
 * tickers without fundamentals (ETFs, uncovered).
 */
export async function prefillProjection(
  ticker: string,
  currentPrice: number,
): Promise<{ projection: Projection; prefilledFromYear: number | null }> {
  const now = Date.now()
  const base: Projection = {
    ticker: ticker.toUpperCase(),
    inputs: { baseRevenue: 1000, netIncome: 150, sharesOut: 100, currentPrice, horizonYears: 5 },
    scenarios: defaultScenarios(),
    notes: '',
    manualPrice: false,
    createdAt: now,
    updatedAt: now,
  }

  const f = await loadFundamentals(ticker).catch(() => null)
  const years = f?.fiscalYears.filter((y) => y.revenue != null && y.netIncome != null) ?? []
  const fy = years.at(-1)
  if (!f || !fy || !fy.revenue || !fy.sharesDiluted) {
    return { projection: base, prefilledFromYear: null }
  }

  const margin = fy.netMargin ?? (fy.netIncome ?? 0) / fy.revenue
  const ttmEps = fy.epsDiluted ?? null
  const pe = currentPrice > 0 && ttmEps && ttmEps > 0 ? currentPrice / ttmEps : null

  // Dividend yield from actual cash dividends over market cap.
  const mktCap = currentPrice * fy.sharesDiluted
  const divYield =
    mktCap > 0 && fy.dividendsPaid ? clamp(fy.dividendsPaid / mktCap, 0, 0.08) : 0

  // Buyback yield: annualized share-count decline over up to 3 years.
  let buyback = 0
  const back = years.at(-4) ?? years[0]
  if (back?.sharesDiluted && back.sharesDiluted > 0 && back !== fy) {
    const yrs = fy.year - back.year
    if (yrs > 0) {
      const change = (fy.sharesDiluted / back.sharesDiluted) ** (1 / yrs) - 1
      buyback = clamp(-change, 0, 0.06) // only count net reductions
    }
  }

  // Trailing revenue CAGR (up to 5y) anchors the base growth assumption.
  const growthBack = years.at(-6) ?? years[0]
  let baseGrowth = 0.06
  if (growthBack?.revenue && growthBack.revenue > 0 && growthBack !== fy) {
    const yrs = fy.year - growthBack.year
    if (yrs > 0) baseGrowth = clamp((fy.revenue / growthBack.revenue) ** (1 / yrs) - 1, -0.05, 0.25)
  }

  // Exit P/E anchored to today's multiple (mean-reversion-flavored spread).
  const basePe = pe ? clamp(pe, 8, 40) : 18

  const m = clamp(margin, 0.01, 0.6)
  base.inputs = {
    baseRevenue: r2(fy.revenue / M),
    netIncome: r2((fy.netIncome ?? 0) / M),
    sharesOut: r2(fy.sharesDiluted / M),
    currentPrice,
    horizonYears: 5,
  }
  base.scenarios = {
    bear: {
      revenueGrowth: r3(Math.min(baseGrowth * 0.4, 0.02)),
      netMargin: r3(m * 0.85),
      exitPe: r2(basePe * 0.7),
      dividendYield: r3(divYield),
      buybackYield: r3(buyback * 0.5),
    },
    base: {
      revenueGrowth: r3(baseGrowth * 0.8), // haircut trailing growth modestly
      netMargin: r3(m),
      exitPe: r2(basePe * 0.9),
      dividendYield: r3(divYield),
      buybackYield: r3(buyback),
    },
    bull: {
      revenueGrowth: r3(baseGrowth * 1.15),
      netMargin: r3(Math.min(m * 1.15, 0.6)),
      exitPe: r2(basePe * 1.15),
      dividendYield: r3(divYield),
      buybackYield: r3(buyback),
    },
  }
  return { projection: base, prefilledFromYear: fy.year }
}
