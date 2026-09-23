import { APP_MARKER } from '../backup'

export type DetectedFormat = 'backup' | 'strong' | 'hevy' | 'unknown'

/**
 * Works out which importer a dropped file belongs to.
 *
 * A JSON file is one of our own backups if it has the *shape* of one — a
 * version number and the collections a restore needs. The `app` marker is only
 * a fallback, mirroring `assertBackup`: routing on the product name meant that
 * renaming the app would stop it recognising its own exports, and it was never
 * the marker that made the file ours.
 *
 * A file that carries the marker but is malformed is still claimed here, so the
 * restore can explain what is missing rather than the UI saying "unrecognised".
 */
export function detectFormat(text: string): DetectedFormat {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('{')) {
    try {
      const obj: unknown = JSON.parse(trimmed)
      if (obj && typeof obj === 'object') {
        const o = obj as { app?: unknown; version?: unknown; workouts?: unknown; exercises?: unknown }
        const looksLikeBackup =
          typeof o.version === 'number' && Array.isArray(o.workouts) && Array.isArray(o.exercises)
        if (looksLikeBackup || o.app === APP_MARKER) return 'backup'
      }
    } catch {
      /* not JSON we recognize */
    }
    return 'unknown'
  }

  const firstLine = (trimmed.split(/\r?\n/)[0] ?? '').toLowerCase()
  if (firstLine.includes('exercise_title') && firstLine.includes('set_index')) return 'hevy'
  if (firstLine.includes('workout name') && firstLine.includes('set order')) return 'strong'
  return 'unknown'
}
