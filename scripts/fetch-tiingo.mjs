import * as fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPT_DIR = import.meta.dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const TICKER_DATA_DIR = path.join(DATA_DIR, 'tickers');
const DATA_NOTES_MD = path.join(PROJECT_ROOT, 'docs', 'data-notes.md');
const DEFAULT_ARCHIVE_DIR =
  'C:\\Users\\et2bo\\Desktop\\New folder\\master-site\\public\\stock-data';
const LEGACY_ARCHIVE_DIR =
  process.env.STOCK_DATA_ARCHIVE_DIR || DEFAULT_ARCHIVE_DIR;

const TIINGO_BASE_URL = 'https://api.tiingo.com/tiingo/daily';
const HISTORY_START_DATE = '1900-01-01';
const REQUEST_INTERVAL_MS = 1200;
const RATE_LIMIT_BACKOFF_MS = 60_000;
const MAX_429_RETRIES = 3;
const DEVIATION_THRESHOLD = 0.005;
const AGREE_CV_THRESHOLD = 0.001;

let lastRequestStartedAt = 0;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseArgs(argv) {
  const options = {
    force: false,
    validate: false,
    help: false,
    tickers: [],
  };

  for (const arg of argv) {
    if (arg === '--force') {
      options.force = true;
    } else if (arg === '--validate') {
      options.validate = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.tickers.push(normalizeTicker(arg));
    }
  }

  options.tickers = [...new Set(options.tickers)];
  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/fetch-tiingo.mjs [--force] SPY VTI AAPL',
    '  node scripts/fetch-tiingo.mjs --validate SPY AAPL KO',
  ].join('\n');
}

function normalizeTicker(value) {
  const ticker = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9._-]+$/.test(ticker)) {
    throw new Error(`Invalid ticker: ${value}`);
  }
  return ticker;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDataDirs() {
  await fs.mkdir(TICKER_DATA_DIR, { recursive: true });
  const gitkeepPath = path.join(DATA_DIR, '.gitkeep');
  if (!(await fileExists(gitkeepPath))) {
    await fs.writeFile(gitkeepPath, '', 'utf8');
  }
}

async function parseEnvFile(filePath) {
  const env = {};
  const content = await fs.readFile(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) env[key] = value;
  }

  return env;
}

async function getTiingoToken() {
  const env = await parseEnvFile(ENV_PATH);
  const token = env.TIINGO_API_TOKEN || process.env.TIINGO_API_TOKEN;
  if (!token) {
    throw new Error('TIINGO_API_TOKEN is missing from .env or environment');
  }
  return token;
}

function tickerOutputPath(ticker) {
  return path.join(TICKER_DATA_DIR, `${ticker}.json`);
}

function legacyArchivePath(ticker) {
  return path.join(LEGACY_ARCHIVE_DIR, `${ticker}.json`);
}

function round6(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function isoDateOnly(value) {
  if (typeof value !== 'string' || value.length < 10) return '';
  return value.slice(0, 10);
}

function formatRange(startDate, endDate) {
  if (!startDate && !endDate) return 'no date range';
  return `${startDate || '?'}..${endDate || '?'}`;
}

function formatRatio(value) {
  return Number.isFinite(value) ? value.toFixed(8) : 'n/a';
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(4)}%` : 'n/a';
}

function markdownEscape(value) {
  return String(value ?? '').replaceAll('|', '\\|');
}

async function rateLimitedFetchJson(url, label) {
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
    const elapsed = Date.now() - lastRequestStartedAt;
    if (lastRequestStartedAt > 0 && elapsed < REQUEST_INTERVAL_MS) {
      await sleep(REQUEST_INTERVAL_MS - elapsed);
    }

    lastRequestStartedAt = Date.now();
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(`${label}: network request failed (${error.message})`);
    }

    if (response.status === 429 && attempt < MAX_429_RETRIES) {
      console.warn(
        `${label}: HTTP 429 rate limit; backing off 60s before retry ${attempt + 1}/${MAX_429_RETRIES}`,
      );
      await sleep(RATE_LIMIT_BACKOFF_MS);
      continue;
    }

    if (!response.ok) {
      throw new Error(`${label}: HTTP ${response.status} ${response.statusText}`);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error(`${label}: failed to parse JSON (${error.message})`);
    }
  }

  throw new Error(`${label}: HTTP 429 rate limit after ${MAX_429_RETRIES} retries`);
}

function tiingoMetadataUrl(ticker, token) {
  const url = new URL(`${TIINGO_BASE_URL}/${encodeURIComponent(ticker)}`);
  url.searchParams.set('token', token);
  return url;
}

function tiingoPricesUrl(ticker, token) {
  const url = new URL(`${TIINGO_BASE_URL}/${encodeURIComponent(ticker)}/prices`);
  url.searchParams.set('startDate', HISTORY_START_DATE);
  url.searchParams.set('format', 'json');
  url.searchParams.set('token', token);
  return url;
}

function normalizeTiingoRecord(record) {
  return {
    date: isoDateOnly(record?.date),
    close: round6(record?.close),
    adjClose: round6(record?.adjClose),
    divCash: round6(record?.divCash),
    splitFactor: round6(record?.splitFactor),
  };
}

function normalizePayload(ticker, metadata, prices) {
  if (!Array.isArray(prices)) {
    throw new Error(`${ticker}: Tiingo prices response was not an array`);
  }

  const records = prices
    .map(normalizeTiingoRecord)
    .filter((record) => record.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const startDate = records[0]?.date || isoDateOnly(metadata?.startDate);
  const endDate = records.at(-1)?.date || isoDateOnly(metadata?.endDate);

  return {
    ticker,
    name: metadata?.name || '',
    exchange: metadata?.exchangeCode || '',
    source: 'tiingo',
    fetchedAt: new Date().toISOString(),
    startDate,
    endDate,
    recordCount: records.length,
    records,
  };
}

async function writeJsonAtomic(filePath, value) {
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  const json = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(tmpPath, json, 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

function logTickerSummary(ticker, payload, prefix = '') {
  console.log(
    `${ticker}: ${prefix}${payload.recordCount} records, ${formatRange(payload.startDate, payload.endDate)}`,
  );
}

async function fetchTicker(ticker, token, { force = false } = {}) {
  const outputPath = tickerOutputPath(ticker);
  if (!force && (await fileExists(outputPath))) {
    const existing = await readJsonFile(outputPath);
    logTickerSummary(ticker, existing, 'skipped existing file; ');
    return { ticker, status: 'skipped', payload: existing };
  }

  const metadata = await rateLimitedFetchJson(
    tiingoMetadataUrl(ticker, token),
    `${ticker} metadata`,
  );
  const prices = await rateLimitedFetchJson(tiingoPricesUrl(ticker, token), `${ticker} prices`);
  const payload = normalizePayload(ticker, metadata, prices);

  await writeJsonAtomic(outputPath, payload);
  logTickerSummary(ticker, payload);
  return { ticker, status: 'fetched', payload };
}

async function ensureTickerFile(ticker, token, { force = false } = {}) {
  const outputPath = tickerOutputPath(ticker);
  if (force || !(await fileExists(outputPath))) {
    return fetchTicker(ticker, token, { force: true });
  }

  return {
    ticker,
    status: 'loaded',
    payload: await readJsonFile(outputPath),
  };
}

function dateFromEpochMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function legacyCloseByDate(records) {
  const byDate = new Map();
  for (const record of records) {
    const date = dateFromEpochMs(record?.Date);
    const close = record?.Close;
    if (date && typeof close === 'number' && Number.isFinite(close) && close > 0) {
      byDate.set(date, close);
    }
  }
  return byDate;
}

function tiingoAdjCloseByDate(records) {
  const byDate = new Map();
  for (const record of records ?? []) {
    const adjClose = record?.adjClose;
    if (
      record?.date &&
      typeof adjClose === 'number' &&
      Number.isFinite(adjClose) &&
      adjClose > 0
    ) {
      byDate.set(record.date, adjClose);
    }
  }
  return byDate;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function coefficientOfVariation(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;

  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  if (mean === 0) return null;

  const variance =
    finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

function minMax(values) {
  let min = Infinity;
  let max = -Infinity;

  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return {
    min: min === Infinity ? null : min,
    max: max === -Infinity ? null : max,
  };
}

function compareLegacyToTiingo(ticker, tiingoPayload, legacyRecords) {
  const legacyByDate = legacyCloseByDate(legacyRecords);
  const tiingoByDate = tiingoAdjCloseByDate(tiingoPayload.records);
  const ratios = [];
  const dates = [];

  for (const [date, archiveClose] of legacyByDate.entries()) {
    const tiingoAdjClose = tiingoByDate.get(date);
    if (!Number.isFinite(tiingoAdjClose) || tiingoAdjClose <= 0) continue;
    ratios.push(archiveClose / tiingoAdjClose);
    dates.push(date);
  }

  const ratioMedian = median(ratios);
  const { min, max } = minMax(ratios);
  const cv = coefficientOfVariation(ratios);
  const deviationCount = Number.isFinite(ratioMedian)
    ? ratios.filter((ratio) => Math.abs(ratio / ratioMedian - 1) > DEVIATION_THRESHOLD)
        .length
    : 0;
  const verdict = Number.isFinite(cv) && cv < AGREE_CV_THRESHOLD ? 'AGREE' : 'DISAGREE';

  return {
    ticker,
    overlapStart: dates[0] || '',
    overlapEnd: dates.at(-1) || '',
    overlapDays: ratios.length,
    min,
    max,
    median: ratioMedian,
    cv,
    deviationCount,
    verdict,
  };
}

async function validateTicker(ticker, token, options) {
  const tiingoResult = await ensureTickerFile(ticker, token, options);
  const legacyPath = legacyArchivePath(ticker);
  const legacyRecords = await readJsonFile(legacyPath);

  if (!Array.isArray(legacyRecords)) {
    throw new Error(`${ticker}: legacy archive file was not an array`);
  }

  const stats = compareLegacyToTiingo(ticker, tiingoResult.payload, legacyRecords);
  if (stats.overlapDays === 0) {
    throw new Error(`${ticker}: no overlapping positive close records found`);
  }

  console.log(
    `${ticker}: ${stats.overlapDays} overlap days, ${formatRange(
      stats.overlapStart,
      stats.overlapEnd,
    )}, ratio median ${formatRatio(stats.median)}, CV ${formatPercent(stats.cv)}, ${stats.verdict}`,
  );
  return stats;
}

function validationNotesSection(statsRows, commandText) {
  const generatedAt = new Date().toISOString();
  const lines = [
    '',
    '## Tiingo validation',
    '',
    `Generated by \`${commandText}\` at ${generatedAt}.`,
    '',
    `Legacy archive path: \`${LEGACY_ARCHIVE_DIR}\``,
    '',
    '| Ticker | Overlap range | Days | Ratio min | Ratio max | Ratio median | CV | >0.5% deviations | Verdict |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const stats of statsRows) {
    lines.push(
      `| ${markdownEscape(stats.ticker)} | ${markdownEscape(
        formatRange(stats.overlapStart, stats.overlapEnd),
      )} | ${stats.overlapDays} | ${formatRatio(stats.min)} | ${formatRatio(
        stats.max,
      )} | ${formatRatio(stats.median)} | ${formatPercent(stats.cv)} | ${
        stats.deviationCount
      } | ${stats.verdict} |`,
    );
  }

  lines.push('');
  for (const stats of statsRows) {
    lines.push(
      `- ${stats.ticker}: ${stats.verdict} - ratio CV is ${formatPercent(
        stats.cv,
      )} with ${stats.deviationCount} days beyond 0.5% of the median ratio.`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

async function appendValidationNotes(statsRows, commandText) {
  if (statsRows.length === 0) return;
  await fs.mkdir(path.dirname(DATA_NOTES_MD), { recursive: true });
  await fs.appendFile(DATA_NOTES_MD, validationNotesSection(statsRows, commandText), 'utf8');
}

async function runFetchMode(tickers, token, options) {
  let successes = 0;

  for (const ticker of tickers) {
    try {
      await fetchTicker(ticker, token, options);
      successes += 1;
    } catch (error) {
      console.error(`${ticker}: ERROR ${error.message}`);
    }
  }

  return successes;
}

async function runValidateMode(tickers, token, options, commandText) {
  const statsRows = [];

  for (const ticker of tickers) {
    try {
      const stats = await validateTicker(ticker, token, options);
      statsRows.push(stats);
    } catch (error) {
      console.error(`${ticker}: ERROR ${error.message}`);
    }
  }

  await appendValidationNotes(statsRows, commandText);
  return statsRows.length;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.tickers.length === 0) {
    throw new Error(`At least one ticker is required\n${usage()}`);
  }

  await ensureDataDirs();
  const token = await getTiingoToken();
  const commandText = `node scripts/fetch-tiingo.mjs ${process.argv.slice(2).join(' ')}`;

  const successes = options.validate
    ? await runValidateMode(options.tickers, token, options, commandText)
    : await runFetchMode(options.tickers, token, options);

  if (successes === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});
