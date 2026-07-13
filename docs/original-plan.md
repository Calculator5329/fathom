# Stock Analysis Project

Portfolio allocation backtesting website — similar in spirit to PortfolioVisualizer, but built as a dedicated product.

## Architecture (planned)

| Layer | Stack |
|-------|-------|
| Frontend | Vite + React + TypeScript (MobX stores, three-layer UI → Store → Service) |
| Backend | Google Cloud Run service (stateless API) |
| Data | Historical ticker prices (stocks, ETFs, mutual funds) + long-horizon asset-class series |

The Vite app lives in [`stock-analysis/`](./stock-analysis/). Backend scaffolding is not started yet.

## Two backtest modes

1. **Ticker mode** — Daily (or weekly) OHLCV for individual stocks, ETFs, and mutual funds. Includes dividends and splits where available. Typical history: 1970–present for major tickers; broker-curated daily closes from ~2021 for held symbols.
2. **Asset-class mode** — Monthly total-return series over 150+ years (Shiller, Fama-French-style portfolios, daily market returns). Used when you want “US Large Cap / Bonds / Cash” style allocations over very long windows.

## Context pulled from existing projects

This repo collects **documentation and small reference datasets** from prior finance projects on this machine. Large archives (1,500+ ticker JSON files, ~1 GB) are **referenced by path**, not copied.

| Doc | Purpose |
|-----|---------|
| [DATA_SOURCES_TICKERS.md](./DATA_SOURCES_TICKERS.md) | Where ticker price/dividend/split data lives and how it was fetched |
| [DATA_SOURCES_ASSET_CLASSES.md](./DATA_SOURCES_ASSET_CLASSES.md) | Long-horizon asset-class datasets (1871+) |
| [SOURCE_PROJECTS.md](./SOURCE_PROJECTS.md) | Index of all related repos and what to reuse from each |
| [docs/roadmap.md](./docs/roadmap.md) | Feature roadmap |
| [docs/tech_spec.md](./docs/tech_spec.md) | Architecture and data contracts |
| [context/README.md](./context/README.md) | Local copies vs external paths |

## Quick start (frontend only)

```bash
cd stock-analysis
npm install
npm run dev
```

## Next steps

1. Stand up Cloud Run API skeleton with endpoints for ticker search, price history, and asset-class series.
2. Design unified schema: daily bars + corporate actions + adjusted close; monthly asset-class returns.
3. Ingest master-site `stock-data/*.json` (yfinance) into backend storage — primary ticker seed.
4. Wire Vite UI to backtest engine (port patterns from `stock-backtest-2` and `finance-master` domain layer).
