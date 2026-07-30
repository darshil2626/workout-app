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
