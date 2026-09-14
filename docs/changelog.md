# Changelog

## 2026-09-13: X-ray mixed weights, links, phone histogram

- `/xray` now values a percent line correctly when it is mixed with share
  counts. `AAPL 12 / VTI 40% / BRK-B 5` used to take the 40 as forty dollars
  (VTI showed 0.6%); the priced rows are now grossed up so VTI is 40% of the
  whole and every derived figure (total, top position, blended P/E) follows.
  Percent totals of 100% or more are capped just below so nothing divides by
  zero. Tests in `app/src/xray/__tests__/xray.test.ts` cover mixed, pure-share
  and pure-percent lists; the mixed case was watched to fail before the fix.
- `/links` Qualtrim card points at the Qualtrim home page; the old
  `/app/insights` route returned 404 and bounced to a login wall.
- Monte Carlo ending-balance histogram lets ECharts thin the x-axis labels
  (`interval: 'auto'`, `hideOverlap`) instead of forcing every third label,
  which ran together on a 390 px phone.
- Found by the 2026-09-13 live-site QA pass. The valuation band label overlap
  it also reported is already fixed on main (`label: { show: false }`) and
  only needs the pending deploy.

## 2026-08-26: Public-repo presentation pass

- Deleted the vestigial `stock-analysis/` Vite starter from the working tree. It
  was a counter-template scaffold superseded by `app/` in July 2026 and had no
  live references (nothing in `firebase.json`, `.github/workflows/ci.yml`, or any
  script pointed at it). It remains in git history.
- Moved agent and process docs into `docs/internal/`: `HANDOFF.md`, `PLAN.md`,
  `original-plan.md`, `purpose.md`, `IDEAS.md`, `SOURCE_PROJECTS.md`, `plans/`,
  `reports/`, `archive/`, plus a `README.md` marking the directory as internal.
  Outsider-facing docs (`ARCHITECTURE.md`, `data-notes.md`, `DATA_SOURCES_*.md`,
  `tech_spec.md`, `screenshots/`) stay in `docs/`. Relative links in the moved
  files and the pointers in `CLAUDE.md`, `AGENTS.md` and `ARCHITECTURE.md` were
  updated.
- Added `docs/notes/edgar-share-basis.md`, an engineering write-up of the mixed
  share-basis problem in EDGAR companyfacts and how `resolveShares` in
  `app/src/fundamentals/charts.ts` resolves it. Linked from the README.

## 2026-07-26: App documentation cleanup

- Replaced the generic Vite starter text in `app/README.md` with a
  Fathom-specific guide to the client purpose, structure, local verification,
  data/privacy boundaries, and owner-only deployment boundary.
- Preserved the superseded starter README under
  `docs/internal/archive/2026-07-26/vite-app-readme.md`.

## 2026-07-02: Project context bootstrap

- Added project README with architecture overview (Vite + Cloud Run, dual backtest modes).
- Added `DATA_SOURCES_TICKERS.md`: documents master-site yfinance JSON, stock-site download script, portfolio-quarterly-reports CSV, Alpha Vantage weekly data, finance-master Yahoo ingest, and proposed Cloud Run schema.
- Added `DATA_SOURCES_ASSET_CLASSES.md`: documents Shiller, Fama-French portfolios, STKDATD, retirement-sim normalized pipeline, and asset-class vs ticker mode design.
- Added `SOURCE_PROJECTS.md`: index of all related repos on Desktop with reuse guidance.
- Created `context/` with:
  - Copied master-site long-term files (~5 MB) → `context/reference-data/asset-classes/`
  - Copied retirement-sim `shiller.csv` → `context/reference-data/shiller/`
  - Sample ticker JSON (VTI, SPY) and Alpha Vantage SPY sample
  - `external-paths.json` for machine-local full dataset paths
- Added `docs/roadmap.md`, `docs/tech_spec.md`.
- Vite starter in `stock-analysis/` unchanged (counter template only).

**Not done:** Cloud Run backend, bulk ticker ingest, UI backtest screens.
