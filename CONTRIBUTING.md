# Contributing

## Setup

```bash
npm install
npm run dev
```

## Before you open a pull request

`npm test` runs everything CI runs: lint, format check, type-check, unit and
integration tests, a production build, and the Playwright end-to-end suite
(including axe accessibility checks in light and dark themes).

Useful on their own: `npm run lint`, `npm run format` (rewrites files),
`npm run test:unit`, `npm run test:e2e` (build first).

## Things that matter here

- **Stored data is precious.** The real history lives on people's phones. Any
  change to what is stored needs a Dexie version bump, and a test that opens an
  older database and checks it upgrades (see `tests/integration/migration.test.ts`).
- **Units.** Weights are stored in kg, distances in metres, lengths in cm,
  durations in seconds, times in epoch milliseconds. Convert only at the UI edge.
- **Analytics carry no workout content.** New `track()` calls pass categorical or
  bucketed values only, and get a row in [PRIVACY.md](PRIVACY.md).
- **Accessibility.** Icon-only buttons need an `aria-label`; text must meet 4.5:1
  contrast; inputs stay at 16px so iOS does not zoom on focus.

## Commits

Short imperative subject; explain _why_ in the body.
