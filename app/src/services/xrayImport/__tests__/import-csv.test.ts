import { describe, expect, it } from 'vitest'
import { decodeCsvRows } from '../csv'

const make = (lines: string[]) => lines.join('\r\n')

describe('decodeCsvRows', () => {
  it('parses BOM, CRLF, and empty cells', () => {
    const rows = decodeCsvRows('\ufeffsymbol,shares,price\r\nAAPL,10,\r\nMSFT,,')
    expect(rows.delimiter).toBe(',')
    expect(rows.rows[0]).toEqual(['symbol', 'shares', 'price'])
    expect(rows.rows[1]).toEqual(['AAPL', '10', ''])
    expect(rows.rows[2]).toEqual(['MSFT', '', ''])
  })

  it('handles quoted commas and escaped quotes', () => {
    const text = make(['symbol,notes', '"AMZN","company, ""big"""', 'AAPL,"quoted, pair"'])
    const rows = decodeCsvRows(text)
    expect(rows.rows).toEqual([
      ['symbol', 'notes'],
      ['AMZN', 'company, "big"'],
      ['AAPL', 'quoted, pair'],
    ])
  })

  it('keeps embedded newlines inside quoted cells', () => {
    const text = 'symbol,notes\r\n"BRK","line1\nline2"\r\n"VTI","plain"\r\n'
    const rows = decodeCsvRows(text)
    expect(rows.rows).toHaveLength(3)
    expect(rows.rows[1]![1]).toBe('line1\nline2')
  })

  it('supports tab and semicolon delimiters', () => {
    const tab = 'symbol\tshares\nAAPL\t10\nMSFT\t5'
    const tabRows = decodeCsvRows(tab)
    expect(tabRows.delimiter).toBe('\t')
    expect(tabRows.rows[0]).toEqual(['symbol', 'shares'])
    expect(tabRows.rows[1]).toEqual(['AAPL', '10'])

    const semi = 'symbol;shares\nAAPL;10\nMSFT;5'
    const semiRows = decodeCsvRows(semi)
    expect(semiRows.delimiter).toBe(';')
    expect(semiRows.rows[0]).toEqual(['symbol', 'shares'])
    expect(semiRows.rows[1]).toEqual(['AAPL', '10'])
  })

  it('supports unicode minus and parentheses negatives in downstream parse', () => {
    const text = 'amount\n(10)\n−5'
    const rows = decodeCsvRows(text)
    expect(rows.rows[0]).toEqual(['amount'])
    expect(rows.rows[1]).toEqual(['(10)'])
    expect(rows.rows[2]).toEqual(['−5'])
  })

  it('enforces row cap', () => {
    expect(() => decodeCsvRows('a,b\n1,2\n3,4\n', { maxRows: 2 })).toThrowError(/row cap/i)
  })
})
