// Extend the asset-class monthly series (shiller.csv -> us-monthly.json) past 2023-06,
// where Yale's ie_data.xls is abandoned (see docs/VISION.md 2026-07-04 notes and
// scripts/build-shiller.mjs for the original formulas).
//
// Splice method (approved in VISION.md):
//   - spReturn 2023-07+: chained monthly total returns from our own SPY data
//     (data/tickers/SPY.json adjClose, month-end to month-end). Provenance changes
//     from S&P composite (Shiller average-of-month prices) to SPY (~3bp/yr fee drag).
//   - cpi: FRED CPIAUCNS (NSA). NOTE: the task brief suggested CPIAUCSL, but the
//     existing column is Shiller's CPI-U NSA — 2023-06 = 305.109 matches CPIAUCNS
//     exactly, while CPIAUCSL (SA) does not. Convention match wins.
//   - bondReturn: FRED GS10, same formula as build-shiller.mjs:
//       gs10/12 - 7 * (gs10Next - gs10)      (verified vs 2023-05 row to 8 dp)
//   - cashReturn: same GS10-based proxy the series has always used (NOT TB3MS):
//       gs10 / 12 / 4                        (verified vs 2023-05 row to 8 dp)
//
// The extension ends at min(last CPI month, last GS10 month - 1, last complete SPY
// month): bondReturn for month M needs GS10 at M+1, and all real/deflated use needs
// CPI actuals.
//
// Idempotent: every run refetches FRED, freezes all rows before SPLICE_FROM
// byte-identically, and recomputes the entire spliced tail from scratch.
// Run `node scripts/build-asset-classes.mjs` afterwards to regenerate the app files.

import * as fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SHILLER_CSV = path.join(PROJECT_ROOT, 'context', 'reference-data', 'shiller', 'shiller.csv');
const SPLICE_META = path.join(
  PROJECT_ROOT,
  'context',
  'reference-data',
  'shiller',
  'splice-meta.json',
);
const SPY_JSON = path.join(PROJECT_ROOT, 'data', 'tickers', 'SPY.json');

const SPLICE_FROM = '2023-07'; // first spliced month; everything before is frozen Shiller data
const FRED_CSV = (id) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
const BOUNDARY_LIMIT = 0.15; // |return| sanity bound at and around the splice
const REAL_CAGR_MIN = 0.065; // real US stocks 1871 -> latest, per VISION/engine regressions
const REAL_CAGR_MAX = 0.072;

function monthSerial(ym) {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) throw new Error(`Invalid yyyy-mm date: ${ym}`);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month: ${ym}`);
  return Number(match[1]) * 12 + month - 1;
}

function serialToMonth(serial) {
  const year = Math.floor(serial / 12);
  const month = (serial % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatRow(row) {
  return `${row.date},${row.spReturn.toFixed(8)},${row.bondReturn.toFixed(8)},${row.cashReturn.toFixed(8)},${row.cpi.toFixed(4)}`;
}

function parseShillerCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0].replace(/^﻿/, '');
  if (header !== 'date,spReturn,bondReturn,cashReturn,cpi') {
    throw new Error(`Unexpected shiller.csv header: ${header}`);
  }
  return lines.slice(1).map((line, index) => {
    const columns = line.split(',');
    if (columns.length !== 5) {
      throw new Error(`shiller.csv line ${index + 2} has ${columns.length} columns`);
    }
    const row = {
      date: columns[0],
      spReturn: Number(columns[1]),
      bondReturn: Number(columns[2]),
      cashReturn: Number(columns[3]),
      cpi: Number(columns[4]),
    };
    monthSerial(row.date);
    for (const field of ['spReturn', 'bondReturn', 'cashReturn', 'cpi']) {
      if (!Number.isFinite(row[field])) {
        throw new Error(`shiller.csv ${row.date} ${field} is not finite`);
      }
    }
    return row;
  });
}

async function fetchFredMonthly(id) {
  const res = await fetch(FRED_CSV(id));
  if (!res.ok) throw new Error(`FRED ${id} fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0].replace(/^﻿/, '').split(',');
  if (header[0] !== 'observation_date' || header[1] !== id) {
    throw new Error(`FRED ${id} unexpected header: ${lines[0]}`);
  }
  const byMonth = new Map();
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (raw === '.' || raw === '' || raw === undefined) continue; // FRED missing marker
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`FRED ${id} bad value at ${date}: ${raw}`);
    byMonth.set(date.slice(0, 7), value);
  }
  if (byMonth.size === 0) throw new Error(`FRED ${id} returned no observations`);
  return byMonth;
}

async function loadSpyMonthEnds() {
  const spy = JSON.parse(await fs.readFile(SPY_JSON, 'utf8'));
  if (!Array.isArray(spy.records) || spy.records.length === 0) {
    throw new Error('SPY.json has no records');
  }
  // Last record per calendar month = month-end trading day (records are ascending).
  const byMonth = new Map();
  let previousDate = '';
  for (const record of spy.records) {
    if (record.date <= previousDate) {
      throw new Error(`SPY.json records not strictly ascending at ${record.date}`);
    }
    previousDate = record.date;
    if (!Number.isFinite(record.adjClose) || record.adjClose <= 0) {
      throw new Error(`SPY.json bad adjClose at ${record.date}`);
    }
    byMonth.set(record.date.slice(0, 7), record.adjClose);
  }
  // The final month is only complete if data runs through that month's end; a
  // partial month would understate the month-end close. Treat the last month in
  // the file as complete only when a record exists on/after the 28th, else drop it.
  const months = [...byMonth.keys()];
  const lastMonth = months.at(-1);
  const lastDay = Number(spy.records.at(-1).date.slice(8, 10));
  const lastRecordMonth = spy.records.at(-1).date.slice(0, 7);
  if (lastRecordMonth === lastMonth && lastDay < 28) {
    byMonth.delete(lastMonth);
  }
  return byMonth;
}

function lastMonthOf(byMonth) {
  return [...byMonth.keys()].sort().at(-1);
}

function realUsStocksCagr(rows) {
  // Chain nominal usStocks returns, deflate by CPI level change over the same span.
  let nominal = 1;
  for (const row of rows) nominal *= 1 + row.spReturn;
  const cpiRatio = rows.at(-1).cpi / rows[0].cpi;
  const real = nominal / cpiRatio;
  const years = rows.length / 12;
  return real ** (1 / years) - 1;
}

async function main() {
  const originalCsv = await fs.readFile(SHILLER_CSV, 'utf8');
  const allRows = parseShillerCsv(originalCsv);

  const spliceSerial = monthSerial(SPLICE_FROM);
  const frozenRows = allRows.filter((row) => monthSerial(row.date) < spliceSerial);
  const previousSplicedCount = allRows.length - frozenRows.length;
  const lastFrozen = frozenRows.at(-1);
  if (!lastFrozen || monthSerial(lastFrozen.date) !== spliceSerial - 1) {
    throw new Error(
      `Frozen history must end the month before ${SPLICE_FROM}; last frozen row is ${lastFrozen?.date}`,
    );
  }

  // Byte-identity reference for the frozen prefix (header + rows before SPLICE_FROM),
  // taken VERBATIM from the existing file — never re-serialized (the original
  // pipeline emitted artifacts like "-0.00000000" that toFixed would not reproduce).
  const originalLines = originalCsv.split('\n');
  const frozenPrefix = `${originalLines.slice(0, 1 + frozenRows.length).join('\n')}\n`;
  if (!originalCsv.startsWith(frozenPrefix)) {
    throw new Error('Existing shiller.csv does not begin with the expected frozen history');
  }
  const frozenPrefixRows = parseShillerCsv(frozenPrefix);
  if (frozenPrefixRows.at(-1)?.date !== lastFrozen.date) {
    throw new Error('Frozen prefix extraction misaligned with parsed rows');
  }

  console.log(`Frozen Shiller history: ${frozenRows[0].date} .. ${lastFrozen.date} (${frozenRows.length} rows)`);
  console.log('Fetching FRED CPIAUCNS + GS10 and reading SPY month-ends...');

  const [cpiByMonth, gs10ByMonth, spyByMonth] = await Promise.all([
    fetchFredMonthly('CPIAUCNS'),
    fetchFredMonthly('GS10'),
    loadSpyMonthEnds(),
  ]);

  // Anchor checks: FRED must reproduce the frozen boundary values exactly.
  const boundaryCpi = cpiByMonth.get(lastFrozen.date);
  if (boundaryCpi === undefined || Math.abs(boundaryCpi - lastFrozen.cpi) > 1e-4) {
    throw new Error(
      `CPIAUCNS ${lastFrozen.date} (${boundaryCpi}) does not match frozen cpi ${lastFrozen.cpi} — wrong CPI series?`,
    );
  }
  const boundaryGs10 = gs10ByMonth.get(lastFrozen.date);
  const impliedCash = boundaryGs10 / 100 / 12 / 4;
  if (Math.abs(impliedCash - lastFrozen.cashReturn) > 5e-7) {
    throw new Error(
      `GS10 ${lastFrozen.date} implies cashReturn ${impliedCash}, frozen has ${lastFrozen.cashReturn} — convention mismatch`,
    );
  }

  // CPIAUCNS has a permanent hole at 2025-10: the October 2025 CPI was never
  // published (federal shutdown halted BLS collection). Fill isolated single-month
  // gaps by geometric interpolation of the neighbors and record them in metadata.
  const interpolatedCpiMonths = [];
  {
    const cpiEndSerial = monthSerial(lastMonthOf(cpiByMonth));
    for (let serial = spliceSerial; serial < cpiEndSerial; serial += 1) {
      const month = serialToMonth(serial);
      if (cpiByMonth.has(month)) continue;
      const before = cpiByMonth.get(serialToMonth(serial - 1));
      const after = cpiByMonth.get(serialToMonth(serial + 1));
      if (before === undefined || after === undefined) {
        throw new Error(`CPIAUCNS gap at ${month} is wider than one month — refusing to interpolate`);
      }
      cpiByMonth.set(month, Math.sqrt(before * after));
      interpolatedCpiMonths.push(month);
      console.log(
        `CPIAUCNS ${month} missing at source (never published); geometric interpolation ${before} .. ${after} -> ${Math.sqrt(before * after).toFixed(4)}`,
      );
    }
  }

  const lastCpiMonth = lastMonthOf(cpiByMonth);
  const lastGs10Month = lastMonthOf(gs10ByMonth);
  const lastSpyMonth = lastMonthOf(spyByMonth);
  // bondReturn for M needs GS10 at M+1; all deflated use needs CPI actuals at M.
  const endSerial = Math.min(
    monthSerial(lastCpiMonth),
    monthSerial(lastGs10Month) - 1,
    monthSerial(lastSpyMonth),
  );
  console.log(
    `Source ends — CPIAUCNS: ${lastCpiMonth}, GS10: ${lastGs10Month}, SPY complete: ${lastSpyMonth}; splice end: ${serialToMonth(endSerial)}`,
  );
  if (endSerial < spliceSerial) {
    throw new Error('No complete months available to splice');
  }

  const splicedRows = [];
  for (let serial = spliceSerial; serial <= endSerial; serial += 1) {
    const month = serialToMonth(serial);
    const previousMonth = serialToMonth(serial - 1);
    const nextMonth = serialToMonth(serial + 1);

    const spyEnd = spyByMonth.get(month);
    const spyStart = spyByMonth.get(previousMonth);
    const gs10 = gs10ByMonth.get(month);
    const gs10Next = gs10ByMonth.get(nextMonth);
    const cpi = cpiByMonth.get(month);
    for (const [label, value] of [
      [`SPY ${month}`, spyEnd],
      [`SPY ${previousMonth}`, spyStart],
      [`GS10 ${month}`, gs10],
      [`GS10 ${nextMonth}`, gs10Next],
      [`CPIAUCNS ${month}`, cpi],
    ]) {
      if (value === undefined) throw new Error(`Missing source value: ${label}`);
    }

    const spReturn = spyEnd / spyStart - 1;
    const g = gs10 / 100;
    const gNext = gs10Next / 100;
    splicedRows.push({
      date: month,
      spReturn,
      bondReturn: g / 12 - 7 * (gNext - g),
      cashReturn: g / 12 / 4,
      cpi,
    });
  }

  // ---- Continuity checks -----------------------------------------------------
  const first = splicedRows[0];
  const cpiBoundaryReturn = first.cpi / lastFrozen.cpi - 1;
  console.log('\nSplice-boundary checks (2023-06 -> 2023-07):');
  console.log(`  usStocks ${first.date}: ${(first.spReturn * 100).toFixed(3)}%  (prev ${(lastFrozen.spReturn * 100).toFixed(3)}%)`);
  console.log(`  usBonds  ${first.date}: ${(first.bondReturn * 100).toFixed(3)}%  (prev ${(lastFrozen.bondReturn * 100).toFixed(3)}%)`);
  console.log(`  cash     ${first.date}: ${(first.cashReturn * 100).toFixed(4)}%  (prev ${(lastFrozen.cashReturn * 100).toFixed(4)}%)`);
  console.log(`  cpi MoM  ${first.date}: ${(cpiBoundaryReturn * 100).toFixed(3)}%  (level ${lastFrozen.cpi} -> ${first.cpi})`);
  for (const [name, value] of [
    ['usStocks', first.spReturn],
    ['usBonds', first.bondReturn],
    ['cash', first.cashReturn],
    ['cpi', cpiBoundaryReturn],
  ]) {
    if (Math.abs(value) >= BOUNDARY_LIMIT) {
      throw new Error(`Splice-boundary ${name} return ${value} exceeds |${BOUNDARY_LIMIT}|`);
    }
  }
  for (const row of splicedRows) {
    if (Math.abs(row.spReturn) >= BOUNDARY_LIMIT || Math.abs(row.bondReturn) >= BOUNDARY_LIMIT) {
      throw new Error(`Implausible spliced return at ${row.date}: ${JSON.stringify(row)}`);
    }
  }

  const finalRows = [...frozenRows, ...splicedRows];
  for (let index = 1; index < finalRows.length; index += 1) {
    if (monthSerial(finalRows[index].date) !== monthSerial(finalRows[index - 1].date) + 1) {
      throw new Error(
        `Missing month between ${finalRows[index - 1].date} and ${finalRows[index].date}`,
      );
    }
  }
  console.log(`No missing months: ${finalRows[0].date} .. ${finalRows.at(-1).date} (${finalRows.length} rows)`);

  const realCagr = realUsStocksCagr(finalRows);
  console.log(`Real US stocks CAGR ${finalRows[0].date} -> ${finalRows.at(-1).date}: ${(realCagr * 100).toFixed(3)}%`);
  if (realCagr < REAL_CAGR_MIN || realCagr > REAL_CAGR_MAX) {
    throw new Error(
      `Real US stocks CAGR ${realCagr} outside ${REAL_CAGR_MIN}..${REAL_CAGR_MAX} — refusing to write`,
    );
  }

  // ---- Write, then verify frozen history is byte-identical --------------------
  const newCsv = `${frozenPrefix}${splicedRows.map(formatRow).join('\n')}\n`;
  await fs.writeFile(SHILLER_CSV, newCsv, 'utf8');
  const written = await fs.readFile(SHILLER_CSV, 'utf8');
  if (!written.startsWith(frozenPrefix)) {
    throw new Error('POST-WRITE ASSERTION FAILED: frozen history is not byte-identical');
  }
  if (!originalCsv.startsWith(frozenPrefix)) {
    throw new Error('POST-WRITE ASSERTION FAILED: original frozen history mismatch');
  }
  console.log(
    `\nFrozen history byte-identical (${frozenPrefix.length} bytes). Spliced rows: ${splicedRows.length} (was ${previousSplicedCount}).`,
  );

  const meta = {
    splicedFrom: SPLICE_FROM,
    splicedThrough: finalRows.at(-1).date,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/extend-asset-classes.mjs',
    sources: {
      usStocks: `SPY adjClose month-end total return (data/tickers/SPY.json, Tiingo) from ${SPLICE_FROM}; S&P composite (Shiller) before. ~3bp/yr ETF fee drag vs index.`,
      usBonds: `FRED GS10 with the original Shiller-pipeline formula gs10/12 - 7*(gs10Next - gs10) from ${SPLICE_FROM}.`,
      cash: `FRED GS10 / 12 / 4 proxy (unchanged convention; not TB3MS) from ${SPLICE_FROM}.`,
      cpi: `FRED CPIAUCNS (CPI-U NSA, matches Shiller levels exactly) from ${SPLICE_FROM}.`,
    },
    interpolatedCpiMonths,
    ...(interpolatedCpiMonths.length > 0
      ? {
          interpolationNote:
            'Geometric interpolation of neighboring CPIAUCNS levels; 2025-10 CPI was never published by BLS (2025 federal shutdown).',
        }
      : {}),
  };
  await fs.writeFile(SPLICE_META, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${SHILLER_CSV}`);
  console.log(`Wrote ${SPLICE_META}`);
  console.log('Now run: node scripts/build-asset-classes.mjs');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
