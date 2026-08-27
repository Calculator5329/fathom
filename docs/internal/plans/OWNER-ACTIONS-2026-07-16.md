# Fathom owner actions — 2026-07-16 (morning/evening packet)

Prepared by `session:fable-long-run-20260716-1900` per D7. Each block is
copy-paste ready; nothing here has been run by an agent. No secrets appear in
this file — anything token-shaped stays in Secret Manager or `.env`.

## 1. Push fathom main (2 min, safe)

Local main holds verified commits (server freshness `12d7203`, UI polish
`4fbe3ad`, helper-copy TODO `cb37694`, integrated helper-copy lane, D6 design
package pending gate — see §3). The deployed Cloud Run revision already runs
this code; pushing just makes git match production.

```sh
cd ~/projects/finance/fathom
git log --oneline origin/main..main   # review what goes out
git push origin main
```

- **Changes:** publishes committed code/docs to public Calculator5329/fathom.
- **Why agent can't:** classifier enforces Fathom pushes as Ethan-only.
- **Success:** `main -> main` fast-forward; `git status` clean.
- **Undo:** revert commit (never force-push).

## 2. Freshness cycle acceptance (read-only, after 23:35 CDT tonight)

Scheduler fires 18:30/20:30/22:30 ET today + 00:30 ET tomorrow (4 batches,
88-ticker catalog). After the last fire:

```sh
curl -s https://fathom-api-108003293186.us-central1.run.app/api/freshness | python3 -m json.tool
```

- **Accept:** HTTP 200, `complete: true`, `refreshed == catalogSize`,
  `failureCount: 0`, `freshThrough` = 2026-07-16.
- An agent in the loop checks this automatically; nothing needed from you
  unless it cards you a failure.

## 3. Entropy-gate decision (90 sec — also queued in ETHAN-QUEUE)

Two GREEN fathom docs lanes are stranded by integration entropy-gate false
positives (a labeled sha256 digest; a kebab-case filename). Either:

```sh
# option a: narrow allowlist, integrate, then remove the allowlist
cd ~/projects/finance/fathom
# add the two exact flagged strings to .orc/gate.json "allow": [...]
agent integrate a23-duplicate-divergence-map-20260716 --repo finance/fathom --target main
agent integrate d6-design-broker-csv-valuation-bands-20260716 --repo finance/fathom --target main
```

or (option b) approve the gate-FP fix lane on the orchestrator (roadmap
Dogfood item filed 2026-07-16) and re-integrate afterwards.

- A23 finding: `stock-analysis-project` is a pure ancestor of fathom (7
  behind, zero unique commits/files) — approved D8 consolidation = archive
  the duplicate, no merge needed. Exact guarded steps are in the lane's
  report (branch `agent/codex/a23-duplicate-divergence-map-20260716`).
- D6 package: broker-CSV + valuation-bands design doc + mockup sheet on
  branch `agent/codex/d6-design-broker-csv-valuation-bands-20260716`.

## 4. D7 publication/cloud expansion (when you have time; all Ethan-only)

Current state: Cloud Run API `fathom-api` healthy on the new revision;
frontend Firebase Hosting last deployed 2026-07-05 (stale vs current app).

1. **Refresh the hosted frontend** (most valuable single step):
   ```sh
   cd ~/projects/finance/fathom/app
   npx vitest run && npx tsc -b   # gates
   npm run build
   cd .. && firebase deploy --only hosting
   ```
   Success: site shows the UI polish (no number-spinner arrows) and current
   data. Undo: `firebase hosting:rollback`.
2. **Custom domain** (optional): Firebase console → Hosting → Add custom
   domain; DNS A/AAAA records at your registrar; certificate auto-provisions.
3. **Analytics** (optional, decide privacy posture first): plausible/GA4
   snippet in `app/index.html` — recommend the privacy-light option; agents
   can wire whichever you name.
4. **Alerts** (optional): Cloud Monitoring uptime check on `/api/freshness`
   expecting 200 (it is 503 mid-cycle by design — set the check window to
   05:30–18:00 ET or alert only on 2+ consecutive failures at 06:00 ET).

## 5. D1 Finance-master cutover (unchanged, when ready)

Canonical runbook: `~/projects/finance/finance-master/docs/FIREBASE-MIGRATION.md`
(uses the dev-only "Copy owner token" control in Fathom; never paste the token
into chat or files). Deliberately deferred — no time pressure.
