import { useLocation, useNavigate } from 'react-router-dom'
import { useActiveWorkout } from '../state/ActiveWorkoutContext'
import { useRestTimer } from '../state/RestTimerContext'
import { useNow } from '../lib/useNow'
import { elapsedSeconds } from '../lib/workout'
import { formatDuration } from '../lib/time'

/** Persistent "you have a workout running" bar, hidden on the logging screen. */
export function ActiveWorkoutBanner() {
  const { workout } = useActiveWorkout()
  const { remaining } = useRestTimer()
  const navigate = useNavigate()
  const location = useLocation()
  const now = useNow(1000)

  if (!workout) return null
  if (location.pathname === '/workout') return null

  const elapsed = elapsedSeconds(workout, now)

  return (
    <div
      className="active-banner"
      // Sit above the rest bar when both are visible.
      style={remaining !== null ? { bottom: 'calc(var(--nav-h) + var(--safe-bottom) + 52px)' } : undefined}
    >
      <button className="active-banner-body" onClick={() => navigate('/workout')}>
        <span className="truncate grow" style={{ textAlign: 'left' }}>
          {workout.name}
        </span>
        <span className="mono">{formatDuration(elapsed)}</span>
        <span style={{ opacity: 0.85, fontSize: '0.85rem' }}>Resume →</span>
      </button>
    </div>
  )
}
