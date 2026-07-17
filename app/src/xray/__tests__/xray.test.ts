import { describe, expect, it } from 'vitest'
import type { TickerSeries } from '@/engine'
import { inferOpeningPositions, reconstructHistory } from '../analyze'
import { parsePositions, parseTrades } from '../parse'
import {
  SCHWAB_ACTIVITY_CSV,
  SCHWAB_POSITIONS_CSV,
  VANGUARD_ACTIVITY_CSV,
  VANGUARD_POSITIONS_CSV,
} from '../__fixtures__/broker-csv-presets'

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
    const { trades, skipped, dividends, cashFlows } = parseTrades(csv)
    expect(trades).toEqual([
      { date: '2026-06-11', ticker: 'META', side: 'buy', shares: 0.15, price: 559.74 },
      { date: '2026-07-02', ticker: 'SOFI', side: 'buy', shares: 4, price: 18.02 },
      { date: '2026-07-02', ticker: 'PYPL', side: 'sell', shares: 5, price: 45.16 },
    ])
    // Dividend row is CAPTURED now, not skipped; journal, SPAXX
    // reinvestment, and the disclaimer line remain skipped.
    expect(dividends).toEqual([{ date: '2026-07-01', ticker: 'NKE', amount: 7.59 }])
    expect(cashFlows).toEqual([])
    expect(skipped).toBe(3)
  })

  it('captures EFT deposits/withdrawals and foreign tax clawbacks', () => {
    const csv = [
      'Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date',
      '06-26-2026,Electronic Funds Transfer Received (Cash),,No Description,Cash,"",0,"","","",250,292.07,""',
      '05-29-2026,Electronic Funds Transfer Paid (Cash),,No Description,Cash,"",0,"","","",-250,328.72,""',
      '07-02-2026,DIRECT DEPOSIT ELAN CARDSVCRedemption (Cash),,No Description,Cash,"",0,"","","",9.89,770.41,""',
      '05-05-2026,FOREIGN TAX PAID ASML HOLDING NV EUR0.09 NY REGISTRY ... (ASML) (Margin),ASML,ASML HOLDING NV,Margin,"",0,"","","",-0.76,66.64,""',
      '05-05-2026,DIVIDEND RECEIVED ASML HOLDING NV EUR0.09 NY REGISTRY ... (ASML) (Margin),ASML,ASML HOLDING NV,Margin,"",0,"","","",5.07,67.4,""',
      '07-02-2026,YOU BOUGHT SOFI TECHNOLOGIES INC COM (SOFI) (Margin),SOFI,SOFI TECHNOLOGIES INC COM,Margin,18.02,4,"","","",-72.1,657.16,07-06-2026',
    ].join('\n')
    const { trades, dividends, cashFlows } = parseTrades(csv)
    expect(trades).toHaveLength(1)
    expect(cashFlows).toEqual([
      { date: '2026-05-29', amount: -250 },
      { date: '2026-06-26', amount: 250 },
      { date: '2026-07-02', amount: 9.89 },
    ])
    // Dividend + its tax clawback both land on ASML (net 4.31).
    expect(dividends.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(4.31, 6)
  })
})

describe('parsePositions (broker preset sniffing)', () => {
  it('parses a Schwab positions CSV with symbol+shares headers', () => {
    const { positions, errors } = parsePositions(SCHWAB_POSITIONS_CSV)
    expect(errors).toEqual([])
    expect(positions).toEqual([
      { ticker: 'AAPL', shares: 12 },
      { ticker: 'MSFT', shares: 5 },
    ])
  })

  it('parses a Vanguard positions CSV with fund symbols', () => {
    const { positions, errors } = parsePositions(VANGUARD_POSITIONS_CSV)
    expect(errors).toEqual([])
    expect(positions).toEqual([
      { ticker: 'VOO', shares: 8 },
      { ticker: 'BND', shares: 12 },
    ])
  })
})

describe('parseTrades (broker preset sniffing)', () => {
  it('parses Schwab activity rows using Schwab-style headers', () => {
    const { trades, dividends, cashFlows, skipped } = parseTrades(SCHWAB_ACTIVITY_CSV)
    expect(trades).toEqual([
      { date: '2026-01-05', ticker: 'TSLA', side: 'buy', shares: 10, price: 150 },
      { date: '2026-01-07', ticker: 'TSLA', side: 'sell', shares: 3, price: 160 },
    ])
    expect(dividends).toEqual([{ date: '2026-01-20', ticker: 'NVDA', amount: 22.5 }])
    expect(cashFlows).toEqual([
      { date: '2026-01-10', amount: 1250 },
      { date: '2026-01-12', amount: -450 },
    ])
    expect(skipped).toBe(1)
  })

  it('parses Vanguard activity rows using Vanguard-style headers', () => {
    const { trades, dividends, cashFlows, skipped } = parseTrades(VANGUARD_ACTIVITY_CSV)
    expect(trades).toEqual([
      { date: '2026-01-02', ticker: 'VOO', side: 'buy', shares: 10, price: 450.5 },
      { date: '2026-01-12', ticker: 'VOO', side: 'sell', shares: 4, price: 452 },
    ])
    expect(dividends).toEqual([
      { date: '2026-01-20', ticker: 'VTI', amount: 12.5 },
      { date: '2026-01-22', ticker: 'VTI', amount: -1.1 },
    ])
    expect(cashFlows).toEqual([
      { date: '2026-01-23', amount: 1000 },
      { date: '2026-01-24', amount: -250 },
    ])
    expect(skipped).toBe(1)
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

describe('inferOpeningPositions (positions + activity merge)', () => {
  const flat = (t: string) =>
    mk(t, [
      ['2026-01-02', 100],
      ['2026-03-02', 100],
      ['2026-06-01', 100],
    ])

  it('opening = current − net trades; exited tickers get their sold shares back', () => {
    const series = new Map([
      ['AAA', flat('AAA')],
      ['BBB', flat('BBB')],
      ['CCC', flat('CCC')],
    ])
    const trades = [
      { date: '2026-01-02', ticker: 'AAA', side: 'buy' as const, shares: 4 },
      { date: '2026-03-02', ticker: 'CCC', side: 'sell' as const, shares: 3 },
    ]
    const { synthetic, warnings } = inferOpeningPositions(
      [
        { ticker: 'AAA', shares: 10 }, // 10 now, bought 4 → opened with 6
        { ticker: 'BBB', shares: 7 }, //  never traded → opened with 7
        // CCC absent from positions: sold 3, ended 0 → opened with 3
      ],
      trades,
      series,
    )
    expect(warnings).toEqual([])
    const byTicker = new Map(synthetic.map((s) => [s.ticker, s]))
    expect(byTicker.get('AAA')).toMatchObject({ date: '2026-01-02', side: 'buy', shares: 6 })
    expect(byTicker.get('BBB')).toMatchObject({ shares: 7 })
    expect(byTicker.get('CCC')).toMatchObject({ shares: 3 })
  })

  it('split mid-window: current shares are end-basis, opening converts to trade-date basis', () => {
    // Buy 2 pre-split (old basis); 2:1 split later; snapshot shows 12 in the
    // end basis. Opened with (12 − 2×2)/2 = 4 old-basis shares.
    const s = mk('SPL', [
      ['2026-01-02', 200],
      ['2026-03-02', 100, 2],
      ['2026-06-01', 100],
    ])
    const { synthetic } = inferOpeningPositions(
      [{ ticker: 'SPL', shares: 12 }],
      [{ date: '2026-01-02', ticker: 'SPL', side: 'buy', shares: 2 }],
      new Map([['SPL', s]]),
    )
    expect(synthetic).toHaveLength(1)
    expect(synthetic[0]).toMatchObject({ date: '2026-01-02', shares: 4 })
  })

  it('clamps and warns when trades sell more than the snapshot explains', () => {
    const { synthetic, warnings } = inferOpeningPositions(
      [{ ticker: 'AAA', shares: 1 }],
      [{ date: '2026-01-02', ticker: 'AAA', side: 'buy', shares: 5 }],
      new Map([['AAA', flat('AAA')]]),
    )
    // current 1 − bought 5 → opening −4 → clamped, warned, no synthetic buy
    expect(synthetic).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it('merged reconstruction values the whole portfolio from day one', () => {
    const series = new Map([['AAA', flat('AAA')]])
    const trades = [{ date: '2026-03-02', ticker: 'AAA', side: 'buy' as const, shares: 2, price: 100 }]
    const { synthetic } = inferOpeningPositions([{ ticker: 'AAA', shares: 10 }], trades, series)
    const r = reconstructHistory([...synthetic, ...trades], series)
    // Opening 8 shares are capital at the first trade date, not a gain.
    expect(r.values[0]).toBe(8 * 100 + 2 * 100)
    expect(r.totalInvested).toBe(1000)
    expect(r.endPositions).toEqual([{ ticker: 'AAA', shares: 10 }])
    expect(r.twrIndex[r.twrIndex.length - 1]).toBeCloseTo(1, 10)
  })
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
