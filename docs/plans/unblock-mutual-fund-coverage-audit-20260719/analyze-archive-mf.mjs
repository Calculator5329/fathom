// One-shot analysis: characterize likely-mutual-fund tickers in the master-site
// archive inventory (scripts/output/archive-inventory.csv). Heuristic: a US
// open-end mutual fund symbol is 5 uppercase letters ending in X (VTSAX, FXAIX,
// VFINX...). Not authoritative (some 5-letter-X symbols are ETFs/ADRs), but a
// good coverage proxy for the audit. Read-only; prints a summary table.
import * as fs from 'node:fs'
import path from 'node:path'

const CSV = path.resolve(import.meta.dirname, '../../../scripts/output/archive-inventory.csv')
const lines = fs.readFileSync(CSV, 'utf8').trim().split('\n')
const header = lines.shift()
const rows = lines.map((l) => {
  const [ticker, records, firstDate, lastDate, dividendEvents, splitEvents, anomalies] = l.split(',')
  return {
    ticker,
    records: +records,
    firstDate,
    lastDate,
    dividendEvents: +dividendEvents,
    splitEvents: +splitEvents,
    anomalies: +anomalies,
  }
})

const isLikelyMF = (t) => /^[A-Z]{5}$/.test(t) && t.endsWith('X')
const mf = rows.filter((r) => isLikelyMF(r.ticker))

const withSplits = mf.filter((r) => r.splitEvents > 0)
const withDivs = mf.filter((r) => r.dividendEvents > 0)
const withAnoms = mf.filter((r) => r.anomalies > 0)
const shortHist = mf.filter((r) => r.records < 500)

const medRecords = mf.map((r) => r.records).sort((a, b) => a - b)[Math.floor(mf.length / 2)]

console.log(`archive tickers total: ${rows.length}`)
console.log(`likely mutual funds (5-letter, ends X): ${mf.length}`)
console.log(`  with >=1 split event: ${withSplits.length}  (funds rarely split; may signal share-class conversions)`)
console.log(`  with >=1 dividend/distribution event: ${withDivs.length}`)
console.log(`  with data anomalies flagged: ${withAnoms.length}`)
console.log(`  with <500 daily records (short history): ${shortHist.length}`)
console.log(`  median daily records: ${medRecords}`)
console.log(`sample: ${mf.slice(0, 20).map((r) => r.ticker).join(' ')}`)
console.log(`\nsplit-flagged funds (candidate corporate-action edge cases):`)
for (const r of withSplits.slice(0, 20)) {
  console.log(`  ${r.ticker}  records=${r.records} divs=${r.dividendEvents} splits=${r.splitEvents} anoms=${r.anomalies} ${r.firstDate}..${r.lastDate}`)
}
