import * as fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPT_DIR = import.meta.dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

const INPUTS = {
  shiller: path.join(PROJECT_ROOT, 'context', 'reference-data', 'shiller', 'shiller.csv'),
  shillerSpliceMeta: path.join(
    PROJECT_ROOT,
    'context',
    'reference-data',
    'shiller',
    'splice-meta.json',
  ),
  sizePremia: path.join(
    PROJECT_ROOT,
    'context',
    'reference-data',
    'asset-classes',
    'Portfolios_Formed_on_ME.csv',
  ),
  dailyMarket: path.join(PROJECT_ROOT, 'context', 'reference-data', 'asset-classes', 'STKDATD.DAT'),
};

const OUTPUT_DIRS = [
  path.join(PROJECT_ROOT, 'app', 'public', 'data', 'asset-classes'),
  path.join(PROJECT_ROOT, 'data', 'asset-classes'),
];

const MONTHLY_RETURN_MIN = -0.9;
const MONTHLY_RETURN_MAX = 1.0;

function parseFiniteNumber(rawValue, label) {
  const value = Number(String(rawValue).trim());
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is not a finite number: ${rawValue}`);
  }
  return value;
}

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

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`${label} has invalid month: ${rawDate}`);
  }

  return `${match[1]}-${match[2]}`;
}

function parseYyyymmdd(rawDate, label) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(rawDate).trim());
  if (!match) {
    throw new Error(`${label} has invalid yyyymmdd date: ${rawDate}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} is not a valid calendar date: ${rawDate}`);
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseIsoDate(date, label) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`${label} has invalid yyyy-mm-dd date: ${date}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} is not a valid calendar date: ${date}`);
  }

  return parsed.getTime();
}

function splitCsvLine(line) {
  return line.split(',').map((value) => value.trim());
}

function validateEqualLengths(fileName, dates, series) {
  const expected = dates.length;
  for (const [seriesName, values] of Object.entries(series)) {
    if (values.length !== expected) {
      throw new Error(
        `${fileName} series ${seriesName} has length ${values.length}; expected ${expected}`,
      );
    }
  }
}

function validateMonthlyDates(fileName, dates) {
  if (dates.length === 0) {
    throw new Error(`${fileName} contains no dates`);
  }

  let expectedSerial = parseYearMonth(dates[0], `${fileName} dates[0]`);
  for (let index = 0; index < dates.length; index += 1) {
    const serial = parseYearMonth(dates[index], `${fileName} dates[${index}]`);
    if (serial !== expectedSerial) {
      throw new Error(
        `${fileName} dates are not contiguous monthly values at index ${index}: ${dates[index]}`,
      );
    }
    expectedSerial += 1;
  }
}

function validateIncreasingDailyDates(fileName, dates) {
  if (dates.length === 0) {
    throw new Error(`${fileName} contains no dates`);
  }

  let previous = null;
  for (let index = 0; index < dates.length; index += 1) {
    const current = parseIsoDate(dates[index], `${fileName} dates[${index}]`);
    if (previous !== null && current <= previous) {
      throw new Error(`${fileName} dates are not strictly increasing at index ${index}`);
    }
    previous = current;
  }
}

function validateSeriesNumbers(fileName, dates, series, nullableSeries = new Set()) {
  for (const [seriesName, values] of Object.entries(series)) {
    const allowNull = nullableSeries.has(seriesName);
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (value === null && allowNull) {
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${fileName} ${seriesName}[${index}] is invalid at ${dates[index]}: ${value}`);
      }
    }
  }
}

function validateMonthlyReturnRange(fileName, dates, series, returnSeriesNames) {
  for (const seriesName of returnSeriesNames) {
    for (let index = 0; index < series[seriesName].length; index += 1) {
      const value = series[seriesName][index];
      if (value === null) {
        continue;
      }
      if (value < MONTHLY_RETURN_MIN || value > MONTHLY_RETURN_MAX) {
        throw new Error(
          `${fileName} ${seriesName} return outside ${MONTHLY_RETURN_MIN}..${MONTHLY_RETURN_MAX} at ${dates[index]}: ${value}`,
        );
      }
    }
  }
}

function valueStats(values) {
  const nonNullValues = values.filter((value) => value !== null);
  return {
    count: nonNullValues.length,
    missing: values.length - nonNullValues.length,
    min: Math.min(...nonNullValues),
    max: Math.max(...nonNullValues),
  };
}

function combinedStats(series, seriesNames) {
  return valueStats(seriesNames.flatMap((seriesName) => series[seriesName]));
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(6) : 'n/a';
}

function createSummary(fileName, payload, returnSeriesNames) {
  const stats = combinedStats(payload.series, returnSeriesNames);
  return {
    file: fileName,
    frequency: payload.frequency,
    rowCount: payload.dates.length,
    startDate: payload.startDate,
    endDate: payload.endDate,
    series: Object.keys(payload.series),
    returnMin: stats.min,
    returnMax: stats.max,
  };
}

function printDatasetStats(summary, payload, returnSeriesNames) {
  console.log(`\n${summary.file}`);
  console.log(`  rows: ${summary.rowCount}`);
  console.log(`  date range: ${summary.startDate} to ${summary.endDate}`);
  console.log(`  series: ${summary.series.join(', ')}`);

  for (const seriesName of returnSeriesNames) {
    const stats = valueStats(payload.series[seriesName]);
    const missing = stats.missing > 0 ? `, missing ${stats.missing}` : '';
    console.log(
      `  ${seriesName}: min ${formatNumber(stats.min)}, max ${formatNumber(stats.max)}${missing}`,
    );
  }
}

function printSummaryTable(summaries) {
  const rows = [
    ['file', 'frequency', 'rows', 'start', 'end', 'series', 'return min', 'return max'],
    ...summaries.map((summary) => [
      summary.file,
      summary.frequency,
      String(summary.rowCount),
      summary.startDate,
      summary.endDate,
      summary.series.join(','),
      formatNumber(summary.returnMin),
      formatNumber(summary.returnMax),
    ]),
  ];

  const widths = rows[0].map((_, columnIndex) =>
    Math.max(...rows.map((row) => row[columnIndex].length)),
  );

  console.log('\nFinal summary');
  for (const [rowIndex, row] of rows.entries()) {
    const line = row.map((cell, columnIndex) => cell.padEnd(widths[columnIndex])).join('  ');
    console.log(line);
    if (rowIndex === 0) {
      console.log(widths.map((width) => '-'.repeat(width)).join('  '));
    }
  }
}

async function buildUsMonthly() {
  const content = await fs.readFile(INPUTS.shiller, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = splitCsvLine(lines[0].replace(/^\uFEFF/, ''));
  const expectedHeader = ['date', 'spReturn', 'bondReturn', 'cashReturn', 'cpi'];
  if (header.join('|') !== expectedHeader.join('|')) {
    throw new Error(`Unexpected shiller.csv header: ${header.join(',')}`);
  }

  const dates = [];
  const series = {
    usStocks: [],
    usBonds: [],
    cash: [],
    cpi: [],
  };

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const columns = splitCsvLine(lines[lineIndex]);
    if (columns.length !== 5) {
      throw new Error(`shiller.csv line ${lineIndex + 1} has ${columns.length} columns`);
    }

    const date = columns[0];
    parseYearMonth(date, `shiller.csv line ${lineIndex + 1}`);
    dates.push(date);
    series.usStocks.push(parseFiniteNumber(columns[1], `shiller.csv ${date} spReturn`));
    series.usBonds.push(parseFiniteNumber(columns[2], `shiller.csv ${date} bondReturn`));
    series.cash.push(parseFiniteNumber(columns[3], `shiller.csv ${date} cashReturn`));
    series.cpi.push(parseFiniteNumber(columns[4], `shiller.csv ${date} cpi`));
  }

  // Splice provenance written by scripts/extend-asset-classes.mjs (post-2023-06
  // extension from SPY + FRED after Yale abandoned ie_data.xls). Optional: absent
  // metadata means the file is pure Shiller-pipeline output.
  let spliceMeta = null;
  try {
    const rawMeta = JSON.parse(await fs.readFile(INPUTS.shillerSpliceMeta, 'utf8'));
    spliceMeta = {
      splicedFrom: rawMeta.splicedFrom,
      splicedThrough: rawMeta.splicedThrough,
      spliceSources: rawMeta.sources,
    };
    if (rawMeta.splicedThrough !== dates.at(-1)) {
      throw new Error(
        `splice-meta.json splicedThrough ${rawMeta.splicedThrough} does not match shiller.csv end ${dates.at(-1)}; rerun scripts/extend-asset-classes.mjs`,
      );
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const payload = {
    source: 'Shiller / retirement-sim normalized',
    frequency: 'monthly',
    startDate: dates[0],
    endDate: dates.at(-1),
    ...(spliceMeta ?? {}),
    series,
    dates,
  };

  validateEqualLengths('us-monthly.json', dates, series);
  validateSeriesNumbers('us-monthly.json', dates, series);
  validateMonthlyDates('us-monthly.json', dates);
  validateMonthlyReturnRange('us-monthly.json', dates, series, ['usStocks', 'usBonds', 'cash']);

  return {
    fileName: 'us-monthly.json',
    payload,
    returnSeriesNames: ['usStocks', 'usBonds', 'cash'],
  };
}

function parseFamaPercent(rawValue, label) {
  const percentValue = parseFiniteNumber(rawValue, label);
  if (percentValue === -99.99 || percentValue === -999) {
    return null;
  }
  return percentValue / 100;
}

async function buildUsSizePremia() {
  const content = await fs.readFile(INPUTS.sizePremia, 'utf8');
  const lines = content.split(/\r?\n/);
  const sectionIndex = lines.findIndex(
    (line) => line.trim() === 'Average Value Weight Returns -- Monthly',
  );
  if (sectionIndex === -1) {
    throw new Error('Could not find Fama-French Average Value Weight Returns -- Monthly section');
  }

  let headerIndex = sectionIndex + 1;
  while (headerIndex < lines.length && lines[headerIndex].trim() === '') {
    headerIndex += 1;
  }

  const header = splitCsvLine(lines[headerIndex]);
  const columns = {
    smallCap: header.indexOf('Lo 30'),
    midCap: header.indexOf('Med 40'),
    largeCap: header.indexOf('Hi 30'),
  };

  for (const [seriesName, columnIndex] of Object.entries(columns)) {
    if (columnIndex === -1) {
      throw new Error(`Could not find ${seriesName} column in Fama-French monthly header`);
    }
  }

  const dates = [];
  const series = {
    smallCap: [],
    midCap: [],
    largeCap: [],
  };

  for (let lineIndex = headerIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!/^\s*\d{6}\s*,/.test(line)) {
      if (dates.length === 0) {
        continue;
      }
      break;
    }

    const row = splitCsvLine(line);
    const date = parseYyyymm(row[0], `Fama-French line ${lineIndex + 1}`);
    dates.push(date);

    for (const [seriesName, columnIndex] of Object.entries(columns)) {
      if (columnIndex >= row.length) {
        throw new Error(`Fama-French line ${lineIndex + 1} is missing ${seriesName}`);
      }
      series[seriesName].push(
        parseFamaPercent(row[columnIndex], `Fama-French ${date} ${seriesName}`),
      );
    }
  }

  const payload = {
    source: 'Fama-French Portfolios Formed on Size (CRSP)',
    frequency: 'monthly',
    startDate: dates[0],
    endDate: dates.at(-1),
    dates,
    series,
  };

  validateEqualLengths('us-size-premia.json', dates, series);
  validateSeriesNumbers(
    'us-size-premia.json',
    dates,
    series,
    new Set(['smallCap', 'midCap', 'largeCap']),
  );
  validateMonthlyDates('us-size-premia.json', dates);
  validateMonthlyReturnRange('us-size-premia.json', dates, series, [
    'smallCap',
    'midCap',
    'largeCap',
  ]);

  return {
    fileName: 'us-size-premia.json',
    payload,
    returnSeriesNames: ['smallCap', 'midCap', 'largeCap'],
  };
}

async function buildUsMarketDaily() {
  const content = await fs.readFile(INPUTS.dailyMarket, 'utf8');
  const lines = content.split(/\r?\n/);
  const dates = [];
  const series = {
    market: [],
    riskFree: [],
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (line === '') {
      continue;
    }

    const columns = line.split(/\s+/);
    if (columns.length < 4) {
      throw new Error(`STKDATD.DAT line ${lineIndex + 1} has fewer than 4 columns`);
    }

    const date = parseYyyymmdd(columns[0], `STKDATD.DAT line ${lineIndex + 1}`);
    dates.push(date);
    series.market.push(parseFiniteNumber(columns[1], `STKDATD.DAT ${date} marketReturn`));
    series.riskFree.push(parseFiniteNumber(columns[3], `STKDATD.DAT ${date} riskFree`));
  }

  const payload = {
    source: 'Daily US market returns (Schwert-style)',
    frequency: 'daily',
    startDate: dates[0],
    endDate: dates.at(-1),
    dates,
    series,
  };

  validateEqualLengths('us-market-daily.json', dates, series);
  validateSeriesNumbers('us-market-daily.json', dates, series);
  validateIncreasingDailyDates('us-market-daily.json', dates);

  return {
    fileName: 'us-market-daily.json',
    payload,
    returnSeriesNames: ['market', 'riskFree'],
  };
}

function buildManifest(outputs) {
  return {
    files: outputs.map(({ fileName, payload }) => ({
      file: fileName,
      frequency: payload.frequency,
      startDate: payload.startDate,
      endDate: payload.endDate,
      rowCount: payload.dates.length,
      series: Object.keys(payload.series),
    })),
  };
}

async function writeJsonToOutputs(fileName, payload) {
  const json = `${JSON.stringify(payload)}\n`;
  await Promise.all(
    OUTPUT_DIRS.map(async (outputDir) => {
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(path.join(outputDir, fileName), json, 'utf8');
    }),
  );
}

async function main() {
  const outputs = [await buildUsMonthly(), await buildUsSizePremia(), await buildUsMarketDaily()];
  const manifest = buildManifest(outputs);

  for (const output of outputs) {
    await writeJsonToOutputs(output.fileName, output.payload);
  }
  await writeJsonToOutputs('manifest.json', manifest);

  const summaries = outputs.map((output) =>
    createSummary(output.fileName, output.payload, output.returnSeriesNames),
  );
  for (let index = 0; index < outputs.length; index += 1) {
    printDatasetStats(summaries[index], outputs[index].payload, outputs[index].returnSeriesNames);
  }

  console.log(
    `\nWrote ${outputs.length + 1} files to ${OUTPUT_DIRS.map((dir) => path.relative(PROJECT_ROOT, dir)).join(' and ')}`,
  );
  printSummaryTable(summaries);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
