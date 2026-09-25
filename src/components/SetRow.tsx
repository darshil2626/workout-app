import { useEffect, useState } from 'react'
import type { ExerciseKind, LoggedSet } from '../db/types'
import { fieldsFor } from '../lib/workout'
import type { Formatters } from '../lib/useSettings'
import { displayToKg, displayToMetres, formatDistance, formatWeight, parseNumber } from '../lib/units'
import { formatDuration, parseDuration } from '../lib/time'
import { IconCheck, IconTimer } from './Icons'
import { vibrateTick } from '../lib/chime'
import type { ActiveSetTimer } from '../state/SetTimerContext'
import { PR_LABEL, type PRKind } from '../lib/records'

/**
 * Uncontrolled-while-focused text input.
 * Committing on every keystroke keeps autosave simple, while only re-syncing
 * from props on blur means partial entries like "12." survive typing.
 */
function NumberField({
  display,
  placeholder,
  onCommit,
  ariaLabel,
  inputMode = 'decimal',
}: {
  display: string
  placeholder: string
  onCommit: (text: string) => void
  ariaLabel: string
  inputMode?: 'decimal' | 'numeric' | 'text'
}) {
  const [text, setText] = useState(display)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(display)
  }, [display, focused])

  return (
    <input
      className="set-input"
      type="text"
      inputMode={inputMode}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={(e) => {
        setFocused(true)
        e.currentTarget.select()
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value)
        onCommit(e.target.value)
      }}
    />
  )
}

interface Props {
  set: LoggedSet
  badge: string
  kind: ExerciseKind
  /** Same-numbered set from the last time this exercise was performed. */
  previous?: LoggedSet
  /** Record kinds this set beats; empty or absent for an ordinary set. */
  prs?: PRKind[]
  fmt: Formatters
  /** Set only while this row's hold timer is running. */
  timer?: ActiveSetTimer
  onChange: (patch: Partial<LoggedSet>) => void
  onToggleComplete: () => void
  onOpenMenu: () => void
  /**
   * Omitted where timing a hold is meaningless — editing a past session — and
   * the stopwatch is then not offered at all.
   */
  onStartTimer?: () => void
  onStopTimer?: () => void
}

export function SetRow({
  set,
  badge,
  kind,
  previous,
  prs,
  fmt,
  timer,
  onChange,
  onToggleComplete,
  onOpenMenu,
  onStartTimer,
  onStopTimer,
}: Props) {
  const f = fieldsFor(kind)
  const { weightUnit, distanceUnit } = fmt

  const prevLabel = previous ? describePrevious(previous, kind, weightUnit, distanceUnit) : '—'

  // The previous session's numbers become placeholders, so tapping the check
  // with empty inputs is never ambiguous about what was actually lifted.
  const weightPlaceholder = previous?.weight !== null && previous?.weight !== undefined
    ? formatWeight(previous.weight, weightUnit)
    : '0'
  const repsPlaceholder = previous?.reps != null ? String(previous.reps) : '0'
  const durationPlaceholder = previous?.durationSec != null ? formatDuration(previous.durationSec) : '0:00'
  const distancePlaceholder = previous?.distanceM != null ? formatDistance(previous.distanceM, distanceUnit) : '0'

  function commitWeight(text: string) {
    const n = parseNumber(text)
    onChange({ weight: n === null ? null : round3(displayToKg(n, weightUnit)) })
  }

  function commitReps(text: string) {
    const n = parseNumber(text)
    onChange({ reps: n === null ? null : Math.max(0, Math.round(n)) })
  }

  function commitDuration(text: string) {
    onChange({ durationSec: parseDuration(text) })
  }

  function commitDistance(text: string) {
    const n = parseNumber(text)
    onChange({ distanceM: n === null ? null : round3(displayToMetres(n, distanceUnit)) })
  }

  /**
   * Tapping the previous cell repeats last time's numbers. Unlike the check,
   * this overwrites what is already typed: the tap is explicit, so treating it
   * as "fill the blanks" would make it do nothing on a half-filled row.
   */
  function copyPrevious() {
    if (!previous || timer) return
    const patch: Partial<LoggedSet> = {}
    if (f.weight) patch.weight = previous.weight
    if (f.reps) patch.reps = previous.reps
    if (f.duration) patch.durationSec = previous.durationSec
    if (f.distance) patch.distanceM = previous.distanceM
    onChange(patch)
  }

  /**
   * Ticking a set with blank inputs adopts the placeholder values, matching
   * the "repeat last time" behaviour lifters expect from a one-tap check.
   */
  function toggle() {
    if (!set.completed) {
      const patch: Partial<LoggedSet> = {}
      if (f.weight && set.weight === null && previous?.weight != null) patch.weight = previous.weight
      if (f.reps && set.reps === null && previous?.reps != null) patch.reps = previous.reps
      if (f.duration && set.durationSec === null && previous?.durationSec != null)
        patch.durationSec = previous.durationSec
      if (f.distance && set.distanceM === null && previous?.distanceM != null)
        patch.distanceM = previous.distanceM
      if (Object.keys(patch).length > 0) onChange(patch)
      // Only on the completing tap, not on un-checking — that's a correction,
      // not a confirmation worth a buzz.
      if (fmt.settings.restTimerVibrate) vibrateTick()
    }
    onToggleComplete()
  }

  return (
    <tr className={set.completed ? 'done' : undefined}>
      <td className="col-set">
        <button
          className={`set-badge ${set.setType}`}
          onClick={onOpenMenu}
          aria-label={`Set ${badge} options`}
        >
          {badge}
        </button>
        {set.rpe !== null && <span className="rpe-tag">@{set.rpe}</span>}
      </td>
      <td className="col-prev">
        {previous && !timer ? (
          <button
            type="button"
            className="prev-cell prev-copy"
            onClick={copyPrevious}
            aria-label={`Copy previous: ${prevLabel}`}
            title="Tap to repeat these numbers"
          >
            {prevLabel}
          </button>
        ) : (
          <div className="prev-cell">{prevLabel}</div>
        )}
        {prs && prs.length > 0 && (
          // Label as well as colour: the gold pill never carries the meaning alone.
          <span className="badge badge-pr" title={prs.map((k) => PR_LABEL[k]).join(', ')}>
            PR
          </span>
        )}
      </td>
      {f.distance && (
        <td>
          <NumberField
            display={formatDistance(set.distanceM, distanceUnit)}
            placeholder={distancePlaceholder}
            onCommit={commitDistance}
            ariaLabel="Distance"
          />
        </td>
      )}
      {f.weight && (
        <td>
          <NumberField
            display={formatWeight(set.weight, weightUnit)}
            placeholder={weightPlaceholder}
            onCommit={commitWeight}
            ariaLabel="Weight"
          />
        </td>
      )}
      {f.duration && (
        <td>
          {timer ? (
            /* Tapping again records the hold, so the running clock is itself the
               stop button — one control, and the count stays where the number
               will land. */
            <button
              className={`set-timer-live${timer.remainingSec === 0 ? ' done' : ''}`}
              onClick={onStopTimer}
              aria-label="Stop timer and record this set"
            >
              {formatDuration(timer.remainingSec ?? timer.elapsedSec)}
            </button>
          ) : (
            <div className="set-duration-cell">
              <NumberField
                display={set.durationSec === null ? '' : formatDuration(set.durationSec)}
                placeholder={durationPlaceholder}
                onCommit={commitDuration}
                ariaLabel="Duration"
                inputMode="text"
              />
              {/* Holds are timed, not remembered: a plank is logged from the
                  clock rather than typed in afterwards. */}
              {onStartTimer && (
                <button
                  className="set-timer-btn"
                  onClick={onStartTimer}
                  aria-label="Time this set"
                  title="Time this set"
                >
                  <IconTimer />
                </button>
              )}
            </div>
          )}
        </td>
      )}
      {f.reps && (
        <td>
          <NumberField
            display={set.reps === null ? '' : String(set.reps)}
            placeholder={repsPlaceholder}
            onCommit={commitReps}
            ariaLabel="Reps"
            inputMode="numeric"
          />
        </td>
      )}
      <td className="col-check">
        <button
          className={`check-btn${set.completed ? ' on' : ''}`}
          onClick={toggle}
          aria-label={set.completed ? 'Mark set incomplete' : 'Mark set complete'}
          aria-pressed={set.completed}
        >
          <IconCheck />
        </button>
      </td>
    </tr>
  )
}

function describePrevious(
  set: LoggedSet,
  kind: ExerciseKind,
  weightUnit: Formatters['weightUnit'],
  distanceUnit: Formatters['distanceUnit'],
): string {
  const f = fieldsFor(kind)
  const bits: string[] = []
  if (f.distance && set.distanceM !== null) bits.push(formatDistance(set.distanceM, distanceUnit))
  if (f.weight && set.weight !== null) {
    const sign = kind === 'assisted_bodyweight' ? '−' : kind === 'weighted_bodyweight' ? '+' : ''
    bits.push(`${sign}${formatWeight(set.weight, weightUnit)}`)
  }
  if (f.duration && set.durationSec !== null) bits.push(formatDuration(set.durationSec))
  if (f.reps && set.reps !== null) bits.push(f.weight ? `× ${set.reps}` : `${set.reps}`)
  return bits.length > 0 ? bits.join(' ') : '—'
}

/** Rounds converted values so lb→kg round-trips don't accumulate noise. */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
