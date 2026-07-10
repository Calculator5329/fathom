import { describe, expect, it } from 'vitest'
import { DEFAULT_MC, decodeMonteCarlo, encodeMonteCarlo, type MonteCarloConfig } from '../state'

describe('monte carlo url state', () => {
  it('round-trips a full config', () => {
    const c: MonteCarloConfig = {
      allocation: [
        { assetId: 'usStocks', weight: 70 },
        { assetId: 'usBonds', weight: 30 },
      ],
      initialBalance: 500_000,
      horizonYears: 40,
      withdrawalRate: 3.5,
      strategy: 'vpw',
      feeRate: 0.25,
      mode: 'bootstrap',
      trials: 20_000,
      accumulationYears: 15,
      annualContribution: 24_000,
      basis: 'nominal',
    }
    expect(decodeMonteCarlo(encodeMonteCarlo(c))).toEqual(c)
  })

  it('adds the display basis param only when non-default (real is byte-identical)', () => {
    expect(encodeMonteCarlo(DEFAULT_MC).has('disp')).toBe(false)
    expect(encodeMonteCarlo({ ...DEFAULT_MC, basis: 'nominal' }).get('disp')).toBe('nominal')
    // Unknown values fall back to the real default.
    expect(decodeMonteCarlo(new URLSearchParams('disp=weird')).basis).toBe('real')
    expect(decodeMonteCarlo(new URLSearchParams('disp=nominal')).basis).toBe('nominal')
  })

  it('omits scalar defaults from the URL (only allocation is always present)', () => {
    const p = encodeMonteCarlo(DEFAULT_MC)
    expect(p.get('a')).toBe('usStocks:60,usBonds:40')
    for (const k of ['bal', 'yrs', 'wr', 'strat', 'fee', 'mode', 'trials']) {
      expect(p.has(k)).toBe(false)
    }
  })

  it('falls back to defaults on garbage and clamps out-of-range', () => {
    const c = decodeMonteCarlo(new URLSearchParams('a=FAKE:100&yrs=999&strat=wat&mode=weird'))
    expect(c.allocation).toEqual(DEFAULT_MC.allocation)
    expect(c.horizonYears).toBe(DEFAULT_MC.horizonYears)
    expect(c.strategy).toBe('fixedReal')
    expect(c.mode).toBe('historical')
  })
})
