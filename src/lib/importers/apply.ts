import { db } from '../../db/db'
import { partitionImport, recomputeAllWorkoutTotals } from '../dedupe'
import type { ParsedImport } from './shared'

export interface CsvImportSummary {
  /** Workouts actually inserted. */
  workouts: number
  /** Workouts left out because that exact session was already on the device. */
  skipped: number
  exercises: number
}

/**
 * Unlike restoreBackup, this adds to the existing library rather than
 * replacing it — CSV imports are a one-time migration of history from
 * another app, not a full-device restore.
 *
 * Importing the same file twice is harmless: sessions already on the device are
 * skipped, so re-importing a longer export only adds what's new.
 */
export async function applyCsvImport(parsed: ParsedImport): Promise<CsvImportSummary> {
  const summary = await db.transaction('rw', [db.exercises, db.workouts], async () => {
    // Inside the transaction so the check and the insert can't race a second tab.
    const { fresh, duplicates } = await partitionImport(parsed.workouts)

    // An import where everything is a duplicate shouldn't leave orphan exercises
    // behind, so only keep the ones a workout we're inserting actually uses.
    const usedIds = new Set(fresh.flatMap((w) => w.exerciseIds))
    const exercises = parsed.newExercises.filter((e) => usedIds.has(e.id))

    if (exercises.length > 0) await db.exercises.bulkAdd(exercises)
    if (fresh.length > 0) await db.workouts.bulkAdd(fresh)

    return { workouts: fresh.length, skipped: duplicates.length, exercises: exercises.length }
  })

  // The parsers total each session under the default rules; this re-totals them
  // under the user's own, so imported history matches what they already have.
  if (summary.workouts > 0) await recomputeAllWorkoutTotals()
  return summary
}
