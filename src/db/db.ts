import Dexie, { type EntityTable } from 'dexie'
import type {
  Exercise,
  Folder,
  Measurement,
  MuscleGroup,
  Routine,
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
  await db.transaction('rw', db.exercises, db.settings, db.meta, async () => {
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

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
