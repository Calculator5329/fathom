# Asset-Class Historical Data — Sources & Ingestion

Long-horizon monthly (and some daily) return series for **asset-class backtesting** — e.g. US Large Cap, Small Cap, Bonds, Cash, International — over 150+ years. This is the **separate mode** from ticker-level backtests (shorter window, individual symbols).

## Summary

| Dataset | Range | Granularity | Best for | Canonical path |
|---------|-------|-------------|----------|----------------|
| **Shiller monthly** | 1871 → present | Monthly | Stocks, bonds (approx), cash (approx), CPI, CAPE | `master-site/public/long-term/data.csv` |
| **Shiller normalized (retirement-sim)** | 1871 → present | Monthly | Pre-computed `spReturn`, `bondReturn`, `cashReturn`, `cpi` | `retirement-sim/public/data/shiller.csv` |
| **Fama-French size portfolios** | 1926 → present | Monthly | Size/style factor portfolios | `master-site/public/long-term/Portfolios_Formed_on_ME.csv` |
| **Daily market returns** | 1885 → present | Daily | Fine-grained equity/bond daily series | `master-site/public/long-term/STKDATD.DAT` |
| **Shiller ie_data.xls** | 1871 → present | Monthly | Raw Yale spreadsheet | `master-site/public/long-term/ie_data.xls` |
| **JST macro dataset** | Long historical | Mixed | International macro (Jorda-Schularick-Taylor) | `master-site/public/long-term/JSTdatasetR6.xlsx` |

**Local copies in this repo:** `context/reference-data/asset-classes/` (all 6 master-site long-term files) and `context/reference-data/shiller/shiller.csv` (normalized).

---

## 1. Shiller data (1871+)

### Raw — master-site

**Path:** `~/projects/finance/finance-master-workspace/master-site/public/long-term/data.csv`  
**Source:** Robert Shiller, Yale — [http://www.econ.yale.edu/~shiller/data.htm](http://www.econ.yale.edu/~shiller/data.htm)  
**Also:** `ie_data.xls` in same folder (original Excel download)

**Key columns** (see `master-site/src/data/longTermDataService.ts` → `SHILLER_COLUMNS`):

| Column | Meaning |
|--------|---------|
| P | S&P Composite price |
| D | Dividends |
| E | Earnings |
| CPI | Consumer Price Index |
| GS10 | 10-year Treasury yield |
| CAPE | Cyclically adjusted P/E |
| MonthlyTotalReturn | Monthly total return index |
| RealMonthlyReturn | Real monthly bond return index |
| Ann10YrStockReturn / Ann10YrBondReturn | 10-year annualized real returns |

**Parser:** `parseShillerData()` in `longTermDataService.ts`

### Normalized — retirement-sim

**Path:** `~/projects/finance/retirement-sim/public/data/shiller.csv`  
**Build:**

```bash
cd "~/projects/finance/retirement-sim"
npm run build:data
```

Downloads `ie_data.xls` from Yale, emits:

```csv
date,spReturn,bondReturn,cashReturn,cpi
1871-01,0.0234,-0.0012,0.0015,12.46
```

**Caveats (from retirement-sim README):**

- Bond returns: duration approximation from GS10 yield changes (~7yr modified duration)
- Cash returns: GS10/4 as T-bill proxy
- v2 should use FRED TB3MS + proper Treasury total return series

**Engine usage:** `retirement-sim/src/sim/` — Monte Carlo / historical bootstrap over monthly returns.

---

## 2. Fama-French-style portfolios

**Path:** `~/projects/finance/finance-master-workspace/master-site/public/long-term/Portfolios_Formed_on_ME.csv`  
**Size:** ~935 KB  
**Content:** Monthly returns for portfolios formed on market equity (size deciles, etc.)

**Parser:** `parsePortfoliosCSV()` in `longTermDataService.ts`

Use for asset-class presets like “Small Value”, “Large Growth” when not mapping to a single ETF ticker.

---

## 3. Daily stock/bond returns (STKDATD.DAT)

**Path:** `master-site/public/long-term/STKDATD.DAT`  
**Format:** Fixed-width daily records  
**Parser:** `parseStockDataDAT()` in `longTermDataService.ts`

Finer granularity than Shiller monthly when daily asset-class simulation is needed.

---

## 4. Firestore migration (master-site production)

When `USE_FIRESTORE = true` in `longTermDataService.ts`, datasets load from:

| Collection | Content |
|------------|---------|
| `DemoData/LongTermShillerData` | Shiller (shared demo) |
| `UserData/{uid}/LongTermPortfolios` | Portfolios CSV |
| `UserData/{uid}/LongTermStockReturns` | STKDATD |
| `UserData/{uid}/LongTermIEData` | ie_data |
| `UserData/{uid}/LongTermChapter26` | chapt26 workbook |
| `UserData/{uid}/LongTermJSTData` | JST dataset |

Migration scripts: `npm run migrate:longterm`, `verify:longterm` in master-site.

For Cloud Run, prefer **bundled static files** or **object storage** over Firestore for read-heavy backtest data.

---

## 5. Asset-class mode vs ticker mode (product design)

| | Ticker mode | Asset-class mode |
|---|-------------|------------------|
| **User picks** | SPY, VTI, FSKAX, AAPL, … | US Stocks, Bonds, Cash, Intl, … |
| **Typical window** | 1970–2025 (symbol-dependent) | 1871–present |
| **Data source** | master-site JSON, yfinance, Alpha Vantage | Shiller + FF portfolios |
| **Rebalance** | Daily/weekly/monthly on trading calendar | Monthly on Shiller calendar |
| **Reference UX** | PortfolioVisualizer ticker backtest | PortfolioVisualizer “asset allocation” / factor presets |

Preset mappings (to define in `docs/tech_spec.md`):

- “US Total Stock Market” → Shiller total return or VTI where overlap exists
- “US Bonds” → Shiller real bond return series (with documented approximation)
- “Cash” → Shiller cash proxy

---

## 6. Ingestion plan for Cloud Run

1. Upload `context/reference-data/asset-classes/*` to GCS bucket `asset-class/v1/`.
2. Precompute parquet/JSON lines: `{ assetClassId, date, totalReturn, realReturn?, cpi? }`.
3. Expose `GET /api/asset-classes`, `GET /api/asset-classes/:id/returns?from=&to=`.
4. Keep Shiller attribution and caveats visible in API metadata (`source`, `bondMethod`, `cashMethod`).

---

## Related projects

- **retirement-sim** — cleanest Shiller → monthly returns pipeline (`scripts/build-data.ts`)
- **master-site** — richest multi-dataset long-term loader (`longTermDataService.ts`)
- **finance-master TABS_PLAN.md** — retirement tab planned to use Shiller bootstrap from master-site
