import { describe, expect, it } from 'vitest'
import { shouldRemindBackup, type BackupStatus } from '../../src/lib/backupReminder'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

function status(over: Partial<BackupStatus> = {}): BackupStatus {
  return { lastBackupAt: null, doneWorkouts: 20, workoutsSinceBackup: 20, dismissedAt: null, ...over }
}

describe('shouldRemindBackup', () => {
  it('stays quiet until there is history worth protecting', () => {
    expect(shouldRemindBackup(status({ doneWorkouts: 4, workoutsSinceBackup: 4 }), NOW)).toBe(false)
    expect(shouldRemindBackup(status({ doneWorkouts: 5, workoutsSinceBackup: 5 }), NOW)).toBe(true)
  })

  it('reminds someone who has never backed up', () => {
    expect(shouldRemindBackup(status(), NOW)).toBe(true)
  })

  it('does not remind straight after a backup', () => {
    expect(shouldRemindBackup(status({ lastBackupAt: NOW - DAY, workoutsSinceBackup: 1 }), NOW)).toBe(false)
  })

  it('reminds after many new sessions, but only once a week has passed', () => {
    const base = { workoutsSinceBackup: 12 }
    expect(shouldRemindBackup(status({ ...base, lastBackupAt: NOW - 3 * DAY }), NOW)).toBe(false)
    expect(shouldRemindBackup(status({ ...base, lastBackupAt: NOW - 8 * DAY }), NOW)).toBe(true)
  })

  it('does not remind when too few sessions are new, until the backup is a month old', () => {
    const few = { workoutsSinceBackup: 3 }
    expect(shouldRemindBackup(status({ ...few, lastBackupAt: NOW - 20 * DAY }), NOW)).toBe(false)
    expect(shouldRemindBackup(status({ ...few, lastBackupAt: NOW - 31 * DAY }), NOW)).toBe(true)
  })

  it('has nothing to say about a stale backup when nothing is new', () => {
    expect(shouldRemindBackup(status({ lastBackupAt: NOW - 90 * DAY, workoutsSinceBackup: 0 }), NOW)).toBe(false)
  })

  it('respects a dismissal for two weeks', () => {
    expect(shouldRemindBackup(status({ dismissedAt: NOW - 13 * DAY }), NOW)).toBe(false)
    expect(shouldRemindBackup(status({ dismissedAt: NOW - 15 * DAY }), NOW)).toBe(true)
  })
})
