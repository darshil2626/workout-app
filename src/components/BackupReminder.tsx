import { useLiveQuery } from 'dexie-react-hooks'
import { downloadBackup } from '../lib/backup'
import { dismissBackupReminder, getBackupStatus, shouldRemindBackup } from '../lib/backupReminder'
import { track } from '../lib/analytics'
import { IconClose } from './Icons'

/**
 * Nudges towards Export backup when enough history has built up without one.
 * Reuses the install banner's look so the two read as the same kind of prompt.
 */
export function BackupReminder() {
  const status = useLiveQuery(() => getBackupStatus(), [])
  if (!status || !shouldRemindBackup(status, Date.now())) return null

  const never = status.lastBackupAt === null
  return (
    <div className="install-banner" role="region" aria-label="Back up your data">
      <div className="grow">
        <div className="install-banner-title">Back up your workouts</div>
        <div className="faint">
          {never
            ? `${status.doneWorkouts} workouts live only on this device.`
            : `${status.workoutsSinceBackup} new workouts since your last backup.`}
        </div>
      </div>
      <button
        className="btn btn-sm btn-primary"
        onClick={() => {
          void downloadBackup().then((outcome) => {
            if (outcome !== 'cancelled') track('backup_exported', { source: 'reminder' })
          })
        }}
      >
        Back up
      </button>
      <button className="icon-btn" onClick={() => void dismissBackupReminder()} aria-label="Dismiss">
        <IconClose />
      </button>
    </div>
  )
}
