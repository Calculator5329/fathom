import { describe, expect, it } from 'vitest'
import type { DailyRecord } from '@/engine'
import { planHolding, planIncome, trailingDividends, type Holding } from '../planner'

/** Minimal daily record; adjClose is unused by the planner but part of the type. */
function rec(
  date: string,
  close: number,
  opts: { divCash?: number; splitFactor?: number } = {},
): DailyRecord {
  return {
    date,
    close,
    adjClose: close,
    divCash: opts.divCash ?? 0,
    splitFactor: opts.splitFactor ?? 1,
  }
}

describe('trailingDividends', () => {
  it('keeps the last 12 months and drops anything older than the cutoff', () => {
    const records = [
      rec('2023-12-15', 100, { divCash: 0.5 }), // older than cutoff → excluded
      rec('2024-03-15', 100, { divCash: 0.5 }),
      rec('2024-06-15', 100, { divCash: 0.5 }),
      rec('2024-09-15', 100, { divCash: 0.5 }),
      rec('2024-12-15', 100, { divCash: 0.5 }),
      rec('2025-01-15', 100),
    ]
    const payments = trailingDividends(records)
    // Cutoff = 2024-01-15, so the 2023-12-15 payment is excluded.
    expect(payments.map((p) => p.date)).toEqual([
      '2024-03-15',
      '2024-06-15',
      '2024-09-15',
      '2024-12-15',
    ])
    expect(payments.map((p) => p.perShare)).toEqual([0.5, 0.5, 0.5, 0.5])
    expect(payments.map((p) => p.month)).toEqual([2, 5, 8, 11]) // Mar, Jun, Sep, Dec
  })

  it('split-adjusts a pre-split dividend onto today’s share basis', () => {
    // $1.00 paid, then a 2:1 split, then $0.60 paid post-split.
    const records = [
      rec('2024-04-15', 100, { divCash: 1.0 }),
      rec('2024-08-01', 50, { splitFactor: 2 }), // 2:1 split takes effect
      rec('2024-10-15', 50, { divCash: 0.6 }),
      rec('2025-01-10', 50),
    ]
    const payments = trailingDividends(records)
    // Pre-split $1.00 becomes $0.50 per today's (post-split) share; the
    // post-split $0.60 is unchanged.
    expect(payments.map((p) => p.perShare)).toEqual([0.5, 0.6])
  })
})

describe('planHolding — hand-computed forward yield', () => {
  // KO-like: $0.50/quarter, price $100, $50,000 position → 500 shares.
  const records = [
    rec('2023-12-15', 100, { divCash: 0.5 }), // before cutoff, must not count
    rec('2024-03-15', 100, { divCash: 0.5 }),
    rec('2024-06-15', 100, { divCash: 0.5 }),
    rec('2024-09-15', 100, { divCash: 0.5 }),
    rec('2024-12-15', 100, { divCash: 0.5 }),
    rec('2025-01-15', 100),
  ]
  const holding: Holding = { ticker: 'KO', value: 50_000, records }
  const income = planHolding(holding)

  it('sums TTM dividends into a $2.00 annual rate', () => {
    expect(income.annualDividendPerShare).toBe(2.0)
  })

  it('forward yield = $2.00 / $100 = 2%', () => {
    expect(income.forwardYield).toBeCloseTo(0.02, 10)
  })

  it('shares = $50,000 / $100 = 500', () => {
    expect(income.shares).toBe(500)
  })

  it('annual income = yield × value = $1,000', () => {
    expect(income.annualIncome).toBeCloseTo(1_000, 6)
    // Equivalent identity: forwardYield × value.
    expect(income.annualIncome).toBeCloseTo(income.forwardYield * income.value, 6)
  })

  it('monthly calendar puts $250 in Mar/Jun/Sep/Dec and sums to the annual total', () => {
    expect(income.monthly).toEqual([0, 0, 250, 0, 0, 250, 0, 0, 250, 0, 0, 250])
    const monthlySum = income.monthly.reduce((s, v) => s + v, 0)
    expect(monthlySum).toBeCloseTo(income.annualIncome, 6)
  })
})

describe('planHolding — no dividends', () => {
  it('reports zero income for a non-payer', () => {
    const records = [rec('2024-01-02', 200), rec('2025-01-02', 250)]
    const income = planHolding({ ticker: 'NVDA', value: 25_000, records })
    expect(income.hasDividends).toBe(false)
    expect(income.forwardYield).toBe(0)
    expect(income.annualIncome).toBe(0)
    expect(income.shares).toBe(100)
  })
})

describe('planIncome — portfolio aggregation', () => {
  const quarterlyPayer: Holding = {
    ticker: 'KO',
    value: 50_000,
    records: [
      rec('2024-03-15', 100, { divCash: 0.5 }),
      rec('2024-06-15', 100, { divCash: 0.5 }),
      rec('2024-09-15', 100, { divCash: 0.5 }),
      rec('2024-12-15', 100, { divCash: 0.5 }),
      rec('2025-01-15', 100),
    ],
  }
  const monthlyPayer: Holding = {
    // $0.10 every month, price $50, $30,000 → 600 shares → $0.10 × 12 = $1.20/yr.
    ticker: 'JEPI',
    value: 30_000,
    records: [
      rec('2024-02-01', 50, { divCash: 0.1 }),
      rec('2024-03-01', 50, { divCash: 0.1 }),
      rec('2024-04-01', 50, { divCash: 0.1 }),
      rec('2024-05-01', 50, { divCash: 0.1 }),
      rec('2024-06-01', 50, { divCash: 0.1 }),
      rec('2024-07-01', 50, { divCash: 0.1 }),
      rec('2024-08-01', 50, { divCash: 0.1 }),
      rec('2024-09-01', 50, { divCash: 0.1 }),
      rec('2024-10-01', 50, { divCash: 0.1 }),
      rec('2024-11-01', 50, { divCash: 0.1 }),
      rec('2024-12-01', 50, { divCash: 0.1 }),
      rec('2025-01-01', 50, { divCash: 0.1 }),
    ],
  }
  const plan = planIncome([quarterlyPayer, monthlyPayer])

  it('totals value and income across holdings', () => {
    expect(plan.totalValue).toBe(80_000)
    // KO: 500 sh × $2.00 = $1,000. JEPI: 600 sh × $1.20 = $720.
    expect(plan.annualIncome).toBeCloseTo(1_720, 6)
  })

  it('portfolio yield = $1,720 / $80,000 = 2.15%', () => {
    expect(plan.portfolioYield).toBeCloseTo(0.0215, 10)
  })

  it('the monthly calendar sums exactly to the annual total', () => {
    const monthlySum = plan.monthly.reduce((s, v) => s + v, 0)
    expect(monthlySum).toBeCloseTo(plan.annualIncome, 6)
  })

  it('per-holding monthly calendars each sum to their own annual income', () => {
    for (const h of plan.holdings) {
      const sum = h.monthly.reduce((s, v) => s + v, 0)
      expect(sum).toBeCloseTo(h.annualIncome, 6)
    }
  })
})
