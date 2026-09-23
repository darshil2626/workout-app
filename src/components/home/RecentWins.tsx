import type { Exercise, Workout } from '../../db/types'
import { PR_LABEL, prsForWorkout, type PRKind } from '../../lib/records'
import type { Milestone } from '../../lib/home'
import { effectiveWeightKg, estimate1RM, prWeightKg } from '../../lib/workout'
import { formatRelative } from '../../lib/time'
import type { Formatters } from '../../lib/useSettings'

export interface Win {
  key: string
  exerciseName: string
  kind: PRKind
  /** In the kind's own unit: kilograms, reps, seconds or metres. */
  value: number
  /** "+" for added-load movements, so a weighted pull-up reads "+20 kg". */
  prefix: string
  at: number
}

/**
 * One lift can break several records at once — a heaviest single is usually a
 * best 1RM and a best set volume too — and `findSessionPRs` badges the best
 * *set* for each kind, so those records often land on different sets of the
 * same exercise. Listing each one would let a single deadlift fill the whole
 * feed, so an exercise contributes one row per session: its most legible
 * record, ordered the way a lifter would actually brag about them.
 */
const PR_PRIORITY: PRKind[] = ['weight', 'oneRm', 'reps', 'distance', 'duration', 'volume']

function valueFor(
  set: Workout['exercises'][number]['sets'][number],
  exercise: Exercise,
  kind: PRKind,
  bodyweightKg: number | null,
): number {
  const load = effectiveWeightKg(set, exercise.kind, bodyweightKg)
  switch (kind) {
    case 'weight':
      return prWeightKg(set, exercise.kind)
    case 'oneRm':
      return set.reps ? estimate1RM(load, set.reps) : 0
    case 'volume':
      return set.reps ? load * set.reps : 0
    case 'reps':
      return set.reps ?? 0
    case 'duration':
      return set.durationSec ?? 0
    case 'distance':
      return set.distanceM ?? 0
  }
}

/**
 * Pulls the PRs out of already-loaded sessions, newest first.
 *
 * Expensive: `prsForWorkout` rescans every workout containing each exercise,
 * so `sessions` must be a handful of recent ones and this must never run
 * during render. `exerciseById` must be the fully loaded library — a partial
 * map silently marks every exercise unknown and finds no records at all.
 */
export async function collectWins(
  sessions: Workout[],
  exerciseById: Map<string, Exercise>,
  fallbackBodyweightKg: number | null,
  countWarmups: boolean,
  limit: number,
): Promise<Win[]> {
  const wins: Win[] = []

  for (const workout of sessions) {
    const prs = await prsForWorkout(workout, exerciseById, fallbackBodyweightKg, countWarmups)
    if (prs.size === 0) continue

    const at = workout.finishedAt ?? workout.startedAt
    const bodyweightKg = workout.bodyweightKg ?? fallbackBodyweightKg

    for (const le of workout.exercises) {
      const exercise = exerciseById.get(le.exerciseId)
      if (!exercise) continue

      // Best record across every set of this exercise, not per set: see the
      // note on PR_PRIORITY for why two sets of one lift must not both appear.
      let best: Win | null = null
      let bestRank = Infinity

      for (const set of le.sets) {
        const kinds = prs.get(set.id)
        if (!kinds || kinds.length === 0) continue
        const kind = PR_PRIORITY.find((k) => kinds.includes(k)) ?? kinds[0]
        const rank = PR_PRIORITY.indexOf(kind)
        if (rank >= bestRank) continue

        bestRank = rank
        best = {
          key: `${workout.id}:${le.id}`,
          exerciseName: exercise.name,
          kind,
          value: valueFor(set, exercise, kind, bodyweightKg),
          prefix: kind === 'weight' && exercise.kind === 'weighted_bodyweight' ? '+' : '',
          at,
        }
      }

      if (best) wins.push(best)
    }
  }

  // Sessions arrive newest first, so the first `limit` are the freshest wins.
  return wins.slice(0, limit)
}

interface Props {
  wins: Win[]
  milestone: Milestone | null
  fmt: Formatters
}

export function RecentWins({ wins, milestone, fmt }: Props) {
  return (
    <section className="home-sect home-appear">
      <div className="section-title">{wins.length > 0 ? 'Recent wins' : 'Next milestone'}</div>
      <div className="card">
        {/* Two lines, not three. The name and the number are the row — they go
            side by side so the value lands in a column the eye can run down —
            and the label and the date are the footnote that explains it. The
            old stacked layout spent a third line on a date four characters
            long, which is where all the whitespace came from. */}
        {wins.map((win) => (
          <div className="home-win" key={win.key}>
            <span className="home-win-medal" aria-hidden="true">
              🏅
            </span>
            <div className="grow">
              <div className="home-win-top">
                <span className="truncate">{win.exerciseName}</span>
                <span className="home-win-value mono">{describeWin(win, fmt)}</span>
              </div>
              <div className="home-win-meta">
                <span className="truncate">{capitalise(PR_LABEL[win.kind])}</span>
                <span className="home-win-when">{formatRelative(win.at)}</span>
              </div>
            </div>
          </div>
        ))}

        {milestone && (
          <div className={wins.length > 0 ? 'home-milestone bordered' : 'home-milestone'}>
            <span className="muted">{describeMilestone(milestone, fmt)}</span>
            <div className="bar-track home-milestone-track">
              <div
                className="bar-fill home-milestone-fill"
                // `nextMilestone` only ever returns an unreached rung, so the
                // target is positive and strictly above `current`: the width is
                // always a real fraction between 0 and 1.
                style={{ width: `${Math.max((milestone.current / milestone.target) * 100, 2)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function describeWin(win: Win, fmt: Formatters): string {
  switch (win.kind) {
    case 'weight':
    case 'oneRm':
      return `${win.prefix}${fmt.weight(win.value)} ${fmt.weightUnit}`
    case 'volume':
      return `${fmt.volume(win.value)} ${fmt.weightUnit}`
    case 'reps':
      return `${win.value} reps`
    case 'duration':
      return fmt.duration(win.value)
    case 'distance':
      return `${fmt.distance(win.value)} ${fmt.distanceUnit}`
  }
}

/**
 * The gap, not the total: "100 workouts — 6 to go" is a thing you could do
 * this month, where "94 workouts" is a number you already knew.
 *
 * Volume is stored in kilograms and `unitLabel` is deliberately unitless for
 * it, so both figures go through the user's own volume formatter — otherwise
 * someone logging in pounds is handed a kilogram target.
 */
function describeMilestone(milestone: Milestone, fmt: Formatters): string {
  const remaining = milestone.target - milestone.current
  // Target first, gap last. Naming the rung is what makes it feel like a real
  // thing to chase; closing the line on what is left is the goal-gradient
  // framing. "100 workouts — 6 to go" beats "6 workouts to 100", which parses
  // as arithmetic before it parses as an ambition.
  if (milestone.kind === 'volumeKg') {
    const target = `${fmt.volumeCompact(milestone.target)} ${fmt.weightUnit}`
    return `${target} ${milestone.unitLabel} — ${fmt.volumeCompact(remaining)} to go`
  }
  return `${milestone.target.toLocaleString()} ${milestone.unitLabel} — ${Math.ceil(remaining).toLocaleString()} to go`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
