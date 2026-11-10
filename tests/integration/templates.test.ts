import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb } from '../../src/db/db'
import { SEED_EXERCISES } from '../../src/db/seed'
import { listFolders, listRoutines, getRoutine, saveRoutinesWithFolder } from '../../src/db/repo'
import { suggestNextRoutine } from '../../src/lib/home'
import { TEMPLATES, buildTemplate, installTemplate } from '../../src/lib/templates'
import type { Routine, Workout } from '../../src/db/types'
import { logged, resetDb, set, workout } from './helpers'

beforeEach(resetDb)

const DAY = 86_400_000

/** A finished session that did every exercise of the routine, `at` ms since epoch. */
function performed(r: Routine, at: number): Workout {
  return workout({
    id: `w-${r.id}-${at}`,
    name: r.name,
    routineId: r.id,
    startedAt: at - 3_600_000,
    finishedAt: at,
    exercises: r.exercises.map((e) => logged(e.exerciseId, [set()])),
  })
}

describe('starter templates', () => {
  it('multi-day templates: Home suggests day N+1 after day N, and day A again after the last', async () => {
    const multiDay = TEMPLATES.filter((t) => t.days.length > 1)
    expect(multiDay.length).toBeGreaterThan(0)
    for (const t of multiDay) {
      await installTemplate(t)
      const routines = (await listRoutines()).filter((r) => t.days.some((d) => d.name === r.name))
      routines.sort((a, b) => a.order - b.order)
      const history: Workout[] = []
      let now = 1_700_000_000_000
      for (let n = 0; n < routines.length; n++) {
        now += 2 * DAY
        history.push(performed(routines[n], now))
        const next = routines[(n + 1) % routines.length]
        expect(
          suggestNextRoutine(routines, history, now + DAY)?.routine.name,
          `${t.id} after ${routines[n].name}`,
        ).toBe(next.name)
      }
    }
  })

  it('a failed install saves nothing, not even the folder', async () => {
    const { folder, routines } = buildTemplate(TEMPLATES[0])
    // A routine with no id cannot be stored, so the write fails after the folder was added.
    const broken = [routines[0], { ...routines[1], id: undefined as unknown as string }]
    await expect(saveRoutinesWithFolder(folder, broken)).rejects.toThrow()
    expect(await db.folders.count()).toBe(0)
    expect(await db.routines.count()).toBe(0)
  })

  it('every template exercise id is a built-in exercise', () => {
    const ids = new Set(SEED_EXERCISES.map((e) => e.id))
    for (const t of TEMPLATES)
      for (const day of t.days)
        for (const e of day.exercises) expect(ids.has(e.exerciseId), `${t.id}: ${e.exerciseId}`).toBe(true)
  })

  it('lists dumbbell and machine options before the barbell one', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'full-body-dumbbells',
      'full-body-machines',
      'basic-beginner-barbell',
      'bodyweight-basics',
      'upper-lower',
    ])
  })

  it('targets reps or a hold, never a weight', () => {
    for (const t of TEMPLATES) {
      for (const r of buildTemplate(t).routines) {
        for (const e of r.exercises) {
          expect(e.sets.length).toBeGreaterThan(0)
          for (const s of e.sets) {
            expect(s.weight).toBeNull()
            expect(s.reps !== null || s.durationSec !== null).toBe(true)
          }
        }
      }
    }
  })

  it('timed exercises get a hold, and rep exercises get reps', () => {
    const kinds = new Map(SEED_EXERCISES.map((e) => [e.id, e.kind]))
    for (const t of TEMPLATES)
      for (const r of buildTemplate(t).routines)
        for (const e of r.exercises) {
          const timed = kinds.get(e.exerciseId) === 'duration'
          for (const s of e.sets) expect(timed ? s.durationSec : s.reps, `${r.name}: ${e.exerciseId}`).not.toBeNull()
        }
  })

  it('a two-day template is saved as two routines in a folder named after it', async () => {
    await initDb()
    const dumbbells = TEMPLATES[0]
    const first = await installTemplate(dumbbells)
    const folders = await listFolders()
    expect(folders.map((f) => f.name)).toEqual(['Full Body (Dumbbells)'])
    const routines = (await listRoutines()).sort((a, b) => a.order - b.order)
    expect(routines.map((r) => r.name)).toEqual(['Dumbbell Full Body A', 'Dumbbell Full Body B'])
    for (const r of routines) expect(r.folderId).toBe(folders[0].id)
    expect(first.name).toBe('Dumbbell Full Body A')
  })

  it('a one-day template is a single routine with no folder', async () => {
    await initDb()
    await installTemplate(TEMPLATES.find((t) => t.id === 'full-body-machines')!)
    expect(await db.folders.count()).toBe(0)
    const routines = await listRoutines()
    expect(routines).toHaveLength(1)
    expect(routines[0].folderId).toBeNull()
  })

  it('every template round-trips through storage unchanged', async () => {
    for (const t of TEMPLATES) {
      const first = await installTemplate(t)
      expect(await getRoutine(first.id)).toEqual(first)
    }
    const expected = TEMPLATES.reduce((n, t) => n + t.days.length, 0)
    expect(await db.routines.count()).toBe(expected)
  })
})
