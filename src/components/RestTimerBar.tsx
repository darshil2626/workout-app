import { useEffect, useRef, useState } from 'react'
import { useRestTimer } from '../state/RestTimerContext'
import { formatDuration } from '../lib/time'
import { IconClose } from './Icons'

/** "1 minute 30 seconds" rather than "1:30" — a screen reader sounding out
 *  the digit string and the colon is worse than just not having a number. */
function speakDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  const minutePart = m > 0 ? `${m} minute${m === 1 ? '' : 's'}` : ''
  const secondPart = sec > 0 || m === 0 ? `${sec} second${sec === 1 ? '' : 's'}` : ''
  return [minutePart, secondPart].filter(Boolean).join(' ')
}

export function RestTimerBar() {
  const { remaining, totalSec, adjust, stop } = useRestTimer()
  const running = remaining !== null
  const done = remaining === 0

  // The countdown itself (.rest-time, aria-live="off" below) must stay silent
  // tick to tick — a screen reader reading out a new number every second
  // would be unusable. This hidden region instead speaks only at the two
  // moments that matter: the timer starting and rest finishing.
  const [announcement, setAnnouncement] = useState('')
  const wasRunningRef = useRef(false)
  const announcedDoneRef = useRef(false)

  useEffect(() => {
    if (running && !wasRunningRef.current) {
      setAnnouncement(`Rest timer started, ${speakDuration(totalSec)}`)
      announcedDoneRef.current = false
    }
    wasRunningRef.current = running
    // totalSec intentionally omitted: +15s/-15s adjustments while already
    // running must not re-trigger the "started" announcement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    if (done && !announcedDoneRef.current) {
      announcedDoneRef.current = true
      setAnnouncement('Rest complete')
    }
  }, [done])

  if (remaining === null) return null

  const pct = totalSec > 0 ? Math.max(0, Math.min(100, (remaining / totalSec) * 100)) : 0

  return (
    <div className="rest-bar">
      <div
        className="rest-bar-progress"
        style={{ width: `${pct}%`, background: done ? 'var(--success)' : 'var(--accent)' }}
      />
      <div className="rest-bar-body">
        <div className="stack">
          <span className="rest-label">{done ? 'Rest complete' : 'Rest'}</span>
          {/* Ember while counting down — this bar only exists while something
              is live right now, which is exactly what --accent means — and
              green once rest is over, matching every other "done" state. */}
          <span className="rest-time" style={{ color: done ? 'var(--success)' : 'var(--accent)' }} aria-live="off">
            {formatDuration(remaining)}
          </span>
        </div>
        <div className="grow" />
        <button className="btn btn-ghost btn-sm" onClick={() => adjust(-15)}>
          −15s
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => adjust(15)}>
          +15s
        </button>
        <button className="icon-btn" onClick={stop} aria-label="Skip rest">
          <IconClose />
        </button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  )
}
