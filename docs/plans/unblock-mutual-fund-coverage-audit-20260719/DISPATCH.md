# Follow-up task spec — Mutual fund coverage: typing + seed + smoke test

Derived from [AUDIT.md](AUDIT.md) §6 (recommendations P1–P3). Dispatch this as one bounded task
via the `orchestrator` skill after the audit is harvested. The doc-only recommendation (§6 item 4)
is folded in as a deliverable.

---

## Task 1 — Unify fund typing, seed a fund set, add a coverage smoke test

- **title:** `Mutual fund coverage: unify typing + curated seed + smoke test`
- **adapter:** claude (touches server + client + scripts; also needs a live Tiingo probe, which the
  permission classifier blocks inside codex).
- **model tier:** smart
- **owns (lease paths):**
  - `scripts/build-catalog.mjs`
  - `scripts/audit-mutual-funds.mjs`  *(new)*
  - `app/src/data/catalog.ts`
  - `app/src/data/__tests__/` *(new/updated test file for typing + seed)*
  - `docs/DATA_SOURCES_TICKERS.md`
  - `docs/changelog.md`
  - `docs/HANDOFF_ROADMAP.md` *(check off the item + link the audit)*
- **do NOT touch:** `app/src/engine/**` (engine math is sacred — this task adds none of it),
  `server/src/tiingo.mjs` typing logic beyond reading it (it is already correct), Ethan's untracked
  files (root `README.md`, `docs/{roadmap,changelog… }` per CLAUDE.md — note: `docs/changelog.md`
  is Ethan-owned; append via PR discussion or record in `docs/VISION.md` instead if the
  changelog is off-limits — verify against repo CLAUDE.md before editing it).

### Goal

Make mutual funds a correctly-typed, discoverable, verified instrument class in Fathom, closing the
coverage + labeling gaps found in the audit. Three concrete changes:

1. **Unify fund typing (audit risk 4.1 / rec P1).**
   In `scripts/build-catalog.mjs`, stop defaulting funds to `Stock`. Preferred: replace the static
   `MUTUAL_FUND_TICKERS` allowlist with the Tiingo-search `assetType` signal the server already
   uses (`server/src/tiingo.mjs` `searchTiingo`) — factor that mapping into a shared module both
   the builder and server import, OR, if keeping the builder network-free is preferred, define a
   single shared curated `{ticker → type}` map imported by BOTH `build-catalog.mjs` and the
   `catalog.ts` semantic overlay so they cannot drift (VFINX is currently in one and not the other).
   Whichever route: the offline build and the server admission path must agree on fund typing, and
   the two curated lists must have a single source of truth.

2. **Curated fund seed (audit risk 4.3 / rec P2).**
   Add ~10 widely-held funds to the `SEMANTIC_OVERLAY` in `app/src/data/catalog.ts` with
   `type: 'Mutual fund'`, `cached: false`, and sensible `tags`/`aliases`:
   FXAIX, VFIAX, SWPPX, FCNTX, VBTLX, VTIAX, PRGFX, VWELX, DODGX, FMAGX (plus existing VTSAX,
   VFINX). `cached: false` marks them known-to-Tiingo-but-not-yet-cached so first load admits them.
   Confirm each admits before committing it (see smoke test) — drop any that Tiingo's free tier
   does not serve, and record which were dropped in the changelog/audit-report output.

3. **Coverage smoke test (audit risk 4.2 / rec P2).**
   New `scripts/audit-mutual-funds.mjs`: for a fund basket, hit Tiingo (reusing
   `server/src/tiingo.mjs` `fetchTickerFull`/`searchTiingo`, or a thin local fetch), and assert per
   fund: (a) admits with non-empty history; (b) `searchTiingo` returns `assetType: 'Mutual Fund'`;
   (c) distribution sanity — cumulative adjusted-return minus price-return over a multi-year window
   is positive and within a plausible band of the fund's trailing distribution yield (funds pay
   capital-gains distributions, not just income dividends — this is the one place fund adjustment
   differs from stocks). Emit a JSON/markdown coverage report to `scripts/output/`. Needs
   `TIINGO_API_TOKEN` — document that in the script header and skip gracefully (exit 0 with a clear
   message) when the token is absent so CI without secrets doesn't fail.

4. **Document the fund data contract (rec P3).**
   In `docs/DATA_SOURCES_TICKERS.md`: funds have `splitFactor ≡ 1`; distributions flow via
   `divCash` + `adjClose`; EDGAR fundamentals are intentionally skipped for non-Stock types
   (`server/src/index.mjs:239`). One short subsection.

### Acceptance criteria

- `build-catalog.mjs` types VTSAX **and** VFINX (and any offline-fetched fund) as `Mutual fund`,
  from a single source of truth shared with `catalog.ts` — demonstrated by a unit test that builds
  a catalog from fixtures containing a fund symbol and asserts the type.
- `app/src/data/catalog.ts` search returns the seeded funds for a name/symbol query
  (e.g. searching "fidelity 500" or "FXAIX" yields FXAIX typed `Mutual fund`) — covered by a
  vitest case.
- `scripts/audit-mutual-funds.mjs` exists, runs, and: with a token, writes a coverage report and
  exits non-zero if any *seeded* fund fails admission or distribution sanity; without a token,
  prints a skip notice and exits 0.
- No change under `app/src/engine/`. Real-data golden regressions unchanged.
- `docs/DATA_SOURCES_TICKERS.md` gains the fund data-contract subsection.

### test-cmd

```
cd app && npx vitest run && npx tsc -b
```

(Plus a manual/CI evidence run of `node scripts/audit-mutual-funds.mjs` with `TIINGO_API_TOKEN`
set — capture its coverage report as run evidence. The vitest+tsc gate is the fail-closed
verification; the Tiingo probe is evidence, not a blocking check, because it depends on a secret.)

### Notes for the implementer

- The server admission path (`admitTicker` → `searchTiingo`) is **already correct** — do not
  refactor its typing; the fix is bringing the *offline* build and the *seed lists* up to it.
- Watch the ETF-seed pattern in `build-catalog.mjs` and `catalog.ts` — mirror it for funds rather
  than inventing a new shape.
- Respect repo CLAUDE.md: never `git add -A`; funds add no personal/financial data so pushing is
  fine; verify in the running preview via DOM assertions if any UI chip/filter changes.
- Verify `docs/changelog.md` ownership before editing (CLAUDE.md lists it among Ethan's files); if
  off-limits, record the shipped change in `docs/VISION.md` instead.
