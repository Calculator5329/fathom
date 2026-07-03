import type { DailyRecord, TickerSeries } from '@/engine'

/**
 * Asset-class data for the allocation backtester: long-history monthly
 * TOTAL-RETURN series (no separate dividends), adapted into synthetic
 * TickerSeries so the same engine and results UI work unchanged.
 */
export interface AssetClass {
  id: string
  label: string
  startDate: string // yyyy-mm
  source: string
}

export const ASSET_CLASSES: AssetClass[] = [
  { id: 'usStocks', label: 'US Stocks', startDate: '1871-01', source: 'Shiller' },
  { id: 'usBonds', label: 'US Bonds (10y)', startDate: '1871-01', source: 'Shiller' },
  { id: 'cash', label: 'Cash (T-bills)', startDate: '1871-01', source: 'Shiller' },
  { id: 'smallCap', label: 'US Small Cap', startDate: '1926-07', source: 'Fama-French' },
  { id: 'midCap', label: 'US Mid Cap', startDate: '1926-07', source: 'Fama-French' },
  { id: 'largeCap', label: 'US Large Cap', startDate: '1926-07', source: 'Fama-French' },
]

export function assetClass(id: string): AssetClass | undefined {
  return ASSET_CLASSES.find((a) => a.id === id)
}

interface MonthlyDataset {
  dates: string[] // yyyy-mm
  series: Record<string, Array<number | null>>
}

const DATA_BASE: string =
  import.meta.env.VITE_DATA_BASE_URL ?? `${import.meta.env.BASE_URL}data/`

let loaded: Promise<{ returns: Map<string, Map<string, number>>; cpi: Map<string, number> }> | null =
  null

/** Load both monthly datasets once; index returns and CPI growth by month. */
export function loadAssetClassData() {
  if (!loaded) {
    loaded = Promise.all([
      fetch(`${DATA_BASE}asset-classes/us-monthly.json`).then((r) => {
        if (!r.ok) throw new Error(`asset data unavailable (${r.status})`)
        return r.json() as Promise<MonthlyDataset>
      }),
      fetch(`${DATA_BASE}asset-classes/us-size-premia.json`).then((r) => {
        if (!r.ok) throw new Error(`asset data unavailable (${r.status})`)
        return r.json() as Promise<MonthlyDataset>
      }),
    ]).then(([us, size]) => {
      const returns = new Map<string, Map<string, number>>()
      const put = (id: string, dataset: MonthlyDataset) => {
        const m = new Map<string, number>()
        dataset.dates.forEach((d, i) => {
          const v = dataset.series[id][i]
          if (v !== null && Number.isFinite(v)) m.set(d, v)
        })
        returns.set(id, m)
      }
      put('usStocks', us)
      put('usBonds', us)
      put('cash', us)
      put('smallCap', size)
      put('midCap', size)
      put('largeCap', size)

      // CPI index level by month -> used for real-return conversion.
      const cpi = new Map<string, number>()
      us.dates.forEach((d, i) => {
        const v = us.series.cpi[i]
        if (v !== null && Number.isFinite(v)) cpi.set(d, v)
      })
      return { returns, cpi }
    })
    loaded.catch(() => {
      loaded = null // allow retry after transient failure
    })
  }
  return loaded
}

const lastDayOfMonth = (ym: string): string => {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/**
 * Build a synthetic TickerSeries for an asset class by compounding its
 * monthly total returns. With `real`, nominal growth is deflated by CPI
 * month over month, so results read in constant purchasing power.
 */
export function toTickerSeries(
  id: string,
  data: { returns: Map<string, Map<string, number>>; cpi: Map<string, number> },
  real: boolean,
): TickerSeries {
  const monthly = data.returns.get(id)
  if (!monthly) throw new Error(`Unknown asset class: ${id}`)

  const records: DailyRecord[] = []
  let level = 1
  let prevCpi: number | null = null
  for (const [ym, ret] of monthly) {
    const cpiNow = data.cpi.get(ym)
    let r = ret
    if (real) {
      if (cpiNow === undefined) continue // real mode needs CPI coverage
      if (prevCpi !== null && prevCpi > 0) {
        r = (1 + ret) / (cpiNow / prevCpi) - 1
      }
      prevCpi = cpiNow
    }
    level *= 1 + r
    records.push({
      date: lastDayOfMonth(ym),
      close: level,
      adjClose: level,
      divCash: 0,
      splitFactor: 1,
    })
  }
  const label = assetClass(id)?.label ?? id
  return { ticker: id, name: label, records }
}
