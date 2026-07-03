import type { RealReturnSeries } from './simulate'

export interface AllocationWeight {
  assetId: string
  weight: number // percent
}

/** The asset-class data shape returned by loadAssetClassData(). */
export interface AssetData {
  returns: Map<string, Map<string, number>> // assetId -> (yyyy-mm -> nominal monthly return)
  cpi: Map<string, number> // yyyy-mm -> CPI index level
}

/**
 * Build a blended REAL monthly return series for an allocation, over the range
 * all its assets (and CPI) share. Monthly rebalancing (a weighted average of
 * each asset's monthly return); nominal is deflated to real via CPI.
 */
export function buildRealReturns(
  allocation: AllocationWeight[],
  data: AssetData,
): RealReturnSeries {
  const active = allocation.filter((a) => a.weight > 0)
  if (active.length === 0) return { dates: [], returns: [] }
  const totalWeight = active.reduce((s, a) => s + a.weight, 0)

  // Common months present in every asset AND cpi.
  const maps = active.map((a) => data.returns.get(a.assetId))
  if (maps.some((m) => !m)) return { dates: [], returns: [] }
  const first = maps[0]!
  const common: string[] = []
  for (const ym of first.keys()) {
    if (data.cpi.has(ym) && maps.every((m) => m!.has(ym))) common.push(ym)
  }
  common.sort()

  const dates: string[] = []
  const returns: number[] = []
  for (let i = 1; i < common.length; i++) {
    const ym = common[i]
    const prevCpi = data.cpi.get(common[i - 1])!
    const curCpi = data.cpi.get(ym)!
    let nominal = 0
    for (let a = 0; a < active.length; a++) {
      nominal += (active[a].weight / totalWeight) * maps[a]!.get(ym)!
    }
    const inflation = curCpi / prevCpi
    dates.push(ym)
    returns.push((1 + nominal) / inflation - 1)
  }
  return { dates, returns }
}
