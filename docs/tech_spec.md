# Technical Specification

## System overview

```
┌─────────────────┐     HTTPS      ┌──────────────────────┐
│  Vite + React   │ ◄────────────► │  Cloud Run API       │
│  (MobX stores)  │                │  (stateless)         │
└─────────────────┘                └──────────┬───────────┘
                                              │
                                   ┌──────────▼───────────┐
                                   │  GCS / managed DB    │
                                   │  ticker bars         │
                                   │  asset-class series  │
                                   └──────────────────────┘
```

Three-layer frontend (inherited from workspace rules):

- **UI** — components only; observes stores
- **Store** — portfolio config, backtest orchestration
- **Service** — HTTP client to Cloud Run; no MobX in services

---

## Backtest modes

### Mode A: Ticker

- Input: weighted list of symbols (stocks, ETFs, mutual funds)
- Date range: limited by symbol history (typically 1970–2025)
- Return basis: **total return** via adjusted close OR close + dividend events + split events
- Frequency: daily bars preferred; weekly acceptable for v1

### Mode B: Asset class

- Input: weighted list of asset classes (presets + custom)
- Date range: 1871-01 → latest Shiller month
- Return basis: monthly total return from Shiller / FF portfolios
- Frequency: monthly only

---

## Data contracts

### Ticker bar (API response)

```typescript
interface TickerBar {
  date: string;           // ISO date YYYY-MM-DD
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  adjustedClose?: number;
  dividend?: number;      // cash, ex-date
  splitRatio?: number;    // e.g. 4 for 4:1
  source: 'yfinance' | 'yahoo' | 'alphavantage' | 'broker_csv';
}
```

### yfinance JSON (ingest format — master-site)

See `context/samples/ticker-json/VTI.json`. Map epoch-ms `Date` → ISO date.

### Asset-class return (API response)

```typescript
interface AssetClassReturn {
  date: string;           // YYYY-MM
  nominalReturn: number;
  realReturn?: number;
  cpi?: number;
}

interface AssetClassMeta {
  id: string;
  name: string;
  source: string;
  startDate: string;
  endDate: string;
  caveats?: string[];
}
```

Normalized Shiller ingest: `context/reference-data/shiller/shiller.csv`

---

## Source-of-truth hierarchy (ticker)

1. **Corporate actions + OHLCV:** master-site JSON (yfinance history)
2. **Adjusted weekly series:** Alpha Vantage (validation / gap fill)
3. **Daily close override:** broker `daily-prices.csv` where manually curated
4. **Live tail:** Yahoo chart API (finance-master pattern)

---

## Source-of-truth hierarchy (asset class)

1. **Monthly equity/bond/cash:** retirement-sim normalized Shiller (documented approximations)
2. **Extended columns (CAPE, etc.):** master-site `data.csv`
3. **Factor portfolios:** `Portfolios_Formed_on_ME.csv`
4. **Daily:** `STKDATD.DAT` when needed

---

## API sketch (v1)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/instruments?q=` | Search symbols |
| GET | `/api/instruments/:symbol/meta` | Name, type, date range |
| GET | `/api/instruments/:symbol/bars?from=&to=` | OHLCV + actions |
| GET | `/api/asset-classes` | List presets |
| GET | `/api/asset-classes/:id/returns?from=&to=` | Monthly returns |
| POST | `/api/backtest/ticker` | Run ticker backtest |
| POST | `/api/backtest/asset-class` | Run asset-class backtest |

---

## Existing code to port

| Component | Source project | Path |
|-----------|----------------|------|
| yfinance ingest | stock-site | `backend/download_data.py` |
| SQLite ingest reference | finance-master | `referenceData.ts` |
| Alpha Vantage fetch | stock-backtest-2 | `scripts/fetchHistoricalData.ts` |
| Shiller build | retirement-sim | `scripts/build-data.ts` |
| Long-term parsers | master-site | `longTermDataService.ts` |
| Backtest UI patterns | stock-backtest-2 | `src/` |

---

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-02 | Reference 1GB ticker archive by path, copy only ~5MB asset-class + samples | Avoid repo bloat; full ingest via Cloud Run job |
| 2026-07-02 | Two explicit backtest modes | Different data depth (1871 vs 1970) and UX |
| 2026-07-02 | Total return must use real dividends/splits | finance-master backtest README — no synthetic yields |
