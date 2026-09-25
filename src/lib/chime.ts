/**
 * Plays a short two-tone chime via WebAudio so the app needs no audio asset
 * and works offline. Silently no-ops if the browser blocks playback.
 *
 * Shared by the rest timer and the set hold timer: both need to be heard when
 * the phone is face-down on a bench, and neither should fail because audio is
 * unavailable.
 */
export function playChime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
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
    // Audio is a nicety; never let it break a timer.
  }
}

/** Short buzz pattern, used alongside the chime when a timer completes. */
export function vibrate(): void {
  if ('vibrate' in navigator) navigator.vibrate([180, 90, 180])
}

/**
 * A single light pulse for frequent, low-stakes confirmations — completing a
 * set, a drag-reorder swap — where the timer's triple-pulse pattern would be
 * too much repeated dozens of times a workout.
 */
export function vibrateTick(): void {
  if ('vibrate' in navigator) navigator.vibrate(15)
}

/**
 * Two short pulses for a genuinely celebratory moment — a PR, a milestone
 * banner. Distinct from both `vibrateTick`'s single light pulse (too subtle
 * for "you just set a record") and `vibrate`'s triple pulse (that one means
 * "a timer finished", an unrelated event this would otherwise be confused
 * with if reused here).
 */
export function vibratePR(): void {
  if ('vibrate' in navigator) navigator.vibrate([15, 60, 15])
}

/**
 * One longer buzz for a rejected, invalid action — a blocked delete, a
 * validation failure. Deliberately unlike every other pattern here (all of
 * which mark something succeeding) so a mis-tap reads as "that didn't work"
 * before the user even reads the message.
 */
export function vibrateError(): void {
  if ('vibrate' in navigator) navigator.vibrate(250)
}
