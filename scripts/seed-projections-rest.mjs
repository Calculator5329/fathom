import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const seedPath =
  process.argv.find((arg) => arg.startsWith('--seed='))?.slice('--seed='.length) ??
  path.join(root, 'app', 'public', 'data', 'projection-seed-2026-07-03.json')
const write = process.argv.includes('--write')
const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'Cannot encode a non-finite number')
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)])),
      },
    }
  }
  throw new Error(`Unsupported Firestore value type: ${typeof value}`)
}

function firestoreFields(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Document must be an object')
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)]))
}

function validateSeed(seed) {
  assert(seed.targetProjectId === 'ethan-488900', `Unexpected project: ${seed.targetProjectId}`)
  assert(seed.targetUid === 'bFVdRJo3X2VOd0ryyjwx1M0KR6Y2', `Unexpected target uid: ${seed.targetUid}`)
  assert(seed.targetEmail === '5329548871.eg@gmail.com', `Unexpected target email: ${seed.targetEmail}`)
  assert(seed.documentPath === `users/${seed.targetUid}/projections/{TICKER}`, 'Unexpected document path template')
  assert(Array.isArray(seed.projections), 'Seed missing projections array')
  assert(seed.projections.length === 17, `Expected 17 projections, found ${seed.projections.length}`)

  const tickers = seed.projections.map((projection) => projection.ticker)
  const duplicates = tickers.filter((ticker, index) => tickers.indexOf(ticker) !== index)
  assert(duplicates.length === 0, `Duplicate tickers: ${[...new Set(duplicates)].join(', ')}`)

  for (const projection of seed.projections) {
    assert(typeof projection.ticker === 'string' && projection.ticker.length > 0, 'Projection missing ticker')
    assert(projection.ticker.length <= 12, `${projection.ticker}: ticker too long`)
    assert(projection.inputs && typeof projection.inputs === 'object', `${projection.ticker}: missing inputs`)
    assert(Number.isFinite(projection.inputs.baseRevenue), `${projection.ticker}: invalid baseRevenue`)
    assert(Number.isFinite(projection.inputs.netIncome), `${projection.ticker}: invalid netIncome`)
    assert(Number.isFinite(projection.inputs.sharesOut), `${projection.ticker}: invalid sharesOut`)
    assert(Number.isFinite(projection.inputs.currentPrice), `${projection.ticker}: invalid currentPrice`)
    assert(projection.inputs.horizonYears >= 1 && projection.inputs.horizonYears <= 30, `${projection.ticker}: invalid horizon`)
    assert(projection.scenarios && typeof projection.scenarios === 'object', `${projection.ticker}: missing scenarios`)
    assert(typeof projection.notes === 'string' && projection.notes.length <= 5000, `${projection.ticker}: invalid notes`)
    assert(Number.isFinite(projection.updatedAt), `${projection.ticker}: invalid updatedAt`)
  }
}

async function commitBatch(seed) {
  assert(token, 'Set GOOGLE_OAUTH_ACCESS_TOKEN before running with --write')

  const url = `https://firestore.googleapis.com/v1/projects/${seed.targetProjectId}/databases/(default)/documents:commit`
  const writes = seed.projections.map((projection) => ({
    update: {
      name: `projects/${seed.targetProjectId}/databases/(default)/documents/users/${seed.targetUid}/projections/${projection.ticker}`,
      fields: firestoreFields(projection),
    },
  }))

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  })

  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(`Firestore commit failed: HTTP ${response.status}\n${bodyText}`)
  }

  const body = JSON.parse(bodyText)
  return {
    writeResults: body.writeResults?.length ?? 0,
    commitTime: body.commitTime ?? null,
  }
}

const seed = JSON.parse(await readFile(seedPath, 'utf8'))
validateSeed(seed)

console.log(
  JSON.stringify(
    {
      mode: write ? 'write' : 'dry-run',
      seedPath,
      targetProjectId: seed.targetProjectId,
      targetEmail: seed.targetEmail,
      targetUid: seed.targetUid,
      documentPath: seed.documentPath,
      count: seed.projections.length,
      tickers: seed.projections.map((projection) => projection.ticker),
      validation: 'ok',
    },
    null,
    2,
  ),
)

if (write) {
  const result = await commitBatch(seed)
  console.log(JSON.stringify({ firestoreCommit: 'ok', ...result }, null, 2))
} else {
  console.log('Dry run only. To write, set GOOGLE_OAUTH_ACCESS_TOKEN and rerun with --write.')
}
