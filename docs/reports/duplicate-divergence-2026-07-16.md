# Duplicate divergence report: Fathom vs stock-analysis-project

_Snapshot: 2026-07-16 02:00 CDT. This was a local, read-only comparison of
`/home/ethan/projects/finance/fathom` and
`/home/ethan/projects/finance/stock-analysis-project`. No fetch, checkout,
merge, move, commit, push, cloud command, or source/data edit was performed._

## Executive conclusion

There is no two-sided Git merge to perform. `stock-analysis-project/main` at
`cd6ba93` is the exact merge base of the two local heads and is already an
ancestor of `fathom/main` at `9619fa6`. Fathom has seven unique commits; stock
has zero. At the tracked-tree level, Fathom has four additional files and
thirteen newer versions of files that also exist in stock. Stock has no unique
tracked file and no staged, unstaged, or untracked work.

The only stock-only payload is ignored local state, chiefly 75 ticker files and
34 fundamentals files under `data/`, plus an old broken Claude worktree
snapshot. The ticker cache ends on 2026-07-02 and is not the current canonical
dataset; the repository contract says GCS is canonical, and Fathom's current
roadmap records a live catalog of 88 tickers. Preserve all of this ignored state
by moving the complete duplicate checkout into the workspace archive, but do
not copy it into active Fathom data paths.

**Recommendation: GO for archive after verification. No content merge or
cherry-pick is needed.** Push/verify Fathom, archive the complete stock checkout
without deleting anything, update `workspace.json`, and retain the archived
checkout as the rollback source.

## Scope and method

- Commit comparison: local `main` heads, using `merge-base`, `rev-list`, and
  `log --left-right`. Fathom's object database already contains both heads.
- File comparison: tracked trees at the two heads. "Newer" below means newer by
  commit ancestry, not filesystem modification time.
- Working-tree comparison: `status --porcelain`, staged and unstaged diffs, and
  an ignored-path inventory in stock.
- Data comparison: direct on-disk inventory and hashes under each root `data/`.
- Remote caveat: no fetch was allowed. Local remote-tracking refs are snapshots,
  not proof of the current GitHub state.

## Repository and history state

| Property | Fathom | stock-analysis-project |
| --- | --- | --- |
| Path | `/home/ethan/projects/finance/fathom` | `/home/ethan/projects/finance/stock-analysis-project` |
| Branch | `main` | `main` |
| HEAD | `9619fa6d5d05efad52ed72c7b13984c601d175b6` | `cd6ba930fe9accc9495cb43e1e8c919d709c70ea` |
| HEAD authored | 2026-07-16 01:45:56 CDT | 2026-07-13 18:02:24 CDT |
| Remote URL | `https://github.com/Calculator5329/fathom.git` | same |
| Local `origin/main` | `fc9cad5252558e10a9252f2d8ea8e3b418fe6125` | `cd6ba930fe9accc9495cb43e1e8c919d709c70ea` |
| Status vs local tracking ref | ahead 5, behind 0 | ahead 0, behind 0 |
| Tracked files at HEAD | 196 | 192 |

The merge base is
`cd6ba930fe9accc9495cb43e1e8c919d709c70ea`, exactly stock's HEAD.
`git rev-list --left-right --count fathom...stock` returns `7 0`.

### Commits unique to Fathom

| Commit | Authored (CDT) | Subject |
| --- | --- | --- |
| `98f1618` | 2026-07-15 00:19:55 | `feat: Add local Firebase owner-token helper` |
| `fc9cad5` | 2026-07-15 00:20:42 | `Merge remote-tracking branch 'origin/main'` |
| `4fbe3ad` | 2026-07-16 01:33:44 | `style(app): quiet numeric controls and subordinate quote-date metadata` |
| `12d7203` | 2026-07-16 01:33:57 | `feat(server): rate-budgeted batched refresh with /api/freshness contract` |
| `cb37694` | 2026-07-16 01:38:24 | `docs: file Ethan's top-priority helper-copy TODO from board request` |
| `4b0147c` | 2026-07-16 01:43:17 | `agent(codex): Subdue history-helper copy on Allocation, Backtest, and Monte Carlo pages` |
| `9619fa6` | 2026-07-16 01:45:56 | `Merge branch 'agent/codex/subdue-history-helper-copy-20260716' into agent/integrate/integrate-subdue-history-helper-copy-20260716-20` |

`fc9cad5` has `98f1618` and stock HEAD `cd6ba93` as parents. It is the point
where the stock line was already incorporated into Fathom.

### Commits unique to stock-analysis-project

None.

## Tracked-file divergence

The complete head-to-head tree delta is 17 paths, 511 insertions and 30
deletions. There are no file deletions or renames: four files were added in
Fathom and thirteen existing files changed.

### Files unique to Fathom

| File | Newer/owner side | Last Fathom change |
| --- | --- | --- |
| `app/src/auth/ownerToken.test.ts` | Fathom only | `98f1618`, 2026-07-15 |
| `app/src/auth/ownerToken.ts` | Fathom only | `98f1618`, 2026-07-15 |
| `server/src/refresh.mjs` | Fathom only | `12d7203`, 2026-07-16 |
| `server/test-refresh.mjs` | Fathom only | `12d7203`, 2026-07-16 |

### Files unique to stock-analysis-project

None in the tracked tree.

### Files present on both sides but different

Fathom is newer for every path because stock HEAD is its ancestor.

| File | Newer side | Last Fathom change | Change family |
| --- | --- | --- | --- |
| `app/src/App.tsx` | Fathom | `98f1618`, 2026-07-15 | local owner-token helper |
| `app/src/auth/shellAuth.tsx` | Fathom | `98f1618`, 2026-07-15 | local owner-token helper |
| `app/src/components/allocation/AllocationBuilder.tsx` | Fathom | `4b0147c`, 2026-07-16 | subdued history helper |
| `app/src/components/backtest/BuilderPanel.tsx` | Fathom | `4b0147c`, 2026-07-16 | subdued history helper |
| `app/src/index.css` | Fathom | `4fbe3ad`, 2026-07-16 | numeric-control polish |
| `app/src/pages/Montecarlo.tsx` | Fathom | `4b0147c`, 2026-07-16 | subdued history helper |
| `app/src/projections/ProjectionEditor.tsx` | Fathom | `4fbe3ad`, 2026-07-16 | quote-date hierarchy |
| `docs/ARCHITECTURE.md` | Fathom | `12d7203`, 2026-07-16 | batched refresh/freshness contract |
| `docs/HANDOFF_ROADMAP.md` | Fathom | `cb37694`, 2026-07-16 | current work/progress |
| `docs/VISION.md` | Fathom | `4fbe3ad`, 2026-07-16 | numeric-control decision record |
| `server/package.json` | Fathom | `12d7203`, 2026-07-16 | server test command |
| `server/src/index.mjs` | Fathom | `12d7203`, 2026-07-16 | refresh/freshness routes |
| `server/src/tiingo.mjs` | Fathom | `12d7203`, 2026-07-16 | retry/rate handling |

All other tracked paths are byte-identical at the two commit trees.

## Roadmap and documentation divergence

Only three tracked documents differ.

1. `docs/ARCHITECTURE.md` is newer in Fathom. It documents provider-budgeted
   refresh batches, the aggregate `refresh-report.json`, `/api/freshness`, the
   explicit Cloud Run deploy command, the quota-spaced scheduler command, and
   the fact that CI exists while production deployment remains manual.
2. `docs/HANDOFF_ROADMAP.md` is newer in Fathom. Relative to stock it adds five
   `Now` entries: the helper-copy request, completed rate-budgeted refresh,
   quota-spaced cloud activation, completed numeric-control polish, and the
   completed local owner-token helper. Checkbox totals change from 14 open / 3
   closed in stock to 16 open / 6 closed in Fathom.
3. `docs/VISION.md` is newer in Fathom. It adds the 2026-07-15
   numeric-control/quote-date decision record.

All other tracked files under `docs/`, including `docs/roadmap.md`, are
identical.

One semantic cleanup remains after this report: Fathom's top
`Subdue history-helper copy` roadmap entry is still unchecked even though
`4b0147c` implemented the named three component changes and `9619fa6` merged
them. This is not a merge conflict and should not be resolved by taking the
older stock document; it is a follow-up status correction in canonical Fathom.
The cloud activation progress text also records live state that this local-only
report did not independently verify.

## Data divergence under `data/`

### Tracked data

Both trees track the same six files: `data/.gitkeep` and five files under
`data/asset-classes/`. Direct SHA-256 comparison found all six identical.
There is no tracked data merge.

### Ignored local data

| Measure | Fathom | stock-analysis-project |
| --- | ---: | ---: |
| Total files under `data/` on disk | 6 | 115 |
| Allocated size | 932 KiB | 69 MiB |
| Stock-only `data/tickers/` | absent | 75 files, 70,526,793 bytes |
| Stock-only `data/fundamentals/` | absent | 34 files, 622,923 bytes |

The stock-only directories are explicitly ignored by root `.gitignore` lines
5-6. Their combined deterministic manifest digest is:

```text
ae7b35d5be4f642dfed077ea4f4a44fd1e1ec4af3d09991ec5e4e4a17cef6b8a
```

That digest is the SHA-256 of the sorted, relative-path `sha256sum` manifest
for `fundamentals/` and `tickers/`.

Ticker-cache details:

- 75 JSON files, 523,873 records, with no declared/actual record-count
  mismatches.
- Canonical record fields are
  `{date, close, adjClose, divCash, splitFactor}`.
- Every file ends at 2026-07-02. Fetch timestamps run from 2026-07-03 through
  2026-07-05.
- The cache has 75 symbols while the newer Fathom roadmap records an 88-symbol
  live catalog.

Fundamentals-cache details:

- 33 ticker files plus `index.json`.
- Fetch timestamps run from 2026-07-05 06:02Z through 06:31Z.

Per `CLAUDE.md`, local `data/tickers/` is not canonical; the GCS bucket is.
Therefore these caches are older preservation material, not candidates to
overwrite or seed active Fathom. Archive them with the duplicate checkout.

## Uncommitted and ignored stock working-tree state

The main stock working tree is clean:

- unstaged diff: empty;
- staged diff: empty;
- untracked files with `--untracked-files=all`: none;
- local `main` vs its local `origin/main`: `+0 -0`.

Ignored top-level/local paths do exist: `.claude/worktrees/`, `.env`,
`.firebase/`, `.orc/`, `app/node_modules/`, `app/public/data/`,
`data/fundamentals/`, `data/tickers/`, `server/node_modules/`, and
`stock-analysis/node_modules/`. No secret contents were read. The entire
directory should be archived so the ignored `.env` and local state are
preserved with their existing permissions; none should be committed or copied
into Fathom.

### Broken nested worktree artifact

`stock-analysis-project/.claude/worktrees/affectionate-lichterman-2b55ff`
contains 218 files (8.3 MiB), all timestamped 2026-07-05. Its `.git` file points
to the obsolete Windows path
`C:/Users/et2bo/Desktop/Projects/Finance/stock-analysis-project/.git/worktrees/...`,
so Git cannot determine a branch or clean/dirty state. The snapshot is older
than both compared heads and is not registered by the Linux repository's
`git worktree list`.

Do not merge this snapshot automatically. Preserve it inside the archived outer
checkout. It is an archival caveat, not evidence of a stock-only commit.

## Expected conflicts and risks

- **Tracked Git conflict: none.** Stock is an ancestor of Fathom, so merging
  stock into Fathom would only report "Already up to date."
- **Live remote uncertainty:** the two local `origin/main` refs disagree because
  neither was fetched for this report. A future fetch may reveal new remote
  commits; the executable gate below stops if remote `origin/main` is not an
  ancestor of local Fathom `main`.
- **Roadmap semantic conflict:** the helper-copy checkbox is stale in Fathom;
  keep Fathom's newer document and correct the checkbox separately.
- **Data collision risk:** copying stock's ignored 75-symbol cache into Fathom
  would reintroduce stale, noncanonical data. Archive it only.
- **Coordination risk:** at report time an active session owns `server/src` and
  `server/test-refresh.mjs`. No merge write is needed, but run the final tests
  and archive only after that session and all Fathom/stock processes have
  released their leases and working directories.
- **Workspace registry drift:** `workspace.json` currently lists both paths as
  active. Moving stock without changing its manifest entry would be a workspace
  defect.

## Exact executable merge/archive proposal

Run this only after the active Fathom session has signed off. The SHA guards are
intentional: if either head changes, stop and regenerate this report rather than
silently applying a stale plan.

### 1. Freeze and prove the local relationship

```bash
set -euo pipefail

F=/home/ethan/projects/finance/fathom
S=/home/ethan/projects/finance/stock-analysis-project
A=/home/ethan/projects/_archive/2026-07-fathom-dedup/stock-analysis-project
F_EXPECT=9619fa6d5d05efad52ed72c7b13984c601d175b6
S_EXPECT=cd6ba930fe9accc9495cb43e1e8c919d709c70ea
DATA_EXPECT=ae7b35d5be4f642dfed077ea4f4a44fd1e1ec4af3d09991ec5e4e4a17cef6b8a

test "$(git -C "$F" rev-parse main)" = "$F_EXPECT"
test "$(git -C "$S" rev-parse main)" = "$S_EXPECT"
test "$(git -C "$F" remote get-url origin)" = "https://github.com/Calculator5329/fathom.git"
test "$(git -C "$S" remote get-url origin)" = "https://github.com/Calculator5329/fathom.git"
test -z "$(git -C "$F" status --porcelain=v1 --untracked-files=all)"
test -z "$(git -C "$S" status --porcelain=v1 --untracked-files=all)"
git -C "$F" merge-base --is-ancestor "$S_EXPECT" "$F_EXPECT"
test "$(git -C "$F" rev-list --count "$S_EXPECT..$F_EXPECT")" -eq 7
test "$(git -C "$F" rev-list --count "$F_EXPECT..$S_EXPECT")" -eq 0

actual_data_digest="$({
  cd "$S/data"
  find fundamentals tickers -type f -print0 |
    sort -z |
    xargs -0 sha256sum |
    sha256sum |
    awk '{print $1}'
})"
test "$actual_data_digest" = "$DATA_EXPECT"
```

Expected result: every command exits zero. There is deliberately no `git
merge`: the ancestor checks prove there is nothing to import from stock.

### 2. Verify canonical Fathom and back it up remotely

```bash
git -C "$F" fetch --prune origin
git -C "$F" merge-base --is-ancestor origin/main main

(
  cd "$F/app"
  npm ci
  npm test
  npx tsc -b
)

(
  cd "$F/server"
  npm ci
  npm test
)

test -z "$(git -C "$F" status --porcelain=v1 --untracked-files=all)"
git -C "$F" push origin main
test "$(git -C "$F" rev-parse main)" = "$(git -C "$F" rev-parse origin/main)"
```

Stop if the `merge-base --is-ancestor origin/main main` gate fails: that means
the live remote contains content absent locally and needs a fresh divergence
review. Expected green gates are app Vitest, TypeScript, server native tests, a
clean tracked/untracked tree, and exact local/remote main equality after push.

### 3. Archive the complete duplicate without deletion

```bash
test ! -e "$A"
mkdir -p "$(dirname "$A")"
mv "$S" "$A"

test ! -e "$S"
test -d "$A/.git"
test "$(git -C "$A" rev-parse HEAD)" = "$S_EXPECT"
test "$(git -C "$F" rev-parse HEAD)" = "$F_EXPECT"

archived_data_digest="$({
  cd "$A/data"
  find fundamentals tickers -type f -print0 |
    sort -z |
    xargs -0 sha256sum |
    sha256sum |
    awk '{print $1}'
})"
test "$archived_data_digest" = "$DATA_EXPECT"
test -f "$A/.claude/worktrees/affectionate-lichterman-2b55ff/.git"
```

What is archived: the complete stock checkout, including its `.git` history,
ignored `.env` and Firebase/orchestrator state, dependency trees, 109 stock-only
data files, `app/public/data/`, and the broken nested Claude snapshot. Nothing is
deleted and no ignored payload is copied into Fathom.

### 4. Update the workspace manifest and verify registry truth

The move must be paired with this guarded manifest update:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs'

const file = '/home/ethan/projects/workspace.json'
const workspace = JSON.parse(fs.readFileSync(file, 'utf8'))
const row = workspace.repos.find(
  (repo) => repo.path === 'finance/stock-analysis-project',
)

if (!row) throw new Error('stock-analysis-project manifest row not found')
if (row.currentPath !== 'finance/stock-analysis-project') {
  throw new Error(`unexpected currentPath: ${row.currentPath}`)
}

row.currentPath = '_archive/2026-07-fathom-dedup/stock-analysis-project'
row.category = '_archive'
row.status = 'archived'
row.agents = 'none'

fs.writeFileSync(file, `${JSON.stringify(workspace, null, 2)}\n`)
NODE

test -d /home/ethan/projects/_archive/2026-07-fathom-dedup/stock-analysis-project
test ! -e /home/ethan/projects/finance/stock-analysis-project
test -d /home/ethan/projects/finance/fathom
```

Then run the workspace's normal manifest/registry synchronization and
`janitor verify`; both must report Fathom active at `finance/fathom`, stock
archived at `_archive/2026-07-fathom-dedup/stock-analysis-project`, and no
disk/manifest drift. The registry tooling was not invoked in this report because
the Codex sandbox could not write the orchestrator audit log.

### 5. Post-archive acceptance gates

The archive is complete only when all of the following are true:

- Fathom `main` and live `origin/main` resolve to the same descendant of stock
  `cd6ba93`.
- App Vitest, TypeScript, and server native tests pass from Fathom.
- The stock archive resolves to `cd6ba93` and its ignored-data manifest still
  hashes to `ae7b35d...cef6b8a`.
- The old active stock path no longer exists; the durable `_archive` path does.
- `workspace.json`, orchestrator registry, and disk agree on the canonical and
  archived paths.
- A separate canonical-doc follow-up checks off the completed helper-copy item
  with a dated note; it does not import the older stock roadmap.

## Final disposition map

| Material | Disposition |
| --- | --- |
| Stock tracked commits/files | Already contained in Fathom; no merge action |
| Fathom's seven descendant commits | Keep as canonical current history |
| Four Fathom-only tracked files | Keep in canonical Fathom |
| Thirteen newer shared files | Keep Fathom versions |
| Six tracked asset-class data files | Already identical; no action |
| Stock ignored ticker/fundamentals caches | Preserve only inside archive |
| Stock ignored `.env` and local runtime state | Preserve inside archive; never commit/copy |
| Broken nested Claude worktree snapshot | Preserve inside archive; do not merge |
| `stock-analysis-project` checkout | Move intact to workspace `_archive`; never delete |
