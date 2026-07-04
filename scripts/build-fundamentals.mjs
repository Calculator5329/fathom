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
const MS_PER_DAY = 86_400_000;
const ANNUAL_DURATION_MIN_DAYS = 330;
const ANNUAL_DURATION_MAX_DAYS = 380;
const QUARTER_DURATION_MIN_DAYS = 80;
const QUARTER_DURATION_MAX_DAYS = 100;

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

const BALANCE_SHEET_METRICS = [
  { key: 'totalAssets', unit: 'USD', round: roundWhole, tags: ['Assets'] },
  { key: 'totalLiabilities', unit: 'USD', round: roundWhole, tags: ['Liabilities'] },
  {
    key: 'stockholdersEquity',
    unit: 'USD',
    round: roundWhole,
    tags: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
  },
  {
    key: 'cashAndEquivalents',
    unit: 'USD',
    round: roundWhole,
    tags: [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ],
  },
  { key: 'currentAssets', unit: 'USD', round: roundWhole, tags: ['AssetsCurrent'] },
  { key: 'currentLiabilities', unit: 'USD', round: roundWhole, tags: ['LiabilitiesCurrent'] },
  {
    key: 'longTermDebt',
    unit: 'USD',
    round: roundWhole,
    tags: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  },
  { key: 'inventory', unit: 'USD', round: roundWhole, tags: ['InventoryNet'] },
];

const QUARTER_METRICS = METRICS.filter((metric) =>
  ['revenue', 'netIncome', 'grossProfit', 'operatingIncome', 'epsDiluted'].includes(metric.key),
);
const ADDITIVE_QUARTER_METRIC_KEYS = new Set([
  'revenue',
  'netIncome',
  'grossProfit',
  'operatingIncome',
]);

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

function quarterFrame(entry) {
  const match = typeof entry?.frame === 'string' ? entry.frame.match(/^CY(\d{4})Q([1-4])$/) : null;
  if (!match) return null;
  return { calendarYear: Number(match[1]), calendarQuarter: Number(match[2]) };
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

function durationDays(entry) {
  if (typeof entry?.start !== 'string' || typeof entry?.end !== 'string') return null;
  const start = Date.parse(entry.start);
  const end = Date.parse(entry.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / MS_PER_DAY);
}

function yearFromEnd(entry) {
  if (typeof entry?.end !== 'string') return null;
  const year = Number(entry.end.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function isAnnualCandidate(entry) {
  const days = durationDays(entry);
  return (
    entry?.form === '10-K' &&
    (annualFrameYear(entry) !== null || entry?.fp === 'FY') &&
    days !== null &&
    days >= ANNUAL_DURATION_MIN_DAYS &&
    days <= ANNUAL_DURATION_MAX_DAYS
  );
}

function isQuarterCandidate(entry) {
  const days = durationDays(entry);
  if (entry?.form !== '10-Q' || days === null) return false;
  if (days < QUARTER_DURATION_MIN_DAYS || days > QUARTER_DURATION_MAX_DAYS) return false;
  if (typeof entry.frame === 'string' && quarterFrame(entry) === null) return false;
  return true;
}

function metricValuesForTag(usGaapFacts, tag, unit) {
  const facts = usGaapFacts?.[tag]?.units?.[unit];
  if (!Array.isArray(facts)) return new Map();

  const byYear = new Map();
  for (const entry of facts) {
    if (!isAnnualCandidate(entry) || !Number.isFinite(entry.val)) continue;

    const year = yearFromEnd(entry);
    if (!Number.isInteger(year)) continue;

    const bucket = byYear.get(year) ?? { framed: [], fiscal: [] };
    if (entry.fp === 'FY') {
      bucket.fiscal.push(entry);
    } else if (annualFrameYear(entry) !== null) {
      bucket.framed.push(entry);
    }
    byYear.set(year, bucket);
  }

  const values = new Map();
  for (const [year, bucket] of byYear) {
    const candidates = bucket.fiscal.length > 0 ? bucket.fiscal : bucket.framed;
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

function annualPeriods(companyFacts) {
  const usGaapFacts = companyFacts?.facts?.['us-gaap'];
  if (!usGaapFacts || typeof usGaapFacts !== 'object') return new Map();

  const candidatesByYear = new Map();
  for (const fact of Object.values(usGaapFacts)) {
    const units = fact?.units;
    if (!units || typeof units !== 'object') continue;

    for (const entries of Object.values(units)) {
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        if (!isAnnualCandidate(entry) || !Number.isFinite(entry.val)) continue;

        const year = yearFromEnd(entry);
        if (!Number.isInteger(year)) continue;

        const candidates = candidatesByYear.get(year) ?? [];
        candidates.push(entry);
        candidatesByYear.set(year, candidates);
      }
    }
  }

  const periods = new Map();
  for (const [year, candidates] of candidatesByYear) {
    const selected = candidates.toSorted((a, b) => {
      const endCompare = comparableDate(a.end).localeCompare(comparableDate(b.end));
      if (endCompare !== 0) return endCompare;

      const durationCompare = (durationDays(a) ?? 0) - (durationDays(b) ?? 0);
      if (durationCompare !== 0) return durationCompare;

      return comparableDate(a.filed).localeCompare(comparableDate(b.filed));
    }).at(-1);

    if (selected) {
      periods.set(year, {
        fiscalYear: year,
        start: selected.start,
        end: selected.end,
      });
    }
  }
  return periods;
}

function instantValuesForTag(usGaapFacts, tag, unit, periods) {
  const facts = usGaapFacts?.[tag]?.units?.[unit];
  if (!Array.isArray(facts)) return new Map();

  const values = new Map();
  for (const [year, period] of periods) {
    const candidates = facts.filter(
      (entry) => entry?.form === '10-K' && entry.end === period.end && Number.isFinite(entry.val),
    );
    const selected = latestFiledCandidate(candidates);
    if (selected) values.set(year, selected.val);
  }
  return values;
}

function extractInstantMetricValues(usGaapFacts, metric, periods) {
  const valuesByTag = metric.tags.map((tag) => ({
    tag,
    values: instantValuesForTag(usGaapFacts, tag, metric.unit, periods),
  }));

  const values = new Map();
  for (const year of periods.keys()) {
    for (const { values: tagValues } of valuesByTag) {
      if (tagValues.has(year)) {
        values.set(year, metric.round(tagValues.get(year)));
        break;
      }
    }
  }
  return values;
}

function periodKey(start, end) {
  return `${start}|${end}`;
}

function quarterValuesForTag(usGaapFacts, tag, unit) {
  const facts = usGaapFacts?.[tag]?.units?.[unit];
  if (!Array.isArray(facts)) return new Map();

  const candidatesByPeriod = new Map();
  for (const entry of facts) {
    if (!isQuarterCandidate(entry) || !Number.isFinite(entry.val)) continue;

    const key = periodKey(entry.start, entry.end);
    const candidates = candidatesByPeriod.get(key) ?? [];
    candidates.push(entry);
    candidatesByPeriod.set(key, candidates);
  }

  const values = new Map();
  for (const [key, candidates] of candidatesByPeriod) {
    const selected = candidates.toSorted((a, b) => {
      const frameCompare = Number(quarterFrame(a) !== null) - Number(quarterFrame(b) !== null);
      if (frameCompare !== 0) return frameCompare;

      const durationCompare =
        Math.abs((durationDays(b) ?? 0) - 91) - Math.abs((durationDays(a) ?? 0) - 91);
      if (durationCompare !== 0) return durationCompare;

      const filedCompare = comparableDate(a.filed).localeCompare(comparableDate(b.filed));
      if (filedCompare !== 0) return filedCompare;

      return comparableDate(a.accn).localeCompare(comparableDate(b.accn));
    }).at(-1);

    if (selected) {
      values.set(key, {
        start: selected.start,
        end: selected.end,
        value: selected.val,
      });
    }
  }
  return values;
}

function extractQuarterMetricValues(usGaapFacts, metric) {
  const valuesByTag = metric.tags.map((tag) => ({
    tag,
    values: quarterValuesForTag(usGaapFacts, tag, metric.unit),
  }));

  const periodKeys = new Set();
  for (const { values } of valuesByTag) {
    for (const key of values.keys()) periodKeys.add(key);
  }

  const values = new Map();
  for (const key of periodKeys) {
    for (const { values: tagValues } of valuesByTag) {
      if (tagValues.has(key)) {
        const selected = tagValues.get(key);
        values.set(key, {
          start: selected.start,
          end: selected.end,
          value: metric.round(selected.value),
        });
        break;
      }
    }
  }
  return values;
}

function nextFiscalYearAfter(year) {
  return Number.isInteger(year) ? year + 1 : null;
}

function annotateQuarterPeriods(directPeriodEnds, periods) {
  const sortedPeriods = [...periods.values()].sort((a, b) => comparableDate(a.end).localeCompare(b.end));
  const annotations = new Map();

  for (const period of sortedPeriods) {
    const quarterEnds = [...directPeriodEnds]
      .filter((end) => end > period.start && end < period.end)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 3);

    for (const [index, end] of quarterEnds.entries()) {
      annotations.set(end, {
        fiscalYear: period.fiscalYear,
        fiscalQuarter: index + 1,
      });
    }
    annotations.set(period.end, {
      fiscalYear: period.fiscalYear,
      fiscalQuarter: 4,
    });
  }

  const lastPeriod = sortedPeriods.at(-1);
  if (lastPeriod) {
    const futureQuarterEnds = [...directPeriodEnds]
      .filter((end) => end > lastPeriod.end)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 3);

    for (const [index, end] of futureQuarterEnds.entries()) {
      annotations.set(end, {
        fiscalYear: nextFiscalYearAfter(lastPeriod.fiscalYear),
        fiscalQuarter: index + 1,
      });
    }
  }

  return annotations;
}

function buildQuarters(companyFacts, periods) {
  const usGaapFacts = companyFacts?.facts?.['us-gaap'];
  if (!usGaapFacts || typeof usGaapFacts !== 'object') return [];

  const metricMaps = new Map();
  for (const metric of QUARTER_METRICS) {
    metricMaps.set(metric.key, extractQuarterMetricValues(usGaapFacts, metric));
  }

  const annualMetricMaps = new Map();
  for (const metric of QUARTER_METRICS.filter((entry) => ADDITIVE_QUARTER_METRIC_KEYS.has(entry.key))) {
    annualMetricMaps.set(metric.key, extractMetricValues(usGaapFacts, metric));
  }

  const directPeriodKeys = new Set();
  for (const values of metricMaps.values()) {
    for (const key of values.keys()) directPeriodKeys.add(key);
  }

  const directPeriodEnds = new Set(
    [...directPeriodKeys]
      .map((key) => key.split('|')[1])
      .filter((end) => typeof end === 'string' && end.length > 0),
  );
  const annotations = annotateQuarterPeriods(directPeriodEnds, periods);
  const quarterRows = new Map();

  for (const key of directPeriodKeys) {
    const [, end] = key.split('|');
    const annotation = annotations.get(end);
    if (!annotation || annotation.fiscalQuarter > 3) continue;

    const row = quarterRows.get(end) ?? {
      fiscalYear: annotation.fiscalYear,
      fiscalQuarter: annotation.fiscalQuarter,
      periodEnd: end,
    };

    for (const metric of QUARTER_METRICS) {
      const metricValue = metricMaps.get(metric.key).get(key)?.value;
      if (Number.isFinite(metricValue)) row[metric.key] = metricValue;
    }
    quarterRows.set(end, row);
  }

  for (const [year, period] of periods) {
    const directQuarterRows = [...quarterRows.values()]
      .filter((row) => row.fiscalYear === year && row.fiscalQuarter >= 1 && row.fiscalQuarter <= 3)
      .sort((a, b) => a.fiscalQuarter - b.fiscalQuarter);

    if (directQuarterRows.length !== 3) continue;

    const q4 = quarterRows.get(period.end) ?? {
      fiscalYear: year,
      fiscalQuarter: 4,
      periodEnd: period.end,
    };

    for (const metric of QUARTER_METRICS) {
      if (!ADDITIVE_QUARTER_METRIC_KEYS.has(metric.key)) continue;

      const annualValue = annualMetricMaps.get(metric.key)?.get(year);
      if (!Number.isFinite(annualValue)) continue;

      const firstThree = directQuarterRows.map((row) => row[metric.key]);
      if (!firstThree.every(Number.isFinite)) continue;

      q4[metric.key] = metric.round(annualValue - firstThree.reduce((sum, value) => sum + value, 0));
    }

    if ([...ADDITIVE_QUARTER_METRIC_KEYS].some((key) => Number.isFinite(q4[key]))) {
      quarterRows.set(period.end, q4);
    }
  }

  return [...quarterRows.values()]
    .filter((row) => Number.isFinite(row.revenue) || Number.isFinite(row.netIncome))
    .map((row) => {
      const revenue = row.revenue ?? null;
      const netIncome = row.netIncome ?? null;
      const grossProfit = row.grossProfit ?? null;
      const operatingIncome = row.operatingIncome ?? null;
      const epsDiluted = row.epsDiluted ?? null;

      return {
        fiscalYear: row.fiscalYear,
        fiscalQuarter: row.fiscalQuarter,
        periodEnd: row.periodEnd,
        revenue,
        netIncome,
        grossProfit,
        operatingIncome,
        epsDiluted,
        grossMargin: round4(divideOrNull(grossProfit, revenue)),
        operatingMargin: round4(divideOrNull(operatingIncome, revenue)),
        netMargin: round4(divideOrNull(netIncome, revenue)),
      };
    })
    .sort((a, b) => comparableDate(a.periodEnd).localeCompare(comparableDate(b.periodEnd)))
    .slice(-20);
}

function buildFiscalYears(companyFacts) {
  const usGaapFacts = companyFacts?.facts?.['us-gaap'];
  if (!usGaapFacts || typeof usGaapFacts !== 'object') return [];

  const periods = annualPeriods(companyFacts);
  const metricMaps = new Map();
  for (const metric of METRICS) {
    metricMaps.set(metric.key, extractMetricValues(usGaapFacts, metric));
  }
  const balanceSheetMaps = new Map();
  for (const metric of BALANCE_SHEET_METRICS) {
    balanceSheetMaps.set(metric.key, extractInstantMetricValues(usGaapFacts, metric, periods));
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
      const longTermDebt =
        balanceSheetMaps.get('longTermDebt').get(year) ?? metricMaps.get('totalDebt').get(year) ?? null;
      const totalDebt = longTermDebt;
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
        operatingCashFlow,
        fcf,
        dividendsPaid,
        totalDebt,
        totalAssets: balanceSheetMaps.get('totalAssets').get(year) ?? null,
        totalLiabilities: balanceSheetMaps.get('totalLiabilities').get(year) ?? null,
        stockholdersEquity: balanceSheetMaps.get('stockholdersEquity').get(year) ?? null,
        cashAndEquivalents: balanceSheetMaps.get('cashAndEquivalents').get(year) ?? null,
        currentAssets: balanceSheetMaps.get('currentAssets').get(year) ?? null,
        currentLiabilities: balanceSheetMaps.get('currentLiabilities').get(year) ?? null,
        longTermDebt,
        inventory: balanceSheetMaps.get('inventory').get(year) ?? null,
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
      const quarters = buildQuarters(companyFacts, annualPeriods(companyFacts));

      if (fiscalYears.length === 0) {
        console.warn(`${stock.ticker}: no usable annual revenue/net income facts; skipping`);
        skipped.push({ ticker: stock.ticker, reason: 'no usable data' });
        continue;
      }

      if (quarters.length === 0) {
        console.warn(`${stock.ticker}: no reliable single-quarter income series derived`);
      }

      const payload = {
        ticker: stock.ticker,
        cik: cikInfo.cik,
        name: stock.name || cikInfo.title,
        source: 'SEC EDGAR companyfacts',
        fetchedAt,
        fiscalYears,
        quarters,
      };

      const dataPath = path.join(DATA_OUTPUT_DIR, `${stock.ticker}.json`);
      const publicPath = path.join(PUBLIC_OUTPUT_DIR, `${stock.ticker}.json`);
      await writeJsonAtomic(dataPath, payload);
      await writeJsonAtomic(publicPath, payload);
      filesWritten += 2;

      ok.push({
        ticker: stock.ticker,
        years: fiscalYears.length,
        quarters: quarters.length,
        firstYear: fiscalYears[0].year,
        lastYear: fiscalYears.at(-1).year,
      });
      console.log(
        `${stock.ticker}: wrote ${fiscalYears.length} years (${fiscalYears[0].year}-${fiscalYears.at(-1).year}), ${quarters.length} quarters`,
      );
    } catch (error) {
      console.warn(`${stock.ticker}: ${error.message}; skipping`);
      skipped.push({ ticker: stock.ticker, reason: error.message });
    }
  }

  const index = ok
    .map(({ ticker, years, quarters, firstYear, lastYear }) => ({
      ticker,
      years,
      quarters,
      firstYear,
      lastYear,
    }))
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
