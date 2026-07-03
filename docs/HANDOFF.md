# HANDOFF — Fathom (stock-analysis-project)

You are picking up mid-build on **Fathom**, a personal, public (no login) finance-tools site. Read [docs/PLAN.md](PLAN.md) first (full product plan), then this file (current state + next task). Also read [docs/data-notes.md](data-notes.md) if touching data.

The user is Ethan. Working style he expects:
- **Commit + push each self-contained change.** Stage only files you created/edited — never `git add -A`. (No remote is configured yet; commit locally.)
- He encourages **delegating grunt work to Codex subagents**: `codex exec` is installed (v0.142.3). Pipe the prompt via stdin (PowerShell here-strings as args hang it): write prompt to a temp file, then `cat prompt.md | codex exec --sandbox workspace-write -C <projectRoot> -`. Add `-c sandbox_workspace_write.network_access=true` if the task needs network. Tell it NOT to run git commands; review its output, then commit yourself.
- Keep judgment work (design, math semantics, API shape) yourself; delegate mechanical scripts/sweeps.
- No permission-asking for reversible work — just do it and report.

## Current state (all committed on `main`, local repo)

```
6c951c0 Add backtest engine with 20 passing tests
d5004c1 Add Tiingo fetch layer with archive cross-validation
50fa876 Plan: series belong in Cloud Storage, not Firestore
f44dc34 Tighten card density per feedback
eaac3bd Scaffold Fathom app with Ledger Dark theme + archive analysis
f551f85 Add master plan for stock analysis suite
```

### What exists and works

1. **`app/`** — Vite + React 19 + TS + Tailwind v4 + shadcn/ui (radix, 11 components in `src/components/ui/`).
   - Theme "**Ledger Dark**" fully tokenized in [app/src/index.css](../app/src/index.css): OKLCH colors, near-black green-cast canvas, 4-step surface ladder (`bg-surface-1..4`), single emerald accent (`--primary`), `--gain`/`--loss`, chart-1..5 palette, Inter Variable + JetBrains Mono (both installed via @fontsource-variable), **15px text floor** (text-xs and text-sm both remapped to 0.9375rem), `tnum` utility for tabular numerals, `animate-enter` (fade + 4px rise, 180ms).
   - [app/src/pages/Styleguide.tsx](../app/src/pages/Styleguide.tsx) is the current App — Ethan approved it after one round of feedback (**he wants dense cards — don't add airy padding; Card defaults were tightened to py-4/gap-3/px-5**).
   - `npm test` (vitest) and `npx tsc -b` both green.
2. **Backtest engine** — [app/src/engine/](../app/src/engine/) pure TS, no deps: `runBacktest(seriesList, portfolio, config) -> BacktestResult`. 20 passing tests incl. real-data regressions. Semantics are documented in types.ts and were reported to Ethan (accepted): adjClose ratios for reinvested dividends; cash bucket at 0% when not reinvesting; flows/rebalancing at start-of-day at prior close; vol/Sharpe/Sortino from monthly returns ×√12 (Portfolio Visualizer convention); metrics from TWR index; IRR separate.
3. **Data layer (local half)** — [scripts/fetch-tiingo.mjs](../scripts/fetch-tiingo.mjs) fetches any ticker's full history to `data/tickers/<T>.json` (gitignored) in canonical schema `{date, close, adjClose, divCash, splitFactor}`; rate-limited for Tiingo free tier. SPY/VTI/AAPL/KO/BND already on disk. `--validate` cross-checks vs a legacy 1,570-ticker archive (see data-notes.md). **Decision: Tiingo is canonical; archive is validation-only.**
4. **Credentials/infra ready**: Tiingo token in root `.env` (`TIINGO_API_TOKEN`, gitignored — never commit/print it). GCP project **ethan-488900** (billing on), gcloud CLI authenticated, Firebase CLI 15.2.1 installed. APIs already enabled: Cloud Run, Firestore, Cloud Scheduler, Secret Manager, Cloud Storage.

## Next task (Ethan approved): Builder + Results screens

Build Tool 1's two real screens per PLAN.md §4, wired to the engine with the local data files. Concretely:

1. **Charting**: pick ECharts (leaning) or visx. Needs: growth-of-$10k line (log toggle), drawdown area chart sharing x-axis, annual-returns bars. Dark theme must use the CSS chart tokens; no chartjunk; readable without hover.
2. **Data access for now**: load `data/tickers/*.json` locally (Vite can serve them via a symlink/copy into `app/public/data/` or a tiny dev-only fetch shim — cloud API comes later). Only 5 tickers exist locally; fetch more with `node scripts/fetch-tiingo.mjs <TICKERS>` as needed.
3. **Builder screen** (PLAN.md §4 Screen B): ticker rows with autocomplete (against locally available tickers for now), weight %, auto-balance, ≠100% inline validation; "+ Compare another portfolio" ghost button reveals portfolios 2–3; date range defaults to max common history and names the limiting ticker; collapsed Advanced section (initial amount, monthly contribution, rebalancing, reinvest toggle, benchmark).
4. **Results screen** (§4 Screen C): metric cards (Final value, CAGR, Volatility, Max DD, Sharpe), growth + drawdown charts, depth tabs (Annual / Rolling / Risk / Income / Holdings — ship Annual + Risk first, stub the rest), builder docked as collapsible left panel, instant recompute on change, full config in URL query string (`?p1=VTI:60,BND:40&start=...`) — copy-link button.
5. Add react-router (routes: `/` landing stub, `/backtest`, `/styleguide`).
6. Keep every UX rule from PLAN.md §1: ≤7 interactive elements initially, smart defaults (a single ticker should instantly produce a full backtest), 15px floor, tnum for all numbers, controls appear on hover/need.

After screens: cloud half (GCS bucket for series JSONs, Cloud Run API for search/on-demand fetch, nightly Cloud Scheduler refresh, Firebase Hosting deploy) — PLAN.md §2. Then Tool 2 (asset allocation; its 100+ year datasets are already in `context/reference-data/`).

## Environment gotchas (learned this session — will save you an hour)

- **Windows, PowerShell 5.1.** The shell cwd sometimes resets between tool calls — `Set-Location` to an absolute path at the start of every command that cares, and verify with `Get-Location` before `npm install` (an install once landed in the repo root by accident; if that happens: delete root `node_modules/` + generated `package.json`).
- **Do not edit source files via PowerShell string replace** — it mangles UTF-8 (em-dashes/arrows became mojibake once). Use proper file-edit tools; prefer HTML entities (`&mdash;` etc.) in JSX text.
- Port 5173 is occupied by an unrelated process. `.claude/launch.json` has `autoPort: true` and `app/vite.config.ts` reads `process.env.PORT`. Preview screenshot tooling was flaky (timeouts) — verify via DOM inspection/eval instead.
- shadcn CLI v4: `init` goes into create-new-project mode with `-t vite` and prompts interactively otherwise. **Skip init**; `components.json` already exists — `npx shadcn@latest add <component> -y` works fine. `tslib` had to be added manually (unified radix-ui needs it); if Vite says "Failed to resolve import tslib", delete `app/node_modules/.vite` and restart dev server.
- TypeScript 6: `baseUrl` is deprecated (removed already — don't re-add). Node types are in tsconfig.app.json `types` so engine tests (which read data files with node:fs) typecheck.
- Root `package-lock.json`, `stock-analysis/` (old abandoned starter), `README.md`, `DATA_SOURCES_*.md`, `SOURCE_PROJECTS.md`, `docs/{changelog,roadmap,tech_spec}.md` are Ethan's pre-existing files — leave them alone, don't commit them.

## Design guardrails (Ethan's explicit preferences)

Linear-inspired dark, minimal, intentional. One emerald accent — never flood it. Dense cards (he flagged empty space once already). Readable text ≥15px always. Tabular numerals on every number. Buttons/actions appear as needed, not all at once. Every screen states its user story. No decorative animation beyond the 150–200ms enter/hover transitions.
