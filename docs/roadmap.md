# Roadmap

> **SUPERSEDED (2026-07-10)** — Pre-build draft from 2026-07-02. The living roadmap is
> [HANDOFF_ROADMAP.md](HANDOFF_ROADMAP.md); decision history in [VISION.md](VISION.md).
> Items below were checked off against the shipped Fathom app (React + ECharts + GCS +
> Cloud Run — not the MobX/Recharts sketch). Do not execute new work from this file.

## Vision

Portfolio allocation backtester (PortfolioVisualizer-style) with two modes:

1. **Ticker backtest** — stocks, ETFs, mutual funds with dividends and splits
2. **Asset-class backtest** — 150+ year monthly series (Shiller, factor portfolios)

Stack: Vite frontend + Google Cloud Run backend.

---

## Phase 0 — Context & planning ✅

- [x] Document ticker data sources (`DATA_SOURCES_TICKERS.md`)
- [x] Document asset-class sources (`DATA_SOURCES_ASSET_CLASSES.md`)
- [x] Index related projects (`SOURCE_PROJECTS.md`)
- [x] Copy small reference datasets into `context/`
- [x] Project README and tech spec

## Phase 1 — Backend foundation ✅ (shipped as `server/` + GCS bucket)

- [x] Cloud Run service skeleton (Node — `fathom-api` in `server/`)
- [x] Object storage layout for ticker JSON / parquet bars (GCS `ethan-488900-fathom-data`)
- [x] Ingest job: master-site stock-data → storage (Tiingo fetch + nightly refresh)
- [x] API: list symbols, get OHLCV + corporate actions, get asset-class returns

## Phase 2 — Backtest engine ✅

- [x] Port/adapt engine from `stock-backtest-2` (ticker mode) — now `@calculator-5329/backtest-engine`
- [x] Monthly asset-class simulator from Shiller normalized returns
- [x] Shared metrics: CAGR, max drawdown, Sharpe, volatility
- [x] Rebalancing + DCA options

## Phase 3 — Frontend (Vite) ✅ (React hooks + URL state, not MobX)

- [x] Portfolio builder, backtest config, results (URL-synced state; no MobX)
- [x] Mode toggle: Ticker vs Asset Class (`/backtest`, `/allocation`)
- [x] Charts (ECharts — not Recharts)
- [x] Benchmark overlay (SPY / Shiller equity)

## Phase 4 — Data quality & coverage (partial)

- [x] Extend universe beyond master-site snapshot (Tiingo on-demand admission + nightly refresh)
- [ ] Mutual fund coverage audit
- [x] Persist dividends/splits in backend (canonical JSON: `divCash`, `splitFactor`)
- [ ] FRED integration for bond/cash series (deferred — see VISION.md 2026-07-04)

## Phase 5 — Production (partial)

- [x] Auth (optional) — Firebase Google auth for `/projections` only
- [x] Saved portfolios / scenarios — shareable URLs + Firestore projections
- [ ] CI, deploy pipeline — Firebase Hosting + Cloud Run deployed; GitHub Actions CI still open (see HANDOFF_ROADMAP.md)

---

## Out of scope (for now)

- Personal budget / net worth (finance-master)
- Live trading or brokerage integration
- Tiingo/Polygon (no existing pipeline)

- [ ] [lost] Reconcile three shipped-but-unchecked HANDOFF_ROADMAP items (added via Visions, 2026-07-19)

- [ ] [lost] Execute the approved D8 archive of finance/stock-analysis-project (added via Visions, 2026-07-19)
