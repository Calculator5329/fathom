import { describe, expect, it } from 'vitest'
import { formatPct, formatUsd, formatUsdCompact } from '../format'

describe('formatUsdCompact', () => {
  it('keeps small dollar amounts uncompressed', () => {
    expect(formatUsdCompact(999)).toBe('$999')
  })

  it('uses compact suffixes for large dollar amounts', () => {
    expect(formatUsdCompact(35_650)).toBe('$35.65K')
    expect(formatUsdCompact(2_340_000)).toBe('$2.34M')
    expect(formatUsdCompact(6_473_743_200)).toBe('$6.47B')
  })

  it('uses a real minus (U+2212) for negative compact values', () => {
    expect(formatUsdCompact(-1_250_000)).toBe('−$1.25M')
    expect(formatUsdCompact(-50)).toBe('−$50')
  })
})

describe('formatUsd', () => {
  it('keeps full whole-dollar formatting for detailed values', () => {
    expect(formatUsd(6_473_743_200)).toBe('$6,473,743,200')
  })
})

describe('formatPct', () => {
  it('unsigned: real minus for negatives, no plus for positives', () => {
    expect(formatPct(0.084)).toBe('8.4%')
    expect(formatPct(-0.032)).toBe('−3.2%')
    expect(formatPct(0.965, { dp: 0 })).toBe('97%')
  })

  it('signed: explicit + and real minus', () => {
    expect(formatPct(0.084, { signed: true })).toBe('+8.4%')
    expect(formatPct(-0.032, { signed: true })).toBe('−3.2%')
    expect(formatPct(0, { signed: true })).toBe('+0.0%')
  })
})
