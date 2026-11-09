import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb } from '../../src/db/db'
import { SEED_EXERCISES } from '../../src/db/seed'
import { listFolders, listRoutines, getRoutine } from '../../src/db/repo'
import { TEMPLATES, buildTemplate, installTemplate } from '../../src/lib/templates'
import { resetDb } from './helpers'

beforeEach(resetDb)

describe('starter templates', () => {
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
