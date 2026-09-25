import type { Exercise, ExerciseKind, MuscleGroup, Workout } from '../db/types'
import {
  countsTowardVolume,
  effectiveWeightKg,
  elapsedSeconds,
  estimate1RM,
  fieldsFor,
  prWeightKg,
} from './workout'

const DAY_MS = 86400000

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Monday-or-Sunday-aligned week start, matching the user's calendar setting. */
export function startOfWeek(ts: number, firstDayOfWeek: 0 | 1): number {
  const d = new Date(startOfDay(ts))
  const shift = (d.getDay() - firstDayOfWeek + 7) % 7
  d.setDate(d.getDate() - shift)
  return d.getTime()
}

export interface Totals {
  workouts: number
  volumeKg: number
  sets: number
  reps: number
  durationSec: number
}

export function overallTotals(workouts: Workout[]): Totals {
  return workouts.reduce<Totals>(
    (acc, w) => ({
      workouts: acc.workouts + 1,
      volumeKg: acc.volumeKg + w.totalVolumeKg,
      sets: acc.sets + w.totalSets,
      reps: acc.reps + w.totalReps,
      durationSec: acc.durationSec + elapsedSeconds(w),
    }),
    { workouts: 0, volumeKg: 0, sets: 0, reps: 0, durationSec: 0 },
  )
}

/**
 * Round numbers worth a moment of their own even when a session sets no PR —
 * most training days don't. 1st/10th/25th/50th round out the early stretch
 * where every session still feels new, then every 100th keeps marking
 * progress without the list growing without bound.
 */
export function isMilestoneWorkoutCount(n: number): boolean {
  if (n === 1 || n === 10 || n === 25 || n === 50) return true
  return n >= 100 && n % 100 === 0
}

export interface Streaks {
  /** Consecutive weeks with at least one workout, counting back from this week. */
  currentWeeks: number
  longestWeeks: number
  /** Distinct days trained in the last 7 days. */
  daysThisWeek: number
}

/**
 * Streaks are measured in weeks, not days: nobody trains 7 days a week, so a
 * day-based streak would read as permanently broken.
 */
export function computeStreaks(workouts: Workout[], firstDayOfWeek: 0 | 1, now = Date.now()): Streaks {
  if (workouts.length === 0) return { currentWeeks: 0, longestWeeks: 0, daysThisWeek: 0 }

  const weeks = new Set(workouts.map((w) => startOfWeek(w.startedAt, firstDayOfWeek)))
  const sorted = [...weeks].sort((a, b) => a - b)
  const WEEK_MS = 7 * DAY_MS

  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] - sorted[i - 1] === WEEK_MS ? run + 1 : 1
    if (run > longest) longest = run
  }

  // Count back from the current week; allow the streak to be "alive" if the
  // user has trained last week but not yet this one.
  const thisWeek = startOfWeek(now, firstDayOfWeek)
  let current = 0
  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - WEEK_MS
  while (weeks.has(cursor)) {
    current += 1
    cursor -= WEEK_MS
  }

  const weekAgo = now - 7 * DAY_MS
  const daysThisWeek = new Set(
    workouts.filter((w) => w.startedAt >= weekAgo).map((w) => startOfDay(w.startedAt)),
  ).size

  return { currentWeeks: current, longestWeeks: longest, daysThisWeek }
}

export interface WeekPoint {
  weekStart: number
  volumeKg: number
  workouts: number
  sets: number
}

/** One entry per week in the range, including weeks with no training. */
export function volumeByWeek(
  workouts: Workout[],
  firstDayOfWeek: 0 | 1,
  weeks = 12,
  now = Date.now(),
): WeekPoint[] {
  const WEEK_MS = 7 * DAY_MS
  const thisWeek = startOfWeek(now, firstDayOfWeek)
  const buckets = new Map<number, WeekPoint>()
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = thisWeek - i * WEEK_MS
    buckets.set(weekStart, { weekStart, volumeKg: 0, workouts: 0, sets: 0 })
  }
  for (const w of workouts) {
    const key = startOfWeek(w.startedAt, firstDayOfWeek)
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.volumeKg += w.totalVolumeKg
    bucket.workouts += 1
    bucket.sets += w.totalSets
  }
  return [...buckets.values()]
}

export interface DayPoint {
  day: number
  volumeKg: number
  workouts: number
}

/** Daily buckets for the calendar heatmap, oldest first. */
export function volumeByDay(workouts: Workout[], days = 119, now = Date.now()): DayPoint[] {
  const today = startOfDay(now)
  const buckets = new Map<number, DayPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * DAY_MS
    buckets.set(day, { day, volumeKg: 0, workouts: 0 })
  }
  for (const w of workouts) {
    const bucket = buckets.get(startOfDay(w.startedAt))
    if (!bucket) continue
    bucket.volumeKg += w.totalVolumeKg
    bucket.workouts += 1
  }
  return [...buckets.values()]
}

export interface MuscleSlice {
  muscle: MuscleGroup
  sets: number
  volumeKg: number
}

/**
 * Attributes each set to its exercise's primary muscle group.
 * Secondary muscles are deliberately excluded — splitting a set fractionally
 * across muscles invents precision the data doesn't have.
 */
export function muscleDistribution(
  workouts: Workout[],
  exerciseById: Map<string, Exercise>,
  bodyweightKg: number | null,
  countWarmups = false,
): MuscleSlice[] {
  const map = new Map<MuscleGroup, MuscleSlice>()
  for (const w of workouts) {
    for (const le of w.exercises) {
      const exercise = exerciseById.get(le.exerciseId)
      if (!exercise) continue
      for (const s of le.sets) {
        if (!countsTowardVolume(s, countWarmups)) continue
        const slice =
          map.get(exercise.muscleGroup) ??
          { muscle: exercise.muscleGroup, sets: 0, volumeKg: 0 }
        slice.sets += 1
        if (s.reps) {
          slice.volumeKg += effectiveWeightKg(s, exercise.kind, w.bodyweightKg ?? bodyweightKg) * s.reps
        }
        map.set(exercise.muscleGroup, slice)
      }
    }
  }
  return [...map.values()].sort((a, b) => b.sets - a.sets)
}

export type ProgressMetric = 'heaviest' | 'oneRm' | 'volume' | 'reps' | 'duration' | 'distance'

export const PROGRESS_METRIC_LABEL: Record<ProgressMetric, string> = {
  heaviest: 'Heaviest weight',
  oneRm: 'Estimated 1RM',
  volume: 'Session volume',
  reps: 'Total reps',
  duration: 'Best time',
  distance: 'Best distance',
}

/** Chip labels. The card title carries the full name, so the chip needn't. */
export const PROGRESS_METRIC_SHORT: Record<ProgressMetric, string> = {
  heaviest: 'Heaviest',
  oneRm: 'Est. 1RM',
  volume: 'Volume',
  reps: 'Reps',
  duration: 'Time',
  distance: 'Distance',
}

/**
 * Only the metrics an exercise actually records, in the order they matter.
 * Mirrors `relevantKinds` in ./records: a movement with no measurable load
 * offers no weight, 1RM or volume chart, because the line would plot the
 * user's weigh-ins rather than their training.
 */
export function metricsFor(kind: ExerciseKind): ProgressMetric[] {
  const f = fieldsFor(kind)
  const loadIsMeasurable = f.weight && kind !== 'assisted_bodyweight'
  const metrics: ProgressMetric[] = []
  if (f.distance) metrics.push('distance')
  if (loadIsMeasurable) metrics.push('heaviest')
  if (loadIsMeasurable && f.reps) metrics.push('oneRm', 'volume')
  if (f.duration) metrics.push('duration')
  if (f.reps) metrics.push('reps')
  return metrics
}

export interface ProgressPoint {
  date: number
  value: number
  workoutId: string
}

/**
 * One point per session for a single exercise. Warm-ups are excluded by default
 * so a light warm-up never registers as a drop in performance.
 */
export function exerciseProgress(
  history: { workout: Workout; logged: { sets: Workout['exercises'][number]['sets'] } }[],
  exercise: Exercise,
  metric: ProgressMetric,
  bodyweightKg: number | null,
  countWarmups = false,
): ProgressPoint[] {
  const points: ProgressPoint[] = []
  for (const { workout, logged } of history) {
    const sets = logged.sets.filter((s) => countsTowardVolume(s, countWarmups))
    if (sets.length === 0) continue

    let value = 0
    for (const s of sets) {
      const load = effectiveWeightKg(s, exercise.kind, workout.bodyweightKg ?? bodyweightKg)
      switch (metric) {
        case 'heaviest':
          // Loaded weight, matching the heaviest-weight record, so the chart and
          // the PR badge cannot disagree about what the heaviest set was.
          value = Math.max(value, prWeightKg(s, exercise.kind))
          break
        case 'oneRm':
          if (s.reps) value = Math.max(value, estimate1RM(load, s.reps))
          break
        case 'volume':
          if (s.reps) value += load * s.reps
          break
        case 'reps':
          value += s.reps ?? 0
          break
        case 'duration':
          value = Math.max(value, s.durationSec ?? 0)
          break
        case 'distance':
          value = Math.max(value, s.distanceM ?? 0)
          break
      }
    }
    if (value > 0) {
      points.push({ date: workout.finishedAt ?? workout.startedAt, value, workoutId: workout.id })
    }
  }
  // History arrives newest-first; charts read left-to-right in time.
  return points.sort((a, b) => a.date - b.date)
}

export const TIME_RANGES = [
  { key: '3m', label: '3M', days: 90 },
  { key: '6m', label: '6M', days: 180 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All', days: Infinity },
] as const

export type TimeRangeKey = (typeof TIME_RANGES)[number]['key']

export function withinRange<T extends { date: number }>(
  points: T[],
  range: TimeRangeKey,
  now = Date.now(),
): T[] {
  const spec = TIME_RANGES.find((r) => r.key === range)
  if (!spec || spec.days === Infinity) return points
  const cutoff = now - spec.days * DAY_MS
  return points.filter((p) => p.date >= cutoff)
}
