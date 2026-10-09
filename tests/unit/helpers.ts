import type { Exercise, ExerciseKind, LoggedExercise, LoggedSet, Workout } from '../../src/db/types'

let n = 0
export const uid = (p = 'id') => `${p}${++n}`

export function mkSet(o: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: uid('s'),
    weight: null,
    reps: null,
    durationSec: null,
    distanceM: null,
    rpe: null,
    setType: 'normal',
    completed: true,
    ...o,
  }
}

export function mkEx(kind: ExerciseKind = 'weight_reps', o: Partial<Exercise> = {}): Exercise {
  return {
    id: uid('e'),
    name: 'Ex',
    muscleGroup: 'Chest',
    equipment: 'Barbell',
    kind,
    isCustom: false,
    createdAt: 0,
    ...o,
  }
}

export function mkLogged(exerciseId: string, sets: LoggedSet[]): LoggedExercise {
  return { id: uid('le'), exerciseId, supersetGroup: null, sets }
}

export function mkWorkout(o: Partial<Workout> = {}): Workout {
  const exercises = o.exercises ?? []
  return {
    id: uid('w'),
    name: 'W',
    status: 'done',
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_000_000 + 3_600_000,
    pausedSec: 0,
    exercises,
    exerciseIds: exercises.map((e) => e.exerciseId),
    totalVolumeKg: 0,
    totalSets: 0,
    totalReps: 0,
    ...o,
  }
}
