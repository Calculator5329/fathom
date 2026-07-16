export const MAX_TICKERS_PER_BATCH = 25
const MAX_REPORT_AGE_MS = 96 * 60 * 60 * 1000

function integer(value, fallback) {
  if (value == null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`invalid refresh batch value: ${value}`)
  return parsed
}

export function marketCycleId(date = new Date()) {
  // The final rate-budgeted run may occur shortly after midnight ET. Treat the
  // market day as ending at 06:00 ET so all evening batches share one cycle.
  const marketDay = new Date(date.getTime() - 6 * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(marketDay)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

export function isWeekdayCycle(cycleId) {
  const day = new Date(`${cycleId}T12:00:00Z`).getUTCDay()
  return day >= 1 && day <= 5
}

export function selectRefreshBatch(catalog, batchIndex, batchCount) {
  if (!Number.isInteger(batchCount) || batchCount < 1) throw new Error('batch count must be positive')
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= batchCount) {
    throw new Error(`batch index ${batchIndex} is outside 0..${batchCount - 1}`)
  }
  const sorted = [...catalog].toSorted((a, b) => a.ticker.localeCompare(b.ticker))
  const batchSize = Math.ceil(sorted.length / batchCount)
  if (batchSize > MAX_TICKERS_PER_BATCH) {
    throw new Error(
      `catalog needs at least ${Math.ceil(sorted.length / MAX_TICKERS_PER_BATCH)} batches; ` +
      `${batchCount} would exceed the ${MAX_TICKERS_PER_BATCH}-ticker provider budget`,
    )
  }
  return sorted.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize)
}

export function resolveRefreshPlan({ searchParams, existingReport, catalogSize, now = new Date() }) {
  const minimumBatchCount = Math.max(1, Math.ceil(catalogSize / MAX_TICKERS_PER_BATCH))
  const configured = integer(process.env.REFRESH_BATCH_COUNT, minimumBatchCount)
  const batchCount = integer(searchParams.get('batches'), configured)
  if (batchCount < 1) throw new Error('batch count must be positive')
  const cycleId = marketCycleId(now)
  const explicitBatch = searchParams.get('batch')
  if (explicitBatch != null) {
    const batchIndex = integer(explicitBatch, 0)
    if (batchIndex >= batchCount) throw new Error(`batch index ${batchIndex} is outside 0..${batchCount - 1}`)
    return { batchIndex, batchCount, cycleId, alreadyComplete: false }
  }

  const completed = existingReport?.cycleId === cycleId &&
    existingReport?.batchCount === batchCount &&
    existingReport?.catalogSize === catalogSize
    ? new Set((existingReport.batches ?? []).map((batch) => batch.batchIndex))
    : new Set()
  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    if (!completed.has(batchIndex)) return { batchIndex, batchCount, cycleId, alreadyComplete: false }
  }
  return { batchIndex: null, batchCount, cycleId, alreadyComplete: true, catalogSize }
}

export function mergeRefreshBatch(existingReport, batch, { cycleId, batchCount, catalogSize }) {
  const prior = existingReport?.cycleId === cycleId &&
    existingReport?.batchCount === batchCount &&
    existingReport?.catalogSize === catalogSize
    ? existingReport.batches ?? []
    : []
  const batches = [...prior.filter((entry) => entry.batchIndex !== batch.batchIndex), batch]
    .toSorted((a, b) => a.batchIndex - b.batchIndex)
  const failed = batches.flatMap((entry) => entry.failed)
  const endDateCounts = {}
  for (const entry of batches) {
    for (const [date, count] of Object.entries(entry.endDateCounts)) {
      endDateCounts[date] = (endDateCounts[date] ?? 0) + count
    }
  }
  const refreshed = batches.reduce((sum, entry) => sum + entry.refreshed, 0)
  const attempted = batches.reduce((sum, entry) => sum + entry.attempted, 0)
  const complete = batches.length === batchCount && batches.every((entry, index) => entry.batchIndex === index)
  const successfulDates = Object.entries(endDateCounts)
    .filter(([date]) => date !== 'missing')
    .flatMap(([date, count]) => Array(count).fill(date))
    .sort()

  return {
    cycleId,
    ranAt: batch.ranAt,
    durationMs: batches.reduce((sum, entry) => sum + entry.durationMs, 0),
    batchCount,
    batchesCompleted: batches.map((entry) => entry.batchIndex),
    complete,
    attempted,
    refreshed,
    failed,
    catalogSize,
    freshThrough: complete && failed.length === 0 ? successfulDates[0] ?? null : null,
    endDateCounts,
    batches,
  }
}

export function refreshFreshness(report, now = new Date(), maxAgeMs = MAX_REPORT_AGE_MS) {
  const ranAtMs = Date.parse(report?.ranAt ?? '')
  const ageMs = Number.isFinite(ranAtMs) ? Math.max(0, now.getTime() - ranAtMs) : null
  const reasons = []
  if (!report) reasons.push('missing refresh report')
  else {
    if (!report.complete) reasons.push('refresh cycle is incomplete')
    if ((report.failed?.length ?? 0) > 0) reasons.push(`${report.failed.length} ticker refreshes failed`)
    if (ageMs == null || ageMs > maxAgeMs) reasons.push('refresh report is stale')
    if (!report.freshThrough) reasons.push('no complete fresh-through date')
  }
  return {
    ok: reasons.length === 0,
    cycleId: report?.cycleId ?? null,
    ranAt: report?.ranAt ?? null,
    ageHours: ageMs == null ? null : Math.round((ageMs / 3_600_000) * 10) / 10,
    freshThrough: report?.freshThrough ?? null,
    refreshed: report?.refreshed ?? 0,
    catalogSize: report?.catalogSize ?? 0,
    batchesCompleted: report?.batchesCompleted ?? [],
    batchCount: report?.batchCount ?? 0,
    failureCount: report?.failed?.length ?? 0,
    reasons,
  }
}
