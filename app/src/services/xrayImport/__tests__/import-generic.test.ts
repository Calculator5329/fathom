import { describe, expect, it } from 'vitest'
import { parseBrokerCsvText } from '../index'

describe('parseBrokerCsvText generic mapping', () => {
  it('maps a simple positions CSV to holdings', () => {
    const csv = [
      'Run Date,Symbol,Description,Price,Quantity',
      '2026-01-01,AAPL,Apple Inc,150,10',
      '2026-01-02,MSFT,Microsoft,400,5',
    ].join('\n')
    const result = parseBrokerCsvText(csv)
    expect(result.detectedKind).toBe('activity')
    expect(result.import.positions).toHaveLength(0)
    expect(result.import.trades).toHaveLength(0)
    expect(result.import.report.blocked).toBe(true)
  })

  it('maps a positions file when no date header is present', () => {
    const csv = ['Ticker,Shares', 'AAPL,10', 'MSFT,5'].join('\n')
    const result = parseBrokerCsvText(csv)
    expect(result.detectedKind).toBe('positions')
    expect(result.import.positions).toEqual([
      { ticker: 'AAPL', shares: 10 },
      { ticker: 'MSFT', shares: 5 },
    ])
  })

  it('maps action values to buy, sell, and dividend', () => {
    const csv = [
      'Run Date,Action,Symbol,Quantity,Amount ($)',
      '06-01-2026,you bought,AAPL,4,',
      '06-02-2026,you sold,MSFT,2,',
      '06-03-2026,Dividend Received,MSFT,,12',
      '06-04-2026,Foreign Tax Paid,MSFT,,-2',
    ].join('\n')
    const result = parseBrokerCsvText(csv)
    expect(result.import.trades).toHaveLength(2)
    expect(result.import.trades).toEqual([
      { date: '2026-06-01', ticker: 'AAPL', side: 'buy', shares: 4, price: undefined },
      { date: '2026-06-02', ticker: 'MSFT', side: 'sell', shares: 2, price: undefined },
    ])
    expect(result.import.dividends).toEqual([
      { date: '2026-06-03', ticker: 'MSFT', amount: 12 },
      { date: '2026-06-04', ticker: 'MSFT', amount: -2 },
    ])
  })

  it('maps external flows to cash flow signs', () => {
    const csv = [
      'date,action,symbol,amount',
      '2026-06-01,Electronic Funds Transfer Received (Cash),,1000',
      '2026-06-02,Electronic Funds Transfer Paid (Cash),,1000',
    ].join('\n')
    const result = parseBrokerCsvText(csv)
    expect(result.import.cashFlows).toHaveLength(2)
    expect(result.import.cashFlows[0]).toEqual({ date: '2026-06-01', amount: 1000 })
    expect(result.import.cashFlows[1]).toEqual({ date: '2026-06-02', amount: -1000 })
  })

  it('ignores unsupported rows with warnings rather than throwing', () => {
    const csv = ['symbol,qty', 'AAPL,10', 'badrow'].join('\n')
    const result = parseBrokerCsvText(csv)
    expect(result.import.report.blocked).toBe(false)
    expect(result.import.positions).toHaveLength(1)
    expect(result.import.report.warnings.length).toBeGreaterThanOrEqual(1)
  })
})
