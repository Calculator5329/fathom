import type { FactorData } from '@/data/factors'

/**
 * Fama-French 3-factor OLS: excess_p = α + β_mkt·MktRF + β_smb·SMB + β_hml·HML.
 * Solved exactly via normal equations (4×4 Gaussian elimination) — no deps.
 */
export interface FactorFit {
  alphaAnnual: number // annualized monthly intercept
  betaMkt: number
  betaSmb: number
  betaHml: number
  r2: number
  months: number
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    if (Math.abs(M[pivot][col]) < 1e-12) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/**
 * Fit the 3-factor model to labeled monthly portfolio returns.
 * Returns null when overlap with the factor data is under `minMonths`.
 */
export function fitFactors(
  portfolioMonths: Array<{ month: string; ret: number }>,
  factors: FactorData,
  minMonths = 24,
): FactorFit | null {
  const rows: Array<{ y: number; x: [number, number, number] }> = []
  for (const m of portfolioMonths) {
    const f = factors.byMonth.get(m.month)
    if (!f) continue
    rows.push({ y: m.ret - f.rf, x: [f.mktRf, f.smb, f.hml] })
  }
  if (rows.length < minMonths) return null

  // Design matrix columns: [1, mkt, smb, hml]; normal equations XtX β = Xty.
  const XtX = Array.from({ length: 4 }, () => new Array<number>(4).fill(0))
  const Xty = new Array<number>(4).fill(0)
  for (const { y, x } of rows) {
    const xi = [1, x[0], x[1], x[2]]
    for (let i = 0; i < 4; i++) {
      Xty[i] += xi[i] * y
      for (let j = 0; j < 4; j++) XtX[i][j] += xi[i] * xi[j]
    }
  }
  const beta = solve(XtX, Xty)
  if (!beta) return null

  const meanY = rows.reduce((s, r) => s + r.y, 0) / rows.length
  let ssTot = 0
  let ssRes = 0
  for (const { y, x } of rows) {
    const pred = beta[0] + beta[1] * x[0] + beta[2] * x[1] + beta[3] * x[2]
    ssRes += (y - pred) ** 2
    ssTot += (y - meanY) ** 2
  }

  return {
    alphaAnnual: (1 + beta[0]) ** 12 - 1,
    betaMkt: beta[1],
    betaSmb: beta[2],
    betaHml: beta[3],
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
    months: rows.length,
  }
}
