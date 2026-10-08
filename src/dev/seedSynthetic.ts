import { db } from '../db/db'
import { restoreBackup } from '../lib/backup'

/**
 * Dev-only convenience: the first time `npm run dev` opens against a genuinely
 * empty database, load the synthetic dataset (src/dev/synthetic-dataset.json —
 * see scripts/generate-synthetic-dataset.mjs) instead of starting blank.
 *
 * Gated on `import.meta.env.DEV` so the 1MB fixture and this code path are
 * dead-code-eliminated out of production builds entirely — nothing here ever
 * runs, or ships, outside `npm run dev`/`preview`.
 *
 * Runs once per browser profile: a `meta` flag is set immediately (before the
 * import even resolves) so a later reload — including one where you've since
 * deleted everything to test the empty state — never re-seeds underneath you.
 * To reseed, clear the site's IndexedDB (devtools → Application → Storage) or
 * use Settings → Import backup with this same file.
 */
export async function maybeSeedSyntheticData(): Promise<void> {
  if (!import.meta.env.DEV) return

  const marker = await db.meta.get('devSyntheticSeeded')
  if (marker) return
  await db.meta.put({ key: 'devSyntheticSeeded', value: 1 })

  const [workoutCount, routineCount, folderCount] = await Promise.all([
    db.workouts.count(),
    db.routines.count(),
    db.folders.count(),
  ])
  if (workoutCount > 0 || routineCount > 0 || folderCount > 0) return

  const { default: dataset } = await import('./synthetic-dataset.json')
  await restoreBackup(JSON.stringify(dataset))
}

/**
 * Dev-only: opening the app with `?qa=1` replaces the database with the
 * hand-designed QA fixture (qa/qa-dataset.json, built by
 * scripts/generate-qa-dataset.mjs) whose correct on-screen results are listed
 * in qa/qa-expected.json. Replaces everything in this browser profile, so it
 * is only ever meant for a throwaway dev profile. Dead-code-eliminated from
 * production builds like the synthetic seed above.
 */
export async function maybeLoadQaDataset(): Promise<void> {
  if (!import.meta.env.DEV) return
  const params = new URLSearchParams(window.location.search)
  if (params.get('qa') !== '1') return

  // Marked first so the synthetic seed that runs next never competes with it.
  await db.meta.put({ key: 'devSyntheticSeeded', value: 1 })
  const { default: dataset } = await import('../../qa/qa-dataset.json')
  await restoreBackup(JSON.stringify(dataset))
  params.delete('qa')
  const rest = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))
}
