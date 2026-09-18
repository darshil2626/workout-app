import type {
  Exercise,
  ExerciseKind,
  LoggedExercise,
  LoggedSet,
  RoutineSetTarget,
  Workout,
} from '../db/types'
import { newId } from '../db/db'

/** Which input columns a set row should render for a given exercise kind. */
export interface KindFields {
  weight: boolean
  reps: boolean
  duration: boolean
  distance: boolean
  /** Weight is added to (or subtracted from) bodyweight rather than absolute. */
  relativeWeight: boolean
  /** Label shown above the weight column, before unit suffixing. */
  weightLabel: string
}

export function fieldsFor(kind: ExerciseKind): KindFields {
  switch (kind) {
    case 'weight_reps':
      return { weight: true, reps: true, duration: false, distance: false, relativeWeight: false, weightLabel: 'Weight' }
    case 'bodyweight_reps':
      return { weight: false, reps: true, duration: false, distance: false, relativeWeight: false, weightLabel: '' }
    case 'weighted_bodyweight':
      return { weight: true, reps: true, duration: false, distance: false, relativeWeight: true, weightLabel: '+Weight' }
    case 'assisted_bodyweight':
      return { weight: true, reps: true, duration: false, distance: false, relativeWeight: true, weightLabel: '−Assist' }
    case 'duration':
      return { weight: false, reps: false, duration: true, distance: false, relativeWeight: false, weightLabel: '' }
    case 'duration_weight':
      return { weight: true, reps: false, duration: true, distance: false, relativeWeight: false, weightLabel: 'Weight' }
    case 'distance_duration':
      return { weight: false, reps: false, duration: true, distance: true, relativeWeight: false, weightLabel: '' }
    case 'reps_only':
      return { weight: false, reps: true, duration: false, distance: false, relativeWeight: false, weightLabel: '' }
  }
}

export function emptySet(setType: LoggedSet['setType'] = 'normal'): LoggedSet {
  return {
    id: newId(),
    weight: null,
    reps: null,
    durationSec: null,
    distanceM: null,
    rpe: null,
    setType,
    completed: false,
  }
}

export function setFromTarget(target: RoutineSetTarget): LoggedSet {
  return {
    id: newId(),
    weight: target.weight,
    reps: target.reps,
    durationSec: target.durationSec,
    distanceM: target.distanceM,
    rpe: null,
    setType: target.setType,
    completed: false,
  }
}

/**
 * Effective load for volume and 1RM purposes.
 * Bodyweight movements count the user's bodyweight when it is known, so a
 * weighted pull-up at +20 kg is not recorded as a 20 kg lift.
 */
export function effectiveWeightKg(
  set: LoggedSet,
  kind: ExerciseKind,
  bodyweightKg: number | null | undefined,
): number {
  const bw = bodyweightKg ?? 0
  switch (kind) {
    case 'weight_reps':
    case 'duration_weight':
      return set.weight ?? 0
    case 'bodyweight_reps':
    case 'reps_only':
      return bw
    case 'weighted_bodyweight':
      return bw + (set.weight ?? 0)
    case 'assisted_bodyweight':
      return Math.max(0, bw - (set.weight ?? 0))
    default:
      return 0
  }
}

/**
 * The number a "heaviest weight" record is measured in: what was actually
 * loaded, not the total force moved. A weighted pull-up at +20 kg records
 * 20 kg, so the record tracks added load instead of creeping up every time a
 * weigh-in does, and an assisted movement records nothing because a bigger
 * number there means less work. Volume and 1RM still use effectiveWeightKg.
 */
export function prWeightKg(set: LoggedSet, kind: ExerciseKind): number {
  switch (kind) {
    case 'weight_reps':
    case 'duration_weight':
    case 'weighted_bodyweight':
      return set.weight ?? 0
    default:
      return 0
  }
}

/**
 * Warm-up sets are excluded by default, matching how lifters read their own
 * totals, but `countWarmups` reflects the user's setting for it.
 */
export function countsTowardVolume(set: LoggedSet, countWarmups = false): boolean {
  return set.completed && (countWarmups || set.setType !== 'warmup')
}

export interface WorkoutTotals {
  totalVolumeKg: number
  totalSets: number
  totalReps: number
  totalDurationSec: number
  totalDistanceM: number
}

export function computeTotals(
  exercises: LoggedExercise[],
  exerciseById: Map<string, Exercise>,
  bodyweightKg: number | null | undefined,
  countWarmups = false,
): WorkoutTotals {
  let totalVolumeKg = 0
  let totalSets = 0
  let totalReps = 0
  let totalDurationSec = 0
  let totalDistanceM = 0

  for (const le of exercises) {
    const kind = exerciseById.get(le.exerciseId)?.kind ?? 'weight_reps'
    for (const set of le.sets) {
      if (!countsTowardVolume(set, countWarmups)) continue
      totalSets += 1
      totalReps += set.reps ?? 0
      totalDurationSec += set.durationSec ?? 0
      totalDistanceM += set.distanceM ?? 0
      const w = effectiveWeightKg(set, kind, bodyweightKg)
      if (set.reps) totalVolumeKg += w * set.reps
    }
  }
  return { totalVolumeKg, totalSets, totalReps, totalDurationSec, totalDistanceM }
}

/** Epley estimate. Only meaningful for rep-based sets under ~12 reps. */
export function estimate1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0
  if (reps === 1) return weightKg
  return weightKg * (1 + reps / 30)
}

/** Elapsed seconds for a session, honouring paused time and completion. */
export function elapsedSeconds(workout: Workout, now = Date.now()): number {
  const end = workout.finishedAt ?? now
  return Math.max(0, Math.floor((end - workout.startedAt) / 1000) - workout.pausedSec)
}

/** A set the user has actually filled in — used to decide what to persist. */
export function isSetLogged(set: LoggedSet): boolean {
  return (
    set.completed ||
    set.weight !== null ||
    set.reps !== null ||
    set.durationSec !== null ||
    set.distanceM !== null
  )
}

/**
 * Whether a set records work that actually happened. Unlike isSetLogged, a zero
 * counts as nothing and the completed flag is ignored: Strong and Hevy export
 * sets that were added to a session but never performed as all-zero rows, and a
 * CSV import marks every row complete.
 */
export function hasLoggedValue(set: LoggedSet): boolean {
  return Boolean(set.weight) || Boolean(set.reps) || Boolean(set.durationSec) || Boolean(set.distanceM)
}

/** Human-readable summary of one set, e.g. "80 kg × 5" or "5.00 km in 25:00". */
export function describeSet(
  set: LoggedSet,
  kind: ExerciseKind,
  fmt: { weight: (kg: number | null) => string; distance: (m: number | null) => string; duration: (s: number) => string },
): string {
  const f = fieldsFor(kind)
  const parts: string[] = []
  if (f.distance && set.distanceM !== null) parts.push(fmt.distance(set.distanceM))
  if (f.weight && set.weight !== null) {
    const sign = f.relativeWeight ? (kind === 'assisted_bodyweight' ? '−' : '+') : ''
    parts.push(`${sign}${fmt.weight(set.weight)}`)
  }
  if (f.duration && set.durationSec !== null) parts.push(fmt.duration(set.durationSec))
  if (f.reps && set.reps !== null) parts.push(`${set.reps} reps`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export const SET_TYPE_LABEL: Record<LoggedSet['setType'], string> = {
  normal: 'Normal',
  warmup: 'Warm up',
  drop: 'Drop set',
  failure: 'To failure',
}

/** Single-character badge shown in the set-number column. */
export function setTypeBadge(setType: LoggedSet['setType'], normalIndex: number): string {
  switch (setType) {
    case 'warmup':
      return 'W'
    case 'drop':
      return 'D'
    case 'failure':
      return 'F'
    default:
      return String(normalIndex)
  }
}

/**
 * Assigns display numbers: warm-up/drop/failure sets get letter badges, and
 * only normal sets advance the working-set counter.
 */
export function setBadges(sets: LoggedSet[]): string[] {
  let n = 0
  return sets.map((s) => {
    if (s.setType === 'normal') n += 1
    return setTypeBadge(s.setType, n)
  })
}
