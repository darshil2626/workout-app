import Dexie, { type EntityTable } from 'dexie'
import type { Exercise, Folder, Measurement, Routine, Settings, Workout } from './types'
import { SEED_EXERCISES } from './seed'

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  weightUnit: 'kg',
  distanceUnit: 'km',
  lengthUnit: 'cm',
  defaultRestSeconds: 90,
  restTimerEnabled: true,
  restTimerSound: true,
  restTimerVibrate: true,
  autoStartRestTimer: true,
  barWeightKg: 20,
  availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  firstDayOfWeek: 1,
  weightStepKg: 2.5,
  bodyweightKg: null,
}

class IronLogDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  routines!: EntityTable<Routine, 'id'>
  folders!: EntityTable<Folder, 'id'>
  settings!: EntityTable<Settings, 'id'>
  measurements!: EntityTable<Measurement, 'id'>

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
  }
}

export const db = new IronLogDB()

/** Idempotent: seeds built-in exercises and settings, preserving user edits. */
export async function initDb(): Promise<void> {
  await db.transaction('rw', db.exercises, db.settings, async () => {
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
  })
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
