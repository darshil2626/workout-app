import { useRestTimer } from '../state/RestTimerContext'
import { formatDuration } from '../lib/time'
import { IconClose } from './Icons'

export function RestTimerBar() {
  const { remaining, totalSec, adjust, stop } = useRestTimer()
  if (remaining === null) return null

  const pct = totalSec > 0 ? Math.max(0, Math.min(100, (remaining / totalSec) * 100)) : 0
  const done = remaining === 0

  return (
    <div className="rest-bar">
      <div
        className="rest-bar-progress"
        style={{ width: `${pct}%`, background: done ? 'var(--success)' : 'var(--accent)' }}
      />
      <div className="rest-bar-body">
        <div className="stack">
          <span className="rest-label">{done ? 'Rest complete' : 'Rest'}</span>
          <span className="rest-time" style={{ color: done ? 'var(--success)' : undefined }}>
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
    </div>
  )
}
