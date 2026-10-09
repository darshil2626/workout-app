import type { LoggedExercise } from '../../db/types'
import { Sheet } from '../../components/Sheet'
import { formatDuration } from '../../lib/time'

const REST_PRESETS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300]

export function RestEditorSheet({
  exercise,
  defaultRest,
  onClose,
  onSave,
}: {
  exercise: LoggedExercise | null
  defaultRest: number
  onClose: () => void
  onSave: (seconds: number | null) => void
}) {
  const current = exercise?.restSeconds ?? defaultRest
  return (
    <Sheet open={exercise !== null} title="Rest timer" onClose={onClose}>
      <p className="muted" style={{ marginBottom: 12 }}>
        Applies to this exercise in this workout.
      </p>
      <button className="sheet-list-item" onClick={() => onSave(null)}>
        <span className="grow">Use default ({formatDuration(defaultRest)})</span>
        {exercise?.restSeconds == null && <span style={{ color: 'var(--accent)' }}>✓</span>}
      </button>
      {REST_PRESETS.map((s) => (
        <button key={s} className="sheet-list-item" onClick={() => onSave(s)}>
          <span className="grow">{s === 0 ? 'Off' : formatDuration(s)}</span>
          {exercise?.restSeconds === s && current === s && <span style={{ color: 'var(--accent)' }}>✓</span>}
        </button>
      ))}
    </Sheet>
  )
}
