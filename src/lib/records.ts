import { db } from '../db/db'
import type { Exercise, ExerciseKind, LoggedSet, Workout } from '../db/types'
import { effectiveWeightKg, estimate1RM, fieldsFor, prWeightKg } from './workout'

/** Record kinds that belong to a single set, so they can badge one row. */
export type PRKind = 'weight' | 'oneRm' | 'volume' | 'reps' | 'duration' | 'distance'

/**
 * Session volume sums an exercise's sets, so it is a record without a set to
 * pin it to — it appears in the records list rather than as a badge.
 */
export type RecordKind = PRKind | 'sessionVolume'

export const PR_LABEL: Record<RecordKind, string> = {
  weight: 'heaviest weight',
  oneRm: 'best estimated 1RM',
  volume: 'best set volume',
  sessionVolume: 'best session volume',
  reps: 'most reps',
  duration: 'longest time',
  distance: 'furthest distance',
}

export interface ExerciseRecords {
  weight: number
  oneRm: number
  volume: number
  sessionVolume: number
  reps: number
  duration: number
  distance: number
}

export function emptyRecords(): ExerciseRecords {
  return { weight: 0, oneRm: 0, volume: 0, sessionVolume: 0, reps: 0, duration: 0, distance: 0 }
}

/**
 * Which records are meaningful for an exercise.
 *
 * A movement loaded by your own bodyweight earns no weight, 1RM or volume
 * record: those numbers would track your weigh-ins rather than your training,
 * and an assisted movement inverts the scale entirely, since more assistance
 * means less work. Such exercises are ranked on reps alone.
 */
export function relevantKinds(kind: ExerciseKind): RecordKind[] {
  const f = fieldsFor(kind)
  const loadIsMeasurable = f.weight && kind !== 'assisted_bodyweight'
  const kinds: RecordKind[] = []
  if (loadIsMeasurable) kinds.push('weight')
  if (loadIsMeasurable && f.reps) kinds.push('oneRm', 'volume', 'sessionVolume')
  if (f.reps) kinds.push('reps')
  if (f.duration) kinds.push('duration')
  if (f.distance) kinds.push('distance')
  return kinds
}

/** The subset that can be attributed to one set, and so can carry a PR badge. */
export function setPRKinds(kind: ExerciseKind): PRKind[] {
  return relevantKinds(kind).filter((k): k is PRKind => k !== 'sessionVolume')
}

function foldSet(
  records: ExerciseRecords,
  set: LoggedSet,
  kind: ExerciseKind,
  bodyweightKg: number | null,
): void {
  const loaded = prWeightKg(set, kind)
  if (loaded > records.weight) records.weight = loaded
  if (set.reps && set.reps > records.reps) records.reps = set.reps
  if (set.durationSec && set.durationSec > records.duration) records.duration = set.durationSec
  if (set.distanceM && set.distanceM > records.distance) records.distance = set.distanceM

  const load = effectiveWeightKg(set, kind, bodyweightKg)
  if (load > 0 && set.reps) {
    records.oneRm = Math.max(records.oneRm, estimate1RM(load, set.reps))
    records.volume = Math.max(records.volume, load * set.reps)
  }
}

/** One performance of an exercise, as ./history returns it. */
export interface HistoryEntry {
  workout: Workout
  logged: { sets: LoggedSet[] }
}

/**
 * Best-ever values across a set of performances. Session volume is summed per
 * workout, so a second entry for the same exercise later in the same session
 * adds to it rather than competing with it — it is still that day's work on
 * that movement.
 */
export function recordsFromHistory(
  history: HistoryEntry[],
  kind: ExerciseKind,
  fallbackBodyweightKg: number | null,
  countWarmups: boolean,
): ExerciseRecords {
  const records = emptyRecords()
  const sessionVolumes = new Map<string, number>()

  for (const { workout, logged } of history) {
    const bodyweightKg = workout.bodyweightKg ?? fallbackBodyweightKg
    for (const s of logged.sets) {
      if (!s.completed) continue
      if (!countWarmups && s.setType === 'warmup') continue
      foldSet(records, s, kind, bodyweightKg)
      if (s.reps) {
        const load = effectiveWeightKg(s, kind, bodyweightKg)
        sessionVolumes.set(workout.id, (sessionVolumes.get(workout.id) ?? 0) + load * s.reps)
      }
    }
  }
  for (const volume of sessionVolumes.values()) {
    if (volume > records.sessionVolume) records.sessionVolume = volume
  }
  return records
}

interface ScanOptions {
  /** Include warm-up sets, reflecting the user's setting. */
  countWarmups: boolean
  /** Skip a session, so a set being logged is not compared against itself. */
  excludeWorkoutId?: string
  /** Only sessions started before this moment, for judging a stored workout. */
  before?: number
}

/** Loads the relevant sessions from storage, then folds them. */
async function scanRecords(
  exerciseId: string,
  kind: ExerciseKind,
  fallbackBodyweightKg: number | null,
  opts: ScanOptions,
): Promise<ExerciseRecords> {
  const candidates = await db.workouts.where('exerciseIds').equals(exerciseId).toArray()
  const history: HistoryEntry[] = []
  for (const workout of candidates) {
    if (workout.status !== 'done') continue
    if (opts.excludeWorkoutId && workout.id === opts.excludeWorkoutId) continue
    if (opts.before !== undefined && workout.startedAt >= opts.before) continue
    for (const le of workout.exercises) {
      if (le.exerciseId === exerciseId) history.push({ workout, logged: le })
    }
  }
  return recordsFromHistory(history, kind, fallbackBodyweightKg, opts.countWarmups)
}

export function loadRecords(
  exerciseId: string,
  kind: ExerciseKind,
  fallbackBodyweightKg: number | null,
  countWarmups: boolean,
  excludeWorkoutId?: string,
): Promise<ExerciseRecords> {
  return scanRecords(exerciseId, kind, fallbackBodyweightKg, { countWarmups, excludeWorkoutId })
}

/**
 * Records as they stood before a given moment, so a historical session is
 * judged against what came before it rather than against later sessions.
 */
export function loadRecordsBefore(
  exerciseId: string,
  kind: ExerciseKind,
  fallbackBodyweightKg: number | null,
  before: number,
  countWarmups: boolean,
): Promise<ExerciseRecords> {
  return scanRecords(exerciseId, kind, fallbackBodyweightKg, { countWarmups, before })
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
  countWarmups = false,
): Map<string, PRKind[]> {
  const kinds = setPRKinds(exercise.kind)
  const best = new Map<PRKind, { setId: string; value: number }>()

  for (const s of sets) {
    if (!s.completed) continue
    if (!countWarmups && s.setType === 'warmup') continue
    const load = effectiveWeightKg(s, exercise.kind, bodyweightKg)
    const values: Partial<Record<PRKind, number>> = {
      weight: prWeightKg(s, exercise.kind),
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
  countWarmups = false,
): Promise<Map<string, PRKind[]>> {
  const all = new Map<string, PRKind[]>()
  for (const le of workout.exercises) {
    const exercise = exerciseById.get(le.exerciseId)
    if (!exercise) continue
    const bodyweightKg = workout.bodyweightKg ?? fallbackBodyweightKg
    const baseline = await loadRecordsBefore(
      le.exerciseId,
      exercise.kind,
      bodyweightKg,
      workout.startedAt,
      countWarmups,
    )
    const prs = findSessionPRs(le.sets, exercise, baseline, bodyweightKg, countWarmups)
    for (const [setId, kinds] of prs) all.set(setId, kinds)
  }
  return all
}

export interface SetRecord {
  reps: number
  weightKg: number
  /** When the weight was first reached, so the table reads as a history. */
  achievedAt: number
}

/**
 * Heaviest weight lifted at each rep count. Unlike a personal record this is
 * not a single best: 100 kg × 5 and 80 kg × 12 are both worth keeping, and
 * together they describe the strength curve a single 1RM estimate flattens.
 */
export async function loadSetRecords(
  exerciseId: string,
  kind: ExerciseKind,
  countWarmups: boolean,
): Promise<SetRecord[]> {
  const f = fieldsFor(kind)
  if (!f.reps || !f.weight) return []

  const candidates = await db.workouts.where('exerciseIds').equals(exerciseId).toArray()
  const best = new Map<number, SetRecord>()
  for (const w of candidates) {
    if (w.status !== 'done') continue
    const at = w.finishedAt ?? w.startedAt
    for (const le of w.exercises) {
      if (le.exerciseId !== exerciseId) continue
      for (const s of le.sets) {
        if (!s.completed) continue
        if (!countWarmups && s.setType === 'warmup') continue
        if (!s.reps) continue
        const weightKg = prWeightKg(s, kind)
        if (weightKg <= 0) continue
        const current = best.get(s.reps)
        // Ties keep the earlier date: that is when the weight was first reached.
        if (!current || weightKg > current.weightKg) {
          best.set(s.reps, { reps: s.reps, weightKg, achievedAt: at })
        } else if (weightKg === current.weightKg && at < current.achievedAt) {
          best.set(s.reps, { ...current, achievedAt: at })
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => a.reps - b.reps)
}
