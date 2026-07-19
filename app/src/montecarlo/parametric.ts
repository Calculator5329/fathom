/**
 * PARAMETRIC Monte Carlo mode — the third path-generation method alongside
 * `historical` (every rolling era as one trial) and `bootstrap` (block-resampled
 * history). Here the user supplies the return *distribution* directly: an
 * expected real mean and volatility per asset, plus a single cross-asset
 * correlation. Returns are DRAWN from that Gaussian, never taken from history.
 *
 * Design note — reuse over reinvention: the withdrawal accounting (fees,
 * fixed-real / VPW / guardrails spending, depletion, per-year income) is the
 * test-sacred engine and lives in @calculator53295/backtest-engine. We never
 * re-implement it. Instead we synthesize a large pool of REAL monthly portfolio
 * returns drawn from the user's distribution and hand it to the engine's
 * `runBootstrap` with a one-month block, so each trial is an i.i.d. draw from
 * that pool (≈ i.i.d. draws from the parametric Gaussian). The novel, tested
 * piece is the correlated-normal *path generator* below; the accounting stays
 * byte-identical to the existing modes.
 *
 * Everything is REAL (inflation-adjusted), matching the rest of the simulator.
 */
import {
  type RealReturnSeries,
  type SimParams,
  type SimResult,
  mulberry32,
  runBootstrap,
} from './simulate'

/** One asset's parametric assumptions (annual, real, as fractions). */
export interface ParametricAsset {
  /** Portfolio weight (fraction, 0..1). */
  weight: number
  /** Expected annual real return (fraction, e.g. 0.07). May be negative. */
  mean: number
  /** Annual volatility / standard deviation (fraction, e.g. 0.16). >= 0. */
  vol: number
}

export interface ParametricInput {
  assets: ParametricAsset[]
  /** Uniform pairwise correlation between assets (−1..1). */
  correlation: number
}

/** Months of synthetic history generated for the resampling pool. */
export const POOL_MONTHS = 6000

// ---- standard-normal generator (Box–Muller over a seeded uniform) -----------
/**
 * Wrap a uniform RNG into a standard-normal generator. Box–Muller produces two
 * independent normals per pair of uniforms; the spare is cached so the stream
 * stays deterministic and cheap.
 */
export function makeNormal(rng: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    // Avoid log(0): clamp the first uniform away from 0.
    let u1 = rng()
    if (u1 < 1e-12) u1 = 1e-12
    const u2 = rng()
    const r = Math.sqrt(-2 * Math.log(u1))
    const theta = 2 * Math.PI * u2
    spare = r * Math.sin(theta)
    return r * Math.cos(theta)
  }
}

// ---- Cholesky factor of an equicorrelation matrix ---------------------------
/**
 * Lower-triangular Cholesky factor L (L·Lᵀ = Σ) of the n×n equicorrelation
 * matrix — 1 on the diagonal, `rho` off it. Correlated standard normals are
 * then `x = L·z` for independent standard normals z.
 *
 * An equicorrelation matrix is positive-definite iff −1/(n−1) < rho < 1, so the
 * correlation is clamped into that open interval before factoring; a value at
 * or past the boundary would otherwise produce a non-real square root.
 */
export function equicorrelationCholesky(n: number, rho: number): number[][] {
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  if (n <= 1) {
    if (n === 1) L[0][0] = 1
    return L
  }
  const lower = -1 / (n - 1) + 1e-9
  const r = Math.min(0.999999, Math.max(lower, rho))
  const cov = (i: number, j: number) => (i === j ? 1 : r)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = cov(i, j)
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k]
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(sum, 0))
      } else {
        L[i][j] = L[j][j] === 0 ? 0 : sum / L[j][j]
      }
    }
  }
  return L
}

/**
 * Generate `months` of real monthly PORTFOLIO returns drawn from the parametric
 * model. Each month: draw n independent standard normals, correlate them via
 * the Cholesky factor, scale to each asset's monthly mean/vol, and combine by
 * weight. Annual mean → monthly `mean/12`; annual vol → monthly `vol/√12`
 * (the standard parametric-MC conversion).
 */
export function generateParametricPool(
  input: ParametricInput,
  months: number,
  rng: () => number,
): number[] {
  const assets = input.assets
  const n = assets.length
  const normal = makeNormal(rng)
  const L = equicorrelationCholesky(n, input.correlation)
  const mMean = assets.map((a) => a.mean / 12)
  const mVol = assets.map((a) => a.vol / Math.sqrt(12))
  const weight = assets.map((a) => a.weight)

  const pool = new Array<number>(months)
  const z = new Array<number>(n)
  for (let t = 0; t < months; t++) {
    for (let i = 0; i < n; i++) z[i] = normal()
    let port = 0
    for (let i = 0; i < n; i++) {
      // Correlated standard normal for asset i: (L·z)_i.
      let x = 0
      for (let k = 0; k <= i; k++) x += L[i][k] * z[k]
      port += weight[i] * (mMean[i] + mVol[i] * x)
    }
    pool[t] = port
  }
  return pool
}

/**
 * Run the parametric simulation. Builds a seeded pool of parametric real
 * returns, then reuses the engine's block bootstrap (one-month block → i.i.d.
 * draws) for the sacred withdrawal accounting. Deterministic in `seed`.
 */
export function runParametric(
  input: ParametricInput,
  params: SimParams,
  opts: { trials: number; seed: number },
): SimResult {
  const pool = generateParametricPool(input, POOL_MONTHS, mulberry32(opts.seed))
  const series: RealReturnSeries = { dates: [], returns: pool }
  // A distinct RNG stream for resampling so it doesn't track the pool draws.
  const result = runBootstrap(series, params, {
    trials: opts.trials,
    blockMonths: 1,
    rng: mulberry32((opts.seed ^ 0x85ebca6b) >>> 0),
  })
  return result
}
