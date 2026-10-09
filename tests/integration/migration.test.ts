import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb, DEFAULT_SETTINGS } from '../../src/db/db'
import { migrateLegacyDatabase, migrateLegacyStorage } from '../../src/db/legacyMigration'
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
async function makeOld(version: 1 | 2): Promise<void> {
  db.close()
  await db.delete()
  const raw = new Dexie('trana')
  raw.version(1).stores(V1_STORES)
  if (version === 2) raw.version(2).stores(V2_STORES)
  await raw.open()
  await raw.table('exercises').bulkPut([exA])
  await raw.table('workouts').bulkPut([w1, w2])
  await raw.table('routines').put(routine)
  await raw.table('folders').put({ id: 'f1', name: 'Upper', order: 0, createdAt: 3 })
  await raw.table('settings').put(oldSettings)
  if (version === 2) {
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
    expect(db.verno).toBe(3)
    expect(await db.exercises.get('my-custom')).toEqual(exA)
    expect(await db.workouts.get('w1')).toEqual(w1)
    expect(await db.workouts.get('w2')).toEqual(w2)
    expect(await db.routines.get('r1')).toEqual(routine)
    expect(await db.folders.get('f1')).toEqual({ id: 'f1', name: 'Upper', order: 0, createdAt: 3 })
    expect(await db.settings.get(1)).toEqual(oldSettings)
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

describe('legacy ironlog database carry-over', () => {
  async function makeIronlog(): Promise<void> {
    const old = new Dexie('ironlog')
    old.version(1).stores(V1_STORES)
    old.version(2).stores(V2_STORES)
    await old.open()
    await old.table('exercises').put(exA)
    await old.table('workouts').bulkPut([w1, w2])
    await old.table('routines').put(routine)
    await old.table('settings').put({ ...DEFAULT_SETTINGS, weightUnit: 'lb' })
    await old.table('measurements').put({ id: 'm1', type: 'bodyweight', value: 80, takenAt: 1 })
    old.close()
  }

  it('does nothing when there is no old database', async () => {
    await initDb()
    const before = await db.workouts.count()
    await migrateLegacyDatabase(db)
    expect(await db.workouts.count()).toBe(before)
    expect(await db.meta.get('legacyMigrated')).toBeUndefined()
  })

  it('copies every shared table, old rows win over seeds, flag set, old db removed', async () => {
    await makeIronlog()
    await initDb() // new install seeded first, as on launch
    await migrateLegacyDatabase(db)
    expect(await db.workouts.count()).toBe(2)
    expect(await db.workouts.get('w1')).toEqual(w1)
    expect(await db.exercises.get('my-custom')).toEqual(exA)
    expect((await db.settings.get(1))?.weightUnit).toBe('lb')
    expect(await db.measurements.count()).toBe(1)
    expect(await db.routines.get('r1')).toEqual(routine)
    expect((await db.meta.get('legacyMigrated'))?.value).toBe(1)
    expect(await Dexie.exists('ironlog')).toBe(false)
  })

  it('does not re-merge an old database that reappears after the flag is set', async () => {
    await makeIronlog()
    await initDb()
    await migrateLegacyDatabase(db)
    await db.workouts.delete('w1') // user edit after migration
    await makeIronlog() // old db somehow still/again present
    await migrateLegacyDatabase(db)
    expect(await db.workouts.get('w1')).toBeUndefined()
    expect(await Dexie.exists('ironlog')).toBe(false)
  })

  it('migrateLegacyStorage moves localStorage keys without overwriting newer values', () => {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    store.set('ironlog.restTimer', 'old')
    store.set('ironlog.setTimer', 'oldset')
    store.set('trana.setTimer', 'new')
    migrateLegacyStorage()
    expect(store.get('trana.restTimer')).toBe('old')
    expect(store.get('trana.setTimer')).toBe('new')
    expect(store.has('ironlog.restTimer')).toBe(false)
    expect(store.has('ironlog.setTimer')).toBe(false)
    delete (globalThis as { localStorage?: unknown }).localStorage
  })
})
