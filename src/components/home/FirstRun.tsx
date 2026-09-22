import { IconPlus } from '../Icons'

interface Props {
  onStartEmpty: () => void
  onNewRoutine: () => void
}

/**
 * Nothing logged, nothing planned, nothing running.
 *
 * Every dashboard block on this screen measures something, and measuring
 * nothing produces a page of zeroes, empty rings and flat charts — which reads
 * as a broken app rather than as a new one. So the first run shows one action
 * and one sentence, and the dashboard assembles itself as the data arrives.
 */
export function FirstRun({ onStartEmpty, onNewRoutine }: Props) {
  return (
    <>
      <button className="btn btn-primary btn-lg btn-block home-start" onClick={onStartEmpty}>
        <IconPlus />
        <span className="truncate">Start empty workout</span>
      </button>

      <div className="empty">
        <div className="empty-icon">🏋️</div>
        <h3>Let’s log the first one</h3>
        <p className="muted">
          Start a session and add exercises as you go. Once there’s a workout behind you, this
          screen fills in with your week, your streak and what’s rested enough to train.
        </p>
      </div>

      <button className="btn btn-ghost btn-block" onClick={onNewRoutine}>
        <IconPlus />
        Build a routine first
      </button>
    </>
  )
}
