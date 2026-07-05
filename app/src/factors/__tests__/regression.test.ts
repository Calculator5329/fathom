import { describe, expect, it } from 'vitest'
import type { FactorData } from '@/data/factors'
import { fitFactors } from '../regression'

/** Synthetic factor data: 48 months of varied factor returns. */
function syntheticFactors(): FactorData {
  const dates: string[] = []
  const mktRf: number[] = []
  const smb: number[] = []
  const hml: number[] = []
  const rf: number[] = []
  for (let i = 0; i < 48; i++) {
    const y = 2020 + Math.floor(i / 12)
    dates.push(`${y}-${String((i % 12) + 1).padStart(2, '0')}`)
    // Deterministic, linearly-independent patterns.
    mktRf.push(0.01 * Math.sin(i * 1.7) + 0.005)
    smb.push(0.008 * Math.cos(i * 2.3))
    hml.push(0.006 * Math.sin(i * 0.9 + 1))
    rf.push(0.002)
  }
  const rfByMonth: Record<string, number> = {}
  const byMonth = new Map<string, { mktRf: number; smb: number; hml: number; rf: number }>()
  dates.forEach((d, i) => {
    rfByMonth[d] = rf[i]
    byMonth.set(d, { mktRf: mktRf[i], smb: smb[i], hml: hml[i], rf: rf[i] })
  })
  return { dates, mktRf, smb, hml, rf, rfByMonth, byMonth }
}

describe('fitFactors', () => {
  it('recovers exact betas and alpha from noiseless synthetic returns', () => {
    const f = syntheticFactors()
    const alpha = 0.001
    const months = f.dates.map((month, i) => ({
      month,
      // portfolio return = rf + alpha + 1.2*mkt + 0.3*smb - 0.1*hml
      ret: f.rf[i] + alpha + 1.2 * f.mktRf[i] + 0.3 * f.smb[i] - 0.1 * f.hml[i],
    }))
    const fit = fitFactors(months, f)!
    expect(fit.betaMkt).toBeCloseTo(1.2, 6)
    expect(fit.betaSmb).toBeCloseTo(0.3, 6)
    expect(fit.betaHml).toBeCloseTo(-0.1, 6)
    expect(fit.alphaAnnual).toBeCloseTo((1 + alpha) ** 12 - 1, 6)
    expect(fit.r2).toBeCloseTo(1, 6)
    expect(fit.months).toBe(48)
  })

  it('returns null when overlap is too short', () => {
    const f = syntheticFactors()
    const months = f.dates.slice(0, 10).map((month, i) => ({ month, ret: f.mktRf[i] }))
    expect(fitFactors(months, f)).toBeNull()
  })

  it('ignores months outside the factor coverage', () => {
    const f = syntheticFactors()
    const months = [
      ...f.dates.map((month, i) => ({ month, ret: f.rf[i] + f.mktRf[i] })),
      { month: '1900-01', ret: 5 }, // garbage outside coverage — must be ignored
    ]
    const fit = fitFactors(months, f)!
    expect(fit.betaMkt).toBeCloseTo(1, 5)
    expect(fit.months).toBe(48)
  })
})
