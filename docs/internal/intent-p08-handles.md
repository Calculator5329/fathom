# P08: Fathom control journeys and local voice navigation

2026-09-04. No deployment or publication. Parent session owns integration.

## Reconcile before building

The audit's initial 3/10 route figure was stale. Fathom already held 13 journey
records: seven control paths and six URL paths. Overlay, watch/replay, identity
history, and a drive protocol were already implemented in Agent Handles.
Actual Budget adoption and the showcase site are active elsewhere; no second
adoption or competing showcase was started.

The current app declares 12 route patterns. This pass exercises `/`, `/backtest`,
`/allocation`, `/income`, `/montecarlo`, `/stock`, `/stock/:symbol`, `/xray`, and
not-found recovery (`*`). `/projections` and `/links` remain behind the recorded
real-auth wall. `/styleguide` is an internal component gallery, outside this
product-journey claim. This is nine declared patterns, not every possible state.

## Concrete repairs and additions

- Existing replay/compiled reconciliation misclassified focusable Radix tablist
  and tabpanel containers. A separate Handles lane changes the single shared
  runtime predicate. Actual tabs, unidentified buttons, and native controls with
  misleading container roles stay observable. The original Fathom journeys and a
  real browser bad-control injection supply both halves beyond new unit probes.
- Research rendered the same segmented option identity in several different
  cards. Each Research instance now has a stable scope. Existing default IDs
  remain available for other single-instance callers.
- The calendar's previous/next month buttons lacked source-owned identities.
  Both now have IDs. The existing allocation journey presses Enter to commit its
  typed date before clicking the inflation switch, matching the real control
  flow instead of clicking through an open calendar.
- The ticker-switcher keyboard boundary and external-resource links now have
  stable identities. Authenticated link use is still not exercised.
- Tests use synthetic market/asset/fundamental responses and block external
  requests. They reuse the actual app controls, calculation/rendering flow,
  existing compiled journeys, and existing paced executor.
- New checks edit/reopen Income and Monte Carlo URL state; analyze/reload X-ray
  local state; perform paced Research navigation with receipts; reject unknown
  targets; and prove a genuinely unidentified native button still appears in
  runtime observations.

## Bounded voice prototype

Open the development app at `/?voice-demo` on localhost. The prototype reuses
Forge Shell's `dictation.ts` module verbatim, with its origin recorded. Browser
speech or existing system dictation fills an editable draft. Six public
navigation destinations are supported. Unknown, ambiguous, account, purchase,
or arbitrary commands produce no action. A separate Confirm navigation click
sends the chosen existing handle to the local token-protected Handles protocol
and displays its real success/refusal receipt. Speech never directly executes.
The microphone starts only on Listen, uses the browser's existing speech
service, and has the existing terminal error/cancel behavior. No speech backend,
paid API, account capability, global shortcut or automation was added.

Browser tests cover typed input, a simulated browser speech-result event, visible
confirmation, and real Handles navigation. They do not claim acoustic accuracy
or a physical microphone check. Actual speech-service availability/permission is
visible to the user; typing/system dictation remains usable when unavailable.

The prototype is imported only under `import.meta.env.DEV`, loopback hostname,
and explicit `voice-demo` query. `tests/assert-production.mjs` checked 39 built
JavaScript bundles for prototype/drive markers and found none. This is a local
prototype, not a production voice release.

## Reproduce

From `app/`, reuse the installed dependencies. No install or lockfile update was
performed. The dedicated configuration uses Playwright's installed browser by default. Set
`CHROMIUM_PATH` only when explicitly reusing a system browser; this host used
`CHROMIUM_PATH=/usr/bin/chromium`.

```sh
node node_modules/agent-handles/bin/agent-handles.mjs journeys compile
PORT=5298 npx playwright test --config tests/playwright-p08.config.ts --repeat-each=2
npx vitest run
npx tsc -b
npm run build
node tests/assert-production.mjs
```

Before the Handles repair is integrated, use its isolated lane as
`P08_HANDLES_ROOT` when running Playwright, and that lane's CLI to compile.
The test-only Vite configuration substitutes that reviewed package and allows
fonts from the reused dependency directory. Production configuration is unchanged.
It ignores generated `.agent-handles` evidence for hot reload. Never edit source
or test files during a verification run; one exploratory replay timed out after
concurrent edits, and its failure evidence is retained.

## Verification evidence and honest limits

Fathom unit suite: 165 passed, 9 pre-existing real-data skips; TypeScript and
production build passed. Agent Handles complete suite: 122 passed, 1 skipped.
The focused predicate probes: 5 passed. The 13 existing compiled journeys observe
192 distinct concrete identities across their visited states, with zero unknown,
unidentified or duplicate identities in their final receipts. Dynamic instances
and static source candidates have different denominators; they are not a single
coverage percentage. The first frozen repeated run passed all 40 named checks in 76.2 seconds, with
zero skipped, flaky or unexpected outcomes. The same checks are rerun below
after isolating their configuration.

Migration from the old v1 registry to current v3 is archived under
`app/.agent-handles/migrations/`. Current source coverage is 145 identified out
of 146 control candidates. The one unresolved site is the shared `Input`
implementation forwarding its caller's `data-testid`; runtime callers in the
selected journeys are identified. It remains unresolved in v3 evidence rather
than being silently excluded, assigned a fabricated singleton ID, or given an
invented owner verdict. No claim of full `adopt verify` or complete hidden-state
coverage is made.

The Handles CLI unexpectedly executes adoption for `adopt --help`. This happened
in the isolated app, then was reproduced in a disposable synthetic fixture:
13 generated files, exit 0. Preserved records are
`.agent-handles/help-mutation-confirmed.json` and `help-reproduction/`. A separate
argument-order probe (`adopt --help --root ...`) refused an unknown command and
made no changes; it is recorded separately. The CLI help defect is a bounded
follow-up, not a reason to bypass migration or rewrite schema policy.

## Review correction and handoff

Parent review on 2026-09-04 found that the synthetic harness had replaced the
default Playwright suite. The default `app/playwright.config.ts` is restored
byte-for-byte. P08 now runs only with explicit
`--config tests/playwright-p08.config.ts`; its `p08.check.ts` filename avoids
default spec discovery and duplicate imports. Normal installed browser defaults
remain intact, with an explicit `CHROMIUM_PATH` override for this host.
Generated skills, prompts, migration archives and raw traces are preserved
locally and must not be blanket-staged.

Delivered for review: the runtime predicate repair, concrete Fathom identity
repairs, synthetic selected journeys, and local confirmed voice prototype.
Parent owns Git review/integration of both dirty isolated lanes; no Git or
deployment was performed by this child.

Named, not built: authenticated Links/Projections journeys need a deliberate
owner-auth test session; physical microphone/acoustic accuracy remains a manual
check. These are outside the selected public prototype acceptance.

Found, unresolved: CLI `adopt --help` mutation and v3 Input-forwarding source
attribution need bounded Handles follow-ups. Their preserved evidence is useful
without inventing an owner verdict or blocking this app's public journey proof.

Integration correction: preserve unrelated canonical dirty roadmap/VISION edits
in canonical, without copying them into this lane. The lane roadmap adds only
the P08 closure to its own base; parent preserves/restores separate dirty work.

## Final isolated verification

At 2026-09-04T04:48:20.280Z, the explicit P08 configuration passed all
40 named checks (20 × 2), zero skipped, unexpected or flaky outcomes, in
82.0 seconds. Both paced replays returned
11 successful receipts and ended on AAPL. The unchanged default configuration
still discovers exactly the original 13 tests. The isolated Playwright run
created and stopped its own local server.

Local raw report: `app/tests/.agent-handles/p08-isolated-report.json`.
Paced screenshots: `app/.agent-handles/p08-isolated/`. Earlier frozen
verification and exploratory failures remain preserved under `.agent-handles`.
A completed Research screenshot was visually inspected: stable scoped controls,
synthetic data clearly labeled, and legible valuation bands/median.

Final predicate review preserved the pre-existing contenteditable selector,
including plaintext-only. The compiled spec was regenerated; a real Chromium
DOM probe preserved plaintext-only edits, actual tabs and native buttons while
excluding contenteditable=false tabpanels and tablists. This focused final
correction does not imply a third 40-check full run.

Integration order: Agent Handles predicate and trigger proof, then Fathom source,
compiled journeys and v3 registry. Do not stage generated `.agent-handles` paths,
`.claude` skills, `agent-handles-adoption.json`, dependency symlinks or build output.
`agent-handles.json`, `testid-ratchet.json`, `journeys-map.html` and the default
Playwright config have no intended change.

Follow-up closure prepared on 2026-09-04: the explicitly authorized separate
Handles lane `intent-p08-cli-help-20260904` makes help read-only. All 14 existing
adoption plus new help tests passed; a preserved valid fixture proves zero help
artifacts and normal adoption's 13 outputs. It is awaiting parent integration.
The final runtime predicate focused suite passed six tests across two files.
