import { db } from '../db/db'
import type { Exercise, ExerciseKind, LoggedSet, Workout } from '../db/types'
import { effectiveWeightKg, estimate1RM, fieldsFor } from './workout'

export type PRKind = 'weight' | 'oneRm' | 'volume' | 'reps' | 'duration' | 'distance'

export const PR_LABEL: Record<PRKind, string> = {
  weight: 'heaviest weight',
  oneRm: 'best estimated 1RM',
  volume: 'best set volume',
  reps: 'most reps',
  duration: 'longest time',
  distance: 'furthest distance',
}

export interface ExerciseRecords {
  weight: number
  oneRm: number
  volume: number
  reps: number
  duration: number
  distance: number
}

export function emptyRecords(): ExerciseRecords {
  return { weight: 0, oneRm: 0, volume: 0, reps: 0, duration: 0, distance: 0 }
}

/** Which record kinds are meaningful for an exercise's input fields. */
export function relevantKinds(kind: ExerciseKind): PRKind[] {
  const f = fieldsFor(kind)
  const kinds: PRKind[] = []
  if (f.weight || f.relativeWeight) kinds.push('weight')
  if (f.weight && f.reps) kinds.push('oneRm', 'volume')
  if (f.reps) kinds.push('reps')
  if (f.duration) kinds.push('duration')
  if (f.distance) kinds.push('distance')
  return kinds
}

function foldSet(
  records: ExerciseRecords,
  set: LoggedSet,
  kind: ExerciseKind,
  bodyweightKg: number | null,
): void {
  const load = effectiveWeightKg(set, kind, bodyweightKg)
  if (load > records.weight) records.weight = load
  if (set.reps && set.reps > records.reps) records.reps = set.reps
  if (set.durationSec && set.durationSec > records.duration) records.duration = set.durationSec
  if (set.distanceM && set.distanceM > records.distance) records.distance = set.distanceM
  if (load > 0 && set.reps) {
    records.oneRm = Math.max(records.oneRm, estimate1RM(load, set.reps))
    records.volume = Math.max(records.volume, load * set.reps)
  }
}

/**
 * Best-ever values for an exercise across completed sessions.
 * Warm-ups are excluded — a heavy-ish warm-up should never define a record.
 */
export async function loadRecords(
  exerciseId: string,
  kind: ExerciseKind,
  fallbackBodyweightKg: number | null,
  excludeWorkoutId?: string,
): Promise<ExerciseRecords> {
  const candidates = await db.workouts.where('exerciseIds').equals(exerciseId).toArray()
  const records = emptyRecords()
  for (const w of candidates) {
    if (w.status !== 'done' || w.id === excludeWorkoutId) continue
    for (const le of w.exercises) {
      if (le.exerciseId !== exerciseId) continue
      for (const s of le.sets) {
        if (!s.completed || s.setType === 'warmup') continue
        foldSet(records, s, kind, w.bodyweightKg ?? fallbackBodyweightKg)
      }
    }
  }
  return records
}

/**
 * Marks only the single best set per record kind, so repeating a PR weight for
 * three sets badges one row rather than three.
 */
export function findSessionPRs(
  sets: LoggedSet[],
  exercise: Exercise,
  baseline: ExerciseRecords,
  bodyweightKg: number | null,
): Map<string, PRKind[]> {
  const kinds = relevantKinds(exercise.kind)
  const best = new Map<PRKind, { setId: string; value: number }>()

  for (const s of sets) {
    if (!s.completed || s.setType === 'warmup') continue
    const load = effectiveWeightKg(s, exercise.kind, bodyweightKg)
    const values: Partial<Record<PRKind, number>> = {
      weight: load,
      reps: s.reps ?? 0,
      duration: s.durationSec ?? 0,
      distance: s.distanceM ?? 0,
      oneRm: load > 0 && s.reps ? estimate1RM(load, s.reps) : 0,
      volume: load > 0 && s.reps ? load * s.reps : 0,
    }
    for (const kind of kinds) {
      const value = values[kind] ?? 0
      if (value <= baseline[kind]) continue
      const current = best.get(kind)
      if (!current || value > current.value) best.set(kind, { setId: s.id, value })
    }
  }

  const result = new Map<string, PRKind[]>()
  for (const [kind, { setId }] of best) {
    result.set(setId, [...(result.get(setId) ?? []), kind])
  }
  return result
}

/** Convenience for a stored session: recompute its PRs against earlier history. */
export async function prsForWorkout(
  workout: Workout,
  exerciseById: Map<string, Exercise>,
  fallbackBodyweightKg: number | null,
): Promise<Map<string, PRKind[]>> {
  const all = new Map<string, PRKind[]>()
  for (const le of workout.exercises) {
    const exercise = exerciseById.get(le.exerciseId)
    if (!exercise) continue
    const baseline = await loadRecordsBefore(
      le.exerciseId,
      exercise.kind,
      workout.bodyweightKg ?? fallbackBodyweightKg,
      workout.startedAt,
    )
    const prs = findSessionPRs(
      le.sets,
      exercise,
      baseline,
      workout.bodyweightKg ?? fallbackBodyweightKg,
    )
    for (const [setId, kinds] of prs) all.set(setId, kinds)
  }
  return all
}

/**
 * Records as they stood before a given moment, so a historical session is
 * judged against what came before it rather than against later sessions.
 */
export async function loadRecordsBefore(
  exerciseId: string,
  kind: ExerciseKind,
  fallbackBodyweightKg: number | null,
  before: number,
): Promise<ExerciseRecords> {
  const candidates = await db.workouts.where('exerciseIds').equals(exerciseId).toArray()
  const records = emptyRecords()
  for (const w of candidates) {
    if (w.status !== 'done' || w.startedAt >= before) continue
    for (const le of w.exercises) {
      if (le.exerciseId !== exerciseId) continue
      for (const s of le.sets) {
        if (!s.completed || s.setType === 'warmup') continue
        foldSet(records, s, kind, w.bodyweightKg ?? fallbackBodyweightKg)
      }
    }
  }
  return records
}
