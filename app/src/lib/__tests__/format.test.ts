import { describe, expect, it } from 'vitest'
import { formatUsd, formatUsdCompact } from '../format'

describe('formatUsdCompact', () => {
  it('keeps small dollar amounts uncompressed', () => {
    expect(formatUsdCompact(999)).toBe('$999')
  })

  it('uses compact suffixes for large dollar amounts', () => {
    expect(formatUsdCompact(35_650)).toBe('$35.65K')
    expect(formatUsdCompact(2_340_000)).toBe('$2.34M')
    expect(formatUsdCompact(6_473_743_200)).toBe('$6.47B')
  })

  it('preserves the sign for negative compact values', () => {
    expect(formatUsdCompact(-1_250_000)).toBe('-$1.25M')
  })
})

describe('formatUsd', () => {
  it('keeps full whole-dollar formatting for detailed values', () => {
    expect(formatUsd(6_473_743_200)).toBe('$6,473,743,200')
  })
})
