import { db } from '../db/db'
import type { Exercise, LoggedExercise, LoggedSet, Workout } from '../db/types'
import { computeTotals, hasLoggedValue } from './workout'

/**
 * Identity for an imported workout. CSV imports mint a fresh uuid every time a
 * file is parsed, so the stored `id` can never tell us whether a session is
 * already on the device — the data itself has to.
 *
 * A session is "the same" when it started at the same instant and the same work
 * was logged. Name, notes, finish time, RPE, set type and row ids are left out:
 * those drift between export variants and would make a re-import look new. Sets
 * that record nothing are ignored too, so a copy imported before placeholder
 * rows were filtered still matches the same session imported cleanly.
 */

/** Rounded so a lb→kg conversion landing on a float still matches itself. */
function num(v: number | null): string {
  return v === null ? '' : String(Math.round(v * 1000) / 1000)
}

function setSig(s: LoggedSet): string {
  return `${num(s.weight)}:${num(s.reps)}:${num(s.durationSec)}:${num(s.distanceM)}`
}

/** Null for an exercise that records nothing, so it drops out of the fingerprint. */
function exerciseSig(e: LoggedExercise): string | null {
  const sets = e.sets.filter(hasLoggedValue)
  if (sets.length === 0) return null
  return `${e.exerciseId}=${sets.map(setSig).join(',')}`
}

/** startedAt plus the sorted per-exercise signatures, so exercise order doesn't matter. */
export function workoutFingerprint(w: Workout): string {
  const parts = w.exercises
    .map(exerciseSig)
    .filter((s): s is string => s !== null)
    .sort()
  return `${w.startedAt}|${parts.join(';')}`
}

export interface ImportPartition {
  /** Workouts not already on the device — these get inserted. */
  fresh: Workout[]
  /** Workouts already present (or repeated within the file itself) — skipped. */
  duplicates: Workout[]
  /**
   * Workouts sharing a start time with an existing session but logging different
   * sets. They are added as new; the count exists so the UI can say so up front.
   */
  sameTimeDifferent: number
}

/**
 * Splits parsed workouts into the ones worth inserting and the ones already
 * stored. Only rows sharing a start time are loaded, via the `startedAt` index.
 */
export async function partitionImport(workouts: Workout[]): Promise<ImportPartition> {
  if (workouts.length === 0) return { fresh: [], duplicates: [], sameTimeDifferent: 0 }

  const startTimes = Array.from(new Set(workouts.map((w) => w.startedAt)))
  const candidates = await db.workouts.where('startedAt').anyOf(startTimes).toArray()

  const existingPrints = new Set(candidates.map(workoutFingerprint))
  const existingTimes = new Set(candidates.map((w) => w.startedAt))

  const fresh: Workout[] = []
  const duplicates: Workout[] = []
  let sameTimeDifferent = 0
  // Seeded from the file itself too, so concatenated exports don't duplicate internally.
  const seen = new Set<string>()

  for (const w of workouts) {
    const print = workoutFingerprint(w)
    if (existingPrints.has(print) || seen.has(print)) {
      duplicates.push(w)
      continue
    }
    seen.add(print)
    if (existingTimes.has(w.startedAt)) sameTimeDifferent++
    fresh.push(w)
  }

  return { fresh, duplicates, sameTimeDifferent }
}

export interface HistoryIssues {
  /** Stored workouts holding sets that record nothing. */
  placeholderSets: number
  /** Stored workouts that record nothing at all once those sets are dropped. */
  emptyWorkouts: number
  /** Extra copies of a session that is stored more than once. */
  duplicates: number
}

export function hasHistoryIssues(issues: HistoryIssues): boolean {
  return issues.placeholderSets > 0 || issues.emptyWorkouts > 0 || issues.duplicates > 0
}

function countSets(exercises: LoggedExercise[]): number {
  return exercises.reduce((n, le) => n + le.sets.length, 0)
}

/** Drops sets that record nothing, and exercises left with none. */
function stripPlaceholders(w: Workout): { exercises: LoggedExercise[]; changed: boolean } {
  const exercises = w.exercises
    .map((le) => (le.sets.every(hasLoggedValue) ? le : { ...le, sets: le.sets.filter(hasLoggedValue) }))
    .filter((le) => le.sets.length > 0)
  const changed =
    exercises.length !== w.exercises.length || countSets(exercises) !== countSets(w.exercises)
  return { exercises, changed }
}

interface RepairPlan {
  put: Workout[]
  remove: string[]
  issues: HistoryIssues
}

/**
 * Works out what cleaning the stored history would change, without touching it.
 * Both the scan and the repair run this, so the preview and the result agree.
 */
function planRepair(
  workouts: Workout[],
  exerciseById: Map<string, Exercise>,
  defaultBodyweightKg: number | null,
  countWarmups: boolean,
): RepairPlan {
  // Cleanest copy first, then by id, so the same copy survives on every run and
  // the one carrying placeholder rows is the one that goes.
  const ordered = [...workouts].sort(
    (a, b) => countSets(a.exercises) - countSets(b.exercises) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

  const put: Workout[] = []
  const remove: string[] = []
  const survivors = new Set<string>()
  const issues: HistoryIssues = { placeholderSets: 0, emptyWorkouts: 0, duplicates: 0 }

  for (const w of ordered) {
    const { exercises, changed } = stripPlaceholders(w)
    if (exercises.length === 0) {
      remove.push(w.id)
      issues.emptyWorkouts++
      continue
    }

    const print = workoutFingerprint(w)
    if (survivors.has(print)) {
      remove.push(w.id)
      issues.duplicates++
      continue
    }
    survivors.add(print)

    if (!changed) continue
    issues.placeholderSets++
    const totals = computeTotals(
      exercises,
      exerciseById,
      w.bodyweightKg ?? defaultBodyweightKg,
      countWarmups,
    )
    put.push({
      ...w,
      exercises,
      exerciseIds: Array.from(new Set(exercises.map((le) => le.exerciseId))),
      totalVolumeKg: totals.totalVolumeKg,
      totalSets: totals.totalSets,
      totalReps: totals.totalReps,
    })
  }

  return { put, remove, issues }
}

async function loadForRepair(): Promise<RepairPlan> {
  const [workouts, exercises, settings] = await Promise.all([
    db.workouts.where('status').equals('done').toArray(),
    db.exercises.toArray(),
    db.settings.get(1),
  ])
  const exerciseById = new Map(exercises.map((e) => [e.id, e] as const))
  return planRepair(
    workouts,
    exerciseById,
    settings?.bodyweightKg ?? null,
    settings?.countWarmupSets ?? false,
  )
}

/**
 * Rewrites every stored session's cached totals. Needed when a setting that
 * feeds those totals changes — the warm-up rule, or a corrected bodyweight —
 * since history lists read the cached numbers rather than recomputing.
 */
export async function recomputeAllWorkoutTotals(): Promise<number> {
  return db.transaction('rw', [db.workouts, db.exercises, db.settings], async () => {
    const [workouts, exercises, settings] = await Promise.all([
      db.workouts.where('status').equals('done').toArray(),
      db.exercises.toArray(),
      db.settings.get(1),
    ])
    const exerciseById = new Map(exercises.map((e) => [e.id, e] as const))
    const countWarmups = settings?.countWarmupSets ?? false
    const fallbackBodyweightKg = settings?.bodyweightKg ?? null

    const changed: Workout[] = []
    for (const w of workouts) {
      const totals = computeTotals(
        w.exercises,
        exerciseById,
        w.bodyweightKg ?? fallbackBodyweightKg,
        countWarmups,
      )
      if (
        totals.totalVolumeKg === w.totalVolumeKg &&
        totals.totalSets === w.totalSets &&
        totals.totalReps === w.totalReps
      ) {
        continue
      }
      changed.push({
        ...w,
        totalVolumeKg: totals.totalVolumeKg,
        totalSets: totals.totalSets,
        totalReps: totals.totalReps,
      })
    }
    if (changed.length > 0) await db.workouts.bulkPut(changed)
    return changed.length
  })
}

/** What cleaning the history would do. Reads only. */
export async function scanHistoryIssues(): Promise<HistoryIssues> {
  return (await loadForRepair()).issues
}

/**
 * Removes duplicate sessions and the placeholder sets CSV imports used to keep,
 * recomputing cached totals for anything it rewrites. Returns what it changed.
 */
export async function repairHistory(): Promise<HistoryIssues> {
  return db.transaction('rw', [db.workouts, db.exercises, db.settings], async () => {
    const { put, remove, issues } = await loadForRepair()
    if (put.length > 0) await db.workouts.bulkPut(put)
    if (remove.length > 0) await db.workouts.bulkDelete(remove)
    return issues
  })
}
