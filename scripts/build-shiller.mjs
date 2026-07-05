import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const RETIREMENT_BUILD_DATA =
  'C:/Users/et2bo/Desktop/Projects/Finance/retirement-sim/scripts/build-data.ts';
const RETIREMENT_SHILLER_CACHE =
  'C:/Users/et2bo/Desktop/Projects/Finance/retirement-sim/scripts/shiller-cache.xls';

const URL = 'http://www.econ.yale.edu/~shiller/data/ie_data.xls';
const OUT = path.join(PROJECT_ROOT, 'context', 'reference-data', 'shiller', 'shiller.csv');
const EXPECTED_HEADER = ['date', 'spReturn', 'bondReturn', 'cashReturn', 'cpi'];
const OVERLAP_REVISION_ALLOWANCE = 12;
const RELATIVE_TOLERANCE = 1e-6;

const req = createRequire(RETIREMENT_BUILD_DATA);
const XLSX = req('xlsx');

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function parsePresentNumber(value) {
  if (isBlank(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseShillerDate(dateNum) {
  const year = Math.floor(dateNum);
  const month = Math.round((dateNum - year) * 100);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid Shiller fractional date: ${dateNum}`);
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0]?.replace(/^\uFEFF/, '').split(',') ?? [];
  if (header.join('|') !== EXPECTED_HEADER.join('|')) {
    throw new Error(`Unexpected ${OUT} header: ${header.join(',')}`);
  }

  return lines.slice(1).map((line, index) => {
    const columns = line.split(',');
    if (columns.length !== 5) {
      throw new Error(`${OUT} line ${index + 2} has ${columns.length} columns`);
    }
    return {
      date: columns[0],
      spReturn: Number(columns[1]),
      bondReturn: Number(columns[2]),
      cashReturn: Number(columns[3]),
      cpi: Number(columns[4]),
    };
  });
}

function formatCsv(rows) {
  const header = `${EXPECTED_HEADER.join(',')}\n`;
  const body = rows
    .map(
      (row) =>
        `${row.date},${row.spReturn.toFixed(8)},${row.bondReturn.toFixed(8)},${row.cashReturn.toFixed(8)},${row.cpi.toFixed(4)}`,
    )
    .join('\n');
  return `${header}${body}\n`;
}

function parseGeneratedCsvRows(csv) {
  return parseCsv(csv);
}

async function fetchFreshXls() {
  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`Shiller fetch failed: ${res.status} ${res.statusText}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  try {
    await fs.writeFile(RETIREMENT_SHILLER_CACHE, buf);
  } catch (error) {
    if (error?.code !== 'EPERM' && error?.code !== 'EACCES') {
      throw error;
    }
    console.warn(
      `Downloaded fresh Shiller workbook but could not refresh retirement-sim cache: ${error.message}`,
    );
  }
  return buf;
}

function rawRowSummary(row, columns) {
  return {
    date: typeof row[columns.date] === 'number' ? parseShillerDate(row[columns.date]) : row[columns.date],
    P: row[columns.p] ?? null,
    D: row[columns.d] ?? null,
    CPI: row[columns.cpi] ?? null,
    GS10: row[columns.gs10] ?? null,
  };
}

function parseShiller(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets.Data;
  if (!sheet) {
    throw new Error('Could not find Data sheet in Shiller workbook');
  }

  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const headerRow = raw.findIndex((row) => row?.[0] === 'Date');
  if (headerRow < 0) {
    throw new Error('Could not find Date header in Shiller workbook');
  }

  const headers = raw[headerRow];
  const columns = {
    date: headers.indexOf('Date'),
    p: headers.indexOf('P'),
    d: headers.indexOf('D'),
    cpi: headers.indexOf('CPI'),
    gs10: headers.findIndex((header) => typeof header === 'string' && header.includes('GS10')),
  };

  for (const [name, column] of Object.entries(columns)) {
    if (column < 0) {
      throw new Error(`Missing Shiller column ${name}; got headers: ${JSON.stringify(headers)}`);
    }
  }

  const rows = raw.slice(headerRow + 1).filter((row) => typeof row[columns.date] === 'number');
  const output = [];
  const skipped = [];

  for (let index = 0; index < rows.length - 1; index += 1) {
    const row = rows[index];
    const next = rows[index + 1];
    const date = parseShillerDate(row[columns.date]);
    const p0 = parsePresentNumber(row[columns.p]);
    const p1 = parsePresentNumber(next[columns.p]);
    const d = parsePresentNumber(row[columns.d]);
    const cpi = parsePresentNumber(row[columns.cpi]);
    const gs10Raw = parsePresentNumber(row[columns.gs10]);
    const gs10NextRaw = parsePresentNumber(next[columns.gs10]);

    if ([p0, p1, d, cpi, gs10Raw, gs10NextRaw].some((value) => value === null)) {
      skipped.push(rawRowSummary(row, columns));
      continue;
    }

    const gs10 = gs10Raw / 100;
    const gs10Next = gs10NextRaw / 100;

    // These formulas are copied from retirement-sim/scripts/build-data.ts:
    // spReturn = (next P - current P + current D / 12) / current P. D is Shiller's
    // annual dividend series, treated there as one-twelfth paid during the month.
    // cashReturn = (current GS10 / 100) / 12 / 4. It is a rough T-bill proxy.
    // bondReturn = (current GS10 / 100) / 12 - 7 * ((next GS10 / 100) - (current GS10 / 100)).
    // cpi is passed through from the current row unchanged.
    const spReturn = (p1 - p0 + d / 12) / p0;
    const cashReturn = gs10 / 12 / 4;
    const bondReturn = gs10 / 12 - 7 * (gs10Next - gs10);

    output.push({ date, spReturn, bondReturn, cashReturn, cpi });
  }

  return {
    rows: output,
    rawRows: rows,
    rawTail: rows.slice(-8).map((row) => rawRowSummary(row, columns)),
    skipped,
  };
}

function relativeMatch(oldValue, newValue) {
  const denominator = Math.max(Math.abs(oldValue), Number.EPSILON);
  return Math.abs(newValue - oldValue) <= RELATIVE_TOLERANCE * denominator;
}

function verifyOverlap(oldRows, newRows) {
  const newByDate = new Map(newRows.map((row) => [row.date, row]));
  const overlap = oldRows.filter((row) => newByDate.has(row.date));
  const protectedOverlapCount = Math.max(0, overlap.length - OVERLAP_REVISION_ALLOWANCE);
  const fatalMismatches = [];
  const allowedRevisionMismatches = [];

  for (let index = 0; index < overlap.length; index += 1) {
    const oldRow = overlap[index];
    const newRow = newByDate.get(oldRow.date);
    const fields = ['spReturn', 'bondReturn', 'cashReturn', 'cpi'];
    const mismatchedFields = fields.filter((field) => !relativeMatch(oldRow[field], newRow[field]));

    if (mismatchedFields.length === 0) {
      continue;
    }

    const mismatch = {
      date: oldRow.date,
      fields: Object.fromEntries(
        mismatchedFields.map((field) => [
          field,
          {
            old: oldRow[field],
            new: newRow[field],
          },
        ]),
      ),
    };

    if (index < protectedOverlapCount) {
      fatalMismatches.push(mismatch);
    } else {
      allowedRevisionMismatches.push(mismatch);
    }
  }

  if (fatalMismatches.length > 0) {
    const examples = fatalMismatches
      .slice(0, 5)
      .map((mismatch) => JSON.stringify(mismatch))
      .join('\n');
    throw new Error(
      `Regression guard failed with ${fatalMismatches.length} non-trailing mismatches.\n${examples}`,
    );
  }

  return {
    overlapCount: overlap.length,
    allowedRevisionMismatchCount: allowedRevisionMismatches.length,
  };
}

function validateMonthlyContinuity(rows) {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1].date;
    const current = rows[index].date;
    const [previousYear, previousMonth] = previous.split('-').map(Number);
    const [currentYear, currentMonth] = current.split('-').map(Number);
    const expectedSerial = previousYear * 12 + previousMonth;
    const currentSerial = currentYear * 12 + currentMonth - 1;
    if (currentSerial !== expectedSerial) {
      throw new Error(`Generated rows are not monthly-contiguous at ${previous} -> ${current}`);
    }
  }
}

async function main() {
  const oldCsv = await fs.readFile(OUT, 'utf8');
  const oldRows = parseCsv(oldCsv);
  const oldLastMonth = oldRows.at(-1)?.date;

  const buf = await fetchFreshXls();
  const parsed = parseShiller(buf);
  validateMonthlyContinuity(parsed.rows);

  if (parsed.rows.length === 0) {
    throw new Error(`No Shiller rows generated. Raw tail:\n${JSON.stringify(parsed.rawTail, null, 2)}`);
  }

  const newLastMonth = parsed.rows.at(-1).date;
  if (newLastMonth <= oldLastMonth) {
    throw new Error(
      `Fresh Shiller workbook did not extend generated data past ${oldLastMonth}; generated last month is ${newLastMonth}. Raw tail:\n${JSON.stringify(parsed.rawTail, null, 2)}`,
    );
  }

  const newCsv = formatCsv(parsed.rows);
  const roundedNewRows = parseGeneratedCsvRows(newCsv);
  const guard = verifyOverlap(oldRows, roundedNewRows);

  await fs.writeFile(OUT, newCsv, 'utf8');

  console.log(`Regression guard passed for ${guard.overlapCount} overlapping rows.`);
  if (guard.allowedRevisionMismatchCount > 0) {
    console.log(
      `Allowed trailing revision mismatches in final ${OVERLAP_REVISION_ALLOWANCE} overlap months: ${guard.allowedRevisionMismatchCount}`,
    );
  }
  console.log(`Old rows: ${oldRows.length}; new rows: ${parsed.rows.length}`);
  console.log(`Old last month: ${oldLastMonth}; new last month: ${newLastMonth}`);
  console.log(`Raw Shiller rows parsed: ${parsed.rawRows.length}; skipped incomplete formula rows: ${parsed.skipped.length}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
