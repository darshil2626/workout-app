import { describe, expect, it } from 'vitest'
import {
  emptyRecords, findSessionPRs, loadRecords, loadRecordsBefore, loadSetRecords, prsForWorkout,
  recordsFromHistory, relevantKinds, setPRKinds,
} from '../../src/lib/records'
import { db } from '../../src/db/db'
import { mkEx, mkLogged, mkSet, mkWorkout } from './helpers'

describe('relevantKinds / setPRKinds', () => {
  it('weight_reps ranks on everything load-related', () => {
    expect(relevantKinds('weight_reps')).toEqual(['weight', 'oneRm', 'volume', 'sessionVolume', 'reps'])
  })
  it('weighted bodyweight has load records too', () => {
    expect(relevantKinds('weighted_bodyweight')).toEqual(['weight', 'oneRm', 'volume', 'sessionVolume', 'reps'])
  })
  it('assisted and bodyweight/reps-only are reps-only', () => {
    expect(relevantKinds('assisted_bodyweight')).toEqual(['reps'])
    expect(relevantKinds('bodyweight_reps')).toEqual(['reps'])
    expect(relevantKinds('reps_only')).toEqual(['reps'])
  })
  it('time/distance kinds', () => {
    expect(relevantKinds('duration')).toEqual(['duration'])
    expect(relevantKinds('duration_weight')).toEqual(['weight', 'duration'])
    expect(relevantKinds('distance_duration')).toEqual(['duration', 'distance'])
  })
  it('setPRKinds drops sessionVolume', () => {
    expect(setPRKinds('weight_reps')).toEqual(['weight', 'oneRm', 'volume', 'reps'])
  })
})

describe('recordsFromHistory', () => {
  const entry = (sets: ReturnType<typeof mkSet>[], w = {}) => ({ workout: mkWorkout(w), logged: { sets } })

  it('computes best values across sessions', () => {
    const r = recordsFromHistory([
      entry([mkSet({ weight: 100, reps: 5 })]),
      entry([mkSet({ weight: 80, reps: 12 })]),
    ], 'weight_reps', null, false)
    expect(r.weight).toBe(100)
    expect(r.reps).toBe(12)
    expect(r.volume).toBe(960)
    expect(r.oneRm).toBeCloseTo(Math.max(100 * (1 + 5 / 30), 80 * (1 + 12 / 30)), 6)
    expect(r.oneRm).toBeCloseTo(116.667, 2)
  })
  it('sums session volume per workout, taking the best session', () => {
    const w1 = mkWorkout()
    const w2 = mkWorkout()
    const r = recordsFromHistory([
      { workout: w1, logged: { sets: [mkSet({ weight: 100, reps: 5 }), mkSet({ weight: 100, reps: 5 })] } },
      { workout: w1, logged: { sets: [mkSet({ weight: 50, reps: 10 })] } },
      { workout: w2, logged: { sets: [mkSet({ weight: 200, reps: 3 })] } },
    ], 'weight_reps', null, false)
    expect(r.sessionVolume).toBe(1500)
  })
  it('ignores incomplete sets and warm-ups unless enabled', () => {
    const sets = [
      mkSet({ weight: 140, reps: 3, setType: 'warmup' }),
      mkSet({ weight: 150, reps: 3, completed: false }),
      mkSet({ weight: 100, reps: 5 }),
    ]
    expect(recordsFromHistory([entry(sets)], 'weight_reps', null, false).weight).toBe(100)
    expect(recordsFromHistory([entry(sets)], 'weight_reps', null, true).weight).toBe(140)
  })
  it('weighted bodyweight: weight record is added load; 1RM/volume use bodyweight total', () => {
    const r = recordsFromHistory([entry([mkSet({ weight: 20, reps: 5 })], { bodyweightKg: 80 })], 'weighted_bodyweight', null, false)
    expect(r.weight).toBe(20)
    expect(r.volume).toBe(500)
    expect(r.oneRm).toBeCloseTo(100 * (1 + 5 / 30), 6)
  })
  it('workout bodyweight overrides the fallback', () => {
    const r = recordsFromHistory([entry([mkSet({ weight: 0, reps: 10 })], { bodyweightKg: 90 })], 'weighted_bodyweight', 70, false)
    expect(r.volume).toBe(900)
    const r2 = recordsFromHistory([entry([mkSet({ weight: 0, reps: 10 })], { bodyweightKg: null })], 'weighted_bodyweight', 70, false)
    expect(r2.volume).toBe(700)
  })
  it('assisted: weight record stays 0, reps tracked', () => {
    const r = recordsFromHistory([entry([mkSet({ weight: 30, reps: 8 })], { bodyweightKg: 80 })], 'assisted_bodyweight', null, false)
    expect(r.weight).toBe(0)
    expect(r.reps).toBe(8)
  })
  it('tracks duration and distance', () => {
    const r = recordsFromHistory([entry([mkSet({ durationSec: 600, distanceM: 2000 }), mkSet({ durationSec: 500, distanceM: 2500 })])], 'distance_duration', null, false)
    expect(r.duration).toBe(600)
    expect(r.distance).toBe(2500)
  })
  it('empty history gives empty records', () => {
    expect(recordsFromHistory([], 'weight_reps', null, false)).toEqual(emptyRecords())
  })
})

describe('findSessionPRs', () => {
  const ex = mkEx('weight_reps')
  const base = { ...emptyRecords(), weight: 100, oneRm: 110, volume: 500, reps: 10 }

  it('badges only the single best set per kind, not repeats', () => {
    const a = mkSet({ weight: 110, reps: 5 })
    const b = mkSet({ weight: 110, reps: 5 })
    const c = mkSet({ weight: 110, reps: 5 })
    const prs = findSessionPRs([a, b, c], ex, base, null)
    expect([...prs.keys()]).toEqual([a.id]) // ties go to the first set
    expect(prs.get(a.id)).toEqual(expect.arrayContaining(['weight', 'oneRm', 'volume']))
  })
  it('different kinds may land on different sets', () => {
    const heavy = mkSet({ weight: 120, reps: 1 })
    const manyReps = mkSet({ weight: 60, reps: 15 })
    const prs = findSessionPRs([heavy, manyReps], ex, base, null)
    expect(prs.get(heavy.id)).toContain('weight')
    expect(prs.get(manyReps.id)).toContain('reps')
    expect(prs.get(manyReps.id)).not.toContain('weight')
  })
  it('equal-to-baseline is not a PR (strictly greater)', () => {
    const b = { ...emptyRecords(), weight: 100, reps: 10, oneRm: 1000, volume: 1000 }
    expect(findSessionPRs([mkSet({ weight: 100, reps: 10 })], ex, b, null).size).toBe(0)
  })
  it('skips incomplete sets and warm-ups unless countWarmups', () => {
    const warm = mkSet({ weight: 200, reps: 1, setType: 'warmup' })
    const todo = mkSet({ weight: 300, reps: 1, completed: false })
    expect(findSessionPRs([warm, todo], ex, base, null).size).toBe(0)
    expect(findSessionPRs([warm], ex, base, null, true).has(warm.id)).toBe(true)
  })
  it('first-ever session with empty baseline badges the best set', () => {
    const s = mkSet({ weight: 50, reps: 5 })
    expect(findSessionPRs([s], ex, emptyRecords(), null).get(s.id)).toEqual(expect.arrayContaining(['weight', 'reps']))
  })
  it('assisted and bodyweight exercises only earn reps PRs', () => {
    const asst = mkEx('assisted_bodyweight')
    const s = mkSet({ weight: 20, reps: 8 })
    expect(findSessionPRs([s], asst, emptyRecords(), 80).get(s.id)).toEqual(['reps'])
    const bw = mkEx('bodyweight_reps')
    const s2 = mkSet({ reps: 12 })
    expect(findSessionPRs([s2], bw, emptyRecords(), 80).get(s2.id)).toEqual(['reps'])
  })
  it('weighted bodyweight: weight PR compares added load only', () => {
    const wb = mkEx('weighted_bodyweight')
    const s = mkSet({ weight: 10, reps: 5 })
    const prs = findSessionPRs([s], wb, { ...emptyRecords(), weight: 10 }, 100)
    expect(prs.get(s.id)).not.toContain('weight')
  })
  it('duration/distance kinds', () => {
    const run = mkEx('distance_duration')
    const s = mkSet({ durationSec: 100, distanceM: 400 })
    expect(findSessionPRs([s], run, { ...emptyRecords(), duration: 90, distance: 500 }, null).get(s.id)).toEqual(['duration'])
  })
})

describe('DB-backed record loading', () => {
  it('judges a past session against prior history only, ignoring later, active and excluded workouts', async () => {
    const ex = mkEx('weight_reps')
    const mk = (startedAt: number, weight: number, status: 'done' | 'active' = 'done') =>
      mkWorkout({ startedAt, finishedAt: startedAt + 1, status, exercises: [mkLogged(ex.id, [mkSet({ weight, reps: 5 })])] })
    const early = mk(1000, 60)
    const mid = mk(2000, 100)
    const late = mk(3000, 140)
    const act = mk(4000, 500, 'active')
    await db.workouts.bulkPut([early, mid, late, act])

    expect((await loadRecordsBefore(ex.id, 'weight_reps', null, 2000, false)).weight).toBe(60) // strictly before
    expect((await loadRecordsBefore(ex.id, 'weight_reps', null, 1000, false)).weight).toBe(0)
    expect((await loadRecords(ex.id, 'weight_reps', null, false)).weight).toBe(140)
    expect((await loadRecords(ex.id, 'weight_reps', null, false, late.id)).weight).toBe(100)

    const m = new Map([[ex.id, ex]])
    const prsMid = await prsForWorkout(mid, m, null)
    expect([...prsMid.values()].flat()).toContain('weight') // 100 > 60
    expect((await prsForWorkout(early, m, null)).size).toBe(1) // first ever
    // late is judged against early+mid only (not the active session)
    expect([...(await prsForWorkout(late, m, null)).values()].flat()).toContain('weight')
  })

  it('prsForWorkout skips unknown exercises', async () => {
    const w = mkWorkout({ exercises: [mkLogged('nope', [mkSet({ weight: 1, reps: 1 })])] })
    expect((await prsForWorkout(w, new Map(), null)).size).toBe(0)
  })

  it('loadSetRecords: heaviest per rep count, ties keep earlier date, warm-ups gated', async () => {
    const ex = mkEx('weight_reps')
    const w1 = mkWorkout({ startedAt: 100, finishedAt: 200, exercises: [mkLogged(ex.id, [
      mkSet({ weight: 100, reps: 5 }), mkSet({ weight: 80, reps: 12 }), mkSet({ weight: 150, reps: 1, setType: 'warmup' }), mkSet({ weight: 0, reps: 5 }),
    ])] })
    const w2 = mkWorkout({ startedAt: 300, finishedAt: 400, exercises: [mkLogged(ex.id, [
      mkSet({ weight: 100, reps: 5 }), mkSet({ weight: 85, reps: 12 }), mkSet({ weight: 90, reps: 3, completed: false }),
    ])] })
    await db.workouts.bulkPut([w2, w1])
    expect(await loadSetRecords(ex.id, 'weight_reps', false)).toEqual([
      { reps: 5, weightKg: 100, achievedAt: 200 },
      { reps: 12, weightKg: 85, achievedAt: 400 },
    ])
    const withWarm = await loadSetRecords(ex.id, 'weight_reps', true)
    expect(withWarm.map((r) => r.reps)).toEqual([1, 5, 12])
  })
  it('loadSetRecords is empty for kinds without weight+reps', async () => {
    expect(await loadSetRecords('x', 'bodyweight_reps', false)).toEqual([])
    expect(await loadSetRecords('x', 'duration', false)).toEqual([])
  })
  it('loadSetRecords: assisted exercises record nothing since prWeight is 0', async () => {
    const ex = mkEx('assisted_bodyweight')
    await db.workouts.put(mkWorkout({ exercises: [mkLogged(ex.id, [mkSet({ weight: 30, reps: 5 })])] }))
    expect(await loadSetRecords(ex.id, 'assisted_bodyweight', false)).toEqual([])
  })
})
