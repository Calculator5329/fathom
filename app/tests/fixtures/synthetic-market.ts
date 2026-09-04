import type { Page } from '@playwright/test'

// Deliberately synthetic prices and fundamentals. These fixtures exercise controls,
// persistence and rendering; they are not evidence of financial-model accuracy.
const tickers = ['SPY', 'QQQ', 'VTI', 'BND', 'AMZN', 'GOOGL', 'AAPL', 'TXRH', 'SCHD', 'VYM', 'JEPI']
const dates = Array.from({ length: 66 * 12 }, (_, i) => `${1960 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`)
const assetSeries = Object.fromEntries(['usStocks', 'usBonds', 'cash', 'smallCap', 'midCap', 'largeCap'].map((id, i) => [id, dates.map((_, m) => .003 + i * .0002 + Math.sin(m) * .012)]))
export const syntheticCatalog = tickers.map(ticker => ({ ticker, name: `${ticker} synthetic fixture`, type: 'Stock', startDate: '1960-01-31', cached: true }))

export function syntheticResponse(pathname: string): unknown | undefined {
  if (pathname === '/data/tickers/catalog.json') return syntheticCatalog
  if (pathname === '/data/asset-classes/us-monthly.json' || pathname === '/data/asset-classes/us-size-premia.json') {
    return { dates, series: { ...assetSeries, cpi: dates.map((_, i) => 100 + i * .1) } }
  }
  if (pathname === '/data/asset-classes/ff-factors.json') {
    return { dates, series: { mktRf: assetSeries.usStocks, smb: assetSeries.smallCap, hml: assetSeries.largeCap, rf: assetSeries.cash } }
  }
  const ticker = pathname.match(/^\/data\/tickers\/([A-Z]+)\.json$/)?.[1]
  if (ticker && tickers.includes(ticker)) {
    return { ticker, name: `${ticker} synthetic fixture`, records: dates.map((ym, i) => {
      const [year, month] = ym.split('-').map(Number)
      const close = 10 + i * .04 + Math.sin(i) * .1
      return { date: `${ym}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`, close, adjClose: close, divCash: i % 3 === 0 ? .05 : 0, splitFactor: 1 }
    }) }
  }
  const symbol = pathname.match(/^\/data\/fundamentals\/([A-Z]+)\.json$/)?.[1]
  if (symbol && tickers.includes(symbol)) {
    return { ticker: symbol, name: `${symbol} synthetic fixture`, cik: '0000000000', source: 'SYNTHETIC UI TEST FIXTURE', fetchedAt: '2026-09-04T00:00:00Z', quarters: [], fiscalYears: Array.from({ length: 12 }, (_, i) => ({
      year: 2014 + i, revenue: 1000, netIncome: 100, grossProfit: 500, operatingIncome: 200, epsDiluted: 1,
      sharesDiluted: 100, operatingCashFlow: 150, fcf: 120, dividendsPaid: 20, totalDebt: 50,
      totalAssets: 1000, totalLiabilities: 200, stockholdersEquity: 800, cashAndEquivalents: 200,
      currentAssets: 500, currentLiabilities: 100, longTermDebt: 50, inventory: 100,
      grossMargin: .5, operatingMargin: .2, netMargin: .1,
    })) }
  }
}

export async function installSyntheticMarket(page: Page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
    const response = syntheticResponse(url.pathname)
    if (response !== undefined) return route.fulfill({ json: response })
    if (url.pathname.startsWith('/data/')) return route.fulfill({ status: 404, json: { error: 'No synthetic fixture declared for this path' } })
    return route.continue()
  })
}
