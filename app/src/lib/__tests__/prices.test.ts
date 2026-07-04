import { describe, expect, it } from 'vitest'
import { splitAdjustedCloses } from '../prices'
import type { DailyRecord } from '@/engine'

const rec = (date: string, close: number, splitFactor = 1): DailyRecord => ({
  date,
  close,
  adjClose: close,
  divCash: 0,
  splitFactor,
})

describe('splitAdjustedCloses', () => {
  it('makes a series continuous across a split and ends at the actual price', () => {
    // Pre-split ~$2000, then a 20:1 split (day shows post-split $100), then $120.
    const records = [
      rec('2022-06-01', 2000),
      rec('2022-06-06', 100, 20), // split day, close already post-split
      rec('2022-06-07', 120),
    ]
    const adj = splitAdjustedCloses(records)
    expect(adj[0]).toBeCloseTo(100, 6) // 2000 / 20
    expect(adj[1]).toBeCloseTo(100, 6)
    expect(adj[2]).toBeCloseTo(120, 6) // unchanged — the actual current price
  })

  it('is identity with no splits', () => {
    const records = [rec('2020-01-02', 50), rec('2020-01-03', 55)]
    expect(splitAdjustedCloses(records)).toEqual([50, 55])
  })

  it('compounds multiple splits', () => {
    // 2:1 then later 3:1 → earliest price divided by 6.
    const records = [rec('2019-01-01', 600), rec('2020-01-01', 100, 2), rec('2021-01-01', 40, 3)]
    const adj = splitAdjustedCloses(records)
    expect(adj[0]).toBeCloseTo(100, 6) // 600 / (2*3)
    expect(adj[1]).toBeCloseTo(33.3333, 3) // 100 / 3
    expect(adj[2]).toBeCloseTo(40, 6)
  })
})
