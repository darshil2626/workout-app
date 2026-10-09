import { db, DEFAULT_SETTINGS } from '../db/db'
import { findBackupProblems } from './backupSchema'
import { recordBackup } from './backupReminder'
import { detectInstallPlatform } from './platform'
import type { Exercise, Folder, Measurement, Routine, Settings, Workout } from '../db/types'

/** v2 added `measurements`; v1 files still import, they just have none. */
export const BACKUP_VERSION = 2

/**
 * Stamped into every file this app writes. It is informational only: an import
 * is accepted or refused by the file's shape (see `assertBackup`), never by this
 * value, so backups written under an earlier name still restore.
 */
export const APP_MARKER = 'trana'

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

/** Every table a backup covers, for transactions that read or replace them all. */
const backupTables = () => [db.exercises, db.workouts, db.routines, db.folders, db.measurements, db.settings]

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

/** What happened to an export, so callers only record or announce a real one. */
export type ExportOutcome = 'downloaded' | 'shared' | 'cancelled'

/**
 * Hands the person their backup file.
 *
 * Most browsers save a Blob link as a download. iOS does not reliably do that
 * from a Home Screen app, and the backup is the only protection against losing
 * a history, so there the system share sheet (Save to Files, AirDrop, Mail) is
 * used where it can take a file, with the download as the fallback. Dismissing
 * the sheet is reported as 'cancelled' and is not counted as a backup.
 */
export async function downloadBackup(): Promise<ExportOutcome> {
  const backup = await buildBackup()
  const json = JSON.stringify(backup, null, 2)
  const stamp = new Date(backup.exportedAt).toISOString().slice(0, 10)
  const filename = `trana-backup-${stamp}.json`

  const outcome = (await shareFile(json, filename)) ?? saveAsDownload(json, filename)
  if (outcome !== 'cancelled') {
    // Bookkeeping for the reminder; a failure here must not undo a good export.
    await recordBackup(backup.exportedAt).catch(() => {})
  }
  return outcome
}

/** Null means "not available here, use a download instead". */
async function shareFile(json: string, filename: string): Promise<ExportOutcome | null> {
  if (detectInstallPlatform() !== 'ios') return null
  try {
    const file = new File([json], filename, { type: 'application/json' })
    if (!navigator.canShare?.({ files: [file] })) return null
    await navigator.share({ files: [file], title: filename })
    return 'shared'
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    return null
  }
}

function saveAsDownload(json: string, filename: string): ExportOutcome {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some mobile browsers.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
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

  // Shape is the gate. `restoreBackup` clears every table before writing, so
  // something has to stand between a stray JSON file and the user's whole
  // history. A version number plus the four required collections is a stronger
  // signal than a product name, and it keeps every backup already taken
  // importable whatever the app was called when it wrote them.
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of the app.')
  }
  for (const key of ['exercises', 'workouts', 'routines', 'folders'] as const) {
    if (!Array.isArray(b[key])) throw new Error(`Backup is missing its "${key}" section.`)
  }
  const problems = findBackupProblems(b as Parameters<typeof findBackupProblems>[0])
  if (problems.length > 0) {
    throw new Error(`That backup has damaged entries, so nothing was changed. ${problems.join('; ')}.`)
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

/** Where the data a restore replaced is kept, so it can be put back. */
const SNAPSHOT_ID = 'pre-restore'

/** Whether the device holds anything a restore would destroy. */
async function hasUserData(): Promise<boolean> {
  const [workouts, routines, folders, measurements, custom] = await Promise.all([
    db.workouts.count(),
    db.routines.count(),
    db.folders.count(),
    db.measurements.count(),
    db.exercises.filter((e) => e.isCustom).count(),
  ])
  return workouts + routines + folders + measurements + custom > 0
}

/**
 * Replaces the tables with `data`. Must run inside a transaction over
 * `backupTables()` plus `db.snapshots`, so the snapshot and the replacement
 * either both land or neither does.
 */
async function replaceAll(data: BackupFile): Promise<void> {
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
  await db.measurements.bulkPut(data.measurements ?? [])
  if (data.settings) {
    // Consent belongs to this device and its owner's answer, not to the file: a
    // backup from elsewhere must not switch analytics on, or off, here.
    const mine = await db.settings.get(1)
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      ...data.settings,
      analyticsEnabled: mine?.analyticsEnabled ?? DEFAULT_SETTINGS.analyticsEnabled,
      analyticsConsentAt: mine?.analyticsConsentAt ?? DEFAULT_SETTINGS.analyticsConsentAt,
      id: 1,
    })
  }
}

function summarise(data: BackupFile): ImportSummary {
  return {
    exercises: data.exercises.length,
    workouts: data.workouts.length,
    routines: data.routines.length,
    folders: data.folders.length,
    measurements: (data.measurements ?? []).length,
  }
}

/**
 * Replaces the entire database with the backup's contents.
 * Merging is deliberately not offered: reconciling two divergent set-by-set
 * histories without a sync protocol produces silent duplicates.
 *
 * What was on the device is kept as a snapshot first (in the same transaction,
 * so a failed restore leaves both untouched), and `undoRestore` puts it back.
 * A device with nothing of the user's on it has nothing worth keeping.
 */
export async function restoreBackup(text: string): Promise<ImportSummary> {
  const data = parseBackup(text)
  await applyRestore(data)
  return summarise(data)
}

async function applyRestore(data: BackupFile): Promise<void> {
  await db.transaction('rw', [...backupTables(), db.snapshots], async () => {
    if (await hasUserData()) {
      await db.snapshots.put({ id: SNAPSHOT_ID, createdAt: Date.now(), backup: await buildBackup() })
    }
    await replaceAll(data)
  })
}

export interface SnapshotInfo extends ImportSummary {
  createdAt: number
}

/** What an undo would bring back, or null when there is nothing to undo. */
export async function getRestoreSnapshot(): Promise<SnapshotInfo | null> {
  const row = await db.snapshots.get(SNAPSHOT_ID)
  return row ? { createdAt: row.createdAt, ...summarise(row.backup) } : null
}

/**
 * Puts back what the last restore replaced. The data being undone becomes the
 * new snapshot, so pressing undo twice returns to where you started.
 */
export async function undoRestore(): Promise<ImportSummary> {
  const row = await db.snapshots.get(SNAPSHOT_ID)
  if (!row) throw new Error('There is nothing to undo.')
  await applyRestore(row.backup)
  return summarise(row.backup)
}

export async function wipeAllData(): Promise<void> {
  // Dexie's typed overloads stop at five tables, so pass them as an array.
  await db.transaction('rw', [...backupTables(), db.snapshots], async () => {
    await Promise.all([
      db.exercises.clear(),
      db.workouts.clear(),
      db.routines.clear(),
      db.folders.clear(),
      db.measurements.clear(),
      db.settings.clear(),
      // Deleting everything has to include the copy a restore kept.
      db.snapshots.clear(),
    ])
  })
}
