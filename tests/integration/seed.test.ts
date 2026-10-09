import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb, DEFAULT_SETTINGS } from '../../src/db/db'
import { SEED_EXERCISES, SEED_VERSION } from '../../src/db/seed'
import { wipeAllData } from '../../src/lib/backup'
import { customExercise, logged, resetDb, set, snapshot, workout } from './helpers'

beforeEach(resetDb)

describe('initDb', () => {
  it('fresh install: seeds exercises, settings, one starter routine, meta flags', async () => {
    await initDb()
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
    expect(await db.settings.get(1)).toEqual(DEFAULT_SETTINGS)
    const routines = await db.routines.toArray()
    expect(routines).toHaveLength(1)
    expect(routines[0].name).toBe('Full Body Starter')
    const ids = new Set(SEED_EXERCISES.map((e) => e.id))
    for (const re of routines[0].exercises) expect(ids.has(re.exerciseId)).toBe(true)
    expect((await db.meta.get('seedVersion'))?.value).toBe(SEED_VERSION)
    expect((await db.meta.get('starterRoutineSeeded'))?.value).toBe(1)
  })

  it('seed ids are unique', () => {
    expect(new Set(SEED_EXERCISES.map((e) => e.id)).size).toBe(SEED_EXERCISES.length)
  })

  it('running twice (or many times) duplicates nothing and changes nothing', async () => {
    await initDb()
    const first = await snapshot()
    const meta = await db.meta.toArray()
    await initDb()
    await Promise.all([initDb(), initDb()])
    expect(await snapshot()).toEqual(first)
    expect(await db.meta.toArray()).toEqual(meta)
    expect(await db.routines.count()).toBe(1)
  })

  it('does not resurrect the starter routine after the user deletes it', async () => {
    await initDb()
    await db.routines.clear()
    await initDb()
    expect(await db.routines.count()).toBe(0)
  })

  it('does not add the starter routine when the user already has workouts', async () => {
    await db.workouts.put(workout({ id: 'w', exercises: [logged('squat-barbell', [set()])] }))
    await initDb()
    expect(await db.routines.count()).toBe(0)
  })

  it('re-inserts a deleted built-in exercise but preserves custom ones and settings choices', async () => {
    await initDb()
    await db.exercises.delete('squat-barbell')
    await db.exercises.put(customExercise({ id: 'mine', name: 'Mine' }))
    await db.settings.update(1, { weightUnit: 'lb', theme: 'dark' })
    await initDb()
    expect(await db.exercises.get('squat-barbell')).toBeTruthy()
    expect(await db.exercises.get('mine')).toBeTruthy()
    expect(await db.settings.get(1)).toMatchObject({ weightUnit: 'lb', theme: 'dark' })
  })

  it('backfills settings keys missing from an older settings row', async () => {
    await db.settings.put({ id: 1, weightUnit: 'lb' } as never)
    await initDb()
    expect(await db.settings.get(1)).toEqual({ ...DEFAULT_SETTINGS, weightUnit: 'lb' })
  })

  describe('SEED_VERSION bumps', () => {
    const seed = SEED_EXERCISES.find((e) => e.id === 'squat-barbell')!

    it('applies a corrected definition but keeps notes/archived/createdAt', async () => {
      await initDb()
      await db.exercises.put({ ...seed, muscleGroup: 'Chest', notes: 'mine', archived: true, createdAt: 77 })
      await db.meta.put({ key: 'seedVersion', value: SEED_VERSION - 1 })
      await initDb()
      expect(await db.exercises.get(seed.id)).toEqual({ ...seed, notes: 'mine', archived: true, createdAt: 77 })
      expect((await db.meta.get('seedVersion'))?.value).toBe(SEED_VERSION)
    })

    it('leaves userEdited rows alone', async () => {
      await initDb()
      const edited = { ...seed, name: 'My Squat', userEdited: true }
      await db.exercises.put(edited)
      await db.meta.put({ key: 'seedVersion', value: SEED_VERSION - 1 })
      await initDb()
      expect(await db.exercises.get(seed.id)).toEqual(edited)
    })

    it('with no baseline (seedVersion 0) a diverging row is kept and marked userEdited', async () => {
      await initDb()
      await db.exercises.put({ ...seed, name: 'Back Squat Mine' })
      await db.meta.delete('seedVersion')
      await initDb()
      expect(await db.exercises.get(seed.id)).toMatchObject({ name: 'Back Squat Mine', userEdited: true })
    })
  })
})

describe('wipeAllData', () => {
  it('clears every user table, and a following initDb reseeds without a second starter routine', async () => {
    await initDb()
    await db.workouts.put(workout({ id: 'w' }))
    await db.folders.put({ id: 'f', name: 'F', order: 0, createdAt: 1 })
    await db.measurements.put({ id: 'm', type: 'waist', value: 1, takenAt: 1 })
    await wipeAllData()
    for (const [k, v] of Object.entries(await snapshot())) expect(v, k).toHaveLength(0)
    await initDb()
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
    expect(await db.routines.count()).toBe(0) // meta flag survives the wipe, so no starter returns
    expect(await db.settings.get(1)).toEqual(DEFAULT_SETTINGS)
  })
})
