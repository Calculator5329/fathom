import { expect, it } from 'vitest'
import { exportProjections } from './export'
import { defaultScenarios, type Projection } from './model'

it('exports saved assumptions and engine outcomes without extra account fields', () => {
  const projection: Projection & { accountBalance: number } = { ticker: 'TEST', inputs: { baseRevenue: 100, netIncome: 10, sharesOut: 10, currentPrice: 20, horizonYears: 1 }, scenarios: defaultScenarios(), notes: 'A research note', createdAt: 1, updatedAt: 2, accountBalance: 999 }
  const value = exportProjections([projection], '2026-09-05T00:00:00Z')
  expect(value.projections[0].outcomes.base.targetPrice).toBeCloseTo(29.45454545)
  expect(value.projections[0].notes).toBe('A research note')
  expect(JSON.stringify(value)).not.toContain('accountBalance')
  expect(projection.updatedAt).toBe(2)
})
