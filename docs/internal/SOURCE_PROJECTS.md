# Source Projects Index

Map of existing finance/stock projects on this machine and what to reuse for **stock-analysis-project**.

Base path for most consolidated work: `~/projects/finance/finance-master-workspace/`  
Finance tools path: `~/projects/finance/`

---

## Primary data sources

| Project | Path | Reuse for |
|---------|------|-----------|
| **master-site** | `~/projects/finance/finance-master-workspace/master-site/` | ~1,570 ticker JSON files (yfinance); long-term asset-class CSVs/XLS; `longTermDataService.ts` parsers |
| **stock-site** | `~/projects/finance/finance-master-workspace/stock-site/` | `download_data.py` — yfinance bulk download script |
| **retirement-sim** | `~/projects/finance/retirement-sim/` | Shiller → monthly returns pipeline (`build-data.ts`); sim engine patterns |
| **portfolio-quarterly-reports** | `~/projects/finance/finance reports/portfolio-quarterly-reports/` | Authoritative daily close matrix (`daily-prices.csv`) |
| **finance-master** | `~/projects/finance/finance-master/` | Sidecar ingest pipeline, `priceHistory` schema, Yahoo refresh, backtest tab WIP |
| **stock-backtest** | `~/projects/finance/finance-master-workspace/stock-backtest/` | Alpha Vantage weekly fetch + backtest UI/engine |
| **stock-backtest-2** | `~/projects/finance/stock-backtest-2/` | Same as above with full README |

---

## Backtest & portfolio engines

| Project | Path | Notes |
|---------|------|-------|
| stock-backtest / stock-backtest-2 | see above | Rebalancing, DCA, Sharpe, max drawdown; uses `adjustedClose` |
| portfolio-visualizer | `~/projects/finance/finance-master-workspace/portfolio-visualizer/` | Python TWRR sim; runtime yfinance only |
| finance-master backtest tab | `finance-master/apps/web/src/ui/backtest/` | Close-only today; dividends explicitly excluded until real data |
| finance-master domain | `finance-master/packages/domain/` | Target home for shared `BacktestEngine` (per MASTER_PLAN) |

---

## Consolidation & planning docs

| File | Path |
|------|------|
| MASTER_PLAN.md | `~/projects/finance/finance-master-workspace/MASTER_PLAN.md` — vision for merging 23 projects into finance-master |
| INGESTION.md | `~/projects/finance/finance-master/docs/INGESTION.md` |
| DATA_AUDIT.md | `~/projects/finance/finance-master/docs/DATA_AUDIT.md` |
| TABS_PLAN.md | `~/projects/finance/finance-master/docs/TABS_PLAN.md` — Backtest + Retirement specs |
| AGENT_COORDINATION.md | `~/projects/finance/finance-master/AGENT_COORDINATION.md` |

---

## Other related (lower priority)

| Project | Path | Notes |
|---------|------|-------|
| finance-gui | `~/projects/finance/finance-gui/` | Tax node graph — retirement planning |
| buys-tracker | `~/projects/finance/buys-tracker/` | `stock-values.csv` wide price export |
| portfolio-analyzer | `~/projects/finance/portfolio-analyzer/` | Alpha Vantage runtime fetch |
| finance-projections | `~/projects/finance/finance-projections/` | Life projections CSV, not market OHLCV |
| _prep | `~/projects/finance/finance-master-workspace/_prep/` | Migration fixtures for finance-master seed |

---

## What was copied into stock-analysis-project

| Copied to | From | Size |
|-----------|------|------|
| `context/reference-data/asset-classes/*` | master-site `public/long-term/` | ~5 MB (6 files) |
| `context/reference-data/shiller/shiller.csv` | retirement-sim | ~90 KB |
| `context/samples/ticker-json/VTI.json`, `SPY.json` | master-site stock-data | ~1.3 MB combined |
| `context/samples/alpha-vantage-weekly-SPY.json` | stock-backtest | if present |

## What was NOT copied (reference by path)

| Data | Path | Reason |
|------|------|--------|
| Full ticker archive | `master-site/public/stock-data/` | ~1 GB, 1,570 files |
| SQLite DB | `finance-master/data/master.db` | Personal app DB, regenerable via ingest |
| daily-prices.csv | portfolio-quarterly-reports | Personal holdings; small but live-updated elsewhere |

---

## Suggested port order

1. **Data layer** — yfinance JSON ingest + Shiller/asset-class static files (this repo’s `context/` + GCS)
2. **Backtest engine** — `stock-backtest-2` engine + finance-master domain patterns
3. **API** — Cloud Run routes modeled on finance-master sidecar `/api/ticker/:s/chart`
4. **UI** — Vite app: ticker mode + asset-class mode toggle (PortfolioVisualizer-like)
