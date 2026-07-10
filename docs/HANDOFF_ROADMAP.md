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
