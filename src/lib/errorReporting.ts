import { track } from './analytics'
import { isQuotaError } from './storage'

/** Browsers fire this for harmless layout feedback loops; it is not a bug in the app. */
const IGNORED = /ResizeObserver loop/i

/** Same kind of failure repeating in a loop should be one event, not hundreds. */
const MAX_REPORTS = 10

let installed = false

/**
 * Catches what the React error boundary cannot: exceptions thrown in event
 * handlers, timers and promises (a rejected Dexie write is the usual one),
 * which would otherwise vanish without a trace.
 *
 * Reports the kind of failure only, never the message or stack, for the same
 * reason ErrorBoundary does: an error string can have workout content in it.
 *
 * `onQuotaExceeded` lets the shell tell the person their device is out of
 * storage, which is the one failure here they can actually act on.
 */
export function installGlobalErrorHandlers(onQuotaExceeded?: () => void): void {
  if (installed) return
  installed = true

  let reported = 0
  const report = (kind: 'error' | 'unhandledrejection', reason: unknown, message?: string) => {
    if (message && IGNORED.test(message)) return
    if (isQuotaError(reason)) onQuotaExceeded?.()
    console.error(`Unhandled ${kind}`, reason)
    if (reported >= MAX_REPORTS) return
    reported += 1
    track('unhandled_error', { kind, quota: isQuotaError(reason) })
  }

  window.addEventListener('error', (e) => report('error', e.error ?? e.message, e.message))
  window.addEventListener('unhandledrejection', (e) => report('unhandledrejection', e.reason))
}
