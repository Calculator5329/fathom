# Wave 1 P03: historical valuation context

Implementation date: 2026-09-04. Local code and verification, no deployment.

## Reconciled scope

The recovery audit cited the unused `valuationOption()` average line in
`app/src/fundamentals/charts.ts`. Fresh source inspection found that
`app/src/pages/Stock.tsx` already uses `app/src/data/valuationBands.ts` from the
July 16 broker/valuation plan. That implementation already had five historical
regions, type-7 quantiles, midrank, and the eight-observation threshold.
This change completes missing acceptance details rather than building a second
bands feature.

## Behavior

- Annual ratios retain full precision through percentile calculations. Formatting
  alone rounds numbers. Invalid prices, share counts and denominators do not
  produce infinite ratios or contaminate share-basis inference.
- The existing valuation card reports selected fiscal-year window, comparable
  years and excluded years. Revenue absence no longer removes a year from an
  unrelated P/E or cash-flow comparison.
- Latest means the latest **comparable fiscal year** in the selected window,
  including that observation in the sample. It does not mean today's quote or
  imply that a newer unavailable year is comparable.
- Region labels stay in calculation details because loss years can compress
  positive bands until always-on text overlaps. The median keeps its 15px label.
- Calculation details expose all P10/P25/P50/P75/P90 values and exclusions:
  missing/unavailable, nonfinite, zero/negative ratios. Loss P/E remains in the
  historical line but is excluded from positive valuation comparisons. Existing
  nonpositive cash-flow/book periods remain unavailable. Missing points are gaps.
- Type 7 interpolates at `(n - 1) * p`; midrank is
  `100 * (less + equal / 2) / n`. At least eight comparable observations are needed
  for bands. No live prices, forecast, inferred replacement years, server data,
  portfolio balances, or data acquisition were added.
- The existing data convention pairs annual fundamentals with the last available
  price in the calendar year. The newest year may be partial; that limitation is
  disclosed rather than silently called a completed year-end observation.

## Verification

Focused tests cover hand-computed quantiles, tiny differences lost by premature
rounding, invalid ratios/inputs, preserved negative P/E, latest eligible year,
exclusion accounting, empty/sparse samples and existing split/restatement fixtures.
Final local checks: **163 tests passed, 9 skipped** across 24 test files;
`npx tsc -b` passed; `npm run build` passed (existing large-chunk warning).
Rendered checks also passed after the label-overlap correction: desktop 1440×1000
and mobile 390×1000, sample/quantiles/latest/range/ratio/sparse assertions, no mobile
document overflow, and visual inspection of stable screenshots after 1500ms settling.
The local dev preview returned 403 for two fonts loaded through the reused dependency
symlink, so screenshots use fallback fonts. The production build bundles both fonts.
An existing ECharts `grid.containLabel` compatibility message was logged. Neither
changes the measured ratio/sample assertions. Browser evidence and screenshots are in
`planning` lane `intent-wave1-20260904`,
`reports/intent-wave1-20260904/output/playwright/fathom-verification.json`.
Nine pre-existing real-data tests are
skipped because gitignored canonical Tiingo/AMZN fixtures are absent. Those are
**not** counted as passing; incompatible legacy adjusted-price archives were not
substituted. No dependencies were installed or updated; the lane reused the
canonical ignored node_modules directory.

## Browser walkthrough (synthetic, no market-data request)

Run the lane's app with `npm run dev -- --host 127.0.0.1 --port 5278 --strictPort`.
A server listener needs outside-sandbox execution in this environment. Before
opening `/stock/DEMO`, browser-route these local requests:

- `**/data/tickers/DEMO.json` →
  `app/src/fundamentals/__tests__/fixtures/valuation-demo-prices.json`
- `**/data/fundamentals/DEMO.json` →
  `app/src/fundamentals/__tests__/fixtures/valuation-demo-fundamentals.json`
- `**/data/tickers/catalog.json` → `[]` (built-in fallback is sufficient).

Fulfill with JSON content type. Block external requests during the walkthrough;
this fixture does not need cloud access. DOM identifiers are
`stock.valuation.sample`, `stock.valuation.details`, and
`stock.valuation.quantiles`.

Expected All/P-E: FY 2014–2025, **10 comparable**, **2 excluded**.
FY 2022 has unavailable earnings and FY 2025 has a loss. FY 2020 has no revenue
but its valid P/E **16× remains included**. Latest comparable FY is **2024,
20.0×, rank 95%**. Boundaries displayed to two decimals:
**P10 10.90, P25 12.25, P50 14.50, P75 16.75, P90 19.10**.
In the valuation card choose 5Y: FY 2021–2025, 3 comparable and 2 excluded;
no bands, explicit eight-year minimum. Choose 10Y: FY 2016–2025, 8 comparable,
2 excluded, bands return. Choose P/S with All: 11 comparable, 1 unavailable
(FY 2020), latest comparable FY 2025. Test wide and 390px layouts; verify canvas
and detail text fit, summary is two columns on narrow screens, and tooltip shows
fiscal year/ratio/rank/sample count. Screen reader/DOM assertions verify labels;
canvas ratio/region behavior is additionally pinned by option/math tests.

## Delivery boundary

Parent session owns source review, rendered review, integration, commit/push and
final report. No cloud changes, publication, lockfile changes or personal data.
