# Releasing

Every merge to `main` is deployed to everyone, and the app updates itself on their
devices. That is convenient and unforgiving, so this is how changes are kept safe.

## The path a change takes

1. Work on a branch and open a pull request. CI runs lint, formatting, type-checks
   (source and tests), unit and integration tests, a production build and the
   Playwright suite, which includes axe accessibility checks in both themes.
2. `build` and `e2e` must pass before merging (branch protection).
3. Merging to `main` builds again with the production base path and deploys to GitHub
   Pages.
4. People who have the app open are offered **New version ready → Reload**; the new
   version never replaces the page mid-set. An installed copy picks it up the next time
   it is fully closed and reopened if nobody taps Reload.

## Rules that protect stored data

The history lives only on people's phones, so a bad release can do more harm here than in
an app with a server.

- **Schema changes are forward-only and additive where possible.** Add a store or an
  index with a new `this.version(n)` in `src/db/db.ts`; do not rewrite existing rows
  without a migration and a test. There is no downgrade: a browser that has upgraded to
  version _n_ cannot be moved back.
- **Every schema change gets an upgrade test** that builds a database at the previous
  version and checks the rows survive (`tests/integration/migration.test.ts`).
- **Try it on a real copy of real data first.** `npm run stage` serves a labelled
  staging build on your Wi-Fi with its own storage. Import a recent export and click
  through. For a change that touches stored data, also run the update path by hand:
  serve the previous build, load data, switch to the new one, and accept the update
  prompt.
- **Backups must keep restoring.** A backup written by any earlier version has to import;
  `findBackupProblems` is deliberately lenient about fields added later.

## If a release is bad

**Roll forward.** Revert the pull request (or fix and merge a new one). The fix reaches
users through the same update prompt, usually within minutes of them next opening the app.

- Do not try to "roll back" the database. If the bad release changed the schema, the fix
  has to be a newer release that copes with it.
- A device that has upgraded and then meets an _older_ build (for example a cached page)
  may fail to open the database. The app shows the recovery screen ("Trana can't open your
  data") with Try again, Save a backup and Erase, rather than a broken app. This
  situation has not been tested against a real older build.
- If the service worker itself is the problem, the next deploy replaces it; there is no
  server-side switch to turn it off.

## Before merging anything that touches storage

- [ ] Migration test added or updated
- [ ] Tried on staging with a restored copy of real data
- [ ] An export taken from the live app first
- [ ] `PRIVACY.md` updated if anything new is stored or sent
