/**
 * The browser only looks for a new service worker when the app navigates, and an
 * installed app on a phone rarely does: the system pauses it rather than closing it,
 * so it can come back to the screen day after day without ever starting fresh. Left
 * alone, that copy never hears about a release. This asks for one whenever the app
 * returns to the screen, and on a timer while it stays open.
 */

/** Long enough that a phone left on the rest timer is not polling the network. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
/** Flicking between apps mid-set should not fire a request every time. */
export const MIN_GAP_MS = 60 * 1000

type Registration = Pick<ServiceWorkerRegistration, 'update' | 'installing'>

interface Env {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  navigator: Pick<Navigator, 'onLine'>
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
  now: () => number
}

const browserEnv = (): Env => ({
  document,
  navigator,
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number),
  now: () => Date.now(),
})

/** Starts checking for updates. Returns a function that stops it. */
export function watchForUpdates(reg: Registration, env: Env = browserEnv()): () => void {
  let lastCheck = -Infinity

  const check = () => {
    if (reg.installing || !env.navigator.onLine) return
    if (env.now() - lastCheck < MIN_GAP_MS) return
    lastCheck = env.now()
    // Offline flakes and server hiccups reject; the next resume or tick tries again.
    reg.update().catch(() => {})
  }

  const onVisibility = () => {
    if (env.document.visibilityState === 'visible') check()
  }

  env.document.addEventListener('visibilitychange', onVisibility)
  const timer = env.setInterval(check, UPDATE_CHECK_INTERVAL_MS)

  return () => {
    env.document.removeEventListener('visibilitychange', onVisibility)
    env.clearInterval(timer)
  }
}
