import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { countDoneWorkouts } from '../../db/repo'
import { updateSettings, useSettings } from '../../lib/useSettings'
import { flippedUnits } from '../../lib/units'
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
  const other = settings.weightUnit === 'kg' ? 'lb' : 'kg'
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.875rem' }}>
      <span>Logging in {settings.weightUnit} ·</span>
      <button className="btn btn-ghost btn-sm" onClick={() => void updateSettings(flippedUnits(settings))}>
        Use {other}
      </button>
      <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={dismiss} aria-label="Dismiss unit tip">
        <IconClose />
      </button>
    </div>
  )
}
