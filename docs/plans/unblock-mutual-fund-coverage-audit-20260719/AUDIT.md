# Mutual fund coverage audit

**Roadmap item:** Phase 4 — Data quality & coverage · "Mutual fund coverage audit"
(`docs/roadmap.md`). Ethan's decision: **APPROVED**.
**Author:** claude (orchestrator lane `unblock-mutual-fund-coverage-audit-20260719`).
**Date:** 2026-07-19.
**Status:** Audit complete. Source changes recommended — see [DISPATCH.md](DISPATCH.md).

> This lane owns only `docs/plans/unblock-mutual-fund-coverage-audit-20260719/`. It ships
> findings + an execution plan + a follow-up task spec. It touches **no** product source and
> **not** the roadmap; the harvesting session ticks the roadmap item from this deliverable.

---

## 1. What "coverage audit" means here

Fathom's ticker backtester promises "stocks, ETFs, **mutual funds** with dividends and splits"
(`docs/roadmap.md` Vision, `DATA_SOURCES_TICKERS.md:3`). This audit answers three questions:

1. **Discoverability** — can a user find and select mutual funds today?
2. **Admission** — when a fund symbol is requested, does the pipeline fetch and store correct
   NAV/distribution history?
3. **Correctness & labeling** — is fund data classified and adjusted correctly end-to-end
   (search chip, catalog type, engine reinvestment math)?

The audit is a code + data inspection. A **live Tiingo probe was not possible in this lane**
(no `TIINGO_API_TOKEN`; root `.env` is absent in the worktree, by design). The one gap that
genuinely needs live data — proving which specific funds Tiingo's free tier actually serves and
that their adjusted-close is distribution-correct — is specified as a repeatable smoke test in
DISPATCH.md rather than guessed at here.

## 2. The mutual-fund data path, end to end

| Stage | File | Fund behavior |
| --- | --- | --- |
| Offline fetch | `scripts/fetch-tiingo.mjs` | Fetches `/tiingo/daily/{sym}` + `/prices`. Symbol-agnostic — funds fetch the same as stocks. Does **not** assign a type. |
| Offline catalog build | `scripts/build-catalog.mjs` | `inferType()` is a **hardcoded allowlist**: `MUTUAL_FUND_TICKERS = {VTSAX, VFINX}`, `ETF_TICKERS` (34), `LEVERAGED_TICKERS` (3); everything else → `'Stock'`. |
| On-demand admission | `server/src/index.mjs` `admitTicker()` (l.213) | Fetches full history, then calls `searchTiingo(sym, 1)` and takes the matched `assetType`. Correct typing path. Falls back to `'Stock'` on any search error. |
| Type mapping | `server/src/tiingo.mjs` `searchTiingo()` (l.86) | `typeMap = { Stock, ETF, 'Mutual Fund' → 'Mutual fund' }`. Rows whose `assetType` is none of these **and** non-empty are **filtered out** of search results (l.88). |
| Client catalog | `app/src/data/catalog.ts` | Loads `catalog.json`; `AssetType` union includes `'Mutual fund'` (l.3). `loadSeries()` upserts unknown tickers with a hardcoded `type: 'Stock'` fallback (l.737), non-destructive (`upsertCatalogEntry` inserts only if absent, l.700). |
| Engine | `app/src/engine/index.ts` | Consumes a normalized `TickerSeries` (`{records:{date,close,adjClose,divCash,splitFactor}}`). Type-blind: reinvestment uses `adjClose`; `splitFactor` for funds is always `1`. No fund-specific code, and none needed. |

**Takeaway:** the *server admission* path types funds correctly via Tiingo search. The *offline
build* path and the *client fallback* both default unknown symbols to `'Stock'`. These two paths
disagree, and that disagreement is the core structural finding (§4.1).

## 3. Empirical findings

### 3.1 The seed universe contains zero mutual funds

The master-site archive that seeded Fathom was inventoried in `scripts/output/archive-inventory.csv`
(1,570 tickers, generated 2026-07-03 — see `docs/data-notes.md`). Analysis
(`analyze-archive-mf.mjs`, in this folder):

- **0** symbols match the open-end-fund shape (5 letters ending in `X`). The 60 five-letter
  symbols present are all share classes / preferreds / warrants (`GOOGL`, `CMCSA`, `FCNCA`,
  `AGNCP`, `ZIONP`, …) — no `VTSAX`, `FXAIX`, `VFIAX`, `SWPPX`, `FCNTX`, `VBTLX`, `PRGFX`, etc.
- Grepping the archive for ten of the most-held US mutual funds returns **nothing**.

So the seeded data lake is a **stocks + ETFs** universe. Every mutual fund in Fathom today arrives
through one of two later-added, narrow channels.

### 3.2 Curated fund coverage is one symbol

- `build-catalog.mjs` hardcodes **two** funds (`VTSAX`, `VFINX`).
- The shipped semantic catalog `app/src/data/catalog.ts` contains **one** `type: 'Mutual fund'`
  entry (`VTSAX`). By type: 39 ETF, 21 Stock, 10 Leveraged, **1 Mutual fund**.
- `VFINX` is in the offline `inferType` allowlist but **not** in the shipped semantic overlay —
  the two curated lists have already drifted.

### 3.3 The promise vs. the reality

The product copy and data-source doc advertise mutual funds as a first-class instrument class.
In practice, coverage is: **whatever Tiingo happens to admit on demand, plus one seeded symbol.**
Nothing is broken for the funds that *do* admit, but the class is effectively undiscoverable and
its correctness is unproven.

## 4. Risk register (fund-specific)

### 4.1 [HIGH] Offline pipeline mislabels funds as `Stock`

`fetch-tiingo.mjs` → `build-catalog.mjs`: any fund fetched offline that isn't in the two-symbol
allowlist gets `type: 'Stock'` in `catalog.json`. Consequences:
- Wrong search chip / filter classification in the UI.
- The catalog type is what gates EDGAR fundamentals: `admitTicker` fires `cacheFundamentals()` for
  anything typed `'Stock'` (`index.mjs:239`). A fund mistyped `Stock` triggers a **guaranteed-404
  EDGAR companyfacts fetch** (open-end funds file no `companyfacts`) — wasted calls and noisy warn
  logs, though not a data-corruption bug.

The server admission path already solves this (Tiingo-search typing). The fix is to **make the
offline build use the same signal** instead of a static allowlist, or at minimum expand + de-drift
the allowlist and share it with the semantic overlay.

### 4.2 [MEDIUM] Unknown/unverified free-tier fund availability

Admission depends entirely on Tiingo serving fund NAV history on the current (free) plan. Tiingo
does cover open-end funds in its EOD API, but *which* funds, how far back, and whether
`adjClose`/`divCash` correctly bake in **capital-gains distributions** (not just income dividends)
is unproven for Fathom's data specifically. Distribution handling is the one place fund math
differs materially from stocks and must be spot-checked against a known fund's adjusted-return
series. Without this, "with dividends" is an unverified claim for the fund class.

### 4.3 [MEDIUM] Funds are undiscoverable without a cold round-trip

ETFs have a 34-symbol curated seed; funds have one. A user who doesn't already know a fund symbol
cannot browse to one, and the first request for any fund pays a full Tiingo admission round-trip
(subject to the ~50 unique symbols/hr free-tier throttle). A small curated fund seed — mirroring
the ETF seed — closes this cheaply.

### 4.4 [LOW] Client fallback types unknown series as `Stock`

`loadSeries()` upserts a hardcoded `type: 'Stock'` (`catalog.ts:737`). Non-destructive (won't
overwrite a catalog.json entry) and self-corrects on the next `catalog.json` load, so this is
cosmetic and transient — noted for completeness, not for action.

### 4.5 [LOW] Non-{Stock,ETF,Mutual Fund} assets silently dropped from search

`searchTiingo` filters out any row with a populated `assetType` outside the three mapped values
(`tiingo.mjs:88`). Correct for excluding FX/crypto, but means e.g. closed-end funds / some ADR
classes never surface. Out of scope for *this* item; recorded so it isn't rediscovered as a fund
bug later.

## 5. Verdict

Mutual-fund coverage is **advertised but effectively unshipped**: one seeded symbol, a
correct-but-unverified on-demand admission path, and an offline build that mislabels funds. No
data-corruption defect exists, so this is a **coverage + labeling** gap, not an engine bug — which
keeps it well clear of the "engine math is sacred" invariant. The audit's own charter (produce a
finding + plan under this lease) is satisfied; realizing coverage needs the bounded source changes
in §6 / DISPATCH.md.

## 6. Recommendations (prioritized)

1. **[P1] Unify fund typing in the offline build.** Replace the static `MUTUAL_FUND_TICKERS`
   allowlist in `build-catalog.mjs` with the Tiingo-search `assetType` signal the server already
   uses (or, if an offline network call is undesirable, a shared curated map imported by both the
   builder and the semantic overlay so they can't drift). Kills risk 4.1.
2. **[P1] Ship a fund coverage smoke test** (`scripts/audit-mutual-funds.mjs`): probe a
   representative fund basket against Tiingo, assert admission + non-empty history + distribution
   sanity (adjusted-return vs. price-return divergence ≈ trailing yield), and emit a coverage
   report. This is the live half of the audit and a durable regression artifact. Resolves risk 4.2.
3. **[P2] Add a curated mutual-fund seed set** (~10 popular funds: FXAIX, VFIAX, SWPPX, FCNTX,
   VBTLX, VTIAX, PRGFX, VWELX, DODGX, FMAGX + existing VTSAX/VFINX) to the semantic overlay so
   funds are browsable and search-complete. Resolves risk 4.3.
4. **[P3] Document the fund data contract** in `docs/DATA_SOURCES_TICKERS.md` (or data-notes):
   funds have `splitFactor≡1`, distributions flow via `divCash`+`adjClose`, EDGAR fundamentals are
   intentionally skipped for funds.

Items 1–3 are concrete source changes bundled into a single follow-up task — see **DISPATCH.md**.
Item 4 is doc-only and can ride along or be folded into the follow-up task's deliverables.

## 7. Evidence / reproduction

- `analyze-archive-mf.mjs` (this folder) — archive fund-shape analysis. Run:
  `node docs/plans/unblock-mutual-fund-coverage-audit-20260719/analyze-archive-mf.mjs`.
- Archive inventory: `scripts/output/archive-inventory.csv` (1,570 tickers).
- Code refs cited inline with `file:line`.
