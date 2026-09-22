import type { Routine, Workout } from '../../db/types'
import { IconPlay, IconPlus } from '../Icons'
import { useNow } from '../../lib/useNow'
import { elapsedSeconds } from '../../lib/workout'
import { formatDuration, formatRelative } from '../../lib/time'

interface Props {
  /** The running session, if any. It outranks every other action on the page. */
  activeWorkout: Workout | null
  suggestion: Routine | null
  routineCount: number
  /** `habitWindow`'s phrase, or null — which is most of the time, by design. */
  habit: string | null
  onResume: () => void
  onStartSuggested: () => void
  onStartEmpty: () => void
  onChoose: () => void
}

/**
 * The one thing the screen asks you to do. Everything below it is evidence for
 * why you should; this is the doing.
 */
export function PrimaryAction({
  activeWorkout,
  suggestion,
  routineCount,
  habit,
  onResume,
  onStartSuggested,
  onStartEmpty,
  onChoose,
}: Props) {
  // A live session is an interrupted task, and the only useful thing to offer
  // is the way back into it. No secondary actions, no habit nudge: anything
  // else here is an invitation to abandon a workout mid-set.
  if (activeWorkout) return <ResumeBlock workout={activeWorkout} onResume={onResume} />

  return (
    <>
      {suggestion ? (
        <>
          <button className="btn btn-primary btn-lg btn-block home-start" onClick={onStartSuggested}>
            <IconPlay />
            <span className="truncate">Start {suggestion.name}</span>
          </button>
          <p className="home-start-sub">{describeRoutine(suggestion)}</p>
          <div className="home-secondary">
            <button className="btn btn-ghost btn-sm grow" onClick={onStartEmpty}>
              Empty workout
            </button>
            {routineCount > 1 && (
              <button className="btn btn-ghost btn-sm grow" onClick={onChoose}>
                Choose another
              </button>
            )}
          </div>
        </>
      ) : (
        <button className="btn btn-primary btn-lg btn-block home-start" onClick={onStartEmpty}>
          <IconPlus />
          <span className="truncate">Start empty workout</span>
        </button>
      )}

      {habit ? <p className="home-habit">{habit}</p> : null}
    </>
  )
}

/** Split out so the one-second tick only re-renders this line, never the page. */
function ResumeBlock({ workout, onResume }: { workout: Workout; onResume: () => void }) {
  const now = useNow(1000)
  return (
    <>
      <button className="btn btn-primary btn-lg btn-block home-start" onClick={onResume}>
        <IconPlay />
        <span className="truncate">Resume {workout.name}</span>
      </button>
      <p className="home-start-sub">
        Running for <span className="mono">{formatDuration(elapsedSeconds(workout, now))}</span>
      </p>
    </>
  )
}

function describeRoutine(routine: Routine): string {
  const count = routine.exercises.length
  const exercises = count === 0 ? 'No exercises yet' : `${count} exercise${count === 1 ? '' : 's'}`
  if (routine.lastPerformedAt == null) return `${exercises} · never done`
  return `${exercises} · last done ${formatRelative(routine.lastPerformedAt)}`
}
