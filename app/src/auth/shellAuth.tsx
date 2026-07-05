import { createContext, useContext, useEffect, useRef, useState } from 'react'

/**
 * App-shell auth state WITHOUT pulling Firebase into the initial bundle.
 * The SDK loads only when (a) this browser has signed in before (localStorage
 * hint → silent session restore) or (b) the user clicks Sign in. Everyone
 * else never downloads Firebase — preserving the "tools 1-2 need no account"
 * bundle discipline.
 */

const HINT = 'fathom.auth.hint.v1'
/** Cross-context nudge: AuthContext (Projections) fires this on sign-in/out. */
export const AUTH_EVENT = 'fathom-auth-changed'

export const markAuthHint = () => localStorage.setItem(HINT, '1')
export const clearAuthHint = () => localStorage.removeItem(HINT)

export interface ShellUser {
  email: string | null
  name: string | null
}

interface ShellAuthState {
  /** 'unknown' only while a returning session is being restored. */
  status: 'unknown' | 'out' | 'in'
  user: ShellUser | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<ShellAuthState>({
  status: 'out',
  user: null,
  signIn: async () => {},
  signOut: async () => {},
})

async function fb() {
  const [{ auth }, mod] = await Promise.all([import('@/lib/firebase'), import('firebase/auth')])
  return { auth, mod }
}

export function ShellAuthProvider({ children }: { children: React.ReactNode }) {
  const returning = localStorage.getItem(HINT) === '1'
  const [status, setStatus] = useState<ShellAuthState['status']>(returning ? 'unknown' : 'out')
  const [user, setUser] = useState<ShellUser | null>(null)
  const subscribed = useRef(false)

  const subscribe = async () => {
    if (subscribed.current) return
    subscribed.current = true
    const { auth, mod } = await fb()
    mod.onAuthStateChanged(auth, (u) => {
      setUser(u ? { email: u.email, name: u.displayName } : null)
      setStatus(u ? 'in' : 'out')
      if (u) markAuthHint()
      else clearAuthHint()
    })
  }

  useEffect(() => {
    if (returning) void subscribe()
    // Projections' own AuthProvider signs in/out through a separate context;
    // it pings this event so the shell picks the change up immediately.
    const onPing = () => void subscribe()
    window.addEventListener(AUTH_EVENT, onPing)
    return () => window.removeEventListener(AUTH_EVENT, onPing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = async () => {
    const { auth, mod } = await fb()
    await subscribe()
    await mod.signInWithPopup(auth, new mod.GoogleAuthProvider())
    markAuthHint()
  }

  const signOut = async () => {
    const { auth, mod } = await fb()
    await mod.signOut(auth)
    clearAuthHint()
    setUser(null)
    setStatus('out')
  }

  return <Ctx.Provider value={{ status, user, signIn, signOut }}>{children}</Ctx.Provider>
}

export const useShellAuth = () => useContext(Ctx)
