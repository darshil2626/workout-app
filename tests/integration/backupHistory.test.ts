import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb, DEFAULT_SETTINGS } from '../../src/db/db'
import { BACKUP_VERSION, buildBackup, parseBackup, restoreBackup, wipeAllData } from '../../src/lib/backup'
import { detectFormat } from '../../src/lib/importers/detect'
import { muscleRecovery } from '../../src/lib/home'
import { loadRecords, prsForWorkout } from '../../src/lib/records'
import {
  PROGRESS_METRIC_LABEL,
  computeStreaks,
  exerciseProgress,
  metricsFor,
  muscleDistribution,
  overallTotals,
  volumeByWeek,
  type ProgressMetric,
} from '../../src/lib/stats'
import { resetDb, snapshot } from './helpers'

// A backup is the one thing that has to keep working across every release: someone
// who exported a year ago restores it into whatever build is live then. These files
// are what past builds actually wrote (see tests/fixtures/backups/README.md), and
// each one has to restore and then drive the real screens' calculations.

const DIR = path.resolve(__dirname, '../fixtures/backups')
const FILES = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

const read = (file: string) => fs.readFileSync(path.join(DIR, file), 'utf8')

beforeEach(resetDb)

describe('the fixture set', () => {
  it('has a file for every era, newest last', () => {
    expect(FILES).toEqual([
      '01-ironlog-first-release.json',
      '02-ironlog-with-measurements.json',
      '03-trana-current.json',
    ])
  })

  it('covers every backup version this build can write', () => {
    const versions = new Set(FILES.map((f) => JSON.parse(read(f)).version as number))
    for (let v = 1; v <= BACKUP_VERSION; v++) expect(versions.has(v), `no fixture for backup version ${v}`).toBe(true)
  })

  // When a build adds a settings field or bumps BACKUP_VERSION, this fails until a new
  // fixture is added. Keeping the old files is the point: they stay as regression cases.
  it('the newest fixture has exactly the settings fields a build writes today', () => {
    const newest = JSON.parse(read(FILES[FILES.length - 1]))
    expect(Object.keys(newest.settings).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort())
    expect(newest.version).toBe(BACKUP_VERSION)
  })

  it('a backup written today has the same top-level shape as the newest fixture', async () => {
    const newest = JSON.parse(read(FILES[FILES.length - 1]))
    await initDb()
    expect(Object.keys(await buildBackup()).sort()).toEqual(Object.keys(newest).sort())
  })
})

describe.each(FILES)('restoring %s', (file) => {
  const text = read(file)
  const parsed = JSON.parse(text)

  it('is accepted as a backup and restores into an empty device', async () => {
    expect(detectFormat(text)).toBe('backup')
    expect(() => parseBackup(text)).not.toThrow()
    await initDb()
    const summary = await restoreBackup(text)
    expect(summary).toEqual({
      exercises: parsed.exercises.length,
      workouts: parsed.workouts.length,
      routines: parsed.routines.length,
      folders: parsed.folders.length,
      measurements: (parsed.measurements ?? []).length,
    })
    const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(await db.workouts.orderBy('id').toArray()).toEqual(byId(parsed.workouts))
    expect(await db.routines.orderBy('id').toArray()).toEqual(byId(parsed.routines))
    expect(await db.folders.orderBy('id').toArray()).toEqual(byId(parsed.folders))
  })

  it('keeps the person’s own choices and fills in settings the file predates', async () => {
    await initDb()
    await restoreBackup(text)
    await initDb()
    const settings = (await db.settings.get(1))!
    for (const [key, value] of Object.entries(parsed.settings)) {
      if (key === 'analyticsEnabled' || key === 'analyticsConsentAt') continue // belongs to this device
      expect(settings[key as keyof typeof settings], key).toEqual(value)
    }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      expect(settings[key as keyof typeof settings], `${key} is set`).not.toBeUndefined()
    }
  })

  it('survives a second start, and a backup of the restored data restores to the same thing', async () => {
    await initDb()
    await restoreBackup(text)
    const workouts = await db.workouts.toArray()
    await initDb()
    expect(await db.workouts.toArray()).toEqual(workouts)
    const exerciseIds = (await db.exercises.toArray()).map((e) => e.id)
    expect(new Set(exerciseIds).size).toBe(exerciseIds.length)
    // The custom exercise is the person's own and must never be dropped or renamed.
    expect(await db.exercises.get('custom-zercher')).toMatchObject({ name: 'Zercher Squat', isCustom: true })

    const before = await snapshot()
    const again = JSON.stringify(await buildBackup())
    await wipeAllData()
    await restoreBackup(again)
    expect(await snapshot()).toEqual(before)
  })

  it('every logged exercise resolves, and the index that finds history is intact', async () => {
    await initDb()
    await restoreBackup(text)
    await initDb()
    const known = new Set((await db.exercises.toArray()).map((e) => e.id))
    for (const w of await db.workouts.toArray()) {
      expect(new Set(w.exerciseIds), w.name).toEqual(new Set(w.exercises.map((e) => e.exerciseId)))
      for (const le of w.exercises) expect(known.has(le.exerciseId), `${w.name}: ${le.exerciseId}`).toBe(true)
    }
    const squatSessions = await db.workouts.where('exerciseIds').equals('squat-barbell').toArray()
    expect(squatSessions.map((w) => w.id)).toEqual(['w-legs'])
  })

  it('feeds the calculations behind Home, Stats, History and the exercise pages without throwing', async () => {
    await initDb()
    await restoreBackup(text)
    await initDb()
    const settings = (await db.settings.get(1))!
    const done = await db.workouts.where('status').equals('done').toArray()
    const exercises = await db.exercises.toArray()
    const byId = new Map(exercises.map((e) => [e.id, e]))
    const bodyweight = settings.bodyweightKg
    const finite = (n: number, what: string) => expect(Number.isFinite(n), what).toBe(true)

    const totals = overallTotals(done)
    expect(totals.workouts).toBe(done.length)
    for (const [k, v] of Object.entries(totals)) finite(v, `totals.${k}`)
    expect(computeStreaks(done, settings.firstDayOfWeek)).toBeTruthy()
    for (const p of volumeByWeek(done, settings.firstDayOfWeek)) finite(p.volumeKg, 'weekly volume')
    for (const s of muscleDistribution(done, byId, bodyweight)) finite(s.volumeKg, `${s.muscle} volume`)
    expect(muscleRecovery(done, byId)).toBeInstanceOf(Array)

    // Per-exercise pages: records, progress charts for every metric, and the PR badges on each session.
    for (const w of done) {
      for (const le of w.exercises) {
        const exercise = byId.get(le.exerciseId)!
        const records = await loadRecords(le.exerciseId, exercise.kind, bodyweight, settings.countWarmupSets)
        for (const [k, v] of Object.entries(records)) finite(v as number, `${exercise.name} record ${k}`)
        const history = (await db.workouts.where('exerciseIds').equals(le.exerciseId).toArray())
          .filter((x) => x.status === 'done')
          .map((workout) => ({
            workout,
            logged: workout.exercises.find((e) => e.exerciseId === le.exerciseId)!,
          }))
        for (const metric of metricsFor(exercise.kind) as ProgressMetric[]) {
          expect(PROGRESS_METRIC_LABEL[metric]).toBeTruthy()
          for (const p of exerciseProgress(history, exercise, metric, bodyweight))
            finite(p.value, `${exercise.name} ${metric}`)
        }
      }
      expect(await prsForWorkout(w, byId, bodyweight, settings.countWarmupSets)).toBeInstanceOf(Map)
    }
  })
})
