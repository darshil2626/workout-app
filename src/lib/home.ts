import type { Exercise, MuscleGroup, Routine, Workout } from '../db/types'
import { getExerciseHistory } from './history'
import { exerciseProgress, metricsFor, startOfWeek, type Totals } from './stats'
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

/** Weeks of history the goal suggestion is drawn from. */
const GOAL_SAMPLE_WEEKS = 8

/** Nobody is well served by a goal of one, and past six it stops being a goal. */
const GOAL_MIN = 2
const GOAL_MAX = 6

/**
 * A weekly goal derived from what the user actually does, rather than a number
 * someone picked. Returns null until there is enough history to mean anything.
 *
 * The median, not the mean: one deload week or one holiday should not drag the
 * target down, and a single seven-session week should not push it up. Weeks
 * before the user's first recorded session are excluded — counting them would
 * average a beginner against a stretch of time they had not started training
 * in, and hand them a goal below what they are already doing.
 *
 * This is only ever a suggestion. `weeklyGoalWorkouts` in settings stays
 * authoritative, because a goal the app quietly rewrote is not a goal.
 */
export function suggestedWeeklyGoal(
  workouts: Workout[],
  firstDayOfWeek: 0 | 1,
  now = Date.now(),
): number | null {
  const done = doneWorkouts(workouts)
  if (done.length === 0) return null

  const firstEver = startOfWeek(Math.min(...done.map((w) => w.startedAt)), firstDayOfWeek)
  const thisWeek = startOfWeek(now, firstDayOfWeek)

  // The current week is deliberately left out: it is still in progress, and a
  // Monday would otherwise score it as a zero-workout week.
  const counts: number[] = []
  for (let i = GOAL_SAMPLE_WEEKS; i >= 1; i--) {
    const weekStart = thisWeek - i * WEEK_MS
    if (weekStart < firstEver) continue
    counts.push(
      done.filter((w) => w.startedAt >= weekStart && w.startedAt < weekStart + WEEK_MS).length,
    )
  }
  if (counts.length < 3) return null

  counts.sort((a, b) => a - b)
  const mid = Math.floor(counts.length / 2)
  const median =
    counts.length % 2 === 0 ? (counts[mid - 1] + counts[mid]) / 2 : counts[mid]

  return Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(median)))
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
 * Beyond this many days, a muscle is treated as "not a current focus" rather
 * than "neglected" and dropped from the list, instead of climbing to an
 * ever-larger overdue count. Without a ceiling, a muscle the user has simply
 * stopped training — a dropped lift, a program change, an injury — sits at
 * the top of "Ready to train" forever, eventually reading "312 days" and
 * crowding out muscles actually worth nudging about. A rule of thumb, not
 * physiology, same spirit as `REST_READY_DAYS`/`REST_OVERDUE_DAYS`.
 */
export const RECOVERY_STALE_DAYS = 20

/**
 * Rest state per muscle, most-rested first, so the home screen can nudge
 * toward what's been neglected.
 *
 * Unlike `muscleDistribution`'s primary-only attribution (see its comment in
 * stats.ts), this counts secondary muscles too: a set genuinely does stress
 * its secondary muscles, and "was this muscle touched at all" doesn't invent
 * false precision the way splitting volume fractionally across muscles would.
 * Skipping secondaries here is what made forearms read as neglected despite
 * being gripped through every curl, row and pull-up.
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
      const muscles = new Set<MuscleGroup>([exercise.muscleGroup, ...(exercise.secondaryMuscles ?? [])])
      let setsInExercise = 0
      for (const s of le.sets) {
        if (!countsTowardVolume(s, countWarmups)) continue
        setsInExercise += 1
      }
      if (setsInExercise === 0) continue

      for (const muscle of muscles) {
        const prevLast = lastTrained.get(muscle)
        if (prevLast === undefined || w.startedAt > prevLast) {
          lastTrained.set(muscle, w.startedAt)
        }
        if (w.startedAt >= weekAgo) {
          recentSets.set(muscle, (recentSets.get(muscle) ?? 0) + setsInExercise)
        }
      }
    }
  }

  const result: MuscleRecovery[] = []
  for (const [muscle, lastAt] of lastTrained) {
    const daysSince = Math.floor((now - lastAt) / DAY_MS)
    if (daysSince > RECOVERY_STALE_DAYS) continue
    result.push({ muscle, daysSince, sets: recentSets.get(muscle) ?? 0 })
  }
  return result.sort((a, b) => b.daysSince - a.daysSince)
}

export type RestState = 'recovering' | 'ready' | 'overdue'

/**
 * These two numbers are rules of thumb, not physiology.
 *
 * How long a muscle actually needs depends on the muscle, on how hard and how
 * heavy the session was, and on sleep, food and age — none of which this app
 * knows from a set count. They exist to prompt a decision about what to train
 * next, not to make any claim about readiness, and they are meant to be tuned.
 * They replaced a bar drawn against an invisible 14-day ceiling, which encoded
 * the same guess without ever saying what it was measuring.
 */
export const REST_READY_DAYS = 2
export const REST_OVERDUE_DAYS = 4

export function restState(daysSince: number): RestState {
  if (daysSince < REST_READY_DAYS) return 'recovering'
  if (daysSince <= REST_OVERDUE_DAYS) return 'ready'
  return 'overdue'
}

/**
 * How far back the strength trend looks.
 *
 * Eight weeks is long enough that a training block's worth of sessions lands
 * inside it, and short enough that the line still describes what the user is
 * doing now rather than what they were doing last spring.
 */
export const TREND_WEEKS = 8

/**
 * Sessions an exercise needs inside the window before it is worth plotting.
 * Two points draw a line but describe nothing: one good day followed by one
 * bad day would be rendered as a trend.
 */
const MIN_TREND_SESSIONS = 3

/** Default cap. Every extra lift costs a full scan of history — see below. */
const MAX_TREND_LIFTS = 3

export interface StrengthLift {
  exerciseId: string
  name: string
  /** Estimated 1RM per session, oldest first. Kilograms — format at the edge. */
  series: number[]
  /** The most recent point. Kilograms. */
  currentKg: number
  /** Against the oldest session inside the window. Kilograms, and signed. */
  deltaKg: number
}

/**
 * Estimated 1RM over the last few weeks for the lifts trained most often.
 *
 * This is deliberately not a volume chart. Tonnage climbs the moment you add a
 * set, so a rising volume line answers "did you do more work?" while looking
 * like it answers "are you getting stronger?" — and only the second question
 * belongs on a screen whose job is to help you decide what to do today. The
 * Stats page already plots volume for anyone who wants it.
 *
 * Only exercises whose load is genuinely measurable qualify, which is what
 * `metricsFor` offering 'oneRm' means: a pull-up's "weight" is the user's
 * weigh-ins and an assisted machine inverts the scale entirely, so neither
 * describes training. See the comment above `metricsFor` in ./stats.
 *
 * Expensive, and asynchronous for that reason: `getExerciseHistory` reloads
 * every workout containing the exercise. Candidates are therefore ranked
 * against the sessions the caller already holds in memory, so the scan runs at
 * most `limit` times. Callers must pass a fully loaded exercise library — a
 * partial map marks every exercise unknown and quietly yields no lifts at all.
 */
export async function strengthTrend(
  workouts: Workout[],
  exerciseById: Map<string, Exercise>,
  bodyweightKg: number | null,
  countWarmups = false,
  limit = MAX_TREND_LIFTS,
  now = Date.now(),
): Promise<StrengthLift[]> {
  const since = now - TREND_WEEKS * WEEK_MS

  // Sessions per exercise inside the window, counted from memory. An exercise
  // logged twice in one session still counts once: this is "how often do you
  // train it", not "how many entries exist".
  const counts = new Map<string, number>()
  for (const w of doneWorkouts(workouts)) {
    if (w.startedAt < since) continue
    const seen = new Set<string>()
    for (const le of w.exercises) {
      const exercise = exerciseById.get(le.exerciseId)
      if (!exercise) continue
      if (!metricsFor(exercise.kind).includes('oneRm')) continue
      if (seen.has(exercise.id)) continue
      if (!le.sets.some((s) => countsTowardVolume(s, countWarmups))) continue
      seen.add(exercise.id)
      counts.set(exercise.id, (counts.get(exercise.id) ?? 0) + 1)
    }
  }

  const ranked = [...counts]
    .filter(([, sessions]) => sessions >= MIN_TREND_SESSIONS)
    // Name breaks ties so the card does not reshuffle itself between renders
    // when two lifts are trained equally often.
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        (exerciseById.get(a[0])?.name ?? '').localeCompare(exerciseById.get(b[0])?.name ?? ''),
    )
    .slice(0, limit)

  const lifts: StrengthLift[] = []
  for (const [exerciseId] of ranked) {
    const exercise = exerciseById.get(exerciseId)
    if (!exercise) continue
    const history = await getExerciseHistory(exerciseId)
    const points = exerciseProgress(
      history.filter((h) => h.workout.startedAt >= since),
      exercise,
      'oneRm',
      bodyweightKg,
      countWarmups,
    )
    // The in-memory count can run ahead of the plottable points — a session of
    // nothing but empty sets contributes no 1RM — so the bar is checked again
    // against what actually came back.
    if (points.length < MIN_TREND_SESSIONS) continue

    const series = points.map((p) => p.value)
    const currentKg = series[series.length - 1]
    lifts.push({
      exerciseId,
      name: exercise.name,
      series,
      currentKg,
      deltaKg: currentKg - series[0],
    })
  }
  return lifts
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

export interface HomeStatus {
  /** Always present: the one thing that is true even on a brand-new install. */
  day: string
  /** The single fact worth the header's width, or null when there isn't one. */
  fact: string | null
}

/**
 * The line at the top of the home screen.
 *
 * It replaced "Good afternoon", which told the user something they could read
 * off their own clock. The header is sticky, so this line is the only part of
 * the dashboard still on screen once the page is scrolled — it has to carry a
 * fact, and exactly one, or it becomes a second paragraph in a 36px-tall bar.
 *
 * The order is urgency, not importance: a live session is an interrupted task,
 * a week at risk expires at midnight on Sunday, and a neglected muscle is the
 * only one of the three that will still be true tomorrow. A new user gets the
 * weekday alone — inventing a fact from no data is how a dashboard starts
 * lying.
 */
export function homeStatus(
  goal: WeekProgress,
  recovery: MuscleRecovery[],
  hasHistory: boolean,
  sessionRunning: boolean,
  now = Date.now(),
): HomeStatus {
  const day = new Date(now).toLocaleDateString(undefined, { weekday: 'long' })
  if (sessionRunning) return { day, fact: 'session running' }
  if (!hasHistory) return { day, fact: null }

  if (goal.goal > 0 && goal.state === 'atRisk') {
    const remaining = goal.goal - goal.done
    return { day, fact: `${remaining} to go this week` }
  }

  // `muscleRecovery` sorts most-rested first, so the head of the list is the
  // most overdue thing there is. `restState`/`REST_OVERDUE_DAYS` stay just
  // for this one line — RecoveryCard itself dropped the chip in favor of a
  // colored day count, but the header still needs a single yes/no cutoff.
  const stalest = recovery[0]
  if (stalest && restState(stalest.daysSince) === 'overdue') {
    return { day, fact: `${stalest.muscle} is overdue` }
  }

  if (goal.goal > 0) {
    if (goal.state === 'hit') return { day, fact: 'week’s goal hit' }
    return { day, fact: `${goal.done} of ${goal.goal} this week` }
  }

  // Trained recently, no goal set, nothing neglected: there is genuinely
  // nothing to report, and saying so is better than padding it.
  return { day, fact: null }
}
