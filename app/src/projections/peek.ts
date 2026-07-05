import { projectScenario, type Projection } from './model'

export interface BaseCasePeek {
  totalCagr: number
  targetPrice: number
  horizonYears: number
}

/**
 * Quietly check whether the signed-in user has a saved projection for a
 * ticker, and compute its base case at the LIVE price (unless the thesis
 * pinned a manual price). Firebase is imported dynamically so this module —
 * and the Research page that calls it — never pulls the SDK into their
 * static chunks. Returns null when signed out, no projection, or any error.
 */
export async function peekBaseCase(
  ticker: string,
  livePrice?: number | null,
): Promise<BaseCasePeek | null> {
  try {
    const [{ auth, db }, { onAuthStateChanged }, { doc, getDoc }] = await Promise.all([
      import('@/lib/firebase'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ])
    const user = await new Promise<{ uid: string } | null>((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => {
        unsub()
        resolve(u)
      })
    })
    if (!user) return null
    const snap = await getDoc(doc(db, 'users', user.uid, 'projections', ticker.toUpperCase()))
    if (!snap.exists()) return null
    const p = snap.data() as Projection
    const price =
      !p.manualPrice && livePrice && livePrice > 0 ? livePrice : p.inputs.currentPrice
    const o = projectScenario({ ...p.inputs, currentPrice: price }, p.scenarios.base)
    return {
      totalCagr: o.totalCagr,
      targetPrice: o.targetPrice,
      horizonYears: p.inputs.horizonYears,
    }
  } catch {
    return null
  }
}
