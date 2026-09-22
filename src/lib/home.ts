import type { Exercise, MuscleGroup, Routine, Workout } from '../db/types'
import { startOfWeek, volumeByWeek, type Totals } from './stats'
import { countsTowardVolume } from './workout'

const DAY_MS = 86400000
const WEEK_MS = 7 * DAY_MS

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function doneWorkouts(workouts: Workout[]): Workout[] {
  return workouts.filter((w) => w.status === 'done')
}

export interface WeekProgress {
  done: number
  goal: number
  daysLeft: number
  state: 'hit' | 'ahead' | 'onTrack' | 'atRisk'
}

/**
 * Fraction of the remaining days you would have to train on before the week
 * counts as at risk. The one number worth tuning here: lower it and the app
 * starts nagging mid-week, raise it and the warning arrives too late to act
 * on. See the reasoning in `weekProgress`.
 */
const AT_RISK_DAY_SHARE = 0.75

/**
 * Weekly-goal progress for the home screen's headline card.
 */
export function weekProgress(
  workouts: Workout[],
  firstDayOfWeek: 0 | 1,
  goal: number,
  now = Date.now(),
): WeekProgress {
  const weekStart = startOfWeek(now, firstDayOfWeek)
  const weekEnd = weekStart + WEEK_MS
  const done = doneWorkouts(workouts).filter(
    (w) => w.startedAt >= weekStart && w.startedAt < weekEnd,
  ).length

  // Whole days remaining, inclusive of today: if it's Wednesday, today still
  // counts as a day you could train, so daysLeft only hits 0 after the week ends.
  const today = startOfDay(now)
  const daysElapsed = Math.floor((today - weekStart) / DAY_MS)
  const daysLeft = Math.max(0, 7 - daysElapsed)

  if (goal <= 0 || done >= goal) {
    return { done, goal, daysLeft, state: 'hit' }
  }

  const remaining = goal - done
  // At risk once the goal becomes *unlikely*, not once it becomes impossible.
  //
  // Waiting for impossible — needing more sessions than there are days left —
  // means a 4/week goal stays quiet until Friday, and a warning that arrives
  // after the week is already lost is an obituary, not a nudge. Loss aversion
  // only does any work while there is still something to save.
  //
  // So: flag it when you would have to train on more than three quarters of
  // the days you have left. Nobody trains near-daily, so that is the point the
  // week stops being comfortably recoverable. On a 4/week goal it lands on
  // Wednesday with none done, Friday with one, Saturday with two — each the
  // first moment the remaining days genuinely have to go your way.
  if (remaining > daysLeft * AT_RISK_DAY_SHARE) {
    return { done, goal, daysLeft, state: 'atRisk' }
  }

  // "Ahead" means comfortably better than a linear pace through the week:
  // done-so-far already covers what a steady pace would have banked by today,
  // with room to spare, rather than merely keeping up.
  const expectedByNow = (goal * daysElapsed) / 7
  if (done >= expectedByNow + 1) {
    return { done, goal, daysLeft, state: 'ahead' }
  }

  return { done, goal, daysLeft, state: 'onTrack' }
}

/**
 * The single routine the user is most "due" for: never-performed routines are
 * always more due than anything with a history, since "never" is older than
 * any timestamp. Ties (including two never-performed routines) fall back to
 * `order`, matching how routines are listed everywhere else.
 */
// `now` takes no part in the ordering (there's no time-based decay to compute
// here) but is kept, defaulted and unused, purely so every exported function
// in this module has the same deterministic-clock signature as stats.ts.
export function suggestNextRoutine(routines: Routine[], _now = Date.now()): Routine | null {
  if (routines.length === 0) return null
  const sorted = [...routines].sort((a, b) => {
    const aNever = a.lastPerformedAt == null
    const bNever = b.lastPerformedAt == null
    if (aNever !== bNever) return aNever ? -1 : 1
    if (aNever && bNever) return a.order - b.order
    const diff = (a.lastPerformedAt as number) - (b.lastPerformedAt as number)
    return diff !== 0 ? diff : a.order - b.order
  })
  return sorted[0]
}

export interface MuscleRecovery {
  muscle: MuscleGroup
  daysSince: number
  sets: number
}

/**
 * Rest state per muscle, most-rested first, so the home screen can nudge
 * toward what's been neglected. Mirrors `muscleDistribution`'s primary-only
 * attribution rule (see its comment in stats.ts) so the two screens agree on
 * which muscle a given set belongs to.
 */
export function muscleRecovery(
  workouts: Workout[],
  exerciseById: Map<string, Exercise>,
  countWarmups = false,
  now = Date.now(),
): MuscleRecovery[] {
  const lastTrained = new Map<MuscleGroup, number>()
  const recentSets = new Map<MuscleGroup, number>()
  const weekAgo = now - 7 * DAY_MS

  for (const w of doneWorkouts(workouts)) {
    for (const le of w.exercises) {
      const exercise = exerciseById.get(le.exerciseId)
      if (!exercise) continue
      const muscle = exercise.muscleGroup
      let setsInExercise = 0
      for (const s of le.sets) {
        if (!countsTowardVolume(s, countWarmups)) continue
        setsInExercise += 1
      }
      if (setsInExercise === 0) continue

      const prevLast = lastTrained.get(muscle)
      if (prevLast === undefined || w.startedAt > prevLast) {
        lastTrained.set(muscle, w.startedAt)
      }
      if (w.startedAt >= weekAgo) {
        recentSets.set(muscle, (recentSets.get(muscle) ?? 0) + setsInExercise)
      }
    }
  }

  const result: MuscleRecovery[] = []
  for (const [muscle, lastAt] of lastTrained) {
    const daysSince = Math.floor((now - lastAt) / DAY_MS)
    result.push({ muscle, daysSince, sets: recentSets.get(muscle) ?? 0 })
  }
  return result.sort((a, b) => b.daysSince - a.daysSince)
}

export interface VolumeMomentum {
  recentKg: number
  priorKg: number
  deltaPct: number | null
}

/**
 * Six-week volume trend. Built on volumeByWeek's buckets rather than
 * re-deriving them, so a change to week bucketing can't make this screen and
 * the stats screen disagree about what "this week" means.
 */
export function volumeMomentum(
  workouts: Workout[],
  firstDayOfWeek: 0 | 1,
  now = Date.now(),
): VolumeMomentum {
  const weeks = volumeByWeek(doneWorkouts(workouts), firstDayOfWeek, 12, now)
  const prior = weeks.slice(0, 6)
  const recent = weeks.slice(6)
  const recentKg = recent.reduce((sum, w) => sum + w.volumeKg, 0)
  const priorKg = prior.reduce((sum, w) => sum + w.volumeKg, 0)
  // A percentage change from a zero base is meaningless (and would render as
  // Infinity%), so the UI is told explicitly to say nothing instead.
  const deltaPct = priorKg > 0 ? ((recentKg - priorKg) / priorKg) * 100 : null
  return { recentKg, priorKg, deltaPct }
}

export interface Milestone {
  /**
   * Which total this measures. Volume is stored in kilograms, so the UI must
   * render `current` and `target` through the user's weight formatter rather
   * than printing the raw number — otherwise someone logging in pounds is told
   * to chase a kilogram milestone.
   */
  kind: keyof Totals
  /** Noun for the rung, e.g. "workouts". Deliberately unitless for volume. */
  unitLabel: string
  current: number
  target: number
}

interface Ladder {
  key: keyof Totals
  unitLabel: string
  rungs: number[]
}

const LADDERS: Ladder[] = [
  { key: 'workouts', unitLabel: 'workouts', rungs: [10, 25, 50, 100, 250, 500, 1000] },
  { key: 'volumeKg', unitLabel: 'lifted', rungs: [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000] },
  { key: 'sets', unitLabel: 'sets', rungs: [500, 1000, 5000, 10000] },
]

/**
 * Nearest unreached milestone across a few ladders (workout count, total
 * volume, total sets), picked by proportional closeness (current / target)
 * rather than absolute distance — otherwise volume, which is measured in the
 * hundred-thousands, would always dominate "sets" or "workouts" milestones
 * that are actually closer in relative terms. This is a judgement call: it
 * means a milestone 1kg away can lose to one 4 workouts away if the workout
 * ladder's rung is much smaller.
 */
export function nextMilestone(totals: Totals): Milestone | null {
  let best: Milestone | null = null
  let bestRatio = -Infinity

  for (const ladder of LADDERS) {
    const current = totals[ladder.key]
    const target = ladder.rungs.find((r) => r > current)
    if (target === undefined) continue
    const ratio = current / target
    if (ratio > bestRatio) {
      bestRatio = ratio
      best = { kind: ladder.key, unitLabel: ladder.unitLabel, current, target }
    }
  }
  return best
}

const MIN_HABIT_SAMPLE = 8

/**
 * A conservative "you usually train around now" nudge. Requires both a
 * meaningful sample size and a genuinely dominant weekday+hour mode before
 * saying anything — a wrong nudge erodes trust more than a missing one does,
 * so this returns null far more often than it returns a phrase.
 */
export function habitWindow(workouts: Workout[], now = Date.now()): string | null {
  const done = doneWorkouts(workouts)
  if (done.length < MIN_HABIT_SAMPLE) return null

  const counts = new Map<string, number>()
  for (const w of done) {
    const d = new Date(w.startedAt)
    const key = `${d.getDay()}:${d.getHours()}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  let bestKey: string | null = null
  let bestCount = 0
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      bestKey = key
    }
  }
  if (!bestKey) return null

  // "Dominant" means this slot alone accounts for a clear plurality of
  // sessions — an arbitrary but deliberately strict bar so a handful of
  // coincidental Tuesday-evening workouts don't get promoted into a habit.
  const share = bestCount / done.length
  if (bestCount < 3 || share < 0.3) return null

  const now_ = new Date(now)
  const currentKey = `${now_.getDay()}:${now_.getHours()}`
  if (currentKey === bestKey) {
    return 'You usually train around now'
  }
  return null
}
