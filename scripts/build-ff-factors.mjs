import * as fs from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const SCRIPT_DIR = import.meta.dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

const SOURCE_URL =
  'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip';

const OUTPUT_DIRS = [
  path.join(PROJECT_ROOT, 'data', 'asset-classes'),
  path.join(PROJECT_ROOT, 'app', 'public', 'data', 'asset-classes'),
];

const OUTPUT_FILE = 'ff-factors.json';
const MONTHLY_RETURN_MIN = -0.9;
const MONTHLY_RETURN_MAX = 1.0;

function parseYearMonth(date, label) {
  const match = /^(\d{4})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`${label} has invalid yyyy-mm date: ${date}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`${label} has invalid month: ${date}`);
  }

  return year * 12 + month - 1;
}

function parseYyyymm(rawDate, label) {
  const match = /^(\d{4})(\d{2})$/.exec(String(rawDate).trim());
  if (!match) {
    throw new Error(`${label} has invalid yyyymm date: ${rawDate}`);
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`${label} has invalid month: ${rawDate}`);
  }

  return `${match[1]}-${match[2]}`;
}

function addMonths(date, months) {
  const serial = parseYearMonth(date, date) + months;
  const year = Math.floor(serial / 12);
  const month = (serial % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function round6(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function parseFiniteNumber(rawValue, label) {
  const value = Number(String(rawValue).trim());
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is not a finite number: ${rawValue}`);
  }
  return value;
}

function parseFamaPercent(rawValue, label) {
  const percentValue = parseFiniteNumber(rawValue, label);
  if (percentValue === -99.99 || percentValue === -999) {
    throw new Error(`${label} is missing (${percentValue})`);
  }
  return round6(percentValue / 100);
}

function splitCsvLine(line) {
  return line.split(',').map((value) => value.trim());
}

async function downloadSourceZip() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function readLocalZipEntries(buffer) {
  const entries = [];
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }
    if (offset + 30 > buffer.length) {
      throw new Error(`Truncated ZIP local file header at byte ${offset}`);
    }

    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;

    if ((flags & 0x08) !== 0) {
      throw new Error('ZIP uses a data descriptor; expected sizes in the local file header');
    }
    if (nameEnd > buffer.length || dataStart > buffer.length || dataEnd > buffer.length) {
      throw new Error(`Truncated ZIP entry at byte ${offset}`);
    }

    const name = buffer.subarray(nameStart, nameEnd).toString('utf8');
    entries.push({
      name,
      method,
      compressedBytes: buffer.subarray(dataStart, dataEnd),
    });

    offset = dataEnd;
  }

  if (entries.length === 0) {
    throw new Error('ZIP contains no local file entries');
  }

  return entries;
}

function extractCsvFromZip(buffer) {
  const entries = readLocalZipEntries(buffer).filter((entry) => !entry.name.endsWith('/'));
  const csvEntries = entries.filter((entry) => /\.csv$/i.test(entry.name));
  const entry = csvEntries.length > 0 ? csvEntries[0] : entries[0];

  if (!entry) {
    throw new Error('ZIP contains no file entries');
  }
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}`);
  }

  const bytes =
    entry.method === 8 ? inflateRawSync(entry.compressedBytes) : Buffer.from(entry.compressedBytes);

  return {
    name: entry.name,
    content: bytes.toString('utf8').replace(/^\uFEFF/, ''),
    entryCount: entries.length,
  };
}

function parseMonthlyFactors(csvContent) {
  const lines = csvContent.split(/\r?\n/);
  const dates = [];
  const series = {
    mktRf: [],
    smb: [],
    hml: [],
    rf: [],
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!/^\s*\d{6}\s*,/.test(line)) {
      if (dates.length > 0 && line.trim() === '') {
        break;
      }
      continue;
    }

    const row = splitCsvLine(line);
    if (row.length < 5) {
      throw new Error(`CSV line ${lineIndex + 1} has ${row.length} columns; expected at least 5`);
    }

    const date = parseYyyymm(row[0], `CSV line ${lineIndex + 1}`);
    dates.push(date);
    series.mktRf.push(parseFamaPercent(row[1], `${date} Mkt-RF`));
    series.smb.push(parseFamaPercent(row[2], `${date} SMB`));
    series.hml.push(parseFamaPercent(row[3], `${date} HML`));
    series.rf.push(parseFamaPercent(row[4], `${date} RF`));
  }

  if (dates.length === 0) {
    throw new Error('Could not find monthly factor rows in CSV');
  }

  return { dates, series };
}

function validateEqualLengths(payload) {
  const expected = payload.dates.length;
  for (const [seriesName, values] of Object.entries(payload.series)) {
    if (values.length !== expected) {
      throw new Error(`${seriesName} has length ${values.length}; expected ${expected}`);
    }
  }
}

function validateMonthlyDates(dates) {
  if (dates[0] !== '1926-07') {
    throw new Error(`startDate must be 1926-07; got ${dates[0]}`);
  }

  let expectedSerial = parseYearMonth(dates[0], 'dates[0]');
  for (let index = 0; index < dates.length; index += 1) {
    const serial = parseYearMonth(dates[index], `dates[${index}]`);
    if (serial !== expectedSerial) {
      throw new Error(`dates are not consecutive at index ${index}: ${dates[index]}`);
    }
    expectedSerial += 1;
  }
}

function validateFreshEndDate(endDate) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const oldestAllowed = addMonths(currentMonth, -6);
  if (parseYearMonth(endDate, 'endDate') < parseYearMonth(oldestAllowed, 'oldest allowed endDate')) {
    throw new Error(`endDate ${endDate} is older than the allowed ${oldestAllowed}`);
  }
  return { currentMonth, oldestAllowed };
}

function valueAt(payload, date, seriesName) {
  const index = payload.dates.indexOf(date);
  if (index === -1) {
    throw new Error(`Missing anchor date ${date}`);
  }
  return payload.series[seriesName][index];
}

function assertAnchorPercent(payload, date, seriesName, expectedPercent, tolerancePercent) {
  const actualPercent = valueAt(payload, date, seriesName) * 100;
  const delta = Math.abs(actualPercent - expectedPercent);
  if (delta > tolerancePercent) {
    throw new Error(
      `${date} ${seriesName} expected ${expectedPercent}% +/- ${tolerancePercent}%; got ${actualPercent}%`,
    );
  }
  return { date, seriesName, actualPercent, expectedPercent, tolerancePercent };
}

function assertAnchorPercentRange(payload, date, seriesName, minPercent, maxPercent) {
  const actualPercent = valueAt(payload, date, seriesName) * 100;
  if (actualPercent < minPercent || actualPercent > maxPercent) {
    throw new Error(`${date} ${seriesName} expected ${minPercent}%..${maxPercent}%; got ${actualPercent}%`);
  }
  return { date, seriesName, actualPercent, minPercent, maxPercent };
}

function validateRange(payload) {
  for (const [seriesName, values] of Object.entries(payload.series)) {
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${seriesName}[${index}] is invalid at ${payload.dates[index]}: ${value}`);
      }
      if (value < MONTHLY_RETURN_MIN || value > MONTHLY_RETURN_MAX) {
        throw new Error(
          `${seriesName} outside ${MONTHLY_RETURN_MIN}..${MONTHLY_RETURN_MAX} at ${payload.dates[index]}: ${value}`,
        );
      }
    }
  }
}

function validatePayload(payload) {
  validateEqualLengths(payload);
  validateMonthlyDates(payload.dates);
  const freshness = validateFreshEndDate(payload.endDate);
  validateRange(payload);

  const anchors = [
    assertAnchorPercent(payload, '1926-07', 'mktRf', 2.89, 0.02),
    assertAnchorPercent(payload, '1932-07', 'mktRf', 33.61, 0.02),
    assertAnchorPercentRange(payload, '1981-06', 'rf', 1.0, 1.5),
    assertAnchorPercentRange(payload, '2021-01', 'rf', -0.01, 0.02),
  ];

  return { freshness, anchors };
}

function rowFor(payload, index) {
  return {
    date: payload.dates[index],
    mktRf: payload.series.mktRf[index],
    smb: payload.series.smb[index],
    hml: payload.series.hml[index],
    rf: payload.series.rf[index],
  };
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function printRows(label, rows) {
  console.log(`\n${label}`);
  for (const row of rows) {
    console.log(
      `  ${row.date}  mktRf=${row.mktRf.toFixed(6)}  smb=${row.smb.toFixed(6)}  hml=${row.hml.toFixed(6)}  rf=${row.rf.toFixed(6)}`,
    );
  }
}

async function writePayload(payload) {
  const json = `${JSON.stringify(payload)}\n`;
  await Promise.all(
    OUTPUT_DIRS.map(async (outputDir) => {
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(path.join(outputDir, OUTPUT_FILE), json, 'utf8');
    }),
  );
}

async function confirmOutputFiles() {
  const confirmations = [];
  for (const outputDir of OUTPUT_DIRS) {
    const filePath = path.join(outputDir, OUTPUT_FILE);
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    confirmations.push({
      path: path.relative(PROJECT_ROOT, filePath),
      rows: parsed.dates.length,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
    });
  }
  return confirmations;
}

async function main() {
  console.log(`Downloading ${SOURCE_URL}`);
  const zipBuffer = await downloadSourceZip();
  const extracted = extractCsvFromZip(zipBuffer);
  console.log(
    `Extracted ${extracted.name} from ${extracted.entryCount} ZIP entr${extracted.entryCount === 1 ? 'y' : 'ies'}`,
  );

  const { dates, series } = parseMonthlyFactors(extracted.content);
  const payload = {
    source: 'Ken French Data Library, F-F Research Data Factors (monthly)',
    fetchedAt: new Date().toISOString(),
    frequency: 'monthly',
    startDate: dates[0],
    endDate: dates.at(-1),
    dates,
    series,
  };

  const validation = validatePayload(payload);
  await writePayload(payload);
  const confirmations = await confirmOutputFiles();

  console.log('\nValidation');
  console.log(`  rows: ${payload.dates.length}`);
  console.log(`  date range: ${payload.startDate} to ${payload.endDate}`);
  console.log(
    `  freshness: endDate ${payload.endDate}; oldest allowed ${validation.freshness.oldestAllowed}; current month ${validation.freshness.currentMonth}`,
  );
  console.log(`  monthly range: all values within ${MONTHLY_RETURN_MIN}..${MONTHLY_RETURN_MAX}`);
  for (const anchor of validation.anchors) {
    const target =
      'expectedPercent' in anchor
        ? `${formatPercent(anchor.expectedPercent)} +/- ${formatPercent(anchor.tolerancePercent)}`
        : `${formatPercent(anchor.minPercent)}..${formatPercent(anchor.maxPercent)}`;
    console.log(`  anchor ${anchor.date} ${anchor.seriesName}: ${formatPercent(anchor.actualPercent)} (${target})`);
  }

  printRows(
    'First 3 rows',
    [0, 1, 2].map((index) => rowFor(payload, index)),
  );
  printRows(
    'Last 3 rows',
    [payload.dates.length - 3, payload.dates.length - 2, payload.dates.length - 1].map((index) =>
      rowFor(payload, index),
    ),
  );

  console.log('\nOutput parse confirmation');
  for (const confirmation of confirmations) {
    console.log(
      `  ${confirmation.path}: parsed ${confirmation.rows} rows (${confirmation.startDate} to ${confirmation.endDate})`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
