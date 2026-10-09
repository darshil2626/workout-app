import { db } from '../db/db'
import { detectInstallPlatform } from './platform'
import { isStandalonePwa } from './analytics'
import { formatDebugInfo, getRecentErrors, type DebugSnapshot } from './debugInfo'

const mb = (bytes: number | undefined) => (bytes === undefined ? null : Math.round(bytes / 1_048_576))

/**
 * Gathers the live values for `formatDebugInfo`. Safe to call when the database
 * is broken (the startup recovery screen does): that part reports the error
 * instead of counts.
 */
export async function buildDebugInfo(): Promise<string> {
  let counts: DebugSnapshot['counts'] = null
  let databaseError: string | undefined
  try {
    const [workouts, routines, exercises, measurements] = await Promise.all([
      db.workouts.count(),
      db.routines.count(),
      db.exercises.count(),
      db.measurements.count(),
    ])
    counts = { workouts, routines, exercises, measurements }
  } catch (e) {
    databaseError = e instanceof Error ? e.name : 'unknown'
  }

  let storage: DebugSnapshot['storage'] = { persisted: null, usedMB: null, quotaMB: null }
  try {
    const [persisted, estimate] = await Promise.all([navigator.storage?.persisted?.(), navigator.storage?.estimate?.()])
    storage = { persisted: persisted ?? null, usedMB: mb(estimate?.usage), quotaMB: mb(estimate?.quota) }
  } catch {
    // Leave the unknowns as unknown.
  }

  return formatDebugInfo({
    build: __BUILD_ID__,
    databaseVersion: db.isOpen() ? db.verno : null,
    counts,
    databaseError,
    platform: detectInstallPlatform(),
    standalone: isStandalonePwa(),
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    language: navigator.language,
    storage,
    recentErrors: getRecentErrors(),
  })
}

/** Copies to the clipboard, falling back to a hidden text field where the API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      return document.execCommand('copy')
    } finally {
      area.remove()
    }
  }
}
