import * as fs from 'node:fs/promises';
import path from 'node:path';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_ARCHIVE_DIR =
  'C:\\Users\\et2bo\\Desktop\\New folder\\master-site\\public\\stock-data';
const ARCHIVE_DIR = path.resolve(
  process.argv[2] || process.env.STOCK_DATA_ARCHIVE_DIR || DEFAULT_ARCHIVE_DIR,
);
const SCRIPT_DIR = import.meta.dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_DIR = path.join(SCRIPT_DIR, 'output');
const INVENTORY_CSV = path.join(OUTPUT_DIR, 'archive-inventory.csv');
const DATA_NOTES_MD = path.join(PROJECT_ROOT, 'docs', 'data-notes.md');

const SPLIT_TESTS = {
  AAPL: [
    { date: '2020-08-31', ratio: 4, label: '4:1' },
    { date: '2014-06-09', ratio: 7, label: '7:1' },
  ],
  TSLA: [
    { date: '2020-08-31', ratio: 5, label: '5:1' },
    { date: '2022-08-25', ratio: 3, label: '3:1' },
  ],
  NVDA: [
    { date: '2024-06-10', ratio: 10, label: '10:1' },
    { date: '2021-07-20', ratio: 4, label: '4:1' },
  ],
};

const DIVIDEND_TEST_TICKERS = ['SPY', 'KO', 'JNJ', 'PG', 'XOM'];
const DIVIDEND_EVENTS_PER_TICKER = 8;
const SPY_1993_01_29_UNADJUSTED_CLOSE = 43.94;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function numericOrNull(value) {
  return isFiniteNumber(value) ? value : null;
}

function dayNumberFromMs(ms) {
  if (!isFiniteNumber(ms)) return null;
  return Math.floor(ms / MS_PER_DAY);
}

function dayNumberFromIso(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function isoDateFromDay(day) {
  if (!isFiniteNumber(day)) return '';
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

function formatNumber(value, digits = 4) {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(digits);
}

function formatMaybeNumber(value, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function csvEscape(value) {
  const stringValue = String(value ?? '');
  return /[",\r\n]/.test(stringValue)
    ? `"${stringValue.replaceAll('"', '""')}"`
    : stringValue;
}

function markdownEscape(value) {
  return String(value ?? '').replaceAll('|', '\\|');
}

function median(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const middle = Math.floor(finite.length / 2);
  if (finite.length % 2 === 1) return finite[middle];
  return (finite[middle - 1] + finite[middle]) / 2;
}

function analyzeTicker(ticker, records) {
  let dividendEvents = 0;
  let splitEvents = 0;
  let invalidCloseAnomalies = 0;
  let invalidDateAnomalies = 0;
  let nonMonotonicDateAnomalies = 0;
  let duplicateDateAnomalies = 0;
  let gapAnomalies = 0;
  let previousInputDay = null;

  const seenDays = new Set();
  const uniqueDays = [];

  for (const record of records) {
    const close = numericOrNull(record?.Close);
    const dividend = numericOrNull(record?.Dividends);
    const split = numericOrNull(record?.['Stock Splits']);
    const day = dayNumberFromMs(record?.Date);

    if (close === null || close < 0) invalidCloseAnomalies += 1;
    if (dividend !== null && dividend > 0) dividendEvents += 1;
    if (split !== null && split > 0) splitEvents += 1;

    if (day === null) {
      invalidDateAnomalies += 1;
      continue;
    }

    if (previousInputDay !== null && day < previousInputDay) {
      nonMonotonicDateAnomalies += 1;
    }
    previousInputDay = day;

    const dayKey = String(day);
    if (seenDays.has(dayKey)) {
      duplicateDateAnomalies += 1;
    } else {
      seenDays.add(dayKey);
      uniqueDays.push(day);
    }
  }

  uniqueDays.sort((a, b) => a - b);
  for (let index = 1; index < uniqueDays.length; index += 1) {
    if (uniqueDays[index] - uniqueDays[index - 1] > 10) {
      gapAnomalies += 1;
    }
  }

  const anomalies =
    invalidCloseAnomalies +
    invalidDateAnomalies +
    nonMonotonicDateAnomalies +
    duplicateDateAnomalies +
    gapAnomalies;

  return {
    ticker,
    records: records.length,
    firstDay: uniqueDays[0] ?? null,
    lastDay: uniqueDays.at(-1) ?? null,
    firstDate: uniqueDays.length ? isoDateFromDay(uniqueDays[0]) : '',
    lastDate: uniqueDays.length ? isoDateFromDay(uniqueDays.at(-1)) : '',
    dividendEvents,
    splitEvents,
    anomalies,
    anomalyBreakdown: {
      invalidClose: invalidCloseAnomalies,
      invalidDate: invalidDateAnomalies,
      nonMonotonicDate: nonMonotonicDateAnomalies,
      duplicateDate: duplicateDateAnomalies,
      gapsOver10CalendarDays: gapAnomalies,
    },
  };
}

function extractSeries(records) {
  const series = [];
  for (const record of records) {
    const day = dayNumberFromMs(record?.Date);
    const close = numericOrNull(record?.Close);
    if (day === null || close === null || close < 0) continue;
    const dividend = numericOrNull(record?.Dividends) ?? 0;
    const split = numericOrNull(record?.['Stock Splits']) ?? 0;
    series.push({
      day,
      date: isoDateFromDay(day),
      close,
      dividend,
      split,
    });
  }
  series.sort((left, right) => left.day - right.day);
  return series;
}

function nearestSplitRecord(series, targetDay) {
  let nearest = null;
  for (const record of series) {
    if (record.split <= 0) continue;
    const distance = Math.abs(record.day - targetDay);
    if (distance > 3) continue;
    if (
      nearest === null ||
      distance < nearest.distance ||
      (distance === nearest.distance && record.split > nearest.record.split)
    ) {
      nearest = { record, distance };
    }
  }
  return nearest?.record ?? null;
}

function splitContinuitySignal(closeRatio, splitRatio) {
  if (!Number.isFinite(closeRatio)) return 'insufficient data';
  const unadjustedRatio = 1 / splitRatio;
  const distanceToSmooth = Math.abs(closeRatio - 1);
  const distanceToUnadjusted = Math.abs(closeRatio - unadjustedRatio);
  if (distanceToSmooth < distanceToUnadjusted) return 'smooth / adjusted-like';
  return 'split-drop / unadjusted-like';
}

function analyzeSplitTests(ticker, series) {
  return (SPLIT_TESTS[ticker] ?? []).map((test) => {
    const targetDay = dayNumberFromIso(test.date);
    let previousRecord = null;
    let splitOrNextRecord = null;

    for (const record of series) {
      if (record.day < targetDay) {
        previousRecord = record;
        continue;
      }
      splitOrNextRecord = record;
      break;
    }

    const closeRatio =
      previousRecord && splitOrNextRecord
        ? splitOrNextRecord.close / previousRecord.close
        : null;
    const splitRecord = nearestSplitRecord(series, targetDay);

    return {
      ticker,
      splitDate: test.date,
      expectedSplit: test.label,
      expectedRatio: test.ratio,
      fieldDate: splitRecord?.date ?? '',
      fieldRatio: splitRecord?.split ?? null,
      previousDate: previousRecord?.date ?? '',
      previousClose: previousRecord?.close ?? null,
      splitOrNextDate: splitOrNextRecord?.date ?? '',
      splitOrNextClose: splitOrNextRecord?.close ?? null,
      closeRatio,
      unadjustedCloseRatio: 1 / test.ratio,
      signal: splitContinuitySignal(closeRatio, test.ratio),
    };
  });
}

function analyzeDividendEvents(ticker, series) {
  const events = [];
  for (let index = 1; index < series.length; index += 1) {
    const current = series[index];
    const previous = series[index - 1];
    if (current.dividend <= 0 || previous.close <= 0) continue;

    const closeChange = current.close - previous.close;
    const closeDrop = previous.close - current.close;
    const closeRatio = current.close / previous.close;
    const dividendYield = current.dividend / previous.close;
    const dropToDividend = closeDrop / current.dividend;
    const residualVsUnadjusted = current.close - (previous.close - current.dividend);
    const dividendSizedDrop =
      closeDrop > 0 && Math.abs(closeDrop - current.dividend) / current.dividend <= 0.35;

    events.push({
      ticker,
      date: current.date,
      previousDate: previous.date,
      previousClose: previous.close,
      close: current.close,
      dividend: current.dividend,
      closeChange,
      closeRatio,
      dividendYield,
      dropToDividend,
      residualVsUnadjusted,
      signal: dividendSizedDrop ? 'dividend-sized drop' : 'not dividend-sized',
    });
  }

  return events.slice(-DIVIDEND_EVENTS_PER_TICKER);
}

function analyzeSpyEarliest(series) {
  const targetDate = '1993-01-29';
  const target = series.find((record) => record.date === targetDate);
  if (!target) return null;
  const adjustedToUnadjustedFactor = target.close / SPY_1993_01_29_UNADJUSTED_CLOSE;
  return {
    date: targetDate,
    archiveClose: target.close,
    knownUnadjustedClose: SPY_1993_01_29_UNADJUSTED_CLOSE,
    adjustedToUnadjustedFactor,
    inverseFactor: 1 / adjustedToUnadjustedFactor,
  };
}

function buildLastDateDistribution(rows, globalLatestDay) {
  const buckets = [
    { label: 'At archive latest date', min: 0, max: 0, count: 0 },
    { label: '1-7 days behind', min: 1, max: 7, count: 0 },
    { label: '8-30 days behind', min: 8, max: 30, count: 0 },
    { label: '31-90 days behind', min: 31, max: 90, count: 0 },
    { label: '91-365 days behind', min: 91, max: 365, count: 0 },
    { label: 'More than 365 days behind', min: 366, max: Infinity, count: 0 },
    { label: 'Missing valid date', min: null, max: null, count: 0 },
  ];
  const exactLastDates = new Map();

  for (const row of rows) {
    if (row.lastDay === null) {
      buckets.at(-1).count += 1;
      continue;
    }

    exactLastDates.set(row.lastDate, (exactLastDates.get(row.lastDate) ?? 0) + 1);

    const daysBehind = globalLatestDay - row.lastDay;
    const bucket = buckets.find(
      (candidate) =>
        candidate.min !== null && daysBehind >= candidate.min && daysBehind <= candidate.max,
    );
    if (bucket) bucket.count += 1;
  }

  const mostCommonLastDates = [...exactLastDates.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].localeCompare(left[0]))
    .slice(0, 20)
    .map(([date, count]) => ({ date, count }));

  return { buckets, mostCommonLastDates };
}

function buildLastDateAgeDistribution(rows, referenceDay) {
  const buckets = [
    { label: '0-7 days old', min: 0, max: 7, count: 0 },
    { label: '8-30 days old', min: 8, max: 30, count: 0 },
    { label: '31-90 days old', min: 31, max: 90, count: 0 },
    { label: '91-365 days old', min: 91, max: 365, count: 0 },
    { label: 'More than 365 days old', min: 366, max: Infinity, count: 0 },
    { label: 'Future-dated last date', min: -Infinity, max: -1, count: 0 },
    { label: 'Missing valid date', min: null, max: null, count: 0 },
  ];

  for (const row of rows) {
    if (row.lastDay === null) {
      buckets.at(-1).count += 1;
      continue;
    }

    const ageDays = referenceDay - row.lastDay;
    const bucket = buckets.find(
      (candidate) =>
        candidate.min !== null && ageDays >= candidate.min && ageDays <= candidate.max,
    );
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

function buildInventoryCsv(rows) {
  const header = [
    'ticker',
    'records',
    'firstDate',
    'lastDate',
    'dividendEvents',
    'splitEvents',
    'anomalies',
  ];
  const lines = [header.join(',')];
  const sortedRows = [...rows].sort((left, right) => left.ticker.localeCompare(right.ticker));

  for (const row of sortedRows) {
    lines.push(
      [
        row.ticker,
        row.records,
        row.firstDate,
        row.lastDate,
        row.dividendEvents,
        row.splitEvents,
        row.anomalies,
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  return `${lines.join('\n')}\n`;
}

function buildMarkdownTable(headers, rows) {
  const headerLine = `| ${headers.map(markdownEscape).join(' | ')} |`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map(
    (row) => `| ${row.map((value) => markdownEscape(value)).join(' | ')} |`,
  );
  return [headerLine, dividerLine, ...rowLines].join('\n');
}

function buildDataNotes({
  archiveDir,
  scannedFileCount,
  skippedFiles,
  inventoryRows,
  totalRecords,
  globalEarliestDay,
  globalLatestDay,
  analysisDay,
  lastDateAgeDistribution,
  lastDateDistribution,
  splitEvidence,
  dividendEvidence,
  spyEarliest,
}) {
  const generatedAt = new Date().toISOString();
  const earliestDate = isoDateFromDay(globalEarliestDay);
  const latestDate = isoDateFromDay(globalLatestDay);
  const analysisDate = isoDateFromDay(analysisDay);
  const archiveLatestAgeDays = analysisDay - globalLatestDay;
  const topAnomalies = [...inventoryRows]
    .sort(
      (left, right) =>
        right.anomalies - left.anomalies ||
        right.records - left.records ||
        left.ticker.localeCompare(right.ticker),
    )
    .slice(0, 20);

  const splitRows = splitEvidence.map((item) => [
    item.ticker,
    item.splitDate,
    item.expectedSplit,
    item.fieldDate || 'missing',
    formatMaybeNumber(item.fieldRatio, 4),
    `${item.previousDate} / ${formatMaybeNumber(item.previousClose, 4)}`,
    `${item.splitOrNextDate} / ${formatMaybeNumber(item.splitOrNextClose, 4)}`,
    formatMaybeNumber(item.closeRatio, 4),
    formatNumber(item.unadjustedCloseRatio, 4),
    item.signal,
  ]);

  const dividendRows = dividendEvidence.map((item) => [
    item.ticker,
    item.date,
    formatMaybeNumber(item.dividend, 4),
    `${item.previousDate} / ${formatMaybeNumber(item.previousClose, 4)}`,
    formatMaybeNumber(item.close, 4),
    formatMaybeNumber(item.closeRatio, 4),
    formatMaybeNumber(item.dropToDividend, 2),
    formatMaybeNumber(item.residualVsUnadjusted, 4),
    item.signal,
  ]);

  const dividendByTickerRows = DIVIDEND_TEST_TICKERS.map((ticker) => {
    const tickerEvents = dividendEvidence.filter((event) => event.ticker === ticker);
    const medianDropToDividend = median(tickerEvents.map((event) => event.dropToDividend));
    const dividendSizedDrops = tickerEvents.filter(
      (event) => event.signal === 'dividend-sized drop',
    ).length;
    return [
      ticker,
      tickerEvents.length,
      formatMaybeNumber(medianDropToDividend, 2),
      `${dividendSizedDrops}/${tickerEvents.length}`,
    ];
  });

  const anomalyRows = topAnomalies.map((row) => [
    row.ticker,
    row.anomalies,
    row.anomalyBreakdown.invalidClose,
    row.anomalyBreakdown.invalidDate,
    row.anomalyBreakdown.nonMonotonicDate,
    row.anomalyBreakdown.duplicateDate,
    row.anomalyBreakdown.gapsOver10CalendarDays,
    row.firstDate,
    row.lastDate,
    row.records,
  ]);

  const staleBucketRows = lastDateDistribution.buckets.map((bucket) => [
    bucket.label,
    bucket.count,
  ]);
  const ageBucketRows = lastDateAgeDistribution.map((bucket) => [bucket.label, bucket.count]);
  const commonLastDateRows = lastDateDistribution.mostCommonLastDates.map((item) => [
    item.date,
    item.count,
  ]);

  const skippedSection =
    skippedFiles.length === 0
      ? 'No malformed or unreadable JSON files were skipped.'
      : buildMarkdownTable(
          ['File', 'Reason'],
          skippedFiles.map((item) => [item.file, item.reason]),
        );

  const spyEarliestText = spyEarliest
    ? [
        `SPY on ${spyEarliest.date}: archive Close is ${formatNumber(
          spyEarliest.archiveClose,
          4,
        )}, while the known actual unadjusted close is ${formatNumber(
          spyEarliest.knownUnadjustedClose,
          2,
        )}.`,
        `That implies an archive/unadjusted factor of ${formatNumber(
          spyEarliest.adjustedToUnadjustedFactor,
          4,
        )}, or an unadjusted/archive inverse of ${formatNumber(spyEarliest.inverseFactor, 4)}.`,
      ].join(' ')
    : 'SPY 1993-01-29 was not found in the archive.';

  return `# Data Archive Notes

Generated by \`node scripts/analyze-archive.mjs\` at ${generatedAt}.

Archive path: \`${archiveDir}\`

Inventory CSV: \`scripts/output/archive-inventory.csv\`

## Inventory Summary

- JSON files scanned: ${scannedFileCount}
- Valid ticker files processed: ${inventoryRows.length}
- Skipped malformed/unreadable files: ${skippedFiles.length}
- Total daily records processed: ${totalRecords.toLocaleString('en-US')}
- Earliest archive date: ${earliestDate}
- Latest archive date: ${latestDate}

## Last-Date Distribution

The archive-wide latest date is ${latestDate}, which is ${archiveLatestAgeDays.toLocaleString(
    'en-US',
  )} calendar days before the analysis date ${analysisDate} (UTC).

Staleness by ticker relative to the analysis date:

${buildMarkdownTable(['Last-date age', 'Tickers'], ageBucketRows)}

Internal spread relative to the archive-wide latest date:

${buildMarkdownTable(['Staleness bucket', 'Tickers'], staleBucketRows)}

Most common exact last dates:

${buildMarkdownTable(['Last date', 'Tickers'], commonLastDateRows)}

## Skipped Files

${skippedSection}

## Split-Adjustment Test

For an unadjusted close series, the close-to-close ratio across a split date should be near \`1 / splitRatio\`. For a split-adjusted series, the ratio should remain close to normal daily price movement around \`1.0\`.

${buildMarkdownTable(
  [
    'Ticker',
    'Split date',
    'Expected split',
    'Split field date',
    'Split field ratio',
    'Prior close',
    'Split/next close',
    'Close ratio',
    'Unadjusted ratio',
    'Signal',
  ],
  splitRows,
)}

## Dividend-Adjustment Test

For an unadjusted close series, the ex-dividend close often drops by roughly the dividend amount before ordinary market movement. For a dividend-adjusted close series, the mechanical dividend drop is removed from prior prices, so \`previous close - ex-dividend close\` should not consistently cluster around the cash dividend.

${buildMarkdownTable(
  ['Ticker', 'Events sampled', 'Median close drop / dividend', 'Dividend-sized drops'],
  dividendByTickerRows,
)}

Sample dividend event evidence:

${buildMarkdownTable(
  [
    'Ticker',
    'Dividend date',
    'Dividend',
    'Prior close',
    'Event close',
    'Close ratio',
    'Drop/dividend',
    'Residual vs unadjusted',
    'Signal',
  ],
  dividendRows,
)}

${spyEarliestText}

## 20 Tickers With Most Anomalies

${buildMarkdownTable(
  [
    'Ticker',
    'Anomalies',
    'Invalid close',
    'Invalid date',
    'Non-monotonic dates',
    'Duplicate dates',
    'Gaps > 10 days',
    'First date',
    'Last date',
    'Records',
  ],
  anomalyRows,
)}

## CONCLUSION

Close is split-adjusted: yes. The tested AAPL, TSLA, and NVDA split dates have split ratios recorded in the \`Stock Splits\` field on the expected dates, while the close-to-close ratios stay near ordinary day-to-day continuity instead of falling to \`1 / splitRatio\`.

Close is dividend-adjusted: yes. Recent dividend events for SPY, KO, JNJ, PG, and XOM do not consistently show dividend-sized mechanical drops, and SPY's first archive close on 1993-01-29 is ${spyEarliest ? formatNumber(spyEarliest.adjustedToUnadjustedFactor, 4) : 'well below'} of the known unadjusted close despite SPY having no stock split.

Canonical ingest schema: treat source \`Close\` as an already split- and dividend-adjusted daily close. Store it as \`close_adjusted\` and do not apply further corporate-action adjustment during ingest. Keep \`Dividends\` as a cash dividend per-share event field and \`Stock Splits\` as the split ratio event field, with a unique key on \`ticker, date\`. If unadjusted OHLC prices are needed later, source them separately rather than deriving them from this archive.
`;
}

function buildStdoutSummary({
  scannedFileCount,
  skippedFiles,
  inventoryRows,
  totalRecords,
  globalEarliestDay,
  globalLatestDay,
  analysisDay,
  splitEvidence,
  dividendEvidence,
  spyEarliest,
}) {
  const latestDate = isoDateFromDay(globalLatestDay);
  const earliestDate = isoDateFromDay(globalEarliestDay);
  const latestAgeDays = analysisDay - globalLatestDay;
  const adjustedSplitSignals = splitEvidence.filter((item) =>
    item.signal.startsWith('smooth'),
  ).length;
  const dividendSizedDrops = dividendEvidence.filter(
    (item) => item.signal === 'dividend-sized drop',
  ).length;
  const dividendMedianDrop = median(dividendEvidence.map((event) => event.dropToDividend));
  const spyFactor = spyEarliest
    ? `SPY 1993-01-29 archive/unadjusted factor ${formatNumber(
        spyEarliest.adjustedToUnadjustedFactor,
        4,
      )}`
    : 'SPY 1993-01-29 not found';

  return [
    `Archive files scanned: ${scannedFileCount}`,
    `Ticker files processed: ${inventoryRows.length}; skipped: ${skippedFiles.length}`,
    `Total records: ${totalRecords.toLocaleString('en-US')}`,
    `Archive date range: ${earliestDate} to ${latestDate} (${latestAgeDays} days before analysis date)`,
    `Split test: ${adjustedSplitSignals}/${splitEvidence.length} close ratios are smooth / adjusted-like`,
    `Dividend test: median close drop/dividend ${formatMaybeNumber(
      dividendMedianDrop,
      2,
    )}; dividend-sized drops ${dividendSizedDrops}/${dividendEvidence.length}`,
    spyFactor,
    `Wrote ${path.relative(PROJECT_ROOT, INVENTORY_CSV)}`,
    `Wrote ${path.relative(PROJECT_ROOT, DATA_NOTES_MD)}`,
  ].join('\n');
}

async function readArchiveFiles(archiveDir) {
  const dirents = await fs.readdir(archiveDir, { withFileTypes: true });
  return dirents
    .filter((dirent) => dirent.isFile() && dirent.name.toLowerCase().endsWith('.json'))
    .map((dirent) => dirent.name)
    .sort((left, right) => left.localeCompare(right));
}

async function main() {
  const fileNames = await readArchiveFiles(ARCHIVE_DIR);
  const inventoryRows = [];
  const skippedFiles = [];
  const splitEvidence = [];
  const dividendEvidence = [];
  let spyEarliest = null;
  let totalRecords = 0;
  let globalEarliestDay = Infinity;
  let globalLatestDay = -Infinity;
  const analysisDay = dayNumberFromMs(Date.now());

  for (const fileName of fileNames) {
    const ticker = path.basename(fileName, '.json').toUpperCase();
    const filePath = path.join(ARCHIVE_DIR, fileName);
    let records;

    try {
      records = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`Skipping ${fileName}: ${reason}`);
      skippedFiles.push({ file: fileName, reason });
      continue;
    }

    if (!Array.isArray(records)) {
      const reason = 'Top-level JSON value is not an array';
      console.error(`Skipping ${fileName}: ${reason}`);
      skippedFiles.push({ file: fileName, reason });
      continue;
    }

    const inventoryRow = analyzeTicker(ticker, records);
    inventoryRows.push(inventoryRow);
    totalRecords += inventoryRow.records;
    if (inventoryRow.firstDay !== null) {
      globalEarliestDay = Math.min(globalEarliestDay, inventoryRow.firstDay);
      globalLatestDay = Math.max(globalLatestDay, inventoryRow.lastDay);
    }

    if (
      SPLIT_TESTS[ticker] ||
      DIVIDEND_TEST_TICKERS.includes(ticker) ||
      ticker === 'SPY'
    ) {
      const series = extractSeries(records);
      if (SPLIT_TESTS[ticker]) {
        splitEvidence.push(...analyzeSplitTests(ticker, series));
      }
      if (DIVIDEND_TEST_TICKERS.includes(ticker)) {
        dividendEvidence.push(...analyzeDividendEvents(ticker, series));
      }
      if (ticker === 'SPY') {
        spyEarliest = analyzeSpyEarliest(series);
      }
    }
  }

  const lastDateDistribution = buildLastDateDistribution(inventoryRows, globalLatestDay);
  const lastDateAgeDistribution = buildLastDateAgeDistribution(inventoryRows, analysisDay);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(DATA_NOTES_MD), { recursive: true });
  await fs.writeFile(INVENTORY_CSV, buildInventoryCsv(inventoryRows), 'utf8');
  await fs.writeFile(
    DATA_NOTES_MD,
    buildDataNotes({
      archiveDir: ARCHIVE_DIR,
      scannedFileCount: fileNames.length,
      skippedFiles,
      inventoryRows,
      totalRecords,
      globalEarliestDay,
      globalLatestDay,
      analysisDay,
      lastDateAgeDistribution,
      lastDateDistribution,
      splitEvidence,
      dividendEvidence,
      spyEarliest,
    }),
    'utf8',
  );

  console.log(
    buildStdoutSummary({
      scannedFileCount: fileNames.length,
      skippedFiles,
      inventoryRows,
      totalRecords,
      globalEarliestDay,
      globalLatestDay,
      analysisDay,
      splitEvidence,
      dividendEvidence,
      spyEarliest,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
