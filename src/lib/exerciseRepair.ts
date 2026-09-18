import { db } from '../db/db'
import type { Exercise, Workout } from '../db/types'
import { computeTotals, fieldsFor } from './workout'
import { ExerciseIndex, MERGE_CONFIDENCES, type MatchConfidence, type RowShape } from './exerciseMatch'

/**
 * Repairing exercises an earlier import created before name matching existed.
 * Those sit as custom entries in the 'Other' muscle group, which empties the
 * muscle balance chart and the body diagram, and splits a movement's history
 * across two entries.
 */

export interface ExerciseFix {
  from: Exercise
  /** Set when the movement is already in the library — merge into it. */
  into: Exercise | null
  /** Otherwise the fields worth filling in, leaving anything already set alone. */
  classify: Partial<Exercise> | null
  /** Sessions affected, so the confirm sheet can say how much moves. */
  workouts: number
  confidence: MatchConfidence
}

/** An existing exercise's kind tells us which fields it uses. */
function shapeOf(exercise: Exercise): RowShape {
  const f = fieldsFor(exercise.kind)
  return { hasWeight: f.weight, hasReps: f.reps, hasDuration: f.duration, hasDistance: f.distance }
}

/** True while a session is in progress, which a merge underneath would desync. */
export async function hasActiveWorkout(): Promise<boolean> {
  return (await db.workouts.where('status').equals('active').count()) > 0
}

/**
 * What matching the stored library would change. Merge targets are restricted
 * to built-in exercises: that keeps every merge pointed at the canonical entry
 * and rules out two custom entries claiming each other in a cycle. Two custom
 * duplicates of a movement the library lacks are left for the manual merge.
 */
export async function scanExerciseFixes(): Promise<ExerciseFix[]> {
  const exercises = await db.exercises.toArray()
  const builtIn = exercises.filter((e) => !e.isCustom)
  const index = new ExerciseIndex(builtIn)

  const fixes: ExerciseFix[] = []
  for (const from of exercises) {
    if (!from.isCustom) continue
    const match = index.match(from.name, shapeOf(from))

    if (match.exercise && match.exercise.id !== from.id && MERGE_CONFIDENCES.includes(match.confidence)) {
      fixes.push({
        from,
        into: match.exercise,
        classify: null,
        workouts: await db.workouts.where('exerciseIds').equals(from.id).count(),
        confidence: match.confidence,
      })
      continue
    }

    // Fill gaps only — never clobber something already set, which may be a user edit.
    const classify: Partial<Exercise> = {}
    if (from.muscleGroup === 'Other' && match.classify.muscleGroup !== 'Other') {
      classify.muscleGroup = match.classify.muscleGroup
    }
    if (!from.secondaryMuscles?.length && match.classify.secondaryMuscles?.length) {
      classify.secondaryMuscles = match.classify.secondaryMuscles
    }
    if (from.equipment === 'Other' && match.classify.equipment !== 'Other') {
      classify.equipment = match.classify.equipment
    }
    if (Object.keys(classify).length === 0) continue

    fixes.push({
      from,
      into: null,
      classify,
      workouts: await db.workouts.where('exerciseIds').equals(from.id).count(),
      confidence: match.confidence,
    })
  }
  return fixes
}

/**
 * Points every reference at `intoId` and deletes the source. Archiving instead
 * would leave the old sets pointing at it, so they'd stay in the wrong muscle
 * group — a merge has to actually rewrite history. Returns sessions changed.
 */
export async function mergeExercises(fromId: string, intoId: string): Promise<number> {
  if (fromId === intoId) return 0
  return db.transaction('rw', [db.workouts, db.routines, db.exercises, db.settings], async () => {
    const target = await db.exercises.get(intoId)
    if (!target) throw new Error('That exercise no longer exists.')

    const [exercises, settings] = await Promise.all([db.exercises.toArray(), db.settings.get(1)])
    const exerciseById = new Map(exercises.map((e) => [e.id, e] as const))

    const affected = await db.workouts.where('exerciseIds').equals(fromId).toArray()
    // Callers check for a live session before opening the flow, but a workout
    // can start between that check and this write. Re-checking inside the
    // transaction closes the gap: rewriting a session that is also held in
    // memory would be undone by its next autosave, leaving its sets pointing
    // at an exercise this function is about to delete.
    if (affected.some((w) => w.status === 'active')) {
      throw new Error('That exercise is in the workout in progress. Finish or discard it first.')
    }
    const updated: Workout[] = affected.map((w) => {
      const logged = w.exercises.map((le) => (le.exerciseId === fromId ? { ...le, exerciseId: intoId } : le))
      // Kinds can differ between source and target, and totals are kind-sensitive.
      const totals = computeTotals(
        logged,
        exerciseById,
        w.bodyweightKg ?? settings?.bodyweightKg ?? null,
        settings?.countWarmupSets ?? false,
      )
      return {
        ...w,
        exercises: logged,
        // Deduplicated: a session holding both exercises would otherwise index the target twice.
        exerciseIds: Array.from(new Set(logged.map((le) => le.exerciseId))),
        totalVolumeKg: totals.totalVolumeKg,
        totalSets: totals.totalSets,
        totalReps: totals.totalReps,
      }
    })
    if (updated.length > 0) await db.workouts.bulkPut(updated)

    // RoutineExercise.exerciseId has no index, so this is a full scan.
    const routines = await db.routines.toArray()
    const touched = routines
      .filter((r) => r.exercises.some((re) => re.exerciseId === fromId))
      .map((r) => ({
        ...r,
        exercises: r.exercises.map((re) => (re.exerciseId === fromId ? { ...re, exerciseId: intoId } : re)),
      }))
    if (touched.length > 0) await db.routines.bulkPut(touched)

    await db.exercises.delete(fromId)
    return updated.length
  })
}

export interface ExerciseRepairResult {
  merged: number
  reclassified: number
  workouts: number
}

/** Applies every fix the scan proposes. Each merge is its own transaction, so a re-run resumes. */
export async function applyExerciseFixes(): Promise<ExerciseRepairResult> {
  const fixes = await scanExerciseFixes()
  const result: ExerciseRepairResult = { merged: 0, reclassified: 0, workouts: 0 }

  for (const fix of fixes) {
    if (fix.into) {
      result.workouts += await mergeExercises(fix.from.id, fix.into.id)
      result.merged++
    } else if (fix.classify) {
      await db.exercises.put({ ...fix.from, ...fix.classify })
      result.reclassified++
    }
  }
  return result
}
