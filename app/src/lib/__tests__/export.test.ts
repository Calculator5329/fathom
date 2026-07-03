import { describe, expect, it } from 'vitest'
import { buildResultsCsv } from '../export'
import type { NamedResult } from '@/components/charts/options'
import type { BacktestResult } from '@/engine'

function fakeRun(label: string): NamedResult {
  const result = {
    dates: ['2020-01-02', '2020-01-03'],
    values: [10000, 11000],
    metrics: {
      cagr: 0.1,
      volatility: 0.15,
      sharpe: 0.8,
      sortino: 1.1,
      drawdown: { maxDrawdown: -0.2, peakDate: '', troughDate: '', recoveryDate: null },
      annualReturns: [{ year: 2020, return: 0.1 }],
    },
  } as unknown as BacktestResult
  return { label, result }
}

describe('buildResultsCsv', () => {
  it('emits summary, annual, and daily sections with one column per run', () => {
    const csv = buildResultsCsv([fakeRun('Portfolio 1'), fakeRun('Portfolio 2')])
    const lines = csv.split('\n')
    expect(lines[0]).toContain('Fathom backtest export')
    expect(csv).toContain('Metric,Portfolio 1,Portfolio 2')
    expect(csv).toContain('Final value,11000,11000')
    expect(csv).toContain('CAGR,10.00%,10.00%')
    expect(csv).toContain('Year,Portfolio 1,Portfolio 2')
    expect(csv).toContain('2020,10.00%,10.00%')
    expect(csv).toContain('Date,Portfolio 1,Portfolio 2')
    expect(csv).toContain('2020-01-03,11000,11000')
  })

  it('quotes labels containing commas', () => {
    const csv = buildResultsCsv([fakeRun('60/40, rebal')])
    expect(csv).toContain('"60/40, rebal"')
  })
})
