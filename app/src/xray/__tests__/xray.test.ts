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

  it('parses a Fidelity Portfolio_Positions CSV (real export shape)', () => {
    const csv = [
      "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type",
      'Z00000000,Growth Portfolio,META,META PLATFORMS INC CLASS A COMMON STOCK,28.12,$582.90,-$30.01,$16391.14,-$842.48,-4.89%,+$9521.31,+138.59%,21.98%,$6869.83,$244.30,Margin,',
      'Z00000000,Growth Portfolio,AMZN,AMAZON.COM INC,61.575,$242.67,+$0.97,$14942.40,+$59.01,+0.39%,+$3178.97,+27.02%,20.04%,$11763.43,$191.04,Margin,',
      'Z00000000,Growth Portfolio,SPAXX**,HELD IN MONEY MARKET,,,,$770.41,,,,,1.03%,,,Cash,',
      'Z00000000,Growth Portfolio,Pending activity,,,,,$136.75,,,,,,,,,',
      '',
      '"The data and information in this spreadsheet is provided to you solely for your use, and is not for distribution."',
      '"Date downloaded Jul-05-2026 1:45 a.m ET"',
    ].join('\n')
    const { positions, errors } = parsePositions(csv)
    expect(errors).toEqual([])
    expect(positions).toEqual([
      { ticker: 'META', shares: 28.12 },
      { ticker: 'AMZN', shares: 61.575 },
    ])
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

  it('parses a Fidelity History_for_Account CSV (real export shape)', () => {
    const csv = [
      'Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date',
      '',
      '07-06-2026,JOURNALED JNL VS A/C TYPES (Cash),,No Description,Cash,"",0,"","","",-113.25,Processing,""',
      '07-02-2026,YOU BOUGHT SOFI TECHNOLOGIES INC COM (SOFI) (Margin),SOFI,SOFI TECHNOLOGIES INC COM,Margin,18.02,4,"","","",-72.1,657.16,07-06-2026',
      '07-02-2026,YOU SOLD PAYPAL HLDGS INC COM (PYPL) (Margin),PYPL,PAYPAL HLDGS INC COM,Margin,45.16,-5,"","","",225.8,729.26,07-06-2026',
      '07-01-2026,DIVIDEND RECEIVED NIKE INC CLASS B COM NPV (NKE) (Margin),NKE,NIKE INC CLASS B COM NPV,Margin,"",0,"","","",7.59,760.52,""',
      '06-30-2026,REINVESTMENT FIDELITY GOVERNMENT MONEY MARKET (SPAXX) (Cash),SPAXX,FIDELITY GOVERNMENT MONEY MARKET,Cash,1,0.51,"","","",-0.51,749.93,""',
      '06-11-2026,YOU BOUGHT EX-DIV DATE 06/15/26RECORD DATE 06/15/26PAYABLE DTE 06/25/26 META PLATFORMS INC CLASS A COMMON STOCK (META) (Margin),META,META PLATFORMS INC CLASS A COMMON STOCK,Margin,559.74,0.15,"","","",-83.96,-4.06,06-12-2026',
      '"Brokerage services are provided by Fidelity Brokerage Services LLC (FBS), 900 Salem Street, Smithfield, RI 02917."',
    ].join('\n')
    const { trades, skipped } = parseTrades(csv)
    expect(trades).toEqual([
      { date: '2026-06-11', ticker: 'META', side: 'buy', shares: 0.15, price: 559.74 },
      { date: '2026-07-02', ticker: 'SOFI', side: 'buy', shares: 4, price: 18.02 },
      { date: '2026-07-02', ticker: 'PYPL', side: 'sell', shares: 5, price: 45.16 },
    ])
    // journal, dividend, SPAXX reinvestment, disclaimer all skipped
    expect(skipped).toBe(4)
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
