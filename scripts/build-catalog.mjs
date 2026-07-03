import * as fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPT_DIR = import.meta.dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'data', 'tickers');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'app', 'public', 'data', 'tickers');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'catalog.json');

const LEVERAGED_TICKERS = new Set(['TQQQ', 'UPRO', 'SSO']);
const MUTUAL_FUND_TICKERS = new Set(['VTSAX', 'VFINX']);
const ETF_TICKERS = new Set([
  'AGG',
  'BND',
  'DIA',
  'EEM',
  'EFA',
  'GDX',
  'GLD',
  'HYG',
  'IEF',
  'IWM',
  'LQD',
  'QQQ',
  'SCHD',
  'SHY',
  'SLV',
  'SPY',
  'TIP',
  'TLT',
  'VEA',
  'VIG',
  'VNQ',
  'VOO',
  'VTI',
  'VWO',
  'VYM',
  'VXUS',
  'XLE',
  'XLF',
  'XLI',
  'XLK',
  'XLP',
  'XLU',
  'XLV',
  'XLY',
]);

function inferType(ticker) {
  if (LEVERAGED_TICKERS.has(ticker)) return 'Leveraged';
  if (MUTUAL_FUND_TICKERS.has(ticker)) return 'Mutual fund';
  if (ETF_TICKERS.has(ticker)) return 'ETF';
  return 'Stock';
}

async function readTickerFile(fileName) {
  const filePath = path.join(SOURCE_DIR, fileName);
  const content = await fs.readFile(filePath, 'utf8');
  const payload = JSON.parse(content);
  const fallbackTicker = path.basename(fileName, '.json').toUpperCase();
  const ticker = String(payload.ticker || fallbackTicker).toUpperCase();

  return {
    ticker,
    name: typeof payload.name === 'string' ? payload.name : '',
    type: inferType(ticker),
    startDate: typeof payload.startDate === 'string' ? payload.startDate : '',
  };
}

async function main() {
  const dirEntries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  const tickerFiles = dirEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => entry.name);

  const catalog = await Promise.all(tickerFiles.map(readTickerFile));
  catalog.sort((a, b) => a.ticker.localeCompare(b.ticker));

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${catalog.length} entries to ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
