import * as fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPT_DIR = import.meta.dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CATALOG_PATH = path.join(PROJECT_ROOT, 'app', 'public', 'data', 'tickers', 'catalog.json');
const DATA_OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'fundamentals');
const PUBLIC_OUTPUT_DIR = path.join(PROJECT_ROOT, 'app', 'public', 'data', 'fundamentals');
const PUBLIC_INDEX_PATH = path.join(PUBLIC_OUTPUT_DIR, 'index.json');

const SEC_USER_AGENT = 'Fathom fundamentals research contact@example.com';
const SEC_TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_COMPANY_FACTS_URL = 'https://data.sec.gov/api/xbrl/companyfacts';
const REQUEST_INTERVAL_MS = 150;
const RETRY_BACKOFF_MS = 2_000;
const RETRYABLE_STATUSES = new Set([429, 503]);

const METRICS = [
  {
    key: 'revenue',
    unit: 'USD',
    round: roundWhole,
    tags: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
    ],
  },
  { key: 'netIncome', unit: 'USD', round: roundWhole, tags: ['NetIncomeLoss'] },
  { key: 'grossProfit', unit: 'USD', round: roundWhole, tags: ['GrossProfit'] },
  {
    key: 'operatingIncome',
    unit: 'USD',
    round: roundWhole,
    tags: ['OperatingIncomeLoss'],
  },
  {
    key: 'epsDiluted',
    unit: 'USD/shares',
    round: round2,
    tags: ['EarningsPerShareDiluted'],
  },
  {
    key: 'sharesDiluted',
    unit: 'shares',
    round: roundWhole,
    tags: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
  },
  {
    key: 'operatingCashFlow',
    unit: 'USD',
    round: roundWhole,
    tags: ['NetCashProvidedByUsedInOperatingActivities'],
  },
  {
    key: 'capex',
    unit: 'USD',
    round: roundWhole,
    tags: ['PaymentsToAcquirePropertyPlantAndEquipment'],
  },
  {
    key: 'dividendsPaid',
    unit: 'USD',
    round: roundWhole,
    tags: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'],
  },
  {
    key: 'totalDebt',
    unit: 'USD',
    round: roundWhole,
    tags: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  },
];

let lastRequestStartedAt = 0;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeTicker(value) {
  return String(value ?? '').trim().toUpperCase();
}

function secTickerCandidates(ticker) {
  const normalized = normalizeTicker(ticker);
  return new Set([normalized, normalized.replaceAll('-', '.'), normalized.replaceAll('.', '-')]);
}

function cik10(value) {
  return String(value).padStart(10, '0');
}

function roundWhole(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function round2(value) {
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}

function round4(value) {
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 10_000) / 10_000 : null;
}

function divideOrNull(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function annualFrameYear(entry) {
  const match = typeof entry?.frame === 'string' ? entry.frame.match(/^CY(\d{4})$/) : null;
  return match ? Number(match[1]) : null;
}

function fiscalYear(entry) {
  if (Number.isInteger(entry?.fy)) return entry.fy;
  const frameYear = annualFrameYear(entry);
  if (frameYear) return frameYear;
  if (typeof entry?.end === 'string') {
    const endYear = Number(entry.end.slice(0, 4));
    if (Number.isInteger(endYear)) return endYear;
  }
  return null;
}

function comparableDate(value) {
  if (typeof value !== 'string') return '';
  return value;
}

function latestFiledCandidate(candidates) {
  return candidates.toSorted((a, b) => {
    const filedCompare = comparableDate(a.filed).localeCompare(comparableDate(b.filed));
    if (filedCompare !== 0) return filedCompare;

    const endCompare = comparableDate(a.end).localeCompare(comparableDate(b.end));
    if (endCompare !== 0) return endCompare;

    return comparableDate(a.accn).localeCompare(comparableDate(b.accn));
  }).at(-1);
}

function isAnnualCandidate(entry) {
  return entry?.form === '10-K' && (annualFrameYear(entry) !== null || entry?.fp === 'FY');
}

function metricValuesForTag(usGaapFacts, tag, unit) {
  const facts = usGaapFacts?.[tag]?.units?.[unit];
  if (!Array.isArray(facts)) return new Map();

  const byYear = new Map();
  for (const entry of facts) {
    if (!isAnnualCandidate(entry) || !Number.isFinite(entry.val)) continue;

    const year = fiscalYear(entry);
    if (!Number.isInteger(year)) continue;

    const bucket = byYear.get(year) ?? { framed: [], fiscal: [] };
    if (annualFrameYear(entry) !== null) {
      bucket.framed.push(entry);
    } else if (entry.fp === 'FY') {
      bucket.fiscal.push(entry);
    }
    byYear.set(year, bucket);
  }

  const values = new Map();
  for (const [year, bucket] of byYear) {
    const candidates = bucket.framed.length > 0 ? bucket.framed : bucket.fiscal;
    const selected = latestFiledCandidate(candidates);
    if (selected) values.set(year, selected.val);
  }
  return values;
}

function extractMetricValues(usGaapFacts, metric) {
  const valuesByTag = metric.tags.map((tag) => ({
    tag,
    values: metricValuesForTag(usGaapFacts, tag, metric.unit),
  }));

  const years = new Set();
  for (const { values } of valuesByTag) {
    for (const year of values.keys()) years.add(year);
  }

  const values = new Map();
  for (const year of years) {
    for (const { values: tagValues } of valuesByTag) {
      if (tagValues.has(year)) {
        values.set(year, metric.round(tagValues.get(year)));
        break;
      }
    }
  }
  return values;
}

function buildFiscalYears(companyFacts) {
  const usGaapFacts = companyFacts?.facts?.['us-gaap'];
  if (!usGaapFacts || typeof usGaapFacts !== 'object') return [];

  const metricMaps = new Map();
  for (const metric of METRICS) {
    metricMaps.set(metric.key, extractMetricValues(usGaapFacts, metric));
  }

  const relevantYears = new Set([
    ...metricMaps.get('revenue').keys(),
    ...metricMaps.get('netIncome').keys(),
  ]);

  return [...relevantYears]
    .sort((a, b) => a - b)
    .map((year) => {
      const revenue = metricMaps.get('revenue').get(year) ?? null;
      const netIncome = metricMaps.get('netIncome').get(year) ?? null;
      const grossProfit = metricMaps.get('grossProfit').get(year) ?? null;
      const operatingIncome = metricMaps.get('operatingIncome').get(year) ?? null;
      const epsDiluted = metricMaps.get('epsDiluted').get(year) ?? null;
      const sharesDiluted = metricMaps.get('sharesDiluted').get(year) ?? null;
      const operatingCashFlow = metricMaps.get('operatingCashFlow').get(year) ?? null;
      const capex = metricMaps.get('capex').get(year) ?? null;
      const dividendsPaid = metricMaps.get('dividendsPaid').get(year) ?? null;
      const totalDebt = metricMaps.get('totalDebt').get(year) ?? null;
      const fcf =
        Number.isFinite(operatingCashFlow) && Number.isFinite(capex)
          ? roundWhole(operatingCashFlow - capex)
          : null;

      return {
        year,
        revenue,
        netIncome,
        grossProfit,
        operatingIncome,
        epsDiluted,
        sharesDiluted,
        fcf,
        dividendsPaid,
        totalDebt,
        grossMargin: round4(divideOrNull(grossProfit, revenue)),
        operatingMargin: round4(divideOrNull(operatingIncome, revenue)),
        netMargin: round4(divideOrNull(netIncome, revenue)),
      };
    });
}

async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function writeJsonAtomic(filePath, value) {
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function rateLimitedFetchJson(url, label) {
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const elapsed = Date.now() - lastRequestStartedAt;
    if (lastRequestStartedAt > 0 && elapsed < REQUEST_INTERVAL_MS) {
      await sleep(REQUEST_INTERVAL_MS - elapsed);
    }

    lastRequestStartedAt = Date.now();
    let response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': SEC_USER_AGENT,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      throw new Error(`${label}: network request failed (${error.message})`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!response.ok) {
      if (RETRYABLE_STATUSES.has(response.status) && attempt === 0) {
        console.warn(`${label}: HTTP ${response.status}; backing off before retry`);
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      throw new Error(`${label}: HTTP ${response.status} ${response.statusText}`);
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      if (attempt === 0) {
        console.warn(
          `${label}: non-JSON response (${contentType || 'unknown content-type'}); backing off before retry`,
        );
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      throw new Error(`${label}: failed to parse JSON (${error.message})`);
    }
  }

  throw new Error(`${label}: failed after retry`);
}

function buildTickerCikMap(secTickerMap) {
  const map = new Map();
  for (const row of Object.values(secTickerMap)) {
    if (!row?.ticker || !row?.cik_str) continue;
    map.set(normalizeTicker(row.ticker), {
      cik: cik10(row.cik_str),
      title: row.title || '',
    });
  }
  return map;
}

function resolveCik(ticker, tickerCikMap) {
  for (const candidate of secTickerCandidates(ticker)) {
    const result = tickerCikMap.get(candidate);
    if (result) return result;
  }
  return null;
}

function relative(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replaceAll(path.sep, '/');
}

async function main() {
  const catalog = await readJsonFile(CATALOG_PATH);
  if (!Array.isArray(catalog)) {
    throw new Error(`${relative(CATALOG_PATH)} must contain a JSON array`);
  }

  const stocks = catalog
    .filter((entry) => entry?.type === 'Stock')
    .map((entry) => ({
      ticker: normalizeTicker(entry.ticker),
      name: String(entry.name ?? ''),
    }))
    .filter((entry) => entry.ticker);

  await fs.mkdir(DATA_OUTPUT_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_OUTPUT_DIR, { recursive: true });

  console.log(`Loading SEC ticker map for ${stocks.length} stock tickers`);
  const secTickerMap = await rateLimitedFetchJson(SEC_TICKER_MAP_URL, 'SEC ticker map');
  const tickerCikMap = buildTickerCikMap(secTickerMap);

  const fetchedAt = new Date().toISOString();
  const ok = [];
  const skipped = [];
  let filesWritten = 0;

  for (const stock of stocks) {
    const cikInfo = resolveCik(stock.ticker, tickerCikMap);
    if (!cikInfo) {
      console.warn(`${stock.ticker}: no SEC CIK match; skipping`);
      skipped.push({ ticker: stock.ticker, reason: 'no CIK' });
      continue;
    }

    const factsUrl = `${SEC_COMPANY_FACTS_URL}/CIK${cikInfo.cik}.json`;

    try {
      const companyFacts = await rateLimitedFetchJson(factsUrl, `${stock.ticker} companyfacts`);
      const fiscalYears = buildFiscalYears(companyFacts);

      if (fiscalYears.length === 0) {
        console.warn(`${stock.ticker}: no usable annual revenue/net income facts; skipping`);
        skipped.push({ ticker: stock.ticker, reason: 'no usable data' });
        continue;
      }

      const payload = {
        ticker: stock.ticker,
        cik: cikInfo.cik,
        name: stock.name || cikInfo.title,
        source: 'SEC EDGAR companyfacts',
        fetchedAt,
        fiscalYears,
      };

      const dataPath = path.join(DATA_OUTPUT_DIR, `${stock.ticker}.json`);
      const publicPath = path.join(PUBLIC_OUTPUT_DIR, `${stock.ticker}.json`);
      await writeJsonAtomic(dataPath, payload);
      await writeJsonAtomic(publicPath, payload);
      filesWritten += 2;

      ok.push({
        ticker: stock.ticker,
        years: fiscalYears.length,
        firstYear: fiscalYears[0].year,
        lastYear: fiscalYears.at(-1).year,
      });
      console.log(
        `${stock.ticker}: wrote ${fiscalYears.length} years (${fiscalYears[0].year}-${fiscalYears.at(-1).year})`,
      );
    } catch (error) {
      console.warn(`${stock.ticker}: ${error.message}; skipping`);
      skipped.push({ ticker: stock.ticker, reason: error.message });
    }
  }

  const index = ok
    .map(({ ticker, years, firstYear, lastYear }) => ({ ticker, years, firstYear, lastYear }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  await writeJsonAtomic(PUBLIC_INDEX_PATH, index);
  filesWritten += 1;

  console.log('');
  console.log('Final summary');
  console.log(`OK (${ok.length}): ${ok.map((entry) => `${entry.ticker}:${entry.years}`).join(', ')}`);
  console.log(
    `Skipped (${skipped.length}): ${
      skipped.length > 0
        ? skipped.map((entry) => `${entry.ticker} (${entry.reason})`).join(', ')
        : 'none'
    }`,
  );
  console.log(`Files written: ${filesWritten}`);
  console.log(`Index: ${relative(PUBLIC_INDEX_PATH)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
