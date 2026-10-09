import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  TIME_RANGES,
  computeStreaks,
  exerciseProgress,
  exerciseSparklines,
  firstWorkoutAt,
  isMilestoneWorkoutCount,
  metricsFor,
  muscleDistribution,
  overallTotals,
  startOfWeek,
  volumeByDay,
  volumeByWeek,
  withinRange,
} from '../../src/lib/stats'
import type { ExerciseKind } from '../../src/db/types'
import { mkEx, mkLogged, mkSet, mkWorkout } from './helpers'

const DAY = 86_400_000
// Local-time constructor, month is 1-based. June-August 2026 contains no DST
// transition in either the northern or southern hemisphere zones we test in.
const L = (m: number, d: number, h = 12, min = 0, y = 2026) => new Date(y, m - 1, d, h, min).getTime()
const NOW = L(8, 26, 12) // Wednesday 26 Aug 2026
const at = (ts: number, o = {}) => mkWorkout({ startedAt: ts, finishedAt: ts + 3_600_000, ...o })

describe('startOfWeek', () => {
  it('Monday-start', () => {
    expect(startOfWeek(NOW, 1)).toBe(L(8, 24, 0))
    expect(startOfWeek(L(8, 24, 0, 0), 1)).toBe(L(8, 24, 0)) // exactly on the boundary
    expect(startOfWeek(L(8, 23, 23, 59), 1)).toBe(L(8, 17, 0)) // Sunday belongs to the previous week
    expect(startOfWeek(L(8, 30, 23, 59), 1)).toBe(L(8, 24, 0))
  })
  it('Sunday-start', () => {
    expect(startOfWeek(NOW, 0)).toBe(L(8, 23, 0))
    expect(startOfWeek(L(8, 23, 0, 1), 0)).toBe(L(8, 23, 0))
    expect(startOfWeek(L(8, 22, 23, 59), 0)).toBe(L(8, 16, 0))
    expect(startOfWeek(L(8, 29, 23, 59), 0)).toBe(L(8, 23, 0))
  })
  it('the two settings disagree only on Sundays', () => {
    expect(startOfWeek(L(8, 25), 0)).not.toBe(startOfWeek(L(8, 25), 1))
    expect(startOfWeek(L(8, 25), 0) - startOfWeek(L(8, 25), 1)).toBe(-DAY)
  })
  it('crosses month and year boundaries', () => {
    expect(startOfWeek(L(1, 1, 12, 0, 2026), 1)).toBe(L(12, 29, 0, 0, 2025)) // Thu 1 Jan 2026
  })
})

describe('overallTotals / firstWorkoutAt / isMilestoneWorkoutCount', () => {
  it('sums cached totals and elapsed time', () => {
    const w1 = mkWorkout({ startedAt: 0, finishedAt: 60_000, totalVolumeKg: 100, totalSets: 3, totalReps: 20 })
    const w2 = mkWorkout({
      startedAt: 0,
      finishedAt: 120_000,
      pausedSec: 20,
      totalVolumeKg: 50,
      totalSets: 2,
      totalReps: 10,
    })
    expect(overallTotals([w1, w2])).toEqual({ workouts: 2, volumeKg: 150, sets: 5, reps: 30, durationSec: 160 })
    expect(overallTotals([])).toEqual({ workouts: 0, volumeKg: 0, sets: 0, reps: 0, durationSec: 0 })
  })
  it('firstWorkoutAt', () => {
    expect(firstWorkoutAt([])).toBeNull()
    expect(firstWorkoutAt([at(500), at(100), at(900)])).toBe(100)
  })
  it('milestone counts', () => {
    const yes = [1, 10, 25, 50, 100, 200, 1000]
    const no = [0, 2, 9, 11, 24, 26, 49, 51, 99, 101, 150, 199]
    yes.forEach((n) => expect(isMilestoneWorkoutCount(n), `n=${n}`).toBe(true))
    no.forEach((n) => expect(isMilestoneWorkoutCount(n), `n=${n}`).toBe(false))
  })
})

describe('computeStreaks', () => {
  const wk = (m: number, d: number) => at(L(m, d, 18))

  it('no workouts', () => {
    expect(computeStreaks([], 1, NOW)).toEqual({ currentWeeks: 0, longestWeeks: 0, daysThisWeek: 0 })
  })
  it('counts consecutive weeks back from this week, and finds the longest run', () => {
    const ws = [
      wk(6, 22),
      wk(6, 29),
      wk(7, 6),
      wk(7, 13), // run of 4
      wk(8, 3),
      wk(8, 10),
      wk(8, 17),
      wk(8, 24), // run of 4 including this week
    ]
    // Jul 20 and Jul 27 weeks are missing, so two runs of 4
    const s = computeStreaks(ws, 1, NOW)
    expect(s.currentWeeks).toBe(4)
    expect(s.longestWeeks).toBe(4)
  })
  it('streak stays alive when only last week is trained', () => {
    const s = computeStreaks([wk(8, 3), wk(8, 10), wk(8, 17)], 1, NOW)
    expect(s.currentWeeks).toBe(3)
  })
  it('streak is broken after a fully missed week', () => {
    const s = computeStreaks([wk(8, 3), wk(8, 10)], 1, NOW) // nothing in Aug 17 or Aug 24 weeks
    expect(s.currentWeeks).toBe(0)
    expect(s.longestWeeks).toBe(2)
  })
  it('a gap resets the longest-run counter', () => {
    const s = computeStreaks([wk(6, 22), wk(7, 6), wk(7, 13), wk(7, 20)], 1, NOW)
    expect(s.longestWeeks).toBe(3)
  })
  it('multiple workouts in one week count as one week', () => {
    const s = computeStreaks([wk(8, 24), at(L(8, 25, 9)), at(L(8, 26, 7))], 1, NOW)
    expect(s.currentWeeks).toBe(1)
    expect(s.longestWeeks).toBe(1)
  })
  it('week boundary depends on the first-day setting', () => {
    // Sun 23 Aug and Mon 24 Aug: same week if Sunday starts the week, adjacent weeks if Monday does.
    const ws = [at(L(8, 23, 12)), at(L(8, 24, 12))]
    expect(computeStreaks(ws, 0, NOW).longestWeeks).toBe(1)
    expect(computeStreaks(ws, 1, NOW).longestWeeks).toBe(2)
  })
  it('daysThisWeek counts distinct days within the last 7 days', () => {
    const ws = [
      at(L(8, 26, 8)),
      at(L(8, 26, 11)), // same day, counted once
      at(L(8, 25, 12)),
      at(L(8, 19, 11)), // older than 7 days (now is 12:00 on the 26th)
      at(L(8, 19, 12)), // exactly 7 days ago: included
    ]
    expect(computeStreaks(ws, 1, NOW).daysThisWeek).toBe(3)
  })
})

describe('volumeByWeek', () => {
  it('returns one entry per week, oldest first, including empty weeks', () => {
    const ws = [
      at(L(8, 24, 10), { totalVolumeKg: 1000, totalSets: 10 }),
      at(L(8, 26, 10), { totalVolumeKg: 500, totalSets: 5 }),
      at(L(8, 10, 10), { totalVolumeKg: 700, totalSets: 7 }),
      at(L(1, 5, 10), { totalVolumeKg: 9999, totalSets: 99 }), // outside the window
    ]
    const r = volumeByWeek(ws, 1, 4, NOW)
    expect(r.map((p) => p.weekStart)).toEqual([L(8, 3, 0), L(8, 10, 0), L(8, 17, 0), L(8, 24, 0)])
    expect(r.map((p) => p.volumeKg)).toEqual([0, 700, 0, 1500])
    expect(r.map((p) => p.workouts)).toEqual([0, 1, 0, 2])
    expect(r.map((p) => p.sets)).toEqual([0, 7, 0, 15])
  })
  it('defaults to 12 weeks', () => expect(volumeByWeek([], 1, undefined, NOW)).toHaveLength(12))
  it('honours the first-day setting for bucketing', () => {
    const sunday = at(L(8, 23, 10), { totalVolumeKg: 100 })
    expect(volumeByWeek([sunday], 1, 2, NOW)[0].volumeKg).toBe(100) // belongs to week of Aug 17
    expect(volumeByWeek([sunday], 0, 2, NOW)[1].volumeKg).toBe(100) // starts the week of Aug 23
  })
})

describe('volumeByDay', () => {
  it('returns `days` entries ending today', () => {
    const r = volumeByDay([], 7, NOW)
    expect(r).toHaveLength(7)
    expect(r[6].day).toBe(L(8, 26, 0))
    expect(r[0].day).toBe(L(8, 20, 0))
  })
  it('buckets by local day, incl. edges, and ignores out-of-range', () => {
    const ws = [
      at(L(8, 26, 0, 0), { totalVolumeKg: 10 }),
      at(L(8, 26, 23, 59), { totalVolumeKg: 20 }),
      at(L(8, 25, 23, 59), { totalVolumeKg: 5 }),
      at(L(8, 19, 23, 59), { totalVolumeKg: 99 }), // day before the window
      at(L(8, 27, 1, 0), { totalVolumeKg: 99 }), // future
    ]
    const r = volumeByDay(ws, 7, NOW)
    expect(r[6]).toEqual({ day: L(8, 26, 0), volumeKg: 30, workouts: 2 })
    expect(r[5]).toEqual({ day: L(8, 25, 0), volumeKg: 5, workouts: 1 })
    expect(r.reduce((a, p) => a + p.workouts, 0)).toBe(3)
  })
  it('defaults to 119 days', () => expect(volumeByDay([], undefined, NOW)).toHaveLength(119))
})

describe('muscleDistribution', () => {
  const bench = mkEx('weight_reps', { muscleGroup: 'Chest', secondaryMuscles: ['Triceps'] })
  const squat = mkEx('weight_reps', { muscleGroup: 'Quadriceps' })
  const pullup = mkEx('weighted_bodyweight', { muscleGroup: 'Back' })
  const map = new Map([bench, squat, pullup].map((e) => [e.id, e]))

  it('attributes to primary muscle only, sorted by sets desc', () => {
    const w = mkWorkout({
      exercises: [
        mkLogged(bench.id, [mkSet({ weight: 100, reps: 5 }), mkSet({ weight: 100, reps: 5 })]),
        mkLogged(squat.id, [
          mkSet({ weight: 100, reps: 5 }),
          mkSet({ weight: 100, reps: 5 }),
          mkSet({ weight: 100, reps: 5 }),
        ]),
      ],
    })
    const r = muscleDistribution([w], map, null)
    expect(r.map((s) => s.muscle)).toEqual(['Quadriceps', 'Chest'])
    expect(r[0]).toEqual({ muscle: 'Quadriceps', sets: 3, volumeKg: 1500 })
    expect(r.find((s) => s.muscle === 'Triceps')).toBeUndefined()
  })
  it('warm-ups and incomplete sets excluded unless enabled', () => {
    const w = mkWorkout({
      exercises: [
        mkLogged(bench.id, [
          mkSet({ weight: 40, reps: 10, setType: 'warmup' }),
          mkSet({ weight: 100, reps: 5, completed: false }),
          mkSet({ weight: 100, reps: 5 }),
        ]),
      ],
    })
    expect(muscleDistribution([w], map, null)[0]).toMatchObject({ sets: 1, volumeKg: 500 })
    expect(muscleDistribution([w], map, null, true)[0]).toMatchObject({ sets: 2, volumeKg: 900 })
  })
  it('workout bodyweight beats the fallback for bodyweight movements', () => {
    const w = mkWorkout({ bodyweightKg: 90, exercises: [mkLogged(pullup.id, [mkSet({ weight: 10, reps: 5 })])] })
    expect(muscleDistribution([w], map, 70)[0].volumeKg).toBe(500)
    const w2 = mkWorkout({ bodyweightKg: null, exercises: [mkLogged(pullup.id, [mkSet({ weight: 10, reps: 5 })])] })
    expect(muscleDistribution([w2], map, 70)[0].volumeKg).toBe(400)
  })
  it('sets without reps count as sets but add no volume; unknown exercises skipped', () => {
    const w = mkWorkout({
      exercises: [
        mkLogged(bench.id, [mkSet({ weight: 100, reps: null })]),
        mkLogged('ghost', [mkSet({ weight: 1, reps: 1 })]),
      ],
    })
    expect(muscleDistribution([w], map, null)).toEqual([{ muscle: 'Chest', sets: 1, volumeKg: 0 }])
  })
  it('empty', () => expect(muscleDistribution([], map, null)).toEqual([]))
})

describe('metricsFor', () => {
  it.each<[ExerciseKind, string[]]>([
    ['weight_reps', ['heaviest', 'oneRm', 'volume', 'reps', 'maxReps', 'sets']],
    ['weighted_bodyweight', ['heaviest', 'oneRm', 'volume', 'reps', 'maxReps', 'sets']],
    ['assisted_bodyweight', ['reps', 'maxReps', 'sets']],
    ['bodyweight_reps', ['reps', 'maxReps', 'sets']],
    ['reps_only', ['reps', 'maxReps', 'sets']],
    ['duration', ['duration', 'sets']],
    ['duration_weight', ['heaviest', 'duration', 'sets']],
    ['distance_duration', ['distance', 'duration', 'sets']],
  ])('%s', (kind, expected) => expect(metricsFor(kind)).toEqual(expected))
})

describe('exerciseProgress', () => {
  const ex = mkEx('weight_reps')
  const hist = (...sessions: { at: number; sets: ReturnType<typeof mkSet>[]; w?: object }[]) =>
    sessions.map((s) => ({ workout: at(s.at, s.w), logged: { sets: s.sets } }))

  it('computes each metric per session and sorts oldest first (input is newest first)', () => {
    const h = hist(
      { at: L(8, 20), sets: [mkSet({ weight: 100, reps: 5 }), mkSet({ weight: 80, reps: 10 })] },
      { at: L(8, 10), sets: [mkSet({ weight: 90, reps: 5 })] },
    )
    const get = (m: Parameters<typeof exerciseProgress>[2]) => exerciseProgress(h, ex, m, null).map((p) => p.value)
    expect(exerciseProgress(h, ex, 'heaviest', null).map((p) => p.date)).toEqual([
      L(8, 10) + 3_600_000,
      L(8, 20) + 3_600_000,
    ])
    expect(get('heaviest')).toEqual([90, 100])
    expect(get('volume')).toEqual([450, 1300])
    expect(get('reps')).toEqual([5, 15])
    expect(get('maxReps')).toEqual([5, 10])
    expect(get('sets')).toEqual([1, 2])
    const oneRm = get('oneRm')
    expect(oneRm[0]).toBeCloseTo(90 * (1 + 5 / 30), 6)
    expect(oneRm[1]).toBeCloseTo(Math.max(100 * (1 + 5 / 30), 80 * (1 + 10 / 30)), 6)
  })
  it('skips sessions with no countable sets, and zero-value points', () => {
    const h = hist(
      { at: L(8, 20), sets: [mkSet({ weight: 50, reps: 5, setType: 'warmup' })] },
      { at: L(8, 19), sets: [mkSet({ weight: 50, reps: 5, completed: false })] },
      { at: L(8, 18), sets: [mkSet({ weight: null, reps: null })] },
    )
    expect(exerciseProgress(h, ex, 'heaviest', null)).toEqual([])
    expect(exerciseProgress(h, ex, 'volume', null)).toEqual([])
    expect(exerciseProgress(h, ex, 'sets', null).map((p) => p.value)).toEqual([1]) // the empty-but-completed set
  })
  it('warm-ups are included when asked', () => {
    const h = hist({ at: L(8, 20), sets: [mkSet({ weight: 50, reps: 5, setType: 'warmup' })] })
    expect(exerciseProgress(h, ex, 'heaviest', null, true).map((p) => p.value)).toEqual([50])
  })
  it('weighted bodyweight: heaviest is added load, 1RM/volume use total load', () => {
    const wb = mkEx('weighted_bodyweight')
    const h = hist({ at: L(8, 20), sets: [mkSet({ weight: 20, reps: 5 })], w: { bodyweightKg: 80 } })
    expect(exerciseProgress(h, wb, 'heaviest', 70).map((p) => p.value)).toEqual([20])
    expect(exerciseProgress(h, wb, 'volume', 70).map((p) => p.value)).toEqual([500]) // 80 from the workout, not 70
    const h2 = hist({ at: L(8, 20), sets: [mkSet({ weight: 20, reps: 5 })] })
    expect(exerciseProgress(h2, wb, 'volume', 70).map((p) => p.value)).toEqual([450])
  })
  it('assisted: heaviest is 0 so produces no points; reps still plot', () => {
    const a = mkEx('assisted_bodyweight')
    const h = hist({ at: L(8, 20), sets: [mkSet({ weight: 30, reps: 8 })] })
    expect(exerciseProgress(h, a, 'heaviest', 80)).toEqual([])
    expect(exerciseProgress(h, a, 'maxReps', 80).map((p) => p.value)).toEqual([8])
  })
  it('duration and distance take the best set', () => {
    const run = mkEx('distance_duration')
    const h = hist({
      at: L(8, 20),
      sets: [mkSet({ durationSec: 600, distanceM: 2000 }), mkSet({ durationSec: 900, distanceM: 1500 })],
    })
    expect(exerciseProgress(h, run, 'duration', null)[0].value).toBe(900)
    expect(exerciseProgress(h, run, 'distance', null)[0].value).toBe(2000)
  })
  it('uses startedAt when unfinished and records workoutId', () => {
    const w = mkWorkout({ startedAt: 777, finishedAt: null })
    const [p] = exerciseProgress(
      [{ workout: w, logged: { sets: [mkSet({ weight: 10, reps: 1 })] } }],
      ex,
      'heaviest',
      null,
    )
    expect(p).toEqual({ date: 777, value: 10, workoutId: w.id })
  })
})

describe('exerciseSparklines', () => {
  const bench = mkEx('weight_reps')
  const pushups = mkEx('bodyweight_reps')
  const map = new Map([bench, pushups].map((e) => [e.id, e]))
  const session = (day: number, ex: ReturnType<typeof mkEx>, weight: number | null, reps: number, o = {}) =>
    at(L(7, day), { exercises: [mkLogged(ex.id, [mkSet({ weight, reps })])], ...o })

  it('uses estimated 1RM for loaded lifts, oldest first, capped to maxPoints', () => {
    const ws = [1, 2, 3, 4, 5].map((d) => session(d, bench, 100 + d, 1))
    const r = exerciseSparklines(ws, map, null, false, 3)
    expect(r.get(bench.id)).toEqual([103, 104, 105])
  })
  it('falls back to reps for bodyweight movements', () => {
    const ws = [session(1, pushups, null, 10), session(2, pushups, null, 12)]
    expect(exerciseSparklines(ws, map, 80).get(pushups.id)).toEqual([10, 12])
  })
  it('omits exercises with fewer than two points, active sessions and unknown exercises', () => {
    const ghost = mkEx('weight_reps')
    const ws = [
      session(1, bench, 100, 1),
      session(2, bench, 110, 1, { status: 'active' }),
      session(1, ghost, 50, 1),
      session(2, ghost, 60, 1),
    ]
    const r = exerciseSparklines(ws, map, null)
    expect(r.has(bench.id)).toBe(false)
    expect(r.has(ghost.id)).toBe(false)
  })
})

describe('withinRange', () => {
  const pts = [0, 10, 89, 90, 91, 200, 400].map((d) => ({ date: NOW - d * DAY }))
  it('3m keeps points up to 90 days old (inclusive)', () => {
    expect(withinRange(pts, '3m', NOW).map((p) => Math.round((NOW - p.date) / DAY))).toEqual([0, 10, 89, 90])
  })
  it('6m and 1y', () => {
    expect(withinRange(pts, '6m', NOW)).toHaveLength(5)
    expect(withinRange(pts, '1y', NOW)).toHaveLength(6)
  })
  it('all returns everything', () => expect(withinRange(pts, 'all', NOW)).toEqual(pts))
  it('ranges are defined as expected', () => {
    expect(TIME_RANGES.map((r) => r.days)).toEqual([90, 180, 365, Infinity])
  })
})

// A local week containing a daylight-saving change is 167h or 169h long, so
// week and day boundaries cannot be found by adding fixed 7*24h / 24h steps.
// Each case pins the process timezone (Date reads TZ live) to a zone with DST,
// one northern and one southern, so these run the same on any machine.
function dstTransitionDay(): Date {
  for (let d = 0; d < 365; d++) {
    const a = new Date(2026, 0, 1 + d, 12)
    const b = new Date(2026, 0, 2 + d, 12)
    if (a.getTimezoneOffset() !== b.getTimezoneOffset()) return new Date(2026, 0, 2 + d, 12)
  }
  throw new Error('no DST transition in 2026 for ' + process.env.TZ)
}

describe.each(['America/Los_Angeles', 'Pacific/Auckland'])('DST robustness (%s)', (zone) => {
  const originalTz = process.env.TZ
  let t: Date
  beforeAll(() => {
    process.env.TZ = zone
    t = dstTransitionDay()
  })
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })
  const local = (dayOffset: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + dayOffset, 12).getTime()

  it('computeStreaks counts consecutive weeks across a DST change', () => {
    // Monday-start weeks: pick one workout in each of the two weeks around the change.
    const monday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7), 12).getTime()
    const prevWeek = new Date(
      new Date(monday).getFullYear(),
      new Date(monday).getMonth(),
      new Date(monday).getDate() - 7,
      12,
    ).getTime()
    const s = computeStreaks([at(prevWeek), at(monday)], 1, monday)
    expect(s.longestWeeks).toBe(2)
    expect(s.currentWeeks).toBe(2)
  })
  it('volumeByWeek still buckets a workout from before the DST change', () => {
    const total = volumeByWeek([at(local(-10), { totalVolumeKg: 100 })], 1, 6, local(10)).reduce(
      (a, p) => a + p.volumeKg,
      0,
    )
    expect(total).toBe(100)
  })
  it('volumeByWeek keys are all real week starts', () => {
    const keys = volumeByWeek([], 1, 8, local(10)).map((p) => p.weekStart)
    for (const k of keys) expect(startOfWeek(k, 1)).toBe(k)
  })
  it('volumeByDay still buckets a workout from before the DST change', () => {
    const total = volumeByDay([at(local(-3), { totalVolumeKg: 100 })], 10, local(3)).reduce((a, p) => a + p.volumeKg, 0)
    expect(total).toBe(100)
  })
  it('volumeByDay produces one distinct midnight-aligned day per step', () => {
    const days = volumeByDay([], 10, local(3)).map((p) => p.day)
    expect(new Set(days).size).toBe(10)
    for (const d of days) expect(new Date(d).getHours()).toBe(0)
  })
})
