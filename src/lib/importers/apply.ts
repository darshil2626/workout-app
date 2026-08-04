import { db } from '../../db/db'
import type { ImportSummary } from '../backup'
import type { ParsedImport } from './shared'

/**
 * Unlike restoreBackup, this adds to the existing library rather than
 * replacing it — CSV imports are a one-time migration of history from
 * another app, not a full-device restore.
 */
export async function applyCsvImport(parsed: ParsedImport): Promise<ImportSummary> {
  await db.transaction('rw', [db.exercises, db.workouts], async () => {
    if (parsed.newExercises.length > 0) await db.exercises.bulkAdd(parsed.newExercises)
    if (parsed.workouts.length > 0) await db.workouts.bulkAdd(parsed.workouts)
  })
  return {
    exercises: parsed.newExercises.length,
    workouts: parsed.workouts.length,
    routines: 0,
    folders: 0,
    measurements: 0,
  }
}
