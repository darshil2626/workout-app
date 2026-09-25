import Dexie, { type EntityTable } from 'dexie'
import type {
  Exercise,
  Folder,
  Measurement,
  MuscleGroup,
  Routine,
  RoutineExercise,
  RoutineSetTarget,
  Settings,
  Workout,
} from './types'
import { SEED_EXERCISES, SEED_VERSION } from './seed'

/** Internal bookkeeping that is not user-facing configuration. */
interface MetaRow {
  key: string
  value: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  weightUnit: 'kg',
  distanceUnit: 'km',
  lengthUnit: 'cm',
  measurementWeightUnit: null,
  defaultRestSeconds: 90,
  restTimerEnabled: true,
  restTimerSound: true,
  restTimerVibrate: true,
  autoStartRestTimer: true,
  barWeightKg: 20,
  availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  firstDayOfWeek: 1,
  weightStepKg: 2.5,
  countWarmupSets: false,
  bodyweightKg: null,
  // Three, not four: most beginner programmes are three days a week, and the
  // home screen explains where the number comes from and offers one drawn
  // from your own history once there is enough of it.
  weeklyGoalWorkouts: 3,
  // Follows the OS by default rather than staying pinned to the dark palette
  // this app shipped with until now — an install on a light-mode device will
  // see that the moment this build lands, before ever opening Settings.
  theme: 'system',
  analyticsEnabled: true,
}

class IronLogDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  routines!: EntityTable<Routine, 'id'>
  folders!: EntityTable<Folder, 'id'>
  settings!: EntityTable<Settings, 'id'>
  measurements!: EntityTable<Measurement, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor() {
    super('ironlog')
    this.version(1).stores({
      exercises: 'id, name, muscleGroup, equipment, isCustom, archived',
      // `*exerciseIds` is a multi-entry index: one query finds every session
      // containing a given exercise, which powers "previous" values and PRs.
      workouts: 'id, status, startedAt, finishedAt, routineId, *exerciseIds',
      routines: 'id, name, folderId, order, updatedAt',
      folders: 'id, name, order',
      settings: 'id',
    })
    // v2 adds body measurements. Dexie carries existing stores forward, so
    // upgrading an installed app keeps every logged workout.
    this.version(2).stores({
      measurements: 'id, type, takenAt, [type+takenAt]',
    })
    // v3 records which seed revision this device has applied.
    this.version(3).stores({
      meta: 'key',
    })
  }
}

export const db = new IronLogDB()

function sameGroups(a: MuscleGroup[] = [], b: MuscleGroup[] = []): boolean {
  return a.length === b.length && a.every((g, i) => g === b[i])
}

/** Whether a stored row still matches the definition this build ships. */
function matchesSeed(stored: Exercise, seed: Exercise): boolean {
  return (
    stored.name === seed.name &&
    stored.muscleGroup === seed.muscleGroup &&
    stored.equipment === seed.equipment &&
    stored.kind === seed.kind &&
    sameGroups(stored.secondaryMuscles, seed.secondaryMuscles)
  )
}

/** Idempotent: seeds built-in exercises and settings, preserving user edits. */
export async function initDb(): Promise<void> {
  await db.transaction('rw', db.exercises, db.settings, db.meta, db.routines, db.workouts, async () => {
    const existing = await db.settings.get(1)
    if (!existing) {
      await db.settings.put(DEFAULT_SETTINGS)
    } else {
      // Backfill keys added by later app versions without clobbering choices.
      await db.settings.put({ ...DEFAULT_SETTINGS, ...existing })
    }

    const seededIds = SEED_EXERCISES.map((e) => e.id)
    const present = await db.exercises.bulkGet(seededIds)
    const missing = SEED_EXERCISES.filter((_, i) => present[i] === undefined)
    if (missing.length > 0) await db.exercises.bulkAdd(missing)

    // One-shot: give a brand-new install a real routine to tap into instead of
    // an empty list, without ever re-adding it after the user deletes it or
    // clears their history. Gated on both counts being zero (not just the
    // flag) so an existing user upgrading into this build — who already has
    // routines or workouts — never has one appended to their list.
    const starterSeeded = (await db.meta.get('starterRoutineSeeded'))?.value ?? 0
    if (starterSeeded === 0) {
      const [routineCount, workoutCount] = await Promise.all([
        db.routines.count(),
        db.workouts.count(),
      ])
      if (routineCount === 0 && workoutCount === 0) {
        await db.routines.add(buildStarterRoutine())
      }
      await db.meta.put({ key: 'starterRoutineSeeded', value: 1 })
    }

    // Rows already on the device are otherwise frozen at whatever the build
    // that first seeded them said, so corrections to a built-in definition
    // never reach an installed copy. Re-apply them when SEED_VERSION moves.
    const applied = (await db.meta.get('seedVersion'))?.value ?? 0
    if (applied >= SEED_VERSION) return

    const changed: Exercise[] = []
    SEED_EXERCISES.forEach((seed, i) => {
      const stored = present[i]
      // Freshly inserted above, or the user's own wording: leave it alone.
      if (!stored || stored.userEdited || matchesSeed(stored, seed)) return

      if (applied === 0) {
        // First run under versioned seeding, so there is no baseline to
        // compare against: a row that already diverges was either edited here
        // before `userEdited` existed or corrected by an older build. The
        // stored copy wins, and marking it keeps later bumps off it.
        changed.push({ ...stored, userEdited: true })
        return
      }
      // Definition fields come from the seed; everything the user owns stays.
      changed.push({
        ...seed,
        notes: stored.notes,
        archived: stored.archived,
        createdAt: stored.createdAt,
      })
    })

    if (changed.length > 0) await db.exercises.bulkPut(changed)
    await db.meta.put({ key: 'seedVersion', value: SEED_VERSION })
  })
}

/** A routine set target with no weight/reps opinion — shown as a blank field with a placeholder. */
function target(reps: number | null): RoutineSetTarget {
  return { weight: null, reps, durationSec: null, distanceM: null, setType: 'normal' }
}

function routineExercise(exerciseId: string, sets: RoutineSetTarget[]): RoutineExercise {
  return { id: newId(), exerciseId, restSeconds: null, supersetGroup: null, sets }
}

/**
 * A basic full-body routine built from five barbell compounds already in
 * SEED_EXERCISES, so a brand-new install has something real to tap into
 * instead of an empty routines list. Every target is a rep count only — no
 * weight — so the very first set of a first-ever session needs nothing typed
 * in before it can be checked off; SetRow's check button never requires a
 * filled field regardless, but leaving weight blank also means the user
 * isn't asked to guess a number before they've touched a bar.
 */
function buildStarterRoutine(): Routine {
  const now = Date.now()
  return {
    id: newId(),
    name: 'Full Body Starter',
    folderId: null,
    order: 0,
    createdAt: now,
    updatedAt: now,
    lastPerformedAt: null,
    exercises: [
      routineExercise('squat-barbell', [target(8), target(8), target(8)]),
      routineExercise('bench-press-barbell', [target(8), target(8), target(8)]),
      routineExercise('bent-over-row-barbell', [target(8), target(8), target(8)]),
      routineExercise('overhead-press-barbell', [target(8), target(8), target(8)]),
      routineExercise('deadlift-barbell', [target(5), target(5)]),
    ],
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
