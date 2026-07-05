import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { Landing } from './pages/Landing'

// Route-level code splitting: ECharts (~400KB) and the engine load only when
// a tool page is visited, keeping the landing page instant.
const Backtest = lazy(() => import('./pages/Backtest').then((m) => ({ default: m.Backtest })))
const Allocation = lazy(() => import('./pages/Allocation').then((m) => ({ default: m.Allocation })))
const Projections = lazy(() => import('./pages/Projections').then((m) => ({ default: m.Projections })))
const Montecarlo = lazy(() => import('./pages/Montecarlo').then((m) => ({ default: m.Montecarlo })))
const Stock = lazy(() => import('./pages/Stock').then((m) => ({ default: m.Stock })))
const Links = lazy(() => import('./pages/Links').then((m) => ({ default: m.Links })))
const Xray = lazy(() => import('./pages/Xray').then((m) => ({ default: m.Xray })))
const Styleguide = lazy(() => import('./pages/Styleguide').then((m) => ({ default: m.Styleguide })))

// Warm the ticker catalog at boot so the first picker interaction is instant.
import { loadCatalog } from './data/catalog'
loadCatalog()

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm transition-colors ${
    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
  }`

function Shell({ children }: { children: React.ReactNode }) {
  // "/" focuses the nearest ticker/asset search input (Linear-style).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const input = document.querySelector<HTMLInputElement>(
        'input[placeholder*="ticker" i], input[placeholder*="Search" i], input[placeholder*="asset" i]',
      )
      if (input) {
        e.preventDefault()
        input.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-7xl items-center gap-4 overflow-x-auto px-6 sm:gap-6">
          <Link to="/" className="font-mono text-base font-semibold tracking-tight">
            fathom
          </Link>
          <NavLink to="/backtest" className={navLinkClass}>
            Backtest
          </NavLink>
          <NavLink to="/allocation" className={navLinkClass}>
            Asset allocation
          </NavLink>
          <NavLink to="/projections" className={navLinkClass}>
            Projections
          </NavLink>
          <NavLink to="/montecarlo" className={navLinkClass}>
            Monte Carlo
          </NavLink>
          <NavLink to="/stock" className={navLinkClass}>
            Research
          </NavLink>
          <NavLink to="/xray" className={navLinkClass}>
            X-ray
          </NavLink>
          <NavLink to="/links" className={navLinkClass}>
            Links
          </NavLink>
        </nav>
      </header>
      {children}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Suspense fallback={<div className="px-6 py-16 text-sm text-muted-foreground">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/allocation" element={<Allocation />} />
          <Route path="/projections" element={<Projections />} />
          <Route path="/montecarlo" element={<Montecarlo />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/stock/:symbol" element={<Stock />} />
          <Route path="/links" element={<Links />} />
          <Route path="/xray" element={<Xray />} />
            <Route path="/styleguide" element={<Styleguide />} />
          </Routes>
        </Suspense>
        <Toaster position="bottom-right" />
      </Shell>
    </BrowserRouter>
  )
}
