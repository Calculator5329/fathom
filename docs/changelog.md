# Changelog

## 2026-07-02 — Project context bootstrap

- Added project README with architecture overview (Vite + Cloud Run, dual backtest modes).
- Added `DATA_SOURCES_TICKERS.md` — documents master-site yfinance JSON, stock-site download script, portfolio-quarterly-reports CSV, Alpha Vantage weekly data, finance-master Yahoo ingest, and proposed Cloud Run schema.
- Added `DATA_SOURCES_ASSET_CLASSES.md` — documents Shiller, Fama-French portfolios, STKDATD, retirement-sim normalized pipeline, and asset-class vs ticker mode design.
- Added `SOURCE_PROJECTS.md` — index of all related repos on Desktop with reuse guidance.
- Created `context/` with:
  - Copied master-site long-term files (~5 MB) → `context/reference-data/asset-classes/`
  - Copied retirement-sim `shiller.csv` → `context/reference-data/shiller/`
  - Sample ticker JSON (VTI, SPY) and Alpha Vantage SPY sample
  - `external-paths.json` for machine-local full dataset paths
- Added `docs/roadmap.md`, `docs/tech_spec.md`.
- Vite starter in `stock-analysis/` unchanged (counter template only).

**Not done:** Cloud Run backend, bulk ticker ingest, UI backtest screens.
