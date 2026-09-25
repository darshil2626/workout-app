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
