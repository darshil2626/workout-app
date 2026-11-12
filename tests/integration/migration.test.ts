import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, initDb, DEFAULT_SETTINGS } from '../../src/db/db'
import { SEED_EXERCISES } from '../../src/db/seed'
import { logged, resetDb, set, workout } from './helpers'
import type { Exercise, Measurement, Routine, Settings, Workout } from '../../src/db/types'

const V1_STORES = {
  exercises: 'id, name, muscleGroup, equipment, isCustom, archived',
  workouts: 'id, status, startedAt, finishedAt, routineId, *exerciseIds',
  routines: 'id, name, folderId, order, updatedAt',
  folders: 'id, name, order',
  settings: 'id',
}
const V2_STORES = { measurements: 'id, type, takenAt, [type+takenAt]' }
const V3_STORES = { meta: 'key' }
const V4_STORES = { snapshots: 'id' }

const exA: Exercise = {
  id: 'my-custom',
  name: 'Zercher Squat',
  muscleGroup: 'Quadriceps',
  equipment: 'Barbell',
  kind: 'weight_reps',
  isCustom: true,
  createdAt: 5,
  notes: 'keep elbows tight',
}
const w1: Workout = workout({
  id: 'w1',
  name: 'Legs',
  startedAt: 1_700_000_000_000,
  exercises: [
    logged('my-custom', [set({ weight: 80, reps: 8 })]),
    logged('squat-barbell', [set({ weight: 100, reps: 5 })]),
  ],
  totalVolumeKg: 1140,
  totalSets: 2,
  totalReps: 13,
})
const w2: Workout = workout({
  id: 'w2',
  name: 'Push',
  startedAt: 1_700_100_000_000,
  routineId: 'r1',
  exercises: [logged('bench-press-barbell', [set({ weight: 60, reps: 10 })])],
})
const routine: Routine = {
  id: 'r1',
  name: 'Push',
  folderId: 'f1',
  order: 2,
  createdAt: 1,
  updatedAt: 9,
  exercises: [
    {
      id: 're1',
      exerciseId: 'bench-press-barbell',
      supersetGroup: null,
      sets: [{ weight: null, reps: 8, durationSec: null, distanceM: null, setType: 'normal' }],
    },
  ],
}
const oldSettings = { id: 1, weightUnit: 'lb', distanceUnit: 'mi', defaultRestSeconds: 120 }

/** Closes the app db, wipes it, and builds a raw database of an older schema under the same name. */
async function makeOld(version: 1 | 2 | 3 | 4): Promise<void> {
  db.close()
  await db.delete()
  const raw = new Dexie('trana')
  raw.version(1).stores(V1_STORES)
  if (version >= 2) raw.version(2).stores(V2_STORES)
  if (version >= 3) raw.version(3).stores(V3_STORES)
  if (version >= 4) raw.version(4).stores(V4_STORES)
  await raw.open()
  await raw.table('exercises').bulkPut([exA])
  await raw.table('workouts').bulkPut([w1, w2])
  await raw.table('routines').put(routine)
  await raw.table('folders').put({ id: 'f1', name: 'Upper', order: 0, createdAt: 3 })
  await raw.table('settings').put(oldSettings)
  if (version >= 2) {
    const ms: Measurement[] = [
      { id: 'm1', type: 'bodyweight', value: 80, takenAt: 100 },
      { id: 'm2', type: 'bodyweight', value: 79, takenAt: 200 },
      { id: 'm3', type: 'waist', value: 85, takenAt: 150, notes: 'x' },
    ]
    await raw.table('measurements').bulkPut(ms)
  }
  raw.close()
}

beforeEach(resetDb)

describe('schema upgrades keep installed data', () => {
  it('v1 -> current: every row survives unchanged and indexes work', async () => {
    await makeOld(1)
    await db.open()
    expect(db.verno).toBe(5)
    expect(await db.exercises.get('my-custom')).toEqual(exA)
    expect(await db.workouts.get('w1')).toEqual(w1)
    expect(await db.workouts.get('w2')).toEqual(w2)
    expect(await db.routines.get('r1')).toEqual(routine)
    expect(await db.folders.get('f1')).toEqual({ id: 'f1', name: 'Upper', order: 0, createdAt: 3 })
    // v5 adds `trainingDays: []` to the settings row and changes nothing else.
    expect(await db.settings.get(1)).toEqual({ ...oldSettings, trainingDays: [] })
    // New tables exist and are empty.
    expect(await db.measurements.count()).toBe(0)
    expect(await db.meta.count()).toBe(0)
    // Multi-entry and plain indexes still resolve.
    expect((await db.workouts.where('exerciseIds').equals('my-custom').toArray()).map((w) => w.id)).toEqual(['w1'])
    expect((await db.workouts.where('routineId').equals('r1').toArray()).map((w) => w.id)).toEqual(['w2'])
    expect(await db.workouts.where('status').equals('done').count()).toBe(2)
    expect((await db.workouts.where('startedAt').equals(1_700_100_000_000).toArray()).map((w) => w.id)).toEqual(['w2'])
    expect((await db.exercises.where('muscleGroup').equals('Quadriceps').toArray()).map((e) => e.id)).toEqual([
      'my-custom',
    ])
  })

  it('v3 -> current: gains an empty snapshots table and keeps everything else', async () => {
    await makeOld(3)
    await db.open()
    expect(db.verno).toBe(5)
    expect(await db.snapshots.count()).toBe(0)
    expect(await db.workouts.count()).toBe(2)
    expect(await db.measurements.count()).toBe(3)
    expect(await db.exercises.get('my-custom')).toEqual(exA)
  })

  it('v4 -> current: the settings row gains an empty trainingDays and loses nothing', async () => {
    db.close()
    await db.delete()
    const raw = new Dexie('trana')
    raw.version(1).stores(V1_STORES)
    raw.version(2).stores(V2_STORES)
    raw.version(3).stores(V3_STORES)
    raw.version(4).stores(V4_STORES)
    await raw.open()
    // A full row as the v4 build wrote it: every field a person may have chosen.
    const { trainingDays: _absent, ...v4Settings } = {
      ...DEFAULT_SETTINGS,
      weightUnit: 'lb' as const,
      weeklyGoalWorkouts: 5,
      firstDayOfWeek: 0 as const,
      bodyweightKg: 82.5,
      analyticsEnabled: true,
      analyticsConsentAt: 1_700_000_000_000,
    }
    await raw.table('settings').put(v4Settings)
    await raw.table('workouts').bulkPut([w1, w2])
    await raw.table('snapshots').put({ id: 'pre-restore', createdAt: 7, backup: { app: 'trana' } })
    raw.close()

    await db.open()
    expect(db.verno).toBe(5)
    expect(await db.settings.get(1)).toEqual({ ...v4Settings, trainingDays: [] })
    expect(await db.workouts.get('w1')).toEqual(w1)
    expect(await db.snapshots.count()).toBe(1)
    // And starting the app on top keeps it that way.
    await initDb()
    expect(await db.settings.get(1)).toEqual({ ...v4Settings, trainingDays: [] })
  })

  it('v5 upgrade leaves an already-present trainingDays alone', async () => {
    await makeOld(4)
    const raw = new Dexie('trana')
    raw.version(4).stores({ ...V1_STORES, ...V2_STORES, ...V3_STORES, ...V4_STORES })
    await raw.open()
    await raw.table('settings').put({ ...oldSettings, trainingDays: [1, 3, 5] })
    raw.close()
    await db.open()
    expect((await db.settings.get(1))?.trainingDays).toEqual([1, 3, 5])
  })

  it('v2 -> current: measurements and compound index survive', async () => {
    await makeOld(2)
    await db.open()
    expect(await db.measurements.count()).toBe(3)
    const bw = await db.measurements
      .where('[type+takenAt]')
      .between(['bodyweight', 0], ['bodyweight', Dexie.maxKey])
      .toArray()
    expect(bw.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect((await db.measurements.get('m3'))?.notes).toBe('x')
    expect(await db.workouts.count()).toBe(2)
  })

  it('initDb after an upgrade backfills settings without clobbering, adds seeds, and skips the starter routine', async () => {
    await makeOld(2)
    await db.open()
    await initDb()
    const s = (await db.settings.get(1)) as Settings
    expect(s.weightUnit).toBe('lb')
    expect(s.distanceUnit).toBe('mi')
    expect(s.defaultRestSeconds).toBe(120)
    expect(s.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(s.weeklyGoalWorkouts).toBe(DEFAULT_SETTINGS.weeklyGoalWorkouts)
    // Existing user: no starter routine appended, existing routine untouched.
    expect(await db.routines.toArray()).toEqual([routine])
    // Custom exercise untouched; seeds inserted.
    expect(await db.exercises.get('my-custom')).toEqual(exA)
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length + 1)
    expect((await db.meta.get('starterRoutineSeeded'))?.value).toBe(1)
    // Workouts untouched.
    expect(await db.workouts.get('w1')).toEqual(w1)
  })

  it('v1 -> current on a US device: a metric user keeps kg/km/cm, not the locale default', async () => {
    await makeOld(1)
    const raw = new Dexie('trana')
    raw.version(1).stores(V1_STORES)
    await raw.open()
    await raw.table('settings').put({ id: 1, weightUnit: 'kg', distanceUnit: 'km', defaultRestSeconds: 120 })
    raw.close()

    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] })
    try {
      await db.open()
      await initDb()
    } finally {
      vi.unstubAllGlobals()
    }
    const s = (await db.settings.get(1)) as Settings
    expect([s.weightUnit, s.distanceUnit, s.lengthUnit]).toEqual(['kg', 'km', 'cm'])
    expect(s.barWeightKg).toBe(DEFAULT_SETTINGS.barWeightKg)
    expect(s.availablePlatesKg).toEqual(DEFAULT_SETTINGS.availablePlatesKg)
    expect(s.defaultRestSeconds).toBe(120)
  })

  it('a v1 row diverging from its seed keeps the user wording (first versioned seeding)', async () => {
    db.close()
    await db.delete()
    const raw = new Dexie('trana')
    raw.version(1).stores(V1_STORES)
    await raw.open()
    const seed = SEED_EXERCISES[0]
    await raw.table('exercises').put({ ...seed, name: 'My Own Name' })
    raw.close()
    await db.open()
    await initDb()
    const row = (await db.exercises.get(seed.id)) as Exercise
    expect(row.name).toBe('My Own Name')
    expect(row.userEdited).toBe(true)
  })
})
