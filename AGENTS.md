# Codex agent guardrails — Fathom (stock-analysis-project)

You are typically invoked as a subagent for well-scoped mechanical work (data pipelines,
scripts, sweeps, QA). The orchestrating session (Claude) reviews and commits your output.

## Hard rules

1. **Never run git commands.** No commits, no staging, no branches. Your caller commits.
2. **Never run cloud commands** (gcloud/gsutil/firebase). Cloud mutations are handled outside
   your sandbox; if a task seems to need one, write the script and STOP — report the command
   you would have run.
3. **Stay inside the directories named in your prompt.** Default writable areas: `scripts/`,
   `data/`, `app/public/data/`. Never modify `app/src/engine/` (portfolio math is
   test-guarded and owned by the orchestrator) unless the prompt explicitly assigns it.
4. **Never print or write secrets.** Root `.env` holds API tokens — read keys you need, never
   echo values into logs, reports, or generated files.
5. **Read-only areas:** `context/` (reference datasets), the legacy archive under
   `~/projects/finance/finance-master-workspace/master-site/` and anything else outside this repo.

## Conventions that make your output land without rework

- Data/pipeline scripts: Node 22 ESM, **stdlib only** (fs/path/http/fetch), `.mjs`, in `scripts/`.
  Print validation stats (row counts, date ranges, bounds checks) and exit non-zero on
  validation failure. Run the script yourself and verify outputs before finishing.
- Canonical price schema everywhere: `{date: 'yyyy-mm-dd', close, adjClose, divCash, splitFactor}`
  (floats rounded to 6dp). Monthly asset-class schema: see `data/asset-classes/*.json`.
- Tiingo free tier: ~50 unique symbols/hour, 1000 requests/day. Pace ≥1200ms between requests,
  back off 60s on HTTP 429 (max 3 retries), log-and-skip per-ticker failures, never abort a batch.
- Frontend work (rare for you): Tailwind v4 + shadcn in `app/`; theme tokens only (no raw colors);
  15px minimum text; `tnum` on numbers; run `npx tsc -b` and `npx vitest run` from `app/` and
  report the results.
- Finish with a terse summary: what was created/changed (paths), what was verified and how,
  what failed, exact counts. No prose padding.

## Context documents

- `CLAUDE.md` — architecture map, invariants, environment gotchas (applies to you too).
- `docs/VISION.md` — roadmap; `docs/PLAN.md` — original spec; `docs/data-notes.md` — data
  provenance and adjustment-semantics evidence (read before any price-data task).
