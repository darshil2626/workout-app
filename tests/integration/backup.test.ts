import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb, DEFAULT_SETTINGS } from '../../src/db/db'
import { SEED_EXERCISES, SEED_VERSION } from '../../src/db/seed'
import {
  APP_MARKER,
  BACKUP_VERSION,
  buildBackup,
  getRestoreSnapshot,
  parseBackup,
  restoreBackup,
  undoRestore,
  wipeAllData,
} from '../../src/lib/backup'
import { detectFormat } from '../../src/lib/importers/detect'
import { logged, readFixture, resetDb, set, snapshot, workout } from './helpers'

beforeEach(resetDb)

async function populate() {
  await initDb()
  await db.exercises.put({
    id: 'c1',
    name: 'Odd Lift',
    muscleGroup: 'Back',
    equipment: 'Cable',
    kind: 'weight_reps',
    isCustom: true,
    createdAt: 11,
    notes: 'n',
    archived: true,
  })
  await db.folders.bulkPut([
    { id: 'f1', name: 'A', order: 0, createdAt: 1 },
    { id: 'f2', name: 'B', order: 1, createdAt: 2 },
  ])
  await db.workouts.bulkPut([
    workout({
      id: 'w1',
      startedAt: 1000,
      exercises: [logged('c1', [set({ weight: 50.5, reps: 7, rpe: 8.5 })])],
      totalVolumeKg: 353.5,
      totalSets: 1,
      totalReps: 7,
      effort: 4,
      feeling: 3,
      notes: 'hi',
    }),
    workout({
      id: 'w2',
      startedAt: 2000,
      status: 'active',
      finishedAt: null,
      exercises: [logged('squat-barbell', [set({ completed: false, weight: null, reps: null })])],
    }),
  ])
  await db.measurements.put({ id: 'm1', type: 'bodyweight', value: 81.2, takenAt: 5 })
  await db.settings.put({ ...DEFAULT_SETTINGS, weightUnit: 'lb', bodyweightKg: 80, availablePlatesKg: [20, 10] })
}

describe('backup round trip', () => {
  it('buildBackup -> wipe -> restore reproduces identical data', async () => {
    await populate()
    const before = await snapshot()
    const backup = await buildBackup()
    expect(backup.app).toBe(APP_MARKER)
    expect(backup.version).toBe(BACKUP_VERSION)
    const text = JSON.stringify(backup)

    await wipeAllData()
    expect(await db.workouts.count()).toBe(0)

    const summary = await restoreBackup(text)
    expect(summary).toEqual({
      exercises: SEED_EXERCISES.length + 1,
      workouts: 2,
      routines: before.routines.length,
      folders: 2,
      measurements: 1,
    })
    expect(await snapshot()).toEqual(before)
  })

  it('restore replaces existing data rather than merging', async () => {
    await populate()
    const text = JSON.stringify(await buildBackup())
    await db.workouts.put(workout({ id: 'extra' }))
    await db.folders.put({ id: 'extra', name: 'x', order: 9, createdAt: 1 })
    await restoreBackup(text)
    expect(await db.workouts.get('extra')).toBeUndefined()
    expect(await db.folders.get('extra')).toBeUndefined()
  })

  it('restored indexes work (multi-entry exerciseIds)', async () => {
    await populate()
    const text = JSON.stringify(await buildBackup())
    await wipeAllData()
    await restoreBackup(text)
    expect((await db.workouts.where('exerciseIds').equals('c1').toArray()).map((w) => w.id)).toEqual(['w1'])
    expect(await db.workouts.where('status').equals('active').count()).toBe(1)
  })

  it('missing measurements (v1 file) restores with zero measurements and backfills settings', async () => {
    const v1 = {
      app: 'ironlog',
      version: 1,
      exportedAt: 1,
      exercises: [],
      workouts: [workout({ id: 'w1' })],
      routines: [],
      folders: [],
      settings: { id: 1, weightUnit: 'lb' },
    }
    await db.measurements.put({ id: 'old', type: 'waist', value: 1, takenAt: 1 })
    const s = await restoreBackup(JSON.stringify(v1))
    expect(s).toEqual({ exercises: 0, workouts: 1, routines: 0, folders: 0, measurements: 0 })
    expect(await db.measurements.count()).toBe(0)
    expect(await db.settings.get(1)).toEqual({ ...DEFAULT_SETTINGS, weightUnit: 'lb', id: 1 })
  })

  it('wipeAllData clears every table', async () => {
    await populate()
    await wipeAllData()
    const snap = await snapshot()
    for (const [k, v] of Object.entries(snap)) expect(v, k).toHaveLength(0)
  })

  it('buildBackup on an empty db falls back to default settings', async () => {
    const b = await buildBackup()
    expect(b.settings).toEqual(DEFAULT_SETTINGS)
    expect(b.workouts).toEqual([])
  })
})

describe('parseBackup validation', () => {
  const ok = {
    app: 'trana',
    version: 2,
    exportedAt: 1,
    exercises: [],
    workouts: [],
    routines: [],
    folders: [],
    settings: DEFAULT_SETTINGS,
  }

  it('accepts current and older versions, and foreign app markers when shape is right', () => {
    expect(parseBackup(JSON.stringify(ok)).version).toBe(2)
    expect(parseBackup(JSON.stringify({ ...ok, version: 1 })).version).toBe(1)
    expect(parseBackup(JSON.stringify({ ...ok, version: 0 })).version).toBe(0)
    expect(parseBackup(JSON.stringify({ ...ok, app: 'ironlog' })).app).toBe('ironlog')
    expect(parseBackup(JSON.stringify({ ...ok, app: 'something-else' })).app).toBe('something-else')
  })

  it('rejects newer-than-supported versions', () => {
    expect(() => parseBackup(JSON.stringify({ ...ok, version: BACKUP_VERSION + 1 }))).toThrow(/newer version/)
  })

  it('rejects garbage', () => {
    expect(() => parseBackup('not json')).toThrow()
    expect(() => parseBackup('')).toThrow()
    expect(() => parseBackup('null')).toThrow(/not valid/)
    expect(() => parseBackup('42')).toThrow(/not valid/)
    expect(() => parseBackup('"str"')).toThrow(/not valid/)
    expect(() => parseBackup('[]')).toThrow()
    expect(() => parseBackup('{}')).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...ok, version: '2' }))).toThrow()
  })

  it('rejects files missing a required collection', () => {
    for (const key of ['exercises', 'workouts', 'routines', 'folders']) {
      const bad: Record<string, unknown> = { ...ok }
      delete bad[key]
      expect(() => parseBackup(JSON.stringify(bad)), key).toThrow(new RegExp(key))
      expect(() => parseBackup(JSON.stringify({ ...ok, [key]: {} })), key).toThrow(new RegExp(key))
    }
  })

  it('a rejected restore leaves the database untouched', async () => {
    await populate()
    const before = await snapshot()
    await expect(restoreBackup('{"version":99}')).rejects.toThrow()
    await expect(restoreBackup('garbage')).rejects.toThrow()
    await expect(
      restoreBackup(JSON.stringify({ version: 2, exercises: [], workouts: [], routines: [] })),
    ).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })

  it('a restore that fails mid-write rolls back (duplicate-key free but invalid index value)', async () => {
    await populate()
    const before = await snapshot()
    // A workout whose exerciseIds is not indexable would still store; instead force a
    // failure with a non-clonable value to prove the transaction is atomic.
    const bad = {
      app: 'trana',
      version: 2,
      exportedAt: 1,
      exercises: [{ id: 'x', name: 'x' }],
      workouts: [{ id: 'w-bad', exerciseIds: ['a'] }, { /* no id: primary key missing */ name: 'broken' }],
      routines: [],
      folders: [],
      settings: DEFAULT_SETTINGS,
    }
    await expect(restoreBackup(JSON.stringify(bad))).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })

  it('detectFormat agrees with parseBackup on backups', () => {
    expect(detectFormat(JSON.stringify(ok))).toBe('backup')
    expect(detectFormat(JSON.stringify({ ...ok, app: 'whatever' }))).toBe('backup')
    expect(detectFormat('{"hello":1}')).toBe('unknown')
    expect(detectFormat('{not json')).toBe('unknown')
  })
})

describe('large fixtures', () => {
  const cases: [
    string,
    string,
    { exercises: number; workouts: number; routines: number; folders: number; measurements: number },
  ][] = [
    [
      'src/dev/synthetic-dataset.json',
      'synthetic',
      { exercises: 219, workouts: 145, routines: 22, folders: 5, measurements: 327 },
    ],
    ['qa/qa-dataset.json', 'qa', { exercises: 211, workouts: 21, routines: 9, folders: 0, measurements: 16 }],
  ]
  for (const [path, label, counts] of cases) {
    it(`${label} dataset restores cleanly and round-trips`, async () => {
      const text = readFixture(path)
      const parsed = parseBackup(text)
      expect(detectFormat(text)).toBe('backup')
      expect(await restoreBackup(text)).toEqual(counts)

      // Stored data equals file data (order-independent).
      const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1))
      expect(await db.workouts.orderBy('id').toArray()).toEqual(byId(parsed.workouts))
      expect(await db.exercises.orderBy('id').toArray()).toEqual(byId(parsed.exercises))
      expect(await db.routines.orderBy('id').toArray()).toEqual(byId(parsed.routines))

      // Every workout's exerciseIds matches its logged exercises (index integrity).
      for (const w of await db.workouts.toArray()) {
        expect(new Set(w.exerciseIds), w.id).toEqual(new Set(w.exercises.map((e) => e.exerciseId)))
      }

      // Round trip again.
      const snap = await snapshot()
      const again = JSON.stringify(await buildBackup())
      await wipeAllData()
      await restoreBackup(again)
      expect(await snapshot()).toEqual(snap)

      // The app's own initDb after restore does not alter restored workouts or add duplicates.
      const wBefore = await db.workouts.toArray()
      await initDb()
      expect(await db.workouts.toArray()).toEqual(wBefore)
      const names = (await db.exercises.toArray()).map((e) => e.id)
      expect(new Set(names).size).toBe(names.length)
    })
  }

  it('fixture workouts reference only exercises present in the fixture', () => {
    for (const [path] of cases) {
      const p = parseBackup(readFixture(path))
      const ids = new Set(p.exercises.map((e) => e.id))
      for (const w of p.workouts)
        for (const le of w.exercises) expect(ids.has(le.exerciseId), `${path} ${w.id}`).toBe(true)
      for (const r of p.routines)
        for (const re of r.exercises) expect(ids.has(re.exerciseId), `${path} ${r.id}`).toBe(true)
    }
  })

  it('SEED_VERSION marker is not part of a backup (meta is device-local)', async () => {
    await initDb()
    const b = await buildBackup()
    expect('meta' in b).toBe(false)
    expect((await db.meta.get('seedVersion'))?.value).toBe(SEED_VERSION)
  })
})

describe('backup validation', () => {
  async function goodBackup() {
    await populate()
    return buildBackup()
  }

  it('accepts a real backup', async () => {
    const text = JSON.stringify(await goodBackup())
    expect(() => parseBackup(text)).not.toThrow()
  })

  it('refuses rows missing what the app dereferences, naming where', async () => {
    const b = await goodBackup()
    ;(b.workouts[0] as unknown as Record<string, unknown>).startedAt = 'yesterday'
    ;(b.workouts[0].exercises[0] as unknown as Record<string, unknown>).sets = 'nope'
    expect(() => parseBackup(JSON.stringify(b))).toThrow(
      /workouts\[0\]\.startedAt.*workouts\[0\]\.exercises\[0\]\.sets/,
    )
  })

  it('refuses an unknown exercise type, a non-object row and a bad measurement', async () => {
    const b = await goodBackup()
    ;(b.exercises[0] as unknown as Record<string, unknown>).kind = 'telepathy'
    ;(b.folders as unknown[])[0] = 'oops'
    ;(b.measurements as unknown as Record<string, unknown>[])[0].value = null
    const err = (() => {
      try {
        parseBackup(JSON.stringify(b))
      } catch (e) {
        return String(e)
      }
    })()
    expect(err).toMatch(/exercises\[0\]\.kind/)
    expect(err).toMatch(/folders\[0\] should be an object/)
    expect(err).toMatch(/measurements\[0\]\.value/)
  })

  it('caps the report so a wholly broken file stays readable', async () => {
    const b = await goodBackup()
    b.workouts = Array.from({ length: 50 }, () => ({}) as never)
    const msg = (() => {
      try {
        parseBackup(JSON.stringify(b))
      } catch (e) {
        return (e as Error).message
      }
      return ''
    })()
    expect(msg.split(';').length).toBeLessThanOrEqual(5)
  })

  it('a refused file changes nothing', async () => {
    const b = await goodBackup()
    const before = await snapshot()
    ;(b.workouts[0] as unknown as Record<string, unknown>).status = 'maybe'
    await expect(restoreBackup(JSON.stringify(b))).rejects.toThrow(/damaged entries/)
    expect(await snapshot()).toEqual(before)
    expect(await getRestoreSnapshot()).toBeNull()
  })
})

describe('restore snapshot and undo', () => {
  async function otherBackupText(): Promise<string> {
    await resetDb()
    await initDb()
    await db.workouts.put(workout({ id: 'other', startedAt: 9000, exercises: [] }))
    const text = JSON.stringify(await buildBackup())
    await resetDb()
    return text
  }

  it('keeps what a restore replaced and brings it back on undo', async () => {
    const other = await otherBackupText()
    await populate()
    const before = await snapshot()

    await restoreBackup(other)
    expect((await db.workouts.toArray()).map((w) => w.id)).toEqual(['other'])
    const info = await getRestoreSnapshot()
    expect(info?.workouts).toBe(2)

    const summary = await undoRestore()
    expect(summary.workouts).toBe(2)
    expect(await snapshot()).toEqual(before)
  })

  it('undo is itself undoable (swaps with the current data)', async () => {
    const other = await otherBackupText()
    await populate()
    await restoreBackup(other)
    const afterRestore = await snapshot()

    await undoRestore()
    await undoRestore()
    expect(await snapshot()).toEqual(afterRestore)
  })

  it('takes no snapshot when the device holds nothing of the user', async () => {
    const other = await otherBackupText()
    await restoreBackup(other) // resetDb left the database truly empty
    expect(await getRestoreSnapshot()).toBeNull()
    await expect(undoRestore()).rejects.toThrow(/nothing to undo/)
  })

  it('does not put the snapshot into exported backups', async () => {
    const other = await otherBackupText()
    await populate()
    await restoreBackup(other)
    const exported = JSON.parse(JSON.stringify(await buildBackup())) as Record<string, unknown>
    expect(Object.keys(exported)).not.toContain('snapshots')
  })

  it('delete-all removes the snapshot too', async () => {
    const other = await otherBackupText()
    await populate()
    await restoreBackup(other)
    await wipeAllData()
    expect(await getRestoreSnapshot()).toBeNull()
  })
})
