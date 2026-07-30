import { db, DEFAULT_SETTINGS } from '../db/db'
import type { Exercise, Folder, Measurement, Routine, Settings, Workout } from '../db/types'

/** v2 added `measurements`; v1 files still import, they just have none. */
export const BACKUP_VERSION = 2

export interface BackupFile {
  app: 'ironlog'
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
    app: 'ironlog',
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

function assertBackup(data: unknown): asserts data is BackupFile {
  if (typeof data !== 'object' || data === null) throw new Error('That file is not valid JSON data.')
  const b = data as Partial<BackupFile>
  if (b.app !== 'ironlog') throw new Error('That file was not exported from IronLog.')
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of the app.')
  }
  for (const key of ['exercises', 'workouts', 'routines', 'folders'] as const) {
    if (!Array.isArray(b[key])) throw new Error(`Backup is missing its "${key}" section.`)
  }
}

/**
 * Replaces the entire database with the backup's contents.
 * Merging is deliberately not offered: reconciling two divergent set-by-set
 * histories without a sync protocol produces silent duplicates.
 */
export async function restoreBackup(text: string): Promise<ImportSummary> {
  const data: unknown = JSON.parse(text)
  assertBackup(data)

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
