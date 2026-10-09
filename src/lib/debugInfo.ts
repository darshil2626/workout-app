/**
 * What someone can paste into a bug report so it can be understood without
 * asking them questions. Counts, versions and the *names* of recent failures
 * only: nothing from inside a workout, routine or measurement.
 */

const ERRORS_KEY = 'trana_recent_errors'
const MAX_ERRORS = 10

export interface RecentError {
  at: number
  kind: string
  /** The error's class name, such as TypeError or QuotaExceededError. Never its message. */
  name: string
}

/** Narrow slice of Storage, so tests can pass a stand-in. */
type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function getRecentErrors(store: KeyValueStore | null = defaultStore()): RecentError[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(ERRORS_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as RecentError[]) : []
  } catch {
    return []
  }
}

/** Keeps the last few failures on this device, for the debug report. Never sent anywhere. */
export function recordRecentError(
  kind: string,
  error: unknown,
  now = Date.now(),
  store: KeyValueStore | null = defaultStore(),
): void {
  if (!store) return
  const name = error instanceof Error ? error.name : typeof error
  try {
    const next = [...getRecentErrors(store), { at: now, kind, name }].slice(-MAX_ERRORS)
    store.setItem(ERRORS_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: the report just has fewer lines.
  }
}

export interface DebugSnapshot {
  build: string
  databaseVersion: number | null
  counts: Record<string, number> | null
  /** Set when the database could not be read, instead of counts. */
  databaseError?: string
  platform: string
  standalone: boolean
  online: boolean
  userAgent: string
  language: string
  storage: { persisted: boolean | null; usedMB: number | null; quotaMB: number | null }
  recentErrors: RecentError[]
}

export function formatDebugInfo(s: DebugSnapshot): string {
  const lines = [
    'Trana debug info (no workout content)',
    `Build: ${s.build}`,
    `Database version: ${s.databaseVersion ?? 'unknown'}`,
    s.counts
      ? `Stored: ${Object.entries(s.counts)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ')}`
      : `Database error: ${s.databaseError ?? 'unreadable'}`,
    `Platform: ${s.platform}, ${s.standalone ? 'installed' : 'in a browser tab'}, ${s.online ? 'online' : 'offline'}`,
    `Browser: ${s.userAgent}`,
    `Language: ${s.language}`,
    `Storage: persistent ${s.storage.persisted ?? 'unknown'}, ${s.storage.usedMB ?? '?'} MB of ${s.storage.quotaMB ?? '?'} MB`,
    s.recentErrors.length === 0
      ? 'Recent errors: none'
      : `Recent errors:\n${s.recentErrors.map((e) => `  ${new Date(e.at).toISOString()} ${e.kind} ${e.name}`).join('\n')}`,
  ]
  return lines.join('\n')
}
