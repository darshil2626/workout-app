import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { countDoneWorkouts } from '../../db/repo'
import { updateSettings, useSettings } from '../../lib/useSettings'
import { flippedUnits, reinterpretWeight } from '../../lib/units'
import { gearForUnit } from '../../lib/plates'
import { useActiveWorkout } from '../../state/ActiveWorkoutContext'
import { IconClose } from '../../components/Icons'

const SEEN_KEY = 'trana.unitHintSeen'

/**
 * One line during a first workout that says which weight unit is in use and
 * flips it in one tap, so nobody logs a session in the wrong unit before they
 * find Settings. Gone for good once dismissed (here or with the tick tip) or
 * once a workout has been finished.
 */
export function UnitSwitchHint({
  hasExercises,
  dismissedWithTip,
}: {
  hasExercises: boolean
  dismissedWithTip: boolean
}) {
  const settings = useSettings()
  const { mapSetWeights } = useActiveWorkout()
  const doneCount = useLiveQuery(() => countDoneWorkouts(), [], undefined)
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const dismiss = () => {
    setSeen(true)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* private mode: the line just shows again next time */
    }
  }
  useEffect(() => {
    if (dismissedWithTip) dismiss()
  }, [dismissedWithTip])

  if (seen || !hasExercises || doneCount !== 0) return null
  const from = settings.weightUnit
  const other = from === 'kg' ? 'lb' : 'kg'
  const switchUnits = () => {
    // Someone who taps this has just noticed the label is wrong, so the numbers
    // they typed were meant in the other unit: keep 60 as 60 (now lb) rather
    // than converting it to 132.28. Only this unsaved session is rewritten.
    mapSetWeights((kg) => reinterpretWeight(kg, from, other))
    void updateSettings({ ...flippedUnits(settings), ...gearForUnit(settings, other) })
  }
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.875rem' }}>
      <span>Logging in {settings.weightUnit} ·</span>
      <button className="btn btn-ghost btn-sm" onClick={switchUnits}>
        Use {other}
      </button>
      <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={dismiss} aria-label="Dismiss unit tip">
        <IconClose />
      </button>
    </div>
  )
}
