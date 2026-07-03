import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { Backtest } from './pages/Backtest'
import { Landing } from './pages/Landing'
import { Styleguide } from './pages/Styleguide'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <Link to="/" className="font-mono text-base font-semibold tracking-tight">
            fathom
          </Link>
          <NavLink
            to="/backtest"
            className={({ isActive }) =>
              `text-sm transition-colors ${
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            Backtest
          </NavLink>
          <span className="cursor-default text-sm text-muted-foreground/50">
            Asset allocation
            <span className="ml-2 rounded border px-1.5 py-0.5 font-mono text-xs">soon</span>
          </span>
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
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/styleguide" element={<Styleguide />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
