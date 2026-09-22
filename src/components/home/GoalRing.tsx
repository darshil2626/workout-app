import type { CSSProperties } from 'react'
import type { WeekProgress } from '../../lib/home'
import type { Streaks } from '../../lib/stats'

const SIZE = 74
const STROKE = 7
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface Props {
  progress: WeekProgress
  streaks: Streaks
}

/**
 * Weekly goal as an arc, plus one line of copy chosen by `progress.state`.
 *
 * Callers must not render this with a goal of zero: an empty ring labelled
 * "0 of 0" is the wall-of-zeroes the home screen exists to avoid.
 */
export function GoalRing({ progress, streaks }: Props) {
  const { done, goal, state } = progress
  const hit = state === 'hit'
  // Clamped, because exceeding the goal keeps the ring full rather than
  // winding a second lap that would read as being back at the start.
  const fraction = Math.min(1, Math.max(0, done / goal))

  return (
    <section className="card home-block home-goal">
      <svg
        className="goal-ring"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${done} of ${goal} workouts this week`}
      >
        <circle
          className="goal-ring-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
        />
        <circle
          className={hit ? 'goal-ring-arc hit' : 'goal-ring-arc'}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          // Start at twelve o'clock; SVG angles otherwise begin at three.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ '--ring-c': CIRCUMFERENCE } as CSSProperties}
        />
        <text
          className="goal-ring-value"
          x={SIZE / 2}
          y={SIZE / 2}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {done}
        </text>
      </svg>

      <div className="stack grow">
        <span className="goal-of">of {goal} this week</span>
        <span className={`goal-note${state === 'atRisk' ? ' at-risk' : hit ? ' hit' : ''}`}>
          {supportingCopy(progress, streaks)}
        </span>
        {streaks.currentWeeks > 0 && (
          <span className="home-streak">
            <span aria-hidden="true">🔥</span> {streaks.currentWeeks} week
            {streaks.currentWeeks === 1 ? '' : 's'} ·{' '}
            {streaks.longestWeeks > streaks.currentWeeks
              ? `best ${streaks.longestWeeks}`
              : 'your best yet'}
          </span>
        )}
      </div>
    </section>
  )
}

/**
 * The load-bearing sentence on the screen.
 *
 * Behind means naming what is about to be lost, once — the streak if there is
 * one to lose, otherwise the arithmetic. On pace means naming the *gap*, never
 * the progress: motivation rises as the remaining distance shrinks, so the
 * remainder is the number worth showing.
 */
function supportingCopy(progress: WeekProgress, streaks: Streaks): string {
  const { done, goal, daysLeft, state } = progress
  const remaining = goal - done
  const days = `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`

  if (state === 'hit') {
    if (done > goal) return `${done - goal} past your goal — everything now is extra`
    return 'Goal hit. Anything from here is a bonus'
  }

  if (state === 'atRisk') {
    // A live streak is the most concrete thing on the line, and it really does
    // end if this week closes empty, so it can be said plainly.
    if (done === 0 && streaks.currentWeeks > 0) {
      return `Your ${streaks.currentWeeks}-week streak is on the line — ${days}`
    }
    return `${remaining} to go and only ${days}`
  }

  return remaining === 1 ? 'One more to hit your week' : `${remaining} more to hit your week`
}
