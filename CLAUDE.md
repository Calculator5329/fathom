# Fathom — stock-analysis-project

All-things-stocks analysis suite (backtesting, allocation, projections, Monte Carlo).
Companion app to the personal-finance project at `C:\Users\et2bo\Desktop\New folder\finance-master`
(that one owns budgets/net-worth/personal money; THIS one owns markets. Keep the boundary clean:
Fathom never stores personal account balances; finance-master never re-implements market analysis).

Read [docs/VISION.md](docs/VISION.md) for the roadmap, [docs/PLAN.md](docs/PLAN.md) for the original
product spec, [docs/data-notes.md](docs/data-notes.md) before touching data.

## Commands

- Dev server: use the preview tooling with `.claude/launch.json` ("app"); port 5173 is taken by
  another project, autoPort is on and vite reads `process.env.PORT`.
- Tests: `npx vitest run` from `app/`. Typecheck: `npx tsc -b` from `app/`. BOTH must pass before
  every commit. PowerShell cwd sometimes resets between calls — `Set-Location` with absolute path
  and verify with `Get-Location` before any npm command.
- Fetch ticker data: `node scripts/fetch-tiingo.mjs SPY QQQ ...` (skips existing; Tiingo free tier
  ≈50 unique symbols/hour, 1000 req/day — batches self-throttle but big batches will 429 and retry).
- Rebuild catalog: `node scripts/build-catalog.mjs`. Asset classes: `node scripts/build-asset-classes.mjs`.
- Sync data to cloud: `gcloud storage cp --cache-control="public, max-age=3600" data/tickers/*.json
  app/public/data/tickers/catalog.json gs://ethan-488900-fathom-data/tickers/`.

## Architecture (what lives where)

- `app/` — Vite + React 19 + TS + Tailwind v4 + shadcn (radix). Routes: `/`, `/backtest`,
  `/allocation`, `/styleguide`.
- `app/src/engine/` — THE backtest engine. Pure TS, zero deps, fully unit-tested. All portfolio
  math lives here and ONLY here.
- `app/src/data/` — catalog + series loaders (local `public/data` in dev, GCS bucket in prod via
  `VITE_DATA_BASE_URL`), asset-class adapter.
- `app/src/projections/` — Tool 3: projection model (pure, tested), Firestore store, editor.
  `app/src/auth/AuthContext.tsx` — Firebase Google auth. IMPORTANT: AuthProvider is scoped to the
  `/projections` route (not main.tsx) so the Firebase SDK stays out of the initial bundle — keep
  it that way. `app/src/lib/firebase.ts` holds the PUBLIC web config (safe in client; security is
  rules + auth). Firestore rules in `firestore.rules` (per-uid access, deployed).
- `server/` — Cloud Run API `fathom-api` (us-central1): `/api/health`, `/api/search`,
  `/api/ticker/:SYM` (admits unknown tickers: Tiingo → bucket → catalog), `/api/refresh`
  (token-gated nightly). Deploy: `gcloud run deploy fathom-api --source server ...` (see git log
  for full flags). Secrets in Secret Manager (`tiingo-token`, `fathom-refresh-token`) — NEVER
  commit or print them; root `.env` is gitignored.
- `scripts/` — data pipeline (fetch, catalog, asset classes, archive analysis).
- `data/` — asset-class JSONs committed; `data/tickers/` gitignored (source of truth = GCS bucket
  `ethan-488900-fathom-data`, public read). Cloud Scheduler `fathom-nightly-refresh` runs 10:30pm
  ET weekdays.
- GCP project `ethan-488900`; gcloud is authenticated locally.

## Non-negotiable invariants

1. **Engine math is sacred.** Any change to `app/src/engine/` needs unit tests against
   hand-computed fixtures AND the real-data regressions must stay green (SPY 1994–2023 CAGR ~10%,
   GFC drawdown −50..−58% troughing 2009-03, real US stocks 1871–2023 CAGR ≈6.9%). Metrics use
   Portfolio Visualizer conventions (monthly returns ×√12); metrics come from the TWR index, never
   from raw values when flows exist.
2. **Nightly refresh is FULL refetch per ticker, never append** — adjusted closes rebase whenever a
   dividend is paid; appending silently corrupts history.
3. **URL is the canonical backtest state** (`?p1=VTI:60,BND:40&...`), but the editor keeps local
   state so transient shapes (empty portfolio, zero-weight row) survive editing. Structural edits
   PUSH history; tweaks REPLACE. Don't regress this — it has burned us twice.
4. **Tools 1–2 (backtest, allocation) never require login.** Ever. Auth arrives only with
   user-owned data (projections, portfolios) per VISION.md.
5. **Series data lives in GCS, not Firestore** (1MB doc limit + cost). Firestore is only for small
   per-user documents once auth exists.
6. **Stale-while-revalidate in the hooks:** results panels must never unmount during recompute or
   mid-edit; keep last good results and dim.

## Design system — Ledger Dark (tokens in app/src/index.css)

Near-black green-cast canvas, 4-step surface ladder, hairline borders, ONE emerald accent
(never flooded), `--loss` red is the only other chromatic. Rules Ethan enforces:
- Text floor 15px (text-xs/sm are remapped — don't use raw smaller sizes).
- `tnum` class (tabular numerals) on every number; mono font for tickers/dates/values.
- DENSE cards — he has rejected airy padding twice. Card defaults are py-4/gap-3/px-5.
- Progressive disclosure: ≤7 interactive elements initially; row actions on hover; Advanced
  collapsed; controls appear when needed.
- Charts: use `--chart-1..5`/`--gain`/`--loss` CSS vars via `cssVar()`; ECharts hover emphasis is
  DISABLED on bars (hover restyled them destructively); no dashed crosshair on bar charts; growth
  and drawdown tooltips are intentionally independent (no group connect).
- New screens state their user story in a comment at the top of the page component.

## Environment gotchas (each cost real time once)

- NEVER edit source files via PowerShell string-replace — it mangles UTF-8 (use file tools; prefer
  `&mdash;`-style entities in JSX text).
- shadcn CLI: `components.json` exists; use `npx shadcn@latest add <name> -y`. Do NOT run `init`
  (goes interactive / create-project mode). If Vite errors "Failed to resolve import tslib",
  delete `app/node_modules/.vite` and restart.
- Radix Select and native `<select>` both fail inside Radix Popover — the calendar uses a custom
  portal-free `CaptionDropdown` in `app/src/components/ui/calendar.tsx`. Reuse that pattern for
  any dropdown inside a popover.
- `/healthz` is reserved by Google's frontend on run.app — service health is `/api/health`.
- Secrets via PowerShell pipes pick up trailing CRLF (Tiingo 403s). Write with
  `[IO.File]::WriteAllText` and `.trim()` defensively server-side.
- TS 6: `baseUrl` is deprecated; path aliases are configured without it.

## Working style (Ethan's rules)

- Commit each self-contained change; stage only files you created/edited; NEVER `git add -A`.
  No remote configured yet — commit locally.
- Verify UI changes in the running preview before committing (drive the DOM via eval; the
  screenshot tool times out — use DOM assertions).
- Delegate mechanical work to Codex subagents (see AGENTS.md for their guardrails):
  write prompt to a temp file, then
  `cat prompt.md | codex exec --sandbox workspace-write -C <projectRoot> -`
  (add `-c sandbox_workspace_write.network_access=true` for network). Cloud mutations (gcloud IAM,
  buckets, deploys) stay with Claude directly — the permission classifier blocks them inside Codex
  anyway. Review Codex output, then commit it yourself.
- Keep judgment work (engine math, API shape, design) in the main session; Codex gets
  well-specified data/scripts/sweeps with explicit "do not touch X" boundaries.
- Leave Ethan's files alone: root `README.md`, `DATA_SOURCES_*.md`, `SOURCE_PROJECTS.md`,
  `docs/{changelog,roadmap,tech_spec}.md`, `stock-analysis/` (dead starter), `context/`,
  root `package-lock.json`.
