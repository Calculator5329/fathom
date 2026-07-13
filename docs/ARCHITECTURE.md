# Fathom — Architecture

_Handoff reference, written 2026-07-05. Verified against the repo at commit `5327ab3`
(129/129 vitest tests green, `tsc -b` clean). For product history and binding decisions see
[VISION.md](VISION.md); for data provenance see [data-notes.md](data-notes.md)._

## What Fathom is

Fathom is a public market-analysis suite, live at **https://ethan-488900.web.app**
(source: https://github.com/Calculator5329/fathom, AGPL-3.0). Six tools: **Backtest**
(up to three ticker portfolios, full history, URL-as-state shareable links), **Asset
allocation** (asset-class mixes backtested 1871→present on Shiller/FRED data),
**Monte Carlo** (retirement simulation — historical-sequence and block-bootstrap, four
withdrawal strategies including Guyton-Klinger, Trinity-validated), **Research**
(SEC EDGAR fundamentals and valuation-over-time per stock), **Projections**
(bear/base/bull scenario modeling, the only auth'd tool), and **X-ray** (reconstructs
real TWR/IRR from broker CSV exports, entirely client-side).

It is a portfolio-quality solo project with an unusually strict engineering discipline
around its portfolio-math engine (see "The engine" below). The companion app
**finance-master** (`~/projects/finance/finance-master`) owns personal
money — budgets, net worth, accounts. The boundary is hard: Fathom never stores personal
account balances; finance-master never re-implements market analysis. Integration is
deep links via Fathom's URL-state contracts (query params are a public API — only add
params, never rename/repurpose).

Design language is **Ledger Dark** (tokens in `app/src/index.css`): near-black green-cast
canvas, one emerald accent, dense cards, 15px text floor, tabular numerals everywhere.
Rules are enumerated in root `CLAUDE.md` — they are enforced preferences, not suggestions.

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | Vite 8 + React 19 + TypeScript ~6 (strict) + Tailwind v4 + shadcn/radix, ECharts 6 (tree-shaken), react-router 7, cmdk palette, sonner toasts |
| Auth / per-user data | Firebase Auth (Google only) + Firestore, lazily imported — scoped to `/projections` so signed-out visitors never download the SDK |
| Serving | Firebase Hosting (SPA rewrite, `app/dist`), public GCS bucket `ethan-488900-fathom-data` for series/fundamentals JSON (gzip-at-rest) |
| API | `server/` — Cloud Run service `fathom-api` (us-central1), Node 22 ESM, single dep `@google-cloud/storage` |
| Data pipeline | `scripts/*.mjs` — Node 22 ESM, stdlib only |
| Tests | vitest 4 (`app/`), oxlint |
| Cloud | GCP project `ethan-488900`; Cloud Scheduler `fathom-nightly-refresh` (10:30pm ET weekdays); secrets in Secret Manager (`tiingo-token`, `fathom-refresh-token`) |

## Directory map

```
app/                    the whole product (Vite root)
  src/engine/           THE backtest engine — pure TS, zero deps, fully unit-tested
                        (align, backtest, metrics, frontier, types + __tests__)
  src/montecarlo/       simulation engine + Web Worker
  src/xray/             broker-CSV parsing (parse), TWR/IRR reconstruction (analyze),
                        insights, fathom.portfolio master-file export (masterfile)
  src/fundamentals/     EDGAR data loaders + share-basis normalization
  src/projections/      Tool 3 model (pure, tested), Firestore store, editor
  src/factors/          Fama-French factor regression
  src/data/             catalog + series loaders (local public/data in dev,
                        GCS via VITE_DATA_BASE_URL in prod), asset-class adapter
  src/auth/             AuthContext — scoped to /projections route, keep it there
  src/lib/              urlCodec.ts (shared URL-state primitives), firebase.ts
                        (public web config — safe in client), cssVar helper
  src/pages/            one file per route: / /backtest /allocation /projections
                        /montecarlo /stock/:symbol /links /xray /styleguide + 404
  src/components/ui/    shadcn components (calendar has a custom portal-free
                        CaptionDropdown — reuse for any dropdown inside a popover)
server/                 Cloud Run API: /api/health, /api/search, /api/ticker/:SYM
                        (admits unknown tickers: Tiingo → bucket → catalog, with
                        GCS generation-precondition retries), /api/refresh (token-gated)
scripts/                data pipeline (see below)
data/                   asset-class JSONs committed; data/tickers/ + data/fundamentals/
                        gitignored — source of truth is the GCS bucket
docs/                   VISION.md (living roadmap + decisions), HANDOFF_ROADMAP.md,
                        IDEAS.md, data-notes.md, PLAN.md (original spec), HANDOFF.md
context/                Ethan's reference datasets — read-only, uncommitted
stock-analysis/         dead starter — ignore, never touch
```

Ethan's pre-existing, deliberately-uncommitted files (never edit or commit): root
`README.md` is his but committed; `DATA_SOURCES_*.md`, `SOURCE_PROJECTS.md`,
`docs/{changelog,roadmap,tech_spec}.md`, `context/`, `stock-analysis/`, root
`package-lock.json` are untracked on purpose. `docs/roadmap.md` is his stale
pre-project draft — the living roadmap is `docs/VISION.md` + `docs/HANDOFF_ROADMAP.md`.

## Data pipelines

Canonical price schema everywhere: `{date: 'yyyy-mm-dd', close, adjClose, divCash,
splitFactor}` (floats, 6dp). Monthly asset-class schema: `data/asset-classes/*.json`.

1. **Ticker prices** — `node scripts/fetch-tiingo.mjs SPY QQQ ...` (needs `TIINGO_API_TOKEN`
   in gitignored root `.env`; free tier ≈50 unique symbols/hour, 1000 req/day, scripts
   self-throttle). Output `data/tickers/<T>.json` → synced to GCS. ~75 tickers full-history.
   **Nightly refresh is a FULL refetch per ticker, never append** — adjusted closes rebase
   on every dividend; appending silently corrupts history.
2. **Catalog** — `node scripts/build-catalog.mjs`. Unknown tickers are also admitted
   on demand at runtime by `fathom-api` (Tiingo → bucket → catalog).
3. **Fundamentals** — `node scripts/build-fundamentals.mjs`: SEC EDGAR companyfacts →
   per-year revenue/income/margins/EPS/shares/FCF/dividends/debt → `fundamentals/` in the
   bucket. EDGAR mixes as-reported and split-restated share counts; the share-basis
   normalization in `app/src/fundamentals/` is the defense — read it before touching.
   Also fetched on ticker admission + weekly refresh.
4. **Asset classes 1871+** — Shiller/Yale source is abandoned (ends 2023-06);
   `node scripts/extend-asset-classes.mjs` splices 2023-07→present from SPY total return
   + FRED (GS10, NSA CPI) with byte-identity assertions on the frozen history, boundary
   continuity checks, and a CAGR invariant band. `scripts/build-shiller.mjs` documents
   the original formulas. Read `docs/data-notes.md` before any data work.
5. **Factors** — `node scripts/build-ff-factors.mjs` (Ken French library, FF 3-factor + RF).
6. **Bucket sync** (cloud access required):
   `gcloud storage cp --cache-control="public, max-age=3600" data/tickers/*.json app/public/data/tickers/catalog.json gs://ethan-488900-fathom-data/tickers/`

## The engine and its testing discipline

`app/src/engine/` is treated as sacred. All portfolio math lives there and ONLY there.
Every metric is computed from a time-weighted return index (Portfolio Visualizer
conventions; monthly returns ×√12 for vol/Sharpe/Sortino), never from raw values when
cash flows exist; IRR is computed separately.

**Any change to the engine requires:** (a) unit tests against hand-computed fixtures,
and (b) the real-data golden regressions staying green — SPY 1994–2023 CAGR ≈ 10%, GFC
drawdown −50..−58% troughing 2009-03, US stocks 1871–2023 real CAGR ≈ 6.9%. Simulation
and projection math carry the same rigor, anchored to external references (Monte Carlo
is Trinity-validated: ~95% success for 4% / 50-50 / 30y).

## Run / test / build / deploy

```bash
# dev (from app/; port 5173 may be taken — vite reads process.env.PORT, autoPort on)
cd app && npm install
echo VITE_DATA_BASE_URL=https://storage.googleapis.com/ethan-488900-fathom-data/ > .env.local
npm run dev

# verify — BOTH must pass before every commit (from app/)
npx vitest run
npx tsc -b

# build + deploy (deploy needs firebase CLI auth — cloud access)
npm run build                      # from app/ (tsc -b && vite build)
firebase deploy --only hosting     # from repo root; project ethan-488900
firebase deploy --only firestore   # rules only, when firestore.rules changes

# server deploy (cloud access; see git log for full flags)
gcloud run deploy fathom-api --source server ...
```

## Known limitations / tech debt

- **Shiller/Yale series is dead upstream** — the 1871+ history now depends on the
  SPY-TR + FRED splice; provenance documented, but it is a formula change vs Yale.
- **Fundamentals coverage** — full pipeline works for any US stock, but it is pre-built
  only for the catalog set; new tickers get fundamentals on admission.
- **X-ray parses Fidelity CSV formats only** (positions + activity). Other brokers
  (Schwab, Vanguard, Robinhood) unsupported.
- **Efficient frontier is two-asset only** (allocation tool).
- Monte Carlo follow-ups not done: parametric mode, nominal display toggle (sim is
  correctly real-only).
- **No CI** — vitest/tsc run locally by convention only; a GitHub Actions workflow
  would make the discipline mechanical.
- `useUrlSyncedState` was deliberately NOT built (see VISION.md 2026-07-04 §5) —
  the three pages' PUSH/REPLACE semantics differ by design; don't "unify" them.
- The repo is **public** (AGPL); secrets live in Secret Manager and gitignored `.env` —
  never commit tokens, and remember anything pushed is world-readable.
