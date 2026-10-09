import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb } from '../../src/db/db'
import { partitionImport, workoutFingerprint } from '../../src/lib/dedupe'
import { applyCsvImport } from '../../src/lib/importers/apply'
import { detectFormat } from '../../src/lib/importers/detect'
import { parseHevyCsv } from '../../src/lib/importers/hevy'
import { parseStrongCsv } from '../../src/lib/importers/strong'
import { logged, resetDb, set, workout } from './helpers'

beforeEach(async () => {
  await resetDb()
  await initDb()
})

const STRONG = [
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
  '2024-03-01 18:00:00,Push Day,1h 10m,Bench Press (Barbell),1,60,10,0,0,,felt good,8',
  '2024-03-01 18:00:00,Push Day,1h 10m,Bench Press (Barbell),2,60,8,0,0,,,9',
  '2024-03-01 18:00:00,Push Day,1h 10m,Bench Press (Barbell),3,0,0,0,0,,,',
  '2024-03-01 18:00:00,Push Day,1h 10m,Weird Cable Thing,1,25,12,0,0,,,',
  '2024-03-03 09:30:00,Pull Day,45m,Deadlift (Barbell),1,100,5,0,0,,,',
  '2024-03-03 09:30:00,Pull Day,45m,Deadlift (Barbell),2,100,5,0,0,,,',
  '2024-03-05 07:00:00,Empty,30m,Squat (Barbell),1,0,0,0,0,,,',
].join('\n')

const HEVY = [
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
  '"Leg Day","4 Mar 2024, 17:00","4 Mar 2024, 18:00",,"Squat (Barbell)",,,0,normal,100,5,,,',
  '"Leg Day","4 Mar 2024, 17:00","4 Mar 2024, 18:00",,"Squat (Barbell)",,,1,warmup,60,8,,,',
  '"Leg Day","4 Mar 2024, 17:00","4 Mar 2024, 18:00",,"Plank",,,0,normal,,,,60,',
  '"Run","6 Mar 2024, 07:00","6 Mar 2024, 07:30",,"Running",,,0,normal,,,5,1500,',
].join('\n')

async function importStrong(text = STRONG) {
  const existing = await db.exercises.toArray()
  return applyCsvImport(parseStrongCsv(text, { weightUnit: 'kg', distanceUnit: 'km' }, existing, null))
}
async function importHevy(text = HEVY) {
  const existing = await db.exercises.toArray()
  return applyCsvImport(parseHevyCsv(text, existing, null))
}

describe('Strong import', () => {
  it('detects, inserts workouts, drops zero/empty sets and sessions', async () => {
    expect(detectFormat(STRONG)).toBe('strong')
    const s = await importStrong()
    expect(s.workouts).toBe(2) // "Empty" session has nothing performed
    expect(s.skipped).toBe(0)
    const ws = await db.workouts.orderBy('startedAt').toArray()
    expect(ws.map((w) => w.name)).toEqual(['Push Day', 'Pull Day'])
    expect(ws[0].totalSets).toBe(3) // 2 bench + 1 cable; zero-weight row dropped
    expect(ws[0].notes).toBe('felt good')
    expect(ws[1].totalVolumeKg).toBe(1000)
    // New exercise created only for the unmatched name, and it is used.
    expect(s.exercises).toBe(1)
    expect((await db.exercises.filter((e) => e.name === 'Weird Cable Thing').toArray()).length).toBe(1)
    // Index integrity.
    for (const w of ws) {
      for (const id of w.exerciseIds) expect(await db.exercises.get(id)).toBeTruthy()
    }
  })

  it('importing the same file twice adds nothing the second time', async () => {
    await importStrong()
    const wCount = await db.workouts.count()
    const eCount = await db.exercises.count()
    const again = await importStrong()
    expect(again).toEqual({ workouts: 0, skipped: 2, exercises: 0 })
    expect(await db.workouts.count()).toBe(wCount)
    expect(await db.exercises.count()).toBe(eCount)
  })

  it('a longer re-export only adds the new sessions', async () => {
    await importStrong()
    const longer = STRONG + '\n2024-03-08 10:00:00,Arms,30m,Bicep Curl (Dumbbell),1,15,12,0,0,,,'
    const s = await importStrong(longer)
    expect(s.workouts).toBe(1)
    expect(s.skipped).toBe(2)
    expect(await db.workouts.count()).toBe(3)
  })

  it('lb files convert to kg on the way in', async () => {
    const csv = [
      'Date,Workout Name,Duration,Exercise Name,Set Order,Weight (lb),Reps,Distance,Seconds,Notes,Workout Notes,RPE',
      '2024-04-01 10:00:00,Lift,10m,Bench Press (Barbell),1,225,5,0,0,,,',
    ].join('\n')
    await importStrong(csv)
    const w = (await db.workouts.toArray())[0]
    expect(w.exercises[0].sets[0].weight).toBeCloseTo(102.058, 2)
  })

  it('re-total after import uses the user countWarmupSets setting', async () => {
    await db.settings.update(1, { countWarmupSets: true })
    const csv = [
      'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
      '2024-04-01 10:00:00,Lift,10m,Bench Press (Barbell),W,40,10,0,0,,,',
      '2024-04-01 10:00:00,Lift,10m,Bench Press (Barbell),1,80,5,0,0,,,',
    ].join('\n')
    await importStrong(csv)
    const w = (await db.workouts.toArray())[0]
    expect(w.totalSets).toBe(2)
    expect(w.totalVolumeKg).toBe(800)
  })
})

describe('Hevy import', () => {
  it('detects and imports, then is idempotent', async () => {
    expect(detectFormat(HEVY)).toBe('hevy')
    const first = await importHevy()
    expect(first.workouts).toBe(2)
    const second = await importHevy()
    expect(second).toEqual({ workouts: 0, skipped: 2, exercises: 0 })
    expect(await db.workouts.count()).toBe(2)
    const leg = (await db.workouts.filter((w) => w.name === 'Leg Day').toArray())[0]
    const squat = leg.exercises.find((e) => e.sets.length === 2)!
    expect(squat.sets.map((s) => s.setType)).toEqual(['normal', 'warmup'])
  })

  it('Strong and Hevy imports of different sessions coexist', async () => {
    await importStrong()
    await importHevy()
    expect(await db.workouts.count()).toBe(4)
    expect((await importStrong()).workouts).toBe(0)
    expect((await importHevy()).workouts).toBe(0)
  })
})

describe('partitionImport', () => {
  const base = workout({
    id: 'a', startedAt: 5000,
    exercises: [logged('x', [set({ weight: 10, reps: 5 })]), logged('y', [set({ weight: 20, reps: 5 })])],
  })

  it('empty input', async () => {
    expect(await partitionImport([])).toEqual({ fresh: [], duplicates: [], sameTimeDifferent: 0 })
  })

  it('splits fresh from duplicates; repeats inside the file are duplicates', async () => {
    await db.workouts.put(base)
    const same = { ...base, id: 'b', name: 'renamed', finishedAt: 1, notes: 'n' }
    const sameReordered = { ...base, id: 'c', exercises: [...base.exercises].reverse() }
    const differentTime = { ...base, id: 'd', startedAt: 6000 }
    const differentSets = workout({ id: 'e', startedAt: 5000, exercises: [logged('x', [set({ weight: 11, reps: 5 })])] })
    const dup2 = { ...differentTime, id: 'f' }
    const r = await partitionImport([same, sameReordered, differentTime, differentSets, dup2])
    expect(r.duplicates.map((w) => w.id)).toEqual(['b', 'c', 'f'])
    expect(r.fresh.map((w) => w.id)).toEqual(['d', 'e'])
    expect(r.sameTimeDifferent).toBe(1)
  })

  it('placeholder-only differences still match', async () => {
    await db.workouts.put(base)
    const withPlaceholder = {
      ...base, id: 'p',
      exercises: [...base.exercises, logged('z', [set({ weight: 0, reps: 0 }), set({ weight: null, reps: null })])],
    }
    expect((await partitionImport([withPlaceholder])).duplicates).toHaveLength(1)
  })
})

describe('workoutFingerprint', () => {
  const w = workout({ id: 'a', startedAt: 123, exercises: [logged('x', [set({ weight: 10.0004, reps: 5 })])] })

  it('is stable across ids, names, finish time, set ids, rpe, set type', () => {
    const w2 = workout({
      id: 'zzz', name: 'Other', startedAt: 123, finishedAt: 999, notes: 'q',
      exercises: [logged('x', [set({ weight: 10.0004, reps: 5, rpe: 9, setType: 'failure' })], 'other-le-id')],
    })
    expect(workoutFingerprint(w)).toBe(workoutFingerprint(w2))
    expect(workoutFingerprint(w)).toBe(workoutFingerprint(w))
  })

  it('rounds to 3 decimals so lb->kg float noise matches', () => {
    const w2 = workout({ id: 'b', startedAt: 123, exercises: [logged('x', [set({ weight: 10.00041, reps: 5 })])] })
    expect(workoutFingerprint(w)).toBe(workoutFingerprint(w2))
  })

  it('changes with start time, weight, reps, exercise, set order', () => {
    const fp = workoutFingerprint(w)
    expect(workoutFingerprint({ ...w, startedAt: 124 })).not.toBe(fp)
    expect(workoutFingerprint(workout({ id: 'b', startedAt: 123, exercises: [logged('x', [set({ weight: 11, reps: 5 })])] }))).not.toBe(fp)
    expect(workoutFingerprint(workout({ id: 'b', startedAt: 123, exercises: [logged('x', [set({ weight: 10.0004, reps: 6 })])] }))).not.toBe(fp)
    expect(workoutFingerprint(workout({ id: 'b', startedAt: 123, exercises: [logged('y', [set({ weight: 10.0004, reps: 5 })])] }))).not.toBe(fp)
    const ab = workout({ id: 'b', startedAt: 123, exercises: [logged('x', [set({ weight: 1, reps: 5 }), set({ weight: 2, reps: 5 })])] })
    const ba = workout({ id: 'b', startedAt: 123, exercises: [logged('x', [set({ weight: 2, reps: 5 }), set({ weight: 1, reps: 5 })])] })
    expect(workoutFingerprint(ab)).not.toBe(workoutFingerprint(ba))
  })
})
