import { describe, expect, it, vi } from 'vitest'
import type { Fundamentals } from '@/fundamentals/load'

// Mock the fundamentals loader before importing the module under test.
const fakeFundamentals: Fundamentals = {
  ticker: 'TEST',
  cik: '1',
  name: 'Test Co',
  source: 'test',
  fetchedAt: '',
  quarters: [],
  fiscalYears: [
    // 5 years: revenue 100B -> 146.41B (10%/yr), shares shrinking 2%/yr.
    ...[0, 1, 2, 3, 4].map((i) => ({
      year: 2021 + i,
      revenue: 100e9 * 1.1 ** i,
      netIncome: 20e9 * 1.1 ** i,
      grossProfit: null,
      operatingIncome: null,
      epsDiluted: (20e9 * 1.1 ** i) / (1000e6 * 0.98 ** i),
      sharesDiluted: 1000e6 * 0.98 ** i,
      operatingCashFlow: null,
      fcf: null,
      dividendsPaid: 2e9,
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
      netMargin: 0.2,
    })),
  ],
}

vi.mock('@/fundamentals/load', () => ({
  loadFundamentals: vi.fn(async (t: string) => (t === 'TEST' ? fakeFundamentals : null)),
}))

const { prefillProjection } = await import('../prefill')

describe('prefillProjection', () => {
  it('prefills company inputs in millions from the latest fiscal year', async () => {
    const { projection, prefilledFromYear } = await prefillProjection('TEST', 50)
    expect(prefilledFromYear).toBe(2025)
    expect(projection.inputs.baseRevenue).toBeCloseTo(146410.0, 0) // $146.41B in $M
    expect(projection.inputs.sharesOut).toBeCloseTo(1000 * 0.98 ** 4, 0)
    expect(projection.inputs.currentPrice).toBe(50)
  })

  it('anchors base growth to trailing revenue CAGR (haircut) and margin to actual', async () => {
    const { projection } = await prefillProjection('TEST', 50)
    // trailing CAGR = 10%; base = 8% (×0.8)
    expect(projection.scenarios.base.revenueGrowth).toBeCloseTo(0.08, 2)
    expect(projection.scenarios.base.netMargin).toBeCloseTo(0.2, 3)
    // buyback: shares shrink 2%/yr -> ~0.02
    expect(projection.scenarios.base.buybackYield).toBeGreaterThan(0.015)
    expect(projection.scenarios.base.buybackYield).toBeLessThan(0.025)
    // dividend yield = 2B / (50 * 960.8M shares) ≈ 4.2%, clamped under 8%
    expect(projection.scenarios.base.dividendYield).toBeGreaterThan(0.03)
    expect(projection.scenarios.base.dividendYield).toBeLessThan(0.05)
  })

  it('bear < base < bull orderings hold', async () => {
    const { projection } = await prefillProjection('TEST', 50)
    const { bear, base, bull } = projection.scenarios
    expect(bear.revenueGrowth).toBeLessThan(base.revenueGrowth)
    expect(base.revenueGrowth).toBeLessThan(bull.revenueGrowth)
    expect(bear.exitPe).toBeLessThan(base.exitPe)
    expect(base.exitPe).toBeLessThan(bull.exitPe)
  })

  it('falls back to generic defaults for unknown tickers', async () => {
    const { projection, prefilledFromYear } = await prefillProjection('NOPE', 100)
    expect(prefilledFromYear).toBeNull()
    expect(projection.inputs.baseRevenue).toBe(1000)
    expect(projection.inputs.currentPrice).toBe(100)
  })
})
