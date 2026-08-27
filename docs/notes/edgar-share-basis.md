# Resolving mixed share bases in SEC EDGAR data

How Fathom's valuation-over-time charts avoid a 20x market-cap error on any
company that has split its stock.

Implementation: [`app/src/fundamentals/charts.ts`](../../app/src/fundamentals/charts.ts)
(`yearEndStats`, `resolveShares`, `valuationSeries`).
Tests: [`app/src/fundamentals/__tests__/valuation.test.ts`](../../app/src/fundamentals/__tests__/valuation.test.ts).
Ingest: [`scripts/build-fundamentals.mjs`](../../scripts/build-fundamentals.mjs).

## The symptom

The stock research page ([`app/src/pages/Stock.tsx`](../../app/src/pages/Stock.tsx))
plots P/E, P/S, P/FCF, P/OCF and P/B per fiscal year. The first version computed
market cap the obvious way: year-end close times the diluted share count from
that year's filing.

On Amazon, the P/OCF line sat around 30x to 40x for a decade and then spiked to
roughly 740x at FY2021. Nothing had happened to Amazon's cash flow. The chart
was wrong by almost exactly 20x, and 20 is the ratio of Amazon's June 2022 stock
split.

## Why EDGAR data does this

Fathom pulls fundamentals from SEC EDGAR companyfacts and takes the diluted
share count from the `WeightedAverageNumberOfDilutedSharesOutstanding` tag
(`scripts/build-fundamentals.mjs`). Companyfacts is a union of every fact a
company has ever tagged, and the same fiscal year appears in more than one
filing:

- The FY2021 10-K reported FY2021 shares in the pre-split basis, around 509
  million.
- The FY2022 10-K reported FY2021 again, this time as a prior-year comparative,
  restated for the 20:1 split: around 10.3 billion.

Both facts are correct as filed. Companyfacts serves whichever one it serves,
and there is no field that says which share basis a given value is stated in.

Prices have the opposite property. The daily series from Tiingo carries a
`splitFactor` event per record, so the price history is unambiguous: Amazon's
2021 year-end close was about $3,334 in the basis of the day and about $167 in
today's basis.

Mixing the two is what produces the error. A restated 10.3 billion share count
multiplied by a $3,334 pre-split price is a market cap 20 times too large.

## The detection approach

There is no metadata to read, so the basis has to be inferred. The signal is
that the two quantities move on completely different scales:

- Share counts drift. Buybacks and dilution move them by a few percent a year,
  well under 10%.
- Splits jump. A split is at least 2:1, usually much more.

So for any fiscal year, if you have a trusted share count for the following
year, the correct basis for this year is the candidate that lands closest to it.
"Closest" has to be measured multiplicatively, not additively, because the
candidates are separated by factors: the code compares `abs(log(candidate /
anchor))` and keeps the smallest.

Two details make this work on real filers rather than just on Amazon:

**Candidate bases are enumerated, not assumed binary.** A restated figure is not
necessarily restated all the way to today. Nvidia's FY2020 comparatives were
restated for the 2021 4:1 split by a filing that predates the 2024 10:1 split,
so that number sits in an intermediate basis and needs a 10x correction, not 40x
and not 1x. `resolveShares` therefore builds a candidate set from the cumulative
split factor of *every* later fiscal year, plus the identity, and picks among all
of them. `yearEndStats` computes those cumulative factors by walking the price
records backward and accumulating `splitFactor`.

**The walk is backward and chained.** Iteration runs from the most recent fiscal
year to the oldest, and each resolved year becomes the anchor for the next one
back. The latest year needs no correction (it is already in the current basis),
which gives the chain a trustworthy starting point.

## The fix

`resolveShares(records, years)` returns a map of fiscal year to share count,
every entry in the current share basis. Per year it does four things:

1. **Synthesize a missing count.** Some years arrive with no shares fact but a
   usable diluted EPS. The count is implied as `abs(netIncome / epsDiluted)`.
   Alphabet's older years need this.
2. **Repair magnitude errors.** Some filers tag the raw number in thousands or
   millions. McDonald's FY2023 arrives as `752`. Net income over EPS from the
   same fact set implies the true order of magnitude, and the value is scaled by
   1000 until it lands within a factor of 30 of the implied count.
3. **Pick the basis.** Default to as-reported in the year's own era (reported
   value times its own cumulative split factor). If an anchor exists, replace it
   with whichever candidate multiplier is log-closest to the anchor.
4. **Become the anchor** for the next year back.

`valuationSeries` then computes everything in that one basis: market cap is the
split-adjusted year-end close times the resolved count. P/E deliberately uses
market cap over net income rather than price over reported EPS, because reported
EPS has exactly the same mixed-basis problem as the share count. The one
fallback path, used when no share count can be resolved at all, pairs the raw
era-basis close with the era-basis EPS so at least both sides agree.

## How it is regression-tested

`app/src/fundamentals/__tests__/valuation.test.ts` covers both the mechanism and
the outcome.

Hand-built fixtures pin the resolution logic:

- An Amazon-shaped case across the 20:1 split, where FY2020 and FY2021 are
  restated and FY2019 is era-basis. It asserts that the restated years are kept
  as-is (not multiplied by 20 a second time) and the era-basis year is scaled up.
- The Nvidia intermediate-basis case across two splits, asserting FY2020
  resolves to 10x, not 40x and not 1x.
- The McDonald's magnitude repair, asserting `752` becomes 752 million.
- The Alphabet synthesis case, asserting an implied count that is already in the
  restated basis is not scaled again.

Outcome tests assert the chart itself: Amazon FY2021 P/OCF comes out near 37x,
and every point in the series stays inside a sane band rather than spiking.

A real-data regression closes the loop. It loads the actual committed
`AMZN.json` fundamentals and price files and asserts P/OCF stays between 3x and
120x and P/S between 0.3x and 10x across the whole history. The upper bound is
the load-bearing part: the pre-fix chart hit roughly 740x at the spike. That
test is `describe.skipIf`-guarded on the data files being present, so it runs
against a populated data directory and skips cleanly in a bare checkout.

## What this does not do

The heuristic needs at least one trustworthy anchor and a price series carrying
split events. A company with a single fiscal year of data, or a ticker with no
price history, falls back to as-reported values. Reverse splits are handled by
the same arithmetic but are not covered by a dedicated fixture.
