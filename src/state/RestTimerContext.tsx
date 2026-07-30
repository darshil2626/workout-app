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

const STORAGE_KEY = 'ironlog.restTimer'

interface StoredTimer {
  endsAt: number
  totalSec: number
}

interface RestTimerValue {
  /** Seconds left, or null when no timer is running. */
  remaining: number | null
  totalSec: number
  start: (seconds: number) => void
  adjust: (deltaSeconds: number) => void
  stop: () => void
}

const RestTimerContext = createContext<RestTimerValue | null>(null)

function readStored(): StoredTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredTimer
    if (typeof parsed.endsAt !== 'number' || parsed.endsAt <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Plays a short two-tone chime via WebAudio so the app needs no audio asset
 * and works offline. Silently no-ops if the browser blocks playback.
 */
function playChime(): void {
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const now = ctx.currentTime
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const at = now + i * 0.18
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.35, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.18)
    }
    setTimeout(() => void ctx.close(), 700)
  } catch {
    // Audio is a nicety; never let it break the timer.
  }
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const [timer, setTimer] = useState<StoredTimer | null>(() => readStored())
  const [now, setNow] = useState(() => Date.now())
  // Guards against firing the completion chime twice for one timer.
  const firedRef = useRef<number | null>(null)

  // A 250 ms tick keeps the countdown visually smooth without busy-waiting.
  useEffect(() => {
    if (!timer) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [timer])

  // Re-sync immediately on focus: background tabs throttle intervals heavily.
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

  const remaining = timer ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : null

  useEffect(() => {
    if (!timer || remaining === null || remaining > 0) return
    if (firedRef.current === timer.endsAt) return
    firedRef.current = timer.endsAt
    if (settings.restTimerSound) playChime()
    if (settings.restTimerVibrate && 'vibrate' in navigator) {
      navigator.vibrate([180, 90, 180])
    }
    // Leave the finished timer on screen briefly so the user registers it.
    const id = window.setTimeout(() => setTimer(null), 2000)
    return () => window.clearTimeout(id)
  }, [remaining, timer, settings.restTimerSound, settings.restTimerVibrate])

  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return
    firedRef.current = null
    setNow(Date.now())
    setTimer({ endsAt: Date.now() + seconds * 1000, totalSec: seconds })
  }, [])

  const adjust = useCallback((delta: number) => {
    setTimer((t) => {
      if (!t) return t
      const endsAt = Math.max(Date.now() + 1000, t.endsAt + delta * 1000)
      firedRef.current = null
      return { endsAt, totalSec: Math.max(1, t.totalSec + delta) }
    })
  }, [])

  const stop = useCallback(() => setTimer(null), [])

  const value = useMemo<RestTimerValue>(
    () => ({ remaining, totalSec: timer?.totalSec ?? 0, start, adjust, stop }),
    [remaining, timer?.totalSec, start, adjust, stop],
  )

  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>
}

export function useRestTimer(): RestTimerValue {
  const ctx = useContext(RestTimerContext)
  if (!ctx) throw new Error('useRestTimer must be used inside RestTimerProvider')
  return ctx
}
