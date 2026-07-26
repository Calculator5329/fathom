# Fathom web app

This directory contains Fathom's Vite, React, and TypeScript client. Fathom is
a market-analysis suite for backtests, asset allocation, Monte Carlo
simulation, company research, projections, and browser-local portfolio
analysis.

Start with the [root README](../README.md) for the product overview, data
provenance, and engineering notes. See
[the architecture guide](../docs/ARCHITECTURE.md) for the complete system map,
invariants, and production topology.

## App structure

- `src/pages/` defines the route-level screens.
- `src/engine/` contains the pure TypeScript backtest engine and its tests.
- `src/montecarlo/` contains the simulation model and Web Worker.
- `src/fundamentals/`, `src/factors/`, and `src/income/` power research views.
- `src/xray/` parses broker exports and reconstructs portfolio performance in
  the browser.
- `src/data/` and `src/services/` load the public market datasets and API
  services used by the UI.
- `src/projections/` contains the scenario model, editor, and user-owned
  projection persistence.
- `src/auth/` contains authentication scoped to user-owned features.
- `src/components/` and `src/hooks/` provide shared UI and application state.

Portfolio math in `src/engine/` is a protected boundary. Read the root
`CLAUDE.md` before changing it or any data-loading behavior.

## Local commands

The commands below use the dependencies already installed in this directory;
they do not fetch market data or deploy anything.

```bash
cd app
npm run dev       # local Vite development server
npm test          # run the Vitest suite once
npm run lint      # run Oxlint
npm run build     # TypeScript project build, then production Vite bundle
npm run preview   # serve the built bundle locally
```

`npm run dev` and `npm run preview` start local listeners. The test, lint, and
build commands are the non-server checks suitable for local verification.
Dependency installation is intentionally not included here: use the checked-in
lockfile and the repository's approved dependency workflow when dependencies
actually need to change.

## Data and privacy boundary

Fathom's market series and company fundamentals are public analysis inputs
loaded from static data or the companion API; they are not personal account
records. User-owned projections are the feature boundary where authentication
and Firebase persistence begin.

Portfolio X-ray imports are parsed and analyzed in the browser. They must not be
uploaded, committed, copied into fixtures, or exposed in logs. Keep secrets out
of this client: local secret values belong in ignored environment files, and
production secrets belong in the platform secret store.

Core backtest and allocation tools must continue to work without sign-in.

## Deployment boundary

Local verification ends at a successful test, lint, and build. Firebase
Hosting, Firestore rules, Cloud Run, bucket updates, and any other production
or cloud mutation are owner-only operations. Do not run deployment or data
refresh commands as part of app development or documentation verification.
