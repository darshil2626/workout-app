import { track } from './analytics'

/** Window event fired when a write fails because the device is out of space. */
export const QUOTA_EVENT = 'trana:storage-full'

/** Whether a thrown value is the browser saying the device has no room left. */
export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  // Dexie wraps the DOM exception, so check the wrapper's name and its cause.
  const inner = (err as Error & { inner?: unknown }).inner
  return err.name === 'QuotaExceededError' || (inner !== undefined && isQuotaError(inner))
}

/**
 * Asks the browser not to evict this site's data under storage pressure.
 *
 * IndexedDB is "best effort" by default: when a device runs low on space the
 * browser may silently delete a whole origin, which for this app is the user's
 * entire training history. A granted request makes that a last resort. Chrome
 * decides from engagement (an installed PWA is usually granted), Safari from
 * its own rules, and either may say no; the answer is only recorded, since
 * there is nothing more the app can do about a refusal.
 *
 * Safe to call on every launch: an already-persistent origin returns at once.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    const granted = await navigator.storage.persist()
    track('storage_persist', { granted })
    return granted
  } catch {
    return false
  }
}
