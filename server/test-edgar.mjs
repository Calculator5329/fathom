import assert from 'node:assert/strict'
import { deriveFundamentals } from './src/edgar.mjs'

const annual = (val) => ({
  val,
  start: '2024-01-01',
  end: '2024-12-31',
  fy: 2024,
  fp: 'FY',
  form: '10-K',
  filed: '2025-02-15',
  accn: 'annual',
})

const instant = (val) => ({
  val,
  end: '2024-12-31',
  fy: 2024,
  fp: 'FY',
  form: '10-K',
  filed: '2025-02-15',
  accn: 'instant',
})

const quarter = (fiscalQuarter, start, end, val) => ({
  val,
  start,
  end,
  fy: 2024,
  fp: `Q${fiscalQuarter}`,
  form: '10-Q',
  filed: `2024-0${fiscalQuarter + 3}-15`,
  frame: `CY2024Q${fiscalQuarter}`,
  accn: `q${fiscalQuarter}`,
})

const usd = (entries) => ({ units: { USD: entries } })
const usdPerShare = (entries) => ({ units: { 'USD/shares': entries } })
const shares = (entries) => ({ units: { shares: entries } })

const fixture = {
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: usd([
        annual(1_000),
        quarter(1, '2024-01-01', '2024-03-31', 100),
        quarter(2, '2024-04-01', '2024-06-30', 200),
        quarter(3, '2024-07-01', '2024-09-30', 300),
      ]),
      NetIncomeLoss: usd([
        annual(100),
        quarter(1, '2024-01-01', '2024-03-31', 10),
        quarter(2, '2024-04-01', '2024-06-30', 20),
        quarter(3, '2024-07-01', '2024-09-30', 30),
      ]),
      GrossProfit: usd([
        annual(400),
        quarter(1, '2024-01-01', '2024-03-31', 40),
        quarter(2, '2024-04-01', '2024-06-30', 80),
        quarter(3, '2024-07-01', '2024-09-30', 120),
      ]),
      OperatingIncomeLoss: usd([
        annual(200),
        quarter(1, '2024-01-01', '2024-03-31', 20),
        quarter(2, '2024-04-01', '2024-06-30', 40),
        quarter(3, '2024-07-01', '2024-09-30', 60),
      ]),
      EarningsPerShareDiluted: usdPerShare([
        annual(10),
        quarter(1, '2024-01-01', '2024-03-31', 1),
        quarter(2, '2024-04-01', '2024-06-30', 2),
        quarter(3, '2024-07-01', '2024-09-30', 3),
      ]),
      WeightedAverageNumberOfDilutedSharesOutstanding: shares([annual(50)]),
      NetCashProvidedByUsedInOperatingActivities: usd([annual(150)]),
      PaymentsToAcquirePropertyPlantAndEquipment: usd([annual(40)]),
      PaymentsOfDividendsCommonStock: usd([annual(12)]),
      LongTermDebtNoncurrent: usd([annual(90), instant(95)]),
      Assets: usd([instant(800)]),
      Liabilities: usd([instant(300)]),
      StockholdersEquity: usd([instant(500)]),
      CashAndCashEquivalentsAtCarryingValue: usd([instant(60)]),
      AssetsCurrent: usd([instant(250)]),
      LiabilitiesCurrent: usd([instant(100)]),
      InventoryNet: usd([instant(25)]),
    },
  },
}

const derived = deriveFundamentals(fixture)

assert.equal(derived.fiscalYears.length, 1)
assert.deepEqual(derived.fiscalYears[0], {
  year: 2024,
  revenue: 1_000,
  netIncome: 100,
  grossProfit: 400,
  operatingIncome: 200,
  epsDiluted: 10,
  sharesDiluted: 50,
  operatingCashFlow: 150,
  fcf: 110,
  dividendsPaid: 12,
  totalDebt: 95,
  totalAssets: 800,
  totalLiabilities: 300,
  stockholdersEquity: 500,
  cashAndEquivalents: 60,
  currentAssets: 250,
  currentLiabilities: 100,
  longTermDebt: 95,
  inventory: 25,
  grossMargin: 0.4,
  operatingMargin: 0.2,
  netMargin: 0.1,
})

assert.equal(derived.quarters.length, 4)
assert.deepEqual(
  derived.quarters.map(({ fiscalQuarter, periodEnd, revenue, netIncome, grossMargin, operatingMargin, netMargin }) => ({
    fiscalQuarter,
    periodEnd,
    revenue,
    netIncome,
    grossMargin,
    operatingMargin,
    netMargin,
  })),
  [
    {
      fiscalQuarter: 1,
      periodEnd: '2024-03-31',
      revenue: 100,
      netIncome: 10,
      grossMargin: 0.4,
      operatingMargin: 0.2,
      netMargin: 0.1,
    },
    {
      fiscalQuarter: 2,
      periodEnd: '2024-06-30',
      revenue: 200,
      netIncome: 20,
      grossMargin: 0.4,
      operatingMargin: 0.2,
      netMargin: 0.1,
    },
    {
      fiscalQuarter: 3,
      periodEnd: '2024-09-30',
      revenue: 300,
      netIncome: 30,
      grossMargin: 0.4,
      operatingMargin: 0.2,
      netMargin: 0.1,
    },
    {
      fiscalQuarter: 4,
      periodEnd: '2024-12-31',
      revenue: 400,
      netIncome: 40,
      grossMargin: 0.4,
      operatingMargin: 0.2,
      netMargin: 0.1,
    },
  ],
)

console.log(
  `ok fiscalYears=${derived.fiscalYears.length} quarters=${derived.quarters.length} q4Revenue=${derived.quarters.at(-1).revenue}`,
)
