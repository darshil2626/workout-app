import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSettings } from '../lib/useSettings'
import { playChime, vibrate } from '../lib/chime'

const STORAGE_KEY = 'ironlog.setTimer'

interface StoredSetTimer {
  /** The set being held. Only one can run at a time. */
  setId: string
  startedAt: number
  /**
   * Seconds to hold for, when the set carries a target. The timer then counts
   * down and completes itself; without one it counts up until stopped.
   */
  targetSec: number | null
}

export interface ActiveSetTimer {
  setId: string
  elapsedSec: number
  /** Null when counting up. Reaches 0 exactly once, when the hold is done. */
  remainingSec: number | null
  targetSec: number | null
}

interface SetTimerValue {
  active: ActiveSetTimer | null
  start: (setId: string, targetSec: number | null) => void
  /** Abandons the timer without recording anything. */
  cancel: () => void
  /**
   * Stops the timer and returns the seconds to record — the full target for a
   * completed countdown, otherwise however long was actually held. Returns null
   * if nothing was running.
   */
  stop: () => number | null
}

const SetTimerContext = createContext<SetTimerValue | null>(null)

function readStored(): StoredSetTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSetTimer
    if (typeof parsed.setId !== 'string' || typeof parsed.startedAt !== 'number') return null
    // A timer left running for hours is a forgotten tab, not a plank.
    if (Date.now() - parsed.startedAt > 6 * 3600_000) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Times a single held set — a plank, a dead hang, a wall sit — so the duration
 * is recorded from the clock rather than typed in afterwards from memory.
 *
 * Kept separate from the rest timer: they can legitimately run at once (a
 * superset partner resting while this exercise is held), and the elapsed time
 * is derived from a start timestamp so a throttled background tab still comes
 * back with the right answer.
 */
export function SetTimerProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const [timer, setTimer] = useState<StoredSetTimer | null>(() => readStored())
  const [now, setNow] = useState(() => Date.now())
  // Guards against chiming twice for the same countdown.
  const firedRef = useRef<string | null>(null)
  /**
   * Mirrors `timer` so `stop` can compute the elapsed time and return it in the
   * same tick — a state updater would not have run by then. Every mutation goes
   * through start/cancel/stop, which keep the two in step.
   */
  const timerRef = useRef<StoredSetTimer | null>(timer)

  useEffect(() => {
    if (!timer) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [timer])

  useEffect(() => {
    const onVisible = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  useEffect(() => {
    if (timer) localStorage.setItem(STORAGE_KEY, JSON.stringify(timer))
    else localStorage.removeItem(STORAGE_KEY)
  }, [timer])

  const active = useMemo<ActiveSetTimer | null>(() => {
    if (!timer) return null
    const elapsedSec = Math.max(0, Math.floor((now - timer.startedAt) / 1000))
    return {
      setId: timer.setId,
      elapsedSec,
      remainingSec:
        timer.targetSec === null ? null : Math.max(0, Math.ceil(timer.targetSec - (now - timer.startedAt) / 1000)),
      targetSec: timer.targetSec,
    }
  }, [timer, now])

  // Countdowns announce themselves; the page then records the set.
  useEffect(() => {
    if (!timer || active?.remainingSec !== 0) return
    const key = `${timer.setId}-${timer.startedAt}`
    if (firedRef.current === key) return
    firedRef.current = key
    if (settings.restTimerSound) playChime()
    if (settings.restTimerVibrate) vibrate()
  }, [active?.remainingSec, timer, settings.restTimerSound, settings.restTimerVibrate])

  const start = useCallback((setId: string, targetSec: number | null) => {
    const next: StoredSetTimer = {
      setId,
      startedAt: Date.now(),
      targetSec: targetSec && targetSec > 0 ? targetSec : null,
    }
    firedRef.current = null
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [])

  const cancel = useCallback(() => {
    timerRef.current = null
    setTimer(null)
  }, [])

  const stop = useCallback((): number | null => {
    const t = timerRef.current
    timerRef.current = null
    setTimer(null)
    if (!t) return null
    const elapsed = Math.max(0, Math.round((Date.now() - t.startedAt) / 1000))
    // A countdown that ran out records the target, not 30.4 seconds of it.
    return t.targetSec !== null && elapsed >= t.targetSec ? t.targetSec : elapsed
  }, [])

  const value = useMemo<SetTimerValue>(
    () => ({ active, start, cancel, stop }),
    [active, start, cancel, stop],
  )

  return <SetTimerContext.Provider value={value}>{children}</SetTimerContext.Provider>
}

export function useSetTimer(): SetTimerValue {
  const ctx = useContext(SetTimerContext)
  if (!ctx) throw new Error('useSetTimer must be used inside SetTimerProvider')
  return ctx
}
