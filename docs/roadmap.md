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

- [x] <!-- workspace:id=work:eeaf6471-7aab-5a39-b632-096a70ae87c5 --> Document ticker data sources (`DATA_SOURCES_TICKERS.md`)
- [x] <!-- workspace:id=work:66ef56de-9216-5211-9f5f-0db31fdb8097 --> Document asset-class sources (`DATA_SOURCES_ASSET_CLASSES.md`)
- [x] <!-- workspace:id=work:b569f6ef-1ad0-5027-942d-3d56dbc4601c --> Index related projects (`SOURCE_PROJECTS.md`)
- [x] <!-- workspace:id=work:5d8d29db-2411-5d06-ba5f-07fd3cba296d --> Copy small reference datasets into `context/`
- [x] <!-- workspace:id=work:4689459b-01e5-5a8e-8a2c-3b9727244187 --> Project README and tech spec

## Phase 1 — Backend foundation ✅ (shipped as `server/` + GCS bucket)

- [x] <!-- workspace:id=work:7022f09d-0a1c-53e4-bc1d-662cab62c118 --> Cloud Run service skeleton (Node — `fathom-api` in `server/`)
- [x] <!-- workspace:id=work:456b1b28-55a0-515a-a5ba-2b4ebd9d4c63 --> Object storage layout for ticker JSON / parquet bars (GCS `ethan-488900-fathom-data`)
- [x] <!-- workspace:id=work:bbcfe8d0-c86c-5723-af68-6e892c6651a4 --> Ingest job: master-site stock-data → storage (Tiingo fetch + nightly refresh)
- [x] <!-- workspace:id=work:c893b1ca-0af7-5fd5-8078-67f7f5fa435c --> API: list symbols, get OHLCV + corporate actions, get asset-class returns

## Phase 2 — Backtest engine ✅

- [x] <!-- workspace:id=work:92b7f166-7ac2-54ad-8b5f-bbda4e305c42 --> Port/adapt engine from `stock-backtest-2` (ticker mode) — now `@calculator-5329/backtest-engine`
- [x] <!-- workspace:id=work:1536935b-1d20-5771-97c4-93b6e007171e --> Monthly asset-class simulator from Shiller normalized returns
- [x] <!-- workspace:id=work:0b3aa67c-37b6-53ab-964b-9d02ebc61fa5 --> Shared metrics: CAGR, max drawdown, Sharpe, volatility
- [x] <!-- workspace:id=work:9c6c966f-e4c6-5b8b-b2f7-89e883c7efbd --> Rebalancing + DCA options

## Phase 3 — Frontend (Vite) ✅ (React hooks + URL state, not MobX)

- [x] <!-- workspace:id=work:61f60526-aa62-5c07-900b-37fc00f28e8c --> Portfolio builder, backtest config, results (URL-synced state; no MobX)
- [x] <!-- workspace:id=work:168cafa5-a33c-5262-964c-bfb312978c39 --> Mode toggle: Ticker vs Asset Class (`/backtest`, `/allocation`)
- [x] <!-- workspace:id=work:a4e42ee2-0b2d-512a-b808-f09f1f42d68d --> Charts (ECharts — not Recharts)
- [x] <!-- workspace:id=work:f6932596-1a56-53b0-a442-07f447469454 --> Benchmark overlay (SPY / Shiller equity)

## Phase 4 — Data quality & coverage (partial)

- [x] <!-- workspace:id=work:9c95e6d7-4a84-5547-9b6b-c1cd366e8bf4 --> Extend universe beyond master-site snapshot (Tiingo on-demand admission + nightly refresh)
- [ ] <!-- workspace:id=work:e6073944-f4b6-59e6-a5ae-bf3498dcedfb --> Mutual fund coverage audit
- [x] <!-- workspace:id=work:6df9a2e0-7b07-530b-a9b0-5aa9ce1f1ae2 --> Persist dividends/splits in backend (canonical JSON: `divCash`, `splitFactor`)
- [ ] <!-- workspace:id=work:97623cd4-ee3e-573d-84bd-fe3818817a77 --> FRED integration for bond/cash series (deferred — see VISION.md 2026-07-04)

## Phase 5 — Production (partial)

- [x] <!-- workspace:id=work:091e9d6c-77b6-5b4b-bf2e-e88dbf73b63d --> Auth (optional) — Firebase Google auth for `/projections` only
- [x] <!-- workspace:id=work:891920e0-fa3c-5703-846c-919115716209 --> Saved portfolios / scenarios — shareable URLs + Firestore projections
- [ ] <!-- workspace:id=work:b0c5f7ad-496f-5814-91c5-9d3aa80e66fc --> CI, deploy pipeline — Firebase Hosting + Cloud Run deployed; GitHub Actions CI still open (see HANDOFF_ROADMAP.md)

---

## Out of scope (for now)

- Personal budget / net worth (finance-master)
- Live trading or brokerage integration
- Tiingo/Polygon (no existing pipeline)

- [ ] <!-- workspace:id=work:8ffadab1-a03c-5c76-85b3-72fa8235886a --> [lost] Reconcile three shipped-but-unchecked HANDOFF_ROADMAP items (added via Visions, 2026-07-19)

- [ ] <!-- workspace:id=work:3f188023-3076-55ec-be44-3f24bc7f82c0 --> [lost] Execute the approved D8 archive of finance/stock-analysis-project (added via Visions, 2026-07-19)
