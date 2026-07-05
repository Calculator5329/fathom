# Fathom — Expansion Ideas (ranked)

_Written 2026-07-05. Ranked by impact-per-effort for Ethan's portfolio goals
(finance × AI agents × local-first, solo dev). Items marked `[ETHAN]` need his
sign-off before starting; `[CLOUD]` needs gcloud/deploy/secret access.
None of these override the hard rules in root `CLAUDE.md` or the standing
rejections in [HANDOFF_ROADMAP.md](HANDOFF_ROADMAP.md)._

| # | Idea | Impact | Effort | One-line rationale |
|---|---|---|---|---|
| 1 | Shared engine package | High | Med | One tested TWR/IRR core across 3 projects |
| 2 | Multi-broker X-ray | High | Med | Fidelity-only halves the audience of the best tool |
| 3 | Fundamentals screener | High | Med-High | The data lake exists; screeners retain users |
| 4 | CI + release discipline | High | Low | Makes the sacred-engine rule mechanical |
| 5 | Valuation percentile bands | Med-High | Low | Approved follow-up, data already computed |
| 6 | Dividend income planner | Med-High | Low-Med | Approved backlog; broad appeal |
| 7 | fathom.portfolio as public spec | Med-High | Low | Local-first interop story; feeds finance-master |
| 8 | X-ray drift & rebalance report | Med | Low-Med | Natural next step after TWR/IRR |
| 9 | Product publishing pass | Med-High | Med | Turns a portfolio piece into a product |
| 10 | N-asset efficient frontier | Med | Med | Two-asset today; obvious depth upgrade |
| 11 | More asset classes (gold, intl, REITs) | Med | Med | Widens allocation + Monte Carlo realism |
| 12 | Simulated leverage | Med | Med | Cheap thrills, validation data already cached |
| 13 | Alerts (price/valuation) | Med | Med-High | Retention feature; first server-push surface |
| 14 | Correlation explorer | Low-Med | Low | Backlog item; all client-side |
| 15 | Research notes (auth'd) | Low-Med | Low-Med | Ties Research ↔ Projections together |
| 16 | FF 5-factor + momentum lens | Low-Med | Low-Med | Extends shipped factor lens |
| 17 | Agentic portfolio analyst | Med | High | Fits the AI-agents portfolio pillar |
| 18 | Tax-lot awareness in X-ray | Med | High | Powerful but near the finance-master boundary |

## Details

1. **Extract the engine as a shared npm package** `[ETHAN]` — `app/src/engine/` is pure
   TS, zero deps, fully fixture-tested: already package-shaped. Publish (private GitHub
   package or workspace monorepo) as e.g. `@fathom/engine`; consume from finance-master
   and retirement-sim instead of their own math. Impact: high (one sacred, tested core
   instead of three drifting ones). Effort: medium — the code move is easy; the risk is
   release discipline (golden regressions must run in the package repo). **First step:**
   inventory what finance-master and retirement-sim actually compute today and confirm
   overlap; write the package boundary (engine + metrics only, no data loaders) into
   VISION.md for Ethan to ratify.
2. **Multi-broker X-ray (Schwab, Vanguard, Robinhood)** — the X-ray is Fathom's most
   differentiated tool and currently reads only Fidelity CSVs. Impact: high (every new
   broker multiplies who can use it). Effort: medium per broker (hostile-input parsing,
   but the reconstruction layer is already broker-agnostic). **First step:** format-sniffing
   dispatch in `app/src/xray/parse.ts` + synthesized Schwab fixtures.
3. **Fundamentals screener** — the EDGAR pipeline already normalizes revenue, margins,
   EPS, FCF, share counts, valuation ratios. A screener ("P/FCF < 15, margin rising,
   share count falling") is table-stakes for finance sites yet rare with 20-year depth.
   Effort: medium-high — needs pre-built coverage across the universe `[CLOUD]` and a
   compact per-ticker summary index in the bucket. **First step:** build the summary-index
   script (stdlib .mjs, validation stats) over already-fetched fundamentals.
4. **CI + release discipline** — GitHub Actions running vitest + tsc on every push;
   later a deploy-on-tag `[CLOUD]`. Impact: high for its cost — the engine's "tests must
   stay green" rule becomes enforced, not remembered. **First step:** the CI item in
   HANDOFF_ROADMAP Now.
5. **Valuation percentile bands on Research** — approved Tool-5 follow-up (VISION):
   each ratio vs its own history. Data computed; purely a chart feature. **First step:**
   percentile helper + bands on the P/E chart.
6. **Dividend income planner** — forward yield, income calendar by month, per-holding
   dividend growth; extends the Income tab from data already in ticker JSONs. Approved
   backlog item. **First step:** forward-yield calc with a hand-computed fixture.
7. **Publish `fathom.portfolio` as a spec** — the X-ray already exports a versioned
   JSON master file. Document the schema publicly (docs page + JSON Schema), and build
   the finance-master import path via deep link. This is the cleanest expression of the
   local-first + interop story, and the sanctioned integration channel between the two
   apps. **First step:** write the schema doc from `app/src/xray/masterfile.ts`.
8. **X-ray drift & rebalance report** — you have the user's real holdings; compare
   against a target allocation and show drift + the trades to rebalance (display only —
   never execute anything). **First step:** target-allocation input + drift table.
9. **Product publishing pass** `[ETHAN]` `[CLOUD]` — custom domain, lightweight
   analytics, SEO/OG audit, about page, Show HN. Fathom is already recruiter-ready;
   this makes it user-ready. **First step:** Ethan picks a domain.
10. **N-asset efficient frontier** — the allocation tool ships a two-asset frontier;
    generalize via random-portfolio sampling + convex hull (client-side, no solver dep).
    **First step:** extend `app/src/engine/frontier.ts` with fixtures.
11. **More asset classes** — gold, international equity, REITs via the established
    provenance-checked pipeline pattern (frozen-history assertions, data-notes entry).
    **First step:** source survey with citations into data-notes.md.
12. **Simulated leverage** — PLAN v1.5: daily return × leverage − borrow − ER, explicit
    "Simulated" badge; TQQQ/UPRO are already cached for validation. **First step:**
    leveraged-series transform in the engine with a hand-computed 3-day fixture.
13. **Alerts** `[CLOUD]` — "tell me when SPY drawdown > 15%" / "AAPL P/E below 10-year
    median". First feature needing scheduled server compute + email; park infra for
    approval. **First step:** design doc — alert schema, evaluation cadence, channel.
14. **Correlation explorer** — rolling correlation heatmap between tickers/assets;
    VISION backlog; all client-side from existing series. **First step:** rolling-corr
    util in the engine with fixtures.
15. **Research notes** — freeform per-ticker notes on the auth'd account, rendered on
    ticker pages, linked to projections. Small Firestore surface (per-uid rules
    reviewed, per the guardrails). **First step:** data model + rules PR.
16. **FF 5-factor + momentum** — extend the shipped factor lens; Ken French publishes
    the extra series; pipeline pattern exists. **First step:** extend
    `scripts/build-ff-factors.mjs` and regress a known fund as sanity anchor.
17. **Agentic portfolio analyst** — an LLM agent that reads a `fathom.portfolio` export
    and narrates findings (concentration, factor tilts, cost-of-selling) with links to
    the exact Fathom URLs it used. Bridges the AI-agents pillar of the portfolio.
    Careful: analysis narration only — no advice framing, no trade execution.
    **First step:** prompt + tool spec over the master-file schema (offline prototype).
18. **Tax-lot awareness in X-ray** — lots from broker history enable "what would selling
    X cost in taxes" — but it flirts with the personal-finance boundary. Keep it
    broker-data-derived and stateless (nothing stored), or hand it to finance-master
    via deep link. `[ETHAN]` **First step:** boundary decision memo.
