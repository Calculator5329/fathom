import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DailyRecord } from '@/engine'
import { resolveShares, valuationSeries } from '../charts'
import type { FiscalYear, Fundamentals } from '../load'

// AMZN-shaped fixture: 20:1 split mid-2022. EDGAR restates FY2020/21 share
// counts to the post-split basis (they come from later filings' comparatives)
// while FY2019 stays era-basis — the exact mix that made the live P/OCF chart
// spike to ~700×.
const rec = (date: string, close: number, splitFactor = 1): DailyRecord => ({
  date,
  close,
  adjClose: close,
  divCash: 0,
  splitFactor,
})

const records: DailyRecord[] = [
  rec('2019-12-31', 1848),
  rec('2020-12-31', 3257),
  rec('2021-12-31', 3334),
  rec('2022-06-06', 124, 20),
  rec('2022-12-30', 84),
  rec('2023-12-29', 152),
]

const fy = (year: number, sharesDiluted: number, netIncome: number, operatingCashFlow: number): FiscalYear => ({
  year,
  revenue: null,
  netIncome,
  grossProfit: null,
  operatingIncome: null,
  epsDiluted: null,
  sharesDiluted,
  operatingCashFlow,
  fcf: null,
  dividendsPaid: null,
  totalDebt: null,
  totalAssets: null,
  totalLiabilities: null,
  stockholdersEquity: null,
  cashAndEquivalents: null,
  currentAssets: null,
  currentLiabilities: null,
  longTermDebt: null,
  inventory: null,
  grossMargin: null,
  operatingMargin: null,
  netMargin: null,
})

const years: FiscalYear[] = [
  fy(2019, 500e6, 11.6e9, 38.5e9), //   as-reported, pre-split era
  fy(2020, 10.2e9, 21.3e9, 66.1e9), //  RESTATED post-split
  fy(2021, 10.3e9, 33.4e9, 46.3e9), //  RESTATED post-split
  fy(2022, 10.2e9, -2.7e9, 46.8e9), //  as-reported, post-split
  fy(2023, 10.4e9, 30.4e9, 84.9e9), //  as-reported, post-split
]

describe('resolveShares', () => {
  it('detects restated vs era-basis counts across a 20:1 split', () => {
    const shares = resolveShares(records, years)
    expect(shares.get(2023)).toBe(10.4e9)
    expect(shares.get(2022)).toBe(10.2e9)
    // Restated counts kept as-is (NOT multiplied by 20 again).
    expect(shares.get(2021)).toBe(10.3e9)
    expect(shares.get(2020)).toBe(10.2e9)
    // Era-basis count scaled up to the current basis.
    expect(shares.get(2019)).toBe(500e6 * 20)
  })
})

describe('resolveShares edge cases', () => {
  it('handles restatement in an INTERMEDIATE basis across two splits (NVDA-style)', () => {
    // 4:1 in mid-2021, 10:1 in mid-2024. FY2020's count was restated for the
    // 4:1 by a 2022 filing but predates the 10:1 → needs ×10, not ×40 or ×1.
    const recs = [
      rec('2020-12-31', 522),
      rec('2021-07-20', 187, 4),
      rec('2021-12-31', 294),
      rec('2022-12-30', 146),
      rec('2023-12-29', 495),
      rec('2024-06-10', 121, 10),
      rec('2024-12-31', 134),
    ]
    const ys = [
      fy(2020, 2.472e9, 2.796e9, 4.7e9), // restated 4:1 basis (intermediate)
      fy(2021, 2.51e9, 4.33e9, 9e9), //    restated 4:1 basis (intermediate)
      fy(2022, 2.535e9, 9.75e9, 11e9), //  as-reported post-4:1
      fy(2023, 25.07e9, 4.37e9, 5.6e9), // restated 10:1 basis
      fy(2024, 24.94e9, 29.8e9, 28e9), //  as-reported post-10:1
    ]
    const shares = resolveShares(recs, ys)
    expect(shares.get(2024)).toBe(24.94e9)
    expect(shares.get(2023)).toBe(25.07e9)
    expect(shares.get(2022)).toBeCloseTo(25.35e9, -7) // ×10
    expect(shares.get(2021)).toBeCloseTo(25.1e9, -7) //  ×10 (intermediate)
    expect(shares.get(2020)).toBeCloseTo(24.72e9, -7) // ×10, NOT ×40
  })

  it('repairs magnitude errors via netIncome/eps (MCD "752" in millions)', () => {
    const recs = [rec('2023-12-29', 296), rec('2024-12-31', 290)]
    const ys = [
      { ...fy(2023, 732, 8.469e9, 9e9), epsDiluted: 11.56 },
      { ...fy(2024, 722, 8.223e9, 9.4e9), epsDiluted: 11.39 },
    ]
    const shares = resolveShares(recs, ys)
    expect(shares.get(2024)).toBe(722e6)
    expect(shares.get(2023)).toBe(732e6)
  })

  it('synthesizes shares from netIncome/eps when the count is missing (GOOGL-style)', () => {
    const recs = [rec('2020-12-31', 1752), rec('2022-07-18', 90, 20), rec('2022-12-30', 88)]
    const ys = [
      { ...fy(2020, 0, 40.3e9, 65e9), sharesDiluted: null, epsDiluted: 2.93 }, // restated eps
      { ...fy(2022, 0, 60e9, 91e9), sharesDiluted: null, epsDiluted: 4.56 },
    ]
    const shares = resolveShares(recs, ys)
    expect(shares.get(2022)).toBeCloseTo(60e9 / 4.56, -6)
    // 2020 implied count is in the restated basis → kept, not ×20 again.
    expect(shares.get(2020)).toBeCloseTo(40.3e9 / 2.93, -6)
  })
})

describe('valuationSeries', () => {
  it('P/OCF stays in a sane band through the split (no 20x spike)', () => {
    const data = valuationSeries(records, years, 'pocf')
    const byYear = new Map(data)
    // FY2021: (3334/20) × 10.3B / 46.3B ≈ 37.1× — not ~740×.
    expect(byYear.get('2021')).toBeCloseTo(37.1, 0)
    for (const [, v] of data) {
      expect(v).not.toBeNull()
      expect(v!).toBeGreaterThan(10)
      expect(v!).toBeLessThan(60)
    }
  })

  it('P/E uses mktCap/netIncome in the same basis (negative years stay negative)', () => {
    const data = new Map(valuationSeries(records, years, 'pe'))
    // FY2019: (1848/20) × 10B / 11.6B ≈ 79.7×
    expect(data.get('2019')).toBeCloseTo(79.7, 0)
    expect(data.get('2022')).toBeLessThan(0)
  })
})

// ---- real-data regression: the live AMZN files that showed the 700x spike --
const PUB = path.resolve(import.meta.dirname, '../../../public/data')
const hasAmzn =
  existsSync(path.join(PUB, 'fundamentals/AMZN.json')) &&
  existsSync(path.join(PUB, 'tickers/AMZN.json'))

describe.skipIf(!hasAmzn)('valuationSeries on real AMZN data', () => {
  it('P/OCF and P/S stay in sane bands through the 2022 20:1 split', () => {
    const fund = JSON.parse(
      readFileSync(path.join(PUB, 'fundamentals/AMZN.json'), 'utf8'),
    ) as Fundamentals
    const series = JSON.parse(readFileSync(path.join(PUB, 'tickers/AMZN.json'), 'utf8')) as {
      records: DailyRecord[]
    }
    const pocf = valuationSeries(series.records, fund.fiscalYears, 'pocf')
      .map(([, v]) => v)
      .filter((v): v is number => v != null)
    expect(pocf.length).toBeGreaterThan(10)
    for (const v of pocf) {
      expect(v).toBeGreaterThan(3)
      expect(v).toBeLessThan(120) // was ~740x at the spike pre-fix
    }
    const ps = valuationSeries(series.records, fund.fiscalYears, 'ps')
      .map(([, v]) => v)
      .filter((v): v is number => v != null)
    for (const v of ps) {
      expect(v).toBeGreaterThan(0.3)
      expect(v).toBeLessThan(10)
    }
  })
})
