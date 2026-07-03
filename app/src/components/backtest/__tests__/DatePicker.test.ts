import { describe, expect, it } from 'vitest'
import { formatDateInput, normalizeDateInput } from '../DatePicker'

const maxDate = new Date(2026, 6, 3)

describe('DatePicker input helpers', () => {
  it('formats typed digits as month/day/year', () => {
    expect(formatDateInput('0')).toBe('0')
    expect(formatDateInput('0101')).toBe('01/01')
    expect(formatDateInput('01012023')).toBe('01/01/2023')
  })

  it('normalizes valid month/day/year input to url state format', () => {
    expect(normalizeDateInput('01/31/1871', 1870, maxDate)).toBe('1871-01-31')
    expect(normalizeDateInput('6/30/2023', 1870, maxDate)).toBe('2023-06-30')
  })

  it('also accepts pasted iso-style dates', () => {
    expect(formatDateInput('2023-06-30')).toBe('06/30/2023')
    expect(normalizeDateInput('2023-06-30', 1870, maxDate)).toBe('2023-06-30')
  })

  it('rejects impossible and out-of-range dates', () => {
    expect(normalizeDateInput('02/31/2023', 1870, maxDate)).toBeNull()
    expect(normalizeDateInput('12/31/1869', 1870, maxDate)).toBeNull()
    expect(normalizeDateInput('07/04/2026', 1870, maxDate)).toBeNull()
  })
})
