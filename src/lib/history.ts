import { db } from '../db/db'
import type { LoggedExercise, LoggedSet, Workout } from '../db/types'

export interface PreviousPerformance {
  workoutId: string
  performedAt: number
  sets: LoggedSet[]
}

/**
 * Finds the most recent completed session containing `exerciseId`.
 * Backs the greyed-out "previous" values shown while logging, which is the
 * single most-used piece of information during a workout.
 */
export async function getPreviousPerformance(
  exerciseId: string,
  excludeWorkoutId?: string,
): Promise<PreviousPerformance | null> {
  const candidates = await db.workouts.where('exerciseIds').equals(exerciseId).toArray()
  const done = candidates
    .filter((w) => w.status === 'done' && w.id !== excludeWorkoutId)
    .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt))

  for (const w of done) {
    const le = w.exercises.find((e) => e.exerciseId === exerciseId)
    const sets = le?.sets.filter((s) => s.completed) ?? []
    if (sets.length > 0) {
      return { workoutId: w.id, performedAt: w.finishedAt ?? w.startedAt, sets }
    }
  }
  return null
}

export interface PreviousSessionTotals {
  workoutId: string
  performedAt: number
  totalVolumeKg: number
}

/**
 * The most recent completed session comparable to the one in progress, for
 * the session-total delta arrow. "Comparable" means the same routine when
 * this session was started from one — matching `routineId` the way the
 * `*exerciseIds` index already matches on exercise — or, for a freeform
 * workout with no routine behind it, the last completed session sharing its
 * name (e.g. a hand-typed "Push Day" repeated from memory).
 */
export async function getPreviousSessionTotals(
  workoutName: string,
  routineId: string | undefined,
  excludeWorkoutId?: string,
): Promise<PreviousSessionTotals | null> {
  const candidates = routineId
    ? await db.workouts.where('routineId').equals(routineId).toArray()
    : (await db.workouts.where('status').equals('done').toArray()).filter((w) => w.name === workoutName)
  const done = candidates
    .filter((w) => w.status === 'done' && w.id !== excludeWorkoutId)
    .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt))
  const latest = done[0]
  if (!latest) return null
  return {
    workoutId: latest.id,
    performedAt: latest.finishedAt ?? latest.startedAt,
    totalVolumeKg: latest.totalVolumeKg,
  }
}

/** Every completed session containing an exercise, newest first. */
export async function getExerciseHistory(exerciseId: string): Promise<
  { workout: Workout; logged: LoggedExercise }[]
> {
  const candidates = await db.workouts.where('exerciseIds').equals(exerciseId).toArray()
  return candidates
    .filter((w) => w.status === 'done')
    .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt))
    .flatMap((workout) => {
      const logged = workout.exercises.filter((e) => e.exerciseId === exerciseId)
      return logged.map((l) => ({ workout, logged: l }))
    })
}
