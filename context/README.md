# Context Folder

Local reference material pulled from existing projects. Use this for development and schema validation without copying multi-gigabyte archives.

## Layout

```
context/
├── reference-data/
│   ├── asset-classes/     # Shiller, FF portfolios, STKDATD, ie_data, JST (from master-site)
│   └── shiller/           # Normalized monthly returns (from retirement-sim)
├── samples/
│   ├── ticker-json/       # Example yfinance JSON (VTI, SPY)
│   └── alpha-vantage-weekly-SPY.json
└── external-paths.json    # Machine-local paths to full datasets
```

## Local copies (safe to commit)

| Path | Source | Description |
|------|--------|-------------|
| `reference-data/asset-classes/data.csv` | master-site | Shiller monthly CSV |
| `reference-data/asset-classes/Portfolios_Formed_on_ME.csv` | master-site | Fama-French-style monthly portfolios |
| `reference-data/asset-classes/STKDATD.DAT` | master-site | Daily market returns |
| `reference-data/asset-classes/ie_data.xls` | master-site | Yale Shiller Excel |
| `reference-data/asset-classes/JSTdatasetR6.xlsx` | master-site | Jorda-Schularick-Taylor macro |
| `reference-data/asset-classes/chapt26 (1).xlsx` | master-site | Chapter 26 reference data |
| `reference-data/shiller/shiller.csv` | retirement-sim | `date,spReturn,bondReturn,cashReturn,cpi` |

## External only (do not copy — use paths in `external-paths.json`)

- **Full ticker JSON archive** (~1 GB): `master-site/public/stock-data/*.json`
- **Daily close matrix**: `portfolio-quarterly-reports/src/data/raw/daily-prices.csv`
- **finance-master SQLite**: `finance-master/data/master.db`

Refresh local Shiller copy:

```bash
cd "C:\Users\et2bo\Desktop\Projects\Finance\retirement-sim"
npm run build:data
copy public\data\shiller.csv "..\stock-analysis-project\context\reference-data\shiller\shiller.csv"
```

Refresh asset-class files: re-copy from `master-site/public/long-term/` when Yale or FF sources update.
