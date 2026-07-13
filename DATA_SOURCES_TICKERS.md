# Ticker Historical Data — Sources & Ingestion

How to get daily (and weekly) price history for stocks, ETFs, and mutual funds — including dividends and stock splits — for portfolio backtesting.

## Summary: what to use when

| Need | Best source | History | Dividends/splits | Location |
|------|-------------|---------|------------------|----------|
| **Broad ticker universe (~1,570 symbols)** | master-site yfinance JSON | ~1970 → 2025 | Yes (`Dividends`, `Stock Splits`) | `C:\Users\et2bo\Desktop\New folder\master-site\public\stock-data\` |
| **Download script (same schema)** | stock-site | ~1970 → configurable | Yes | `C:\Users\et2bo\Desktop\New folder\stock-site\backend\download_data.py` |
| **Held-symbol daily closes (high quality)** | portfolio-quarterly-reports | ~2021 → present | Close only | `C:\Users\et2bo\Desktop\Projects\Finance\finance reports\portfolio-quarterly-reports\src\data\raw\daily-prices.csv` |
| **Weekly OHLCV + adjusted close** | stock-backtest / stock-backtest-2 | Full (Alpha Vantage) | Via `adjustedClose` | `C:\Users\et2bo\Desktop\New folder\stock-backtest\public\data\` |
| **Live refresh** | finance-master sidecar | Configurable range | Close only (Yahoo) | `finance-master/apps/sidecar/src/providers/prices.ts` |
| **SQLite pipeline (personal app)** | finance-master | Merged from above | Partial | `finance-master/data/master.db` → `priceHistory` table |

**Recommendation for this project:** Seed the Cloud Run backend from **master-site `stock-data/*.json`** (largest curated set with dividends/splits). Supplement with **Alpha Vantage weekly adjusted** or **yfinance refresh** for symbols missing from the archive. Use **daily-prices.csv** only for symbols where broker-exported closes are more accurate than Yahoo.

---

## 1. master-site stock-data (primary seed)

**Path:** `C:\Users\et2bo\Desktop\New folder\master-site\public\stock-data\`  
**Size:** ~1,570 JSON files, ~1 GB  
**Not copied into this repo** — reference only.

### Schema (yfinance export shape)

Each `{TICKER}.json` is an array of daily points:

```json
{
  "Date": 992577600000,
  "Close": 36.3396530151,
  "Dividends": 0.0,
  "Stock Splits": 0.0
}
```

- `Date` — Unix epoch **milliseconds**
- `Close` — unadjusted close (use with dividend/split columns for total return)
- `Dividends` — cash dividend on ex-date (0 if none)
- `Stock Splits` — split ratio (e.g. `4.0` for 4:1)

**Sample files in this repo:** `context/samples/ticker-json/VTI.json`, `SPY.json`

### How it was produced

Same pipeline as `stock-site/backend/download_data.py`:

```python
yf.Ticker(ticker).history(start="1970-01-01", end="2025-03-25")
# columns: Date, Close, Dividends, Stock Splits
```

Universe: S&P 500 + major ETFs + extended ticker list (~1,500+ symbols). Saved as JSON in master-site; pickle in stock-site backend.

### Already-ingested elsewhere

`finance-master` can load these into SQLite:

```bash
cd "C:\Users\et2bo\Desktop\New folder\finance-master"
npx tsx apps/sidecar/src/cli.ts ingest-master-stock-data "C:\Users\et2bo\Desktop\New folder\master-site\public\stock-data"
```

Implementation: `finance-master/apps/sidecar/src/pipeline/referenceData.ts` → `ingestMasterStockData()`.  
**Note:** Current ingest only stores **close** into `priceHistory`; dividends/splits are in the JSON but not persisted yet.

---

## 2. stock-site download script

**Path:** `C:\Users\et2bo\Desktop\New folder\stock-site\backend\download_data.py`  
**Output:** `backend/data_cache/{TICKER}.pkl` (pandas DataFrame pickle)

Re-run to refresh or extend universe:

```bash
cd "C:\Users\et2bo\Desktop\New folder\stock-site\backend"
pip install yfinance pandas
python download_data.py
```

Adjust `START_DATE`, `END_DATE`, and ticker lists at top of file.

---

## 3. portfolio-quarterly-reports daily-prices.csv

**Path:** `C:\Users\et2bo\Desktop\Projects\Finance\finance reports\portfolio-quarterly-reports\src\data\raw\daily-prices.csv`

Wide spreadsheet matrix:

- Row 0 (or auto-detected header row): dates as `M/D/YYYY`
- Column A: ticker symbol
- Cells: daily **close** (or `No Data`)

**Range:** ~2021 → present for held symbols.  
**Corporate actions:** Not included — close-only.  
**Maintenance:** Broker exports merged via scripts in `portfolio-quarterly-reports/scripts/` (`merge-public-prices.mjs`, etc.).

Ingested by finance-master:

```bash
npx tsx apps/sidecar/src/cli.ts ingest-daily-prices "<path-to-daily-prices.csv>"
```

---

## 4. stock-backtest / stock-backtest-2 (Alpha Vantage weekly)

**Paths:**

- `C:\Users\et2bo\Desktop\New folder\stock-backtest\`
- `C:\Users\et2bo\Desktop\Projects\Finance\finance-tools\stock-backtest-2\` (has full README)

**Fetch:**

```bash
ALPHA_VANTAGE_API_KEY=your_key npm run fetch:data:alphavantage
```

Uses `TIME_SERIES_WEEKLY_ADJUSTED` → `adjustedClose` embeds dividend + split adjustments.

**JSON schema:**

```json
{
  "symbol": "SPY",
  "name": "SPDR S&P 500 ETF",
  "data": [
    { "date": "2020-01-03", "open": 324.87, "high": 325.12, "low": 322.1, "close": 323.5, "volume": 12345678, "adjustedClose": 323.5 }
  ],
  "lastUpdated": "2026-01-01T00:00:00.000Z"
}
```

**Sample in this repo:** `context/samples/alpha-vantage-weekly-SPY.json` (if copied)

**Rate limits (free tier):** 25 calls/day, 5/min — plan bulk ingest accordingly.

---

## 5. finance-master Yahoo live refresh

**File:** `finance-master/apps/sidecar/src/providers/prices.ts`  
**Endpoint:** `query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d`

```bash
npx tsx apps/sidecar/src/cli.ts refresh-prices SPY VTI QQQ
```

Stores daily close in `priceHistory` with `source: 'yahoo'`.

---

## 6. Target schema for Cloud Run (proposed)

Unify on something like:

```
instruments(id, symbol, name, type: stock|etf|mutual_fund)
price_bars(instrument_id, date, open, high, low, close, volume, adjusted_close, source)
corporate_actions(instrument_id, ex_date, type: dividend|split, amount, ratio)
```

- **Total return backtests:** prefer `adjusted_close` or reconstruct from close + dividends + splits.
- **Do not** use synthetic dividend yields (see finance-master backtest README).

---

## 7. Known gaps

| Gap | Mitigation |
|-----|------------|
| Mutual funds often missing from yfinance JSON | Add fund CUSIP/symbol list; try Yahoo + manual CSV |
| finance-master `priceHistory` drops dividends/splits | Extend ingest or new tables |
| Alpha Vantage rate limits | Batch job on Cloud Run + object storage |
| FSKAX and some Fidelity funds missing | Documented in finance-master SMOKE_TEST — need explicit fetch |
| Tiingo / Polygon | Not used in any existing project |

---

## Related docs

- `finance-master/INGESTION.md` — full sidecar ingest pipeline
- `finance-master/apps/web/src/ui/backtest/README.md` — dividend/total-return policy
- `finance-master/packages/schema/src/tables.ts` — current `priceHistory` Drizzle schema
