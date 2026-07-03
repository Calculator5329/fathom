import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, decodeSetup, encodeSetup, type BacktestSetup } from '../urlState'

describe('urlState', () => {
  it('round-trips a full setup', () => {
    const setup: BacktestSetup = {
      portfolios: [
        {
          name: 'Portfolio 1',
          allocations: [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 },
          ],
        },
        { name: 'Portfolio 2', allocations: [{ ticker: 'SPY', weight: 100 }] },
      ],
      config: {
        start: '1994-01-01',
        end: '2024-12-31',
        initialAmount: 25_000,
        monthlyContribution: 500,
        rebalance: 'quarterly',
        reinvestDividends: false,
      },
      benchmark: 'SPY',
    }
    const decoded = decodeSetup(encodeSetup(setup))
    expect(decoded.portfolios).toEqual(setup.portfolios)
    expect(decoded.config).toEqual(setup.config)
    expect(decoded.benchmark).toBe('SPY')
  })

  it('omits defaults from the URL to keep links short', () => {
    const params = encodeSetup({
      portfolios: [{ name: 'Portfolio 1', allocations: [{ ticker: 'VTI', weight: 100 }] }],
      config: { ...DEFAULT_CONFIG },
      benchmark: null,
    })
    expect(params.toString()).toBe('p1=VTI%3A100')
  })

  it('decodes an empty query to zero portfolios and defaults', () => {
    const decoded = decodeSetup(new URLSearchParams())
    expect(decoded.portfolios).toEqual([])
    expect(decoded.config).toEqual(DEFAULT_CONFIG)
    expect(decoded.benchmark).toBeNull()
  })

  it('drops malformed allocations and normalizes case', () => {
    const decoded = decodeSetup(new URLSearchParams('p1=vti:60,:40,BAD,XYZ:-5,bnd:40'))
    expect(decoded.portfolios[0].allocations).toEqual([
      { ticker: 'VTI', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ])
  })

  it('keeps zero-weight allocations (a just-added ticker must survive the round-trip)', () => {
    const decoded = decodeSetup(new URLSearchParams('p1=VTI:100,BND:0'))
    expect(decoded.portfolios[0].allocations).toEqual([
      { ticker: 'VTI', weight: 100 },
      { ticker: 'BND', weight: 0 },
    ])
  })

  it('ignores invalid rebalance and non-numeric amounts', () => {
    const decoded = decodeSetup(new URLSearchParams('p1=SPY:100&rebal=hourly&amt=abc&contrib=xyz'))
    expect(decoded.config.rebalance).toBe(DEFAULT_CONFIG.rebalance)
    expect(decoded.config.initialAmount).toBe(DEFAULT_CONFIG.initialAmount)
    expect(decoded.config.monthlyContribution).toBe(0)
  })
})
