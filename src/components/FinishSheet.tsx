import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import type { SessionRating } from '../state/ActiveWorkoutContext'
import { useSettings } from '../lib/useSettings'
import { vibratePR } from '../lib/chime'
import { DeltaBadge } from './DeltaBadge'

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
  summary: {
    duration: string
    volume: string
    prCount: number
    /** This session's volume vs. the last time this routine (or same-named
     *  workout) was done. Null/undefined when there's nothing to compare
     *  against yet — a first-ever session, or one still logging zero volume. */
    volumeDelta?: { up: boolean; text: string } | null
  }
  onClose: () => void
  onSave: (rating: SessionRating) => void
}

/**
 * Asked once, after the finish is already confirmed. Both scales are optional
 * and "Skip" is as prominent as "Save", so the rating never blocks the finish.
 */
export function FinishSheet({ open, summary, onClose, onSave }: Props) {
  const settings = useSettings()
  const [effort, setEffort] = useState<number | undefined>(undefined)
  const [feeling, setFeeling] = useState<number | undefined>(undefined)

  // Fires once as the sheet opens on a PR, alongside the celebration text —
  // keyed on `open` alone since `summary`/`settings` are a snapshot for the
  // sheet's lifetime, not something that changes while it's up.
  useEffect(() => {
    if (open && summary.prCount > 0 && settings.restTimerVibrate) vibratePR()
  }, [open])

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
      {/* Peak-end: a session is remembered by how it finished, so a PR gets a
          moment of its own above the figures rather than just a pill inside
          them. Purely decorative — nothing here delays Skip or Save, and the
          global prefers-reduced-motion switch already flattens its entrance. */}
      {summary.prCount > 0 && (
        <div className="finish-celebrate" aria-hidden="true">
          New record{summary.prCount === 1 ? '' : 's'} set
        </div>
      )}

      <div className="finish-summary">
        <span>{summary.duration}</span>
        <span>
          {summary.volume}
          {summary.volumeDelta && (
            <DeltaBadge
              up={summary.volumeDelta.up}
              text={summary.volumeDelta.text}
              label={`${summary.volumeDelta.up ? 'Up' : 'Down'} ${summary.volumeDelta.text} vs last time`}
            />
          )}
        </span>
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
