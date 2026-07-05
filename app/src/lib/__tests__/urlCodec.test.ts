import { describe, expect, it } from 'vitest'
import { decodeWeightList, encodeWeightList, enumParam, numParam } from '../urlCodec'

describe('urlCodec primitives', () => {
  it('encodes weights rounded to 2dp, dropping empty keys and negatives', () => {
    expect(
      encodeWeightList([
        { key: 'VTI', weight: 33.333333 },
        { key: '', weight: 10 },
        { key: 'BND', weight: -5 },
        { key: 'GLD', weight: 0 },
      ]),
    ).toBe('VTI:33.33,GLD:0')
  })

  it('round-trips zero weights (transient just-added rows)', () => {
    const list = [
      { key: 'VTI', weight: 100 },
      { key: 'BND', weight: 0 },
    ]
    expect(decodeWeightList(encodeWeightList(list))).toEqual(list)
  })

  it('decode drops malformed entries and honors validators / uppercase', () => {
    expect(decodeWeightList('vti:60,:40,BAD,XYZ:-5,bnd:40', { uppercase: true })).toEqual([
      { key: 'VTI', weight: 60 },
      { key: 'BND', weight: 40 },
    ])
    expect(
      decodeWeightList('usStocks:60,fake:40', { isValidKey: (k) => k === 'usStocks' }),
    ).toEqual([{ key: 'usStocks', weight: 60 }])
  })

  it('numParam: fallback on null/garbage, positive and min/max bounds', () => {
    expect(numParam(null, 7)).toBe(7)
    expect(numParam('abc', 7)).toBe(7)
    expect(numParam('-3', 7)).toBe(-3)
    expect(numParam('0', 7, { positive: true })).toBe(7)
    expect(numParam('5', 7, { positive: true })).toBe(5)
    expect(numParam('999', 30, { min: 1, max: 60 })).toBe(30)
    expect(numParam('60', 30, { min: 1, max: 60 })).toBe(60)
  })

  it('enumParam: accepts listed values, falls back otherwise', () => {
    const vals = ['none', 'annual'] as const
    expect(enumParam('annual', vals, 'none')).toBe('annual')
    expect(enumParam('hourly', vals, 'none')).toBe('none')
    expect(enumParam(null, vals, 'none')).toBe('none')
  })
})
