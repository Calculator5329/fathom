import { describe, expect, it } from 'vitest'
import {
  currentImpliedMargin,
  pricePath,
  projectScenario,
  type ProjectionInputs,
  type ScenarioAssumptions,
} from '../model'

const inputs: ProjectionInputs = {
  baseRevenue: 1000,
  netIncome: 150,
  sharesOut: 100,
  currentPrice: 20,
  horizonYears: 5,
}

describe('projectScenario', () => {
  it('matches a hand-computed earnings-based valuation', () => {
    // 10% growth, 15% margin, 18x P/E, no buyback/div.
    // futureNI = 1000 * 1.1^5 * 0.15 = 1000 * 1.61051 * 0.15 = 241.5765
    // targetPrice = (241.5765 / 100) * 18 = 43.48377
    // priceCAGR = (43.48377/20)^(1/5) - 1
    const s: ScenarioAssumptions = {
      revenueGrowth: 0.1,
      netMargin: 0.15,
      exitPe: 18,
      dividendYield: 0,
      buybackYield: 0,
    }
    const o = projectScenario(inputs, s)
    expect(o.targetPrice).toBeCloseTo(43.48377, 4)
    expect(o.priceCagr).toBeCloseTo((43.48377 / 20) ** (1 / 5) - 1, 8)
    expect(o.totalUpside).toBeCloseTo(43.48377 / 20 - 1, 6)
  })

  it('buybacks shrink share count and lift the target price', () => {
    const base: ScenarioAssumptions = {
      revenueGrowth: 0.1,
      netMargin: 0.15,
      exitPe: 18,
      dividendYield: 0,
      buybackYield: 0,
    }
    const withBuyback = { ...base, buybackYield: 0.03 }
    expect(projectScenario(inputs, withBuyback).targetPrice).toBeGreaterThan(
      projectScenario(inputs, base).targetPrice,
    )
  })

  it('dividend yield adds to total CAGR but not price CAGR', () => {
    const s: ScenarioAssumptions = {
      revenueGrowth: 0.1,
      netMargin: 0.15,
      exitPe: 18,
      dividendYield: 0.02,
      buybackYield: 0,
    }
    const o = projectScenario(inputs, s)
    expect(o.totalCagr).toBeCloseTo(o.priceCagr + 0.02, 10)
  })

  it('degrades safely on zero/invalid inputs', () => {
    const s: ScenarioAssumptions = {
      revenueGrowth: 0.1,
      netMargin: 0.15,
      exitPe: 18,
      dividendYield: 0,
      buybackYield: 0,
    }
    expect(projectScenario({ ...inputs, currentPrice: 0 }, s).targetPrice).toBe(0)
    expect(projectScenario({ ...inputs, horizonYears: 0 }, s).priceCagr).toBe(0)
  })
})

describe('pricePath', () => {
  it('starts at current price and ends at the target', () => {
    const s: ScenarioAssumptions = {
      revenueGrowth: 0.1,
      netMargin: 0.15,
      exitPe: 18,
      dividendYield: 0,
      buybackYield: 0,
    }
    const path = pricePath(inputs, s)
    expect(path).toHaveLength(6) // years 0..5
    expect(path[0].price).toBeCloseTo(20, 6)
    expect(path[5].price).toBeCloseTo(projectScenario(inputs, s).targetPrice, 4)
    // Monotonic when target > current.
    for (let i = 1; i < path.length; i++) {
      expect(path[i].price).toBeGreaterThan(path[i - 1].price)
    }
  })
})

describe('currentImpliedMargin', () => {
  it('is net income over revenue', () => {
    expect(currentImpliedMargin(inputs)).toBeCloseTo(0.15, 10)
    expect(currentImpliedMargin({ ...inputs, baseRevenue: 0 })).toBeNull()
  })
})
