import { projectScenario, type Projection } from './model'

/** Explicit portable research snapshot; no account or holding data is included. */
export function exportProjections(projections: readonly Projection[], exportedAt = new Date().toISOString()) {
  return { version: 1, exportedAt, projections: projections.map((p) => ({
    ticker: p.ticker, inputs: p.inputs, scenarios: p.scenarios, notes: p.notes,
    manualPrice: p.manualPrice ?? false, createdAt: p.createdAt, updatedAt: p.updatedAt,
    outcomes: {
      bear: projectScenario(p.inputs, p.scenarios.bear),
      base: projectScenario(p.inputs, p.scenarios.base),
      bull: projectScenario(p.inputs, p.scenarios.bull),
    },
  })) }
}

export function downloadProjections(projections: readonly Projection[]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportProjections(projections), null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'fathom-projections.json'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
