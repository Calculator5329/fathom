# Fathom — Vision & Roadmap

_Planned 2026-07-03 by the orchestrating session; implementation handed to Opus + Codex._

## Positioning

Two companion apps, one clean boundary:

- **Fathom (this repo):** everything about *markets and securities*. Backtests, allocations,
  projections, simulations, fundamentals, portfolio analytics. Public, no login for the
  market-data tools; login only where the user stores their own work.
- **finance-master (`C:\Users\et2bo\Desktop\New folder\finance-master`):** everything about
  *Ethan's money*. Net worth, budgets, income, accounts. Private by nature.
- The personal app may LINK into Fathom (e.g. "analyze my brokerage allocation" deep-links a
  Fathom portfolio URL) — it never re-implements market analysis, and Fathom never stores
  account balances. Deep links via the existing URL-state contracts are the integration API.

## Shipped (as of 2026-07-03)

Tool 1 Backtest (any of 65k tickers via on-demand admission; all tabs), Tool 2 Asset Allocation
(1871+, real-returns mode), engine (39 tests), Ledger Dark system, GCS data lake +
Cloud Run API + nightly refresh. Two QA rounds passed.

## Immediate next (order matters)

1. **Firebase Hosting deploy** — `npm run build` in app/, `firebase init hosting` against project
   `ethan-488900`, SPA rewrite to index.html, deploy. Then the whole pipeline is public.
   (Also: pick the real name/domain — "Fathom" is a working title Ethan hasn't ratified.)
2. **Shiller data refresh** — us-monthly ends 2023-06. INVESTIGATED 2026-07-03 (Opus): a fresh
   Yale fetch via the retirement-sim pipeline (cache deleted, re-downloaded from
   econ.yale.edu/~shiller/data/ie_data.xls) STILL parses to 2023-06 / 1830 rows. So this is NOT
   cache staleness — either Yale's public file lags or `retirement-sim/scripts/build-data.ts`
   drops trailing rows with incomplete CAPE/earnings columns. To actually extend: inspect the
   raw ie_data.xls tail and the script's row-completeness filter (it likely requires all derived
   columns present; recent months may lack finalized earnings). LOW priority — 3 years on a
   150-year series. Deferred until someone wants it.
3. **Polish debt:** empty/loading skeletons, mobile audit below 900px, PNG/CSV export on results,
   OG/social meta tags, favicon-quality logo pass.

## Tool 3 — Stock Projections (port of Ethan's existing projections tool)

The first authenticated feature. **Decision: Firestore, not IndexedDB** — reasons: multi-device
sync, durability (IndexedDB dies with a cleared browser), and it cleanly enforces the
public/private boundary (tools 1–2 stay no-login; your saved work requires identity). IndexedDB
remains attractive only for zero-setup privacy; if that matters later, add "local-only mode"
as an option, not the default.

- **Auth:** Firebase Auth, Google sign-in only (one click, no password reset surface). Auth state
  in a thin context; signed-out users see a read-only demo projection with a sign-in CTA.
- **Data model:** `users/{uid}/projections/{ticker}` → `{ ticker, assumptions: { years,
  revenueGrowth, marginPath, sharesChange, exitMultiple }, scenarios: {bear, base, bull},
  notes, createdAt, updatedAt }`. Small docs — well inside Firestore free tier.
- **Screens:** projections list (table: ticker, base-case implied CAGR vs current price, updated);
  editor (assumption sliders + live implied-price/CAGR chart vs today's actual price from our
  data layer); compare view (all your projections' implied CAGRs ranked).
- **Security rules:** per-uid read/write own docs only; write rules validating field types/ranges.
- Port the projection MATH from the existing project (see `context/external-paths.json` engines);
  re-skin entirely in Ledger Dark; state the user story per screen as usual.

## Tool 4 — Monte Carlo (FiCalc-class retirement/withdrawal simulator)

Reuses the allocation datasets + engine. Modes:
- **Historical sequence** (FiCalc's core): run every rolling N-year window since 1871 as its own
  trial; success = portfolio survives withdrawals. Honest about sequence-of-returns risk.
- **Bootstrap Monte Carlo:** resample historical monthly returns (block bootstrap to preserve
  autocorrelation) for thousands of trials.
- **Parametric** (optional later): user-set mean/vol/correlation.

Inputs: allocation (reuse AllocationBuilder), horizon, initial balance, withdrawal strategy
(fixed real, fixed %, VPW, guardrails/Guyton-Klinger), fees, real/nominal. Outputs: success rate,
percentile fan chart (5/25/50/75/95), ending-balance distribution, worst-start-years table,
max-safe-withdrawal solver. All client-side; a Web Worker keeps the UI responsive at 10k trials.
URL-encode the full config like the other tools (shareable scenarios).

## Tool 5 — Fundamentals data layer + ticker pages

"Gather huge amounts of data and display it intuitively" — phase 2.
- **Source decision to make first:** SEC EDGAR `companyfacts` XBRL API (free, official,
  US-listed, messy tags) vs Tiingo fundamentals add-on (clean, paid). Recommendation: prototype
  with EDGAR via a Codex-built normalizer into `fundamentals/{TICKER}.json` in the bucket
  (revenue, EPS, FCF, margins, shares, debt by fiscal year, ~20y); upgrade to paid only if tag
  chaos costs too much.
- **Ticker page** (`/stock/AAPL`): long-run price+fundamentals charts (price vs EPS line, the
  classic), margin/share-count trends, valuation ratios vs their own history (percentile bands),
  dividend record, drawdown history with era annotations (1929/1973/2000/2008 labels — cheap and
  delightful), links: "backtest this", "project this".
- This page becomes the hub that projections (Tool 3) and portfolio x-ray (Tool 6) link into.

## Tool 6 — Portfolio X-ray

Paste or CSV-upload current positions (ticker + shares or weight):
- Blended sector/type weights (catalog types + fundamentals sectors), overlap detection.
- Blended fundamentals (weighted P/E, yield, margin) once Tool 5 exists.
- Each position vs its 52-week high/low; portfolio 1y performance reconstruction.
- **Activity-history upload** (broker CSV): rebuild the actual historical portfolio with the
  engine's flow support → true money-weighted (IRR) and TWR history, per-position contribution.
- **Privacy default: local-first.** Positions parse and analyze entirely client-side
  (IndexedDB cache); "save to account" (Firestore) is opt-in. This is the one place IndexedDB
  IS right — imported brokerage data is the most sensitive thing the app touches.
- One-click handoff: "backtest this allocation" → Tool 1 URL.

## Further ideas (unordered backlog, orchestrator's additions)

- **Efficient-frontier explorer** on the allocation tool (random + optimized weights scatter,
  drag constraints; all client-side from existing covariances).
- **Factor lens:** regress any backtest's monthly returns on Fama-French factors (data already
  in repo) — "your portfolio is 0.9 market / 0.3 size / −0.1 value".
- **Correlation explorer:** rolling correlation matrix heatmap between any tickers/assets.
- **Dividend income planner:** extend the Income tab — forward yield on today's portfolio,
  income calendar by month, dividend-growth history per holding.
- **Research notes:** freeform per-ticker notes attached to the auth'd account; render on ticker
  pages; link projections ↔ notes.
- **Scenario compare permalinks gallery:** a saved-links page (auth'd) of favorite backtests.
- **Simulated leverage** (v1.5 item from PLAN.md): daily return × leverage − borrow − ER with an
  explicit "Simulated" badge; enables 3x-S&P-since-1928 experiments (TQQQ/UPRO already cached
  for validation).
- **PWA/offline** for cached tickers; **PNG/CSV export**; **keyboard palette** (cmd-k ticker
  jump) — very Linear.

## Sequencing recommendation

Hosting deploy → Shiller refresh + polish debt → Tool 3 (auth foundation, small surface) →
Tool 4 Monte Carlo (no new data needed, huge value) → Tool 5 fundamentals (new data program) →
Tool 6 x-ray (depends on 5 for full value) → backlog items opportunistically.

## Guardrails for future work (bind on Opus AND Codex)

- Everything in CLAUDE.md "Non-negotiable invariants" — especially: engine changes require
  fixture + regression tests; tools 1–2 never gain a login wall; series data never enters
  Firestore; URL-state contracts are backward-compatible (old shared links must keep working —
  treat query params as a public API; only ADD params, never rename/repurpose).
- Simulation/projection math must ship with the same rigor as the engine: hand-computed fixtures
  plus a sanity anchor against a known external reference (e.g. Trinity-study ~95% success for
  4% rule / 50-50 / 30y — if our historical-sequence mode disagrees wildly, the code is wrong).
- New data pipelines follow the established pattern: Codex-built stdlib-only script →
  validation stats printed and enforced → canonical JSON in bucket + committed builder script →
  docs/data-notes.md entry with evidence.
- Costs: stay in free tiers deliberately (Tiingo free, GCS pennies, Cloud Run scale-to-zero,
  Firestore free tier). Any feature that would exceed them gets flagged to Ethan BEFORE building.
- Auth surface area minimal: Google provider only, no custom user tables, security rules reviewed
  in the PR that adds any new collection.
