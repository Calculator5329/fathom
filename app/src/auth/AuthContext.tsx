import { createContext, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { AUTH_EVENT, clearAuthHint, markAuthHint } from './shellAuth'

interface AuthState {
  user: User | null
  /** True until the initial auth check resolves — avoids a signed-out flash. */
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)

const provider = new GoogleAuthProvider()

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  const value: AuthState = {
    user,
    loading,
    signInWithGoogle: async () => {
      await signInWithPopup(auth, provider)
      markAuthHint()
      window.dispatchEvent(new Event(AUTH_EVENT))
    },
    signOut: async () => {
      await fbSignOut(auth)
      clearAuthHint()
      window.dispatchEvent(new Event(AUTH_EVENT))
    },
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
