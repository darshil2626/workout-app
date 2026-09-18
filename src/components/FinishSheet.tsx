import { useState } from 'react'
import { Sheet } from './Sheet'
import type { SessionRating } from '../state/ActiveWorkoutContext'

/** 1–5, mild to maximal. Stored as the number so it can be averaged later. */
export const EFFORT_LABELS = ['Easy', 'Moderate', 'Hard', 'Very hard', 'Max'] as const

/** 1–5, rough to great. The emoji is decoration; the label carries the meaning. */
export const FEELING = [
  { emoji: '😫', label: 'Terrible' },
  { emoji: '😕', label: 'Poor' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '🤩', label: 'Great' },
] as const

export function effortLabel(effort: number): string {
  return EFFORT_LABELS[effort - 1] ?? ''
}

export function feelingFor(feeling: number): { emoji: string; label: string } | undefined {
  return FEELING[feeling - 1]
}

interface Props {
  open: boolean
  /** Headline figures for the session just completed. */
  summary: { duration: string; volume: string; prCount: number }
  onClose: () => void
  onSave: (rating: SessionRating) => void
}

/**
 * Asked once, after the finish is already confirmed. Both scales are optional
 * and "Skip" is as prominent as "Save", so the rating never blocks the finish.
 */
export function FinishSheet({ open, summary, onClose, onSave }: Props) {
  const [effort, setEffort] = useState<number | undefined>(undefined)
  const [feeling, setFeeling] = useState<number | undefined>(undefined)

  function reset() {
    setEffort(undefined)
    setFeeling(undefined)
  }

  return (
    <Sheet
      open={open}
      title="Workout complete"
      onClose={onClose}
      hideClose
      footer={
        <>
          <button
            className="btn btn-ghost grow"
            onClick={() => {
              reset()
              onSave({})
            }}
          >
            Skip
          </button>
          <button
            className="btn btn-primary grow"
            onClick={() => {
              reset()
              onSave({ effort, feeling })
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="finish-summary">
        <span>{summary.duration}</span>
        <span>{summary.volume}</span>
        {summary.prCount > 0 && (
          <span className="finish-prs">
            {summary.prCount} PR{summary.prCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="field-label" style={{ marginTop: 16 }}>
        How hard was it?
      </div>
      <div className="rpe-row">
        {EFFORT_LABELS.map((label, i) => (
          <button
            key={label}
            className={`chip${effort === i + 1 ? ' active' : ''}`}
            aria-pressed={effort === i + 1}
            onClick={() => setEffort(effort === i + 1 ? undefined : i + 1)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="field-label" style={{ marginTop: 16 }}>
        How did you feel?
      </div>
      <div className="rpe-row">
        {FEELING.map((f, i) => (
          <button
            key={f.label}
            className={`chip chip-emoji${feeling === i + 1 ? ' active' : ''}`}
            aria-label={f.label}
            aria-pressed={feeling === i + 1}
            title={f.label}
            onClick={() => setFeeling(feeling === i + 1 ? undefined : i + 1)}
          >
            {f.emoji}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
