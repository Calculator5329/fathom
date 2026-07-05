/** Fama-French monthly factor data (built by scripts/build-ff-factors.mjs). */

export interface FactorData {
  dates: string[] // yyyy-mm
  mktRf: number[]
  smb: number[]
  hml: number[]
  rf: number[]
  /** yyyy-mm → monthly rf, for the engine's Sharpe/Sortino. */
  rfByMonth: Record<string, number>
  byMonth: Map<string, { mktRf: number; smb: number; hml: number; rf: number }>
}

const DATA_BASE: string =
  import.meta.env.VITE_DATA_BASE_URL ?? `${import.meta.env.BASE_URL}data/`

let cached: Promise<FactorData | null> | null = null

export function loadFactors(): Promise<FactorData | null> {
  if (!cached) {
    cached = fetch(`${DATA_BASE}asset-classes/ff-factors.json`)
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('json') ? res.json() : null))
      .then((raw): FactorData | null => {
        if (!raw?.dates?.length) return null
        const { dates } = raw as { dates: string[] }
        const s = raw.series as { mktRf: number[]; smb: number[]; hml: number[]; rf: number[] }
        const rfByMonth: Record<string, number> = {}
        const byMonth = new Map<string, { mktRf: number; smb: number; hml: number; rf: number }>()
        dates.forEach((d, i) => {
          rfByMonth[d] = s.rf[i]
          byMonth.set(d, { mktRf: s.mktRf[i], smb: s.smb[i], hml: s.hml[i], rf: s.rf[i] })
        })
        return { dates, mktRf: s.mktRf, smb: s.smb, hml: s.hml, rf: s.rf, rfByMonth, byMonth }
      })
      .catch(() => null)
  }
  return cached
}
