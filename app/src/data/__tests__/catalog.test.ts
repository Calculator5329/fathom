import { describe, expect, it } from 'vitest'
import { lookup, searchCatalog, searchTickers } from '../catalog'

function tickersFor(query: string, limit = 8): string[] {
  return searchCatalog(query, limit).map((entry) => entry.ticker)
}

describe('catalog semantic search overlay', () => {
  it('matches asset type terms such as leveraged', () => {
    const tickers = tickersFor('Leveraged', 12)

    expect(tickers.slice(0, 3).sort()).toEqual(['SSO', 'TQQQ', 'UPRO'])
  })

  it('matches dividend tags', () => {
    const tickers = tickersFor('dividend', 12)

    expect(tickers).toEqual(expect.arrayContaining(['SCHD', 'VIG', 'VYM']))
  })

  it('matches common aliases for cached catalog entries', () => {
    expect(tickersFor('facebook')[0]).toBe('META')
  })

  it('matches common aliases for overlay-only entries and marks them new', () => {
    const paypal = searchCatalog('paypal').find((entry) => entry.ticker === 'PYPL')

    expect(paypal).toMatchObject({
      ticker: 'PYPL',
      cached: false,
    })
    expect(tickersFor('pay pal')[0]).toBe('PYPL')
    expect(tickersFor('venmo')[0]).toBe('PYPL')
  })

  it('matches ServiceNow by company spelling and workflow tag', () => {
    expect(tickersFor('servicenow')[0]).toBe('NOW')
    expect(tickersFor('service now')[0]).toBe('NOW')
    expect(tickersFor('workflow')[0]).toBe('NOW')
  })

  it('keeps exact ticker matches ranked first', () => {
    expect(tickersFor('SPY')[0]).toBe('SPY')
  })

  it('keeps cached catalog fields when overlay metadata also exists', () => {
    const apple = lookup('AAPL')

    expect(apple).toMatchObject({
      ticker: 'AAPL',
      name: 'Apple Inc.',
      startDate: '1980-12-12',
    })
    expect(apple?.cached).not.toBe(false)
    expect(tickersFor('iphone')[0]).toBe('AAPL')
  })

  it('preserves overlay-only cached=false through async local search', async () => {
    const { entries } = await searchTickers('paypal')

    expect(entries.find((entry) => entry.ticker === 'PYPL')?.cached).toBe(false)
  })
})
