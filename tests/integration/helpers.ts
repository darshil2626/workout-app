import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '../../src/db/db'
import type { Exercise, LoggedSet, Workout } from '../../src/db/types'

/** Deletes the app database and reopens it empty, so every test starts clean. */
export async function resetDb(): Promise<void> {
  db.close()
  await db.delete()
  await db.open()
}

export function readFixture(rel: string): string {
  return readFileSync(resolve(__dirname, '../..', rel), 'utf8')
}

let n = 0
export function set(over: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: `s${++n}`,
    weight: 100,
    reps: 5,
    durationSec: null,
    distanceM: null,
    rpe: null,
    setType: 'normal',
    completed: true,
    ...over,
  }
}

export function workout(over: Partial<Workout> & { id: string }): Workout {
  const exercises = over.exercises ?? []
  return {
    name: 'W',
    status: 'done',
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_000_000 + 3_600_000,
    pausedSec: 0,
    exercises,
    exerciseIds: Array.from(new Set(exercises.map((e) => e.exerciseId))),
    totalVolumeKg: 0,
    totalSets: 0,
    totalReps: 0,
    ...over,
  }
}

export function logged(exerciseId: string, sets: LoggedSet[], id = `le-${exerciseId}-${++n}`) {
  return { id, exerciseId, supersetGroup: null, sets }
}

export function customExercise(over: Partial<Exercise> & { id: string; name: string }): Exercise {
  return {
    muscleGroup: 'Other',
    equipment: 'Other',
    kind: 'weight_reps',
    isCustom: true,
    createdAt: 1,
    ...over,
  }
}

export async function snapshot() {
  const [exercises, workouts, routines, folders, measurements, settings] = await Promise.all([
    db.exercises.orderBy('id').toArray(),
    db.workouts.orderBy('id').toArray(),
    db.routines.orderBy('id').toArray(),
    db.folders.orderBy('id').toArray(),
    db.measurements.orderBy('id').toArray(),
    db.settings.toArray(),
  ])
  return { exercises, workouts, routines, folders, measurements, settings }
}
