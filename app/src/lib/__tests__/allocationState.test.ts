import { describe, expect, it } from 'vitest'
import { decodeAllocation, encodeAllocation, type AllocationSetup } from '../allocationState'
import { DEFAULT_CONFIG } from '../urlState'

describe('allocationState', () => {
  it('round-trips a full setup', () => {
    const setup: AllocationSetup = {
      portfolios: [
        {
          name: 'Portfolio 1',
          allocations: [
            { ticker: 'usStocks', weight: 60 },
            { ticker: 'usBonds', weight: 40 },
          ],
        },
        { name: 'Portfolio 2', allocations: [{ ticker: 'usStocks', weight: 100 }] },
      ],
      config: {
        ...DEFAULT_CONFIG,
        start: '1926-01-01',
        end: '2020-12-31',
        initialAmount: 50_000,
        monthlyContribution: 250,
        rebalance: 'monthly',
        reinvestDividends: true,
      },
      real: true,
    }
    expect(decodeAllocation(encodeAllocation(setup))).toEqual(setup)
  })

  it('encodes the documented golden URL shape and omits defaults', () => {
    const params = encodeAllocation({
      portfolios: [
        {
          name: 'Portfolio 1',
          allocations: [
            { ticker: 'usStocks', weight: 60 },
            { ticker: 'usBonds', weight: 40 },
          ],
        },
      ],
      config: { ...DEFAULT_CONFIG },
      real: false,
    })
    expect(params.toString()).toBe('a1=usStocks%3A60%2CusBonds%3A40')
  })

  it('decodes an empty query to zero portfolios and defaults', () => {
    const decoded = decodeAllocation(new URLSearchParams())
    expect(decoded.portfolios).toEqual([])
    expect(decoded.config).toEqual(DEFAULT_CONFIG)
    expect(decoded.real).toBe(false)
  })

  it('drops unknown asset ids and malformed entries', () => {
    const decoded = decodeAllocation(
      new URLSearchParams('a1=usStocks:60,notAnAsset:20,BAD,usBonds:-5,usBonds:40'),
    )
    expect(decoded.portfolios[0].allocations).toEqual([
      { ticker: 'usStocks', weight: 60 },
      { ticker: 'usBonds', weight: 40 },
    ])
  })

  it('keeps zero-weight allocations (a just-added row must survive the round-trip)', () => {
    const decoded = decodeAllocation(new URLSearchParams('a1=usStocks:100,usBonds:0'))
    expect(decoded.portfolios[0].allocations).toEqual([
      { ticker: 'usStocks', weight: 100 },
      { ticker: 'usBonds', weight: 0 },
    ])
  })

  it('always reinvests dividends (total-return series) regardless of URL', () => {
    const decoded = decodeAllocation(new URLSearchParams('a1=usStocks:100&div=off'))
    expect(decoded.config.reinvestDividends).toBe(true)
  })
})
