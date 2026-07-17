import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_TICKERS_PER_BATCH,
  isWeekdayCycle,
  marketCycleId,
  mergeRefreshBatch,
  isFinalRefreshInvocation,
  selectCatchUpTickers,
  shouldRunCatchUpPass,
  refreshFreshness,
  resolveRefreshPlan,
  selectRefreshBatch,
} from './src/refresh.mjs'

const catalog = Array.from({ length: 75 }, (_, index) => ({ ticker: `T${String(index).padStart(2, '0')}` }))

test('three batches stay inside the Tiingo symbol budget and cover the catalog once', () => {
  const batches = [0, 1, 2].map((index) => selectRefreshBatch(catalog, index, 3))
  assert.deepEqual(batches.map((batch) => batch.length), [25, 25, 25])
  assert.ok(batches.every((batch) => batch.length <= MAX_TICKERS_PER_BATCH))
  assert.equal(new Set(batches.flat().map((entry) => entry.ticker)).size, 75)
  assert.throws(() => selectRefreshBatch([...catalog, { ticker: 'T75' }], 0, 3), /needs at least 4 batches/)
})

test('automatic planning advances missing batches within one New York cycle', () => {
  const now = new Date('2026-07-16T02:30:00Z')
  const searchParams = new URLSearchParams()
  const first = resolveRefreshPlan({ searchParams, existingReport: null, catalogSize: 75, now })
  assert.deepEqual(first, { batchIndex: 0, batchCount: 3, cycleId: '2026-07-15', alreadyComplete: false })
  const second = resolveRefreshPlan({
    searchParams,
    existingReport: { cycleId: '2026-07-15', batchCount: 3, catalogSize: 75, batches: [{ batchIndex: 0 }] },
    catalogSize: 75,
    now,
  })
  assert.equal(second.batchIndex, 1)
})

test('automatic planning grows the batch count with the catalog', () => {
  const plan = resolveRefreshPlan({
    searchParams: new URLSearchParams(),
    existingReport: null,
    catalogSize: 91,
    now: new Date('2026-07-16T02:30:00Z'),
  })
  assert.equal(plan.batchCount, 4)
  const expanded = Array.from({ length: 91 }, (_, index) => ({ ticker: `X${String(index).padStart(2, '0')}` }))
  assert.equal(selectRefreshBatch(expanded, 0, 4).length, 23)
})

test('catalog size changes reset completed batch boundaries', () => {
  const plan = resolveRefreshPlan({
    searchParams: new URLSearchParams(),
    existingReport: {
      cycleId: '2026-07-15',
      batchCount: 4,
      catalogSize: 88,
      batches: [{ batchIndex: 0 }, { batchIndex: 1 }],
    },
    catalogSize: 89,
    now: new Date('2026-07-16T02:30:00Z'),
  })
  assert.equal(plan.batchIndex, 0)
})

test('aggregate report is only fresh after every batch succeeds', () => {
  let report = null
  for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
    report = mergeRefreshBatch(report, {
      batchIndex,
      ranAt: `2026-07-16T0${batchIndex + 2}:30:00Z`,
      durationMs: 1_000,
      attempted: 25,
      refreshed: 25,
      failed: [],
      endDateCounts: { '2026-07-15': 25 },
    }, { cycleId: '2026-07-15', batchCount: 3, catalogSize: 75 })
  }
  assert.equal(report.complete, true)
  assert.equal(report.refreshed, 75)
  assert.equal(report.freshThrough, '2026-07-15')
  assert.deepEqual(refreshFreshness(report, new Date('2026-07-16T06:00:00Z')).reasons, [])
})

test('catch-up candidates are budget-capped and skip already-current tickers', () => {
  const cycleId = '2026-07-16'
  const staleList = [
    { ticker: 'BBB', endDate: '2026-07-10' },
    { ticker: 'AAA', endDate: '2026-07-16' },
    { ticker: 'CCC', endDate: '2026-07-14' },
    { ticker: 'DDD', endDate: '2026-07-15' },
    { ticker: 'EEE', endDate: '2026-07-14' },
  ]
  const selected = selectCatchUpTickers(staleList, cycleId, 2)
  assert.deepEqual(selected, ['BBB', 'CCC'])
})

test('catch-up pass runs only on the final scheduled batch and final invocation time', () => {
  const finalBatch = { batchIndex: 3, batchCount: 4 }
  assert.equal(shouldRunCatchUpPass(finalBatch, new Date('2026-07-17T04:30:00Z')), true)
  assert.equal(shouldRunCatchUpPass(finalBatch, new Date('2026-07-17T03:30:00Z')), false)
  assert.equal(shouldRunCatchUpPass({ batchIndex: 2, batchCount: 4 }, new Date('2026-07-17T04:30:00Z')), false)
  assert.equal(isFinalRefreshInvocation(new Date('2026-07-17T04:30:00Z')), true)
  assert.equal(isFinalRefreshInvocation(new Date('2026-07-17T04:31:00Z')), false)
})

test('failed and stale cycles fail the freshness contract', () => {
  const report = mergeRefreshBatch(null, {
    batchIndex: 0,
    ranAt: '2026-07-10T02:30:00Z',
    durationMs: 1_000,
    attempted: 25,
    refreshed: 24,
    failed: ['T24: HTTP 429'],
    endDateCounts: { '2026-07-09': 24 },
  }, { cycleId: '2026-07-09', batchCount: 3, catalogSize: 75 })
  const freshness = refreshFreshness(report, new Date('2026-07-16T06:00:00Z'))
  assert.equal(freshness.ok, false)
  assert.match(freshness.reasons.join('; '), /incomplete/)
  assert.match(freshness.reasons.join('; '), /failed/)
  assert.match(freshness.reasons.join('; '), /stale/)
})

test('latest catch-up data replaces earlier close-date samples for a replaced batch', () => {
  let report = mergeRefreshBatch(null, {
    batchIndex: 0,
    ranAt: '2026-07-10T02:30:00Z',
    durationMs: 1_000,
    attempted: 1,
    refreshed: 1,
    failed: [],
    endDateCounts: { '2026-07-14': 1 },
    endDateByTicker: { A: '2026-07-14' },
  }, { cycleId: '2026-07-14', batchCount: 1, catalogSize: 1 })
  report = mergeRefreshBatch(report, {
    batchIndex: 0,
    ranAt: '2026-07-10T02:31:00Z',
    durationMs: 1_000,
    attempted: 1,
    refreshed: 1,
    failed: [],
    endDateCounts: { '2026-07-15': 1 },
    endDateByTicker: { A: '2026-07-15' },
  }, { cycleId: '2026-07-14', batchCount: 1, catalogSize: 1 })
  assert.equal(report.freshThrough, '2026-07-15')
})

test('market cycle date stays stable across UTC midnight for the evening refresh window', () => {
  assert.equal(marketCycleId(new Date('2026-07-15T22:30:00Z')), '2026-07-15')
  assert.equal(marketCycleId(new Date('2026-07-16T02:30:00Z')), '2026-07-15')
  assert.equal(marketCycleId(new Date('2026-07-16T04:30:00Z')), '2026-07-15')
  assert.equal(isWeekdayCycle('2026-07-15'), true)
  assert.equal(isWeekdayCycle('2026-07-18'), false)
})
