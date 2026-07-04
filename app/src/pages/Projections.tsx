import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LineChart, LogIn, Plus } from 'lucide-react'
import { TickerPicker } from '@/components/backtest/TickerPicker'
import { Button } from '@/components/ui/button'
import { AuthProvider, useAuth } from '@/auth/AuthContext'
import { formatUsd } from '@/lib/format'
import { baseCagr } from '@/projections/chart'
import { defaultScenarios, projectScenario, type Projection } from '@/projections/model'
import { ProjectionEditor } from '@/projections/ProjectionEditor'
import {
  deleteProjection,
  saveProjection,
  subscribeProjections,
} from '@/projections/store'
import { usePrice } from '@/projections/usePrice'

/**
 * Tool 3 — Stock Projections. The first authenticated feature.
 * Story: "Model a stock's future value under bear/base/bull assumptions,
 * see the implied return vs today's real price, and save my thesis."
 * Tools 1–2 stay public; this one requires sign-in to persist work.
 */

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`

function freshProjection(ticker: string, currentPrice: number): Projection {
  const now = Date.now()
  return {
    ticker: ticker.toUpperCase(),
    inputs: { baseRevenue: 1000, netIncome: 150, sharesOut: 100, currentPrice, horizonYears: 5 },
    scenarios: defaultScenarios(),
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}

// A pre-filled projection so signed-out visitors see the tool working.
const DEMO: Projection = {
  ticker: 'AAPL',
  inputs: { baseRevenue: 391000, netIncome: 94000, sharesOut: 15000, currentPrice: 210, horizonYears: 5 },
  scenarios: {
    bear: { revenueGrowth: 0.02, netMargin: 0.22, exitPe: 20, dividendYield: 0.005, buybackYield: 0.02 },
    base: { revenueGrowth: 0.08, netMargin: 0.26, exitPe: 30, dividendYield: 0.005, buybackYield: 0.03 },
    bull: { revenueGrowth: 0.13, netMargin: 0.29, exitPe: 36, dividendYield: 0.005, buybackYield: 0.03 },
  },
  notes: '',
  manualPrice: false,
  createdAt: 0,
  updatedAt: 0,
}

/**
 * AuthProvider is scoped to this route (not the whole app in main.tsx) so the
 * Firebase SDK loads only inside this lazy chunk — keeping firebase off the
 * landing/backtest/allocation pages.
 */
export function Projections() {
  return (
    <AuthProvider>
      <ProjectionsInner />
    </AuthProvider>
  )
}

function ProjectionsInner() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTicker = searchParams.get('ticker')?.toUpperCase() || null
  const [saved, setSaved] = useState<Projection[]>([])
  const [savedLoaded, setSavedLoaded] = useState(false)
  const [draft, setDraft] = useState<Projection | null>(null)
  const [baseline, setBaseline] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [pickingNew, setPickingNew] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)

  const { info } = usePrice(draft?.ticker ?? requestedTicker)

  // Subscribe to the signed-in user's saved projections.
  useEffect(() => {
    if (!user) {
      setSaved([])
      setSavedLoaded(false)
      return
    }
    return subscribeProjections(
      user.uid,
      (list) => {
        setSaved(list)
        setSavedLoaded(true)
      },
      (err) => console.error(err),
    )
  }, [user])

  const dirty = draft ? JSON.stringify(draft) !== baseline : false

  const openDraft = (p: Projection) => {
    setDraft(p)
    setBaseline(JSON.stringify(p))
    setPickingNew(false)
  }

  // Deep-link from Research ("Project" on a ticker): open the existing
  // projection or create a fresh draft, once saved projections have loaded.
  useEffect(() => {
    if (!user || !requestedTicker || !savedLoaded || draft) return
    const existing = saved.find((p) => p.ticker === requestedTicker)
    openDraft(existing ?? freshProjection(requestedTicker, info?.price ?? 0))
    setSearchParams({}, { replace: true }) // consume the param
  }, [user, requestedTicker, savedLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSave = async () => {
    if (!user || !draft) return
    setSaving(true)
    try {
      // Persist with live price unless the thesis explicitly uses a manual quote.
      const livePrice = Number.isFinite(info?.price) && (info?.price ?? 0) > 0 ? info?.price : null
      const toSave = {
        ...draft,
        inputs: {
          ...draft.inputs,
          currentPrice: draft.manualPrice ? draft.inputs.currentPrice : livePrice ?? draft.inputs.currentPrice,
        },
      }
      await saveProjection(user.uid, toSave)
      setBaseline(JSON.stringify(toSave))
      setDraft(toSave)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!user || !draft) return
    await deleteProjection(user.uid, draft.ticker)
    setDraft(null)
  }

  const doSignIn = async () => {
    setSignInError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Sign-in failed')
    }
  }

  if (authLoading) {
    return <div className="px-6 py-16 text-sm text-muted-foreground">Loading…</div>
  }

  // ---- Signed-out: interactive demo + sign-in CTA ----
  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex flex-col items-start gap-4 rounded-xl border bg-surface-1 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <LineChart className="size-6 text-primary" />
              Stock projections
            </h1>
            <p className="mt-1 max-w-xl text-muted-foreground">
              Model bear / base / bull cases for any stock and see the implied
              return against today's real price. Sign in to save your theses —
              backtesting and allocation stay free and account-free.
            </p>
          </div>
          <Button onClick={doSignIn}>
            <LogIn />
            Sign in with Google
          </Button>
        </div>
        {signInError && <p className="mb-4 text-sm text-loss">{signInError}</p>}
        <p className="mb-3 text-sm text-muted-foreground">
          Try it below — a sample Apple projection. Changes won't be saved until you sign in.
        </p>
        <DemoEditor />
      </div>
    )
  }

  // ---- Signed-in: list rail + editor ----
  const ranked = [...saved].sort((a, b) => baseCagr(b) - baseCagr(a))

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col px-6 lg:flex-row">
      <aside className="border-b py-6 lg:w-72 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-8 lg:pr-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-semibold tracking-tight">Projections</h1>
          <Button variant="ghost" size="icon-sm" aria-label="New projection" onClick={() => setPickingNew(true)}>
            <Plus />
          </Button>
        </div>

        {pickingNew && (
          <div className="mb-4">
            <TickerPicker
              exclude={saved.map((p) => p.ticker)}
              autoFocus
              onPick={(entry) => {
                const existing = saved.find((p) => p.ticker === entry.ticker)
                openDraft(existing ?? freshProjection(entry.ticker, 0))
              }}
            />
          </div>
        )}

        {ranked.length === 0 && !pickingNew && (
          <p className="text-sm text-muted-foreground">
            No projections yet. Hit + to model your first stock.
          </p>
        )}

        <ul className="space-y-1">
          {ranked.map((p) => {
            const c = baseCagr(p)
            return (
              <li key={p.ticker}>
                <button
                  type="button"
                  onClick={() => openDraft(p)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-2 ${
                    draft?.ticker === p.ticker ? 'bg-surface-2' : ''
                  }`}
                >
                  <span className="font-mono font-medium">{p.ticker}</span>
                  <span className={`font-mono text-sm tnum ${c < 0 ? 'text-loss' : 'text-gain'}`}>
                    {pct(c)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-8 border-t pt-4">
          <div className="truncate text-sm text-muted-foreground" title={user.email ?? ''}>
            {user.email}
          </div>
          <Button variant="ghost" size="sm" className="mt-1 -ml-2 text-muted-foreground" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 py-6 lg:py-8 lg:pl-8">
        {draft ? (
          <ProjectionEditor
            key={draft.ticker}
            draft={draft}
            currentPrice={Number.isFinite(info?.price) && (info?.price ?? 0) > 0 ? info?.price ?? null : null}
            priceAsOf={info?.asOf ?? null}
            onChange={setDraft}
            onSave={onSave}
            onDelete={saved.some((p) => p.ticker === draft.ticker) ? onDelete : null}
            saving={saving}
            dirty={dirty}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <LineChart className="mb-3 size-8 opacity-40" />
            <p>Select a projection or model a new stock.</p>
          </div>
        )}
      </main>
    </div>
  )
}

/** Standalone interactive editor for signed-out visitors (no persistence). */
function DemoEditor() {
  const [draft, setDraft] = useState<Projection>(DEMO)
  const { info } = usePrice(draft.ticker)
  const { signInWithGoogle } = useAuth()
  const outcome = projectScenario(
    { ...draft.inputs, currentPrice: draft.manualPrice ? draft.inputs.currentPrice : info?.price ?? draft.inputs.currentPrice },
    draft.scenarios.base,
  )
  return (
    <>
      <ProjectionEditor
        draft={draft}
        currentPrice={draft.manualPrice ? null : info?.price ?? draft.inputs.currentPrice}
        priceAsOf={info?.asOf ?? null}
        onChange={setDraft}
        onSave={() => signInWithGoogle().catch(() => {})}
        onDelete={null}
        saving={false}
        dirty
      />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Base case implies {pct(outcome.totalCagr)}/yr to{' '}
        {formatUsd(outcome.targetPrice)}. Sign in to save this.
      </p>
    </>
  )
}
