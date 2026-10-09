import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb } from '../../src/db/db'
import { getExerciseHistory, getPreviousPerformance, getPreviousSessionTotals } from '../../src/lib/history'
import { loadRecords, loadRecordsBefore, loadSetRecords, prsForWorkout } from '../../src/lib/records'
import { strengthTrend } from '../../src/lib/home'
import { parseBackup, restoreBackup } from '../../src/lib/backup'
import { logged, readFixture, resetDb, set, workout } from './helpers'

const DAY = 86_400_000
const T0 = 1_700_000_000_000
const BENCH = 'bench-press-barbell'

beforeEach(async () => {
  await resetDb()
  await initDb()
})

async function exMap() {
  return new Map((await db.exercises.toArray()).map((e) => [e.id, e] as const))
}

describe('getPreviousPerformance', () => {
  it('returns null with no history', async () => {
    expect(await getPreviousPerformance(BENCH)).toBeNull()
  })

  it('picks the latest done session with a completed set; ignores active, excluded, incomplete', async () => {
    await db.workouts.bulkPut([
      workout({ id: 'old', startedAt: T0, finishedAt: T0 + 1, exercises: [logged(BENCH, [set({ weight: 50, reps: 10 })])] }),
      workout({ id: 'new', startedAt: T0 + DAY, finishedAt: T0 + DAY + 1, exercises: [logged(BENCH, [set({ weight: 60, reps: 8 }), set({ weight: 99, reps: 1, completed: false })])] }),
      workout({ id: 'newest-incomplete', startedAt: T0 + 2 * DAY, finishedAt: T0 + 2 * DAY + 1, exercises: [logged(BENCH, [set({ completed: false })])] }),
      workout({ id: 'act', status: 'active', finishedAt: null, startedAt: T0 + 3 * DAY, exercises: [logged(BENCH, [set({ weight: 200 })])] }),
      workout({ id: 'other', startedAt: T0 + 4 * DAY, exercises: [logged('squat-barbell', [set()])] }),
    ])
    const p = await getPreviousPerformance(BENCH)
    expect(p?.workoutId).toBe('new')
    expect(p?.performedAt).toBe(T0 + DAY + 1)
    expect(p?.sets.map((s) => s.weight)).toEqual([60]) // only completed sets
    expect((await getPreviousPerformance(BENCH, 'new'))?.workoutId).toBe('old')
    expect(await getPreviousPerformance('squat-barbell', 'other')).toBeNull()
  })

  it('orders by finishedAt, falling back to startedAt', async () => {
    await db.workouts.bulkPut([
      workout({ id: 'a', startedAt: T0, finishedAt: T0 + 10 * DAY, exercises: [logged(BENCH, [set()])] }),
      workout({ id: 'b', startedAt: T0 + DAY, finishedAt: null, exercises: [logged(BENCH, [set()])] }),
    ])
    expect((await getPreviousPerformance(BENCH))?.workoutId).toBe('a')
  })
})

describe('getPreviousSessionTotals', () => {
  it('matches by routine when given, otherwise by name among done sessions', async () => {
    await db.workouts.bulkPut([
      workout({ id: 'r1', name: 'Push', routineId: 'R', startedAt: T0, finishedAt: T0 + 1, totalVolumeKg: 100 }),
      workout({ id: 'r2', name: 'Renamed', routineId: 'R', startedAt: T0 + DAY, finishedAt: T0 + DAY + 1, totalVolumeKg: 200 }),
      workout({ id: 'f1', name: 'Pull', startedAt: T0 + 2 * DAY, finishedAt: T0 + 2 * DAY + 1, totalVolumeKg: 300 }),
      workout({ id: 'f2', name: 'Pull', startedAt: T0 + 3 * DAY, totalVolumeKg: 400, status: 'active', finishedAt: null }),
    ])
    expect((await getPreviousSessionTotals('x', 'R'))?.totalVolumeKg).toBe(200)
    expect((await getPreviousSessionTotals('x', 'R', 'r2'))?.totalVolumeKg).toBe(100)
    expect((await getPreviousSessionTotals('Pull', undefined))?.totalVolumeKg).toBe(300)
    expect(await getPreviousSessionTotals('Nope', undefined)).toBeNull()
  })
})

describe('getExerciseHistory', () => {
  it('lists done sessions newest first, one entry per logged occurrence', async () => {
    await db.workouts.bulkPut([
      workout({ id: 'a', startedAt: T0, finishedAt: T0 + 1, exercises: [logged(BENCH, [set()])] }),
      workout({ id: 'b', startedAt: T0 + DAY, finishedAt: T0 + DAY + 1, exercises: [logged(BENCH, [set()]), logged(BENCH, [set()])] }),
      workout({ id: 'c', startedAt: T0 + 2 * DAY, status: 'active', finishedAt: null, exercises: [logged(BENCH, [set()])] }),
    ])
    const h = await getExerciseHistory(BENCH)
    expect(h.map((x) => x.workout.id)).toEqual(['b', 'b', 'a'])
    expect(await getExerciseHistory('squat-barbell')).toEqual([])
  })
})

describe('records', () => {
  beforeEach(async () => {
    await db.workouts.bulkPut([
      workout({ id: 'w1', startedAt: T0, exercises: [logged(BENCH, [set({ weight: 100, reps: 5 }), set({ weight: 140, reps: 3, setType: 'warmup' })])] }),
      workout({ id: 'w2', startedAt: T0 + DAY, exercises: [logged(BENCH, [set({ weight: 100, reps: 8 }), set({ weight: 110, reps: 1, completed: false })])] }),
      workout({ id: 'w3', startedAt: T0 + 2 * DAY, exercises: [logged(BENCH, [set({ weight: 120, reps: 3 })])] }),
      workout({ id: 'act', status: 'active', finishedAt: null, startedAt: T0 + 3 * DAY, exercises: [logged(BENCH, [set({ weight: 500, reps: 5 })])] }),
    ])
  })

  it('loadRecords: best per kind, excluding warmups/incomplete/active', async () => {
    const r = await loadRecords(BENCH, 'weight_reps', null, false)
    expect(r.weight).toBe(120)
    expect(r.reps).toBe(8)
    expect(r.volume).toBe(800)
    expect(r.oneRm).toBeCloseTo(120 * (1 + 3 / 30), 6) // 132 beats 100x8 = 126.7
    expect(r.sessionVolume).toBe(800)
    expect(r.duration).toBe(0)
  })

  it('loadRecords counts warmups when asked and honours excludeWorkoutId', async () => {
    expect((await loadRecords(BENCH, 'weight_reps', null, true)).weight).toBe(140)
    const r = await loadRecords(BENCH, 'weight_reps', null, false, 'w3')
    expect(r.weight).toBe(100)
  })

  it('loadRecordsBefore only sees sessions strictly earlier', async () => {
    expect((await loadRecordsBefore(BENCH, 'weight_reps', null, T0, false)).weight).toBe(0)
    expect((await loadRecordsBefore(BENCH, 'weight_reps', null, T0 + 2 * DAY, false)).weight).toBe(100)
    expect((await loadRecordsBefore(BENCH, 'weight_reps', null, T0 + 2 * DAY + 1, false)).weight).toBe(120)
  })

  it('prsForWorkout badges only sets that beat what came before', async () => {
    const byId = await exMap()
    const w1 = (await db.workouts.get('w1'))!
    const w2 = (await db.workouts.get('w2'))!
    const w3 = (await db.workouts.get('w3'))!
    // First ever session: everything is a record (warmup set excluded).
    const p1 = await prsForWorkout(w1, byId, null)
    expect([...p1.keys()]).toEqual([w1.exercises[0].sets[0].id])
    expect(p1.get(w1.exercises[0].sets[0].id)!.sort()).toEqual(['oneRm', 'reps', 'volume', 'weight'])
    // w2: more reps, no weight record.
    const p2 = await prsForWorkout(w2, byId, null)
    const kinds2 = p2.get(w2.exercises[0].sets[0].id)!
    expect(kinds2).toContain('reps')
    expect(kinds2).not.toContain('weight')
    // w3: new heaviest weight; not more reps.
    const kinds3 = (await prsForWorkout(w3, byId, null)).get(w3.exercises[0].sets[0].id)!
    expect(kinds3).toContain('weight')
    expect(kinds3).not.toContain('reps')
    // Judging w1 is not affected by later bigger sessions.
    expect((await prsForWorkout(w1, byId, null)).size).toBe(1)
  })

  it('loadSetRecords: heaviest per rep count, first achieved date wins ties', async () => {
    await db.workouts.put(workout({ id: 'tie', startedAt: T0 + 5 * DAY, finishedAt: T0 + 5 * DAY + 1, exercises: [logged(BENCH, [set({ weight: 100, reps: 5 })])] }))
    const recs = await loadSetRecords(BENCH, 'weight_reps', false)
    expect(recs.map((r) => [r.reps, r.weightKg])).toEqual([[3, 120], [5, 100], [8, 100]])
    expect(recs.find((r) => r.reps === 5)!.achievedAt).toBe(T0 + 3_600_000) // w1 finishedAt, not the later tie
    expect(await loadSetRecords(BENCH, 'duration', false)).toEqual([])
  })
})

describe('strengthTrend', () => {
  const NOW = T0 + 100 * DAY

  async function sessions(exerciseId: string, count: number, startDaysAgo = 7) {
    for (let i = 0; i < count; i++) {
      await db.workouts.put(workout({
        id: `${exerciseId}-${i}`, startedAt: NOW - (startDaysAgo - i) * DAY, finishedAt: NOW - (startDaysAgo - i) * DAY + 1,
        exercises: [logged(exerciseId, [set({ weight: 100 + i * 5, reps: 1 })])],
      }))
    }
  }

  it('requires 3 sessions in the window and reports oldest-first series and delta', async () => {
    await sessions(BENCH, 2)
    await sessions('squat-barbell', 3)
    const lifts = await strengthTrend(await db.workouts.toArray(), await exMap(), null, false, undefined, NOW)
    expect(lifts.map((l) => l.exerciseId)).toEqual(['squat-barbell'])
    expect(lifts[0].series).toEqual([100, 105, 110])
    expect(lifts[0].currentKg).toBe(110)
    expect(lifts[0].deltaKg).toBe(10)
  })

  it('ignores sessions outside the 8-week window and active ones', async () => {
    await sessions(BENCH, 3, 100) // ~14 weeks ago
    await db.workouts.put(workout({ id: 'act', status: 'active', finishedAt: null, startedAt: NOW - DAY, exercises: [logged(BENCH, [set()])] }))
    expect(await strengthTrend(await db.workouts.toArray(), await exMap(), null, false, undefined, NOW)).toEqual([])
  })

  it('ranks by frequency, breaks ties by name, and respects limit', async () => {
    await sessions(BENCH, 4)
    await sessions('squat-barbell', 3)
    await sessions('deadlift-barbell', 3)
    const all = await strengthTrend(await db.workouts.toArray(), await exMap(), null, false, 10, NOW)
    expect(all.map((l) => l.exerciseId)).toEqual([BENCH, 'deadlift-barbell', 'squat-barbell'])
    const two = await strengthTrend(await db.workouts.toArray(), await exMap(), null, false, 2, NOW)
    expect(two).toHaveLength(2)
  })

  it('on the synthetic fixture: at most 3 lifts, every series consistent with its delta', async () => {
    await resetDb()
    const text = readFixture('src/dev/synthetic-dataset.json')
    const parsed = parseBackup(text)
    await restoreBackup(text)
    const now = Math.max(...parsed.workouts.map((w) => w.startedAt)) + DAY
    const lifts = await strengthTrend(await db.workouts.toArray(), await exMap(), null, false, undefined, now)
    expect(lifts.length).toBeLessThanOrEqual(3)
    for (const l of lifts) {
      expect(l.series.length).toBeGreaterThanOrEqual(3)
      expect(l.currentKg).toBe(l.series[l.series.length - 1])
      expect(l.deltaKg).toBeCloseTo(l.currentKg - l.series[0], 9)
    }
  })
})

describe('fixtures: queries agree with stored workouts', () => {
  it('qa dataset: getExerciseHistory covers exactly the done workouts containing each exercise', async () => {
    await resetDb()
    await restoreBackup(readFixture('qa/qa-dataset.json'))
    const all = await db.workouts.toArray()
    for (const e of await db.exercises.toArray()) {
      const expected = all
        .filter((w) => w.status === 'done')
        .reduce((n, w) => n + w.exercises.filter((le) => le.exerciseId === e.id).length, 0)
      expect((await getExerciseHistory(e.id)).length, e.id).toBe(expected)
    }
  })
})
