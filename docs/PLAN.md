# Stock Analysis Project — Master Plan

_Last updated: 2026-07-02_

A personal, public (no-login) suite of finance tools. Linear-inspired dark design, minimal and intentional — every screen has one job and a written user story. Hosted on Google Cloud with daily auto-updating price data.

**Tool 1 (build first):** Ticker portfolio backtester — any stock / ETF / mutual fund, max available history, dividends + splits, in-depth analysis, up to 3 portfolios compared.
**Tool 2 (next):** Asset-allocation backtester over ~100–150 years of asset-class data (no tickers — long-history series only).
**Roadmap:** stock projections, Monte Carlo simulation, portfolio trackers, ideas ported from other finance projects.

---

## 1. Design system — "Ledger Dark"

Linear's recipe, adapted: near-black canvas (never pure `#000`), a ladder of slightly-lighter surfaces, hairline borders instead of shadows, **one** chromatic accent used sparingly, tight readable typography. Colors tuned in LCH space for perceptual uniformity.

### Tokens

| Token | Value (draft) | Use |
|---|---|---|
| `--canvas` | `#0A0C0B` | Page background — near-black with a faint green cast (Linear's cast is blue; ours is green — first differentiator) |
| `--surface-1..4` | `#101312` → `#151918` → `#1A1F1D` → `#202624` | Cards, hovered tiles, dropdowns, modals (each lift = one step up) |
| `--border` | `rgba(255,255,255,0.07)` | Hairline borders carry hierarchy; almost no drop shadows |
| `--accent` | `#34D39A` (desaturated emerald, LCH-tuned) | Primary action, focus rings, active states, Portfolio 1 chart line. Never a background flood |
| `--negative` | `#F87171` desaturated | Losses/drawdowns. Gains reuse `--accent` — palette stays two-chromatic max |
| `--text-primary` | `#ECEFED` | Headings, key numbers |
| `--text-secondary` | ≥ `#9CA3AF` | Never darker (WCAG AA on canvas) |

### Typography

- **UI:** Inter or Geist. **Body 16px minimum, absolute floor 15px** (`--text-min`) — readability is a hard rule, not a preference.
- **Numbers:** `font-variant-numeric: tabular-nums` everywhere — the single detail that makes finance tables feel professional.
- **Mono** (JetBrains Mono / Geist Mono): tickers, dates, metric values.
- Line height 1.5 for text; tight tracking on display sizes only.

### Spacing & motion

- Strict 8px spacing scale. Charts get generous padding; zero chartjunk.
- Motion: 150–200ms ease-out; enter = fade + 4px slide. No decorative animation.
- Contextual controls: row actions on hover/focus, secondary portfolios behind a ghost "+" button, advanced options collapsed.

### UX principles (enforced per screen)

1. **Progressive disclosure** — first-time user sees ≤ 7 interactive elements per screen; everything else appears when needed.
2. **Smart defaults over configuration** — typing a single ticker must produce a great backtest (max range, $10k start, dividends reinvested, annual rebalance).
3. **Immediate feedback** — results recompute live on tweak; skeleton loaders, never a spinner on a blank page.
4. **Recognition over recall** — ticker autocomplete with name + type badge (Stock / ETF / Fund / Leveraged); recent tickers surfaced.
5. **One job per screen** — user story written at the top of each screen spec; any element that doesn't serve it gets cut.
6. **Readable density** — AA contrast, charts legible without hover.

---

## 2. Architecture (GCP, no login)

```
Browser — React SPA (Firebase Hosting + CDN)
   │  HTTPS/JSON
Cloud Run — API (Node/TypeScript): ticker search, on-demand new-ticker fetch
   │
Firestore — ticker metadata + search index (small docs only)
Cloud Storage — one JSON per ticker: full daily series (close, adjClose,
   │            divCash, splitFactor). A full series can exceed Firestore's
   │            1 MB doc limit, so series NEVER go in Firestore.
   ▲
Cloud Scheduler — nightly job (~6pm ET weekdays)
   └─> Cloud Run job: append latest day for every cached ticker (Tiingo)
```

- **Stack:** Vite + React + TypeScript + Tailwind + shadcn/ui (replaces the vanilla starter in `stock-analysis/`).
- **Cache-through data flow:** first request for a ticker → fetch full history from Tiingo → store in Firestore → serve. All later requests are cache hits (zero API calls). Nightly job appends one day per cached ticker. Tiingo free-tier limits (~50 symbols/hr, 1000 req/day) only ever throttle brand-new tickers.
- **Backtest math runs client-side.** API serves raw series; React computes returns/rebalancing/drawdowns. Cloud Run stays nearly idle (pennies/month), slider tweaks are instant, and the whole backtest is encoded in the URL — `?p1=VTI:60,BND:40&start=1993-06&rebal=annual`. **Shareable URLs are the no-login substitute for saved portfolios.**
- **Abuse protection:** light per-IP rate limit on the "new ticker" path only (protects the Tiingo quota).
- **Secrets:** Tiingo API key in GCP Secret Manager, never in the repo.

---

## 3. Data strategy

### Seed from the existing local archive (do this first)

`context/external-paths.json` → `master-site/public/stock-data/`: **1,570 ticker JSONs, ~1 GB**, daily records `{Date, Close, Dividends, Stock Splits}` (e.g. SPY from 1993-01 onward). Plan:

1. **One-time ingest script:** bulk-load all 1,570 tickers into Firestore. No Tiingo calls needed for history we already have.
2. **Staleness backfill:** archive ends **~2025-03-24**. Backfill 2025-03 → present from Tiingo for each ticker (well within free limits spread over a few nights, or one paid month to do it in a day).
3. ⚠️ **Adjustment semantics — verify before ingest:** archive `Close` values look dividend/split-adjusted (yfinance `auto_adjust=True` style: SPY 1993 ≈ 24.45 vs actual ~43), yet Dividends/Splits columns are also present. During ingest, reconcile against Tiingo on an overlap window and normalize to one canonical schema: **unadjusted close + adjusted close + dividend + split factor per day**. Getting this wrong silently corrupts every backtest — it's the first engineering task and gets unit tests against known references.

### Ongoing source: Tiingo (free tier)

Clean error-checked EOD data, 65k+ US stocks/ETFs/mutual funds, decades of history, dividends and splits included. New tickers fetched on demand; nightly refresh for cached ones.

### Reference data already in-repo (`context/reference-data/`) — powers Tool 2

| File | Contents |
|---|---|
| `shiller/shiller.csv` | Normalized monthly `spReturn, bondReturn, cashReturn, cpi` from **1871** — already backtest-ready |
| `asset-classes/data.csv`, `ie_data.xls` | Shiller "Irrational Exuberance" source data (prices, dividends, earnings, CAPE, rates from 1871) |
| `asset-classes/JSTdatasetR6.xlsx` | Jordà-Schularick-Taylor macrohistory — ~150 years, 18 countries, equity/housing/bond/bill returns |
| `asset-classes/Portfolios_Formed_on_ME.csv` | Fama-French size portfolios, monthly from **1926** (CRSP 2025-10 vintage) |
| `asset-classes/STKDATD.DAT` | Daily US market returns from **1885** (Schwert-style) |
| `asset-classes/chapt26 (1).xlsx` | Chapter 26 reference data |

Tool 2 needs **no API at all**: preprocess these once into static JSON served with the app.

Related engines to port ideas from (paths in `external-paths.json`): `stock-backtest-2`, `finance-master` backtest UI, `retirement-sim` simulation engine.

---

## 4. Tool 1 — Portfolio Backtester: screens & user stories

### Screen A — Landing / tool hub
> _"I want to immediately understand what this site does and jump into a tool in one click."_

One-sentence hero, two tool cards (Backtester live; Asset Allocation "coming soon"), nothing else. First impression of the theme.

### Screen B — Backtest builder
> _"I want to define 1–3 portfolios of tickers with weights and a time range in under 30 seconds."_

- Ticker autocomplete rows: ticker, name, type badge, weight %. Weights auto-balance; inline validation when ≠ 100%.
- Portfolios 2–3 appear via ghost "+ Compare another portfolio" button.
- Date range defaults to **max common history**, with the limiting ticker named: _"Limited by QQQ, inception Mar 1999."_
- Collapsed **Advanced**: initial amount, monthly contribution/withdrawal, rebalancing (none / annual / quarterly / monthly / bands), dividend reinvestment toggle, inflation adjustment, benchmark picker.

### Screen C — Results
> _"I want to judge these portfolios' performance and risk at a glance, then dig arbitrarily deep."_

- Metric summary cards per portfolio: Final value, CAGR, Volatility, Max Drawdown, Sharpe — big readable numbers.
- Growth-of-$10k chart (log toggle) + drawdown chart sharing the x-axis.
- Depth tabs: **Annual returns** (table + bars) · **Rolling returns** (1/3/5/10y) · **Risk** (Sortino, best/worst year, correlation matrix) · **Income** (dividend history, yield-on-cost over time) · **Holdings** (per-ticker contribution; splits/dividend event timeline).
- Builder docks as a collapsible left panel — tweak → instant recompute.
- "Copy link" reproduces the entire backtest from the URL.

### Metrics engine (v1)

Total return, CAGR, annualized volatility, Sharpe, Sortino, max drawdown + recovery time, best/worst year, rolling returns, correlations, real (CPI-adjusted) variants. Pure TypeScript module, **unit-tested against Portfolio Visualizer outputs** (e.g. 60/40 VTI/BND) before any UI work.

Open math decisions to settle during build: dividend timing (pay-date reinvest at close), rebalancing execution price, month- vs day-granularity for contributions.

### v1.5 — Simulated leverage

Real leveraged ETFs only reach ~2006–2009. Add simulated leverage: daily underlying return × leverage − borrowing cost − ER, with an explicit **"Simulated"** badge. Enables "3x S&P since 1928" style tests.

---

## 5. Tool 2 — Asset-Allocation Backtester (preview)

- Asset classes, not tickers: US stocks, long/intermediate bonds, bills/cash, gold, international where data supports (JST), size premia (Fama-French) — each with explicit start year shown.
- Same builder/results architecture and UI as Tool 1 (reuse everything); monthly granularity; 100–150 year ranges.
- Static preprocessed JSON — no backend dependency.

## 6. Roadmap (later)

Stock projections tool · Monte Carlo simulation (port from `retirement-sim` engine) · portfolio tracker · ideas from `finance-master` / `stock-backtest-2`.

---

## 7. Build order

1. **Design foundation** — Tailwind theme tokens + styleguide page; scaffold Vite + React + shadcn (replace vanilla starter).
2. **Data ingest** — archive → Firestore loader; adjustment-semantics reconciliation; Tiingo backfill 2025-03 → now; nightly Cloud Scheduler job; ticker search endpoint.
3. **Backtest engine** — pure TS, unit-tested against known references.
4. **Screens** — Builder + Results core, then depth tabs.
5. **Ship Tool 1**, then Tool 2, then roadmap.

## 8. Setup checklist (user)

- [ ] GCP project created, billing enabled; APIs: Cloud Run, Firestore, Cloud Scheduler, Secret Manager
- [ ] `gcloud` CLI installed + authenticated locally
- [ ] Tiingo account (free) + API token
- [ ] Firebase Hosting decision confirmed (or Cloud Storage + LB)
- [ ] Site name / domain (TBD — pick before Tool 1 ships)
