import { syncThemeColor } from './theme'

/**
 * Time on screen before the fade starts, measured from the splash's first
 * paint. With the 450ms fade this makes the whole splash 1.6s, and the draw-on
 * (which ends at about 1.0s) is done well before it begins. Keep in step with
 * the animation timings in index.html.
 */
const HOLD_MS = 1150
const FADE_MS = 450

/**
 * Fades out the launch splash that index.html paints.
 *
 * The clock is the splash's own first paint (stamped by a script in
 * index.html), not the start of navigation: a cold start can spend hundreds of
 * ms before anything is on screen, and the splash should still get its full
 * time. A slow app is not made slower either: if it was ready after HOLD_MS the
 * splash goes straight to its fade.
 */
export function dismissSplash(): void {
  const el = document.getElementById('splash')
  if (!el) return

  const paintedAt = (window as unknown as { __splashAt?: number }).__splashAt ?? performance.now()
  const wait = Math.max(0, HOLD_MS - (performance.now() - paintedAt))
  window.setTimeout(() => {
    el.classList.add('leaving')
    // The status bar stops matching the splash as it fades, not after.
    syncThemeColor()
    window.setTimeout(() => el.remove(), FADE_MS + 50)
  }, wait)
}
