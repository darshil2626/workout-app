import { useEffect, useState } from 'react'
import { eraseLocalDatabase } from '../db/repo'
import { downloadBackup } from '../lib/backup'
import { recordRecentError } from '../lib/debugInfo'
import { CopyDebugInfo } from './CopyDebugInfo'

/**
 * Shown instead of the app when the local database cannot be opened or
 * upgraded. Rendering the app anyway would leave every screen reading from a
 * database that is not there, so the person gets a way forward instead:
 * retry, try to save what is readable, or (after a second confirmation) erase
 * and start clean.
 */
export function StartupError({ error }: { error: unknown }) {
  const [status, setStatus] = useState<string | null>(null)
  const [confirmingErase, setConfirmingErase] = useState(false)
  const [busy, setBusy] = useState(false)

  const detail = error instanceof Error ? error.name : 'UnknownError'

  // So the debug report says why the app could not start.
  useEffect(() => recordRecentError('startup_error', error), [error])

  async function saveBackup() {
    setBusy(true)
    try {
      const outcome = await downloadBackup()
      if (outcome !== 'cancelled') {
        setStatus('Backup saved. Keep that file safe before doing anything else.')
      }
    } catch {
      setStatus('Could not read your data to back it up. It has not been changed.')
    } finally {
      setBusy(false)
    }
  }

  async function erase() {
    setBusy(true)
    try {
      await eraseLocalDatabase()
      window.location.reload()
    } catch {
      setStatus('Could not erase the data. Try closing other tabs of Trana, then reload.')
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <main className="app-main">
        <div className="empty" role="alert">
          <div className="empty-icon">⚠️</div>
          <h3>Trana can’t open your data</h3>
          <p className="muted">
            The storage on this device didn’t start up ({detail}). This is often temporary: a private browsing window, a
            full disk, or another tab still upgrading. Nothing has been deleted.
          </p>
          <div style={{ display: 'grid', gap: 8, marginTop: 16, width: '100%', maxWidth: 320 }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()} disabled={busy}>
              Try again
            </button>
            <button className="btn" onClick={() => void saveBackup()} disabled={busy}>
              Save a backup
            </button>
            <CopyDebugInfo />
            {confirmingErase ? (
              <>
                <p className="muted">This permanently deletes all workouts and settings on this device.</p>
                <button className="btn btn-danger" onClick={() => void erase()} disabled={busy}>
                  Yes, erase everything
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmingErase(false)} disabled={busy}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirmingErase(true)} disabled={busy}>
                Erase and start over
              </button>
            )}
          </div>
          {status && (
            <p className="muted" role="status" style={{ marginTop: 12 }}>
              {status}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
