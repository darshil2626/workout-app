# Releasing

Every merge to `main` is deployed to everyone, and the app updates itself on their
devices. That is convenient and unforgiving, so this is how changes are kept safe.

## The path a change takes

1. Work on a branch and open a pull request. CI runs lint, formatting, type-checks
   (source and tests), unit and integration tests, a production build and the
   Playwright suite, which includes axe accessibility checks in both themes.
2. `build` and `e2e` must pass before merging (branch protection).
3. Merging to `main` builds again with the production base path and deploys to GitHub
   Pages. A `smoke` job then opens the live site in a fresh browser (`npm run test:smoke`):
   the manifest and worker are served from the root, the site is serving the commit just
   merged, a workout can be logged and survives a reload and going offline, and the old
   address still redirects. It cannot undo a deploy; a red `smoke` job means look at the
   site now, and usually revert.
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
  `findBackupProblems` is deliberately lenient about fields added later. The proof is
  `tests/fixtures/backups/`: one file per era, restored and run through the real
  calculations and screens. A change to the stored shape fails a test until a new fixture
  is added; the old ones are never edited (see the README there).
- **The update path is tested.** `tests/e2e/update-path.spec.ts` serves two builds from one
  origin and checks that the new worker waits, no reload happens mid-workout, Reload applies
  it without losing the workout, and an ignored update takes over once the app is closed. By
  default both builds are the current one; for a real upgrade, build the previous release and
  run with `OLD_BUILD_DIR=<its dist>` (the file explains how).

## If a release is bad

**Roll forward.** Revert the pull request (or fix and merge a new one). The fix reaches
users through the same update prompt, usually within minutes of them next opening the app.

- Do not try to "roll back" the database. If the bad release changed the schema, the fix
  has to be a newer release that copes with it.
- A device that has upgraded and then meets an _older_ build (a stale cached page, say)
  opens the database anyway: Dexie 4 accepts a newer schema, keeps every row and any
  store it does not know about, and only raises the version number. This is tested in
  Node (`tests/integration/newerDatabase.test.ts`) and in Chromium
  (`tests/e2e/newer-database.spec.ts`). If the database genuinely cannot open, the app
  shows the recovery screen ("Trana can't open your data") with Try again, Save a backup
  and Erase, rather than a broken app. A change that _removes_ a store or index is not
  covered by any of this, which is one more reason schema changes are additive.
- If the service worker itself is the problem, the next deploy replaces it; there is no
  server-side switch to turn it off.

## Before merging anything that touches storage

- [ ] Migration test added or updated
- [ ] Tried on staging with a restored copy of real data
- [ ] An export taken from the live app first
- [ ] `PRIVACY.md` updated if anything new is stored or sent
