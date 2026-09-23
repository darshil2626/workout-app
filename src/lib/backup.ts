import { db, DEFAULT_SETTINGS } from '../db/db'
import type { Exercise, Folder, Measurement, Routine, Settings, Workout } from '../db/types'

/** v2 added `measurements`; v1 files still import, they just have none. */
export const BACKUP_VERSION = 2

/**
 * Stamped into every file this app writes, and deliberately frozen at the
 * original name. It identifies the file format, not the product, so renaming
 * the app must not touch it: change it and a new export stops importing into
 * an older install, while every file already exported stops importing at all.
 */
export const APP_MARKER = 'ironlog'

export interface BackupFile {
  app: string
  version: number
  exportedAt: number
  exercises: Exercise[]
  workouts: Workout[]
  routines: Routine[]
  folders: Folder[]
  measurements?: Measurement[]
  settings: Settings
}

export async function buildBackup(): Promise<BackupFile> {
  const [exercises, workouts, routines, folders, measurements, settings] = await Promise.all([
    db.exercises.toArray(),
    db.workouts.toArray(),
    db.routines.toArray(),
    db.folders.toArray(),
    db.measurements.toArray(),
    db.settings.get(1),
  ])
  return {
    app: APP_MARKER,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    exercises,
    workouts,
    routines,
    folders,
    measurements,
    settings: settings ?? DEFAULT_SETTINGS,
  }
}

export async function downloadBackup(): Promise<void> {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date(backup.exportedAt).toISOString().slice(0, 10)
  a.href = url
  a.download = `ironlog-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some mobile browsers.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export interface ImportSummary {
  exercises: number
  workouts: number
  routines: number
  folders: number
  measurements: number
}

/**
 * Markers this app has ever written into a backup file.
 *
 * A file is recognised by its *shape*, not by its branding — see `assertBackup`.
 * This list only exists so that a file stamped by some other tool is refused
 * rather than silently restored, and it is append-only: dropping a marker here
 * would orphan every backup already sitting in someone's downloads folder.
 */
const KNOWN_MARKERS: readonly string[] = [APP_MARKER]

function assertBackup(data: unknown): asserts data is BackupFile {
  if (typeof data !== 'object' || data === null) throw new Error('That file is not valid JSON data.')
  const b = data as Partial<BackupFile>

  // Shape is the real gate. `restoreBackup` clears every table before writing,
  // so something has to stand between a stray JSON file and the user's whole
  // history — but a hardcoded product name was never what made this file ours,
  // and gating on it meant renaming the app would reject every backup already
  // taken. A version number plus the four required collections is both a
  // stronger signal and one that survives a rename.
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of the app.')
  }
  for (const key of ['exercises', 'workouts', 'routines', 'folders'] as const) {
    if (!Array.isArray(b[key])) throw new Error(`Backup is missing its "${key}" section.`)
  }

  // `app` is a hint, not the gate: absent is fine (it is the right shape), but
  // a *foreign* marker means some other tool wrote this and the resemblance is
  // a coincidence worth refusing.
  if (b.app !== undefined && !KNOWN_MARKERS.includes(b.app)) {
    throw new Error('That file was exported from a different app.')
  }
}

/**
 * Parses and validates without writing anything, so a bad file can be refused
 * *before* the user is asked to confirm replacing everything they have. Throws
 * the same errors a restore would.
 */
export function parseBackup(text: string): BackupFile {
  const data: unknown = JSON.parse(text)
  assertBackup(data)
  return data
}

/**
 * Replaces the entire database with the backup's contents.
 * Merging is deliberately not offered: reconciling two divergent set-by-set
 * histories without a sync protocol produces silent duplicates.
 */
export async function restoreBackup(text: string): Promise<ImportSummary> {
  const data = parseBackup(text)

  const measurements = data.measurements ?? []

  // Dexie's typed overloads stop at five tables, so pass them as an array.
  await db.transaction(
    'rw',
    [db.exercises, db.workouts, db.routines, db.folders, db.measurements, db.settings],
    async () => {
      await Promise.all([
        db.exercises.clear(),
        db.workouts.clear(),
        db.routines.clear(),
        db.folders.clear(),
        db.measurements.clear(),
      ])
      await db.exercises.bulkPut(data.exercises)
      await db.workouts.bulkPut(data.workouts)
      await db.routines.bulkPut(data.routines)
      await db.folders.bulkPut(data.folders)
      await db.measurements.bulkPut(measurements)
      if (data.settings) await db.settings.put({ ...DEFAULT_SETTINGS, ...data.settings, id: 1 })
    },
  )

  return {
    exercises: data.exercises.length,
    workouts: data.workouts.length,
    routines: data.routines.length,
    folders: data.folders.length,
    measurements: measurements.length,
  }
}

export async function wipeAllData(): Promise<void> {
  // Dexie's typed overloads stop at five tables, so pass them as an array.
  await db.transaction(
    'rw',
    [db.exercises, db.workouts, db.routines, db.folders, db.measurements, db.settings],
    async () => {
      await Promise.all([
        db.exercises.clear(),
        db.workouts.clear(),
        db.routines.clear(),
        db.folders.clear(),
        db.measurements.clear(),
        db.settings.clear(),
      ])
    },
  )
}
