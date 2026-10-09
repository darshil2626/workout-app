import { db } from '../db/db'

/**
 * Everything lives on this one device, so the only protection against a lost
 * phone or cleared browser data is a backup file the person made. This works
 * out when a nudge to make one is warranted. It is a reminder, never a block:
 * it can be dismissed, and stays quiet for a while afterwards.
 */

const LAST_BACKUP_KEY = 'lastBackupAt'
const DISMISSED_KEY = 'backupReminderDismissedAt'

const DAY_MS = 24 * 60 * 60 * 1000

/** Too little history to be worth a nag. */
export const MIN_WORKOUTS = 5
/** New sessions since the last backup before a reminder is due. */
const WORKOUTS_SINCE = 10
/** ...and at least this long since it, so a heavy week does not pester. */
const MIN_DAYS_SINCE = 7
/** After this long, any new session is reason enough. */
const STALE_DAYS = 30
/** How long a dismissal is respected. */
const SNOOZE_DAYS = 14

export interface BackupStatus {
  /** Null if no backup has ever been made from this install. */
  lastBackupAt: number | null
  doneWorkouts: number
  /** Finished sessions after the last backup (all of them if there was none). */
  workoutsSinceBackup: number
  dismissedAt: number | null
}

export function shouldRemindBackup(s: BackupStatus, now: number): boolean {
  if (s.doneWorkouts < MIN_WORKOUTS) return false
  if (s.dismissedAt !== null && now - s.dismissedAt < SNOOZE_DAYS * DAY_MS) return false
  if (s.lastBackupAt === null) return true
  if (s.workoutsSinceBackup === 0) return false
  const days = (now - s.lastBackupAt) / DAY_MS
  return days >= STALE_DAYS || (s.workoutsSinceBackup >= WORKOUTS_SINCE && days >= MIN_DAYS_SINCE)
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const [last, dismissed, doneWorkouts] = await Promise.all([
    db.meta.get(LAST_BACKUP_KEY),
    db.meta.get(DISMISSED_KEY),
    db.workouts.where('status').equals('done').count(),
  ])
  const lastBackupAt = last?.value ?? null
  const workoutsSinceBackup =
    lastBackupAt === null
      ? doneWorkouts
      : await db.workouts
          .where('status')
          .equals('done')
          .and((w) => (w.finishedAt ?? w.startedAt) > lastBackupAt)
          .count()
  return { lastBackupAt, doneWorkouts, workoutsSinceBackup, dismissedAt: dismissed?.value ?? null }
}

export async function recordBackup(now = Date.now()): Promise<void> {
  await db.meta.put({ key: LAST_BACKUP_KEY, value: now })
}

export async function dismissBackupReminder(now = Date.now()): Promise<void> {
  await db.meta.put({ key: DISMISSED_KEY, value: now })
}
