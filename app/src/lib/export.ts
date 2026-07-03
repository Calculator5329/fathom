import type { NamedResult } from '@/components/charts/options'

/** CSV-escape a field (quote if it contains comma, quote, or newline). */
function cell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const row = (cells: Array<string | number>) => cells.map(cell).join(',')

/**
 * Build a self-contained CSV of a backtest result set: a metrics summary,
 * the full daily value series, and annual returns — one file, three sections.
 */
export function buildResultsCsv(runs: NamedResult[]): string {
  const labels = runs.map((r) => r.label)
  const lines: string[] = []

  lines.push('# Fathom backtest export')
  lines.push('')

  // Summary
  lines.push('Metric,' + labels.map(cell).join(','))
  const metric = (name: string, fn: (r: NamedResult) => string | number) =>
    lines.push(row([name, ...runs.map(fn)]))
  metric('Final value', (r) => Math.round(r.result.values.at(-1)!))
  metric('CAGR', (r) => (r.result.metrics.cagr * 100).toFixed(2) + '%')
  metric('Volatility', (r) => (r.result.metrics.volatility * 100).toFixed(2) + '%')
  metric('Max drawdown', (r) => (r.result.metrics.drawdown.maxDrawdown * 100).toFixed(2) + '%')
  metric('Sharpe', (r) => r.result.metrics.sharpe.toFixed(2))
  metric('Sortino', (r) => r.result.metrics.sortino.toFixed(2))
  lines.push('')

  // Annual returns
  const years = [
    ...new Set(runs.flatMap((r) => r.result.metrics.annualReturns.map((y) => y.year))),
  ].sort()
  lines.push('Year,' + labels.map(cell).join(','))
  for (const y of years) {
    lines.push(
      row([
        y,
        ...runs.map((r) => {
          const yr = r.result.metrics.annualReturns.find((x) => x.year === y)
          return yr ? (yr.return * 100).toFixed(2) + '%' : ''
        }),
      ]),
    )
  }
  lines.push('')

  // Daily value series (aligned on the first run's calendar).
  const dates = runs[0].result.dates
  lines.push('Date,' + labels.map(cell).join(','))
  for (let t = 0; t < dates.length; t++) {
    lines.push(row([dates[t], ...runs.map((r) => Math.round((r.result.values[t] ?? 0) * 100) / 100)]))
  }

  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
