# Fathom — Handoff Roadmap (Now / Next / Later)

_Written 2026-07-05. Each item is scoped so a context-free agent can execute it in one
session. Read [ARCHITECTURE.md](ARCHITECTURE.md) first, then root `CLAUDE.md` (hard
rules), then [VISION.md](VISION.md) for the decision history behind these items._

**Why this file and not `docs/roadmap.md`:** that file is Ethan's pre-project draft
(stale — it describes a MobX/Recharts plan that never happened) and is on the
do-not-touch list in CLAUDE.md; Windows is case-insensitive so `ROADMAP.md` would
collide with it. This file and VISION.md are the living roadmap.

**Legend:** `[CLOUD]` = needs gcloud/firebase auth, bucket writes, deploys, or secrets —
an autonomous agent should prepare the work and PARK the cloud step for Ethan's approval
rather than run it. `[ETHAN]` = needs a decision or manual console step from Ethan.

**Definition of done for every item:** `npx vitest run` and `npx tsc -b` green from
`app/`; UI changes verified in the running preview (DOM assertions, not screenshots);
engine/sim math changes carry hand-computed fixtures + green golden regressions;
committed with focused staging (never `git add -A`), then pushed.

---

## Now

- [ ] **Freshness catch-up pass for late-publishing EOD data.** First live
  full cycle (2026-07-16, 4 batches, 88/88, 0 failures, HTTP 200) surfaced a
  currency lag: freshThrough reported the PRIOR market date because the
  18:30/20:30 ET batches fetched before Tiingo published that day's EOD for
  their symbols. Make the final (00:30) invocation a catch-up pass: after its
  own batch, refetch any symbol whose latest close < the cycle's market date
  (budget-capped, reuse the 429 backoff). _Accept: freshThrough equals the
  cycle market date on the next healthy weekday cycle._


- [ ] **Subdue history-helper copy (Ethan top-priority, 2026-07-16).** Make the
  two helper messages more minimal/out of the way: "Using max available
  history — limited by ADBE, inception Aug 1986." (AllocationBuilder.tsx,
  BuilderPanel.tsx) and "Every rolling period in history as one trial. All
  figures in today's dollars." (Montecarlo.tsx). Keep the information
  reachable (muted/secondary treatment or disclosure), respect the 15px
  floor and theme tokens. Number-input spinner removal is ALREADY DONE
  (`4fbe3ad`, app/src/index.css `appearance:none` — CSS-only, so keyboard
  ArrowUp/ArrowDown increments are untouched); any follow-up must preserve
  that behavior. _Accept: both messages visually subordinate on their pages,
  vitest + tsc green, DOM-verified in preview._ (Filed from board notes
  note-20260716062926/063135; requested by Ethan via
  session:codex-fathom-todo-20260716.)

- [x] **Rate-budgeted ticker refresh with freshness contract.** *(done
  2026-07-16; cloud activation remains below)* The token-gated refresh endpoint
  now splits the catalog into automatically sized batches capped at 25 symbols,
  advances batches across one New York market-day cycle, retries provider 429s,
  and produces one aggregate report. `/api/freshness` fails visibly on missing,
  failed, or stale cycles. Server-native tests cover coverage, catalog growth,
  midnight cycle boundaries, aggregation, and stale/failure behavior.

- [ ] **Activate the quota-spaced Fathom refresh schedule.** `[ETHAN]` `[CLOUD]`
  Deploy the prepared Cloud Run server, then update the existing authenticated
  `fathom-nightly-refresh` job to `30 0,18,20,22 * * *` in
  `America/New_York`. The endpoint maps the 00:30 invocation to the prior market
  day and skips weekend cycles, so the existing secret header stays on one job.
  _Accept: `/api/freshness` returns HTTP 200 with `refreshed === catalogSize`,
  `failureCount === 0`, and a current `freshThrough` date after the full cycle._
  _Progress 2026-07-16 06:30Z (verified live, not assumed): Ethan's deploy is
  real — revision `fathom-api-00006-pqw` (created 06:10:25Z) serves 100% and
  exposes `/api/freshness`; scheduler shows the exact cron/timezone above,
  ENABLED. The 02:30Z fire predated the deploy (old code: 27/75, 48× 429), so
  the endpoint correctly reports 503 until the first full new-code cycle —
  batches fire 18:30/20:30/22:30 ET Jul 16 + 00:30 ET Jul 17; bucket catalog
  is 88 tickers → 4 batches. Acceptance check runs after 00:35 ET Jul 17._

- [x] **Quiet numeric controls and quote-date metadata.** *(done 2026-07-15)*
  Removed browser-native spinner arrows from number inputs without changing
  keyboard entry, bounds, steps, or value handling. The projection editor's
  current-price date remains full-size and readable but is visually subordinate
  to the price. CSS/component-only; no finance data, engine, API, auth, Firebase,
  backend, or deployment behavior changed.

- [x] **Local Firebase owner-token helper.** *(done 2026-07-15)* Signed-in
  local development sessions expose one account-popover action that
  force-refreshes the Firebase ID token and copies it directly to the clipboard.
  It never renders or logs credential bytes, returns no token to the UI caller,
  and is compiled out of production builds. Synthetic tests cover refresh,
  signed-out, and empty-token behavior. This supports finance-master's
  owner-gated migration without making Fathom a personal-finance data plane.

- [x] **Protect the work — remote backup.** VERIFIED 2026-07-05: the repo is pushed to
  `https://github.com/Calculator5329/fathom` (origin, up to date at `5327ab3`). The
  original concern ("no remote — best work exists only on this machine") is resolved.
  Residual actions below.
- [ ] **Ratify repo visibility + push discipline.** `[ETHAN]` The GitHub repo is
  currently **PUBLIC** (consistent with the AGPL license and recruiter-ready README —
  likely intentional, but never explicitly ratified). Ask Ethan: keep public, or flip
  private? Either way, update CLAUDE.md's working-style section if the answer changes
  anything. _Accept: Ethan's decision recorded in VISION.md; every local commit is
  pushed (local and origin `main` identical)._
- [x] **CI: GitHub Actions for vitest + tsc.** *(done 2026-07-10)* No cloud secrets
  needed — tests run on committed data. Workflow: checkout, Node 22, `npm ci` in
  `app/`, `npx vitest run`,
  `npx tsc -b`. _Accept: workflow file committed; a push to `main` shows a green check
  on GitHub; no secrets referenced._
- [ ] **Flag stale untracked docs to Ethan.** `[ETHAN]` `docs/roadmap.md`,
  `docs/original-plan.md`, `docs/tech_spec.md`, `docs/changelog.md` are his untracked
  drafts, superseded by VISION/PLAN/this file. Do NOT edit or delete them — ask whether
  to archive. _Accept: Ethan answered; outcome noted in VISION.md._
- [x] **Monte Carlo: nominal display toggle.** _(done 2026-07-10, burndown w2)_ Sim is
  correctly real-only internally; add a display-layer toggle that re-inflates outputs
  using the CPI series already in the asset-class data. No engine changes. _Accept:
  toggle on /montecarlo; real mode byte-identical to today; nominal mode spot-checked
  against hand-computed CPI compounding fixture; URL param ADDED (never renamed) per the
  codec contract._

## Next

- [ ] **X-ray: support a second broker's CSV (Schwab or Vanguard).** Extend
  `app/src/xray/parse.ts` behind a format-sniffing layer; Fidelity behavior must stay
  byte-identical (existing parser tests untouched and green). Needs sample CSVs —
  synthesize fixtures from the brokers' documented export formats if no real files.
  _Accept: new-format fixture tests pass; Fidelity regression tests unchanged._
- [ ] **Research: valuation ratios vs their own history (percentile bands).** VISION
  Tool-5 follow-up. Data already computed per year; render P/E, P/S, etc. vs their own
  10/25/50/75/90th percentiles. _Accept: bands on /stock/:symbol valuation charts;
  chart colors via cssVar tokens; no hover emphasis on bars._
- [ ] **Expand pre-built fundamentals coverage.** `[CLOUD]` Run
  `scripts/build-fundamentals.mjs` across the full ~75-ticker price universe and sync
  to the bucket. Script run is local; the `gcloud storage cp` sync is the parked cloud
  step. _Accept: script validation stats printed and clean; sync command written out
  and parked for approval._
- [ ] **Monte Carlo: parametric mode** (user-set mean/vol/correlation). The last
  unshipped mode from VISION Tool 4. _Accept: fixtures for the parametric draw
  (seeded RNG), fan chart renders, existing modes' outputs unchanged._
- [ ] **Dividend income planner** (VISION backlog): forward yield on today's portfolio,
  income calendar by month, per-holding dividend growth. Extends the Income tab from
  data already in ticker JSONs. _Accept: hand-computed forward-yield fixture; works on
  a shared backtest URL with no login._

## Later

- [ ] **Extract the engine as a shared package.** `app/src/engine/` is pure TS /
  zero-dep by design — publishable nearly as-is. Consumers: finance-master
  (deep-link integration could deepen) and retirement-sim. See IDEAS.md #1 for the
  plan; do NOT start before Ethan ratifies the repo/package boundary. `[ETHAN]`
- [ ] **N-asset efficient frontier** (currently two-asset) — quadratic-programming-free
  approach (random portfolios + hull) keeps it client-side.
- [ ] **More asset classes** (international equity, gold, REITs) via provenance-checked
  pipeline scripts per the established pattern (validation stats, data-notes.md entry).
- [ ] **Screener over the fundamentals lake** — see IDEAS.md #3.
- [ ] **Alerts (price/valuation thresholds).** `[CLOUD]` Needs a scheduled job +
  email/push channel — park infrastructure for approval.
- [ ] **Simulated leverage** (PLAN v1.5): daily return × leverage − borrow − ER with an
  explicit "Simulated" badge; validate against cached TQQQ/UPRO.
- [ ] **Product publishing pass** `[ETHAN]` `[CLOUD]`: custom domain, analytics,
  SEO/OG audit, a "what is Fathom" about page, Show HN post.

## Standing rejections (do not build)

- Backtest→Monte Carlo handoff button (Ethan rejected 2026-07-04).
- `useUrlSyncedState` hook (judged unnecessary — PUSH/REPLACE semantics are page logic).
- Login walls on Backtest/Allocation — never.
- Personal budgets/net-worth features — those belong to finance-master.
