import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  REST_OVERDUE_DAYS,
  REST_READY_DAYS,
  RECOVERY_STALE_DAYS,
  habitWindow,
  homeStatus,
  muscleRecovery,
  nextMilestone,
  restState,
  suggestNextRoutine,
  suggestedWeeklyGoal,
  weekProgress,
  type MuscleRecovery,
  type WeekProgress,
} from '../../src/lib/home'
import type { Routine } from '../../src/db/types'
import { mkEx, mkLogged, mkSet, mkWorkout, uid } from './helpers'

const DAY = 86_400_000
// Local time, 1-based month. Jun-Aug 2026 has no DST change in US or NZ zones.
const L = (m: number, d: number, h = 12, min = 0, y = 2026) => new Date(y, m - 1, d, h, min).getTime()
const NOW = L(8, 26, 12) // Wednesday 26 Aug 2026
const done = (ts: number, o = {}) => mkWorkout({ startedAt: ts, finishedAt: ts + 3_600_000, ...o })

describe('weekProgress', () => {
  const wk = (n: number, base = L(8, 24, 10)) => Array.from({ length: n }, (_, i) => done(base + i * 3_600_000))

  it('Wednesday, Monday start: daysLeft counts today', () => {
    expect(weekProgress([], 1, 4, NOW).daysLeft).toBe(5)
    expect(weekProgress([], 1, 4, L(8, 24, 0, 0)).daysLeft).toBe(7)
    expect(weekProgress([], 1, 4, L(8, 30, 23, 59)).daysLeft).toBe(1)
  })
  it('Sunday start shifts the week', () => {
    expect(weekProgress([], 0, 4, L(8, 23, 9)).daysLeft).toBe(7)
    expect(weekProgress([], 0, 4, NOW).daysLeft).toBe(4)
  })
  it('hit when done >= goal, or goal is 0', () => {
    expect(weekProgress(wk(4), 1, 4, NOW).state).toBe('hit')
    expect(weekProgress(wk(5), 1, 4, NOW).state).toBe('hit')
    expect(weekProgress([], 1, 0, NOW).state).toBe('hit')
  })
  it('counts only done workouts in the current week', () => {
    const ws = [
      done(L(8, 24, 0, 0)), // exactly the week start: counts
      done(L(8, 23, 23, 59)), // previous week
      done(L(8, 31, 0, 0)), // next week
      done(L(8, 25), { status: 'active' }),
    ]
    expect(weekProgress(ws, 1, 4, NOW).done).toBe(1)
    expect(weekProgress(ws, 0, 4, NOW).done).toBe(2) // Sunday-start: Aug 23 belongs to this week
  })
  it('at risk once remaining > 75% of days left (4/week goal)', () => {
    expect(weekProgress([], 1, 4, NOW).state).toBe('atRisk') // Wed, 0 done
    expect(weekProgress([], 1, 4, L(8, 25)).state).toBe('onTrack') // Tue, 0 done: 4 <= 6*.75
    expect(weekProgress(wk(1), 1, 4, L(8, 27)).state).toBe('onTrack') // Thu, 1 done: 3 <= 4*.75
    expect(weekProgress(wk(1), 1, 4, L(8, 28)).state).toBe('atRisk') // Fri, 1 done
    expect(weekProgress(wk(2), 1, 4, L(8, 28)).state).not.toBe('atRisk') // Fri, 2 done
    expect(weekProgress(wk(2), 1, 4, L(8, 29)).state).toBe('atRisk') // Sat, 2 done
  })
  it('ahead when comfortably over linear pace, else onTrack', () => {
    const p = weekProgress(wk(3), 1, 4, NOW)
    expect(p).toMatchObject({ done: 3, goal: 4, daysLeft: 5, state: 'ahead' })
    expect(weekProgress(wk(2), 1, 4, NOW).state).toBe('onTrack')
  })
  it('Sunday evening with the goal one short is at risk', () => {
    expect(weekProgress(wk(2), 1, 3, L(8, 30, 20)).state).toBe('atRisk')
  })
})

describe('suggestedWeeklyGoal', () => {
  // NOW is Wed 26 Aug; the three complete weeks before it start Aug 3, 10, 17.
  const inWeek = (weekStart: [number, number], n: number) =>
    Array.from({ length: n }, (_, i) => done(L(weekStart[0], weekStart[1] + (i % 5), 10 + i)))

  it('null without enough history', () => {
    expect(suggestedWeeklyGoal([], 1, NOW)).toBeNull()
    expect(suggestedWeeklyGoal([...inWeek([8, 10], 3), ...inWeek([8, 17], 3)], 1, NOW)).toBeNull() // two complete weeks
  })
  it('does not count the in-progress week', () => {
    const ws = [...inWeek([8, 17], 3), ...inWeek([8, 24], 6)]
    expect(suggestedWeeklyGoal(ws, 1, NOW)).toBeNull() // only Aug 17 is complete
  })
  it('uses the median of complete weeks since first workout', () => {
    const ws = [...inWeek([8, 3], 3), ...inWeek([8, 10], 3), ...inWeek([8, 17], 3)]
    expect(suggestedWeeklyGoal(ws, 1, NOW)).toBe(3)
  })
  it('a deload week does not drag the median down', () => {
    const ws = [...inWeek([8, 3], 4), ...inWeek([8, 10], 1), ...inWeek([8, 17], 4)]
    expect(suggestedWeeklyGoal(ws, 1, NOW)).toBe(4)
  })
  it('clamps to 2..6', () => {
    expect(suggestedWeeklyGoal([...inWeek([8, 3], 1), ...inWeek([8, 10], 1), ...inWeek([8, 17], 1)], 1, NOW)).toBe(2)
    expect(suggestedWeeklyGoal([...inWeek([8, 3], 7), ...inWeek([8, 10], 7), ...inWeek([8, 17], 7)], 1, NOW)).toBe(6)
  })
  it('ignores active workouts', () => {
    const ws = [...inWeek([8, 3], 3), ...inWeek([8, 10], 3), ...inWeek([8, 17], 3), done(L(8, 5), { status: 'active' })]
    expect(suggestedWeeklyGoal(ws, 1, NOW)).toBe(3)
  })
  it('weeks before the first workout are not counted as zeros', () => {
    // First workout Aug 10: complete weeks are Aug 10 and Aug 17 only -> too few
    expect(suggestedWeeklyGoal([...inWeek([8, 10], 4), ...inWeek([8, 17], 4)], 1, NOW)).toBeNull()
  })
})

describe('suggestNextRoutine', () => {
  const mkRoutine = (exerciseIds: string[], order: number, name = `R${order}`): Routine => ({
    id: uid('r'),
    name,
    folderId: null,
    order,
    createdAt: 0,
    updatedAt: 0,
    exercises: exerciseIds.map((exerciseId) => ({ id: uid('re'), exerciseId, supersetGroup: null, sets: [] })),
  })
  const trained = (exerciseId: string, daysAgo: number, o = {}) =>
    done(NOW - daysAgo * DAY, { exercises: [mkLogged(exerciseId, [mkSet()])], ...o })

  it('null with no routines', () => expect(suggestNextRoutine([], [], NOW)).toBeNull())

  it('picks the routine whose exercises are most rested', () => {
    const push = mkRoutine(['bench'], 0)
    const pull = mkRoutine(['row'], 1)
    const r = suggestNextRoutine([push, pull], [trained('bench', 2), trained('row', 9)], NOW)
    expect(r?.routine.id).toBe(pull.id)
    expect(r?.avgDaysSince).toBeCloseTo(9 - 1 / 24, 6) // measured from finishedAt (start + 1h)
    expect(r?.newCount).toBe(0)
  })
  it('averages per exercise, so shared lifts do not make both routines due', () => {
    const a = mkRoutine(['squat', 'bench'], 0)
    const b = mkRoutine(['deadlift', 'bench'], 1)
    // bench done yesterday; squat 10d, deadlift 6d
    const r = suggestNextRoutine([b, a], [trained('bench', 1), trained('squat', 10), trained('deadlift', 6)], NOW)
    expect(r?.routine.id).toBe(a.id)
  })
  it('never-trained exercises count as stale and are reported', () => {
    const fresh = mkRoutine(['bench'], 0)
    const unknown = mkRoutine(['mystery'], 1)
    const r = suggestNextRoutine([fresh, unknown], [trained('bench', 3)], NOW)
    expect(r?.routine.id).toBe(unknown.id)
    expect(r?.avgDaysSince).toBeNull()
    expect(r?.newCount).toBe(1)
  })
  it('ties fall back to routine order, regardless of array order', () => {
    const a = mkRoutine(['x'], 0)
    const b = mkRoutine(['y'], 1)
    const ws = [trained('x', 5), trained('y', 5)]
    expect(suggestNextRoutine([b, a], ws, NOW)?.routine.id).toBe(a.id)
    // Staleness is uncapped: the longer-rested routine wins, equal staleness falls to order
    expect(suggestNextRoutine([b, a], [trained('x', 100), trained('y', 400)], NOW)?.routine.id).toBe(b.id)
    expect(suggestNextRoutine([b, a], [trained('x', 100), trained('y', 100)], NOW)?.routine.id).toBe(a.id)
  })
  it('with no history at all, the first routine by order wins', () => {
    const a = mkRoutine(['x'], 0)
    const b = mkRoutine(['y'], 1)
    expect(suggestNextRoutine([b, a], [], NOW)?.routine.id).toBe(a.id)
  })
  it('an empty routine ranks below any routine with exercises', () => {
    const empty = mkRoutine([], 0)
    const full = mkRoutine(['bench'], 1)
    expect(suggestNextRoutine([empty, full], [trained('bench', 0.1)], NOW)?.routine.id).toBe(full.id)
    // Only empty routines: implementation may return null or fall back to it, but must not throw
    expect(() => suggestNextRoutine([empty], [], NOW)).not.toThrow()
  })
  it('active workouts and sets that were never completed do not count as training', () => {
    const a = mkRoutine(['x'], 0)
    const b = mkRoutine(['y'], 1)
    const ws = [
      trained('x', 5),
      trained('y', 1, { status: 'active' }),
      done(NOW - DAY, { exercises: [mkLogged('y', [mkSet({ completed: false })])] }),
    ]
    const r = suggestNextRoutine([a, b], ws, NOW)
    expect(r?.routine.id).toBe(b.id) // y is "never trained" -> stalest
    expect(r?.newCount).toBe(1)
  })
  it('uses the most recent training of an exercise', () => {
    const a = mkRoutine(['x'], 0)
    const b = mkRoutine(['y'], 1)
    const r = suggestNextRoutine([a, b], [trained('x', 20), trained('x', 1), trained('y', 5)], NOW)
    expect(r?.routine.id).toBe(b.id)
  })
})

describe('muscleRecovery', () => {
  const bench = mkEx('weight_reps', { muscleGroup: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'] })
  const squat = mkEx('weight_reps', { muscleGroup: 'Quadriceps' })
  const map = new Map([bench, squat].map((e) => [e.id, e]))
  const sess = (daysAgo: number, ex: typeof bench, nSets = 3, o = {}) =>
    done(NOW - daysAgo * DAY, {
      exercises: [
        mkLogged(
          ex.id,
          Array.from({ length: nSets }, () => mkSet({ weight: 50, reps: 5 })),
        ),
      ],
      ...o,
    })

  it('credits primary and secondary muscles, most rested first', () => {
    const r = muscleRecovery([sess(1, bench), sess(5, squat)], map, false, NOW)
    expect(r.map((m) => m.muscle)).toEqual(
      ['Quadriceps', 'Chest', 'Triceps', 'Shoulders'].sort((a, b) => {
        const d = (m: string) => (m === 'Quadriceps' ? 5 : 1)
        return d(b) - d(a)
      }),
    )
    expect(r[0]).toEqual({ muscle: 'Quadriceps', daysSince: 5, sets: 3 })
    expect(r.find((m) => m.muscle === 'Triceps')).toEqual({ muscle: 'Triceps', daysSince: 1, sets: 3 })
  })
  it('daysSince floors; sets only count the last 7 days', () => {
    const r = muscleRecovery([sess(1.99, bench, 2), sess(9, bench, 4)], map, false, NOW)
    expect(r.find((m) => m.muscle === 'Chest')).toEqual({ muscle: 'Chest', daysSince: 1, sets: 2 })
  })
  it('drops muscles untouched for more than RECOVERY_STALE_DAYS', () => {
    expect(RECOVERY_STALE_DAYS).toBe(20)
    expect(muscleRecovery([sess(20, squat)], map, false, NOW)).toHaveLength(1)
    expect(muscleRecovery([sess(21, squat)], map, false, NOW)).toHaveLength(0)
  })
  it('ignores active workouts, warm-up-only and incomplete exercises, unknown exercises', () => {
    const warm = done(NOW - DAY, { exercises: [mkLogged(squat.id, [mkSet({ setType: 'warmup' })])] })
    const incomplete = done(NOW - DAY, { exercises: [mkLogged(squat.id, [mkSet({ completed: false })])] })
    const ghost = done(NOW - DAY, { exercises: [mkLogged('ghost', [mkSet()])] })
    expect(muscleRecovery([sess(1, squat, 3, { status: 'active' }), warm, incomplete, ghost], map, false, NOW)).toEqual(
      [],
    )
    expect(muscleRecovery([warm], map, true, NOW)).toHaveLength(1)
  })
  it('empty', () => expect(muscleRecovery([], map, false, NOW)).toEqual([]))
})

describe('restState thresholds', () => {
  it('constants', () => {
    expect(REST_READY_DAYS).toBe(2)
    expect(REST_OVERDUE_DAYS).toBe(4)
  })
  it('recovering < 2, ready 2..4, overdue > 4', () => {
    expect([0, 1].map(restState)).toEqual(['recovering', 'recovering'])
    expect([2, 3, 4].map(restState)).toEqual(['ready', 'ready', 'ready'])
    expect([5, 20].map(restState)).toEqual(['overdue', 'overdue'])
  })
})

describe('nextMilestone', () => {
  const t = (o: Partial<{ workouts: number; volumeKg: number; sets: number }> = {}) => ({
    workouts: 0,
    volumeKg: 0,
    sets: 0,
    reps: 0,
    durationSec: 0,
    ...o,
  })

  it('brand new user: first workouts rung', () => {
    expect(nextMilestone(t())).toEqual({ kind: 'workouts', unitLabel: 'workouts', current: 0, target: 10 })
  })
  it('exactly on a rung moves to the next one', () => {
    expect(nextMilestone(t({ workouts: 10 }))).toMatchObject({ kind: 'workouts', target: 25 })
  })
  it('picks the proportionally closest ladder', () => {
    expect(nextMilestone(t({ workouts: 5, volumeKg: 450_000, sets: 10 }))).toMatchObject({
      kind: 'volumeKg',
      target: 500_000,
    })
    expect(nextMilestone(t({ workouts: 9, volumeKg: 1000, sets: 10 }))).toMatchObject({ kind: 'workouts', target: 10 })
    expect(nextMilestone(t({ workouts: 1, volumeKg: 1000, sets: 480 }))).toMatchObject({
      kind: 'sets',
      unitLabel: 'sets',
      target: 500,
    })
  })
  it('null once every ladder is exhausted', () => {
    expect(nextMilestone(t({ workouts: 1000, volumeKg: 10_000_000, sets: 10_000 }))).toBeNull()
  })
  it('skips an exhausted ladder but uses the others', () => {
    expect(nextMilestone(t({ workouts: 1000, volumeKg: 0, sets: 0 }))?.kind).not.toBe('workouts')
  })
})

describe('habitWindow', () => {
  // Mondays at ~18:xx
  const mondays = [
    L(7, 6, 18),
    L(7, 13, 18, 20),
    L(7, 20, 18, 40),
    L(7, 27, 18, 5),
    L(8, 3, 18),
    L(8, 10, 18),
    L(8, 17, 18),
    L(8, 24, 18),
  ]
  const monNow = L(8, 31, 18, 30) // a Monday at 18:30
  const ws = mondays.map((m) => done(m))

  it('needs at least 8 sessions', () => {
    expect(habitWindow(ws.slice(0, 7), monNow)).toBeNull()
  })
  it('says something only when now matches the dominant weekday+hour', () => {
    expect(habitWindow(ws, monNow)).toBe('You usually train around now')
    expect(habitWindow(ws, L(8, 31, 9))).toBeNull() // right day, wrong hour
    expect(habitWindow(ws, L(9, 1, 18))).toBeNull() // right hour, wrong day
  })
  it('requires a dominant share (>= 30%) and count >= 3', () => {
    const scattered = Array.from({ length: 11 }, (_, i) => done(L(7, 1 + i, 6 + i)))
    expect(habitWindow(scattered, monNow)).toBeNull()
    // 3 of 11 is 27%: below the bar even though count >= 3
    const three = [...ws.slice(0, 3), ...Array.from({ length: 8 }, (_, i) => done(L(7, 1 + i, 7 + i)))]
    expect(habitWindow(three, monNow)).toBeNull()
  })
  it('active workouts do not contribute', () => {
    const active = ws.map((w) => ({ ...w, status: 'active' as const }))
    expect(habitWindow(active, monNow)).toBeNull()
  })
})

describe('homeStatus', () => {
  const goal = (o: Partial<WeekProgress> = {}): WeekProgress => ({
    done: 1,
    goal: 4,
    daysLeft: 5,
    state: 'onTrack',
    ...o,
  })
  const rec = (muscle: MuscleRecovery['muscle'], daysSince: number): MuscleRecovery => ({ muscle, daysSince, sets: 3 })

  it('day name always present', () => {
    expect(homeStatus(goal(), [], false, false, NOW).day).toMatch(/Wednesday/)
  })
  it('a running session beats everything', () => {
    expect(homeStatus(goal({ state: 'atRisk' }), [rec('Chest', 10)], true, true, NOW).fact).toBe('session running')
    expect(homeStatus(goal(), [], false, true, NOW).fact).toBe('session running')
  })
  it('no history -> no fact', () => {
    expect(homeStatus(goal({ state: 'atRisk' }), [rec('Chest', 10)], false, false, NOW).fact).toBeNull()
  })
  it('at-risk week reports remaining sessions, before overdue muscles', () => {
    expect(homeStatus(goal({ done: 1, goal: 4, state: 'atRisk' }), [rec('Chest', 10)], true, false, NOW).fact).toBe(
      '3 to go this week',
    )
  })
  it('overdue muscle only when strictly past the overdue threshold', () => {
    expect(homeStatus(goal(), [rec('Back', 5)], true, false, NOW).fact).toBe('Back is overdue')
    expect(homeStatus(goal(), [rec('Back', 4)], true, false, NOW).fact).toBe('1 of 4 this week')
  })
  it('hit goal and progress lines', () => {
    expect(homeStatus(goal({ state: 'hit', done: 4 }), [], true, false, NOW).fact).toBe('week’s goal hit')
    expect(homeStatus(goal({ done: 2 }), [], true, false, NOW).fact).toBe('2 of 4 this week')
  })
  it('no goal and nothing neglected -> null', () => {
    expect(homeStatus(goal({ goal: 0, state: 'hit', done: 0 }), [], true, false, NOW).fact).toBeNull()
    expect(homeStatus(goal({ goal: 0, state: 'hit', done: 0 }), [rec('Chest', 1)], true, false, NOW).fact).toBeNull()
  })
  it('only the stalest (first) muscle is considered', () => {
    expect(homeStatus(goal(), [rec('Chest', 1), rec('Back', 9)], true, false, NOW).fact).toBe('1 of 4 this week')
  })
})

// Week boundaries are local midnights, so a week holding a DST change is
// 167h or 169h long. Each case pins the process timezone (Date reads TZ live).
describe.each(['America/Los_Angeles', 'Pacific/Auckland'])('DST robustness (%s)', (zone) => {
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = zone
  })
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })
  /** The Sunday on which the zone's clocks change (2026), at local noon. */
  const changeSunday = () => {
    for (let d = 0; d < 365; d++) {
      const a = new Date(2026, 0, 1 + d, 12)
      const b = new Date(2026, 0, 2 + d, 12)
      if (a.getTimezoneOffset() !== b.getTimezoneOffset()) return b
    }
    throw new Error('no DST change')
  }

  it('weekProgress.daysLeft counts calendar days in a week that holds the change', () => {
    const sun = changeSunday()
    const wed = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 3, 12).getTime()
    expect(weekProgress([], 0, 4, wed).daysLeft).toBe(4)
    const sat = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 6, 23, 30).getTime()
    expect(weekProgress([], 0, 4, sat).daysLeft).toBe(1)
  })

  it('weekProgress counts a workout at 00:30 on the change Sunday in that week', () => {
    const sun = changeSunday()
    const early = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate(), 0, 30).getTime()
    const wed = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 3, 12).getTime()
    expect(weekProgress([done(early)], 0, 4, wed).done).toBe(1)
  })

  it('suggestedWeeklyGoal buckets boundary-time workouts into the right weeks', () => {
    const sun = changeSunday()
    // Three sessions per week, the first at 00:30 on each Sunday, for 8 weeks
    // spanning the change. Each real week has exactly 3, so the goal is 3.
    const now = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 5 * 7 + 3, 12).getTime()
    const ws = []
    for (let w = -2; w < 5; w++) {
      const at = (dayOffset: number, h: number, m = 0) =>
        new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + w * 7 + dayOffset, h, m).getTime()
      ws.push(done(at(0, 0, 30)), done(at(2, 12)), done(at(4, 12)))
    }
    expect(suggestedWeeklyGoal(ws, 0, now)).toBe(3)
  })
})
