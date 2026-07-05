import { describe, expect, it } from 'vitest'
import type { TickerSeries } from '@/engine'
import { reconstructHistory } from '../analyze'
import { parsePositions, parseTrades } from '../parse'

// ---------- parsers ----------------------------------------------------------

describe('parsePositions', () => {
  it('parses shares and weights across separators, merging duplicates', () => {
    const { positions, errors } = parsePositions('AAPL 10\nvti, 25%\nMSFT\t5\nAAPL 2')
    expect(errors).toEqual([])
    expect(positions).toEqual([
      { ticker: 'AAPL', shares: 12 },
      { ticker: 'VTI', weight: 25 },
      { ticker: 'MSFT', shares: 5 },
    ])
  })

  it('reports unparseable lines', () => {
    const { positions, errors } = parsePositions('what is this\nAAPL 10')
    expect(positions).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })
})

describe('parseTrades', () => {
  it('handles a typical broker export with aliased headers', () => {
    const csv = [
      'Run Date,Action,Symbol,Quantity,Price',
      '01/15/2020,YOU BOUGHT,AAPL,10,75.00',
      '03/20/2020,Dividend Received,AAPL,,',
      '06/10/2021,YOU SOLD,AAPL,4,130.00',
    ].join('\n')
    const { trades, skipped } = parseTrades(csv)
    expect(trades).toEqual([
      { date: '2020-01-15', ticker: 'AAPL', side: 'buy', shares: 10, price: 75 },
      { date: '2021-06-10', ticker: 'AAPL', side: 'sell', shares: 4, price: 130 },
    ])
    expect(skipped).toBe(1) // the dividend row
  })

  it('infers sells from negative quantities when no side column exists', () => {
    const csv = ['date,symbol,quantity,price', '2020-01-02,VTI,10,150', '2020-06-01,VTI,-3,160'].join('\n')
    const { trades } = parseTrades(csv)
    expect(trades[0].side).toBe('buy')
    expect(trades[1]).toMatchObject({ side: 'sell', shares: 3 })
  })
})

// ---------- reconstruction ----------------------------------------------------

const mk = (ticker: string, rows: Array<[string, number, number?]>): TickerSeries => ({
  ticker,
  records: rows.map(([date, close, splitFactor]) => ({
    date,
    close,
    adjClose: close,
    divCash: 0,
    splitFactor: splitFactor ?? 1,
  })),
})

describe('reconstructHistory', () => {
  it('hand-computed: single buy, price doubles -> TWR 2x, value tracks', () => {
    const s = mk('AAA', [
      ['2020-01-02', 100],
      ['2020-01-03', 150],
      ['2020-01-06', 200],
    ])
    const r = reconstructHistory(
      [{ date: '2020-01-02', ticker: 'AAA', side: 'buy', shares: 10, price: 100 }],
      new Map([['AAA', s]]),
    )
    expect(r.values).toEqual([1000, 1500, 2000])
    expect(r.twrIndex[2]).toBeCloseTo(2, 10)
    expect(r.totalInvested).toBe(1000)
    expect(r.endPositions).toEqual([{ ticker: 'AAA', shares: 10 }])
  })

  it('splits after a buy multiply the share count; value stays continuous', () => {
    // Buy 10 @ $200 pre-split; 2:1 split (close 105 = real +5%); then $110.
    const s = mk('SPL', [
      ['2020-01-02', 200],
      ['2020-01-03', 105, 2],
      ['2020-01-06', 110],
    ])
    const r = reconstructHistory(
      [{ date: '2020-01-02', ticker: 'SPL', side: 'buy', shares: 10, price: 200 }],
      new Map([['SPL', s]]),
    )
    expect(r.values[0]).toBe(2000)
    expect(r.values[1]).toBeCloseTo(20 * 105, 6) // 20 shares post-split
    expect(r.values[2]).toBeCloseTo(20 * 110, 6)
    expect(r.twrIndex[1]).toBeCloseTo(1.05, 6) // no phantom gain/loss from the split
    expect(r.endPositions[0].shares).toBe(20)
  })

  it('sells remove value as an external outflow without distorting TWR', () => {
    const s = mk('BBB', [
      ['2020-01-02', 100],
      ['2020-01-03', 100],
      ['2020-01-06', 100],
    ])
    const r = reconstructHistory(
      [
        { date: '2020-01-02', ticker: 'BBB', side: 'buy', shares: 10, price: 100 },
        { date: '2020-01-03', ticker: 'BBB', side: 'sell', shares: 5, price: 100 },
      ],
      new Map([['BBB', s]]),
    )
    expect(r.values).toEqual([1000, 500, 500])
    // Flat prices -> zero return regardless of the withdrawal.
    expect(r.twrIndex[2]).toBeCloseTo(1, 10)
    expect(r.totalWithdrawn).toBe(500)
    expect(r.metrics.totalReturn).toBeCloseTo(0, 10)
  })

  it('multi-ticker portfolios mark to market across different calendars', () => {
    const a = mk('AAA', [
      ['2020-01-02', 100],
      ['2020-01-03', 110],
      ['2020-01-06', 120],
    ])
    const b = mk('BBB', [
      ['2020-01-03', 50],
      ['2020-01-06', 55],
    ])
    const r = reconstructHistory(
      [
        { date: '2020-01-02', ticker: 'AAA', side: 'buy', shares: 10, price: 100 },
        { date: '2020-01-03', ticker: 'BBB', side: 'buy', shares: 20, price: 50 },
      ],
      new Map([
        ['AAA', a],
        ['BBB', b],
      ]),
    )
    expect(r.values[0]).toBe(1000)
    expect(r.values[1]).toBe(10 * 110 + 20 * 50)
    expect(r.values[2]).toBe(10 * 120 + 20 * 55)
    expect(r.irr).toBeGreaterThan(0)
  })
})
