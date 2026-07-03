import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Projection } from './model'

/**
 * Firestore layer for projections: users/{uid}/projections/{ticker}.
 * Per-user subcollection keyed by ticker (one projection per ticker per user).
 * Security rules restrict every doc to its owner — see firestore.rules.
 */

function projectionsCol(uid: string) {
  return collection(db, 'users', uid, 'projections')
}

function projectionDoc(uid: string, ticker: string) {
  return doc(db, 'users', uid, 'projections', ticker.toUpperCase())
}

/** Live subscription to a user's projections, newest first. */
export function subscribeProjections(
  uid: string,
  onChange: (projections: Projection[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    projectionsCol(uid),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as Projection)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      onChange(list)
    },
    (err) => onError(err),
  )
}

export async function loadProjections(uid: string): Promise<Projection[]> {
  const snap = await getDocs(projectionsCol(uid))
  return snap.docs
    .map((d) => d.data() as Projection)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export async function saveProjection(uid: string, projection: Projection): Promise<void> {
  const now = Date.now()
  await setDoc(projectionDoc(uid, projection.ticker), {
    ...projection,
    ticker: projection.ticker.toUpperCase(),
    createdAt: projection.createdAt || now,
    updatedAt: now,
    // A server timestamp for audit/ordering resilience alongside the client ms.
    _serverUpdatedAt: serverTimestamp(),
  })
}

export async function deleteProjection(uid: string, ticker: string): Promise<void> {
  await deleteDoc(projectionDoc(uid, ticker))
}
